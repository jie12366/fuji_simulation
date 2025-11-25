
import React, { useEffect, useRef } from 'react';
import { HistogramData } from '../types';

interface HistogramProps {
  data: HistogramData | null;
}

export const Histogram: React.FC<HistogramProps> = ({ data }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!data || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const width = canvas.width;
    const height = canvas.height;
    const barWidth = width / 256;

    // Find max value to normalize height
    // We combine all channels to find the absolute max peak for scaling
    let maxCount = 0;
    for (let i = 0; i < 256; i++) {
        maxCount = Math.max(maxCount, data.r[i], data.g[i], data.b[i]);
    }
    // Prevent divide by zero and add slight headroom
    maxCount = maxCount * 1.1 || 1; 

    // Helper to draw a channel
    const drawChannel = (channelData: number[], color: string) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, height);
        
        for (let i = 0; i < 256; i++) {
            const val = channelData[i];
            const h = (val / maxCount) * height;
            ctx.lineTo(i * barWidth, height - h);
        }
        ctx.lineTo(width, height);
        ctx.closePath();
        ctx.fill();
    };

    // Composite operation 'screen' makes overlapping colors blend nicely (R+G=Yellow, etc)
    ctx.globalCompositeOperation = 'screen';

    drawChannel(data.r, 'rgba(255, 50, 50, 0.6)');
    drawChannel(data.g, 'rgba(50, 255, 50, 0.6)');
    drawChannel(data.b, 'rgba(50, 50, 255, 0.6)');
    
    // Draw grid lines
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    // 25%, 50%, 75% vertical lines
    [0.25, 0.5, 0.75].forEach(p => {
        ctx.moveTo(width * p, 0);
        ctx.lineTo(width * p, height);
    });
    ctx.stroke();

  }, [data]);

  return (
    <div className="w-full bg-gray-900 border border-gray-700 rounded-md p-2 mb-6">
       <div className="flex justify-between text-[10px] text-gray-500 mb-1 uppercase tracking-wider">
         <span>Shadows</span>
         <span>Highlights</span>
       </div>
       <canvas 
         ref={canvasRef} 
         width={256} 
         height={80} 
         className="w-full h-20"
       />
    </div>
  );
};
