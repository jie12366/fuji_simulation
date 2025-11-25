
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

// Define the response schema
const adjustmentsSchema = {
  type: Type.OBJECT,
  properties: {
    recommendedFilm: {
      type: Type.STRING,
      description: "The name of the film simulation to use (e.g. 'Classic Chrome', 'Velvia', 'Nostalgic Neg')."
    },
    reasoning: {
      type: Type.STRING,
      description: "A short explanation of why this look was chosen."
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
        sharpening: { type: Type.NUMBER, description: "0 to 100 (Unsharp Mask)" },
        whiteBalance: {
          type: Type.OBJECT,
          properties: {
            temp: { type: Type.NUMBER, description: "-50 (Cool/Blue) to 50 (Warm/Amber)" },
            tint: { type: Type.NUMBER, description: "-50 (Green) to 50 (Magenta)" }
          }
        },
        grading: {
          type: Type.OBJECT,
          description: "Cinematic Color Grading (Split Toning). Use this to add color casts to specific ranges.",
          properties: {
            shadows: { type: Type.OBJECT, properties: { h: { type: Type.NUMBER }, s: { type: Type.NUMBER } } },
            midtones: { type: Type.OBJECT, properties: { h: { type: Type.NUMBER }, s: { type: Type.NUMBER } } },
            highlights: { type: Type.OBJECT, properties: { h: { type: Type.NUMBER }, s: { type: Type.NUMBER } } },
          }
        },
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
  recommendedFilm: string;
  adjustments: Partial<Adjustments>;
  reasoning: string;
}

export const analyzeImage = async (base64Image: string, userHint?: string): Promise<AIAnalysisResult> => {
  try {
    const prompt = `
      Act as a world-class professional colorist and image editor.
      Analyze the content, lighting, mood, and composition of this image to determine the best Fujifilm Simulation style and parameter adjustments.

      Your goal is ARTISTIC expression and technical perfection.

      KEY NEW CAPABILITIES (USE THEM!):
      1. **White Balance**: Detect if the image is too cool or warm. Fix it using 'temp'.
      2. **Color Grading**: Create cinematic looks! 
         - Example: "Teal & Orange" -> Shadows Hue 180-210 (Cyan/Teal), Highlights Hue 20-40 (Orange).
         - Example: "Moody Green" -> Shadows Hue 120-150.
      3. **Sharpening**: If it's architecture or landscape, add sharpening (20-40). If it's a soft portrait, keep it low (0-10).
      
      IMPORTANT INSTRUCTIONS:
      1. **Do NOT use rigid rules**. Look at the light (soft vs hard), the shadows, and the emotional tone.
      2. **User Guidance**: The user may provide a hint. If they do, PRIORITIZE it above all else.
      
      User's Hint/Preference: "${userHint || 'No specific preference provided. Use your best artistic judgment.'}"

      Available Film Styles & their Aesthetic Characteristics:
      - 'Provia': Standard, faithful.
      - 'Velvia': Vivid, high contrast, landscapes.
      - 'Astia': Soft, portraits.
      - 'Classic Chrome': Desaturated, documentary, moody.
      - 'Reala Ace': Sharp, modern, realistic.
      - 'Classic Neg': Hard tonality, retro, reddish highlights/cyan shadows.
      - 'Nostalgic Neg': Warm amber highlights, vintage.
      - 'Eterna': Cinema, flat, low contrast.
      - 'Acros': Black & White.

      Return a valid JSON object matching the schema.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          { text: prompt },
          { inlineData: { mimeType: "image/jpeg", data: base64Image } }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: adjustmentsSchema,
        temperature: 0.7, // Slightly higher creative freedom
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
