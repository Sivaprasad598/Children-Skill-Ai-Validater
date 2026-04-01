import React, { useState, useEffect, useRef } from 'react';
import { User, InputType, ReferenceType, ValidationReport, ValidationHistoryItem, ValidatorType } from './types';
import { LANGUAGES, SUBJECTS, VALIDATOR_TYPES } from './constants';
import { storageService } from './services/storageService';
import { generateAnalysis, transcribeAudio, generateQuestion } from './services/geminiService';
import Header from './components/Header';
import Auth from './components/Auth';
import ValidationReportView from './components/ValidationReport';
import History from './components/History';
import * as pdfjsLib from 'pdfjs-dist';

// Configure pdf.js worker
const PDF_JS_VERSION = '4.10.38';
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${PDF_JS_VERSION}/build/pdf.worker.min.mjs`;

// Specialized Text renderer component
const TextPreview: React.FC<{ dataUrl: string }> = ({ dataUrl }) => {
  const [text, setText] = useState('');
  useEffect(() => {
    if (!dataUrl) return;
    if (dataUrl.startsWith('data:text/plain;base64,')) {
      const base64 = dataUrl.split(',')[1];
      try {
        setText(atob(base64));
      } catch (e) {
        setText('Error decoding text content.');
      }
    } else if (dataUrl.startsWith('data:')) {
      // Try to extract text even if mime type is different but content might be text
      const parts = dataUrl.split(',');
      if (parts.length > 1) {
        try {
          setText(atob(parts[1]));
        } catch (e) {
          setText('Content is not valid text.');
        }
      }
    } else {
      setText(dataUrl);
    }
  }, [dataUrl]);

  return (
    <div className="w-full h-full p-6 md:p-10 overflow-auto bg-white font-medium text-slate-700 whitespace-pre-wrap text-sm md:text-base text-left">
      {text}
    </div>
  );
};

// Specialized PDF renderer component
export const PdfPagePreview: React.FC<{ dataUrl: string; pageNumber: number; onDocumentLoad?: (numPages: number) => void }> = ({ dataUrl, pageNumber, onDocumentLoad }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTextFallback, setIsTextFallback] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const renderPage = async () => {
      if (!dataUrl) return;
      setLoading(true);
      setError(null);
      setIsTextFallback(null);
      try {
        console.log("Loading PDF from:", dataUrl);
        let pdfData: any = dataUrl;
        
        // If it's a URL/path, fetch it first to ensure we have the data and can handle errors
        if (dataUrl.startsWith('/') || dataUrl.startsWith('http')) {
          const response = await fetch(dataUrl);
          if (!response.ok) throw new Error(`Failed to fetch PDF: ${response.statusText} (${response.status})`);
          
          const contentType = response.headers.get('Content-Type');
          if (contentType && contentType.includes('text/plain')) {
            const text = await response.text();
            if (isMounted) {
              setIsTextFallback(text);
              setLoading(false);
            }
            return;
          }

          const arrayBuffer = await response.arrayBuffer();
          console.log("Fetched PDF size:", arrayBuffer.byteLength);
          pdfData = { data: new Uint8Array(arrayBuffer) };
        }

        const loadingTask = pdfjsLib.getDocument(pdfData);
        const pdf = await loadingTask.promise;
        console.log("PDF loaded, pages:", pdf.numPages);
        if (onDocumentLoad) onDocumentLoad(pdf.numPages);
        
        const targetPage = Math.min(Math.max(1, pageNumber), pdf.numPages);
        const page = await pdf.getPage(targetPage);
        const viewport = page.getViewport({ scale: 1.5 });

        if (canvasRef.current && isMounted) {
          const canvas = canvasRef.current;
          const context = canvas.getContext('2d');
          if (context) {
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            // Fix: Cast renderContext to any to satisfy type definitions that might mismatch with library version
            const renderContext: any = {
              canvasContext: context,
              viewport: viewport,
            };
            await page.render(renderContext).promise;
          }
        }
      } catch (err: any) {
        console.error("PDF Component Error:", err);
        if (isMounted) setError(err.message || "Failed to load PDF");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    renderPage();
    return () => { isMounted = false; };
  }, [dataUrl, pageNumber]);

  if (isTextFallback) {
    return <TextPreview dataUrl={`data:text/plain;base64,${btoa(unescape(encodeURIComponent(isTextFallback)))}`} />;
  }

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-slate-50 overflow-hidden rounded-xl">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-50/40 backdrop-blur-sm">
          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-red-50 p-6 text-center">
          <svg className="w-12 h-12 text-red-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          <p className="text-red-600 font-bold mb-2">PDF Error</p>
          <p className="text-red-500 text-xs">{error}</p>
        </div>
      )}
      <canvas ref={canvasRef} className="max-w-full max-h-full object-contain shadow-sm" />
    </div>
  );
};

// Specialized Audio Recorder component
const VoiceRecorder: React.FC<{ 
  onRecordingComplete: (dataUrl: string, fileName: string) => void,
  disabled?: boolean 
}> = ({ onRecordingComplete, disabled }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    if (disabled) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          onRecordingComplete(dataUrl, `Voice_Input_${new Date().getTime()}.webm`);
        };
        reader.readAsDataURL(blob);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= 89) {
            stopRecording();
            return 90;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err: any) {
      console.error("Failed to start recording:", err);
      setError(err.name === 'NotAllowedError' ? "Microphone access denied. Please check your browser settings." : "Failed to access microphone.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`flex flex-col items-center justify-center gap-6 p-10 border-2 border-dashed rounded-[2rem] transition-all shadow-sm ${
      disabled ? 'bg-slate-100 border-slate-200 cursor-not-allowed opacity-60' : 'bg-slate-50 border-slate-100 hover:bg-teal-50 hover:border-teal-200'
    }`}>
      <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-500 ${
        isRecording ? 'bg-red-500 animate-pulse scale-110 shadow-lg shadow-red-200' : 
        disabled ? 'bg-slate-300' : 'bg-teal-500 shadow-lg shadow-teal-100'
      }`}>
        <button 
          onClick={isRecording ? stopRecording : startRecording}
          disabled={disabled}
          className={`w-full h-full flex items-center justify-center text-white ${disabled ? 'cursor-not-allowed' : ''}`}
        >
          {isRecording ? (
            <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          ) : (
            <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          )}
        </button>
      </div>
      
      <div className="text-center">
        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 text-xs font-bold rounded-xl border border-red-100 animate-in fade-in slide-in-from-top-2 duration-300">
            {error}
          </div>
        )}
        <p className={`text-lg font-black tracking-widest uppercase ${isRecording ? 'text-red-600' : 'text-slate-800'}`}>
          {isRecording ? 'Recording...' : disabled ? 'AI is asking...' : 'Voice Submission'}
        </p>
        <p className="text-2xl font-mono font-black text-slate-600 mt-1">
          {formatTime(recordingTime)}
          <span className="text-xs text-slate-400 ml-1">/ 1:30</span>
        </p>
        {recordingTime > 75 && isRecording && (
          <p className="text-[10px] text-red-500 font-black animate-pulse mt-1">Approaching 1.5m limit!</p>
        )}
        <p className="text-[10px] text-slate-400 font-bold mt-2 uppercase tracking-widest">
          {isRecording ? 'Tap to Stop' : 'Tap to Start Speaking'}
        </p>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<'validate' | 'history' | 'profile'>('validate');
  
  // Submission State
  const [inputType, setInputType] = useState<InputType>(InputType.TEXT);
  const [inputValue, setInputValue] = useState<string[]>([]);
  const [uploadedAnswerNames, setUploadedAnswerNames] = useState<string[]>([]);
  const [transcribedText, setTranscribedText] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  
  // Oral Test State (3 Questions)
  const [oralQuestions, setOralQuestions] = useState<string[]>([]);
  const [oralAnswers, setOralAnswers] = useState<string[]>([]);
  const [currentOralStep, setCurrentOralStep] = useState(0); // 0, 1, 2
  const [isOralTestActive, setIsOralTestActive] = useState(false);
  const [oralQuestionAudio, setOralQuestionAudio] = useState<string | null>(null);
  const [isGeneratingQuestion, setIsGeneratingQuestion] = useState(false);
  const oralAudioRef = useRef<HTMLAudioElement | null>(null);
  
  // Reference State
  const [referenceType, setReferenceType] = useState<ReferenceType>(ReferenceType.AI_TUTOR);
  const [referenceValue, setReferenceValue] = useState<string[]>([]);
  const [uploadedRefNames, setUploadedRefNames] = useState<string[]>([]);
  
  // PDF Paging State
  const [refPdfPage, setRefPdfPage] = useState(1);
  const [refPdfTotal, setRefPdfTotal] = useState(1);
  const [subPdfPage, setSubPdfPage] = useState(1);
  const [subPdfTotal, setSubPdfTotal] = useState(1);

  const [outputLanguage, setOutputLanguage] = useState<string>('English');
  const [selectedSubject, setSelectedSubject] = useState<string>('None');
  const [subjectPreviewContent, setSubjectPreviewContent] = useState<string | null>(null);
  const [subjectPreviewFile, setSubjectPreviewFile] = useState<string | null>(null);
  const [activeSubjectFile, setActiveSubjectFile] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    // Clear previous subject content immediately to avoid stale previews
    setSubjectPreviewContent(null);
    setSubjectPreviewFile(null);
    setOralQuestions([]);
    setOralAnswers([]);
    setCurrentOralStep(0);
    setIsOralTestActive(false);
    setOralQuestionAudio(null);
    setRefPdfPage(1);

    if (selectedSubject !== 'None') {
      const subjectFileMap: Record<string, string> = {
        'telugu': 'telugu.pdf',
        'english': 'english.pdf',
        'hindi': 'hindi.pdf',
        'maths': 'maths.pdf',
        'general knowledge': 'general_knowledge.pdf',
        'environmental studies': 'environmental_studies.pdf',
        'computer science': 'Computer Science.pdf',
        'moral science': 'moral_science.pdf'
      };
      
      const fileName = subjectFileMap[selectedSubject.toLowerCase()];
      if (fileName) {
        const cacheBuster = Date.now();
        setSubjectPreviewContent(`/subjects/${fileName}?t=${cacheBuster}`);
        setSubjectPreviewFile(fileName);
      }
    }
  }, [selectedSubject]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [currentReport, setCurrentReport] = useState<ValidationReport | null>(null);
  const [history, setHistory] = useState<ValidationHistoryItem[]>([]);

  // Consolidated Image Refs
  const refImageInput = useRef<HTMLInputElement>(null);
  const subImageInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedUser = storageService.getUser();
    if (savedUser) {
      setUser(savedUser);
      setHistory(storageService.getHistory(savedUser.id));
      setOutputLanguage(savedUser.preferredLanguage);
    }
  }, []);

  const handleLogin = (newUser: User) => {
    setUser(newUser);
    setHistory(storageService.getHistory(newUser.id));
  };

  const handleLogout = () => {
    storageService.clearUser();
    setUser(null);
  };

  const handleFileRead = (file: File, isReference: boolean) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const data = event.target?.result as string;
      
      if (isReference) {
        setUploadedRefNames(prev => [...prev, file.name || 'Ref Document']);
        setReferenceValue(prev => [...prev, data]);
        setRefPdfPage(1);
        if (file.type.startsWith('image/')) {
          setReferenceType(ReferenceType.IMAGE);
        } else if (file.type === 'application/pdf') {
          setReferenceType(ReferenceType.PDF);
        } else {
          setReferenceType(ReferenceType.TEXT);
        }
      } else {
        setUploadedAnswerNames(prev => [...prev, file.name || 'Sub Document']);
        setInputValue(prev => [...prev, data]);
        setSubPdfPage(1);
        if (file.type.startsWith('image/')) {
          setInputType(InputType.IMAGE);
        } else if (file.type === 'application/pdf') {
          setInputType(InputType.PDF);
        } else {
          setInputType(InputType.TEXT);
        }
      }
    };
    
    reader.readAsDataURL(file);
  };

  const shufflePdf = (isRef: boolean) => {
    if (isRef) {
      if (refPdfTotal > 1) {
        let newPage;
        do { newPage = Math.floor(Math.random() * refPdfTotal) + 1; } while (newPage === refPdfPage && refPdfTotal > 1);
        setRefPdfPage(newPage);
      }
    } else {
      if (subPdfTotal > 1) {
        let newPage;
        do { newPage = Math.floor(Math.random() * subPdfTotal) + 1; } while (newPage === subPdfPage && subPdfTotal > 1);
        setSubPdfPage(newPage);
      }
    }
  };

  const handleStartOralTest = async (isNext = false) => {
    if (selectedSubject === 'None') return;
    
    // Stop any currently playing oral audio
    if (oralAudioRef.current) {
      oralAudioRef.current.pause();
      oralAudioRef.current = null;
    }

    if (!isNext) {
      // Starting a fresh 3-question test
      setOralQuestions([]);
      setOralAnswers([]);
      setCurrentOralStep(0);
      setIsOralTestActive(true);
      setInputValue([]);
      setUploadedAnswerNames([]);
      setTranscribedText(null);
      setTranscriptionError(null);
    } else {
      setInputValue([]);
      setUploadedAnswerNames([]);
      setTranscribedText(null);
      setTranscriptionError(null);
    }

    setIsGeneratingQuestion(true);
    setOralQuestionAudio(null);
    
    try {
      let finalReferenceContent = referenceValue.length > 0 ? [...referenceValue] : [];
      
      // If AI Tutor is selected but a subject is chosen, use the preview content
      if (selectedSubject !== 'None' && subjectPreviewContent) {
        let content = subjectPreviewContent;
        
        // If it's a path, fetch the content and convert to data URL for Gemini
        if (subjectPreviewContent.startsWith('/subjects/')) {
          try {
            const resp = await fetch(subjectPreviewContent);
            const blob = await resp.blob();
            content = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          } catch (err) {
            console.error("Failed to fetch subject content for oral test:", err);
          }
        }
        
        finalReferenceContent.push(content);
      }

      const { question, audioData } = await generateQuestion({
        subject: selectedSubject,
        referenceContent: finalReferenceContent.length > 0 ? finalReferenceContent : undefined,
        language: outputLanguage,
        previousQuestion: oralQuestions[oralQuestions.length - 1] || undefined
      });
      
      setOralQuestions(prev => [...prev, question]);
      setCurrentOralStep(prev => prev + 1);

      if (audioData) {
        setOralQuestionAudio(audioData);
        const audio = new Audio(audioData);
        oralAudioRef.current = audio;
        audio.onended = () => {
          oralAudioRef.current = null;
        };
        audio.play();
      }
    } catch (error) {
      console.error("Oral Test Error:", error);
    } finally {
      setIsGeneratingQuestion(false);
    }
  };

  const handleValidate = async () => {
    if (inputValue.length === 0 || !user) return;
    setIsProcessing(true);
    try {
      let finalReferenceContent = referenceType !== ReferenceType.AI_TUTOR ? referenceValue : undefined;
      let finalReferenceType = referenceType;
      setActiveSubjectFile(null);

      // If AI Tutor is selected but a subject is chosen, use the preview content
      if (referenceType === ReferenceType.AI_TUTOR && selectedSubject !== 'None' && subjectPreviewContent) {
        let content = subjectPreviewContent;
        
        // If it's a path, fetch the content and convert to data URL for Gemini
        if (subjectPreviewContent.startsWith('/subjects/')) {
          try {
            const resp = await fetch(subjectPreviewContent);
            const blob = await resp.blob();
            content = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          } catch (err) {
            console.error("Failed to fetch subject content for validation:", err);
          }
        }
        
        finalReferenceContent = [content];
        setActiveSubjectFile(subjectPreviewFile);
      }

      const report = await generateAnalysis({
        inputType,
        referenceType: finalReferenceType,
        validatorType: user.validatorType,
        language: outputLanguage,
        answerContent: inputType === InputType.AUDIO ? oralAnswers : inputValue,
        referenceContent: finalReferenceContent,
        subject: selectedSubject,
        oralQuestions: inputType === InputType.AUDIO ? oralQuestions : undefined
      });

      const fullReport: ValidationReport = {
        ...report,
        validatorType: user.validatorType,
        subjectFile: activeSubjectFile || undefined,
        oralQuestions: inputType === InputType.AUDIO ? oralQuestions : undefined,
        oralQuestion: inputType === InputType.AUDIO ? oralQuestions.join(' | ') : undefined,
        rawInputData: inputType === InputType.AUDIO ? oralAnswers : inputValue,
        rawReferenceData: finalReferenceContent || []
      };

      setCurrentReport(fullReport);
      
      const historyItem: ValidationHistoryItem = {
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
        userId: user.id,
        date: new Date().toISOString(),
        inputType,
        referenceType,
        language: outputLanguage,
        accuracy: report.overallAccuracy,
        report: fullReport
      };

      storageService.saveHistory(historyItem);
      setHistory(prev => [historyItem, ...prev]);
      setIsSyncing(true);
      setTimeout(() => setIsSyncing(false), 2000);
    } catch (err: any) {
      console.error(err);
      alert(`Validation Error: ${err?.message || 'Check connection'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!user) return <Auth onLogin={handleLogin} />;

  return (
    <div className="min-h-screen bg-emerald-50/30 flex flex-col pb-24 md:pb-8">
      <Header user={user} activeTab={activeTab} setActiveTab={setActiveTab} onLogout={handleLogout} isSyncing={isSyncing} />

      <main className="flex-1 max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10 w-full">
        {activeTab === 'validate' && !currentReport && (
          <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="text-center space-y-4">
              <h1 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tighter">AI Verification Hub</h1>
              <p className="text-slate-500 max-w-xl mx-auto text-sm md:text-lg font-medium">Validation powered by BrainGauge Academic Core.</p>
              
              <div className="max-w-md mx-auto pt-4">
                 <div className="bg-white p-4 rounded-3xl shadow-lg border border-emerald-100 flex flex-col gap-2 relative overflow-hidden">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block px-2 text-left">Academic Subject Context</label>
                  <select 
                    value={selectedSubject}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedSubject(val);
                      // Automatically switch to AI tab when a subject is selected
                      if (val !== 'None') {
                        setReferenceType(ReferenceType.AI_TUTOR);
                      }
                    }}
                    className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-emerald-500 font-bold text-slate-700 text-sm appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2220%22%20height%3D%2220%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22none%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3Cpath%20d%3D%22M5%207.5L10%2012.5L15%207.5%22%20stroke%3D%22%2310b981%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22/%3E%3C/svg%3E')] bg-[length:20px_20px] bg-[right_1.2rem_center] bg-no-repeat disabled:opacity-50"
                  >
                    {SUBJECTS.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  {activeSubjectFile && (
                    <div className="px-2 pt-1 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">
                        Referring to: <span className="text-emerald-600">{activeSubjectFile}</span>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className={`grid grid-cols-1 ${selectedSubject !== 'None' ? 'lg:grid-cols-2' : ''} gap-6 md:gap-10`}>
              {/* Subject Reference PDF Viewer - Appears when a subject is selected */}
              {selectedSubject !== 'None' && subjectPreviewContent && (
                <div className="bg-white rounded-[2rem] md:rounded-[3.5rem] shadow-2xl border border-emerald-100 overflow-hidden flex flex-col animate-in fade-in slide-in-from-left-8 duration-700">
                  <div className="bg-slate-900 p-6 md:p-8 text-white">
                    <h3 className="text-xl md:text-2xl font-black flex items-center gap-3">
                      <span className="w-8 h-8 md:w-10 md:h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white text-sm md:text-base">01</span>
                      Subject Reference
                    </h3>
                  </div>

                  <div className="p-6 md:p-10 flex-1 flex flex-col gap-6">
                    <div className="flex-1 flex flex-col bg-emerald-50/30 border-2 border-emerald-100 rounded-[2.5rem] p-5 md:p-8">
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex flex-col">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Textbook Context</p>
                          <span className="text-xs font-black text-emerald-600">{refPdfPage} <span className="text-slate-300 mx-1">/</span> {refPdfTotal}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setRefPdfPage(p => Math.max(1, p - 1))} className="p-3 bg-white rounded-xl border-2 border-slate-100 text-slate-600 hover:text-emerald-600 transition-all shadow-sm disabled:opacity-30" disabled={refPdfPage <= 1}>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7" /></svg>
                          </button>
                          <button onClick={() => setRefPdfPage(p => Math.min(refPdfTotal, p + 1))} className="p-3 bg-white rounded-xl border-2 border-slate-100 text-slate-600 hover:text-emerald-600 transition-all shadow-sm disabled:opacity-30" disabled={refPdfPage >= refPdfTotal}>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7" /></svg>
                          </button>
                          <button onClick={() => shufflePdf(true)} className="p-3 bg-white rounded-xl border-2 border-slate-100 text-emerald-600 hover:bg-emerald-50 transition-all shadow-sm" title="Random Page">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357-2H15" /></svg>
                          </button>
                        </div>
                      </div>
                      <div className="flex-1 min-h-[450px] relative rounded-2xl overflow-hidden bg-white border-2 border-emerald-100 shadow-inner">
                        {(subjectPreviewContent?.includes('application/pdf') || subjectPreviewContent?.split('?')[0].toLowerCase().endsWith('.pdf')) ? (
                          <PdfPagePreview key={subjectPreviewContent} dataUrl={subjectPreviewContent} pageNumber={refPdfPage} onDocumentLoad={setRefPdfTotal} />
                        ) : (
                          <TextPreview dataUrl={subjectPreviewContent || ''} />
                        )}
                      </div>
                      <div className="mt-4 flex items-center justify-between">
                        <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-tight truncate">Referring: {subjectPreviewFile}</p>
                        <button 
                          onClick={() => setSelectedSubject('None')}
                          className="text-[10px] font-black text-red-400 uppercase tracking-wider hover:text-red-600 transition-colors"
                        >
                          Clear Subject
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Submission Panel */}
              <div className="bg-white rounded-[2rem] md:rounded-[3.5rem] shadow-2xl border border-teal-100 overflow-hidden flex flex-col">
                <div className="bg-gradient-to-br from-teal-600 to-emerald-700 p-6 md:p-8 text-white">
                  <h3 className="text-xl md:text-2xl font-black flex items-center gap-3">
                    <span className="w-8 h-8 md:w-10 md:h-10 bg-white/20 rounded-xl flex items-center justify-center text-white text-sm md:text-base">02</span>
                    Submission
                  </h3>
                </div>

                <div className="p-6 md:p-10 flex-1 flex flex-col gap-6">
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: InputType.TEXT, label: 'Text' },
                      { id: InputType.IMAGE, label: 'Photo' },
                      { id: InputType.PDF, label: 'PDF' },
                      { id: InputType.AUDIO, label: 'Audio' }
                    ].map(btn => (
                      <button
                        key={btn.id}
                        onClick={() => { 
                          setInputType(btn.id); 
                          setInputValue([]); 
                          setUploadedAnswerNames([]); 
                          setSubPdfPage(1);
                        }}
                        className={`px-4 md:px-6 py-2.5 rounded-xl md:rounded-2xl text-[10px] md:text-xs font-black uppercase tracking-wider transition-all border-2 ${inputType === btn.id ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-400 border-slate-100'}`}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex-1 flex flex-col justify-center min-h-[350px]">
                    {inputType === InputType.TEXT && (
                      <textarea
                        placeholder="Type your response here..."
                        className="w-full flex-1 min-h-[350px] p-6 bg-slate-50 border-2 border-slate-100 rounded-[2rem] focus:border-teal-500 outline-none transition-all resize-none text-sm md:text-base font-medium"
                        value={inputValue[0] || ''}
                        onChange={(e) => setInputValue([e.target.value])}
                      />
                    )}

                    {inputType === InputType.PDF && (
                      <div className="space-y-6 flex-1 flex flex-col">
                        <div className="border-3 border-dashed border-slate-200 rounded-[2rem] p-10 text-center hover:bg-teal-50/30 transition-all cursor-pointer relative group">
                          <input 
                            type="file" 
                            accept="application/pdf" 
                            onChange={(e) => { const f = e.target.files?.[0]; if(f) handleFileRead(f, false); }}
                            className="absolute inset-0 opacity-0 cursor-pointer" 
                          />
                          <div className="flex flex-col items-center gap-3">
                            <div className="p-4 bg-white shadow-xl rounded-2xl text-teal-600">
                              <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            </div>
                            <p className="text-base font-black text-slate-800">Change Submission PDF</p>
                          </div>
                        </div>
                        {inputValue.length > 0 && (
                          <div className="flex-1 flex flex-col bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] p-5 md:p-8 animate-in fade-in zoom-in duration-500">
                             <div className="flex items-center justify-between mb-6">
                               <div className="flex flex-col">
                                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Viewing Page</p>
                                 <span className="text-xs font-black text-teal-600">{subPdfPage} <span className="text-slate-300 mx-1">/</span> {subPdfTotal}</span>
                               </div>
                               <div className="flex items-center gap-2">
                                  <button onClick={() => setSubPdfPage(p => Math.max(1, p - 1))} className="p-3 bg-white rounded-xl border-2 border-slate-100 text-slate-600 hover:text-teal-600 transition-all shadow-sm disabled:opacity-30 disabled:hover:text-slate-600" disabled={subPdfPage <= 1}>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7" /></svg>
                                  </button>
                                  <button onClick={() => setSubPdfPage(p => Math.min(subPdfTotal, p + 1))} className="p-3 bg-white rounded-xl border-2 border-slate-100 text-slate-600 hover:text-teal-600 transition-all shadow-sm disabled:opacity-30 disabled:hover:text-slate-600" disabled={subPdfPage >= subPdfTotal}>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7" /></svg>
                                  </button>
                                  <button onClick={() => shufflePdf(false)} className="p-3 bg-white rounded-xl border-2 border-slate-100 text-teal-600 hover:bg-teal-50 transition-all shadow-sm" title="Random Page">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                  </button>
                                  <button onClick={() => {setInputValue([]); setUploadedAnswerNames([]);}} className="p-3 bg-white rounded-xl border-2 border-slate-100 text-red-400 hover:text-red-600 transition-all shadow-sm" title="Remove">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
                                  </button>
                               </div>
                            </div>
                            <div className="flex-1 min-h-[400px] relative rounded-2xl overflow-hidden bg-white border-2 border-slate-100 shadow-inner">
                               {(inputValue[0]?.includes('application/pdf') || inputValue[0]?.toLowerCase().endsWith('.pdf')) ? (
                                 <PdfPagePreview dataUrl={inputValue[0]} pageNumber={subPdfPage} onDocumentLoad={setSubPdfTotal} />
                               ) : (
                                 <TextPreview dataUrl={inputValue[0] || ''} />
                               )}
                            </div>
                            <p className="mt-4 text-[10px] text-slate-400 font-bold uppercase tracking-tight truncate">{uploadedAnswerNames.join(', ')}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {inputType === InputType.AUDIO && (
                      <div className="space-y-6 flex-1 flex flex-col">
                        {/* Oral Test Question Generator */}
                        {selectedSubject !== 'None' && (
                          <div className="p-6 bg-emerald-50 border-2 border-emerald-100 rounded-[2.5rem] animate-in fade-in slide-in-from-top-4 duration-700">
                            <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-xs font-black text-emerald-800 uppercase tracking-widest">Oral Test Mode</span>
                                  <span className="text-[10px] text-emerald-600/70 font-bold uppercase tracking-wider">
                                    {selectedSubject} • {oralQuestions.length > 0 ? `Question ${currentOralStep} of 3` : 'Ready'}
                                  </span>
                                </div>
                              </div>
                              {!isOralTestActive ? (
                                <button 
                                  onClick={() => handleStartOralTest(false)}
                                  disabled={isGeneratingQuestion}
                                  className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all"
                                >
                                  Start Oral Test
                                </button>
                              ) : (
                                <div className="flex items-center gap-2">
                                  {currentOralStep < 3 && oralAnswers.length === currentOralStep && (
                                    <button 
                                      onClick={() => handleStartOralTest(true)}
                                      disabled={isGeneratingQuestion}
                                      className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-teal-600 text-white hover:bg-teal-700 shadow-lg shadow-teal-200 transition-all"
                                    >
                                      {isGeneratingQuestion ? 'Generating...' : 'Next Question'}
                                    </button>
                                  )}
                                  <button 
                                    onClick={() => {
                                      if (oralAudioRef.current) {
                                        oralAudioRef.current.pause();
                                        oralAudioRef.current = null;
                                      }
                                      setOralQuestions([]);
                                      setOralAnswers([]);
                                      setCurrentOralStep(0);
                                      setIsOralTestActive(false);
                                    }}
                                    className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-slate-200 text-slate-600 hover:bg-slate-300 transition-all"
                                  >
                                    Exit
                                  </button>
                                </div>
                              )}
                            </div>

                            {oralQuestions.length > 0 && (
                              <div className="space-y-4 animate-in fade-in zoom-in duration-500">
                                {oralQuestions.map((q, idx) => (
                                  <div key={idx} className="space-y-2">
                                    <div className="p-4 bg-white rounded-2xl border border-emerald-100 shadow-sm">
                                      <div className="flex items-center justify-between mb-1">
                                        <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Question {idx + 1}</span>
                                        {idx === oralQuestions.length - 1 && oralQuestionAudio && (
                                          <button 
                                            onClick={() => {
                                              if (oralAudioRef.current) oralAudioRef.current.pause();
                                              const audio = new Audio(oralQuestionAudio);
                                              oralAudioRef.current = audio;
                                              audio.play();
                                            }}
                                            className="text-[10px] font-black text-emerald-600 uppercase flex items-center gap-1"
                                          >
                                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                            Play
                                          </button>
                                        )}
                                      </div>
                                      <p className="text-sm text-slate-800 font-bold italic leading-relaxed">"{q}"</p>
                                    </div>
                                    {oralAnswers[idx] && (
                                      <div className="ml-6 p-3 bg-teal-50 rounded-xl border border-teal-100">
                                        <span className="text-[10px] font-black text-teal-600 uppercase tracking-widest block mb-1">Your Answer</span>
                                        <p className="text-xs text-slate-600 font-medium italic leading-relaxed">"{oralAnswers[idx]}"</p>
                                      </div>
                                    )}
                                  </div>
                                ))}
                                
                                {isGeneratingQuestion && (
                                  <div className="p-4 bg-white/50 rounded-2xl border border-dashed border-emerald-200 animate-pulse">
                                    <div className="h-4 bg-emerald-100 rounded-full w-3/4 mb-2"></div>
                                    <div className="h-4 bg-emerald-100 rounded-full w-1/2"></div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        <VoiceRecorder 
                          disabled={isGeneratingQuestion || !isOralTestActive || oralAnswers.length === 3 || oralAnswers.length === currentOralStep}
                          onRecordingComplete={async (dataUrl, fileName) => {
                            setInputValue([dataUrl]);
                            setUploadedAnswerNames([fileName]);
                            setTranscribedText(null);
                            setTranscriptionError(null);
                            setIsTranscribing(true);
                            try {
                              const text = await transcribeAudio(dataUrl, outputLanguage);
                              setTranscribedText(text);
                              setOralAnswers(prev => [...prev, text]);
                            } catch (err: any) {
                              console.error("Transcription failed:", err);
                              setTranscriptionError(err.message || "Transcription failed. Please try again.");
                            } finally {
                              setIsTranscribing(false);
                            }
                          }} 
                        />
                        {inputValue.length > 0 && (
                          <div className="p-5 bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] flex-1 flex flex-col animate-in fade-in zoom-in duration-500">
                            <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-teal-100 text-teal-600 rounded-xl flex items-center justify-center">
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                  </svg>
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-xs font-black text-slate-800 uppercase tracking-widest">Recorded Audio</span>
                                  <span className="text-[10px] text-slate-400 font-bold">{uploadedAnswerNames[0]}</span>
                                </div>
                              </div>
                              <button onClick={() => {setInputValue([]); setUploadedAnswerNames([]); setTranscribedText(null);}} className="text-[10px] font-black text-red-400 uppercase tracking-wider hover:text-red-600">Delete</button>
                            </div>
                            <audio src={inputValue[0]} controls className="w-full h-10 rounded-lg mb-4" />
                            
                            {/* Transcribed Text Display */}
                            <div className="mt-2 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Transcribed Text</span>
                                {isTranscribing && (
                                  <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 bg-teal-500 rounded-full animate-bounce"></div>
                                    <span className="text-[10px] font-black text-teal-600 uppercase">Transcribing...</span>
                                  </div>
                                )}
                                {transcriptionError && (
                                  <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                                    <span className="text-[10px] font-black text-red-600 uppercase">Error: {transcriptionError}</span>
                                  </div>
                                )}
                              </div>
                              <div className="text-sm text-slate-700 font-medium leading-relaxed italic">
                                {isTranscribing ? (
                                  <div className="space-y-2">
                                    <div className="h-3 bg-slate-100 rounded-full w-full animate-pulse"></div>
                                    <div className="h-3 bg-slate-100 rounded-full w-3/4 animate-pulse"></div>
                                  </div>
                                ) : transcribedText ? (
                                  `"${transcribedText}"`
                                ) : (
                                  <span className="text-slate-300">Awaiting transcription...</span>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {inputType === InputType.IMAGE && (
                      <div className="space-y-6 flex-1 flex flex-col">
                        <button 
                          onClick={() => subImageInput.current?.click()} 
                          className="flex flex-col items-center justify-center gap-4 p-12 bg-slate-50 border-2 border-slate-100 border-dashed rounded-[2rem] hover:bg-teal-50 hover:border-teal-200 transition-all shadow-sm active:scale-95 group"
                        >
                          <div className="p-5 bg-white rounded-2xl shadow-md text-teal-500 group-hover:scale-110 transition-transform">
                            <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          </div>
                          <div className="text-center">
                            <span className="block text-sm font-black text-slate-800 uppercase tracking-widest">Upload or Take Photo</span>
                            <span className="text-[10px] text-slate-400 font-bold">Tap to access Camera or Library</span>
                          </div>
                        </button>

                        {inputValue.length > 0 && (
                          <div className="p-5 bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] flex-1 flex flex-col animate-in fade-in zoom-in duration-500">
                            <div className="grid grid-cols-2 gap-2 mb-4">
                               {inputValue.map((val, idx) => (
                                 <div key={idx} className="aspect-square rounded-xl overflow-hidden shadow-inner bg-slate-200 border border-slate-200 relative group">
                                    <img src={val} alt={`Sub ${idx}`} className="w-full h-full object-cover" />
                                    <button 
                                      onClick={() => {
                                        setInputValue(prev => prev.filter((_, i) => i !== idx));
                                        setUploadedAnswerNames(prev => prev.filter((_, i) => i !== idx));
                                      }}
                                      className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                 </div>
                               ))}
                            </div>
                            <div className="flex items-center justify-between">
                               <span className="text-[10px] font-bold text-slate-500 truncate max-w-[80%]">{uploadedAnswerNames.join(', ')}</span>
                               <button onClick={() => {setInputValue([]); setUploadedAnswerNames([]);}} className="text-[10px] font-black text-red-400 uppercase tracking-wider hover:text-red-600">Delete All</button>
                            </div>
                          </div>
                        )}
                        <input type="file" ref={subImageInput} accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if(f) handleFileRead(f, false); }} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Global Language & Action Bar */}
            <div className="max-w-4xl mx-auto bg-white p-6 md:p-10 rounded-[2.5rem] md:rounded-[3.5rem] shadow-2xl border border-emerald-50 flex flex-col md:flex-row items-center gap-6">
               <div className="flex-1 w-full space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block px-2">Output Language</label>
                  <select 
                    value={outputLanguage}
                    onChange={(e) => setOutputLanguage(e.target.value)}
                    className="w-full p-4 md:p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl md:rounded-3xl outline-none focus:border-emerald-500 font-bold text-slate-700 text-sm md:text-base appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2220%22%20height%3D%2220%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22none%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3Cpath%20d%3D%22M5%207.5L10%2012.5L15%207.5%22%20stroke%3D%22%2310b981%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22/%3E%3C/svg%3E')] bg-[length:20px_20px] bg-[right_1.2rem_center] bg-no-repeat"
                  >
                    {LANGUAGES.map(l => (
                      <option key={l.code} value={l.code}>{l.name}</option>
                    ))}
                  </select>
               </div>
               
               <button
                  onClick={handleValidate}
                  disabled={
                    isProcessing || 
                    (inputType === InputType.AUDIO ? oralAnswers.length < 3 : (inputValue.length === 0 || (inputType === InputType.TEXT && !inputValue[0]?.trim())))
                  }
                  className="w-full md:w-auto md:min-w-[280px] h-14 md:h-20 bg-gradient-to-r from-emerald-600 to-teal-500 text-white font-black text-base md:text-xl rounded-2xl md:rounded-3xl shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3"
                >
                  {isProcessing ? (
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Processing...
                    </div>
                  ) : (
                    <>
                      <span>Analyze Accuracy</span>
                      <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                    </>
                  )}
                </button>
            </div>
          </div>
        )}

        {currentReport && (
          <div className="max-w-6xl mx-auto">
            <ValidationReportView report={currentReport} onClose={() => setCurrentReport(null)} />
          </div>
        )}

        {activeTab === 'history' && (
          <div className="max-w-4xl mx-auto">
            <History 
              history={history} 
              onSelectItem={(item) => {
                setCurrentReport(item.report);
                setActiveTab('validate');
              }} 
              onClearHistory={() => {
                storageService.clearHistory();
                setHistory([]);
              }}
            />
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in duration-500">
            <h2 className="text-3xl md:text-4xl font-black text-slate-800 tracking-tight px-2">Profile Overview</h2>
            <div className="bg-white p-10 md:p-14 rounded-[3rem] md:rounded-[4rem] shadow-2xl border border-emerald-50 text-center relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-32 md:h-40 bg-emerald-500/10"></div>
              <img src={user.profilePicture} alt={user.name} className="w-32 h-32 md:w-40 md:h-40 rounded-[2.5rem] md:rounded-[3rem] mx-auto border-8 border-white shadow-2xl mb-8 relative z-10 object-cover" />
              <h3 className="text-2xl md:text-4xl font-black text-slate-900 tracking-tight">{user.name}</h3>
              <p className="text-emerald-600 font-bold mb-10 text-sm md:text-lg">{user.email}</p>
              
              <div className="grid grid-cols-2 gap-4 md:gap-8 mb-10">
                  <div className="bg-emerald-50 p-8 rounded-[2rem] md:rounded-[2.5rem] border-2 border-emerald-100 shadow-inner">
                    <span className="block text-4xl md:text-6xl font-black text-emerald-600 mb-2">{history.length}</span>
                    <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Validations</span>
                  </div>
                  <div className="bg-teal-50 p-8 rounded-[2rem] md:rounded-[2.5rem] border-2 border-teal-100 shadow-inner">
                    <span className="block text-4xl md:text-6xl font-black text-teal-600 mb-2">
                      {history.length > 0 ? (history.reduce((acc, curr) => acc + curr.accuracy, 0) / history.length).toFixed(0) : 0}%
                    </span>
                    <span className="text-[10px] font-black text-teal-400 uppercase tracking-widest">Accuracy</span>
                  </div>
              </div>

              <div className="text-left space-y-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Validator Configuration</label>
                <div className="grid grid-cols-1 gap-4">
                  {VALIDATOR_TYPES.map((type) => (
                    <button
                      key={type.id}
                      onClick={() => {
                        const updatedUser = { ...user, validatorType: type.id as ValidatorType };
                        setUser(updatedUser);
                        storageService.setUser(updatedUser);
                      }}
                      className={`p-6 rounded-[2rem] border-2 text-left transition-all relative overflow-hidden group ${user.validatorType === type.id ? 'border-emerald-500 bg-emerald-50/50' : 'border-slate-100 hover:border-emerald-200 bg-white'}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className={`font-black text-sm md:text-base ${user.validatorType === type.id ? 'text-emerald-700' : 'text-slate-700'}`}>{type.name}</span>
                        {user.validatorType === type.id && (
                          <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center">
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                          </div>
                        )}
                      </div>
                      <p className={`text-[10px] md:text-xs font-medium leading-relaxed ${user.validatorType === type.id ? 'text-emerald-600/70' : 'text-slate-400'}`}>{type.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;