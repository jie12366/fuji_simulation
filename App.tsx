
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Controls } from './components/Controls';
import { CanvasView } from './components/CanvasView';
import { Adjustments, FilmSimulation, LUTData, HistogramData, HSLAdjustments } from './types';
import { generateFilmStyleLUT } from './services/lutGenerator';
import { applyLUT } from './services/imageProcessor';
import { analyzeImage, prepareImageForAI } from './services/aiService';

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
  
  // AI State
  const [isAIAnalyzing, setIsAIAnalyzing] = useState<boolean>(false);
  const [aiReasoning, setAiReasoning] = useState<string | null>(null);

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
          setHistogramData(null);
          setAiReasoning(null);
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAIAutoAdjust = async () => {
    if (!originalImage) return;

    try {
      setIsAIAnalyzing(true);
      setAiReasoning(null);
      
      // 1. Prepare low-res image
      const base64 = await prepareImageForAI(originalImage);
      
      // 2. Call Gemini API
      const result = await analyzeImage(base64);
      
      // 3. Apply settings
      if (result.recommendedFilm) {
        setCurrentFilm(result.recommendedFilm);
      }
      
      // Merge AI adjustments with defaults for missing keys to be safe
      setAdjustments(prev => ({
        ...prev,
        ...result.adjustments,
        // Ensure HSL is deep merged properly or completely replaced
        hsl: result.adjustments.hsl ? { ...defaultHSL, ...result.adjustments.hsl } : prev.hsl
      }));

      setAiReasoning(result.reasoning);

    } catch (error) {
      alert("AI Analysis Failed. Please check your network or API Key configuration.");
      console.error(error);
    } finally {
      setIsAIAnalyzing(false);
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

  const handleIntensityChange = (val: number) => {
    setIntensity(val);
  };

  const handleDownload = () => {
    const canvas = processedCanvasRef.current;
    if (!canvas) return;
    
    // Create a temporary link
    const link = document.createElement('a');
    const filename = `fujisim-${currentFilm.replace(/\s/g, '_')}-${Date.now()}.jpg`;
    link.download = filename;
    link.href = canvas.toDataURL('image/jpeg', 0.90);
    link.click();
  };

  // --- Processing Engine ---

  // Re-generate LUT when film type changes
  useEffect(() => {
    setIsProcessing(true);
    // Use setTimeout to allow UI to update to "Processing" state before heavy calculation
    const timer = setTimeout(() => {
        currentLUTData.current = generateFilmStyleLUT(currentFilm);
        triggerProcessing();
    }, 10);
    return () => clearTimeout(timer);
  }, [currentFilm]);

  // Trigger processing when adjustments change
  // We debounce slightly to avoid stuttering on slider drag
  useEffect(() => {
    const timer = setTimeout(() => {
        triggerProcessing();
    }, 15); // 60fps-ish throttle
    return () => clearTimeout(timer);
  }, [adjustments, intensity, originalImage]);

  const triggerProcessing = useCallback(() => {
    if (!originalImage || !originalCanvasRef.current || !processedCanvasRef.current || !currentLUTData.current) {
        setIsProcessing(false);
        return;
    }

    const origCtx = originalCanvasRef.current.getContext('2d', { willReadFrequently: true });
    const procCtx = processedCanvasRef.current.getContext('2d', { willReadFrequently: true });
    if (!origCtx || !procCtx) {
        setIsProcessing(false);
        return;
    }

    const width = originalCanvasRef.current.width;
    const height = originalCanvasRef.current.height;
    if (width === 0 || height === 0) {
        setIsProcessing(false);
        return;
    }

    // 1. Get Pixels
    const pixelData = origCtx.getImageData(0, 0, width, height);

    // 2. Apply CPU-bound Pixel Math (LUT, HSL, Texture)
    const { imageData: processedData, histogram } = applyLUT(
        pixelData, 
        currentLUTData.current, 
        adjustments, 
        intensity
    );

    setHistogramData(histogram);
    
    // 3. Put pixels back
    processedCanvasRef.current.width = width;
    processedCanvasRef.current.height = height;
    procCtx.putImageData(processedData, 0, 0);
    
    // 4. Post-Processing Effects (Composition based)
    // Halation / Bloom
    if (adjustments.halation > 0) {
        const halationStr = adjustments.halation / 100;
        
        // Create a small temp canvas for the glow map (Downscaling gives smoother blur)
        const scale = 0.25; 
        const glowCanvas = document.createElement('canvas');
        glowCanvas.width = width * scale;
        glowCanvas.height = height * scale;
        const glowCtx = glowCanvas.getContext('2d');
        
        if (glowCtx) {
            // A. High contrast pass to isolate highlights
            // We draw the processed image into small canvas with filters
            glowCtx.filter = 'contrast(200%) brightness(80%) grayscale(100%)';
            glowCtx.drawImage(processedCanvasRef.current, 0, 0, glowCanvas.width, glowCanvas.height);
            
            // B. Draw back onto main canvas with screen mode + blur
            procCtx.save();
            procCtx.globalCompositeOperation = 'screen'; // Screen adds light
            const blurRadius = Math.max(2, width * 0.02); // Dynamic blur radius based on width
            procCtx.filter = `blur(${blurRadius}px) opacity(${halationStr})`;
            
            // Draw the glow
            procCtx.drawImage(glowCanvas, 0, 0, width, height);
            
            procCtx.restore();
        }
    }

    setIsProcessing(false);
  }, [adjustments, intensity, originalImage, currentFilm]); // Deps

  return (
    <div className="flex flex-col lg:flex-row h-screen w-full bg-[#0a0a0a] text-gray-200 font-sans overflow-hidden">
      
      {/* Left: Canvas Viewport */}
      <CanvasView 
        originalImage={originalImage}
        originalCanvasRef={originalCanvasRef}
        processedCanvasRef={processedCanvasRef}
      />
      
      {/* Toast Notification for AI */}
      {aiReasoning && (
        <div className="fixed bottom-6 left-6 z-50 max-w-md bg-gray-900/90 border border-fuji-accent text-gray-200 px-4 py-3 rounded-lg shadow-2xl backdrop-blur animate-fadeIn">
          <div className="flex items-start gap-3">
             <span className="text-xl">✨</span>
             <div>
               <h4 className="font-bold text-fuji-accent text-sm mb-1">AI 调色完成</h4>
               <p className="text-xs leading-relaxed text-gray-300">{aiReasoning}</p>
             </div>
             <button onClick={() => setAiReasoning(null)} className="text-gray-500 hover:text-white ml-auto">✕</button>
          </div>
        </div>
      )}

      {/* Right: Controls Panel */}
      <Controls 
        currentFilm={currentFilm}
        onFilmChange={handleFilmChange}
        adjustments={adjustments}
        onAdjustmentChange={handleAdjustmentChange}
        onHSLChange={handleHSLChange}
        filterIntensity={intensity}
        onIntensityChange={handleIntensityChange}
        onUpload={handleUpload}
        onDownload={handleDownload}
        isProcessing={isProcessing}
        histogramData={histogramData}
        isAIAnalyzing={isAIAnalyzing}
        onAIAuto={handleAIAutoAdjust}
      />

      {/* Hidden Source Canvas for reading data */}
      <canvas ref={originalCanvasRef} className="hidden" />
    </div>
  );
};

export default App;
