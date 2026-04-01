
export enum InputType {
  TEXT = 'TEXT',
  PDF = 'PDF',
  IMAGE = 'IMAGE',
  AUDIO = 'AUDIO',
  AI = 'AI'
}

export enum ReferenceType {
  AI_TUTOR = 'AI_TUTOR',
  TEXT = 'TEXT',
  PDF = 'PDF',
  IMAGE = 'IMAGE'
}

export enum ValidatorType {
  EXACT_MATCH = 'EXACT_MATCH',
  CONCEPTUAL = 'CONCEPTUAL'
}

export enum Subject {
  NONE = 'None',
  TELUGU = 'Telugu',
  ENGLISH = 'English',
  HINDI = 'Hindi',
  MATHS = 'Maths',
  GENERAL_KNOWLEDGE = 'General Knowledge',
  ENVIRONMENTAL_STUDIES = 'Environmental Studies',
  COMPUTER_SCIENCE = 'Computer Science',
  MORAL_SCIENCE = 'Moral Science',
  PHYSICS = 'Physics',
  SOCIAL = 'Social'
}

export interface User {
  id: string;
  name: string;
  email: string;
  profilePicture: string;
  loginType: 'google' | 'guest';
  preferredLanguage: string;
  validatorType: ValidatorType;
  createdDate: string;
}

export interface Mistake {
  incorrect: string;
  correct: string;
  explanation?: string;
}

export interface IncorrectStatement {
  statement: string;
  correction: string;
  reason: string;
}

export interface ValidationReport {
  id: string;
  timestamp: string;
  inputType: InputType;
  referenceType: ReferenceType;
  validatorType: ValidatorType;
  language: string;
  overallAccuracy: number;
  subjectContextScore: number;
  structureScore: number;
  grammarScore: number;
  calligraphyScore?: number;
  spellingMistakes: Mistake[];
  grammarMistakes: Mistake[];
  subjectMistakes: string[];
  incorrectStatements: IncorrectStatement[];
  insights: string[];
  extractedText: string;
  referenceText?: string;
  audioData?: string; // Base64 audio data
  audioTranscript?: string; // Text transcript of the audio summary
  subject?: string;
  subjectFile?: string;
  oralQuestion?: string;
  oralQuestions?: string[];
  rawInputData?: string[];
  rawReferenceData?: string[];
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
