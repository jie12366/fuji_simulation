
import { FilmSimulation, LUTData, GradingAdjustments } from '../types';

const LUT_SIZE = 32;

// --- Math Helpers ---

const clamp = (v: number) => Math.max(0, Math.min(255, v));
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const mix = (a: number, b: number, t: number) => a * (1 - t) + b * t;

// --- White Balance ---
// Simple Bradford-like gain adjustment
const applyWB = (r: number, g: number, b: number, temp: number, tint: number): [number, number, number] => {
  // Temp: -50 (Blue) to 50 (Yellow)
  // Tint: -50 (Green) to 50 (Magenta)
  
  // Normalize inputs to reasonable gain factors
  const t = temp / 100; // -0.5 to 0.5
  const tn = tint / 100;

  // Temperature (Warm/Cool)
  let rGain = 1.0;
  let gGain = 1.0;
  let bGain = 1.0;

  if (t > 0) {
    // Warmer: Boost R, Lower B
    rGain += t * 0.4;
    bGain -= t * 0.2;
  } else {
    // Cooler: Boost B, Lower R
    bGain -= t * 0.4; // t is negative, so this adds
    rGain += t * 0.2; 
  }

  // Tint (Green/Magenta)
  if (tn > 0) {
    // Magenta: Boost R+B, Lower G
    rGain += tn * 0.1;
    bGain += tn * 0.1;
    gGain -= tn * 0.2;
  } else {
    // Green: Boost G, Lower R+B
    gGain -= tn * 0.2; // tn negative
    rGain += tn * 0.1; 
    bGain += tn * 0.1;
  }

  return [r * rGain, g * gGain, b * bGain];
};

// --- Color Grading ---
// HSL to RGB helper for grading tints
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
  
  return [(r + m), (g + m), (b + m)];
};

const applyGrading = (r: number, g: number, b: number, grading: GradingAdjustments): [number, number, number] => {
  // If no grading, return early
  if (grading.shadows.s === 0 && grading.midtones.s === 0 && grading.highlights.s === 0) {
    return [r, g, b];
  }

  // Luma (0-1)
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  // Calculate masks using smoothstep-like curves
  // Shadows: 1.0 at black, fading to 0.0 at 0.5
  const shadowMask = 1.0 - Math.min(1, Math.max(0, (luma * 2.5))); 
  
  // Highlights: 0.0 at 0.5, fading to 1.0 at white
  const highlightMask = Math.min(1, Math.max(0, (luma - 0.45) * 2));

  // Midtones: The remainder, peaked at 0.5
  const midtoneMask = Math.max(0, 1.0 - shadowMask - highlightMask);

  const applyTint = (currR: number, currG: number, currB: number, grade: {h: number, s: number}, mask: number) => {
    if (grade.s === 0 || mask <= 0) return [currR, currG, currB];
    
    // Get target tint color (at 50% luminance relative)
    const [tr, tg, tb] = hslToRgb(grade.h, 1.0, 0.5);
    
    // Blend mode: Soft Color/Overlay hybrid simulation
    // We offset the current channel towards the tint channel
    const amount = (grade.s / 100) * mask * 0.3; // Strength scaler
    
    // Additive tint (simulates Color Balance)
    const nr = currR + (tr * 255 - 128) * amount;
    const ng = currG + (tg * 255 - 128) * amount;
    const nb = currB + (tb * 255 - 128) * amount;

    return [nr, ng, nb];
  };

  let [or, og, ob] = [r, g, b];
  [or, og, ob] = applyTint(or, og, ob, grading.shadows, shadowMask);
  [or, og, ob] = applyTint(or, og, ob, grading.midtones, midtoneMask);
  [or, og, ob] = applyTint(or, og, ob, grading.highlights, highlightMask);

  return [or, og, ob];
};


const applyCurve = (val: number, contrast: number, liftShadows: number = 0, crushBlacks: number = 0): number => {
  let x = clamp(val) / 255;
  if (liftShadows > 0) x = x + (1 - x) * liftShadows * 0.2 * Math.pow(1 - x, 2);
  if (crushBlacks > 0) {
     x = Math.max(0, x - crushBlacks * 0.05);
     x = x * (1 / (1 - crushBlacks * 0.05));
  }
  let y = x;
  if (contrast !== 0) {
    const k = 1 + Math.abs(contrast);
    if (contrast > 0) {
      if (x < 0.5) y = 0.5 * Math.pow(2 * x, k);
      else y = 1 - 0.5 * Math.pow(2 * (1 - x), k);
    } else {
      y = mix(x, (Math.sin((x - 0.5) * Math.PI) + 1) / 2, Math.abs(contrast) * 0.5);
    }
  }
  return clamp01(y) * 255;
};

const adjustSaturation = (r: number, g: number, b: number, amount: number) => {
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  return [
    luma + (r - luma) * (1 + amount),
    luma + (g - luma) * (1 + amount),
    luma + (b - luma) * (1 + amount)
  ];
};

const toGrayscale = (r: number, g: number, b: number, weights: [number, number, number]) => {
  return r * weights[0] + g * weights[1] + b * weights[2];
};

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

        // 1. Apply White Balance FIRST (Sensor level correction simulation)
        let [r, g, b] = applyWB(rBase, gBase, bBase, wb.temp, wb.tint);

        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        const lumaNorm = luma / 255;

        // 2. Film Simulation Curves
        switch (type) {
          case FilmSimulation.Provia: {
            r = applyCurve(r, 0.1);
            g = applyCurve(g, 0.1);
            b = applyCurve(b, 0.1);
            const sat = adjustSaturation(r, g, b, 0.1);
            r = sat[0]; g = sat[1]; b = sat[2];
            break;
          }
          case FilmSimulation.Velvia: {
            const sat = adjustSaturation(r, g, b, 0.4);
            r = sat[0]; g = sat[1]; b = sat[2];
            r = applyCurve(r, 0.25);
            g = applyCurve(g, 0.25);
            b = applyCurve(b, 0.25);
            if (b > r && b > g) r *= 1.05;
            if (luma > 150) r *= 1.02;
            break;
          }
          case FilmSimulation.Astia: {
            const curveVal = (v: number) => (v > 128) ? applyCurve(v, 0.05) : applyCurve(v, 0.15);
            r = curveVal(r); g = curveVal(g); b = curveVal(b);
            const sat = adjustSaturation(r, g, b, 0.15);
            r = sat[0]; g = sat[1]; b = sat[2];
            if (r > g && g > b) { r = r * 1.02; g = g * 1.01; }
            break;
          }
          case FilmSimulation.ClassicChrome: {
            const sat = adjustSaturation(r, g, b, -0.25);
            r = sat[0]; g = sat[1]; b = sat[2];
            r = applyCurve(r, 0.15, 0, 0.1);
            g = applyCurve(g, 0.15, 0, 0.1);
            b = applyCurve(b, 0.15, 0, 0.1);
            if (b > g && b > r) g = mix(g, b, 0.15); 
            if (r > g && r > b) r *= 0.95;
            break;
          }
          case FilmSimulation.RealaAce: {
            const sat = adjustSaturation(r, g, b, 0.05);
            r = sat[0]; g = sat[1]; b = sat[2];
            r = applyCurve(r, 0.2);
            g = applyCurve(g, 0.2);
            b = applyCurve(b, 0.2);
            break;
          }
          case FilmSimulation.ClassicNeg: {
            r = applyCurve(r, 0.25);
            g = applyCurve(g, 0.25);
            b = applyCurve(b, 0.25);
            const t = lumaNorm;
            r *= mix(0.9, 1.05, t);
            g *= mix(1.02, 0.98, t);
            b *= mix(1.02, 0.95, t);
            r = Math.max(0, r - 10);
            g = Math.max(0, g - 10);
            b = Math.max(0, b - 10);
            break;
          }
          case FilmSimulation.NostalgicNeg: {
            r = applyCurve(r, 0.15);
            g = applyCurve(g, 0.15);
            b = applyCurve(b, 0.15);
            if (luma > 100) {
                const factor = (luma - 100) / 155;
                r += 15 * factor;
                g += 10 * factor;
            }
            const sat = adjustSaturation(r, g, b, 0.15);
            r = sat[0]; g = sat[1]; b = sat[2];
            break;
          }
          case FilmSimulation.Eterna: {
            const eternaCurve = (v: number) => {
               let y = v / 255;
               y = 0.1 + y * 0.85; 
               y = y * (1.05 - y * 0.1); 
               return clamp(y * 255);
            };
            r = eternaCurve(r); g = eternaCurve(g); b = eternaCurve(b);
            const sat = adjustSaturation(r, g, b, -0.35);
            r = sat[0]; g = sat[1]; b = sat[2];
            if (luma < 100) { r *= 0.98; g *= 1.01; b *= 1.01; }
            break;
          }
          case FilmSimulation.Acros: {
            const grey = toGrayscale(r, g, b, [0.3, 0.59, 0.11]);
            const val = applyCurve(grey, 0.2);
            r = val; g = val; b = val;
            break;
          }
          case FilmSimulation.AcrosYe: {
            const grey = toGrayscale(r, g, b, [0.34, 0.56, 0.1]);
            const val = applyCurve(grey, 0.2);
            r = val; g = val; b = val;
            break;
          }
          case FilmSimulation.AcrosR: {
            const grey = toGrayscale(r, g, b, [0.5, 0.4, 0.1]);
            const val = applyCurve(grey, 0.25);
            r = val; g = val; b = val;
            break;
          }
          case FilmSimulation.AcrosG: {
            const grey = toGrayscale(r, g, b, [0.25, 0.65, 0.1]);
            const val = applyCurve(grey, 0.2);
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

        // 3. Apply Color Grading (Post-Film)
        [r, g, b] = applyGrading(r, g, b, grading);

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
