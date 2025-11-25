
export enum FilmSimulation {
  Provia = 'PROVIA / 标准模式',
  Velvia = 'Velvia / 鲜艳模式',
  Astia = 'ASTIA / 柔和模式',
  ClassicChrome = 'CLASSIC CHROME / 经典正片',
  RealaAce = 'REALA ACE / 真实负片',
  ClassicNeg = 'Classic Neg. / 经典负片',
  NostalgicNeg = 'Nostalgic Neg. / 怀旧负片',
  Eterna = 'ETERNA / 电影模式',
  Acros = 'ACROS / 黑白',
  AcrosYe = 'ACROS + 黄滤镜 (强反差)',
  AcrosR = 'ACROS + 红滤镜 (风景)',
  AcrosG = 'ACROS + 绿滤镜 (人像)',
  Sepia = 'Sepia / 怀旧棕褐'
}

export interface HSLChannel {
  h: number; // Hue shift (-30 to 30 degrees)
  s: number; // Saturation (-100 to 100)
  l: number; // Luminance (-100 to 100)
}

export interface HSLAdjustments {
  red: HSLChannel;
  yellow: HSLChannel;
  green: HSLChannel;
  cyan: HSLChannel;
  blue: HSLChannel;
  magenta: HSLChannel;
}

export interface ColorGrade {
  h: number; // 0 - 360
  s: number; // 0 - 100
}

export interface GradingAdjustments {
  shadows: ColorGrade;
  midtones: ColorGrade;
  highlights: ColorGrade;
}

export interface Adjustments {
  // Basic Tone
  brightness: number; // -100 to 100
  contrast: number;   // -100 to 100
  saturation: number; // -100 to 100
  highlights: number; // -100 to 100
  shadows: number;    // -100 to 100
  
  // White Balance
  whiteBalance: {
    temp: number; // -50 to 50 (Blue <-> Amber)
    tint: number; // -50 to 50 (Green <-> Magenta)
  };

  // Color Grading (Split Toning)
  grading: GradingAdjustments;

  // Texture & Detail
  grainAmount: number; // 0 to 100
  grainSize: number;   // 1 to 5 (Roughness)
  vignette: number;    // 0 to 100
  sharpening: number;  // 0 to 100 (Unsharp Mask)
  
  // Optical Effects
  halation: number;    // 0 to 100 (Bloom/Glow strength)
  
  // Advanced Color
  hsl: HSLAdjustments;
}

export interface ProcessingState {
  isProcessing: boolean;
  filterIntensity: number; // 0 to 1
}

// Histogram Data: 256 bins for R, G, B
export interface HistogramData {
  r: number[];
  g: number[];
  b: number[];
}

// Represents a flattened 3D LUT (Look Up Table)
// Size 32x32x32 = 32768 entries, each entry has R, G, B
export type LUTData = Uint8Array;
