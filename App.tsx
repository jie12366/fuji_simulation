
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Controls } from './components/Controls';
import { CanvasView } from './components/CanvasView';
import { Adjustments, FilmSimulation, LUTData, HistogramData, HSLAdjustments } from './types';
import { generateFilmStyleLUT } from './services/lutGenerator';
import { applyLUT } from './services/imageProcessor';

const defaultHSL: HSLAdjustments = {
  red: { h: 0, s: 0, l: 0 },
  yellow: { h: 0, s: 0, l: 0 },
  green: { h: 0, s: 0, l: 0 },
  cyan: { h: 0, s: 0, l: 0 },
  blue: { h: 0, s: 0, l: 0 },
  magenta: { h: 0, s: 0, l: 0 },
};

const App: React.FC = () => {
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
  const [currentFilm, setCurrentFilm] = useState<FilmSimulation>(FilmSimulation.Provia);
  const [intensity, setIntensity] = useState<number>(1.0);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [histogramData, setHistogramData] = useState<HistogramData | null>(null);
  
  const [adjustments, setAdjustments] = useState<Adjustments>({
    brightness: 0,
    contrast: 0,
    saturation: 0,
    highlights: 0,
    shadows: 0,
    grainAmount: 0,
    grainSize: 2,
    vignette: 0,
    halation: 0,
    hsl: { ...defaultHSL }
  });

  const originalCanvasRef = useRef<HTMLCanvasElement>(null);
  const processedCanvasRef = useRef<HTMLCanvasElement>(null);
  const currentLUTData = useRef<LUTData | null>(null);

  // --- Handlers ---

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          setOriginalImage(img);
          setAdjustments({
            brightness: 0, contrast: 0, saturation: 0, highlights: 0, shadows: 0,
            grainAmount: 0, grainSize: 2, vignette: 0, halation: 0,
            hsl: JSON.parse(JSON.stringify(defaultHSL)) // Deep copy reset
          });
          setHistogramData(null);
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAdjustmentChange = (key: keyof Adjustments, val: number) => {
    setAdjustments(prev => ({ ...prev, [key]: val }));
  };

  const handleHSLChange = (color: keyof HSLAdjustments, param: 'h'|'s'|'l', val: number) => {
    setAdjustments(prev => ({
      ...prev,
      hsl: {
        ...prev.hsl,
        [color]: {
          ...prev.hsl[color],
          [param]: val
        }
      }
    }));
  };

  const handleFilmChange = (film: FilmSimulation) => {
    setCurrentFilm(film);
  };

  // --- Processing Engine ---

  useEffect(() => {
    setIsProcessing(true);
    const timer = setTimeout(() => {
        currentLUTData.current = generateFilmStyleLUT(currentFilm);
        triggerProcessing();
    }, 10);
    return () => clearTimeout(timer);
  }, [currentFilm]);

  const triggerProcessing = useCallback(() => {
    if (!originalImage || !originalCanvasRef.current || !processedCanvasRef.current || !currentLUTData.current) {
        setIsProcessing(false);
        return;
    }

    const origCtx = originalCanvasRef.current.getContext('2d');
    const procCtx = processedCanvasRef.current.getContext('2d');
    if (!origCtx || !procCtx) return;

    const width = originalCanvasRef.current.width;
    const height = originalCanvasRef.current.height;
    if (width === 0 || height === 0) return;

    const pixelData = origCtx.getImageData(0, 0, width, height);

    // 1. Apply Pixel Math (LUT, Color, Grain)
    const { imageData: processedData, histogram } = applyLUT(
        pixelData, 
        currentLUTData.current, 
        adjustments, 
        intensity
    );

    setHistogramData(histogram);
    processedCanvasRef.current.width = width;
    processedCanvasRef.current.height = height;
    procCtx.putImageData(processedData, 0, 0);
    
    // 2. Apply Post-Processing Effects (Halation/Bloom)
    // We do this via Canvas Composition API for performance (GPU accelerated blur)
    if (adjustments.halation > 0) {
        const halationStr = adjustments.halation / 100;
        
        // Create temp canvas for highlight extraction
        const tempCanvas = document.createElement('canvas');
        // Downscale significantly for better blur performance and "bloomy" look
        const scale = 0.25; 
        tempCanvas.width = width * scale;
        tempCanvas.height = height * scale;
        const tCtx = tempCanvas.getContext('2d');
        
        if (tCtx) {
            // Draw current processed image
            tCtx.drawImage(processedCanvasRef.current, 0, 0, tempCanvas.width, tempCanvas.height);
            
            // Thresholding (High pass filter essentially)
            // We use globalCompositeOperation to keep only bright parts? 
            // Hard to do purely