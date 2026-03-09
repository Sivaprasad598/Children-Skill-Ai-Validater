
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { InputType, ReferenceType, ValidationReport, Mistake, IncorrectStatement } from "../types";

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

/**
 * Generates audio from text using Gemini TTS
 */
async function generateAudio(text: string): Promise<string | undefined> {
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  } catch (error) {
    console.error("TTS Error:", error);
    return undefined;
  }
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
       - Rule 2: Concept Coverage & Missing Content (CRITICAL)
         * Identify specific sections, facts, or concepts present in the PDF that are missing from the student's answer.
         * List these missing parts clearly in the 'subjectMistakes' field.
         * IMPORTANT: Mention the missing parts EXACTLY as they appear in the Reference PDF (using the PDF's original language), rather than translating them into ${language}.
         * Scoring for this pillar:
           - 100% key points covered: 50/50
           - 80-99% key points covered: 40-49/50
           - 60-79% key points covered: 30-39/50
           - 40-59% key points covered: 20-29/50
           - <40% key points covered: 0-19/50
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
       - Spelling Checks (STRICT):
         * 0 mistakes: 100% (15/15)
         * 1-2 mistakes: 70% (10/15)
         * 3-5 mistakes: 40% (6/15)
         * >5 mistakes: 0% (0/15)
       - Deduct marks proportionally for grammar errors. If there are ANY spelling or grammar mistakes, the score MUST be less than 100.

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
    3. Count EVERY spelling and grammar mistake. Do not ignore minor ones. If any exist, the Grammar score MUST be below 100.
    4. Compare the extracted text with the Reference PDF to identify specific missing facts or concepts.
    5. Separately, if the input is an image, analyze the VISUAL quality for Calligraphy (Pillar 4).
    6. Ensure Pillar 1 score is based solely on the text found in step 1, not the visual artifacts from step 5.

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
            subjectMistakes: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of specific missing key concepts, facts, or sections from the reference PDF, and any irrelevant content found." },
            insights: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Specific feedback on structure and handwriting." },
            extractedText: { type: Type.STRING },
            referenceText: { type: Type.STRING }
          },
          required: ["overallAccuracy", "subjectContextScore", "structureScore", "grammarScore", "calligraphyScore", "spellingMistakes", "grammarMistakes", "subjectMistakes", "incorrectStatements", "insights", "extractedText"]
        }
      }
    });

    const reportData = JSON.parse(response.text);
    
    // Manual enforcement of strict scoring rules
    const numSpelling = reportData.spellingMistakes?.length || 0;
    const numGrammar = reportData.grammarMistakes?.length || 0;
    const totalMistakes = numSpelling + numGrammar;

    if (totalMistakes > 0) {
      // Apply strict spelling/grammar scoring if the model was too lenient
      let enforcedGrammarScore = 100;
      if (numSpelling > 0) {
        if (numSpelling <= 2) enforcedGrammarScore = 70;
        else if (numSpelling <= 5) enforcedGrammarScore = 40;
        else enforcedGrammarScore = 0;
      }
      
      // Grammar mistakes also reduce the score
      if (numGrammar > 0) {
        enforcedGrammarScore = Math.min(enforcedGrammarScore, 80); // Cap at 80 if grammar mistakes exist
        enforcedGrammarScore -= (numGrammar * 10); // Deduct 10 per grammar mistake
      }

      reportData.grammarScore = Math.max(0, Math.min(reportData.grammarScore, enforcedGrammarScore));
      
      // Re-calculate overall accuracy based on weights
      // Weighting: Subject Context(50%), Structure(20%), Grammar(15%), Calligraphy(15%)
      const sScore = reportData.subjectContextScore || 0;
      const stScore = reportData.structureScore || 0;
      const gScore = reportData.grammarScore || 0;
      const cScore = reportData.calligraphyScore || 100;
      
      reportData.overallAccuracy = (sScore * 0.5) + (stScore * 0.2) + (gScore * 0.15) + (cScore * 0.15);
    }

    // Generate audio summary of corrections
    let audioData: string | undefined = undefined;
    const correctionsText = [
      `Validation Report for ${subject || 'Submission'}.`,
      `Overall Accuracy: ${Math.round(reportData.overallAccuracy || 0)}%.`,
      reportData.spellingMistakes?.length > 0 ? `Spelling Mistakes: ${reportData.spellingMistakes.map((m: any) => `${m.incorrect} should be ${m.correct}`).join(', ')}.` : '',
      reportData.grammarMistakes?.length > 0 ? `Grammar Mistakes: ${reportData.grammarMistakes.map((m: any) => `${m.incorrect} should be ${m.correct}. ${m.explanation || ''}`).join(' ')}.` : '',
      reportData.incorrectStatements?.length > 0 ? `Incorrect Statements: ${reportData.incorrectStatements.map((s: any) => `${s.statement}. Correction: ${s.correction}. Reason: ${s.reason}`).join(' ')}.` : '',
      reportData.subjectMistakes?.length > 0 ? `Subject Mistakes: ${reportData.subjectMistakes.join('. ')}.` : '',
      reportData.insights?.length > 0 ? `Insights: ${reportData.insights.join('. ')}.` : ''
    ].filter(Boolean).join(' ');

    try {
      if (correctionsText.length > 50) {
        audioData = await generateAudio(`Please read these corrections in ${language}: ${correctionsText}`);
      }
    } catch (audioErr) {
      console.error("Failed to generate audio summary:", audioErr);
    }
    
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
      audioData,
      audioTranscript: correctionsText,
      rawInputData: answerContent,
      rawReferenceData: referenceContent
    };
  } catch (error: any) {
    console.error("Gemini Validation Error:", error);
    throw error;
  }
}
