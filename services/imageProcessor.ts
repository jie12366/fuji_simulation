
import { Adjustments, LUTData } from '../types';

const LUT_SIZE = 32;
const LUT_SIZE_SQ = LUT_SIZE * LUT_SIZE;

export const applyLUT = (
  pixelData: ImageData, 
  lutData: LUTData, 
  adjustments: Adjustments,
  intensity: number
): ImageData => {
  const width = pixelData.width;
  const height = pixelData.height;
  const data = pixelData.data; 
  const output = new ImageData(new Uint8ClampedArray(data), width, height);
  const outData = output.data;

  // Pre-calculate adjustment factors
  const brightness = adjustments.brightness;
  const contrastFactor = (259 * (adjustments.contrast + 255)) / (255 * (259 - adjustments.contrast));
  const saturationFactor = 1 + (adjustments.saturation / 100);
  const shadowLift = adjustments.shadows * 0.5;
  const highlightDrop = adjustments.highlights * 0.5;

  const scale = (LUT_SIZE - 1) / 255;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    const a = data[i + 3];

    // --- 1. Basic Adjustments (Optimized inline) ---
    
    // Brightness
    if (brightness !== 0) {
      r += brightness; g += brightness; b += brightness;
    }

    // Contrast
    if (contrastFactor !== 1) {
      r = contrastFactor * (r - 128) + 128;
      g = contrastFactor * (g - 128) + 128;
      b = contrastFactor * (b - 128) + 128;
    }

    // Clamp temp values to avoid weird luma calculations
    r = r < 0 ? 0 : (r > 255 ? 255 : r);
    g = g < 0 ? 0 : (g > 255 ? 255 : g);
    b = b < 0 ? 0 : (b > 255 ? 255 : b);

    const luma = 0.299 * r + 0.587 * g + 0.114 * b;

    // Saturation
    if (saturationFactor !== 1) {
      r = luma + (r - luma) * saturationFactor;
      g = luma + (g - luma) * saturationFactor;
      b = luma + (b - luma) * saturationFactor;
    }

    // Shadows / Highlights
    if (shadowLift !== 0) {
      const mask = 1 - (luma / 255); 
      const lift = Math.max(0, mask) * shadowLift;
      r += lift; g += lift; b += lift;
    }
    if (highlightDrop !== 0) {
      const mask = Math.max(0, (luma - 128) / 128);
      const drop = mask * highlightDrop;
      r += drop; g += drop; b += drop;
    }

    // Final clamp before LUT
    r = r < 0 ? 0 : (r > 255 ? 255 : r);
    g = g < 0 ? 0 : (g > 255 ? 255 : g);
    b = b < 0 ? 0 : (b > 255 ? 255 : b);

    // --- 2. LUT Lookup ---
    
    // Nearest Neighbor lookup
    // Ensure indices are strictly integers within bounds
    let rIdx = (r * scale) | 0;
    let gIdx = (g * scale) | 0;
    let bIdx = (b * scale) | 0;

    // Safety clamp (bitwise OR 0 handles floor, but doesn't handle max)
    if (rIdx >= LUT_SIZE) rIdx = LUT_SIZE - 1;
    if (gIdx >= LUT_SIZE) gIdx = LUT_SIZE - 1;
    if (bIdx >= LUT_SIZE) bIdx = LUT_SIZE - 1;

    const idx = (rIdx + gIdx * LUT_SIZE + bIdx * LUT_SIZE_SQ) * 3;

    let lutR = lutData[idx];
    let lutG = lutData[idx + 1];
    let lutB = lutData[idx + 2];

    // --- 3. Intensity Mix ---
    if (intensity !== 1) {
      lutR = r * (1 - intensity) + lutR * intensity;
      lutG = g * (1 - intensity) + lutG * intensity;
      lutB = b * (1 - intensity) + lutB * intensity;
    }

    outData[i] = lutR;
    outData[i + 1] = lutG;
    outData[i + 2] = lutB;
    outData[i + 3] = a;
  }

  return output;
};
