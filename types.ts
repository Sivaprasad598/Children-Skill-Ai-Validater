
export enum InputType {
  TEXT = 'TEXT',
  PDF = 'PDF',
  IMAGE = 'IMAGE',
  AI = 'AI'
}

export enum ReferenceType {
  AI_TUTOR = 'AI_TUTOR',
  TEXT = 'TEXT',
  PDF = 'PDF',
  IMAGE = 'IMAGE'
}

export interface User {
  id: string;
  name: string;
  email: string;
  profilePicture: string;
  loginType: 'google' | 'guest';
  preferredLanguage: string;
  createdDate: string;
}

export interface Mistake {
  incorrect: string;
  correct: string;
  explanation?: string;
}

export interface ValidationReport {
  id: string;
  timestamp: string;
  inputType: InputType;
  referenceType: ReferenceType;
  language: string;
  overallAccuracy: number;
  calligraphyScore?: number;
  grammarScore: number;
  spellingMistakes: Mistake[];
  grammarMistakes: Mistake[];
  subjectMistakes: string[];
  insights: string[];
  extractedText: string;
  referenceText?: string;
  rawInputData?: string; // Base64 or Text
  rawReferenceData?: string; // Base64 or Text
}

export interface ValidationHistoryItem {
  id: string;
  userId: string;
  date: string;
  inputType: InputType;
  referenceType: ReferenceType;
  language: string;
  accuracy: number;
  report: ValidationReport;
}
