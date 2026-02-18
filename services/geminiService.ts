
import { GoogleGenAI, Type } from "@google/genai";
import { InputType, ReferenceType, ValidationReport } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Helper to safely extract base64 data and mime type from a Data URL.
 */
function parseDataUrl(dataUrl: string): { mimeType: string; data: string } {
  if (!dataUrl.startsWith('data:')) {
    return { mimeType: 'text/plain', data: dataUrl };
  }
  const parts = dataUrl.split(',');
  if (parts.length < 2) return { mimeType: 'text/plain', data: dataUrl };
  
  const mimeMatch = parts[0].match(/data:(.*?);base64/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const data = parts[1];
  
  return { mimeType, data };
}

export async function generateAnalysis(params: {
  inputType: InputType;
  referenceType: ReferenceType;
  language: string;
  answerContent: string;
  referenceContent?: string;
}): Promise<ValidationReport> {
  const { inputType, referenceType, language, answerContent, referenceContent } = params;

  const systemInstruction = `
    You are a Strict Academic Validator. Your goal is to determine how closely a student's submission matches the provided "Source of Truth".

    VALIDATION HIERARCHY (Follow strictly to ensure score consistency):
    
    1. SEMANTIC & FACTUAL MATCH (80% weight):
       - Compare the student's submission against the Source of Truth literal content.
       - Does the student use the correct keywords? Does the logic follow the source exactly?
       - CRITICAL: If a spelling mistake changes the meaning of a word (e.g., "affect" vs "effect", or "complement" vs "compliment"), or if a typo makes a key term unrecognizable/wrong, it MUST be penalized as a FACTUAL error, not just a spelling error.
       - If the core answer is missing or contradicts the source, the score should drop below 40 immediately.

    2. LINGUISTIC PRECISION (20% weight):
       - Spelling, grammar, and sentence structure.
       - If the student has perfect facts but messy spelling (that doesn't change meaning), deduct from this 20% portion.
       - If spelling errors compromise the professional quality or clarity, reflect that here.

    SCORING STANDARDS:
    - Same inputs must result in the same scores. Be objective.
    - Start at 100. Deduct points for:
        a) Missing facts (High penalty)
        b) Wrong facts (Severe penalty)
        c) Semantic-altering typos (Medium-High penalty)
        d) Minor typos/grammar (Low penalty)

    OUTPUT REQUIREMENTS:
    - All text in the report must be in ${language}.
    - 'extractedText': Literal transcription of student work.
    - 'referenceText': Summary of what was expected from the source.
    - 'subjectMistakes': List only the core content/factual gaps.
  `;

  const parts: any[] = [];

  // Handle Reference Source
  if (referenceType === ReferenceType.AI_TUTOR) {
    parts.push({ text: "SOURCE OF TRUTH: Use your internal academic expert knowledge. Provide a high standard." });
  } else if (referenceContent) {
    const { mimeType, data } = parseDataUrl(referenceContent);
    if (mimeType === 'text/plain') {
      parts.push({ text: `SOURCE OF TRUTH (Reference Text): ${data}` });
    } else {
      parts.push({ text: `SOURCE OF TRUTH (${mimeType} Document):` });
      parts.push({ inlineData: { mimeType, data } });
    }
  }

  // Handle Submission
  const student = parseDataUrl(answerContent);
  if (student.mimeType === 'text/plain') {
    parts.push({ text: `STUDENT SUBMISSION (Text): ${student.data}` });
  } else {
    parts.push({ text: `STUDENT SUBMISSION (${student.mimeType} Image/Doc):` });
    parts.push({ inlineData: { mimeType: student.mimeType, data: student.data } });
  }

  parts.push({ text: "Now, perform the strict validation. Cross-check if any typos change the factual meaning. Ensure the overallAccuracy score is consistent and follows the 80/20 rule. Return the result in JSON." });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: { parts },
      config: {
        systemInstruction,
        temperature: 0, // Critical for consistent scoring across same inputs
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            overallAccuracy: { type: Type.NUMBER, description: "Scale 0-100. 80% factual/keyword match, 20% linguistic quality." },
            grammarScore: { type: Type.NUMBER, description: "Scale 0-10." },
            calligraphyScore: { type: Type.NUMBER, description: "Scale 0-10. Handwriting legibility if applicable." },
            spellingMistakes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  incorrect: { type: Type.STRING },
                  correct: { type: Type.STRING }
                },
                required: ["incorrect", "correct"]
              }
            },
            grammarMistakes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  incorrect: { type: Type.STRING },
                  correct: { type: Type.STRING },
                  explanation: { type: Type.STRING }
                },
                required: ["incorrect", "correct"]
              }
            },
            subjectMistakes: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Specific factual or keyword discrepancies from the source." },
            insights: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Expert feedback for the student." },
            extractedText: { type: Type.STRING },
            referenceText: { type: Type.STRING }
          },
          required: ["overallAccuracy", "grammarScore", "spellingMistakes", "grammarMistakes", "subjectMistakes", "insights", "extractedText"]
        }
      }
    });

    const reportData = JSON.parse(response.text);
    
    return {
      ...reportData,
      overallAccuracy: Math.round(reportData.overallAccuracy || 0),
      grammarScore: Math.round(reportData.grammarScore || 0),
      calligraphyScore: reportData.calligraphyScore !== undefined ? Math.round(reportData.calligraphyScore) : undefined,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      inputType,
      referenceType,
      language,
      rawInputData: answerContent,
      rawReferenceData: referenceContent
    };
  } catch (error: any) {
    console.error("Gemini Validation Error:", error);
    throw error;
  }
}
