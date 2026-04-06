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
    3. Determine the exact zodiac signs for: Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto, and the Rising Sign (Ascendant).
    4. Provide a brief but deep interpretation of their birth chart.
    
    Return the result in JSON format with the following keys:
    life_path (number), 
    chinese_zodiac (string), 
    birth_chart_interpretation (markdown string),
    sun_sign (string),
    moon_sign (string),
    mercury_sign (string),
    venus_sign (string),
    mars_sign (string),
    jupiter_sign (string),
    saturn_sign (string),
    uranus_sign (string),
    neptune_sign (string),
    pluto_sign (string),
    rising_sign (string)
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
          sun_sign: { type: Type.STRING },
          moon_sign: { type: Type.STRING },
          mercury_sign: { type: Type.STRING },
          venus_sign: { type: Type.STRING },
          mars_sign: { type: Type.STRING },
          jupiter_sign: { type: Type.STRING },
          saturn_sign: { type: Type.STRING },
          uranus_sign: { type: Type.STRING },
          neptune_sign: { type: Type.STRING },
          pluto_sign: { type: Type.STRING },
          rising_sign: { type: Type.STRING },
        },
        required: [
          "life_path", "chinese_zodiac", "birth_chart_interpretation",
          "sun_sign", "moon_sign", "mercury_sign", "venus_sign", 
          "mars_sign", "jupiter_sign", "saturn_sign", "uranus_sign", 
          "neptune_sign", "pluto_sign", "rising_sign"
        ],
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
    2. Identify the zodiac signs for Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune, and Pluto at that moment.
    3. Identify the Moon phase.
    4. Calculate the numerological day number for the dream date (sum of digits of date).
    5. Provide a holistic interpretation of the dream's meaning through this astrological lens, relating it to the user's birth chart.
    6. For each planet (Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto), provide a short (1-2 sentence) specific interpretation of how its position influenced the themes of this specific dream.
    7. Extract a list of "symbols" or "tags" from the dream. These should include elements, feelings, natural imagery, people, events, places, animals, etc. (e.g., "water", "fear", "forest", "mother", "flying").

    Return the result in JSON format with the following keys:
    interpretation (markdown string),
    sun_sign (string),
    moon_sign (string),
    mercury_sign (string),
    venus_sign (string),
    mars_sign (string),
    jupiter_sign (string),
    saturn_sign (string),
    uranus_sign (string),
    neptune_sign (string),
    pluto_sign (string),
    moon_phase (string),
    day_number (number),
    planetary_influences (object with keys: sun, moon, mercury, venus, mars, jupiter, saturn, uranus, neptune, pluto; values are strings),
    tags (array of strings).
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
          uranus_sign: { type: Type.STRING },
          neptune_sign: { type: Type.STRING },
          pluto_sign: { type: Type.STRING },
          moon_phase: { type: Type.STRING },
          day_number: { type: Type.NUMBER },
          planetary_influences: {
            type: Type.OBJECT,
            properties: {
              sun: { type: Type.STRING },
              moon: { type: Type.STRING },
              mercury: { type: Type.STRING },
              venus: { type: Type.STRING },
              mars: { type: Type.STRING },
              jupiter: { type: Type.STRING },
              saturn: { type: Type.STRING },
              uranus: { type: Type.STRING },
              neptune: { type: Type.STRING },
              pluto: { type: Type.STRING },
            },
            required: ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"],
          },
          tags: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        },
        required: [
          "interpretation", "sun_sign", "moon_sign", "mercury_sign", 
          "venus_sign", "mars_sign", "jupiter_sign", "saturn_sign", 
          "uranus_sign", "neptune_sign", "pluto_sign", "moon_phase", "day_number",
          "planetary_influences", "tags"
        ],
      },
    },
  });

  const text = response.text;
  const cleanJson = text.replace(/```json|```/g, "").trim();
  return JSON.parse(cleanJson);
}

export async function getCurrentAstrology(lat: number, lng: number, date: string, time: string) {
  const prompt = `
    Act as a precise astronomer and astrologer.
    Calculate the exact astrological state for the following:
    Date: ${date}
    Time: ${time}
    Location: Lat ${lat}, Lng ${lng}

    Provide the zodiac signs for: Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto.
    Also provide the current Moon Phase.

    Return the result in JSON format with the following keys:
    sun_sign, moon_sign, mercury_sign, venus_sign, mars_sign, jupiter_sign, saturn_sign, uranus_sign, neptune_sign, pluto_sign, moon_phase.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          sun_sign: { type: Type.STRING },
          moon_sign: { type: Type.STRING },
          mercury_sign: { type: Type.STRING },
          venus_sign: { type: Type.STRING },
          mars_sign: { type: Type.STRING },
          jupiter_sign: { type: Type.STRING },
          saturn_sign: { type: Type.STRING },
          uranus_sign: { type: Type.STRING },
          neptune_sign: { type: Type.STRING },
          pluto_sign: { type: Type.STRING },
          moon_phase: { type: Type.STRING },
        },
        required: [
          "sun_sign", "moon_sign", "mercury_sign", "venus_sign", 
          "mars_sign", "jupiter_sign", "saturn_sign", "uranus_sign", 
          "neptune_sign", "pluto_sign", "moon_phase"
        ],
      },
    },
  });

  const text = response.text;
  const cleanJson = text.replace(/```json|```/g, "").trim();
  return JSON.parse(cleanJson);
}

export async function getMonthAstrologyEvents(month: string, year: string) {
  const prompt = `
    Act as a precise astronomer and astrologer.
    List significant astrological events for ${month} ${year}.
    Include events like:
    - Moon phases (New Moon, Full Moon, Quarters)
    - Planetary ingresses (planets moving into new signs)
    - Major aspects (conjunctions, oppositions, trines, squares between major planets)
    - Retrograde stations

    Return the result in JSON format as an array of objects with the following keys:
    date (string, format YYYY-MM-DD),
    event (string, name of the event),
    description (string, brief explanation of its astrological significance).
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            date: { type: Type.STRING },
            event: { type: Type.STRING },
            description: { type: Type.STRING },
          },
          required: ["date", "event", "description"],
        },
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

export async function generateInsights(dreams: Dream[]) {
  const dreamsSummary = dreams.map(d => ({
    title: d.title,
    tags: d.tags,
    sun_sign: d.sun_sign,
    moon_sign: d.moon_sign,
    pluto_sign: d.pluto_sign,
    moon_phase: d.moon_phase,
    day_number: d.day_number
  }));

  const prompt = `
    Act as a data-driven mystic and pattern analyst.
    Analyze the following collection of dreams and their astrological correspondences:
    ${JSON.stringify(dreamsSummary)}

    Task:
    Identify significant patterns and correlations between dream symbols/themes and astrological/numerological factors.
    Provide 3-5 specific, interesting insights.
    Examples:
    - "You dream about water when the moon is in Pisces 78% of the time."
    - "Most of your lucid dreams occur when the sun is in Capricorn."
    - "Your dreams are most intense on Day Number 7."

    Return the result in JSON format as an array of strings.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      },
    },
  });

  const text = response.text;
  const cleanJson = text.replace(/```json|```/g, "").trim();
  return JSON.parse(cleanJson);
}

export async function generateCreativePrompt(dreams: Dream[], insights: string[]) {
  const dreamsSummary = dreams.map(d => ({
    id: d.id,
    title: d.title,
    date: d.date,
    tags: d.tags,
  }));

  const prompt = `
    Act as a mystical creative writing coach.
    Based on the user's past dreams and their current "Insights", generate a creative writing prompt.
    
    Insights:
    ${JSON.stringify(insights)}
    
    Past Dreams:
    ${JSON.stringify(dreamsSummary)}
    
    Task:
    1. Select a recurring symbol (from insights) OR a dream from exactly one year ago (if one exists) OR a significant past dream.
    2. Create a creative writing prompt (e.g., "Write a poem about the symbol of water", "Write a short story based on this dream you had one year ago").
    3. If the prompt is based on a specific dream, provide its ID.
    
    Return the result in JSON format with the following keys:
    prompt (string),
    dreamId (number or null),
    type (string: 'symbol' or 'anniversary' or 'past_dream')
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          prompt: { type: Type.STRING },
          dreamId: { type: Type.NUMBER },
          type: { type: Type.STRING },
        },
        required: ["prompt", "type"],
      },
    },
  });

  const text = response.text;
  const cleanJson = text.replace(/```json|```/g, "").trim();
  return JSON.parse(cleanJson);
}
