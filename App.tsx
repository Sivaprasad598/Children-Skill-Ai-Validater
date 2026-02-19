
import React, { useState, useEffect, useRef } from 'react';
import { User, InputType, ReferenceType, ValidationReport, ValidationHistoryItem } from './types';
import { LANGUAGES } from './constants';
import { storageService } from './services/storageService';
import { generateAnalysis } from './services/geminiService';
import Header from './components/Header';
import Auth from './components/Auth';
import ValidationReportView from './components/ValidationReport';
import History from './components/History';
import * as pdfjsLib from 'pdfjs-dist';

// Configure pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.mjs`;

// Specialized PDF renderer component
export const PdfPagePreview: React.FC<{ dataUrl: string; pageNumber: number; onDocumentLoad?: (numPages: number) => void }> = ({ dataUrl, pageNumber, onDocumentLoad }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const renderPage = async () => {
      if (!dataUrl) return;
      setLoading(true);
      try {
        const loadingTask = pdfjsLib.getDocument(dataUrl);
        const pdf = await loadingTask.promise;
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

            const renderContext = {
              canvasContext: context,
              viewport: viewport,
            };
            await page.render(renderContext).promise;
          }
        }
      } catch (err) {
        console.error("PDF Component Error:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    renderPage();
    return () => { isMounted = false; };
  }, [dataUrl, pageNumber]);

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-slate-50 overflow-hidden rounded-xl">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-50/40 backdrop-blur-sm">
          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
      <canvas ref={canvasRef} className="max-w-full max-h-full object-contain shadow-sm" />
    </div>
  );
};

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<'validate' | 'history' | 'profile'>('validate');
  
  // Submission State
  const [inputType, setInputType] = useState<InputType>(InputType.TEXT);
  const [inputValue, setInputValue] = useState<string>('');
  const [uploadedAnswerName, setUploadedAnswerName] = useState<string>('');
  
  // Reference State
  const [referenceType, setReferenceType] = useState<ReferenceType>(ReferenceType.AI_TUTOR);
  const [referenceValue, setReferenceValue] = useState<string>('');
  const [uploadedRefName, setUploadedRefName] = useState<string>('');
  
  // PDF Paging State
  const [refPdfPage, setRefPdfPage] = useState(1);
  const [refPdfTotal, setRefPdfTotal] = useState(1);
  const [subPdfPage, setSubPdfPage] = useState(1);
  const [subPdfTotal, setSubPdfTotal] = useState(1);

  const [outputLanguage, setOutputLanguage] = useState<string>('English');
  const [isProcessing, setIsProcessing] = useState(false);
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
        setUploadedRefName(file.name || 'Ref Document');
        setReferenceValue(data);
        setRefPdfPage(1);
        if (file.type.startsWith('image/')) {
          setReferenceType(ReferenceType.IMAGE);
        } else if (file.type === 'application/pdf') {
          setReferenceType(ReferenceType.PDF);
        } else {
          setReferenceType(ReferenceType.TEXT);
        }
      } else {
        setUploadedAnswerName(file.name || 'Sub Document');
        setInputValue(data);
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

  const handleValidate = async () => {
    if (!inputValue || !user) return;
    setIsProcessing(true);
    try {
      const report = await generateAnalysis({
        inputType,
        referenceType,
        language: outputLanguage,
        answerContent: inputValue,
        referenceContent: referenceType !== ReferenceType.AI_TUTOR ? referenceValue : undefined
      });

      const fullReport: ValidationReport = {
        ...report,
        rawInputData: inputValue,
        rawReferenceData: referenceValue
      };

      setCurrentReport(fullReport);
      
      const historyItem: ValidationHistoryItem = {
        id: crypto.randomUUID(),
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
            <div className="text-center space-y-2">
              <h1 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tighter">AI Verification Hub</h1>
              <p className="text-slate-500 max-w-xl mx-auto text-sm md:text-lg font-medium">Validation powered by BrainGauge Academic Core.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-10">
              {/* Reference Source Panel */}
              <div className="bg-white rounded-[2rem] md:rounded-[3.5rem] shadow-2xl border border-emerald-100 overflow-hidden flex flex-col">
                <div className="bg-slate-900 p-6 md:p-8 text-white">
                  <h3 className="text-xl md:text-2xl font-black flex items-center gap-3">
                    <span className="w-8 h-8 md:w-10 md:h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white text-sm md:text-base">01</span>
                    Source of Truth
                  </h3>
                </div>

                <div className="p-6 md:p-10 flex-1 flex flex-col gap-6">
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: ReferenceType.AI_TUTOR, label: 'AI' },
                      { id: ReferenceType.TEXT, label: 'Text' },
                      { id: ReferenceType.PDF, label: 'PDF' },
                      { id: ReferenceType.IMAGE, label: 'Image' }
                    ].map(btn => (
                      <button
                        key={btn.id}
                        onClick={() => { 
                          setReferenceType(btn.id); 
                          setReferenceValue(''); 
                          setUploadedRefName(''); 
                          setRefPdfPage(1);
                        }}
                        className={`px-4 md:px-6 py-2.5 rounded-xl md:rounded-2xl text-[10px] md:text-xs font-black uppercase tracking-wider transition-all border-2 ${referenceType === btn.id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-400 border-slate-100'}`}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex-1 flex flex-col justify-center min-h-[350px]">
                    {referenceType === ReferenceType.AI_TUTOR && (
                      <div className="p-10 bg-emerald-50/50 rounded-[2rem] border-2 border-emerald-100 border-dashed text-center">
                        <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center mx-auto mb-4 text-emerald-600 shadow-md">
                          <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        </div>
                        <h4 className="text-xl font-black text-emerald-900">Expert AI Mode</h4>
                        <p className="text-sm text-emerald-700/60 mt-2">Comparing against AI global knowledge standards.</p>
                      </div>
                    )}

                    {referenceType === ReferenceType.TEXT && (
                      <textarea
                        placeholder="Paste source material here..."
                        className="w-full flex-1 min-h-[350px] p-6 bg-slate-50 border-2 border-slate-100 rounded-[2rem] focus:border-emerald-500 outline-none transition-all resize-none text-sm md:text-base font-medium"
                        value={referenceValue}
                        onChange={(e) => setReferenceValue(e.target.value)}
                      />
                    )}

                    {referenceType === ReferenceType.PDF && (
                      <div className="space-y-6 flex-1 flex flex-col">
                        <div className="border-3 border-dashed border-slate-200 rounded-[2rem] p-10 text-center hover:bg-emerald-50/30 transition-all cursor-pointer relative group">
                          <input 
                            type="file" 
                            accept="application/pdf" 
                            onChange={(e) => { const f = e.target.files?.[0]; if(f) handleFileRead(f, true); }}
                            className="absolute inset-0 opacity-0 cursor-pointer" 
                          />
                          <div className="flex flex-col items-center gap-3">
                            <div className="p-4 bg-white shadow-xl rounded-2xl text-emerald-600">
                              <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            </div>
                            <p className="text-base font-black text-slate-800">Select PDF Source</p>
                          </div>
                        </div>
                        {referenceValue && (
                          <div className="flex-1 flex flex-col bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] p-5 md:p-8 animate-in fade-in zoom-in duration-500">
                             <div className="flex items-center justify-between mb-6">
                               <div className="flex flex-col">
                                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Viewing Page</p>
                                 <span className="text-xs font-black text-emerald-600">{refPdfPage} <span className="text-slate-300 mx-1">/</span> {refPdfTotal}</span>
                               </div>
                               <div className="flex items-center gap-2">
                                  <button onClick={() => setRefPdfPage(p => Math.max(1, p - 1))} className="p-3 bg-white rounded-xl border-2 border-slate-100 text-slate-600 hover:text-emerald-600 transition-all shadow-sm disabled:opacity-30 disabled:hover:text-slate-600" disabled={refPdfPage <= 1}>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7" /></svg>
                                  </button>
                                  <button onClick={() => setRefPdfPage(p => Math.min(refPdfTotal, p + 1))} className="p-3 bg-white rounded-xl border-2 border-slate-100 text-slate-600 hover:text-emerald-600 transition-all shadow-sm disabled:opacity-30 disabled:hover:text-slate-600" disabled={refPdfPage >= refPdfTotal}>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7" /></svg>
                                  </button>
                                  <button onClick={() => shufflePdf(true)} className="p-3 bg-white rounded-xl border-2 border-slate-100 text-emerald-600 hover:bg-emerald-50 transition-all shadow-sm" title="Random Page">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                  </button>
                                  <button onClick={() => {setReferenceValue(''); setUploadedRefName('');}} className="p-3 bg-white rounded-xl border-2 border-slate-100 text-red-400 hover:text-red-600 transition-all shadow-sm" title="Remove">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
                                  </button>
                               </div>
                            </div>
                            <div className="flex-1 min-h-[400px] relative rounded-2xl overflow-hidden bg-white border-2 border-slate-100 shadow-inner">
                               <PdfPagePreview dataUrl={referenceValue} pageNumber={refPdfPage} onDocumentLoad={setRefPdfTotal} />
                            </div>
                            <p className="mt-4 text-[10px] text-slate-400 font-bold uppercase tracking-tight truncate">{uploadedRefName}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {referenceType === ReferenceType.IMAGE && (
                      <div className="space-y-6 flex-1 flex flex-col">
                        <button 
                          onClick={() => refImageInput.current?.click()} 
                          className="flex flex-col items-center justify-center gap-4 p-12 bg-slate-50 border-2 border-slate-100 border-dashed rounded-[2rem] hover:bg-emerald-50 hover:border-emerald-200 transition-all shadow-sm active:scale-95 group"
                        >
                          <div className="p-5 bg-white rounded-2xl shadow-md text-emerald-500 group-hover:scale-110 transition-transform">
                            <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          </div>
                          <div className="text-center">
                            <span className="block text-sm font-black text-slate-800 uppercase tracking-widest">Upload or Take Photo</span>
                            <span className="text-[10px] text-slate-400 font-bold">Tap to access Camera or Library</span>
                          </div>
                        </button>
                        
                        {referenceValue && (
                          <div className="p-5 bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] flex-1 flex flex-col animate-in fade-in zoom-in duration-500">
                            <div className="flex-1 min-h-[300px] rounded-2xl overflow-hidden shadow-inner bg-slate-200 border border-slate-200 mb-4">
                               <img src={referenceValue} alt="Ref" className="w-full h-full object-contain" />
                            </div>
                            <div className="flex items-center justify-between">
                               <span className="text-[10px] font-bold text-slate-500 truncate max-w-[80%]">{uploadedRefName}</span>
                               <button onClick={() => {setReferenceValue(''); setUploadedRefName('');}} className="text-[10px] font-black text-red-400 uppercase tracking-wider hover:text-red-600">Delete</button>
                            </div>
                          </div>
                        )}
                        <input type="file" ref={refImageInput} accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if(f) handleFileRead(f, true); }} />
                      </div>
                    )}
                  </div>
                </div>
              </div>

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
                      { id: InputType.PDF, label: 'PDF' }
                    ].map(btn => (
                      <button
                        key={btn.id}
                        onClick={() => { 
                          setInputType(btn.id); 
                          setInputValue(''); 
                          setUploadedAnswerName(''); 
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
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
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
                        {inputValue && (
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
                                  <button onClick={() => {setInputValue(''); setUploadedAnswerName('');}} className="p-3 bg-white rounded-xl border-2 border-slate-100 text-red-400 hover:text-red-600 transition-all shadow-sm" title="Remove">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
                                  </button>
                               </div>
                            </div>
                            <div className="flex-1 min-h-[400px] relative rounded-2xl overflow-hidden bg-white border-2 border-slate-100 shadow-inner">
                               <PdfPagePreview dataUrl={inputValue} pageNumber={subPdfPage} onDocumentLoad={setSubPdfTotal} />
                            </div>
                            <p className="mt-4 text-[10px] text-slate-400 font-bold uppercase tracking-tight truncate">{uploadedAnswerName}</p>
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

                        {inputValue && (
                          <div className="p-5 bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] flex-1 flex flex-col animate-in fade-in zoom-in duration-500">
                            <div className="flex-1 min-h-[300px] rounded-2xl overflow-hidden shadow-inner bg-slate-200 border border-slate-200 mb-4">
                               <img src={inputValue} alt="Sub" className="w-full h-full object-contain" />
                            </div>
                            <div className="flex items-center justify-between">
                               <span className="text-[10px] font-bold text-slate-500 truncate max-w-[80%]">{uploadedAnswerName}</span>
                               <button onClick={() => {setInputValue(''); setUploadedAnswerName('');}} className="text-[10px] font-black text-red-400 uppercase tracking-wider hover:text-red-600">Delete</button>
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
                  disabled={isProcessing || !inputValue || (!referenceValue && referenceType !== ReferenceType.AI_TUTOR)}
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
              
              <div className="grid grid-cols-2 gap-4 md:gap-8">
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
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
