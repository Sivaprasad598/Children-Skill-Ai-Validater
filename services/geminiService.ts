
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
       - CRITICAL: Identify "Logical Reversals" where the student uses an antonym or incorrect verb that flips the meaning (e.g., "damage" instead of "protect").
       - If a spelling mistake changes the meaning of a word, or if a typo makes a key term unrecognizable/wrong, it MUST be penalized as a FACTUAL error.

    2. LINGUISTIC PRECISION (20% weight):
       - Spelling, grammar, and sentence structure.
       - If facts are perfect but spelling is messy, deduct from this 20% portion.

    SPECIFIC TASK: Identify "Incorrect Statements". These are full sentences or phrases where the logic is flawed or the information contradicts the source (e.g., "Action is essential to damage the planet").

    OUTPUT REQUIREMENTS:
    - All text in the report must be in ${language}.
    - 'extractedText': Literal transcription of student work.
    - 'incorrectStatements': List phrases that are logically or factually wrong.
    - 'subjectMistakes': List general content/factual gaps.
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

  parts.push({ text: "Perform the validation. Specifically look for sentences with inverted logic or factual errors. Return result in JSON." });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: { parts },
      config: {
        systemInstruction,
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            overallAccuracy: { type: Type.NUMBER },
            grammarScore: { type: Type.NUMBER },
            calligraphyScore: { type: Type.NUMBER },
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
            incorrectStatements: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  statement: { type: Type.STRING, description: "The incorrect sentence from the student's text." },
                  correction: { type: Type.STRING, description: "How the sentence should have been phrased." },
                  reason: { type: Type.STRING, description: "Why this logic is incorrect based on the source." }
                },
                required: ["statement", "correction", "reason"]
              }
            },
            subjectMistakes: { type: Type.ARRAY, items: { type: Type.STRING } },
            insights: { type: Type.ARRAY, items: { type: Type.STRING } },
            extractedText: { type: Type.STRING },
            referenceText: { type: Type.STRING }
          },
          required: ["overallAccuracy", "grammarScore", "spellingMistakes", "grammarMistakes", "subjectMistakes", "incorrectStatements", "insights", "extractedText"]
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
