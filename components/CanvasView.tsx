
import React, { useRef, useEffect, useState } from 'react';
import { BrushSettings } from '../types';

interface CanvasViewProps {
  originalImage: HTMLImageElement | null;
  processedCanvasRef: React.RefObject<HTMLCanvasElement>;
  originalCanvasRef: React.RefObject<HTMLCanvasElement>;
  
  // Masking Props
  isMaskingMode: boolean;
  brushSettings: BrushSettings;
  activeMaskData: Uint8Array | null; // Raw mask data for visualization
  onStroke: (x: number, y: number, lastX: number, lastY: number) => void;
}

export const CanvasView: React.FC<CanvasViewProps> = ({ 
  originalImage, 
  processedCanvasRef,
  originalCanvasRef,
  isMaskingMode,
  brushSettings,
  activeMaskData,
  onStroke
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null); // Direct DOM ref for performance
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);
  
  // Pan & Zoom State
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [lastPoint, setLastPoint] = useState<{x:number, y:number} | null>(null);

  // Fit to screen helper
  const calculateBestFit = () => {
      if (!originalImage || !containerRef.current) return;
      
      const containerW = containerRef.current.clientWidth;
      const containerH = containerRef.current.clientHeight;
      const imgW = originalImage.width;
      const imgH = originalImage.height;
      
      if (imgW === 0 || imgH === 0) return;

      const scaleX = (containerW * 0.90) / imgW;
      const scaleY = (containerH * 0.90) / imgH;
      const bestFit = Math.min(scaleX, scaleY);
      
      setScale(bestFit);
      setPosition({ x: 0, y: 0 });
  };

  // Initial Draw & Resize Listener
  useEffect(() => {
    if (originalImage && originalCanvasRef.current) {
      const canvas = originalCanvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        canvas.width = originalImage.width;
        canvas.height = originalImage.height;
        ctx.drawImage(originalImage, 0, 0);
      }
      // Reset overlay dimensions
      if (overlayRef.current) {
          overlayRef.current.width = originalImage.width;
          overlayRef.current.height = originalImage.height;
      }
      calculateBestFit();
      
      const handleResize = () => requestAnimationFrame(calculateBestFit);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, [originalImage, originalCanvasRef]);

  // --- MASK VISUALIZATION ENGINE ---
  useEffect(() => {
      if (!overlayRef.current || !originalImage) return;
      const ctx = overlayRef.current.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height);

      if (isMaskingMode && activeMaskData) {
          // Convert Uint8 alpha map to Red Overlay
          const width = overlayRef.current.width;
          const height = overlayRef.current.height;
          const imgData = ctx.createImageData(width, height);
          const px = imgData.data;
          
          for (let i = 0; i < activeMaskData.length; i++) {
              const alpha = activeMaskData[i];
              if (alpha > 0) {
                  const idx = i * 4;
                  px[idx] = 255;     // R
                  px[idx + 1] = 0;   // G
                  px[idx + 2] = 0;   // B
                  px[idx + 3] = alpha * 0.5; // Semi-transparent
              }
          }
          ctx.putImageData(imgData, 0, 0);
      }
  }, [activeMaskData, isMaskingMode, originalImage]);

  const handleWheel = (e: React.WheelEvent) => {
    if (!originalImage) return;
    e.preventDefault();
    const zoomSensitivity = 0.001;
    const delta = -e.deltaY * zoomSensitivity;
    const newScale = Math.min(Math.max(0.05, scale + delta * scale * 5), 20); 
    setScale(newScale);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isDraggingSlider) return; 
    
    if (isMaskingMode && originalImage && wrapperRef.current) {
        setIsDrawing(true);
        const rect = wrapperRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left) / scale;
        const y = (e.clientY - rect.top) / scale;
        setLastPoint({ x, y });
        onStroke(x, y, -1, -1); 

        // Immediate visual feedback on overlay
        const ctx = overlayRef.current?.getContext('2d');
        if (ctx) {
            ctx.fillStyle = `rgba(255, 0, 0, ${brushSettings.opacity / 200})`; // Light red dot
            ctx.beginPath();
            ctx.arc(x, y, brushSettings.size / 2, 0, Math.PI * 2);
            ctx.fill();
        }

    } else {
        setIsPanning(true);
        setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    // 1. High Performance Cursor Tracking (Direct DOM)
    if (isMaskingMode && cursorRef.current) {
        cursorRef.current.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
        cursorRef.current.style.width = `${brushSettings.size * scale}px`;
        cursorRef.current.style.height = `${brushSettings.size * scale}px`;
    }

    // 2. Drawing Logic
    if (isDrawing && isMaskingMode && originalImage && wrapperRef.current) {
        const rect = wrapperRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left) / scale;
        const y = (e.clientY - rect.top) / scale;
        
        if (lastPoint) {
            onStroke(x, y, lastPoint.x, lastPoint.y);
            
            // Immediate visual feedback
            const ctx = overlayRef.current?.getContext('2d');
            if (ctx) {
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.lineWidth = brushSettings.size;
                ctx.strokeStyle = brushSettings.isEraser 
                    ? 'rgba(0,0,0,1)' // Hack: Eraser viz is hard on single layer, logic handled in data
                    : `rgba(255, 0, 0, ${brushSettings.opacity / 200})`; 
                ctx.globalCompositeOperation = brushSettings.isEraser ? 'destination-out' : 'source-over';
                ctx.beginPath();
                ctx.moveTo(lastPoint.x, lastPoint.y);
                ctx.lineTo(x, y);
                ctx.stroke();
                ctx.globalCompositeOperation = 'source-over';
            }
        }
        setLastPoint({ x, y });
    } 
    // 3. Panning Logic
    else if (isPanning) {
        setPosition({
            x: e.clientX - dragStart.x,
            y: e.clientY - dragStart.y
        });
    }
  };

  const handleWrapperMouseMove = (e: React.MouseEvent) => {
     if (isDraggingSlider && wrapperRef.current) {
         e.stopPropagation();
         const rect = wrapperRef.current.getBoundingClientRect();
         let x = e.clientX - rect.left;
         let pos = (x / rect.width) * 100;
         setSliderPosition(Math.max(0, Math.min(100, pos)));
     }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setIsDraggingSlider(false);
    setIsDrawing(false);
    setLastPoint(null);
  };

  const startSliderDrag = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation(); 
    setIsDraggingSlider(true);
  };

  if (!originalImage) {
    return (
      <div className="flex-1 bg-[#050505] flex flex-col items-center justify-center p-8 text-gray-500 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03]" style={{ 
          backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}></div>
        
        <div className="z-10 flex flex-col items-center animate-fadeIn">
            <div className="w-24 h-24 mb-6 rounded-3xl bg-gray-900 border border-gray-800 flex items-center justify-center shadow-2xl">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
            </div>
            <h2 className="text-2xl font-light tracking-[0.3em] text-gray-400">工作区 (WORKSPACE)</h2>
            <p className="text-xs mt-3 text-gray-600 font-mono tracking-wide">导入图片开始修图...</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      className={`flex-1 bg-[#050505] overflow-hidden relative flex items-center justify-center ${isMaskingMode ? 'cursor-none' : 'cursor-grab active:cursor-grabbing'}`}
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Brush Cursor (Optimized via ref) */}
      {isMaskingMode && (
          <div 
            ref={cursorRef}
            className="fixed pointer-events-none rounded-full border border-white bg-white/20 z-[100]"
            style={{ 
                left: 0, 
                top: 0,
                width: 0, // Set dynamically via ref
                height: 0, // Set dynamically via ref
                transform: 'translate(-50%, -50%)',
                willChange: 'transform, width, height'
            }}
          />
      )}

      {/* Background Grid */}
      <div className="absolute inset-0 opacity-[0.05] pointer-events-none" style={{ 
          backgroundImage: 'linear-gradient(#444 1px, transparent 1px), linear-gradient(90deg, #444 1px, transparent 1px)',
          backgroundSize: '30px 30px',
      }}></div>

      {/* Floating Dock */}
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-30 flex items-center gap-4 bg-[#121212]/80 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)] transition-opacity hover:opacity-100 opacity-80">
         <div className="text-[10px] font-mono text-gray-400 border-r border-gray-700 pr-3">
             缩放: {Math.round(scale * 100)}%
         </div>
         <button 
           onClick={calculateBestFit} 
           className="text-gray-300 hover:text-fuji-accent transition-colors flex items-center gap-1.5"
           title="适应屏幕"
         >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path></svg>
            <span className="text-[10px] font-bold uppercase tracking-wide">适应屏幕 (Fit)</span>
         </button>
      </div>

      <div 
        ref={wrapperRef}
        className="relative shadow-2xl transition-transform duration-75 ease-out pointer-events-auto flex-none"
        onMouseMove={handleWrapperMouseMove}
        style={{ 
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transformOrigin: 'center',
            width: originalImage.width,
            height: originalImage.height,
        }}
      >
        <canvas ref={originalCanvasRef} className="absolute top-0 left-0 block w-full h-full" />
        <canvas 
            ref={processedCanvasRef} 
            className="absolute top-0 left-0 block w-full h-full"
            style={{ clipPath: isMaskingMode ? 'none' : `inset(0 0 0 ${sliderPosition}%)` }}
        />
        
        {/* Mask Overlay */}
        <canvas 
            ref={overlayRef}
            className={`absolute top-0 left-0 w-full h-full pointer-events-none transition-opacity duration-200 ${isMaskingMode ? 'opacity-100' : 'opacity-0'}`}
            style={{ mixBlendMode: 'normal' }}
        />

        {/* Slider Elements */}
        {!isMaskingMode && (
            <>
                <div 
                    className="absolute top-0 bottom-0 w-[1px] bg-white z-10 pointer-events-none drop-shadow-[0_0_8px_rgba(0,0,0,0.8)]"
                    style={{ left: `${sliderPosition}%` }}
                />
                <div 
                    className="absolute top-0 bottom-0 w-16 -ml-8 z-20 flex items-center justify-center cursor-col-resize group"
                    style={{ left: `${sliderPosition}%` }}
                    onMouseDown={startSliderDrag}
                    onTouchStart={startSliderDrag}
                >
                    <div className="w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-sm bg-white/10 border border-white/40 shadow-lg group-hover:scale-110 transition-transform">
                        <div className="flex gap-1">
                            <div className="w-0.5 h-3 bg-white"></div>
                            <div className="w-0.5 h-3 bg-white"></div>
                        </div>
                    </div>
                </div>
                <div className="absolute bottom-4 left-4 px-2 py-1 rounded bg-black/50 backdrop-blur text-[10px] font-bold text-gray-400 border border-white/5 pointer-events-none tracking-widest uppercase">原图 (ORIGINAL)</div>
                <div className="absolute bottom-4 right-4 px-2 py-1 rounded bg-fuji-accent/10 backdrop-blur text-[10px] font-bold text-fuji-accent border border-fuji-accent/30 pointer-events-none tracking-widest uppercase shadow-[0_0_10px_rgba(0,208,132,0.2)]">效果 (SIMULATED)</div>
            </>
        )}
      </div>
    </div>
  );
};
