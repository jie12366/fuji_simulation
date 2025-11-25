
import { FilmSimulation, LUTData, GradingAdjustments } from '../types';

const LUT_SIZE = 32;

// --- Math Helpers ---

const clamp = (v: number) => Math.max(0, Math.min(255, v));

// Safe Soft Light Blend
const softLight = (base: number, blend: number): number => {
  const b = base / 255;
  const l = blend / 255;
  let r = 0;
  if (l <= 0.5) {
    r = b - (1 - 2 * l) * b * (1 - b);
  } else {
    const d = (b <= 0.25) 
      ? ((16 * b - 12) * b + 4) * b 
      : Math.sqrt(b);
    r = b + (2 * l - 1) * (d - b);
  }
  return r * 255;
};

// --- Color Space & Correction ---

// 3x3 Matrix Multiplication for Channel Crosstalk / Film Emulation
// SAFETY: Results are not clamped here to allow intermediate dynamic range, 
// but MUST be handled carefully before Gamma/Power operations.
const applyMatrix = (r: number, g: number, b: number, m: number[]): [number, number, number] => {
  const newR = r * m[0] + g * m[1] + b * m[2];
  const newG = r * m[3] + g * m[4] + b * m[5];
  const newB = r * m[6] + g * m[7] + b * m[8];
  return [newR, newG, newB];
};

const applyWB = (r: number, g: number, b: number, temp: number, tint: number): [number, number, number] => {
  const t = temp / 100; 
  const tn = tint / 100;
  
  // R/B gain for Temp
  let rGain = 1.0 + (t > 0 ? t * 0.5 : t * 0.2); 
  let bGain = 1.0 + (t < 0 ? -t * 0.5 : -t * 0.2); 
  
  // G gain for Tint
  let gGain = 1.0 - tn * 0.2; 

  // Normalize to preserve approx luminance
  // (Simplistic normalization to avoid blowing out highlights instantly)
  const maxG = Math.max(rGain, gGain, bGain);
  if (maxG > 1.2) {
      rGain /= (maxG * 0.9);
      gGain /= (maxG * 0.9);
      bGain /= (maxG * 0.9);
  }

  return [r * rGain, g * gGain, b * bGain];
};

// --- Grading ---

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

  // Masks
  const shadowMask = Math.max(0, 1 - luma * 2.0);
  const highlightMask = Math.max(0, (luma - 0.5) * 2.0);
  const midtoneMask = Math.max(0, 1 - Math.abs(luma - 0.5) * 2.0);

  const applyTint = (currR: number, currG: number, currB: number, grade: {h: number, s: number}, mask: number) => {
    if (grade.s === 0 || mask <= 0.001) return [currR, currG, currB];
    const [tr, tg, tb] = hslToRgb(grade.h, 0.8, 0.5); // Fixed saturation/lightness for the tint source
    const strength = (grade.s / 100) * mask; 
    
    // Lerp towards Soft Light result
    const sr = softLight(currR, tr);
    const sg = softLight(currG, tg);
    const sb = softLight(currB, tb);

    return [
        currR * (1 - strength) + sr * strength,
        currG * (1 - strength) + sg * strength,
        currB * (1 - strength) + sb * strength
    ];
  };

  let [or, og, ob] = [r, g, b];
  [or, og, ob] = applyTint(or, og, ob, grading.shadows, shadowMask);
  [or, og, ob] = applyTint(or, og, ob, grading.midtones, midtoneMask);
  [or, og, ob] = applyTint(or, og, ob, grading.highlights, highlightMask);

  return [or, og, ob];
};

// --- Tone Curves (Robust Sigmoid) ---
// SAFETY: This function must handle input < 0 safely (by clamping or safe math)
const applyContrastCurve = (val: number, contrast: number): number => {
    if (contrast === 0) return val;
    
    // Normalize 0-1
    let u = val / 255;
    // Safety clamp for power functions
    u = Math.max(0, Math.min(1, u));

    // Contrast factor: 0-100 -> 1.0-3.0 approx slope
    const k = 1 + (contrast / 100); 

    // Logistic Sigmoid centered at 0.5
    // f(x) = 1 / (1 + exp(-k * (x - 0.5)))
    // Scaled to fit 0,1 roughly
    
    if (contrast > 0) {
        // Simple S-curve polynomial for performance and stability
        // P(x) = x^k / (x^k + (1-x)^k) is a good S-curve but expensive
        // Let's use cosine approximation
        return ((u - 0.5) * k + 0.5) * 255; 
        // Note: linear expansion from center is stable but clips.
    } else {
        // Low contrast: move towards 0.5
        return ((u - 0.5) / (1 + Math.abs(contrast)/100) + 0.5) * 255;
    }
};

// A high-quality S-Curve that replicates film response
const applyFilmCurve = (val: number, strength: number = 1.0): number => {
    let u = val / 255;
    u = Math.max(0, u); // Clamp negative
    
    // "Toe" (Shadow compression) and "Shoulder" (Highlight compression)
    // Simple S: 
    const s = (x: number) => x * x * (3 - 2 * x);
    
    let res = u;
    // Apply polynomial S-Curve
    res = s(u);
    
    // Blend back based on strength
    return (u + (res - u) * strength) * 255;
}


const applyVibrance = (r: number, g: number, b: number, amount: number): [number, number, number] => {
  if (amount === 0) return [r, g, b];
  
  // Safe math
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  if (mx <= 0) return [r, g, b]; // Prevent div by zero

  const sat = 1 - (mn / mx);
  
  // Vibrance: Boost saturation of low-sat pixels more
  const factor = (amount / 100) * (1 - sat); // Mask inverse to sat

  // Simple Saturation Math
  // Color = Luma + (Color - Luma) * (1 + factor)
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  
  const r2 = luma + (r - luma) * (1 + factor);
  const g2 = luma + (g - luma) * (1 + factor);
  const b2 = luma + (b - luma) * (1 + factor);
  
  return [r2, g2, b2];
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

        // 2. Film Simulation
        switch (type) {
          case FilmSimulation.Provia: {
            // Standard
            [r, g, b] = applyVibrance(r, g, b, 10);
            r = applyFilmCurve(r, 0.2);
            g = applyFilmCurve(g, 0.2);
            b = applyFilmCurve(b, 0.3); // Slight blue curve
            break;
          }
          case FilmSimulation.Velvia: {
            // Vivid: Matrix first to separate colors
            const m = [
                1.15, -0.10, -0.05,
                -0.05, 1.15, -0.10,
                -0.05, -0.10, 1.15
            ];
            [r, g, b] = applyMatrix(r, g, b, m);
            // CRITICAL: Clamp after matrix before curves
            r = Math.max(0, r); g = Math.max(0, g); b = Math.max(0, b);
            
            [r, g, b] = applyVibrance(r, g, b, 25);
            r = applyFilmCurve(r, 0.5);
            g = applyFilmCurve(g, 0.5);
            b = applyFilmCurve(b, 0.5);
            break;
          }
          case FilmSimulation.Astia: {
            // Soft
            r = applyFilmCurve(r, 0.1);
            g = applyFilmCurve(g, 0.1);
            b = applyFilmCurve(b, 0.1);
            [r, g, b] = applyVibrance(r, g, b, 5);
            // Skin Tone Protection (Warm midtones)
            if (r > g && g > b) { // Roughly skin hue range
                r *= 1.02; g *= 1.01;
            }
            break;
          }
          case FilmSimulation.ClassicChrome: {
            // Desaturated, Hard Contrast, Cyan Skies
            const m = [
                0.95, 0.05, 0.0,
                0.0, 0.95, 0.05,
                0.0, 0.10, 0.90
            ];
            [r, g, b] = applyMatrix(r, g, b, m);
            r = Math.max(0, r); g = Math.max(0, g); b = Math.max(0, b);

            [r, g, b] = applyVibrance(r, g, b, -15);
            // Hard S
            r = applyFilmCurve(r, 0.6);
            g = applyFilmCurve(g, 0.6);
            b = applyFilmCurve(b, 0.6);
            break;
          }
          case FilmSimulation.RealaAce: {
             // Realistic but punchy
             const m = [
                 1.05, -0.05, 0.0,
                 0.0, 1.05, -0.05,
                 -0.05, 0.0, 1.05
             ];
             [r, g, b] = applyMatrix(r, g, b, m);
             r = Math.max(0, r); g = Math.max(0, g); b = Math.max(0, b);
             r = applyFilmCurve(r, 0.3);
             g = applyFilmCurve(g, 0.3);
             b = applyFilmCurve(b, 0.3);
             break;
          }
          case FilmSimulation.ClassicNeg: {
             // Super Contrast, Color Shifts
             const negS = (val: number) => {
                 let u = Math.max(0, val / 255);
                 // Steeper curve
                 u = u * u * (3 - 2 * u);
                 return u * 255;
             };
             r = negS(r); g = negS(g); b = negS(b);
             
             // Crosstalk
             const m = [
                 1.1, -0.1, 0.0,
                 0.0, 1.1, -0.1,
                 0.0, 0.1, 0.9
             ];
             [r, g, b] = applyMatrix(r, g, b, m);
             r = Math.max(0, r); g = Math.max(0, g); b = Math.max(0, b);
             break;
          }
          case FilmSimulation.NostalgicNeg: {
             // Amber highlights
             r = applyFilmCurve(r, 0.2);
             g = applyFilmCurve(g, 0.2);
             b = applyFilmCurve(b, 0.2);
             
             // Amber/Warm Highlights
             const luma = (r+g+b)/3;
             if (luma > 100) {
                 const f = (luma - 100)/155 * 10;
                 r += f; g += f * 0.5; b -= f * 0.5;
             }
             break;
          }
          case FilmSimulation.Eterna: {
             // Flat
             const flatCurve = (v: number) => {
                 let u = v/255; 
                 // Inverse S? Or just gamma lift
                 return (u * 0.8 + 0.1) * 255;
             };
             r = flatCurve(r); g = flatCurve(g); b = flatCurve(b);
             [r, g, b] = applyVibrance(r, g, b, -20);
             break;
          }
          case FilmSimulation.Acros: 
          case FilmSimulation.AcrosYe:
          case FilmSimulation.AcrosR:
          case FilmSimulation.AcrosG: {
             let grey = 0;
             if (type === FilmSimulation.Acros) grey = r*0.299 + g*0.587 + b*0.114;
             if (type === FilmSimulation.AcrosYe) grey = r*0.34 + g*0.56 + b*0.10;
             if (type === FilmSimulation.AcrosR) grey = r*0.5 + g*0.4 + b*0.1;
             if (type === FilmSimulation.AcrosG) grey = r*0.2 + g*0.7 + b*0.1;
             
             const val = applyFilmCurve(grey, 0.6); // Punchy B&W
             r = val; g = val; b = val;
             break;
          }
          case FilmSimulation.Sepia: {
             const val = r*0.299 + g*0.587 + b*0.114;
             r = val * 1.1; // Red tint
             g = val * 1.0; 
             b = val * 0.8; // Less blue -> yellow
             break;
          }
        }

        // 3. Color Grading
        [r, g, b] = applyGrading(r, g, b, grading);

        // Final Clamp
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
