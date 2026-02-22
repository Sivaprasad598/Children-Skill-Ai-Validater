
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
  answerContent: string[];
  referenceContent?: string[];
  subject?: string;
}): Promise<ValidationReport> {
  const { inputType, referenceType, language, answerContent, referenceContent, subject } = params;

  let subjectContext = "";
  if (subject && subject !== 'None') {
    subjectContext = `
    STRICT SUBJECT VALIDATION:
    The student is being tested on the subject: ${subject}.
    You MUST strictly adhere to the facts related to ${subject} provided in the Source of Truth.
    If multiple reference documents are provided, treat them as the collective source of truth.
    Do not use external knowledge that contradicts or adds to the provided documents.
    `;
  }

  const systemInstruction = `
    You are a Strict Academic Validator. Your goal is to determine how closely a student's submission matches the provided "Source of Truth".

    ${subjectContext}

    STRICT SOURCE OF TRUTH ADHERENCE:
    - If "Reference Material" (Source of Truth) is provided, it is your ONLY source of truth.
    - If the student's text matches the Reference Material literally or semantically, it is 100% CORRECT.
    - DO NOT flag a statement as "Incorrect" if it is present in the Reference Material.
    - You MUST ignore your internal knowledge if it contradicts or adds information not present in the provided Source of Truth.
    - If the student provides information that is NOT mentioned in the Reference Material, you MUST mark it as a "Subject Mistake" or "Incorrect Statement" (even if it is factually true in the real world).

    STRICT SCORING PROTOCOL:
    - 100% Accuracy: The student's answer perfectly matches the facts and logic in the Reference Material.
    - Penalize ONLY for:
        a) Factual contradictions to the Reference Material.
        b) Omissions of critical facts from the Reference Material.
        c) Logical reversals (e.g., saying "bad" when the source says "good").
        d) Information not present in the Reference Material at all.

    QUESTION VS ANSWER DIFFERENTIATION:
    - The student submission may contain BOTH a question and an answer.
    - Identify the "Question" and the "Answer".
    - ONLY validate the "Answer" against the Source of Truth.
    - The "Question" part should be ignored during scoring but included in 'extractedText'.

    OUTPUT REQUIREMENTS:
    - All text in the report must be in ${language}.
    - 'extractedText': Literal transcription of the ENTIRE student submission.
    - 'referenceText': A concise summary of the relevant parts of the Reference Material used for validation.
    - 'incorrectStatements': List phrases from the ANSWER part that are logically or factually wrong according to the source.
    - 'subjectMistakes': List general content/factual gaps found in the ANSWER relative to the source.
  `;

  const parts: any[] = [];

  // Handle Reference Source
  if (referenceContent && referenceContent.length > 0) {
    parts.push({ text: "SOURCE OF TRUTH (Reference Material):" });
    for (const content of referenceContent) {
      const { mimeType, data } = parseDataUrl(content);
      if (mimeType === 'text/plain') {
        parts.push({ text: `Reference Text Content: ${data}` });
      } else {
        parts.push({ inlineData: { mimeType, data } });
      }
    }
    parts.push({ text: "INSTRUCTION: You MUST validate the student's answer ONLY against the Reference Material provided above. Ignore your internal knowledge if it contradicts or adds information not present in the source." });
  } else if (referenceType === ReferenceType.AI_TUTOR) {
    parts.push({ text: "SOURCE OF TRUTH: Use your internal academic expert knowledge. Provide a high standard." });
  }

  // Handle Submission
  if (answerContent && answerContent.length > 0) {
    parts.push({ text: "STUDENT SUBMISSION:" });
    for (const content of answerContent) {
      const { mimeType, data } = parseDataUrl(content);
      if (mimeType === 'text/plain') {
        parts.push({ text: `Student Text: ${data}` });
      } else {
        parts.push({ inlineData: { mimeType, data } });
      }
    }
  }

  parts.push({ text: "Perform the validation. Specifically look for sentences with inverted logic or factual errors. Return result in JSON." });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
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
      subject,
      rawInputData: answerContent,
      rawReferenceData: referenceContent
    };
  } catch (error: any) {
    console.error("Gemini Validation Error:", error);
    throw error;
  }
}
