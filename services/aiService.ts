
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
      description: "The name of the film simulation to use."
    },
    suggestedFilename: {
      type: Type.STRING,
      description: "A short, descriptive snake_case filename based on image content (e.g., sunset_beach_girl.jpg)."
    },
    reasoning: {
      type: Type.STRING,
      description: "A short explanation of why this look was chosen."
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
      Act as a professional digital retoucher.
      Analyze the image and create a Fujifilm recipe.

      MANDATORY REQUIREMENTS:
      1. **NO GRAIN**: Set 'grainAmount' to 0. The user wants a clean, sharp digital look.
      2. **HIGH FIDELITY**: Set 'sharpening' between 30 and 50 to enhance fine details and texture.
      3. **DEPTH**: Use 'contrast' and 'shadows' to create depth, rather than washing out the image with vintage effects.
      4. **COLOR**: Keep skin tones natural but separate them from the background.
      
      **FILENAME GENERATION**:
      Analyze the content of the image (subject, environment, lighting) and generate a 'suggestedFilename' in snake_case English (e.g., 'snow_mountain_sunset', 'cyberpunk_city_night', 'cat_portrait_studio').

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
        temperature: 0.3, 
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