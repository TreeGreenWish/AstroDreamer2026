import type { Request, Response } from "express";
import { GoogleGenAI } from "@google/genai";

export default async function handler(req: Request, res: Response) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ ok: false, error: "Gemini key missing" });

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: "Reply with exactly OK.",
    });

    return res.status(200).json({
      ok: response.text?.trim() === "OK",
      model: "gemini-3-flash-preview",
    });
  } catch (error: any) {
    console.error("Gemini credit check failed", error);
    return res.status(error?.status || 500).json({
      ok: false,
      status: error?.status || 500,
      message: String(error?.message || error),
    });
  }
}
