
import React, { useRef, useEffect } from 'react';

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

  // Initial draw of original image
  useEffect(() => {
    if (originalImage && originalCanvasRef.current && containerRef.current) {
      const canvas = originalCanvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        canvas.width = originalImage.width;
        canvas.height = originalImage.height;
        ctx.drawImage(originalImage, 0, 0);
      }
    }
  }, [originalImage, originalCanvasRef]);

  if (!originalImage) {
    return (
      <div className="flex-1 bg-fuji-900 flex flex-col items-center justify-center p-8 text-gray-500 border-l border-gray-700">
        <div className="bg-fuji-800 p-8 rounded-full mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <h2 className="text-xl font-light">请上传照片</h2>
        <p className="text-sm mt-2 opacity-60">点击左上角的“打开照片”按钮开始修图。</p>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-neutral-900 overflow-auto p-4 lg:p-8 flex flex-col lg:flex-row gap-4 items-start justify-center" ref={containerRef}>
      
      {/* Container for Original */}
      <div className="relative group w-full lg:w-1/2 flex flex-col">
        <div className="bg-black rounded-lg shadow-xl overflow-hidden relative">
            <span className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded backdrop-blur-sm z-10 pointer-events-none">原图 (Original)</span>
            <canvas 
                ref={originalCanvasRef} 
                className="w-full h-auto object-contain max-h-[80vh]"
            />
        </div>
      </div>

      {/* Container for Result */}
      <div className="relative group w-full lg:w-1/2 flex flex-col">
         <div className="bg-black rounded-lg shadow-xl overflow-hidden relative border-2 border-fuji-accent/20">
            <span className="absolute top-2 left-2 bg-fuji-accent/80 text-fuji-900 font-bold text-xs px-2 py-1 rounded backdrop-blur-sm z-10 pointer-events-none">模拟效果 (Simulation)</span>
            <canvas 
                ref={processedCanvasRef} 
                className="w-full h-auto object-contain max-h-[80vh]"
            />
         </div>
      </div>
    </div>
  );
};
