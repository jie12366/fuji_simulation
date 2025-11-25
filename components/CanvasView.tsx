
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

  // --- Initialization ---
  useEffect(() => {
    if (originalImage && originalCanvasRef.current) {
      const canvas = originalCanvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        canvas.width = originalImage.width;
        canvas.height = originalImage.height;
        ctx.drawImage(originalImage, 0, 0);
      }
      // Reset view on new image
      setScale(1);
      setPosition({ x: 0, y: 0 });
    }
  }, [originalImage, originalCanvasRef]);

  // --- Zoom Logic (Wheel) ---
  const handleWheel = (e: React.WheelEvent) => {
    if (!originalImage) return;
    e.preventDefault();
    const zoomSensitivity = 0.001;
    const delta = -e.deltaY * zoomSensitivity;
    const newScale = Math.min(Math.max(0.1, scale + delta * scale * 5), 10); // 0.1x to 10x zoom
    setScale(newScale);
  };

  // --- Pan Logic (Mouse/Touch) ---
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isDraggingSlider) return; // Don't pan if using slider
    // Check if middle click or spacebar held (optional, for now just left click on background)
    // Actually, standard behavior: Left click on canvas = Pan, unless on slider
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
    
    // Slider Logic
    if (isDraggingSlider && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        let pos = ((e.clientX - rect.left) / rect.width) * 100;
        pos = Math.max(0, Math.min(100, pos));
        setSliderPosition(pos);
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setIsDraggingSlider(false);
  };

  // --- Slider Handle Logic ---
  const startSliderDrag = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation(); // Prevent pan start
    setIsDraggingSlider(true);
  };

  // Fit to screen
  const handleFit = () => {
      setScale(1);
      setPosition({ x: 0, y: 0 });
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
            <h2 className="text-3xl font-thin tracking-[0.2em] text-white">WORKSPACE</h2>
            <p className="text-sm mt-4 text-gray-600 font-mono">NO IMAGE LOADED</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="flex-1 bg-[#0a0a0a] overflow-hidden relative cursor-grab active:cursor-grabbing"
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
          transform: `translate(${position.x % 40}px, ${position.y % 40}px) scale(${scale})`, // Parallax-ish feel
          transformOrigin: '0 0'
      }}></div>

      {/* Info HUD */}
      <div className="absolute top-6 left-6 z-30 flex gap-2">
         <div className="bg-black/80 backdrop-blur text-white text-xs font-mono px-3 py-1.5 rounded border border-gray-800">
             ZOOM: {Math.round(scale * 100)}%
         </div>
         <button onClick={handleFit} className="bg-fuji-accent text-black text-xs font-bold px-3 py-1.5 rounded hover:bg-white transition-colors">
             FIT
         </button>
      </div>

      {/* Image Container with Transformation */}
      <div 
        className="absolute top-0 left-0 w-full h-full flex items-center justify-center pointer-events-none" // Center initially
      >
        <div 
            className="relative shadow-[0_0_50px_rgba(0,0,0,0.5)] transition-transform duration-75 ease-out"
            style={{ 
                transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                transformOrigin: 'center',
                width: originalImage.width,
                height: originalImage.height,
                maxWidth: 'none', // Allow huge scaling
                maxHeight: 'none'
            }}
        >
            {/* Layer 1: Original (Reference) */}
            <canvas 
                ref={originalCanvasRef} 
                className="absolute top-0 left-0 w-full h-full"
            />

            {/* Layer 2: Processed (Clipped) */}
            <div 
                className="absolute top-0 left-0 h-full overflow-hidden border-r border-white/50"
                style={{ width: `${sliderPosition}%` }}
            >
                <canvas 
                    ref={processedCanvasRef} 
                    className="w-full h-full"
                    // We must size the canvas to match the parent container exactly in CSS pixels
                    // but since we are scaling the PARENT, this canvas just fills it.
                    style={{ width: originalImage.width, height: originalImage.height, maxWidth: 'none' }}
                />
            </div>

            {/* Slider Handle (Pointer events enabled) */}
            <div 
                className="absolute top-0 bottom-0 w-10 -ml-5 z-20 flex items-center justify-center cursor-col-resize pointer-events-auto group"
                style={{ left: `${sliderPosition}%` }}
                onMouseDown={startSliderDrag}
                onTouchStart={startSliderDrag}
            >
                <div className="w-[1px] h-full bg-white/50 group-hover:bg-fuji-accent transition-colors shadow-[0_0_10px_black]"></div>
                <div className="absolute w-6 h-10 bg-black/80 border border-white/20 rounded flex items-center justify-center shadow-lg backdrop-blur">
                    <div className="w-0.5 h-4 bg-white/80"></div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};
