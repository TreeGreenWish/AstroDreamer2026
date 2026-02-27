import { GoogleGenAI, Type } from "@google/genai";
import { UserProfile, Dream } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function generateProfileAnalysis(profile: UserProfile) {
  const prompt = `
    Act as an expert astrologer and numerologist.
    Analyze the following birth data:
    Name: ${profile.name}
    Date of Birth: ${profile.dob}
    Time of Birth: ${profile.tob}
    Location: ${profile.lob_name} (Lat: ${profile.lob_lat}, Lng: ${profile.lob_lng})

    1. Calculate the Numerological Life Path number.
    2. Determine the Chinese Zodiac sign.
    3. Provide a brief but deep interpretation of their birth chart (Sun, Moon, Rising, and key planetary placements).
    
    Return the result in JSON format with the following keys:
    life_path (number), chinese_zodiac (string), birth_chart_interpretation (markdown string).
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          life_path: { type: Type.NUMBER },
          chinese_zodiac: { type: Type.STRING },
          birth_chart_interpretation: { type: Type.STRING },
        },
        required: ["life_path", "chinese_zodiac", "birth_chart_interpretation"],
      },
    },
  });

  const text = response.text;
  const cleanJson = text.replace(/```json|```/g, "").trim();
  return JSON.parse(cleanJson);
}

export async function interpretDream(dream: Dream, userProfile: UserProfile) {
  const prompt = `
    Act as a mystical dream interpreter and astrologer.
    
    User Birth Chart Context:
    ${userProfile.birth_chart_interpretation}
    
    Dream Details:
    Title: ${dream.title}
    Content: ${dream.content}
    Date: ${dream.date}
    Time: ${dream.time}
    Location: ${dream.location_name}
    
    Task:
    1. Create a "birth chart" for this dream based on the timing and location.
    2. Identify the zodiac signs for Sun, Moon, Mercury, Venus, Mars, Jupiter, and Saturn at that moment.
    3. Identify the Moon phase.
    4. Calculate the numerological day number for the dream date (sum of digits of date).
    5. Provide a holistic interpretation of the dream's meaning through this astrological lens, relating it to the user's birth chart.

    Return the result in JSON format with the following keys:
    interpretation (markdown string),
    sun_sign (string),
    moon_sign (string),
    mercury_sign (string),
    venus_sign (string),
    mars_sign (string),
    jupiter_sign (string),
    saturn_sign (string),
    moon_phase (string),
    day_number (number).
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          interpretation: { type: Type.STRING },
          sun_sign: { type: Type.STRING },
          moon_sign: { type: Type.STRING },
          mercury_sign: { type: Type.STRING },
          venus_sign: { type: Type.STRING },
          mars_sign: { type: Type.STRING },
          jupiter_sign: { type: Type.STRING },
          saturn_sign: { type: Type.STRING },
          moon_phase: { type: Type.STRING },
          day_number: { type: Type.NUMBER },
        },
        required: [
          "interpretation", "sun_sign", "moon_sign", "mercury_sign", 
          "venus_sign", "mars_sign", "jupiter_sign", "saturn_sign", 
          "moon_phase", "day_number"
        ],
      },
    },
  });

  const text = response.text;
  const cleanJson = text.replace(/```json|```/g, "").trim();
  return JSON.parse(cleanJson);
}

export async function generateDreamImage(dream: Dream) {
  const prompt = `A mystical, ethereal, and surreal digital painting representing this dream: "${dream.title}. ${dream.content}". Artistic style: Dreamy, atmospheric, cinematic lighting, high detail, celestial elements.`;
  
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: { parts: [{ text: prompt }] },
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  return null;
}
