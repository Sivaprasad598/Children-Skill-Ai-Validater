
import React, { useState, useEffect } from 'react';
import { User, InputType, ReferenceType, ValidationReport, ValidationHistoryItem } from './types';
import { LANGUAGES } from './constants';
import { storageService } from './services/storageService';
import { generateAnalysis } from './services/geminiService';
import Header from './components/Header';
import Auth from './components/Auth';
import ValidationReportView from './components/ValidationReport';
import History from './components/History';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<'validate' | 'history' | 'profile'>('validate');
  
  // States for Answer (User Work)
  const [inputType, setInputType] = useState<InputType>(InputType.TEXT);
  const [inputValue, setInputValue] = useState<string>('');
  const [uploadedAnswerName, setUploadedAnswerName] = useState<string>('');
  
  // States for Reference (The Truth)
  const [referenceType, setReferenceType] = useState<ReferenceType>(ReferenceType.AI_TUTOR);
  const [referenceValue, setReferenceValue] = useState<string>('');
  const [uploadedRefName, setUploadedRefName] = useState<string>('');
  
  const [outputLanguage, setOutputLanguage] = useState<string>('English');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [currentReport, setCurrentReport] = useState<ValidationReport | null>(null);
  const [history, setHistory] = useState<ValidationHistoryItem[]>([]);

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
        setUploadedRefName(file.name);
        setReferenceValue(data);
        if (file.type.startsWith('image/')) {
          setReferenceType(ReferenceType.IMAGE);
        } else if (file.type === 'application/pdf') {
          setReferenceType(ReferenceType.PDF);
        } else {
          setReferenceType(ReferenceType.TEXT);
        }
      } else {
        setUploadedAnswerName(file.name);
        setInputValue(data);
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

  const handleValidate = async () => {
    if (!inputValue || !user) return;
    setIsProcessing(true);
    try {
      // NOTE: We no longer strip 'base64,' here because geminiService needs the full Data URL
      // to correctly identify MIME types and handle multimodal input parts.
      
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
      // More descriptive alert for debugging
      const errorMsg = err?.message || 'Check your connection and file formats.';
      alert(`Validation failed: ${errorMsg}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!user) return <Auth onLogin={handleLogin} />;

  return (
    <div className="min-h-screen bg-emerald-50/30 flex flex-col pb-24 md:pb-8">
      <Header 
        user={user} 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        onLogout={handleLogout} 
        isSyncing={isSyncing}
      />

      <main className="flex-1 max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10 w-full overflow-x-hidden">
        {activeTab === 'validate' && !currentReport && (
          <div className="max-w-6xl mx-auto space-y-8 md:space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="text-center space-y-2 px-2">
              <h1 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tighter">AI Verification Hub</h1>
              <p className="text-slate-500 max-w-xl mx-auto text-sm md:text-lg font-medium">Cross-reference your academic work against any source or AI expertise.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-10">
              {/* Reference Source */}
              <div className="bg-white rounded-[2rem] md:rounded-[3rem] shadow-xl border border-emerald-100 overflow-hidden transition-all duration-300">
                <div className="bg-slate-900 p-6 md:p-8 text-white">
                  <h3 className="text-xl md:text-2xl font-black flex items-center gap-3">
                    <span className="w-8 h-8 md:w-10 md:h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white text-sm md:text-base">01</span>
                    Reference Source
                  </h3>
                  <p className="text-slate-400 text-xs md:text-sm mt-2 ml-11 md:ml-13 font-medium">Choose what to compare against</p>
                </div>

                <div className="p-6 md:p-10 space-y-6 md:space-y-8">
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: ReferenceType.AI_TUTOR, label: 'AI' },
                      { id: ReferenceType.TEXT, label: 'Text' },
                      { id: ReferenceType.PDF, label: 'PDF' },
                      { id: ReferenceType.IMAGE, label: 'Image' }
                    ].map(btn => (
                      <button
                        key={btn.id}
                        onClick={() => { setReferenceType(btn.id); if(btn.id === ReferenceType.AI_TUTOR) setReferenceValue(''); setUploadedRefName(''); }}
                        className={`px-4 md:px-6 py-2 md:py-3 rounded-xl md:rounded-2xl text-[10px] md:text-xs font-black uppercase tracking-wider transition-all border-2 ${referenceType === btn.id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-400 border-slate-100'}`}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>

                  {referenceType === ReferenceType.AI_TUTOR && (
                    <div className="p-8 bg-emerald-50/50 rounded-[2rem] border-2 border-emerald-100 border-dashed text-center">
                      <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center mx-auto mb-4 text-emerald-600 shadow-md">
                        <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                      </div>
                      <h4 className="text-lg font-black text-emerald-900">AI Tutor Mode</h4>
                      <p className="text-xs text-emerald-700/70 mt-2">Comparison based on internal AI knowledge.</p>
                    </div>
                  )}

                  {referenceType === ReferenceType.TEXT && (
                    <textarea
                      placeholder="Paste answer key here..."
                      className="w-full h-44 md:h-56 p-4 md:p-6 bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] md:rounded-[2rem] focus:border-emerald-500 outline-none transition-all resize-none text-sm md:text-base font-medium"
                      value={referenceValue}
                      onChange={(e) => setReferenceValue(e.target.value)}
                    />
                  )}

                  {(referenceType === ReferenceType.PDF || referenceType === ReferenceType.IMAGE) && (
                    <div className="border-3 border-dashed border-slate-200 rounded-[1.5rem] md:rounded-[2.5rem] p-8 md:p-14 text-center hover:bg-emerald-50/30 transition-all cursor-pointer relative group">
                      <input 
                        type="file" 
                        accept={referenceType === ReferenceType.IMAGE ? "image/*" : "application/pdf"} 
                        onChange={(e) => { const f = e.target.files?.[0]; if(f) handleFileRead(f, true); }}
                        className="absolute inset-0 opacity-0 cursor-pointer" 
                      />
                      <div className="flex flex-col items-center gap-3 md:gap-5">
                        <div className="p-4 bg-white shadow-xl rounded-2xl text-emerald-600">
                          <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        </div>
                        <p className="text-sm md:text-lg font-black text-slate-800">Upload {referenceType}</p>
                        {uploadedRefName && <span className="text-[10px] md:text-xs font-black text-emerald-600 bg-emerald-100 px-4 py-1.5 rounded-full truncate max-w-full">{uploadedRefName}</span>}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Submission Work */}
              <div className="bg-white rounded-[2rem] md:rounded-[3rem] shadow-xl border border-teal-100 overflow-hidden transition-all duration-300">
                <div className="bg-gradient-to-br from-teal-600 to-emerald-700 p-6 md:p-8 text-white">
                  <h3 className="text-xl md:text-2xl font-black flex items-center gap-3">
                    <span className="w-8 h-8 md:w-10 md:h-10 bg-white/20 rounded-xl flex items-center justify-center text-white text-sm md:text-base">02</span>
                    Submission
                  </h3>
                  <p className="text-teal-100/70 text-xs md:text-sm mt-2 ml-11 md:ml-13 font-medium">Your work to be analyzed</p>
                </div>

                <div className="p-6 md:p-10 space-y-6 md:space-y-8">
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: InputType.TEXT, label: 'Text' },
                      { id: InputType.IMAGE, label: 'Photo' },
                      { id: InputType.PDF, label: 'PDF' }
                    ].map(btn => (
                      <button
                        key={btn.id}
                        onClick={() => { setInputType(btn.id); setInputValue(''); setUploadedAnswerName(''); }}
                        className={`px-4 md:px-6 py-2 md:py-3 rounded-xl md:rounded-2xl text-[10px] md:text-xs font-black uppercase tracking-wider transition-all border-2 ${inputType === btn.id ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-400 border-slate-100'}`}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>

                  {inputType === InputType.TEXT && (
                    <textarea
                      placeholder="Type response here..."
                      className="w-full h-44 md:h-56 p-4 md:p-6 bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] md:rounded-[2rem] focus:border-teal-500 outline-none transition-all resize-none text-sm md:text-base font-medium"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                    />
                  )}

                  {(inputType === InputType.IMAGE || inputType === InputType.PDF) && (
                    <div className="border-3 border-dashed border-slate-200 rounded-[1.5rem] md:rounded-[2.5rem] p-8 md:p-14 text-center hover:bg-teal-50/30 transition-all cursor-pointer relative group">
                      <input 
                        type="file" 
                        accept={inputType === InputType.IMAGE ? "image/*" : "application/pdf"} 
                        onChange={(e) => { const f = e.target.files?.[0]; if(f) handleFileRead(f, false); }}
                        className="absolute inset-0 opacity-0 cursor-pointer" 
                      />
                      <div className="flex flex-col items-center gap-3 md:gap-5">
                        <div className="p-4 bg-white shadow-xl rounded-2xl text-teal-600">
                          <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        </div>
                        <p className="text-sm md:text-lg font-black text-slate-800">Upload Work</p>
                        {uploadedAnswerName && <span className="text-[10px] md:text-xs font-black text-teal-600 bg-teal-100 px-4 py-1.5 rounded-full truncate max-w-full">{uploadedAnswerName}</span>}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Language & Action Footer */}
            <div className="max-w-4xl mx-auto bg-white p-6 md:p-10 rounded-[2rem] md:rounded-[3rem] shadow-xl border border-emerald-50 flex flex-col md:flex-row items-center gap-6">
               <div className="flex-1 w-full space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block px-2">Report Language</label>
                  <select 
                    value={outputLanguage}
                    onChange={(e) => setOutputLanguage(e.target.value)}
                    className="w-full p-4 md:p-5 bg-slate-50 border-2 border-slate-100 rounded-xl md:rounded-2xl outline-none focus:border-emerald-500 font-bold text-slate-700 text-sm md:text-base appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2220%22%20height%3D%2220%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22none%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3Cpath%20d%3D%22M5%207.5L10%2012.5L15%207.5%22%20stroke%3D%22%2310b981%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22/%3E%3C/svg%3E')] bg-[length:20px_20px] bg-[right_1rem_center] bg-no-repeat"
                  >
                    {LANGUAGES.map(l => (
                      <option key={l.code} value={l.code}>{l.name}</option>
                    ))}
                  </select>
               </div>
               
               <button
                  onClick={handleValidate}
                  disabled={isProcessing || !inputValue || (!referenceValue && referenceType !== ReferenceType.AI_TUTOR)}
                  className="w-full md:w-auto md:min-w-[260px] h-14 md:h-16 bg-gradient-to-r from-emerald-600 to-teal-500 text-white font-black text-base md:text-xl rounded-xl md:rounded-2xl shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3"
                >
                  {isProcessing ? (
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Analyzing...
                    </div>
                  ) : (
                    <>
                      <span>Start Validation</span>
                      <svg className="h-5 w-5 md:h-6 md:w-6" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                    </>
                  )}
                </button>
            </div>
          </div>
        )}

        {currentReport && (
          <div className="max-w-6xl mx-auto">
            <ValidationReportView 
              report={currentReport} 
              onClose={() => setCurrentReport(null)} 
            />
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
          <div className="max-w-2xl mx-auto space-y-6 md:space-y-8 animate-in fade-in duration-500">
            <h2 className="text-3xl md:text-4xl font-black text-slate-800 tracking-tight px-2">Account Profile</h2>
            <div className="bg-white p-8 md:p-12 rounded-[2.5rem] md:rounded-[3.5rem] shadow-xl border border-emerald-50 text-center relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-24 md:h-32 bg-emerald-600/5"></div>
              <img src={user.profilePicture} alt={user.name} className="w-28 h-28 md:w-36 md:h-36 rounded-[1.5rem] md:rounded-[2rem] mx-auto border-4 md:border-8 border-white shadow-xl mb-6 relative z-10" />
              <h3 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">{user.name}</h3>
              <p className="text-emerald-600 font-bold mb-8 md:mb-10 text-sm md:text-base">{user.email}</p>
              
              <div className="grid grid-cols-2 gap-4 md:gap-6">
                  <div className="bg-emerald-50 p-6 md:p-8 rounded-[1.5rem] md:rounded-[2.5rem] border border-emerald-100">
                    <span className="block text-3xl md:text-5xl font-black text-emerald-600 mb-1">{history.length}</span>
                    <span className="text-[8px] md:text-[10px] font-black text-emerald-400 uppercase tracking-widest">Validations</span>
                  </div>
                  <div className="bg-teal-50 p-6 md:p-8 rounded-[1.5rem] md:rounded-[2.5rem] border border-teal-100">
                    <span className="block text-3xl md:text-5xl font-black text-teal-600 mb-1">
                      {history.length > 0 ? (history.reduce((acc, curr) => acc + curr.accuracy, 0) / history.length).toFixed(0) : 0}%
                    </span>
                    <span className="text-[8px] md:text-[10px] font-black text-teal-400 uppercase tracking-widest">Avg Quality</span>
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
