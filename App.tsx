
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Controls } from './components/Controls';
import { CanvasView } from './components/CanvasView';
import { BatchModal } from './components/BatchModal';
import { HelpModal } from './components/HelpModal';
import { Adjustments, FilmSimulation, LUTContainer, HistogramData, HSLAdjustments, GradingAdjustments, MaskLayer, BrushSettings, LocalAdjustments } from './types';
import { generateFilmStyleLUT } from './services/lutGenerator';
import { applyLUT } from './services/imageProcessor';
import { analyzeImage, prepareImageForAI } from './services/aiService';
import { loadDNG } from './services/dngLoader';
import { createEmptyMaskData, drawStroke, canvasToMaskData } from './services/maskingService';

const createDefaultAdjustments = (): Adjustments => ({
  brightness: 0, contrast: 0, saturation: 0, highlights: 0, shadows: 0,
  grainAmount: 0, grainSize: 2, vignette: 0, halation: 0, sharpening: 0,
  whiteBalance: { temp: 0, tint: 0 },
  grading: {
    shadows: { h: 0, s: 0 },
    midtones: { h: 0, s: 0 },
    highlights: { h: 0, s: 0 }
  },
  hsl: {
    red: { h: 0, s: 0, l: 0 },
    yellow: { h: 0, s: 0, l: 0 },
    green: { h: 0, s: 0, l: 0 },
    cyan: { h: 0, s: 0, l: 0 },
    blue: { h: 0, s: 0, l: 0 },
    magenta: { h: 0, s: 0, l: 0 },
  }
});

const createDefaultLocalAdjustments = (): LocalAdjustments => ({
    exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, sharpness: 0
});

const App: React.FC = () => {
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
  const [currentFilm, setCurrentFilm] = useState<FilmSimulation>(FilmSimulation.Provia);
  const [intensity, setIntensity] = useState<number>(1.0);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isLoadingFile, setIsLoadingFile] = useState<boolean>(false);
  const [isAIAnalyzing, setIsAIAnalyzing] = useState<boolean>(false);
  const [aiReasoning, setAiReasoning] = useState<string | null>(null);
  const [histogramData, setHistogramData] = useState<HistogramData | null>(null);
  const [suggestedFilename, setSuggestedFilename] = useState<string | null>(null);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [batchStatus, setBatchStatus] = useState({ current: 0, total: 0, filename: '' });
  const [adjustments, setAdjustments] = useState<Adjustments>(createDefaultAdjustments);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  // Masking State
  const [masks, setMasks] = useState<MaskLayer[]>([]);
  const [activeMaskId, setActiveMaskId] = useState<string | null>(null);
  const [brushSettings, setBrushSettings] = useState<BrushSettings>({ size: 50, hardness: 50, opacity: 50, isEraser: false });
  
  // Temporary canvas for drawing mask before committing to Uint8Array
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const originalCanvasRef = useRef<HTMLCanvasElement>(null);
  const processedCanvasRef = useRef<HTMLCanvasElement>(null);
  const currentFinalLUT = useRef<LUTContainer | null>(null);

  const loadGenericImage = async (file: File): Promise<HTMLImageElement> => {
      const name = file.name.toLowerCase();
      const ext = name.split('.').pop();
      const rawExtensions = ['dng', 'tiff', 'tif', 'nef', 'arw', 'cr2', 'orf', 'rw2', 'raf', 'srw', 'pef'];
      if (ext && rawExtensions.includes(ext)) {
          return await loadDNG(file);
      } else {
          return await new Promise((resolve, reject) => {
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
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setIsLoadingFile(true);
      try {
        const img = await loadGenericImage(file);
        setOriginalImage(img);
        setHistogramData(null);
        setAiReasoning(null);
        setSuggestedFilename(null);
        setMasks([]); // Clear masks
        setActiveMaskId(null);
        
        // Init temp mask canvas
        const mc = document.createElement('canvas');
        mc.width = img.width;
        mc.height = img.height;
        maskCanvasRef.current = mc;

      } catch (err) {
          alert(`加载图片失败 (Failed to load image).\nError: ${(err as Error).message}`);
      } finally {
          setIsLoadingFile(false);
      }
    }
  };

  // ... (Batch Upload Omitted for brevity, logic similar to previous but could include mask blending if sophisticated enough, currently keeping batch global only) ...
  const handleBatchUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files;
      if (!fileList || fileList.length === 0) return;
      // Reuse existing batch logic, masks are complex for batch unless copied strictly by relative coordinates.
      // For now, let's keep batch processing using Global adjustments only to ensure stability.
      const files = Array.from(fileList) as File[];
      setIsBatchProcessing(true);
      setBatchStatus({ current: 0, total: files.length, filename: 'Initializing...' });
      try {
        const JSZip = (window as any).JSZip;
        if (!JSZip) throw new Error("JSZip library not loaded");
        const zip = new JSZip();
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            setBatchStatus({ current: i + 1, total: files.length, filename: file.name });
            await new Promise(r => setTimeout(r, 50));
            try {
                const img = await loadGenericImage(file);
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                if (!ctx) continue;
                ctx.drawImage(img, 0, 0);
                const imageData = ctx.getImageData(0, 0, img.width, img.height);
                // Note: Passing empty masks array for batch as coordinate mapping for masks is image-specific
                const { imageData: processed } = applyLUT(imageData, currentFinalLUT.current!, adjustments, intensity, []);
                ctx.putImageData(processed, 0, 0);
                const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));
                if (blob) zip.file(`pg_ultra_${file.name.split('.')[0]}.jpg`, blob);
            } catch(e) { console.error(e); }
        }
        const content = await zip.generateAsync({ type: "blob" });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = `Batch_${Date.now()}.zip`;
        link.click();
      } catch(e) { alert("Batch failed"); } finally { setIsBatchProcessing(false); }
  };

  // Masking Handlers
  const handleAddMask = () => {
      if (!originalImage) return;
      const newMask: MaskLayer = {
          id: Date.now().toString(),
          name: `Mask ${masks.length + 1}`,
          visible: true,
          opacity: 1,
          data: createEmptyMaskData(originalImage.width, originalImage.height),
          adjustments: createDefaultLocalAdjustments()
      };
      setMasks([...masks, newMask]);
      setActiveMaskId(newMask.id);
      
      // Clear temp canvas
      if (maskCanvasRef.current) {
          const ctx = maskCanvasRef.current.getContext('2d');
          ctx?.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
      }
  };

  const handleDeleteMask = (id: string) => {
      setMasks(masks.filter(m => m.id !== id));
      if (activeMaskId === id) setActiveMaskId(null);
  };

  const handleToggleMask = (id: string) => {
      setMasks(masks.map(m => m.id === id ? { ...m, visible: !m.visible } : m));
  };

  const handleSelectMask = (id: string) => {
      setActiveMaskId(id);
      // Re-hydrate mask canvas for editing
      if (maskCanvasRef.current && originalImage) {
          const mask = masks.find(m => m.id === id);
          const ctx = maskCanvasRef.current.getContext('2d');
          if (mask && mask.data && ctx) {
              ctx.clearRect(0, 0, originalImage.width, originalImage.height);
              // Create ImageData from mask alpha
              const idata = ctx.createImageData(originalImage.width, originalImage.height);
              const d = idata.data;
              for(let i=0; i<mask.data.length; i++) {
                  const a = mask.data[i];
                  d[i*4] = 255; d[i*4+1] = 0; d[i*4+2] = 0; d[i*4+3] = a; // Red overlay
              }
              ctx.putImageData(idata, 0, 0);
          }
      }
  };

  const handleLocalAdjChange = (id: string, key: keyof LocalAdjustments, val: number) => {
      setMasks(masks.map(m => m.id === id ? { ...m, adjustments: { ...m.adjustments, [key]: val } } : m));
  };

  const handleBrushStroke = (x: number, y: number, lastX: number, lastY: number) => {
      if (!activeMaskId || !maskCanvasRef.current) return;
      
      const ctx = maskCanvasRef.current.getContext('2d');
      if (!ctx) return;

      // Draw visual stroke on temp canvas (Red overlay style)
      // We keep brush color distinct so user sees where they paint
      const drawSettings = { ...brushSettings };
      // Force visual feedback style
      ctx.globalCompositeOperation = brushSettings.isEraser ? 'destination-out' : 'source-over';
      ctx.strokeStyle = `rgba(255, 0, 0, ${brushSettings.opacity / 100})`; 
      ctx.fillStyle = `rgba(255, 0, 0, ${brushSettings.opacity / 100})`;
      
      drawStroke(ctx, x, y, lastX, lastY, { ...brushSettings, opacity: brushSettings.opacity }); // Use opacity for flow

      // Update Mask Data efficiently
      // We rely on Canvas for the stroke math, then extract back
      // Optimization: Don't extract every frame. Just visually draw on the CanvasView overlay
      // AND this offscreen canvas. 
      // The `masks` state update should happen on MouseUp (commit).
      
      // For realtime visual feedback in CanvasView component, we are modifying the DOM
      // For the actual Mask Data, we will extract it in handleStrokeEnd (triggered by mouse up)
  };

  // Since `CanvasView` calls `onStroke` every move, we need to commit the result eventually.
  // However, `onStroke` in CanvasView is purely for the visual feedback loop?
  // No, we need to update the render.
  // Better approach: 
  // 1. `CanvasView` manages the "Visual" overlay drawing directly.
  // 2. `CanvasView` tells App "I finished a stroke" (MouseUp).
  // 3. App extracts data from `maskCanvasRef` (which mirrors the visual) and updates `masks` state.
  // Wait, CanvasView has its own canvas. We can just use one Shared Canvas reference?
  // Let's assume `CanvasView` handles the UI drawing. We need to sync the data.
  
  // Simplified flow for React perf:
  // The `onStroke` prop in CanvasView will call `handleBrushStroke` which draws to `maskCanvasRef` (offscreen).
  // Triggering a full re-render of the main image on every mouse move is too slow.
  // So: We only re-render the main image when mouse goes UP.
  // During drag, we only see the Red Overlay on top of the old image.
  
  const handleMouseUp = () => {
      // Commit mask
      if (activeMaskId && maskCanvasRef.current) {
          const newData = canvasToMaskData(maskCanvasRef.current);
          setMasks(prev => prev.map(m => m.id === activeMaskId ? { ...m, data: newData } : m));
      }
  };

  // Add mouse up listener globally to catch drag release
  useEffect(() => {
      window.addEventListener('mouseup', handleMouseUp);
      return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [activeMaskId]);


  const handleAIAutoAdjust = async (hint: string = '') => {
    if (!originalImage) return;
    try {
      setIsAIAnalyzing(true);
      setAiReasoning(null);
      const base64 = await prepareImageForAI(originalImage);
      const result = await analyzeImage(base64, hint);
      setCurrentFilm(FilmSimulation.None);
      const defaults = createDefaultAdjustments();
      setAdjustments(prev => ({
        ...prev,
        ...result.adjustments,
        hsl: result.adjustments.hsl ? { ...defaults.hsl, ...result.adjustments.hsl } : prev.hsl,
        whiteBalance: result.adjustments.whiteBalance ? { ...defaults.whiteBalance, ...result.adjustments.whiteBalance } : prev.whiteBalance,
        grading: result.adjustments.grading ? {
          shadows: { ...defaults.grading.shadows, ...result.adjustments.grading.shadows },
          midtones: { ...defaults.grading.midtones, ...result.adjustments.grading.midtones },
          highlights: { ...defaults.grading.highlights, ...result.adjustments.grading.highlights }
        } : prev.grading,
        sharpening: result.adjustments.sharpening ?? prev.sharpening
      }));
      setAiReasoning(result.reasoning);
      if (result.suggestedFilename) setSuggestedFilename(result.suggestedFilename);
    } catch (error) { alert("AI Analysis Failed."); } finally { setIsAIAnalyzing(false); }
  };

  const handleApplyPreset = (name: string, presetAdjustments: Partial<Adjustments>) => {
      const defaults = createDefaultAdjustments();
      setCurrentFilm(FilmSimulation.None);
      setAdjustments(prev => ({
          ...defaults,
          ...presetAdjustments,
          hsl: presetAdjustments.hsl ? { ...defaults.hsl, ...presetAdjustments.hsl } : defaults.hsl,
          whiteBalance: presetAdjustments.whiteBalance ? { ...defaults.whiteBalance, ...presetAdjustments.whiteBalance } : defaults.whiteBalance,
          grading: presetAdjustments.grading ? {
              shadows: { ...defaults.grading.shadows, ...presetAdjustments.grading.shadows },
              midtones: { ...defaults.grading.midtones, ...presetAdjustments.grading.midtones },
              highlights: { ...defaults.grading.highlights, ...presetAdjustments.grading.highlights }
          } : defaults.grading
      }));
      setIntensity(1.0);
  };

  const handleAdjustmentChange = (key: keyof Adjustments, val: number) => setAdjustments(prev => ({ ...prev, [key]: val }));
  const handleHSLChange = (c: any, p: any, v: number) => setAdjustments(prev => ({ ...prev, hsl: { ...prev.hsl, [c]: { ...prev.hsl[c], [p]: v } } }));
  const handleWBChange = (p: any, v: number) => setAdjustments(prev => ({ ...prev, whiteBalance: { ...prev.whiteBalance, [p]: v } }));
  const handleGradingChange = (r: any, p: any, v: number) => setAdjustments(prev => ({ ...prev, grading: { ...prev.grading, [r]: { ...prev.grading[r], [p]: v } } }));
  const handleFilmChange = (film: FilmSimulation) => setCurrentFilm(film);
  const handleIntensityChange = (val: number) => setIntensity(val);
  
  const handleDownload = () => {
    if (!processedCanvasRef.current) return;
    const link = document.createElement('a');
    let filename = `prograde-ultra-${Date.now()}.jpg`;
    if (suggestedFilename) filename = suggestedFilename.toLowerCase().endsWith('.jpg') ? suggestedFilename : `${suggestedFilename}.jpg`;
    link.download = filename;
    link.href = processedCanvasRef.current.toDataURL('image/jpeg', 0.92);
    link.click();
  };

  const handleReset = () => {
      setAdjustments(createDefaultAdjustments());
      setIntensity(1.0);
      setCurrentFilm(FilmSimulation.Provia);
      setMasks([]);
      setActiveMaskId(null);
  };

  useEffect(() => {
    setIsProcessing(true);
    const timer = setTimeout(() => {
        currentFinalLUT.current = generateFilmStyleLUT(currentFilm, adjustments.whiteBalance, adjustments.grading);
        triggerProcessing();
    }, 10);
    return () => clearTimeout(timer);
  }, [currentFilm, adjustments.whiteBalance, adjustments.grading]); 

  useEffect(() => {
    const timer = setTimeout(() => triggerProcessing(), 15);
    return () => clearTimeout(timer);
  }, [adjustments, intensity, originalImage, masks]); // Add masks dependency

  const triggerProcessing = useCallback(() => {
    if (!originalImage || !originalCanvasRef.current || !processedCanvasRef.current || !currentFinalLUT.current) {
        setIsProcessing(false);
        return;
    }
    const origCtx = originalCanvasRef.current.getContext('2d', { willReadFrequently: true });
    const procCtx = processedCanvasRef.current.getContext('2d', { willReadFrequently: true });
    if (!origCtx || !procCtx) { setIsProcessing(false); return; }

    const width = originalCanvasRef.current.width;
    const height = originalCanvasRef.current.height;
    if (width === 0) { setIsProcessing(false); return; }

    const pixelData = origCtx.getImageData(0, 0, width, height);
    
    const { imageData: processedData, histogram } = applyLUT(
        pixelData, 
        currentFinalLUT.current, 
        adjustments, 
        intensity,
        masks // Pass masks to processor
    );

    setHistogramData(histogram);
    processedCanvasRef.current.width = width;
    processedCanvasRef.current.height = height;
    procCtx.putImageData(processedData, 0, 0);
    
    // Optional Halation
    if (adjustments.halation > 0) {
        const halationStr = adjustments.halation / 100;
        const scale = 0.25; 
        const glowCanvas = document.createElement('canvas');
        glowCanvas.width = width * scale; glowCanvas.height = height * scale;
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
  }, [adjustments, intensity, originalImage, currentFilm, masks]);

  return (
    <div className="flex flex-col lg:flex-row h-screen w-full bg-[#0a0a0a] text-gray-200 font-sans overflow-hidden">
      {isLoadingFile && (
          <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center backdrop-blur-sm">
             <p className="text-white font-bold tracking-wider">正在解码 RAW... (Decoding RAW...)</p>
          </div>
      )}
      {isBatchProcessing && <BatchModal current={batchStatus.current} total={batchStatus.total} filename={batchStatus.filename} />}
      {isHelpOpen && <HelpModal onClose={() => setIsHelpOpen(false)} />}
      
      <CanvasView 
        originalImage={originalImage} 
        originalCanvasRef={originalCanvasRef} 
        processedCanvasRef={processedCanvasRef}
        isMaskingMode={!!activeMaskId}
        brushSettings={brushSettings}
        onStroke={handleBrushStroke}
      />
      
      {aiReasoning && (
        <div className="fixed bottom-6 left-6 z-50 max-w-md bg-gray-900/90 border border-fuji-accent text-gray-200 px-4 py-3 rounded-lg shadow-2xl backdrop-blur">
             <div className="flex items-start gap-3">
             <span className="text-xl">✨</span>
             <div><h4 className="font-bold text-fuji-accent text-sm mb-1">AI 调色完成 (AI Finished)</h4><p className="text-xs text-gray-300">{aiReasoning}</p></div>
             <button onClick={() => setAiReasoning(null)} className="ml-auto">✕</button>
          </div>
        </div>
      )}
      
      <Controls 
        currentFilm={currentFilm} onFilmChange={handleFilmChange}
        adjustments={adjustments} onAdjustmentChange={handleAdjustmentChange}
        onHSLChange={handleHSLChange} onWBChange={handleWBChange} onGradingChange={handleGradingChange}
        filterIntensity={intensity} onIntensityChange={handleIntensityChange}
        onUpload={handleUpload} onDownload={handleDownload}
        onBatchUpload={handleBatchUpload}
        onReset={handleReset}
        onApplyPreset={handleApplyPreset}
        onHelp={() => setIsHelpOpen(true)}
        isProcessing={isProcessing} histogramData={histogramData}
        isAIAnalyzing={isAIAnalyzing} onAIAuto={handleAIAutoAdjust}
        // Masking Props
        masks={masks}
        activeMaskId={activeMaskId}
        onAddMask={handleAddMask}
        onDeleteMask={handleDeleteMask}
        onToggleMask={handleToggleMask}
        onSelectMask={handleSelectMask}
        onLocalAdjChange={handleLocalAdjChange}
        brushSettings={brushSettings}
        onBrushChange={(k, v) => setBrushSettings(prev => ({...prev, [k]: v}))}
      />
      <canvas ref={originalCanvasRef} className="hidden" />
    </div>
  );
};

export default App;
