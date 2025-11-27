
import { Adjustments, LUTContainer, HistogramData, HSLAdjustments, HSLChannel, MaskLayer } from '../types';

const mulberry32 = (a: number) => {
    return () => {
      let t = a += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
}

// Overlay Blend Mode Helper
const overlayBlend = (base: number, blend: number): number => {
    return (base < 0.5) 
        ? (2.0 * base * blend) 
        : (1.0 - 2.0 * (1.0 - base) * (1.0 - blend));
};

// Helper: Get Rec.709 Luma
const getLuma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// --- Combined Texture Pass (Smart Sharpen -> Grain) ---
export const applyTexture = (imageData: ImageData, adjustments: Adjustments) => {
    const amount = adjustments.sharpening;
    const grainAmount = adjustments.grainAmount / 100; // Normalized 0-1
    const grainSize = Math.max(1, adjustments.grainSize);
    const hasGrain = grainAmount > 0;
    const hasSharpen = amount > 0;

    if (!hasGrain && !hasSharpen) return;

    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const random = mulberry32(1337);

    let src: Uint8ClampedArray | null = null;
    if (hasSharpen) src = new Uint8ClampedArray(data);

    const sharpStrength = (amount / 100) * 1.5;
    const noiseThreshold = 6; 
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            let r = data[idx], g = data[idx + 1], b = data[idx + 2];

            if (hasSharpen && src) {
                if (x > 0 && x < width - 1 && y > 0 && y < height - 1) {
                    const iU = ((y - 1) * width + x) * 4;
                    const iD = ((y + 1) * width + x) * 4;
                    const iL = (y * width + (x - 1)) * 4;
                    const iR = (y * width + (x + 1)) * 4;

                    const lumaC = getLuma(src[idx], src[idx+1], src[idx+2]);
                    const lU = getLuma(src[iU], src[iU+1], src[iU+2]);
                    const lD = getLuma(src[iD], src[iD+1], src[iD+2]);
                    const lL = getLuma(src[iL], src[iL+1], src[iL+2]);
                    const lR = getLuma(src[iR], src[iR+1], src[iR+2]);
                    
                    const lumaAvg = (lU + lD + lL + lR) * 0.25;
                    const detail = lumaC - lumaAvg;

                    if (Math.abs(detail) > noiseThreshold) {
                        let protection = 1.0;
                        if (lumaC < 40) protection = Math.max(0, lumaC / 40);
                        const amount = detail * sharpStrength * protection;
                        r = Math.min(255, Math.max(0, r + amount));
                        g = Math.min(255, Math.max(0, g + amount));
                        b = Math.min(255, Math.max(0, b + amount));
                    }
                }
            }

            if (hasGrain) {
                let noise = random(); 
                const luma = getLuma(r, g, b) / 255;
                const filmGrainCurve = Math.max(0.2, 1.0 - luma * luma); 
                const strength = grainAmount * filmGrainCurve * 0.4; 
                const noiseVal = 0.5 + (noise - 0.5) * strength * 2.0;
                
                r = overlayBlend(r / 255, noiseVal) * 255;
                g = overlayBlend(g / 255, noiseVal) * 255;
                b = overlayBlend(b / 255, noiseVal) * 255;
            }

            data[idx] = r; data[idx + 1] = g; data[idx + 2] = b;
        }
    }
};

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

// --- LOCAL ADJUSTMENT HELPER ---
const applyLocalAdj = (r: number, g: number, b: number, adj: any): [number, number, number] => {
    let nr = r, ng = g, nb = b;

    // 1. Exposure
    if (adj.exposure !== 0) {
        const factor = Math.pow(2, adj.exposure / 33); // Soft exposure curve
        nr *= factor; ng *= factor; nb *= factor;
    }

    // 2. Contrast
    if (adj.contrast !== 0) {
        const factor = (259 * (adj.contrast + 255)) / (255 * (259 - adj.contrast));
        nr = factor * (nr - 128) + 128;
        ng = factor * (ng - 128) + 128;
        nb = factor * (nb - 128) + 128;
    }

    // 3. Saturation
    if (adj.saturation !== 0) {
        const luma = 0.299 * nr + 0.587 * ng + 0.114 * nb;
        const sFactor = 1 + (adj.saturation / 100);
        nr = luma + (nr - luma) * sFactor;
        ng = luma + (ng - luma) * sFactor;
        nb = luma + (nb - luma) * sFactor;
    }

    // 4. Temp/Tint (Simplified)
    if (adj.temperature !== 0 || adj.tint !== 0) {
        const t = adj.temperature / 100;
        const tn = adj.tint / 100;
        nr *= (1 + t);
        nb *= (1 - t);
        ng *= (1 - tn);
    }

    return [Math.max(0, Math.min(255, nr)), Math.max(0, Math.min(255, ng)), Math.max(0, Math.min(255, nb))];
};

export const applyLUT = (
  pixelData: ImageData, 
  lutContainer: LUTContainer, 
  adjustments: Adjustments,
  intensity: number,
  masks: MaskLayer[] = [] // Add masks support
): { imageData: ImageData, histogram: HistogramData } => {
  const width = pixelData.width;
  const height = pixelData.height;
  const data = pixelData.data; 
  const output = new ImageData(new Uint8ClampedArray(data), width, height);
  const outData = output.data;

  const histR = new Array(256).fill(0);
  const histG = new Array(256).fill(0);
  const histB = new Array(256).fill(0);

  const lutSize = lutContainer.size;
  const lutData = lutContainer.data;
  const lutSizeSq = lutSize * lutSize;
  const lutMax = lutSize - 1;
  const scale = lutMax / 255;

  const brightness = adjustments.brightness;
  const contrastFactor = (259 * (adjustments.contrast + 255)) / (255 * (259 - adjustments.contrast));
  const saturationFactor = 1 + (adjustments.saturation / 100);
  const shadowLift = adjustments.shadows * 0.5;
  const highlightDrop = adjustments.highlights * 0.5;
  const vignetteStr = adjustments.vignette / 100;
  const centerX = width / 2; const centerY = height / 2;
  const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);
  const random = mulberry32(1337);
  const hasHSL = Object.values(adjustments.hsl).some(c => c.h !== 0 || c.s !== 0 || c.l !== 0);
  const hslCache = [0,0,0], rgbCache = [0,0,0];

  // Filter active masks to avoid iteration overhead
  const activeMasks = masks.filter(m => m.visible && m.data && m.opacity > 0);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const pixelIndex = y * width + x;

      let r = data[i], g = data[i + 1], b = data[i + 2]; const a = data[i + 3];

      // 1. Global HSL
      if (hasHSL) {
        const newRgb = applyHSL(r, g, b, adjustments.hsl, hslCache, rgbCache);
        r = newRgb[0]; g = newRgb[1]; b = newRgb[2];
      }

      // 2. Global Tone
      if (brightness !== 0) { r += brightness; g += brightness; b += brightness; }
      if (contrastFactor !== 1) {
        r = contrastFactor * (r - 128) + 128;
        g = contrastFactor * (g - 128) + 128;
        b = contrastFactor * (b - 128) + 128;
      }
      r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));

      let luma = 0.299 * r + 0.587 * g + 0.114 * b;
      if (saturationFactor !== 1) {
        r = luma + (r - luma) * saturationFactor;
        g = luma + (g - luma) * saturationFactor;
        b = luma + (b - luma) * saturationFactor;
      }
      if (shadowLift !== 0) { const lift = Math.max(0, 1 - (luma / 255)) * shadowLift; r += lift; g += lift; b += lift; }
      if (highlightDrop !== 0) { const drop = Math.max(0, (luma - 128) / 128) * highlightDrop; r += drop; g += drop; b += drop; }
      
      r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));

      // 3. LUT Lookup
      const rPos = r * scale, gPos = g * scale, bPos = b * scale;
      const r0 = Math.floor(rPos), g0 = Math.floor(gPos), b0 = Math.floor(bPos);
      const r1 = Math.min(lutMax, r0 + 1), g1 = Math.min(lutMax, g0 + 1), b1 = Math.min(lutMax, b0 + 1);
      const dr = rPos - r0, dg = gPos - g0, db = bPos - b0;

      const getV = (ri: number, gi: number, bi: number) => {
          const idxCorrect = (ri + gi * lutSize + bi * lutSizeSq) * 3;
          return { r: lutData[idxCorrect], g: lutData[idxCorrect + 1], b: lutData[idxCorrect + 2] };
      };

      const c000 = getV(r0, g0, b0); const c100 = getV(r1, g0, b0);
      const c010 = getV(r0, g1, b0); const c110 = getV(r1, g1, b0);
      const c001 = getV(r0, g0, b1); const c101 = getV(r1, g0, b1);
      const c011 = getV(r0, g1, b1); const c111 = getV(r1, g1, b1);

      const lerpColor = (c1: any, c2: any, t: number) => ({
          r: lerp(c1.r, c2.r, t), g: lerp(c1.g, c2.g, t), b: lerp(c1.b, c2.b, t)
      });
      const c00 = lerpColor(c000, c100, dr); const c10 = lerpColor(c010, c110, dr);
      const c01 = lerpColor(c001, c101, dr); const c11 = lerpColor(c011, c111, dr);
      const c0 = lerpColor(c00, c10, dg); const c1 = lerpColor(c01, c11, dg);
      let {r: lr, g: lg, b: lb} = lerpColor(c0, c1, db);

      if (intensity !== 1) {
        lr = lerp(r, lr, intensity); lg = lerp(g, lg, intensity); lb = lerp(b, lb, intensity);
      }

      // 4. LOCAL ADJUSTMENTS (Masks)
      // Iterate active masks and blend adjustments
      for (const mask of activeMasks) {
          if (!mask.data) continue;
          const alpha = mask.data[pixelIndex]; // 0-255
          if (alpha > 0) {
              const weight = (alpha / 255) * mask.opacity;
              // Calculate adjusted color
              const [mr, mg, mb] = applyLocalAdj(lr, lg, lb, mask.adjustments);
              // Blend based on weight
              lr = lerp(lr, mr, weight);
              lg = lerp(lg, mg, weight);
              lb = lerp(lb, mb, weight);
          }
      }

      // 5. Vignette & Dither
      if (vignetteStr > 0) {
        const dx = x - centerX, dy = y - centerY;
        const vFactor = Math.sqrt(dx * dx + dy * dy) / maxDist;
        const darkening = vFactor * vFactor * vFactor * vignetteStr * 255;
        lr -= darkening; lg -= darkening; lb -= darkening;
      }
      const dither = (random() - 0.5);
      lr += dither; lg += dither; lb += dither;

      lr = Math.max(0, Math.min(255, lr)); lg = Math.max(0, Math.min(255, lg)); lb = Math.max(0, Math.min(255, lb));

      outData[i] = lr; outData[i + 1] = lg; outData[i + 2] = lb; outData[i + 3] = a;

      histR[lr | 0]++; histG[lg | 0]++; histB[lb | 0]++;
    }
  }

  applyTexture(output, adjustments);
  return { imageData: output, histogram: { r: histR, g: histG, b: histB } };
};
