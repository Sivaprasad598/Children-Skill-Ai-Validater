
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
  answerContent: string; // Should be full Data URL or raw text
  referenceContent?: string; // Should be full Data URL or raw text
}): Promise<ValidationReport> {
  const { inputType, referenceType, language, answerContent, referenceContent } = params;

  const systemInstruction = `
    You are an elite Academic Auditor. Your task is to provide a standardized validation of a student's answer against a "Source of Truth".

    STRICT HIERARCHICAL SCORING PROTOCOL (Total Score 0-100):
    
    STEP 1: FACTUAL CORRECTNESS (70% weight) - THE MOST IMPORTANT
    - Compare the student's core claims against the Source of Truth.
    - If the student is factually wrong on the main point, the OVERALL score must be low (e.g., if the answer is completely wrong, score < 20).
    - If the student is factually correct, start with 70 points.
    
    STEP 2: COMPLETENESS (20% weight)
    - Check if all required components from the Source of Truth are present.
    - If core facts are correct but 50% of the detail is missing, deduct 10 points from this section.
    
    STEP 3: LINGUISTIC QUALITY (10% weight)
    - Assess spelling and grammar. 
    - This is the LEAST important. A factually perfect answer with poor grammar should still score at least 90/100.

    CONSISTENCY RULE: Be ruthless about facts. A beautifully written lie is a 0% accurate answer.

    OUTPUT SPECIFICATIONS:
    - All feedback and analysis MUST be in ${language}.
    - 'extractedText': The text you read from the student's submission.
    - 'referenceText': A summary of the correct answer from the source.
    - 'subjectMistakes': List only factual or conceptual errors.
  `;

  const parts: any[] = [];

  // Handle Reference Source
  if (referenceType === ReferenceType.AI_TUTOR) {
    parts.push({ text: "SOURCE OF TRUTH: Your internal expert knowledge." });
  } else if (referenceContent) {
    const { mimeType, data } = parseDataUrl(referenceContent);
    if (mimeType === 'text/plain') {
      parts.push({ text: `SOURCE OF TRUTH (Text): ${data}` });
    } else {
      parts.push({ text: `SOURCE OF TRUTH (${mimeType}):` });
      parts.push({ inlineData: { mimeType, data } });
    }
  }

  // Handle Submission
  const student = parseDataUrl(answerContent);
  if (student.mimeType === 'text/plain') {
    parts.push({ text: `STUDENT SUBMISSION (Text): ${student.data}` });
  } else {
    parts.push({ text: `STUDENT SUBMISSION (${student.mimeType}):` });
    parts.push({ inlineData: { mimeType: student.mimeType, data: student.data } });
  }

  parts.push({ text: "Perform a deep cross-reference validation and return the standardized JSON report." });

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
            overallAccuracy: { type: Type.NUMBER, description: "Factual Correctness (70) + Completeness (20) + Grammar (10)." },
            grammarScore: { type: Type.NUMBER, description: "Scale 0-10." },
            calligraphyScore: { type: Type.NUMBER, description: "Scale 0-10 if handwriting is visible, else 10." },
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
            subjectMistakes: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Specific factual errors found." },
            insights: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Academic improvement tips." },
            extractedText: { type: Type.STRING, description: "Transcription of student submission." },
            referenceText: { type: Type.STRING, description: "Summary of source truth." }
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
      calligraphyScore: reportData.calligraphyScore ? Math.round(reportData.calligraphyScore) : undefined,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      inputType,
      referenceType,
      language,
      rawInputData: answerContent,
      rawReferenceData: referenceContent
    };
  } catch (error: any) {
    console.error("Gemini API Full Error:", error);
    throw error;
  }
}
