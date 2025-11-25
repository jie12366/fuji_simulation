
import { Adjustments, LUTData, HistogramData, HSLAdjustments, HSLChannel } from '../types';

const LUT_SIZE = 32;
const LUT_SIZE_SQ = LUT_SIZE * LUT_SIZE;

const mulberry32 = (a: number) => {
    return () => {
      let t = a += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
}

// --- RGB <-> HSL Helpers (same as before) ---
function rgbToHsl(r: number, g: number, b: number, out: number[]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  out[0] = h * 360; out[1] = s; out[2] = l;
}

function hslToRgb(h: number, s: number, l: number, out: number[]) {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
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
  out[0] = r * 255; out[1] = g * 255; out[2] = b * 255;
}

function getHueWeight(hue: number, target: number, range: number = 45): number {
  let diff = Math.abs(hue - target);
  if (diff > 180) diff = 360 - diff;
  if (diff >= range) return 0;
  const t = diff / range;
  const v = 1 - t;
  return v * v * (3 - 2 * v);
}

function applyHSL(r: number, g: number, b: number, hslAdj: HSLAdjustments, hslCache: number[], rgbCache: number[]): [number, number, number] {
  rgbToHsl(r, g, b, hslCache);
  let [h, s, l] = hslCache;
  let dH = 0, dS = 0, dL = 0;

  const processChannel = (targetHue: number, channel: HSLChannel) => {
    if (channel.h === 0 && channel.s === 0 && channel.l === 0) return;
    const w = getHueWeight(h, targetHue, 45);
    if (w > 0) {
      dH += channel.h * w;
      dS += (channel.s / 100) * w; 
      dL += (channel.l / 100) * w;
    }
  };

  processChannel(0, hslAdj.red);     
  processChannel(60, hslAdj.yellow);
  processChannel(120, hslAdj.green);
  processChannel(180, hslAdj.cyan);
  processChannel(240, hslAdj.blue);
  processChannel(300, hslAdj.magenta);

  if (Math.abs(dH) > 0.01 || Math.abs(dS) > 0.001 || Math.abs(dL) > 0.001) {
    h = (h + dH + 360) % 360;
    s = Math.max(0, Math.min(1, s * (1 + dS))); 
    if (dL > 0) l = l + (1 - l) * dL * 0.5;
    else l = l + l * dL * 0.5;
    l = Math.max(0, Math.min(1, l));
    hslToRgb(h, s, l, rgbCache);
    return [rgbCache[0], rgbCache[1], rgbCache[2]];
  }
  return [r, g, b];
}

const lerp = (a: number, b: number, t: number) => a + t * (b - a);

// --- Sharpening Filter ---
// Apply simple convolution kernel for sharpening (approximate Unsharp Mask)
// 0  -1  0
// -1  5 -1
// 0  -1  0
export const applySharpen = (imageData: ImageData, amount: number) => {
    if (amount <= 0) return;

    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    
    // We need a copy of the source buffer to read clean pixels
    // Using Float32Array for calculation precision, or just Uint8 is fine for speed. 
    // Uint8ClampedArray is fastest for copy.
    const src = new Uint8ClampedArray(data);
    
    // Mix factor: amount 0..100 -> 0..1
    // The kernel effectively adds (Original - Blurred) * strength
    // A standard 3x3 sharpen kernel:
    // [0, -k, 0]
    // [-k, 1+4k, -k]
    // [0, -k, 0]
    
    const k = amount / 200; // scaling factor
    const center = 1 + 4 * k;
    const neighbor = -k;

    // Iterate pixels (skip borders for speed/simplicity)
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = (y * width + x) * 4;
            
            // Indices of neighbors (Up, Down, Left, Right)
            const iU = ((y - 1) * width + x) * 4;
            const iD = ((y + 1) * width + x) * 4;
            const iL = (y * width + (x - 1)) * 4;
            const iR = (y * width + (x + 1)) * 4;

            // Apply Convolution per channel
            data[idx]     = Math.min(255, Math.max(0, src[idx] * center + (src[iU] + src[iD] + src[iL] + src[iR]) * neighbor));
            data[idx + 1] = Math.min(255, Math.max(0, src[idx + 1] * center + (src[iU + 1] + src[iD + 1] + src[iL + 1] + src[iR + 1]) * neighbor));
            data[idx + 2] = Math.min(255, Math.max(0, src[idx + 2] * center + (src[iU + 2] + src[iD + 2] + src[iL + 2] + src[iR + 2]) * neighbor));
            // Alpha remains same
        }
    }
};

export const applyLUT = (
  pixelData: ImageData, 
  lutData: LUTData, 
  adjustments: Adjustments,
  intensity: number
): { imageData: ImageData, histogram: HistogramData } => {
  const width = pixelData.width;
  const height = pixelData.height;
  const data = pixelData.data; 
  const output = new ImageData(new Uint8ClampedArray(data), width, height);
  const outData = output.data;

  const histR = new Array(256).fill(0);
  const histG = new Array(256).fill(0);
  const histB = new Array(256).fill(0);

  // Constants
  const brightness = adjustments.brightness;
  const contrastFactor = (259 * (adjustments.contrast + 255)) / (255 * (259 - adjustments.contrast));
  const saturationFactor = 1 + (adjustments.saturation / 100);
  const shadowLift = adjustments.shadows * 0.5;
  const highlightDrop = adjustments.highlights * 0.5;
  
  const grainAmount = adjustments.grainAmount / 3; 
  const hasGrain = grainAmount > 0;
  
  const vignetteStr = adjustments.vignette / 100;
  const centerX = width / 2;
  const centerY = height / 2;
  const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);

  const LUT_MAX = LUT_SIZE - 1;
  const scale = LUT_MAX / 255;

  const random = mulberry32(1337);
  const hasHSL = Object.values(adjustments.hsl).some(c => c.h !== 0 || c.s !== 0 || c.l !== 0);
  
  const hslCache = [0,0,0];
  const rgbCache = [0,0,0];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;

      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];
      const a = data[i + 3];

      // --- 1. HSL Processing (Pre-LUT) ---
      if (hasHSL) {
        const newRgb = applyHSL(r, g, b, adjustments.hsl, hslCache, rgbCache);
        r = newRgb[0]; g = newRgb[1]; b = newRgb[2];
      }

      // --- 2. Basic Adjustments ---
      if (brightness !== 0) { r += brightness; g += brightness; b += brightness; }

      if (contrastFactor !== 1) {
        r = contrastFactor * (r - 128) + 128;
        g = contrastFactor * (g - 128) + 128;
        b = contrastFactor * (b - 128) + 128;
      }

      r = Math.max(0, Math.min(255, r));
      g = Math.max(0, Math.min(255, g));
      b = Math.max(0, Math.min(255, b));

      const luma = 0.299 * r + 0.587 * g + 0.114 * b;

      if (saturationFactor !== 1) {
        r = luma + (r - luma) * saturationFactor;
        g = luma + (g - luma) * saturationFactor;
        b = luma + (b - luma) * saturationFactor;
      }

      if (shadowLift !== 0) {
        const lift = Math.max(0, 1 - (luma / 255)) * shadowLift;
        r += lift; g += lift; b += lift;
      }
      if (highlightDrop !== 0) {
        const drop = Math.max(0, (luma - 128) / 128) * highlightDrop;
        r += drop; g += drop; b += drop;
      }

      r = Math.max(0, Math.min(255, r));
      g = Math.max(0, Math.min(255, g));
      b = Math.max(0, Math.min(255, b));

      // --- 3. 3D LUT ---
      
      const rPos = r * scale;
      const gPos = g * scale;
      const bPos = b * scale;

      const r0 = Math.floor(rPos);
      const g0 = Math.floor(gPos);
      const b0 = Math.floor(bPos);
      
      const r1 = Math.min(LUT_MAX, r0 + 1);
      const g1 = Math.min(LUT_MAX, g0 + 1);
      const b1 = Math.min(LUT_MAX, b0 + 1);

      const dr = rPos - r0;
      const dg = gPos - g0;
      const db = bPos - b0;

      const getV = (ri: number, gi: number, bi: number) => {
          const idx = (ri + gi * LUT_SIZE + bi * LUT_SIZE_SQ) * 3;
          return { r: lutData[idx], g: lutData[idx + 1], b: lutData[idx + 2] };
      };

      const c000 = getV(r0, g0, b0);
      const c100 = getV(r1, g0, b0);
      const c010 = getV(r0, g1, b0);
      const c110 = getV(r1, g1, b0);
      const c001 = getV(r0, g0, b1);
      const c101 = getV(r1, g0, b1);
      const c011 = getV(r0, g1, b1);
      const c111 = getV(r1, g1, b1);

      const c00 = { r: lerp(c000.r, c100.r, dr), g: lerp(c000.g, c100.g, dr), b: lerp(c000.b, c100.b, dr) };
      const c10 = { r: lerp(c010.r, c110.r, dr), g: lerp(c010.g, c110.g, dr), b: lerp(c010.b, c110.b, dr) };
      const c01 = { r: lerp(c001.r, c101.r, dr), g: lerp(c001.g, c101.g, dr), b: lerp(c001.b, c101.b, dr) };
      const c11 = { r: lerp(c011.r, c111.r, dr), g: lerp(c011.g, c111.g, dr), b: lerp(c011.b, c111.b, dr) };

      const c0 = { r: lerp(c00.r, c10.r, dg), g: lerp(c00.g, c10.g, dg), b: lerp(c00.b, c10.b, dg) };
      const c1 = { r: lerp(c01.r, c11.r, dg), g: lerp(c01.g, c11.g, dg), b: lerp(c01.b, c11.b, dg) };

      let lutR = lerp(c0.r, c1.r, db);
      let lutG = lerp(c0.g, c1.g, db);
      let lutB = lerp(c0.b, c1.b, db);

      if (intensity !== 1) {
        lutR = lerp(r, lutR, intensity);
        lutG = lerp(g, lutG, intensity);
        lutB = lerp(b, lutB, intensity);
      }

      // --- 4. Grain & Texture ---
      if (hasGrain) {
        const l = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
        const grainMask = 1.0 - Math.pow(2 * l - 1, 4); 
        const noise = (random() - 0.5) * 2; 
        const grainVal = noise * grainAmount * grainMask;
        lutR += grainVal; lutG += grainVal; lutB += grainVal;
      }

      if (vignetteStr > 0) {
        const dx = x - centerX;
        const dy = y - centerY;
        const distSq = dx * dx + dy * dy;
        const vFactor = Math.sqrt(distSq) / maxDist;
        const darkening = vFactor * vFactor * vFactor * vignetteStr * 255;
        lutR -= darkening; lutG -= darkening; lutB -= darkening;
      }

      // Dithering
      const dither = (random() - 0.5);
      lutR += dither; lutG += dither; lutB += dither;

      lutR = Math.max(0, Math.min(255, lutR));
      lutG = Math.max(0, Math.min(255, lutG));
      lutB = Math.max(0, Math.min(255, lutB));

      outData[i] = lutR;
      outData[i + 1] = lutG;
      outData[i + 2] = lutB;
      outData[i + 3] = a;

      histR[lutR | 0]++;
      histG[lutG | 0]++;
      histB[lutB | 0]++;
    }
  }
  
  // --- 5. Post-Pixel Effects (Sharpening) ---
  if (adjustments.sharpening > 0) {
      applySharpen(output, adjustments.sharpening);
      // Histogram needs re-calc if sharpening changes values significantly, 
      // but for perf we skip re-calc of histogram after sharpening. 
      // Sharpening affects local contrast mostly.
  }

  return { 
    imageData: output, 
    histogram: { r: histR, g: histG, b: histB } 
  };
};
