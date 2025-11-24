
import { FilmSimulation, LUTData } from '../types';

const LUT_SIZE = 32;

// --- Math Helpers ---

// Strict clamp to prevent NaN in power functions
const clamp = (v: number) => Math.max(0, Math.min(255, v));
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const mix = (a: number, b: number, t: number) => a * (1 - t) + b * t;

// Improved S-Curve function that is safe for all inputs
// contrast: 0 = linear, >0 = more contrast (S-curve), <0 = less contrast (Inverse S)
const applyCurve = (val: number, contrast: number, liftShadows: number = 0, crushBlacks: number = 0): number => {
  // Normalize to 0-1
  let x = clamp(val) / 255;

  // 1. Pre-curve adjustments (Lift/Crush)
  if (liftShadows > 0) {
    // Lift darker parts
    x = x + (1 - x) * liftShadows * 0.2 * Math.pow(1 - x, 2);
  }
  if (crushBlacks > 0) {
     x = Math.max(0, x - crushBlacks * 0.05);
     x = x * (1 / (1 - crushBlacks * 0.05)); // Renormalize
  }

  // 2. Contrast S-Curve
  // Using a safe power function
  let y = x;
  if (contrast !== 0) {
    const k = 1 + Math.abs(contrast);
    if (contrast > 0) {
      // Standard S-Curve
      if (x < 0.5) {
        y = 0.5 * Math.pow(2 * x, k);
      } else {
        y = 1 - 0.5 * Math.pow(2 * (1 - x), k);
      }
    } else {
      // Inverse S-Curve (Log-ish)
      // Approximate by blending linear with a flattened curve
      y = mix(x, (Math.sin((x - 0.5) * Math.PI) + 1) / 2, Math.abs(contrast) * 0.5);
    }
  }

  return clamp01(y) * 255;
};

// RGB to Grayscale with custom weights
const toGrayscale = (r: number, g: number, b: number, weights: [number, number, number]) => {
  return r * weights[0] + g * weights[1] + b * weights[2];
};

// HSL-like saturation adjustment without full conversion
const adjustSaturation = (r: number, g: number, b: number, amount: number) => {
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  return [
    luma + (r - luma) * (1 + amount),
    luma + (g - luma) * (1 + amount),
    luma + (b - luma) * (1 + amount)
  ];
};

// --- Main Generator ---

export const generateFilmStyleLUT = (type: FilmSimulation): LUTData => {
  const data = new Uint8Array(LUT_SIZE * LUT_SIZE * LUT_SIZE * 3);
  const step = 255 / (LUT_SIZE - 1);

  for (let bIdx = 0; bIdx < LUT_SIZE; bIdx++) {
    for (let gIdx = 0; gIdx < LUT_SIZE; gIdx++) {
      for (let rIdx = 0; rIdx < LUT_SIZE; rIdx++) {
        // Base coordinates
        const rBase = rIdx * step;
        const gBase = gIdx * step;
        const bBase = bIdx * step;

        let r = rBase, g = gBase, b = bBase;
        
        // Calculate luma (0-255)
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        const lumaNorm = luma / 255;

        switch (type) {
          case FilmSimulation.Provia: {
            // STANDARD: Good all rounder. 
            // Slight S-curve, neutral colors.
            r = applyCurve(r, 0.1);
            g = applyCurve(g, 0.1);
            b = applyCurve(b, 0.1);
            // Tiny saturation boost
            const sat = adjustSaturation(r, g, b, 0.1);
            r = sat[0]; g = sat[1]; b = sat[2];
            break;
          }

          case FilmSimulation.Velvia: {
            // VIVID: High contrast, High Saturation.
            // Specific: Magenta bias in shadows/blues.
            
            // 1. Saturation boost
            const sat = adjustSaturation(r, g, b, 0.4);
            r = sat[0]; g = sat[1]; b = sat[2];

            // 2. Strong Contrast
            r = applyCurve(r, 0.25);
            g = applyCurve(g, 0.25);
            b = applyCurve(b, 0.25);

            // 3. Color Shift: Deep Blues -> Magenta
            if (b > r && b > g) {
              r *= 1.05; // Add red to blues
            }
            // Warm highlights
            if (luma > 150) {
                r *= 1.02;
            }
            break;
          }

          case FilmSimulation.Astia: {
            // SOFT: Soft highlights, slightly hard shadows.
            // Good skin tones (Red/Orange).
            
            // 1. Custom Curve: Softer highlights
            // We apply less contrast to high values
            const curveVal = (v: number) => {
                if (v > 128) return applyCurve(v, 0.05);
                return applyCurve(v, 0.15); // Harder shadows
            };
            r = curveVal(r); g = curveVal(g); b = curveVal(b);

            // 2. Saturation: Moderate
            const sat = adjustSaturation(r, g, b, 0.15);
            r = sat[0]; g = sat[1]; b = sat[2];

            // 3. Skin tone protection (Reds/Oranges slightly desaturated/brightened)
            if (r > g && g > b) {
                r = r * 1.02;
                g = g * 1.01;
            }
            break;
          }

          case FilmSimulation.ClassicChrome: {
            // DISTINCT: Low Saturation, Hard Shadow, Soft High.
            // Skies (Blue) -> Cyan.
            
            // 1. Desaturate
            const sat = adjustSaturation(r, g, b, -0.25);
            r = sat[0]; g = sat[1]; b = sat[2];

            // 2. Tonal Response: Hard shadows, flattened highlights
            r = applyCurve(r, 0.15, 0, 0.1); // 0.1 crush black
            g = applyCurve(g, 0.15, 0, 0.1);
            b = applyCurve(b, 0.15, 0, 0.1);

            // 3. Hue Shift
            // Blues -> Cyan (Green boost in blue channel dominance)
            if (b > g && b > r) {
                g = mix(g, b, 0.15); 
            }
            // Reds -> Darker
            if (r > g && r > b) {
                r *= 0.95;
            }
            break;
          }

          case FilmSimulation.RealaAce: {
            // REALISTIC + HARD: Accurate colors, but punchy contrast.
            // 1. Linear-ish color matrix (very slight saturation)
            const sat = adjustSaturation(r, g, b, 0.05);
            r = sat[0]; g = sat[1]; b = sat[2];

            // 2. Hard S-Curve (Consistent across range)
            r = applyCurve(r, 0.2);
            g = applyCurve(g, 0.2);
            b = applyCurve(b, 0.2);
            break;
          }

          case FilmSimulation.ClassicNeg: {
            // UNIQUE: Hard tonality. 
            // Split Toning: Shadows = Cool (Cyan/Green), Highlights = Warm (Red/Magenta).
            // Low saturation in very dark/very bright areas.

            // 1. Strong Curve
            r = applyCurve(r, 0.25);
            g = applyCurve(g, 0.25);
            b = applyCurve(b, 0.25);

            // 2. Split Toning Logic based on Luma
            // Low Luma -> Add Green/Blue (Cyan)
            // High Luma -> Add Red
            const t = lumaNorm; // 0..1

            // Shadow Tint (Cyan-ish)
            const sR = 0.9; const sG = 1.02; const sB = 1.02;
            // Highlight Tint (Red-ish)
            const hR = 1.05; const hG = 0.98; const hB = 0.95;

            r *= mix(sR, hR, t);
            g *= mix(sG, hG, t);
            b *= mix(sB, hB, t);

            // 3. Crush blacks hard
            r = Math.max(0, r - 10);
            g = Math.max(0, g - 10);
            b = Math.max(0, b - 10);
            break;
          }

          case FilmSimulation.NostalgicNeg: {
            // AMBER: Warm highlights, rich shadows.
            // Softer contrast than Classic Neg.
            
            // 1. Moderate Curve
            r = applyCurve(r, 0.15);
            g = applyCurve(g, 0.15);
            b = applyCurve(b, 0.15);

            // 2. Amber Highlights
            // Add Red+Green (Yellow/Amber) in highlights
            if (luma > 100) {
                const factor = (luma - 100) / 155; // 0 to 1
                r += 15 * factor;
                g += 10 * factor;
            }

            // 3. Rich Saturation
            const sat = adjustSaturation(r, g, b, 0.15);
            r = sat[0]; g = sat[1]; b = sat[2];
            break;
          }

          case FilmSimulation.Eterna: {
            // CINEMA: Flat contrast, Lifted blacks, Desaturated.
            
            // 1. Inverse S-Curve (Soft) + Lift
            // We manually implement a log-to-rec709 approximation feel
            const eternaCurve = (v: number) => {
               let y = v / 255;
               // Lift blacks
               y = 0.1 + y * 0.85; 
               // Soft shoulder
               y = y * (1.05 - y * 0.1); 
               return clamp(y * 255);
            };
            
            r = eternaCurve(r);
            g = eternaCurve(g);
            b = eternaCurve(b);

            // 2. Heavy Desaturation
            const sat = adjustSaturation(r, g, b, -0.35);
            r = sat[0]; g = sat[1]; b = sat[2];
            
            // 3. Teal shadow bias (Cinematic)
            if (luma < 100) {
               r *= 0.98;
               g *= 1.01;
               b *= 1.01;
            }
            break;
          }

          case FilmSimulation.Acros: {
            // B&W: Non-linear spectral sensitivity.
            // Sharp, specific S-curve.
            
            // Acros has complex spectral sensitivity, brighter reds, deeper blues.
            const grey = toGrayscale(r, g, b, [0.3, 0.59, 0.11]);
            
            // Hard S-Curve
            const val = applyCurve(grey, 0.2);
            r = val; g = val; b = val;
            break;
          }

          case FilmSimulation.AcrosYe: {
            // Yellow Filter: Darkens Blue (Sky), Lightens Yellow.
            // Weights: Less Blue, More Red/Green.
            const grey = toGrayscale(r, g, b, [0.34, 0.56, 0.1]); // Reduced Blue weight
            const val = applyCurve(grey, 0.2);
            r = val; g = val; b = val;
            break;
          }

          case FilmSimulation.AcrosR: {
            // Red Filter: High Contrast B&W.
            // Darkens Blue/Green heavily.
            const grey = toGrayscale(r, g, b, [0.5, 0.4, 0.1]); // Boosted Red weight
            const val = applyCurve(grey, 0.25); // Extra contrast
            r = val; g = val; b = val;
            break;
          }

          case FilmSimulation.AcrosG: {
            // Green Filter: Good for skin tones / lips darkening.
            // Lightens Green.
            const grey = toGrayscale(r, g, b, [0.25, 0.65, 0.1]); // Boosted Green
            const val = applyCurve(grey, 0.2);
            r = val; g = val; b = val;
            break;
          }
          
          case FilmSimulation.Sepia: {
            // Classic Sepia matrix
            const tr = 0.393 * r + 0.769 * g + 0.189 * b;
            const tg = 0.349 * r + 0.686 * g + 0.168 * b;
            const tb = 0.272 * r + 0.534 * g + 0.131 * b;
            r = tr; g = tg; b = tb;
            break;
          }
        }

        // Final strict safety clamp
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
