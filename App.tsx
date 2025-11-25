
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Controls } from './components/Controls';
import { CanvasView } from './components/CanvasView';
import { Adjustments, FilmSimulation, LUTData, HistogramData, HSLAdjustments, GradingAdjustments } from './types';
import { generateFilmStyleLUT } from './services/lutGenerator';
import { applyLUT } from './services/imageProcessor';
import { analyzeImage, prepareImageForAI } from './services/aiService';
import { loadDNG } from './services/dngLoader';

const defaultHSL: HSLAdjustments = {
  red: { h: 0, s: 0, l: 0 },
  yellow: { h: 0, s: 0, l: 0 },
  green: { h: 0, s: 0, l: 0 },
  cyan: { h: 0, s: 0, l: 0 },
  blue: { h: 0, s: 0, l: 0 },
  magenta: { h: 0, s: 0, l: 0 },
};

const defaultGrading: GradingAdjustments = {
  shadows: { h: 0, s: 0 },
  midtones: { h: 0, s: 0 },
  highlights: { h: 0, s: 0 },
};

const defaultWB = { temp: 0, tint: 0 };

const findMatchingFilm = (aiString: string): FilmSimulation | null => {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const target = normalize(aiString);
  const values = Object.values(FilmSimulation);
  for (const v of values) {
      if (normalize(v).includes(target) || target.includes(normalize(v.split('/')[0]))) return v;
  }
  if (target.includes('chrome')) return FilmSimulation.ClassicChrome;
  if (target.includes('velvia')) return FilmSimulation.Velvia;
  if (target.includes('provia')) return FilmSimulation.Provia;
  if (target.includes('astia')) return FilmSimulation.Astia;
  if (target.includes('acros')) return FilmSimulation.Acros;
  if (target.includes('nostalgic')) return FilmSimulation.NostalgicNeg;
  if (target.includes('classicneg')) return FilmSimulation.ClassicNeg;
  if (target.includes('reala')) return FilmSimulation.RealaAce;
  if (target.includes('eterna')) return FilmSimulation.Eterna;
  return null;
};

const App: React.FC = () => {
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
  const [currentFilm, setCurrentFilm] = useState<FilmSimulation>(FilmSimulation.Provia);
  const [intensity, setIntensity] = useState<number>(1.0);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isLoadingFile, setIsLoadingFile] = useState<boolean>(false);
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
    sharpening: 0,
    whiteBalance: { ...defaultWB },
    grading: { ...defaultGrading },
    hsl: { ...defaultHSL }
  });

  const originalCanvasRef = useRef<HTMLCanvasElement>(null);
  const processedCanvasRef = useRef<HTMLCanvasElement>(null);
  const currentLUTData = useRef<LUTData | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const name = file.name.toLowerCase();
      const ext = name.split('.').pop();
      setIsLoadingFile(true);
      try {
        let img: HTMLImageElement;
        console.log(`Starting upload: ${name}`);
        const rawExtensions = ['dng', 'tiff', 'tif', 'nef', 'arw', 'cr2', 'orf', 'rw2', 'raf', 'srw', 'pef'];
        if (ext && rawExtensions.includes(ext)) {
            img = await loadDNG(file);
        } else {
            img = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const i = new Image();
                    i.onload = () => resolve(i);
                    i.onerror = reject;
                    i.src = event.target?.result as string;
                };
                reader.readAsDataURL(file);
            });
        }
        setOriginalImage(img);
        setHistogramData(null);
        setAiReasoning(null);
      } catch (err) {
          console.error("Upload failed:", err);
          alert(`Failed to load image.\nError: ${(err as Error).message}`);
      } finally {
          setIsLoadingFile(false);
      }
    }
  };

  const handleAIAutoAdjust = async (hint: string = '') => {
    if (!originalImage) return;
    try {
      setIsAIAnalyzing(true);
      setAiReasoning(null);
      const base64 = await prepareImageForAI(originalImage);
      const result = await analyzeImage(base64, hint);
      const matchedFilm = findMatchingFilm(result.recommendedFilm);
      if (matchedFilm) setCurrentFilm(matchedFilm);
      
      // Merge AI results with defaults to ensure safety
      setAdjustments(prev => ({
        ...prev,
        ...result.adjustments,
        // Safely merge nested objects
        hsl: result.adjustments.hsl ? { ...defaultHSL, ...result.adjustments.hsl } : prev.hsl,
        whiteBalance: result.adjustments.whiteBalance ? { ...defaultWB, ...result.adjustments.whiteBalance } : prev.whiteBalance,
        grading: result.adjustments.grading ? {
          shadows: { ...defaultGrading.shadows, ...result.adjustments.grading.shadows },
          midtones: { ...defaultGrading.midtones, ...result.adjustments.grading.midtones },
          highlights: { ...defaultGrading.highlights, ...result.adjustments.grading.highlights }
        } : prev.grading,
        sharpening: result.adjustments.sharpening ?? prev.sharpening
      }));

      setAiReasoning(result.reasoning);
    } catch (error) {
      alert("AI Analysis Failed. Please check your network.");
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
      hsl: { ...prev.hsl, [color]: { ...prev.hsl[color], [param]: val } }
    }));
  };

  const handleWBChange = (param: 'temp' | 'tint', val: number) => {
    setAdjustments(prev => ({
      ...prev,
      whiteBalance: { ...prev.whiteBalance, [param]: val }
    }));
  };

  const handleGradingChange = (region: keyof GradingAdjustments, param: 'h' | 's', val: number) => {
    setAdjustments(prev => ({
      ...prev,
      grading: { ...prev.grading, [region]: { ...prev.grading[region], [param]: val } }
    }));
  };

  const handleFilmChange = (film: FilmSimulation) => setCurrentFilm(film);
  const handleIntensityChange = (val: number) => setIntensity(val);

  const handleDownload = () => {
    const canvas = processedCanvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    const filename = `fujisim-ultra-${Date.now()}.jpg`;
    link.download = filename;
    link.href = canvas.toDataURL('image/jpeg', 0.90);
    link.click();
  };

  useEffect(() => {
    setIsProcessing(true);
    const timer = setTimeout(() => {
        // Pass WB and Grading into LUT generator
        currentLUTData.current = generateFilmStyleLUT(
          currentFilm, 
          adjustments.whiteBalance, 
          adjustments.grading
        );
        triggerProcessing();
    }, 10);
    return () => clearTimeout(timer);
  }, [currentFilm, adjustments.whiteBalance, adjustments.grading]); // Regenerate LUT on film, WB, or Grading change

  useEffect(() => {
    const timer = setTimeout(() => {
        triggerProcessing();
    }, 15);
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

    const pixelData = origCtx.getImageData(0, 0, width, height);
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
    
    // Post-Process Effects
    if (adjustments.halation > 0) {
        const halationStr = adjustments.halation / 100;
        const scale = 0.25; 
        const glowCanvas = document.createElement('canvas');
        glowCanvas.width = width * scale;
        glowCanvas.height = height * scale;
        const glowCtx = glowCanvas.getContext('2d');
        
        if (glowCtx) {
            glowCtx.filter = 'contrast(200%) brightness(80%) grayscale(100%)';
            glowCtx.drawImage(processedCanvasRef.current, 0, 0, glowCanvas.width, glowCanvas.height);
            procCtx.save();
            procCtx.globalCompositeOperation = 'screen';
            const blurRadius = Math.max(2, width * 0.02);
            procCtx.filter = `blur(${blurRadius}px) opacity(${halationStr})`;
            procCtx.drawImage(glowCanvas, 0, 0, width, height);
            procCtx.restore();
        }
    }

    setIsProcessing(false);
  }, [adjustments, intensity, originalImage, currentFilm]);

  return (
    <div className="flex flex-col lg:flex-row h-screen w-full bg-[#0a0a0a] text-gray-200 font-sans overflow-hidden">
      {isLoadingFile && (
          <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center backdrop-blur-sm">
              <div className="text-center">
                   <svg className="animate-spin h-10 w-10 text-fuji-accent mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                   <p className="text-white font-bold tracking-wider">正在解析 RAW 数据...</p>
              </div>
          </div>
      )}
      <CanvasView originalImage={originalImage} originalCanvasRef={originalCanvasRef} processedCanvasRef={processedCanvasRef} />
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
      <Controls 
        currentFilm={currentFilm}
        onFilmChange={handleFilmChange}
        adjustments={adjustments}
        onAdjustmentChange={handleAdjustmentChange}
        onHSLChange={handleHSLChange}
        onWBChange={handleWBChange}
        onGradingChange={handleGradingChange}
        filterIntensity={intensity}
        onIntensityChange={handleIntensityChange}
        onUpload={handleUpload}
        onDownload={handleDownload}
        isProcessing={isProcessing}
        histogramData={histogramData}
        isAIAnalyzing={isAIAnalyzing}
        onAIAuto={handleAIAutoAdjust}
      />
      <canvas ref={originalCanvasRef} className="hidden" />
    </div>
  );
};

export default App;
