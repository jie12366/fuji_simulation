
import { Adjustments, LUTData, HistogramData, HSLAdjustments, HSLChannel } from '../types';

const LUT_SIZE = 32;
const LUT_SIZE_SQ = LUT_SIZE * LUT_SIZE;

// Fast pseudo-random generator
const mulberry32 = (a: number) => {
    return () => {
      let t = a += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
}

// RGB <-> HSL Conversions
// Optimized for performance inside loops
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

// Determine weight of a hue against a target center hue
// range is how wide the influence is (degrees)
function getHueWeight(hue: number, target: number, range: number = 30): number {
  let diff = Math.abs(hue - target);
  if (diff > 180) diff = 360 - diff;
  if (diff > range) return 0;
  // Smooth falloff
  return Math.pow(Math.cos((diff / range) * (Math.PI / 2)), 2);
}

function applyHSL(r: number, g: number, b: number, hslAdj: HSLAdjustments, hslCache: number[], rgbCache: number[]): [number, number, number] {
  // 1. RGB -> HSL
  rgbToHsl(r, g, b, hslCache);
  let [h, s, l] = hslCache;

  // 2. Calculate adjustments based on Hue
  // Centers: Red=0/360, Yellow=60, Green=120, Cyan=180, Blue=240, Magenta=300
  
  // We sum up the deltas
  let dH = 0, dS = 0, dL = 0;
  let totalWeight = 0;

  const processChannel = (targetHue: number, channel: HSLChannel) => {
    if (channel.h === 0 && channel.s === 0 && channel.l === 0) return;
    const w = getHueWeight(h, targetHue, 45); // 45 degree overlap
    if (w > 0) {
      dH += channel.h * w;
      dS += (channel.s / 100) * w; // Map -100..100 to -1..1
      dL += (channel.l / 100) * w;
      totalWeight += w;
    }
  };

  processChannel(0, hslAdj.red);
  processChannel(360, hslAdj.red); // Wrap around for red
  processChannel(60, hslAdj.yellow);
  processChannel(120, hslAdj.green);
  processChannel(180, hslAdj.cyan);
  processChannel(240, hslAdj.blue);
  processChannel(300, hslAdj.magenta);

  if (totalWeight > 0) {
    // Apply deltas
    h = (h + dH + 360) % 360;
    s = Math.max(0, Math.min(1, s * (1 + dS))); // Scaling saturation
    // Luminance is additive/subtractive but clamped
    // We use a soft gamma-like shift for luminance to look better
    if (dL !== 0) {
        l = Math.max(0, Math.min(1, l + (dL * 0.5))); 
    }

    // 3. HSL -> RGB
    hslToRgb(h, s, l, rgbCache);
    return [rgbCache[0], rgbCache[1], rgbCache[2]];
  }

  return [r, g, b];
}

// Helper for simple linear interpolation
const lerp = (a: number, b: number, t: number) => a + t * (b - a);

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

  // Histogram buckets
  const histR = new Array(256).fill(0);
  const histG = new Array(256).fill(0);
  const histB = new Array(256).fill(0);

  // Pre-calculate adjustment factors
  const brightness = adjustments.brightness;
  const contrastFactor = (259 * (adjustments.contrast + 255)) / (255 * (259 - adjustments.contrast));
  const saturationFactor = 1 + (adjustments.saturation / 100);
  const shadowLift = adjustments.shadows * 0.5;
  const highlightDrop = adjustments.highlights * 0.5;
  
  // Grain setup
  const grainAmount = adjustments.grainAmount / 3; 
  const hasGrain = grainAmount > 0;
  
  // Vignette setup
  const vignetteStr = adjustments.vignette / 100;
  const centerX = width / 2;
  const centerY = height / 2;
  const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);

  // LUT Scale Factors
  const LUT_MAX = LUT_SIZE - 1;
  const scale = LUT_MAX / 255;

  // Random generator
  const random = mulberry32(1337);

  // Check if HSL is active (optimization)
  const hasHSL = Object.values(adjustments.hsl).some(c => c.h !== 0 || c.s !== 0 || c.l !== 0);
  
  // Reusable Arrays for inner loop to avoid GC
  const hslCache = [0,0,0];
  const rgbCache = [0,0,0];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;

      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];
      const a = data[i + 3];

      // --- 0. Advanced HSL (Before other adjustments for better color targeting) ---
      if (hasHSL) {
        const newRgb = applyHSL(r, g, b, adjustments.hsl, hslCache, rgbCache);
        r = newRgb[0]; g = newRgb[1]; b = newRgb[2];
      }

      // --- 1. Basic Adjustments ---
      
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

      // Clamp
      r = Math.max(0, Math.min(255, r));
      g = Math.max(0, Math.min(255, g));
      b = Math.max(0, Math.min(255, b));

      const luma = 0.299 * r + 0.587 * g + 0.114 * b;

      // Saturation (Global)
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

      // Clamp before LUT
      r = Math.max(0, Math.min(255, r));
      g = Math.max(0, Math.min(255, g));
      b = Math.max(0, Math.min(255, b));

      // --- 2. 3D LUT Lookup with Trilinear Interpolation ---
      
      // Calculate float positions in LUT space
      const rPos = r * scale;
      const gPos = g * scale;
      const bPos = b * scale;

      // Lower indices
      const r0 = Math.floor(rPos);
      const g0 = Math.floor(gPos);
      const b0 = Math.floor(bPos);

      // Upper indices (clamped)
      const r1 = Math.min(LUT_MAX, r0 + 1);
      const g1 = Math.min(LUT_MAX, g0 + 1);
      const b1 = Math.min(LUT_MAX, b0 + 1);

      // Fractional parts (weights for interpolation)
      const dr = rPos - r0;
      const dg = gPos - g0;
      const db = bPos - b0;

      // Pre-calculate index offsets
      const z0_offset = b0 * LUT_SIZE_SQ;
      const z1_offset = b1 * LUT_SIZE_SQ;
      const y0_offset = g0 * LUT_SIZE;
      const y1_offset = g1 * LUT_SIZE;

      // Fetch 8 corners of the cube
      // Format in lutData array is (R, G, B) sequentially. 
      // Array Index = (r + g*WIDTH + b*WIDTH*HEIGHT) * 3
      
      // Helper to get RGB from array at specific indices
      const getC = (ri: number, yOffset: number, zOffset: number) => {
          const idx = (ri + yOffset + zOffset) * 3;
          return { r: lutData[idx], g: lutData[idx + 1], b: lutData[idx + 2] };
      };

      // Corner 000 (x0, y0, z0)
      const c000 = getC(r0, y0_offset, z0_offset);
      const c100 = getC(r1, y0_offset, z0_offset);
      const c010 = getC(r0, y1_offset, z0_offset);
      const c110 = getC(r1, y1_offset, z0_offset);
      const c001 = getC(r0, y0_offset, z1_offset);
      const c101 = getC(r1, y0_offset, z1_offset);
      const c011 = getC(r0, y1_offset, z1_offset);
      const c111 = getC(r1, y1_offset, z1_offset);

      // Interpolate along R (x-axis)
      const c00 = { 
          r: lerp(c000.r, c100.r, dr), 
          g: lerp(c000.g, c100.g, dr), 
          b: lerp(c000.b, c100.b, dr) 
      };
      const c10 = { 
          r: lerp(c010.r, c110.r, dr), 
          g: lerp(c010.g, c110.g, dr), 
          b: lerp(c010.b, c110.b, dr) 
      };
      const c01 = { 
          r: lerp(c001.r, c101.r, dr), 
          g: lerp(c001.g, c101.g, dr), 
          b: lerp(c001.b, c101.b, dr) 
      };
      const c11 = { 
          r: lerp(c011.r, c111.r, dr), 
          g: lerp(c011.g, c111.g, dr), 
          b: lerp(c011.b, c111.b, dr) 
      };

      // Interpolate along G (y-axis)
      const c0 = {
          r: lerp(c00.r, c10.r, dg),
          g: lerp(c00.g, c10.g, dg),
          b: lerp(c00.b, c10.b, dg)
      };
      const c1 = {
          r: lerp(c01.r, c11.r, dg),
          g: lerp(c01.g, c11.g, dg),
          b: lerp(c01.b, c11.b, dg)
      };

      // Interpolate along B (z-axis) - Final Result
      let lutR = lerp(c0.r, c1.r, db);
      let lutG = lerp(c0.g, c1.g, db);
      let lutB = lerp(c0.b, c1.b, db);

      // Intensity Mix
      if (intensity !== 1) {
        lutR = r * (1 - intensity) + lutR * intensity;
        lutG = g * (1 - intensity) + lutG * intensity;
        lutB = b * (1 - intensity) + lutB * intensity;
      }

      // --- 3. Film Grain ---
      if (hasGrain) {
        // Luminance-based grain masking (less grain in pure black/white)
        // Rec.601 luma for speed
        const l = (r * 299 + g * 587 + b * 114) / 1000 / 255;
        // Parabolic curve: 1 at 0.5, 0 at 0 and 1. 
        // 4 * x * (1-x) is standard symmetric parabola.
        const grainMask = 1.0 - Math.pow(2 * l - 1, 4); // Higher power = cleaner highlights/shadows
        
        const noise = (random() - 0.5) * 2;
        const grainVal = noise * grainAmount * grainMask;
        
        lutR += grainVal;
        lutG += grainVal;
        lutB += grainVal;
      }

      // --- 4. Vignette ---
      if (vignetteStr > 0) {
        const dx = x - centerX;
        const dy = y - centerY;
        const distSq = dx * dx + dy * dy; // Use squared distance to avoid sqrt in inner loop if possible, but for smooth vignette sqrt is better
        const dist = Math.sqrt(distSq);
        const vFactor = dist / maxDist;
        // Cubic falloff for smoother vignette
        const darkening = vFactor * vFactor * vFactor * vignetteStr * 255;
        
        lutR = Math.max(0, lutR - darkening);
        lutG = Math.max(0, lutG - darkening);
        lutB = Math.max(0, lutB - darkening);
      }

      // Final Clamp
      lutR = Math.max(0, Math.min(255, lutR));
      lutG = Math.max(0, Math.min(255, lutG));
      lutB = Math.max(0, Math.min(255, lutB));

      outData[i] = lutR;
      outData[i + 1] = lutG;
      outData[i + 2] = lutB;
      outData[i + 3] = a;

      // Collect Histogram Data
      histR[lutR | 0]++;
      histG[lutG | 0]++;
      histB[lutB | 0]++;
    }
  }

  return { 
    imageData: output, 
    histogram: { r: histR, g: histG, b: histB } 
  };
};
