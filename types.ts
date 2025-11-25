
export enum FilmSimulation {
  Provia = 'PROVIA / 标准',
  Velvia = 'Velvia / 鲜艳',
  Astia = 'ASTIA / 柔和',
  ClassicChrome = 'CLASSIC CHROME',
  RealaAce = 'REALA ACE',
  ClassicNeg = '经典 Neg.',
  NostalgicNeg = 'NOSTALGIC Neg.',
  Eterna = 'ETERNA / 影院',
  Acros = 'ACROS',
  AcrosYe = 'ACROS + 黄滤镜',
  AcrosR = 'ACROS + 红滤镜',
  AcrosG = 'ACROS + 绿滤镜',
  Sepia = '棕褐色'
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

export interface Adjustments {
  brightness: number; // -100 to 100
  contrast: number;   // -100 to 100
  saturation: number; // -100 to 100
  highlights: number; // -100 to 100
  shadows: number;    // -100 to 100
  
  // Texture
  grainAmount: number; // 0 to 100
  grainSize: number;   // 1 to 5 (Roughness)
  vignette: number;    // 0 to 100
  
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
