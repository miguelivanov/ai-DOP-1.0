import { GoogleGenAI, Type, Modality, GenerateContentResponse } from "@google/genai";

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable is not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const getPovPrompt = (isObjectRotationOnly: boolean): string => {
  if (isObjectRotationOnly) {
    return `
       **Role:** You are an expert 3D object analyst and tabletop cinematographer AI.
    **Objective:** Analyze the input image to determine its current cinematic angle (e.g., eye-level, low-angle, high-angle, three-quarter, dutch tilt, over the shoulder, etc.). Then write three distinct, highly detailed, three-paragraph prompts to generate **three new cinematic angles** of the same subject on a seamless white background.

    **Angle Taxonomy (Object/Tabletop):**
    Choose from (but are not limited to): low-angle hero (worm’s-eye), high-angle/bird’s-eye (30–60° down), three-quarter (45° yaw), rear three-quarter, dutch tilt (10–25°), macro extreme close-up detail, top-front oblique (30° tilt toward camera), top-back oblique (30° tilt away), profile three-quarter. Avoid plain canonical “front/side/top/back” unless folded into a cinematic treatment (e.g., low-angle front).

    **Your process MUST follow these steps precisely:**

    **Step 1: Analyze and Identify.**
    - Examine the input image.
    - Identify the **single** cinematic angle the input most closely represents (e.g., “eye-level three-quarter” or “high-angle top-down”).
    - Keep this identification internal. Example: "The input shows an eye-level three-quarter."

    **Step 2: Select Three New Cinematic Angles.**
    - Pick **three** distinct angles that are **meaningfully different** from the identified input angle and from each other.
    - Ensure variety across vertical level (low/high/eye-level), tilt (level vs. dutch), and scale (macro/detail vs. wider object framing).
    - **Do not** duplicate the input angle.

    **Step 3: Write Three Distinct Prompts.**
    - For **each** chosen cinematic angle, write a unique prompt.
    - Each prompt must place the subject on a clean, seamless **white background** (no horizon lines, no props, no added text).

    **Prompt Structure Requirements (for EACH of the three prompts):**
    - **Exactly Three Paragraphs.**
    - **Paragraph 1 (Angle & Composition):** Name the cinematic angle; specify camera height relative to the subject, tilt, and framing; include lens guidance (e.g., “50mm equivalent,” “85mm macro”) and distance; instruct isolation on a seamless white sweep.
    - **Paragraph 2 (Lighting & Shadow):** Specify key light position using clock-face terms (e.g., key at 10 o’clock, 35° elevation), fill ratio, rim/kicker, diffusion, and how the **ground shadow** falls on the white plane to add volume (soft penumbra, contact shadow).
    - **Paragraph 3 (Subject Details & Material Fidelity):** State which surfaces/edges become newly visible from this angle; require **material/texture/color consistency** with the original image; forbid added logos/props; preserve scale and proportions.

    **Final Output:**
    - Return a single JSON object with one key: "prompts".
    - "prompts" must be an array of **exactly three strings**, each string being one of the three-paragraph prompts.`;
  }

  return `
    **Role:** You are a world-class virtual cinematographer AI.
    **Objective:** Analyze the input image to determine its current cinematic angle (e.g., eye-level, low-angle, high-angle, over-the-shoulder, dutch tilt, POV, extreme close-up, establishing wide, etc.). Then write three distinct, highly detailed, three-paragraph prompts to generate **three new cinematic angles** by moving the **virtual camera**.

    **Angle Taxonomy (Scene/Environment):**
    Consider angles such as: low-angle hero (worm’s-eye), high-angle/bird’s-eye, **over-the-shoulder (OTS)**, POV, dutch tilt (canted), extreme close-up (insert), medium close-up (MCU), cowboy (mid-thigh), wide establishing with leading lines, profile silhouette/backlight, 3/4 push-in, arc/tracking three-quarter.  
    - **Do not invent new characters.** For OTS with a solo subject, frame from behind the subject’s **own shoulder** or use a **non-character environmental foreground** as the shoulder proxy.

    **Your process MUST follow these steps precisely:**

    **Step 1: Analyze and Identify.**
    - Examine the input image.
    - Identify the **single** cinematic angle the input most closely represents (keep this internal).

    **Step 2: Select Three New Cinematic Angles.**
    - Choose **three** angles that differ clearly from the input and from each other (vary height, tilt, subject scale, and foreground/background relationship).
    - Each angle must imply a **new camera position** and composition.

    **Step 3: Write Three Distinct Prompts.**
    - For **each** selected angle, write one prompt that **moves the virtual camera** to that position. The scene, background, and lighting may be re-motivated by this move; maintain world consistency with the original image (style, era, setting).

    **Prompt Structure Requirements (for EACH of the three prompts):**
    - **Exactly Three Paragraphs.**
    - **Paragraph 1 (Camera & Composition):** Name the angle; specify camera height, tilt, compass bearing relative to the subject, framing (ECU/CU/MCU/MS/WS), lens (focal length), distance; describe foreground/background and parallax; if OTS/POV, describe the foreground occluder.
    - **Paragraph 2 (Lighting & Atmosphere):** Motivate the light (e.g., window/practical); give key direction/elevation, fill ratio, back/rim; describe shadows, reflections, haze/atmospherics, and overall mood.
    - **Paragraph 3 (Subject & World Details):** State which new facets of the subject are revealed, how textures/reflections change at this angle, and any background details that become legible; preserve design, palette, and continuity with the original; do **not** add text or unrelated props.

    **Final Output:**
    - Provide your output as a single JSON object with one key: "prompts".
    - "prompts" must be an array containing **exactly three strings**, where each string is one of the three-paragraph prompts you have written.`;
};

export const getRotationPrompts = async (base64Image: string, mimeType: string, isObjectRotationOnly: boolean): Promise<string[]> => {
  const prompt = getPovPrompt(isObjectRotationOnly);
  
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: {
      parts: [
        { inlineData: { data: base64Image, mimeType } },
        { text: prompt }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          prompts: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        }
      }
    }
  });

  try {
    const jsonText = response.text;
    const result = JSON.parse(jsonText);
    if (result && Array.isArray(result.prompts) && result.prompts.length === 3) {
      return result.prompts;
    }
  } catch (e) {
    console.error("Failed to parse JSON from Gemini:", e);
    throw new Error("The AI failed to return valid rotation instructions. Please try a different image.");
  }

  throw new Error("Could not get valid rotation prompts from the AI. The response was malformed.");
};

export const generateRotatedImage = async (base64Image: string, mimeType: string, prompt: string): Promise<string> => {
  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image-preview',
    contents: {
      parts: [
        { inlineData: { data: base64Image, mimeType } },
        { text: prompt }
      ]
    },
    config: {
      temperature: 0,
      responseModalities: [Modality.IMAGE, Modality.TEXT],
    },
  });

  const imagePart = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);
  if (imagePart?.inlineData) {
    const newMimeType = imagePart.inlineData.mimeType;
    const newBase64 = imagePart.inlineData.data;
    return `data:${newMimeType};base64,${newBase64}`;
  }

  throw new Error("The AI did not return an image. It might not be able to process this request.");
};
