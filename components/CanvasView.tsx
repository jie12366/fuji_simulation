
import React, { useRef, useEffect, useState } from 'react';

interface CanvasViewProps {
  originalImage: HTMLImageElement | null;
  processedCanvasRef: React.RefObject<HTMLCanvasElement>;
  originalCanvasRef: React.RefObject<HTMLCanvasElement>;
}

export const CanvasView: React.FC<CanvasViewProps> = ({ 
  originalImage, 
  processedCanvasRef,
  originalCanvasRef
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);
  
  // Pan & Zoom State
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Fit to screen helper
  const calculateBestFit = () => {
      if (!originalImage || !containerRef.current) return;
      
      const containerW = containerRef.current.clientWidth;
      const containerH = containerRef.current.clientHeight;
      const imgW = originalImage.width;
      const imgH = originalImage.height;
      
      if (imgW === 0 || imgH === 0) return;

      // Add 5% padding (0.95 factor) so it doesn't touch the edges
      const scaleX = (containerW * 0.95) / imgW;
      const scaleY = (containerH * 0.95) / imgH;
      const bestFit = Math.min(scaleX, scaleY);
      
      setScale(bestFit);
      setPosition({ x: 0, y: 0 });
  };

  // --- Initialization & Resize ---
  useEffect(() => {
    if (originalImage && originalCanvasRef.current) {
      const canvas = originalCanvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        canvas.width = originalImage.width;
        canvas.height = originalImage.height;
        ctx.drawImage(originalImage, 0, 0);
      }
      
      // Trigger fit immediately
      calculateBestFit();
      
      const handleResize = () => {
          requestAnimationFrame(calculateBestFit);
      };
      
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, [originalImage, originalCanvasRef]);

  // --- Zoom Logic (Wheel) ---
  const handleWheel = (e: React.WheelEvent) => {
    if (!originalImage) return;
    e.preventDefault();
    const zoomSensitivity = 0.001;
    const delta = -e.deltaY * zoomSensitivity;
    // Limit zoom
    const newScale = Math.min(Math.max(0.05, scale + delta * scale * 5), 20); 
    setScale(newScale);
  };

  // --- Pan Logic (Mouse/Touch) ---
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isDraggingSlider) return; 
    setIsPanning(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
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
  };

  const startSliderDrag = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation(); 
    setIsDraggingSlider(true);
  };

  if (!originalImage) {
    return (
      <div className="flex-1 bg-[#0a0a0a] flex flex-col items-center justify-center p-8 text-gray-500 border-l border-gray-800 select-none relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-gray-800/20 via-[#0a0a0a] to-[#0a0a0a]"></div>
        <div className="z-10 flex flex-col items-center">
            <div className="bg-gray-900/50 p-10 rounded-3xl border border-gray-800 backdrop-blur-sm mb-6 shadow-2xl">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-20 w-20 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={0.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            </div>
            <h2 className="text-3xl font-thin tracking-[0.2em] text-white">工作区</h2>
            <p className="text-sm mt-4 text-gray-600 font-mono">请先在右侧导入图片</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="flex-1 bg-[#0a0a0a] overflow-hidden relative cursor-grab active:cursor-grabbing flex items-center justify-center"
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Background Grid */}
      <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ 
          backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)',
          backgroundSize: '40px 40px',
      }}></div>

      {/* Info HUD */}
      <div className="absolute top-6 left-6 z-30 flex gap-2">
         <div className="bg-black/80 backdrop-blur text-white text-xs font-mono px-3 py-1.5 rounded border border-gray-800 shadow-lg">
             缩放: {Math.round(scale * 100)}%
         </div>
         <button onClick={calculateBestFit} className="bg-fuji-accent text-black text-xs font-bold px-3 py-1.5 rounded hover:bg-white transition-colors shadow-lg">
             适应屏幕
         </button>
      </div>

      {/* Image Container with Transformation */}
      {/* Added flex-none to prevent flexbox from squashing dimensions */}
      <div 
        ref={wrapperRef}
        className="relative shadow-[0_0_50px_rgba(0,0,0,0.5)] transition-transform duration-75 ease-out pointer-events-auto flex-none"
        onMouseMove={handleWrapperMouseMove}
        style={{ 
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transformOrigin: 'center',
            width: originalImage.width,
            height: originalImage.height,
        }}
      >
        {/* Layer 1: Original (Bottom Layer) */}
        <canvas 
            ref={originalCanvasRef} 
            className="absolute top-0 left-0 block w-full h-full"
        />

        {/* Layer 2: Processed (Top Layer) - Clipped from the LEFT to reveal Right side */}
        <canvas 
            ref={processedCanvasRef} 
            className="absolute top-0 left-0 block w-full h-full"
            style={{ 
                clipPath: `inset(0 0 0 ${sliderPosition}%)`
            }}
        />
        
        {/* Separator Line */}
        <div 
            className="absolute top-0 bottom-0 w-0.5 bg-white/50 z-10 pointer-events-none shadow-[0_0_10px_black]"
            style={{ left: `${sliderPosition}%` }}
        />

        {/* Slider Handle (Interactive) */}
        <div 
            className="absolute top-0 bottom-0 w-12 -ml-6 z-20 flex items-center justify-center cursor-col-resize group"
            style={{ left: `${sliderPosition}%` }}
            onMouseDown={startSliderDrag}
            onTouchStart={startSliderDrag}
        >
            <div className="w-8 h-8 bg-black/80 border border-white/40 rounded-full flex items-center justify-center shadow-lg backdrop-blur group-hover:scale-110 transition-transform">
                 <div className="flex gap-0.5">
                    <div className="w-0.5 h-3 bg-white/90"></div>
                    <div className="w-0.5 h-3 bg-white/90"></div>
                 </div>
            </div>
        </div>
        
        {/* Labels - Matches visual: Left=Original, Right=Simulated */}
        <div className="absolute bottom-4 left-4 bg-black/60 text-white text-[10px] px-2 py-1 rounded backdrop-blur pointer-events-none">原图 (Original)</div>
        <div className="absolute bottom-4 right-4 bg-fuji-accent/90 text-black text-[10px] px-2 py-1 rounded backdrop-blur font-bold pointer-events-none">模拟 (Simulated)</div>
      </div>
    </div>
  );
};
