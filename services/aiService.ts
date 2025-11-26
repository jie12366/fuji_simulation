
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
      description: "Always return 'None / 原图直出'."
    },
    suggestedFilename: {
      type: Type.STRING,
      description: "A short, descriptive snake_case filename based on image content (e.g., sunset_beach_girl.jpg)."
    },
    reasoning: {
      type: Type.STRING,
      description: "A short explanation of the color grading strategy."
    },
    adjustments: {
      type: Type.OBJECT,
      properties: {
        brightness: { type: Type.NUMBER },
        contrast: { type: Type.NUMBER },
        saturation: { type: Type.NUMBER },
        highlights: { type: Type.NUMBER },
        shadows: { type: Type.NUMBER },
        vignette: { type: Type.NUMBER },
        grainAmount: { type: Type.NUMBER },
        sharpening: { type: Type.NUMBER },
        whiteBalance: {
          type: Type.OBJECT,
          properties: {
            temp: { type: Type.NUMBER },
            tint: { type: Type.NUMBER }
          }
        },
        grading: {
          type: Type.OBJECT,
          properties: {
            shadows: { type: Type.OBJECT, properties: { h: { type: Type.NUMBER }, s: { type: Type.NUMBER } } },
            midtones: { type: Type.OBJECT, properties: { h: { type: Type.NUMBER }, s: { type: Type.NUMBER } } },
            highlights: { type: Type.OBJECT, properties: { h: { type: Type.NUMBER }, s: { type: Type.NUMBER } } },
          }
        },
        hsl: {
          type: Type.OBJECT,
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
  required: ["recommendedFilm", "suggestedFilename", "adjustments", "reasoning"]
};

export interface AIAnalysisResult {
  recommendedFilm: string;
  suggestedFilename: string;
  adjustments: Partial<Adjustments>;
  reasoning: string;
}

export const analyzeImage = async (base64Image: string, userHint?: string): Promise<AIAnalysisResult> => {
  try {
    const prompt = `
      Act as a professional high-end digital retoucher using Capture One / Lightroom.
      Analyze the image and create a manual color grading recipe.

      CRITICAL RULES:
      1. **NO FILTERS**: You MUST NOT use specific film simulations. Set 'recommendedFilm' to 'None / 原图直出'.
      2. **MANUAL GRADING**: You must achieve the desired look purely using White Balance, HSL, Tone Curves (Contrast/Shadows/Highlights), and Color Grading (Split Toning).
      3. **QUALITY**: 
         - Grain: 0 (Digital clean look).
         - Sharpening: 35-50 (High fidelity).
      4. **GOAL**: Create a look that matches the content (e.g., if it's a sunset, boost Orange Saturation and warm White Balance; if it's Cyberpunk, shift Blues to Cyan and Magentas).

      **FILENAME GENERATION**:
      Generate a 'suggestedFilename' in snake_case based on content.

      User Hint: "${userHint || ''}"

      Return JSON matching the schema.
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
        temperature: 0.4, 
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
