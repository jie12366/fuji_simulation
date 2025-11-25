
import { FilmSimulation, LUTData, GradingAdjustments } from '../types';

const LUT_SIZE = 32;

// --- Math Helpers ---

const clamp = (v: number) => Math.max(0, Math.min(255, v));
// Soft Light Blend Mode (Photoshop formula)
// This creates much more natural tinting than linear addition
const softLight = (base: number, blend: number): number => {
  const b = base / 255;
  const l = blend / 255;
  let r = 0;
  if (l <= 0.5) {
    r = b - (1 - 2 * l) * b * (1 - b);
  } else {
    let d = (b <= 0.25) 
      ? ((16 * b - 12) * b + 4) * b 
      : Math.sqrt(b);
    r = b + (2 * l - 1) * (d - b);
  }
  return r * 255;
};

// --- Color Space & Correction ---

// 3x3 Matrix Multiplication for Channel Crosstalk / Film Emulation
// [ r ]   [ rr rg rb ] [ r ]
// [ g ] = [ gr gg gb ] [ g ]
// [ b ]   [ br bg bb ] [ b ]
const applyMatrix = (r: number, g: number, b: number, m: number[]): [number, number, number] => {
  const newR = r * m[0] + g * m[1] + b * m[2];
  const newG = r * m[3] + g * m[4] + b * m[5];
  const newB = r * m[6] + g * m[7] + b * m[8];
  return [newR, newG, newB];
};

const applyWB = (r: number, g: number, b: number, temp: number, tint: number): [number, number, number] => {
  // LMS-like adjustments are better, but simple gain works well for LUTs if gentle
  const t = temp / 100; 
  const tn = tint / 100;
  
  let rGain = 1.0 + (t > 0 ? t * 0.5 : t * 0.2); // Warm adds R
  let bGain = 1.0 + (t < 0 ? -t * 0.5 : -t * 0.2); // Cool adds B
  
  // Tint: Green vs Magenta
  let gGain = 1.0 - tn * 0.4; // Magenta reduces G
  
  // Normalize brightness to prevent blowout
  const maxGain = Math.max(rGain, gGain, bGain);
  if (maxGain > 1.2) {
      rGain /= (maxGain * 0.85);
      gGain /= (maxGain * 0.85);
      bGain /= (maxGain * 0.85);
  }

  return [r * rGain, g * gGain, b * bGain];
};

// --- Grading ---

// HSL to RGB helper
const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  
  if (0 <= h && h < 60) { r = c; g = x; b = 0; }
  else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
  else if (120 <= h && h < 180) { r = 0; g = c; b = x; }
  else if (180 <= h && h < 240) { r = 0; g = x; b = c; }
  else if (240 <= h && h < 300) { r = x; g = 0; b = c; }
  else if (300 <= h && h < 360) { r = c; g = 0; b = x; }
  
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
};

const applyGrading = (r: number, g: number, b: number, grading: GradingAdjustments): [number, number, number] => {
  if (grading.shadows.s === 0 && grading.midtones.s === 0 && grading.highlights.s === 0) {
    return [r, g, b];
  }

  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  // Smoother Masks
  const shadowMask = Math.max(0, (1 - luma * 1.8)); 
  const highlightMask = Math.max(0, (luma - 0.4) * 1.8);
  const midtoneMask = Math.max(0, 1 - Math.abs(luma - 0.5) * 2.2);

  const applyTint = (currR: number, currG: number, currB: number, grade: {h: number, s: number}, mask: number) => {
    if (grade.s === 0 || mask <= 0.01) return [currR, currG, currB];
    
    // Tint color at 50% luminance
    const [tr, tg, tb] = hslToRgb(grade.h, 1.0, 0.5); 
    
    // Mix using Soft Light instead of additive
    const strength = (grade.s / 100) * mask; 
    
    // Lerp between current and blended
    const finalR = currR * (1 - strength) + softLight(currR, tr) * strength;
    const finalG = currG * (1 - strength) + softLight(currG, tg) * strength;
    const finalB = currB * (1 - strength) + softLight(currB, tb) * strength;

    return [finalR, finalG, finalB];
  };

  let [or, og, ob] = [r, g, b];
  [or, og, ob] = applyTint(or, og, ob, grading.shadows, shadowMask);
  [or, og, ob] = applyTint(or, og, ob, grading.midtones, midtoneMask);
  [or, og, ob] = applyTint(or, og, ob, grading.highlights, highlightMask);

  return [or, og, ob];
};

// --- Tone Curves (Sigmoid) ---
const applySCurve = (val: number, contrast: number): number => {
    // contrast -100 to 100
    // Normalized input
    const u = val / 255;
    // Sigmoid factor
    const k = (contrast + 100) / 100; // 0 to 2
    
    if (contrast === 0) return val;
    
    // Simple S-curve formula
    // (1 / (1 + exp(-slope * (x - 0.5)))) scaled
    // Approximated:
    let ret = u;
    if (contrast > 0) {
        // Steep S
        const c = contrast / 100 * 2.5; 
        ret = (u - 0.5) * (1 + c) + 0.5;
        // Clamp smoothly? Simple mix usually better for performance
        // Let's use cosine approximation for nicer shoulder/toe
        ret = u + (Math.cos((1-u)*Math.PI) + 1)/2 * (u > 0.5 ? 1 : -1) * (contrast/200);
        
        // Simpler power curve for strong contrast
        if (u < 0.5) ret = 0.5 * Math.pow(2 * u, 1 + contrast/200);
        else ret = 1 - 0.5 * Math.pow(2 * (1 - u), 1 + contrast/200);

    } else {
        // Flat (Fade)
        ret = (u - 0.5) / (1 + Math.abs(contrast)/100) + 0.5;
    }
    return ret * 255;
};

// Natural Vibrance (Smarter Saturation)
const applyVibrance = (r: number, g: number, b: number, amount: number): [number, number, number] => {
  if (amount === 0) return [r, g, b];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : 1 - (min / max);
  
  // Boost low saturation pixels more than high saturation ones
  const amt = amount / 100;
  
  // Mask: 1.0 for greyscale, 0.0 for pure color
  const mask = (1 - sat); 
  
  // Lerp towards fully saturated version of this hue? 
  // Standard simple approach:
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  const factor = 1 + (amt * mask); 
  
  const nr = luma + (r - luma) * factor;
  const ng = luma + (g - luma) * factor;
  const nb = luma + (b - luma) * factor;
  
  return [nr, ng, nb];
}

// --- MAIN GENERATOR ---

export const generateFilmStyleLUT = (
    type: FilmSimulation, 
    wb: { temp: number, tint: number },
    grading: GradingAdjustments
): LUTData => {
  const data = new Uint8Array(LUT_SIZE * LUT_SIZE * LUT_SIZE * 3);
  const step = 255 / (LUT_SIZE - 1);

  for (let bIdx = 0; bIdx < LUT_SIZE; bIdx++) {
    for (let gIdx = 0; gIdx < LUT_SIZE; gIdx++) {
      for (let rIdx = 0; rIdx < LUT_SIZE; rIdx++) {
        const rBase = rIdx * step;
        const gBase = gIdx * step;
        const bBase = bIdx * step;

        // 1. White Balance
        let [r, g, b] = applyWB(rBase, gBase, bBase, wb.temp, wb.tint);

        const luma = 0.299 * r + 0.587 * g + 0.114 * b;

        // 2. Film Stock Emulation (Crosstalk Matrices + Curves)
        switch (type) {
          case FilmSimulation.Provia: {
            // Standard: Slight pop, clean whites
            r = applySCurve(r, 10);
            g = applySCurve(g, 10);
            b = applySCurve(b, 15); // Slight blue cool
            [r, g, b] = applyVibrance(r, g, b, 10);
            break;
          }
          case FilmSimulation.Velvia: {
            // Vivid: Magenta bias in shadows, High saturation
            const m = [
                1.05, -0.05, 0.0,
                -0.05, 1.1, -0.05,
                0.0, -0.05, 1.05
            ];
            [r, g, b] = applyMatrix(r, g, b, m);
            r = applySCurve(r, 20);
            g = applySCurve(g, 20);
            b = applySCurve(b, 25);
            [r, g, b] = applyVibrance(r, g, b, 30); // Use Vibrance instead of flat Saturation
            break;
          }
          case FilmSimulation.Astia: {
            // Soft: Protect skin tones (red/yellow), soft contrast
            r = applySCurve(r, 5);
            g = applySCurve(g, 5);
            b = applySCurve(b, 5);
            // Slight warm push in midtones
            if (luma > 50 && luma < 200) {
                r *= 1.02; g *= 1.01;
            }
            [r, g, b] = applyVibrance(r, g, b, 10);
            break;
          }
          case FilmSimulation.ClassicChrome: {
            // Docu: Low Sat, Hard Shadow, Cyan Sky
            // Matrix to mute colors and shift blue to cyan
            const m = [
                0.95, 0.05, 0.0,
                0.0, 0.95, 0.05,
                0.05, 0.1, 0.85
            ];
            [r, g, b] = applyMatrix(r, g, b, m);
            
            // Hard S-curve
            r = applySCurve(r, 20);
            g = applySCurve(g, 20);
            b = applySCurve(b, 20);

            // Pull saturation down globally
            [r, g, b] = applyVibrance(r, g, b, -15);
            
            // Shift Highlights slightly warm, Shadows cool
            const t = luma / 255;
            r += (1-t) * -5 + t * 5; 
            b += (1-t) * 5 + t * -5;
            break;
          }
          case FilmSimulation.RealaAce: {
            // True to life, slightly punchy
            const m = [
                1.0, 0.02, -0.02,
                0.01, 1.0, -0.01,
                -0.01, 0.01, 1.0
            ];
            [r, g, b] = applyMatrix(r, g, b, m);
            r = applySCurve(r, 15);
            g = applySCurve(g, 15);
            b = applySCurve(b, 15);
            break;
          }
          case FilmSimulation.ClassicNeg: {
            // Unique: High contrast, dim colors.
            // Cyan-ish shadows, Reddish highlights
            // Drastic Curve
            const negCurve = (v: number) => {
                const u = v/255;
                // Double sigmoid
                return (u < 0.5 ? 2*u*u : 1 - 2*(1-u)*(1-u)) * 255;
            };
            r = negCurve(r); g = negCurve(g); b = negCurve(b);

            // Strong crosstalk
            const m = [
                1.0, -0.1, 0.0,
                0.0, 1.0, 0.0,
                0.0, -0.1, 1.1
            ];
            [r, g, b] = applyMatrix(r, g, b, m);
            break;
          }
          case FilmSimulation.NostalgicNeg: {
             // Amber highlights, rich shadows
             // Lift shadows
             r = Math.min(255, r + 15 * (1 - luma/255)); 
             g = Math.min(255, g + 10 * (1 - luma/255));
             
             // Soft curve
             r = applySCurve(r, 10);
             g = applySCurve(g, 10);
             b = applySCurve(b, 10);

             // Amber tint in highlights
             if (luma > 128) {
                 const factor = (luma - 128) / 127;
                 r += 10 * factor;
                 b -= 5 * factor;
             }
             break;
          }
          case FilmSimulation.Eterna: {
            // Cinema: Flat, low saturation, wide dynamic range
            r = applySCurve(r, -20); // Flat contrast
            g = applySCurve(g, -20);
            b = applySCurve(b, -20);
            [r, g, b] = applyVibrance(r, g, b, -25);
            
            // Teal shadow bias
            if (luma < 100) {
                g += 5; b += 5;
            }
            break;
          }
          case FilmSimulation.Acros: {
            const grey = r * 0.299 + g * 0.587 + b * 0.114;
            // Sigmoid for rich blacks
            const val = applySCurve(grey, 25);
            r = val; g = val; b = val;
            break;
          }
          case FilmSimulation.AcrosYe: {
             // Yellow filter: Darkens blue skies
             const grey = r * 0.34 + g * 0.56 + b * 0.10; // Less Blue contrib
             const val = applySCurve(grey, 30);
             r = val; g = val; b = val;
             break;
          }
          case FilmSimulation.AcrosR: {
            // Red filter: Dramatic skies, bright skin
            const grey = r * 0.50 + g * 0.40 + b * 0.10;
            const val = applySCurve(grey, 35);
            r = val; g = val; b = val;
            break;
          }
          case FilmSimulation.AcrosG: {
            // Green filter: Good for skin tones, foliage
            const grey = r * 0.25 + g * 0.65 + b * 0.10;
            const val = applySCurve(grey, 25);
            r = val; g = val; b = val;
            break;
          }
          case FilmSimulation.Sepia: {
            const tr = 0.393 * r + 0.769 * g + 0.189 * b;
            const tg = 0.349 * r + 0.686 * g + 0.168 * b;
            const tb = 0.272 * r + 0.534 * g + 0.131 * b;
            r = tr; g = tg; b = tb;
            break;
          }
        }

        // 3. Color Grading (Soft Light Blend)
        [r, g, b] = applyGrading(r, g, b, grading);

        // Clamp final
        r = clamp(r);
        g = clamp(g);
        b = clamp(b);

        const index = (rIdx + gIdx * LUT_SIZE + bIdx * LUT_SIZE * LUT_SIZE) * 3;
        data[index] = Math.round(r);
        data[index + 1] = Math.round(g);
        data[index + 2] = Math.round(b);
      }
    }
  }
  return data;
};
