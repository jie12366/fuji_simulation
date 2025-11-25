
import { FilmSimulation, LUTContainer, GradingAdjustments } from '../types';

const TARGET_SIZE = 32;

// --- Math Helpers ---
const clamp = (v: number) => Math.max(0, Math.min(255, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// --- 1. White Balance (Bradford Adaptation approximation) ---
const applyWB = (r: number, g: number, b: number, temp: number, tint: number): [number, number, number] => {
  if (temp === 0 && tint === 0) return [r, g, b];
  
  const t = temp / 100; 
  const tn = tint / 100;
  
  // Warm shifts R up, B down. Cool shifts R down, B up.
  let rGain = 1.0 + t;
  let bGain = 1.0 - t;
  let gGain = 1.0 - tn; 

  return [r * rGain, g * gGain, b * bGain];
};

// --- 2. Color Grading (Soft Light Blend) ---
const softLight = (base: number, blend: number): number => {
  const b = base / 255; const l = blend / 255;
  let r = 0;
  if (l <= 0.5) r = b - (1 - 2 * l) * b * (1 - b);
  else {
    const d = (b <= 0.25) ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b);
    r = b + (2 * l - 1) * (d - b);
  }
  return r * 255;
};

const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  let r, g, b;
  if (s === 0) { r = g = b = l; } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h / 360 + 1/3);
    g = hue2rgb(p, q, h / 360);
    b = hue2rgb(p, q, h / 360 - 1/3);
  }
  return [r * 255, g * 255, b * 255];
};

const applyGrading = (r: number, g: number, b: number, grading: GradingAdjustments): [number, number, number] => {
  if (grading.shadows.s === 0 && grading.midtones.s === 0 && grading.highlights.s === 0) return [r, g, b];
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const shadowMask = Math.max(0, 1 - luma * 2.0);
  const highlightMask = Math.max(0, (luma - 0.5) * 2.0);
  const midtoneMask = Math.max(0, 1 - Math.abs(luma - 0.5) * 2.0);

  const applyTint = (cR: number, cG: number, cB: number, grade: {h: number, s: number}, mask: number) => {
    if (grade.s === 0 || mask <= 0.001) return [cR, cG, cB];
    const [tr, tg, tb] = hslToRgb(grade.h, 0.8, 0.5); // Target color
    const strength = (grade.s / 100) * mask; 
    return [
        lerp(cR, softLight(cR, tr), strength),
        lerp(cG, softLight(cG, tg), strength),
        lerp(cB, softLight(cB, tb), strength)
    ];
  };

  let [or, og, ob] = [r, g, b];
  [or, og, ob] = applyTint(or, og, ob, grading.shadows, shadowMask);
  [or, og, ob] = applyTint(or, og, ob, grading.midtones, midtoneMask);
  [or, og, ob] = applyTint(or, og, ob, grading.highlights, highlightMask);
  return [or, og, ob];
};

// --- 3. INDUSTRY STANDARD ENGINE (Matrix + S-Curve) ---

// Apply 3x3 Matrix
const applyMatrix = (r: number, g: number, b: number, m: number[]): [number, number, number] => {
    // Standard RGB Matrix Multiplication
    const rN = r * m[0] + g * m[1] + b * m[2];
    const gN = r * m[3] + g * m[4] + b * m[5];
    const bN = r * m[6] + g * m[7] + b * m[8];
    return [rN, gN, bN];
};

// Sigmoid S-Curve for standard contrast
const applyCurve = (val: number, contrast: number, offset: number = 0): number => {
    // contrast: typically 4-10
    // offset: shifts the midpoint (-0.5 to 0.5)
    const x = val / 255;
    const k = contrast;
    const x0 = 0.5 + offset;
    
    // Sigmoid function: 1 / (1 + exp(-k * (x - x0)))
    const y = 1 / (1 + Math.exp(-k * (x - x0)));
    
    // Normalize to 0-1 range based on endpoints
    const yMin = 1 / (1 + Math.exp(-k * (0 - x0)));
    const yMax = 1 / (1 + Math.exp(-k * (1 - x0)));
    const normalized = (y - yMin) / (yMax - yMin);
    
    return normalized * 255;
};

const applyFilmMath = (r: number, g: number, b: number, type: FilmSimulation): [number, number, number] => {
    if (type === FilmSimulation.None) return [r, g, b];

    // 1. Color Matrices (Simulate spectral sensitivity & dye characteristics)
    // These are approximations of the "Look"
    let m: number[] = [1,0,0, 0,1,0, 0,0,1]; // Identity
    let rM = r, gM = g, bM = b;

    switch (type) {
        case FilmSimulation.ClassicChrome:
            // Muted colors, Cyan skies, Earthy reds
            // Desaturate R, Shift B->G
            m = [
                0.75, 0.20, 0.05, 
                0.10, 0.85, 0.05, 
                0.00, 0.10, 0.90
            ];
            [rM, gM, bM] = applyMatrix(r, g, b, m);
            break;

        case FilmSimulation.ClassicNeg:
            // High contrast colors. Red -> Orange/Magenta, Blue -> Cyan/Green
            m = [
                0.95, 0.05, 0.00, 
                0.00, 1.05, 0.00, // Boost Green
                0.00, 0.10, 0.90  // Blue shift
            ];
            [rM, gM, bM] = applyMatrix(r, g, b, m);
            // Unique Classic Neg separation: 
            // If it's dark, push Blue (Cool shadows). If it's bright, push Red (Warm highlights).
            const luma = (rM + gM + bM) / 3;
            if (luma < 100) bM *= 1.05; // Cool shadows
            if (luma > 150) rM *= 1.05; // Warm highlights
            break;

        case FilmSimulation.Velvia:
            // Vivid: Boost saturation and separation
            m = [
                1.15, -0.05, -0.1, 
                -0.05, 1.15, -0.1, 
                -0.1, -0.1, 1.20
            ];
            [rM, gM, bM] = applyMatrix(r, g, b, m);
            break;

        case FilmSimulation.Astia:
            // Soft, skin tone friendly (Boost Red/Yellow slightly)
            m = [
                1.05, 0.05, -0.1, 
                0.00, 1.00, 0.00, 
                -0.05, 0.00, 1.05
            ];
            [rM, gM, bM] = applyMatrix(r, g, b, m);
            break;

        case FilmSimulation.Eterna:
            // Cinema: Low saturation, flat
            m = [
                0.90, 0.10, 0.00, 
                0.05, 0.90, 0.05, 
                0.00, 0.10, 0.90
            ];
            [rM, gM, bM] = applyMatrix(r, g, b, m);
            break;
        
        case FilmSimulation.NostalgicNeg:
            // Amber shift
            m = [
                1.10, 0.10, -0.2, 
                0.05, 0.95, 0.00, 
                -0.1, 0.10, 1.00
            ];
            [rM, gM, bM] = applyMatrix(r, g, b, m);
            break;

        case FilmSimulation.RealaAce:
            // High fidelity, punchy
            m = [
                1.05, 0.00, -0.05, 
                -0.02, 1.04, -0.02, 
                -0.05, 0.00, 1.05
            ];
            [rM, gM, bM] = applyMatrix(r, g, b, m);
            break;

        case FilmSimulation.Acros:
        case FilmSimulation.AcrosG:
        case FilmSimulation.AcrosR:
        case FilmSimulation.AcrosYe:
             // B&W Mixer
             let gray = 0;
             if (type === FilmSimulation.AcrosR) gray = 0.5 * r + 0.45 * g + 0.05 * b;
             else if (type === FilmSimulation.AcrosG) gray = 0.2 * r + 0.7 * g + 0.1 * b;
             else if (type === FilmSimulation.AcrosYe) gray = 0.4 * r + 0.55 * g + 0.05 * b;
             else gray = 0.3 * r + 0.6 * g + 0.1 * b; // Standard
             
             rM = gM = bM = gray;
             break;
    }

    // 2. Tone Curves (Sigmoid)
    switch (type) {
        case FilmSimulation.ClassicChrome:
            // Hard shadows
            rM = applyCurve(rM, 5.5, 0.05); // Offset to crush shadows
            gM = applyCurve(gM, 5.5, 0.05);
            bM = applyCurve(bM, 5.5, 0.05);
            break;
            
        case FilmSimulation.ClassicNeg:
            // High contrast
            rM = applyCurve(rM, 6.0);
            gM = applyCurve(gM, 6.0);
            bM = applyCurve(bM, 6.0);
            break;

        case FilmSimulation.Velvia:
            // Very High contrast
            rM = applyCurve(rM, 6.5);
            gM = applyCurve(gM, 6.5);
            bM = applyCurve(bM, 6.5);
            break;

        case FilmSimulation.Eterna:
            // Low contrast (Flat)
            rM = applyCurve(rM, 3.5);
            gM = applyCurve(gM, 3.5);
            bM = applyCurve(bM, 3.5);
            // Lift blacks
            rM = rM * 0.9 + 10; gM = gM * 0.9 + 10; bM = bM * 0.9 + 10;
            break;
        
        case FilmSimulation.Acros:
        case FilmSimulation.AcrosR:
        case FilmSimulation.AcrosG:
        case FilmSimulation.AcrosYe:
             // Punchy B&W
             rM = applyCurve(rM, 5.0);
             gM = rM; bM = rM;
             break;

        case FilmSimulation.Provia:
        default:
             // Standard S-Curve
             rM = applyCurve(rM, 4.5);
             gM = applyCurve(gM, 4.5);
             bM = applyCurve(bM, 4.5);
             break;
    }

    return [clamp(rM), clamp(gM), clamp(bM)];
};


// --- MAIN GENERATOR ---
export const generateFilmStyleLUT = (
    type: FilmSimulation, 
    wb: { temp: number, tint: number },
    grading: GradingAdjustments
): LUTContainer => {
  const data = new Uint8Array(TARGET_SIZE * TARGET_SIZE * TARGET_SIZE * 3);
  const step = 255 / (TARGET_SIZE - 1);

  for (let bIdx = 0; bIdx < TARGET_SIZE; bIdx++) {
    for (let gIdx = 0; gIdx < TARGET_SIZE; gIdx++) {
      for (let rIdx = 0; rIdx < TARGET_SIZE; rIdx++) {
        const rBase = rIdx * step;
        const gBase = gIdx * step;
        const bBase = bIdx * step;

        // 1. White Balance
        let [r, g, b] = applyWB(rBase, gBase, bBase, wb.temp, wb.tint);

        // 2. Film Simulation (Standard Matrix + Curve)
        [r, g, b] = applyFilmMath(r, g, b, type);

        // 3. Color Grading
        [r, g, b] = applyGrading(r, g, b, grading);

        // 4. Store
        const index = (rIdx + gIdx * TARGET_SIZE + bIdx * TARGET_SIZE * TARGET_SIZE) * 3;
        data[index] = Math.round(clamp(r));
        data[index + 1] = Math.round(clamp(g));
        data[index + 2] = Math.round(clamp(b));
      }
    }
  }

  return {
      size: TARGET_SIZE,
      data: data
  };
};