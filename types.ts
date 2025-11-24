
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

export interface Adjustments {
  brightness: number; // -100 to 100
  contrast: number;   // -100 to 100
  saturation: number; // -100 to 100
  highlights: number; // -100 to 100
  shadows: number;    // -100 to 100
}

export interface ProcessingState {
  isProcessing: boolean;
  filterIntensity: number; // 0 to 1
}

// Represents a flattened 3D LUT (Look Up Table)
// Size 32x32x32 = 32768 entries, each entry has R, G, B
export type LUTData = Uint8Array;
