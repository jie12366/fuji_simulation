
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Controls } from './components/Controls';
import { CanvasView } from './components/CanvasView';
import { Adjustments, FilmSimulation, LUTData } from './types';
import { generateFilmStyleLUT } from './services/lutGenerator';
import { applyLUT } from './services/imageProcessor';

const App: React.FC = () => {
  // --- State ---
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
  const [currentFilm, setCurrentFilm] = useState<FilmSimulation>(FilmSimulation.Provia);
  const [intensity, setIntensity] = useState<number>(1.0);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [adjustments, setAdjustments] = useState<Adjustments>({
    brightness: 0,
    contrast: 0,
    saturation: 0,
    highlights: 0,
    shadows: 0
  });

  // --- Refs ---
  const originalCanvasRef = useRef<HTMLCanvasElement>(null);
  const processedCanvasRef = useRef<HTMLCanvasElement>(null);
  
  // Cache the LUT data so we don't regenerate it unnecessarily on slider moves (except film change)
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
          // Reset adjustments on new image
          setAdjustments({
            brightness: 0, contrast: 0, saturation: 0, highlights: 0, shadows: 0
          });
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAdjustmentChange = (key: keyof Adjustments, val: number) => {
    setAdjustments(prev => ({ ...prev, [key]: val }));
  };

  const handleFilmChange = (film: FilmSimulation) => {
    setCurrentFilm(film);
  };

  // --- Processing Engine ---

  // 1. Regenerate LUT when film type changes
  useEffect(() => {
    setIsProcessing(true);
    // Use timeout to allow UI to update to "Processing" state before heavy calculation
    const timer = setTimeout(() => {
        currentLUTData.current = generateFilmStyleLUT(currentFilm);
        triggerProcessing();
    }, 10);
    return () => clearTimeout(timer);
  }, [currentFilm]);

  // 2. Main Processing Trigger
  const triggerProcessing = useCallback(() => {
    if (!originalImage || !originalCanvasRef.current || !processedCanvasRef.current || !currentLUTData.current) {
        setIsProcessing(false);
        return;
    }

    const origCtx = originalCanvasRef.current.getContext('2d');
    const procCtx = processedCanvasRef.current.getContext('2d');
    
    if (!origCtx || !procCtx) return;

    // Get original pixels
    const width = originalCanvasRef.current.width;
    const height = originalCanvasRef.current.height;
    
    // Safety check for zero size
    if (width === 0 || height === 0) return;

    const pixelData = origCtx.getImageData(0, 0, width, height);

    // Apply LUT Engine
    const processedData = applyLUT(
        pixelData, 
        currentLUTData.current, 
        adjustments, 
        intensity
    );

    // Update canvas
    processedCanvasRef.current.width = width;
    processedCanvasRef.current.height = height;
    procCtx.putImageData(processedData, 0, 0);
    
    setIsProcessing(false);
  }, [originalImage, adjustments, intensity]);

  // Trigger processing when adjustments or intensity change
  // We debounce slightly to avoid stuttering while dragging sliders
  useEffect(() => {
    if (!currentLUTData.current) {
         currentLUTData.current = generateFilmStyleLUT(currentFilm);
    }
    const timer = setTimeout(() => {
        triggerProcessing();
    }, 50); // 50ms debounce
    return () => clearTimeout(timer);
  }, [adjustments, intensity, triggerProcessing]);


  const handleDownload = () => {
    if (processedCanvasRef.current) {
      const link = document.createElement('a');
      
      // Sanitized filename from enum, removing "/" and chinese chars roughly for file system safety
      // Example: "PROVIA / 标准" -> "provia"
      // We grab the first part before "/"
      const rawName = currentFilm.split('/')[0] || 'photo';
      const safeName = rawName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

      link.download = `fujisim_${safeName}_${Date.now()}.png`;
      link.href = processedCanvasRef.current.toDataURL('image/png', 1.0);
      link.click();
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-screen w-screen bg-fuji-900 text-gray-100 font-sans overflow-hidden">
      <Controls 
        currentFilm={currentFilm}
        onFilmChange={handleFilmChange}
        adjustments={adjustments}
        onAdjustmentChange={handleAdjustmentChange}
        filterIntensity={intensity}
        onIntensityChange={setIntensity}
        onUpload={handleUpload}
        onDownload={handleDownload}
        isProcessing={isProcessing}
      />
      
      <CanvasView 
        originalImage={originalImage}
        originalCanvasRef={originalCanvasRef}
        processedCanvasRef={processedCanvasRef}
      />
    </div>
  );
};

export default App;
