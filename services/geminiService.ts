
import { GoogleGenAI, Type } from "@google/genai";
import { InputType, ReferenceType, ValidationReport } from "../types";

let aiInstance: GoogleGenAI | null = null;

function getAI() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

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
  let data = parts[1];
  
  if (mimeType === 'text/plain') {
    try {
      data = atob(data);
    } catch (e) {
      console.error("Failed to decode base64 text:", e);
    }
  }
  
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

  if (subject && subject !== 'None') {
    console.log(`[Gemini] Validating against subject: ${subject}`);
  }

  if (referenceContent) {
    console.log(`[Gemini] Reference content count: ${referenceContent.length}`);
    referenceContent.forEach((c, i) => {
      const { mimeType } = parseDataUrl(c);
      console.log(`[Gemini] Reference ${i} mimeType: ${mimeType}, length: ${c.length}`);
    });
  }

  let subjectContext = "";
  if (subject && subject !== 'None') {
    subjectContext = `
    STRICT SUBJECT VALIDATION:
    The student is being tested on the subject: ${subject}.
    You MUST strictly adhere to the facts related to ${subject} provided in the Source of Truth.
    If the Source of Truth is a document provided for ${subject}, use it as your primary academic reference.
    Do not use external knowledge that contradicts or adds to the provided documents.
    If the student's answer is factually correct according to standard ${subject} curriculum but missing from the provided source, you may still consider it correct, but prioritize the provided source.
    `;
  }

  const systemInstruction = `
    You are a Professional Academic Validator. Your goal is to evaluate a student's submission based on four core pillars: Subject Context, Structure, Grammar/Spelling, and Calligraphy (if applicable).

    ${subjectContext}

    VALIDATION PILLARS & SCORING RULES:

    1. SUBJECT CONTEXT VALIDATION (50% of total score) - CORE SCORING
       - MANDATORY: This score MUST be based ONLY on the semantic content of the student's answer.
       - MODALITY AGNOSTIC: The score for Subject Context must be IDENTICAL for the same content, regardless of whether it was submitted as an Image, PDF, or Text.
       - DO NOT penalize Subject Context score for handwriting quality, smudges, or image clarity. Those are handled ONLY in Pillar 4.
       - CONTENT OVER PRESENTATION: This pillar measures "What is said", not "How it looks".
       - Rule 1: Context Matching
         * Extract key concepts from the provided Subject PDF/Reference Material.
         * Extract key concepts from the student's answer.
         * Calculate semantic similarity (do not just look for exact words).
         * Accept paraphrased answers that convey the same meaning.
       - Rule 2: Concept Coverage
         * 90–100% key points covered: Full marks (50/50 - 100% score for this pillar)
         * 70–89% key points covered: High marks (35-44/50)
         * 40–69% key points covered: Partial marks (20-34/50)
         * <40% key points covered: Low marks (0-19/50)
         * Identify missing key concepts and extra irrelevant content.
         * Penalize off-topic writing.
       - Rule 3: Fact Accuracy
         * Check for incorrect statements or contradictions with the subject material.
         * Penalize wrong scientific facts or historical dates.
         * Deduct marks for each wrong concept detected.

    2. STRUCTURE VALIDATION (20% of total score)
       - Evaluate organization and flow.
       - Check for: Introduction, Logical flow, Paragraph separation, Bullet points (if appropriate).
       - Scoring:
         * Clear intro + body + conclusion: High (16-20/20)
         * Some structure but missing elements: Medium (10-15/20)
         * Random writing/No structure: Low (0-9/20)

    3. GRAMMAR & SPELLING VALIDATION (15% of total score)
       - Grammar Checks: Sentence formation, Subject-verb agreement, Tense consistency, Punctuation.
       - Spelling Checks:
         * 0-2 mistakes: 0% deduction (15/15)
         * 3-5 mistakes: -5% deduction (10/15)
         * 6-10 mistakes: -10% deduction (5/15)
         * >10 mistakes: -15% deduction (0/15)

    4. CALLIGRAPHY / HANDWRITING VALIDATION (15% of total score)
       - ONLY applicable if the input is an IMAGE of a handwritten answer.
       - Evaluate: Readability score, Line alignment, Letter spacing, Overlapping characters, Smudges.
       - Scoring:
         * Very clear: Full (15/15)
         * Slightly messy: Medium (8-14/15)
         * Hard to read: Low (0-7/15)
       - If OCR confidence is low or text is illegible, penalize heavily.
       - IMPORTANT: This is the ONLY pillar where visual presentation is judged. Visual quality MUST NOT affect Pillars 1, 2, or 3.
       - IF THE INPUT IS TEXT OR PDF (NOT AN IMAGE), SET THIS SCORE TO 100.

    STRICT SOURCE OF TRUTH ADHERENCE:
    - If Reference Material is provided, it is your PRIMARY source of truth.
    - Semantic matching is key: rephrased but correct answers are 100% valid.

    THINKING PROCESS:
    1. First, extract the literal text from the submission (OCR for images/PDFs).
    2. Analyze the EXTRACTED TEXT for Subject Context (Pillar 1), Structure (Pillar 2), and Grammar (Pillar 3).
    3. Separately, if the input is an image, analyze the VISUAL quality for Calligraphy (Pillar 4).
    4. Ensure Pillar 1 score is based solely on the text found in step 1, not the visual artifacts from step 3.

    OUTPUT REQUIREMENTS:
    - All text in the report must be in ${language}.
    - 'extractedText': Literal transcription of the ENTIRE student submission.
    - 'referenceText': A concise summary of the relevant parts of the Reference Material.
    - 'overallAccuracy': The final weighted score (0-100).
    - 'subjectContextScore': Score for pillar 1 (0-100).
    - 'structureScore': Score for pillar 2 (0-100).
    - 'grammarScore': Score for pillar 3 (0-100).
    - 'calligraphyScore': Score for pillar 4 (0-100).
  `;

  const parts: any[] = [];

  // Handle Reference Source
  if (referenceContent && referenceContent.length > 0) {
    parts.push({ text: "### REFERENCE MATERIAL (SOURCE OF TRUTH) ###" });
    for (const content of referenceContent) {
      const { mimeType, data } = parseDataUrl(content);
      if (mimeType === 'text/plain') {
        parts.push({ text: `[REFERENCE CONTENT]:\n${data}` });
      } else {
        parts.push({ inlineData: { mimeType, data } });
      }
    }
  } else if (referenceType === ReferenceType.AI_TUTOR) {
    parts.push({ text: "REFERENCE: Use your internal academic expert knowledge." });
  }

  // Handle Submission
  if (answerContent && answerContent.length > 0) {
    parts.push({ text: `STUDENT SUBMISSION TYPE: ${inputType}` });
    parts.push({ text: "STUDENT SUBMISSION TO VALIDATE:" });
    for (const content of answerContent) {
      const { mimeType, data } = parseDataUrl(content);
      if (mimeType === 'text/plain') {
        parts.push({ text: `Student Text: ${data}` });
      } else {
        parts.push({ inlineData: { mimeType, data } });
      }
    }
  }

  parts.push({ text: "Evaluate the submission based on the four pillars and return the JSON report. BE FAIR: If the content is correct, give full marks for Subject Context regardless of the submission format." });

  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts },
      config: {
        systemInstruction,
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            overallAccuracy: { type: Type.NUMBER, description: "Weighted average score (0-100). Weighting: Subject Context(50%), Structure(20%), Grammar(15%), Calligraphy(15%)." },
            subjectContextScore: { type: Type.NUMBER, description: "Score for subject accuracy and coverage (0-100). This must be modality-agnostic." },
            structureScore: { type: Type.NUMBER, description: "Score for organization and flow (0-100)" },
            grammarScore: { type: Type.NUMBER, description: "Score for grammar and spelling (0-100)" },
            calligraphyScore: { type: Type.NUMBER, description: "Score for handwriting readability (0-100). Use 100 if not an image." },
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
                  statement: { type: Type.STRING },
                  correction: { type: Type.STRING },
                  reason: { type: Type.STRING }
                },
                required: ["statement", "correction", "reason"]
              }
            },
            subjectMistakes: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of missing key concepts or irrelevant content." },
            insights: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Specific feedback on structure and handwriting." },
            extractedText: { type: Type.STRING },
            referenceText: { type: Type.STRING }
          },
          required: ["overallAccuracy", "subjectContextScore", "structureScore", "grammarScore", "calligraphyScore", "spellingMistakes", "grammarMistakes", "subjectMistakes", "incorrectStatements", "insights", "extractedText"]
        }
      }
    });

    const reportData = JSON.parse(response.text);
    
    return {
      ...reportData,
      overallAccuracy: Math.round(reportData.overallAccuracy || 0),
      subjectContextScore: Math.round(reportData.subjectContextScore || 0),
      structureScore: Math.round(reportData.structureScore || 0),
      grammarScore: Math.round(reportData.grammarScore || 0),
      calligraphyScore: Math.round(reportData.calligraphyScore || 0),
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
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
