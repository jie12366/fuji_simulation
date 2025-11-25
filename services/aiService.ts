
import { GoogleGenAI, Type } from "@google/genai";
import { Adjustments, FilmSimulation } from "../types";

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Helper to downscale image for API (saves bandwidth/tokens, sufficient for color analysis)
export const prepareImageForAI = async (img: HTMLImageElement): Promise<string> => {
  const canvas = document.createElement('canvas');
  const maxDim = 512;
  let w = img.width;
  let h = img.height;
  
  if (w > maxDim || h > maxDim) {
    if (w > h) {
      h = Math.round((h * maxDim) / w);
      w = maxDim;
    } else {
      w = Math.round((w * maxDim) / h);
      h = maxDim;
    }
  }
  
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("Could not get context");
  
  ctx.drawImage(img, 0, 0, w, h);
  // Return base64 string without the prefix
  return canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
};

// Define the response schema to match our internal state types
const adjustmentsSchema = {
  type: Type.OBJECT,
  properties: {
    recommendedFilm: {
      type: Type.STRING,
      description: "The enum value of the film simulation to use.",
      enum: Object.values(FilmSimulation)
    },
    reasoning: {
      type: Type.STRING,
      description: "A short explanation of why this look was chosen (e.g., 'Warm sunset detected, enhancing golden tones')."
    },
    adjustments: {
      type: Type.OBJECT,
      properties: {
        brightness: { type: Type.NUMBER, description: "-100 to 100" },
        contrast: { type: Type.NUMBER, description: "-100 to 100" },
        saturation: { type: Type.NUMBER, description: "-100 to 100" },
        highlights: { type: Type.NUMBER, description: "-100 to 100" },
        shadows: { type: Type.NUMBER, description: "-100 to 100" },
        vignette: { type: Type.NUMBER, description: "0 to 100" },
        grainAmount: { type: Type.NUMBER, description: "0 to 100" },
        hsl: {
          type: Type.OBJECT,
          description: "HSL adjustments for 6 colors",
          properties: {
            red: { type: Type.OBJECT, properties: { h: { type: Type.NUMBER }, s: { type: Type.NUMBER }, l: { type: Type.NUMBER } } },
            yellow: { type: Type.OBJECT, properties: { h: { type: Type.NUMBER }, s: { type: Type.NUMBER }, l: { type: Type.NUMBER } } },
            green: { type: Type.OBJECT, properties: { h: { type: Type.NUMBER }, s: { type: Type.NUMBER }, l: { type: Type.NUMBER } } },
            cyan: { type: Type.OBJECT, properties: { h: { type: Type.NUMBER }, s: { type: Type.NUMBER }, l: { type: Type.NUMBER } } },
            blue: { type: Type.OBJECT, properties: { h: { type: Type.NUMBER }, s: { type: Type.NUMBER }, l: { type: Type.NUMBER } } },
            magenta: { type: Type.OBJECT, properties: { h: { type: Type.NUMBER }, s: { type: Type.NUMBER }, l: { type: Type.NUMBER } } },
          },
          required: ["red", "yellow", "green", "cyan", "blue", "magenta"]
        }
      },
      required: ["brightness", "contrast", "saturation", "highlights", "shadows", "hsl"]
    }
  },
  required: ["recommendedFilm", "adjustments", "reasoning"]
};

export interface AIAnalysisResult {
  recommendedFilm: FilmSimulation;
  adjustments: Partial<Adjustments>;
  reasoning: string;
}

export const analyzeImage = async (base64Image: string): Promise<AIAnalysisResult> => {
  try {
    const prompt = `
      Act as a world-class professional colorist and film photographer.
      Analyze the content, lighting, mood, and composition of this image.
      
      1. Choose the most appropriate Fujifilm Simulation from the list provided in the schema.
         - Use 'Velvia' for landscapes/nature needing punch.
         - Use 'Classic Chrome' for street/documentary.
         - Use 'Astia' or 'Provia' for portraits.
         - Use 'Acros' variants for black and white artistic shots.
         - Use 'Nostalgic Neg' or 'Classic Neg' for emotional/retro vibes.
      
      2. Determine the optimal adjustments (Brightness, Contrast, HSL, etc.) to enhance the image aesthetically.
         - Suggest subtle HSL shifts to separate skin tones or enhance skies (e.g., shift Blue hue towards Cyan, or desaturate Greens).
         - If the image looks flat, increase contrast.
         - If highlights are blown out, lower the highlights value.
      
      Return valid JSON matching the schema.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        role: "user",
        parts: [
          { text: prompt },
          { inlineData: { mimeType: "image/jpeg", data: base64Image } }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: adjustmentsSchema,
        temperature: 0.7,
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("No text response received from AI.");
    }
    
    const data = JSON.parse(text);
    return data as AIAnalysisResult;

  } catch (error) {
    console.error("AI Analysis failed:", error);
    throw error;
  }
};
