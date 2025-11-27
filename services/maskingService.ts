
import { BrushSettings } from "../types";

// Helper to draw a brush stroke onto a canvas context
export const drawStroke = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    lastX: number,
    lastY: number,
    settings: BrushSettings
) => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = settings.size;
    
    // Hardness simulation via shadowBlur (simplified)
    // A lower hardness means a blurrier edge
    const blur = settings.size * (1 - settings.hardness / 100) * 0.5;
    ctx.shadowBlur = blur;
    ctx.shadowColor = settings.isEraser ? 'black' : 'white';
    
    ctx.globalCompositeOperation = settings.isEraser ? 'destination-out' : 'source-over';
    ctx.strokeStyle = settings.isEraser ? 'rgba(0,0,0,1)' : `rgba(255,255,255,${settings.opacity / 100})`;
    
    // To make shadowBlur work with stroke, we need consistent color
    // Note: destination-out with shadow is tricky in canvas, simplified here to standard composition
    
    ctx.beginPath();
    if (lastX === -1) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + 0.01, y); // Dot
    } else {
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(x, y);
    }
    ctx.stroke();
};

// Initialize a blank mask buffer
export const createEmptyMaskData = (width: number, height: number): Uint8Array => {
    return new Uint8Array(width * height).fill(0);
};

// Convert Canvas content to Uint8Array (Alpha channel only)
export const canvasToMaskData = (canvas: HTMLCanvasElement): Uint8Array => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return new Uint8Array(0);
    
    const width = canvas.width;
    const height = canvas.height;
    const imageData = ctx.getImageData(0, 0, width, height);
    const pixels = imageData.data;
    const maskData = new Uint8Array(width * height);
    
    // Extract Alpha (or Red, since we draw white on transparent)
    for (let i = 0; i < width * height; i++) {
        // Alpha channel is index i*4 + 3
        maskData[i] = pixels[i * 4 + 3]; 
    }
    
    return maskData;
};
