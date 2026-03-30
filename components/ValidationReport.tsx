
import React, { useState, useMemo, useRef } from 'react';
import { ValidationReport, InputType, ReferenceType } from '../types';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { PdfPagePreview } from '../App';
import { GoogleGenAI, Modality } from "@google/genai";

interface ReportProps {
  report: ValidationReport;
  onClose: () => void;
}

const ValidationReportView: React.FC<ReportProps> = ({ report, onClose }) => {
  const [modalContent, setModalContent] = useState<{ title: string; data: string; type: 'IMAGE' | 'TEXT' | 'PDF' | 'AUDIO' } | null>(null);
  const [modalPdfPage, setModalPdfPage] = useState(1);
  const [modalPdfTotal, setModalPdfTotal] = useState(1);
  const [isSpeaking, setIsSpeaking] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Audio utility functions
  const parseDataUrl = (dataUrl: string) => {
    if (!dataUrl.startsWith('data:')) return dataUrl;
    const parts = dataUrl.split(',');
    if (parts.length < 2) return dataUrl;
    
    const mimeMatch = parts[0].match(/data:(.*?);base64/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'text/plain';
    let data = parts[1];
    
    if (mimeType === 'text/plain') {
      try {
        return atob(data);
      } catch (e) {
        return data;
      }
    }
    return dataUrl;
  };

  const chartData = [
    { name: 'Correct', value: report.overallAccuracy },
    { name: 'Incorrect', value: 100 - report.overallAccuracy }
  ];

  const COLORS = ['#10b981', '#f1f5f9'];

  const displayGrammar = Math.round(report.grammarScore / 10);
  const displayCalligraphy = Math.round(report.calligraphyScore / 10);
  const displaySubject = Math.round(report.subjectContextScore / 10);
  const displayStructure = Math.round(report.structureScore / 10);

  // Audio utility functions
  function decodeBase64(base64: string) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  async function decodeAudioData(
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number,
    numChannels: number,
  ): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
    }
    return buffer;
  }

  const handleSpeech = async (text: string, id: string) => {
    if (isSpeaking) {
      if (isSpeaking === id) {
        // Stop if clicking same button
        if (audioSourceRef.current) {
          audioSourceRef.current.stop();
          audioSourceRef.current = null;
        }
        setIsSpeaking(null);
        setIsPaused(false);
      }
      return;
    }
    setIsSpeaking(id);
    setIsPaused(false);

    try {
      const apiKey = process.env.API_KEY;
      if (!apiKey) {
        throw new Error("API_KEY is required for speech synthesis");
      }
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: text }] }],
        config: {
          systemInstruction: "You are a mature, warm, and professional Indian academic tutor. Speak with a calm, grounded, and authoritative yet encouraging tone. Avoid high-pitched or overly energetic American-style inflections. Focus on clarity and warmth.",
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Charon' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }
        const ctx = audioContextRef.current;
        if (ctx.state === 'suspended') await ctx.resume();
        
        const audioBuffer = await decodeAudioData(decodeBase64(base64Audio), ctx, 24000, 1);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        source.onended = () => {
          setIsSpeaking(null);
          setIsPaused(false);
          audioSourceRef.current = null;
        };
        audioSourceRef.current = source;
        source.start();
      } else {
        setIsSpeaking(null);
      }
    } catch (error) {
      console.error("TTS Error:", error);
      setIsSpeaking(null);
    }
  };

  const togglePause = async () => {
    if (!audioContextRef.current || !isSpeaking) return;
    const ctx = audioContextRef.current;
    
    if (ctx.state === 'running') {
      await ctx.suspend();
      setIsPaused(true);
    } else if (ctx.state === 'suspended') {
      await ctx.resume();
      setIsPaused(false);
    }
  };

  const playReportAudio = async () => {
    if (isSpeaking === 'report-audio') {
      // If already playing, toggle pause
      togglePause();
      return;
    }
    
    if (isSpeaking) return; // Don't interrupt other speech
    
    if (!report.audioData) return;
    setIsSpeaking('report-audio');
    setIsPaused(false);

    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') await ctx.resume();

      const audioBuffer = await decodeAudioData(decodeBase64(report.audioData), ctx, 24000, 1);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => {
        setIsSpeaking(null);
        setIsPaused(false);
        audioSourceRef.current = null;
      };
      audioSourceRef.current = source;
      source.start();
    } catch (error) {
      console.error("Play Audio Error:", error);
      setIsSpeaking(null);
    }
  };

  /**
   * Renders the extracted text with spelling, grammar mistakes, and incorrect statements highlighted in red.
   */
  const annotatedText = useMemo(() => {
    let text = report.extractedText;
    if (!text) return <span className="text-slate-400 italic">No text extracted.</span>;

    const mistakes = [
      ...report.spellingMistakes.map(m => m.incorrect),
      ...report.grammarMistakes.map(m => m.incorrect),
      ...(report.incorrectStatements || []).map(s => s.statement)
    ].filter(Boolean);

    if (mistakes.length === 0) return <span>{text}</span>;

    const sortedMistakes = [...new Set(mistakes)].sort((a, b) => b.length - a.length);
    const escapedMistakes = sortedMistakes.map(m => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`(${escapedMistakes.join('|')})`, 'gi');

    const parts = text.split(regex);

    return parts.map((part, i) => {
      const isMistake = sortedMistakes.some(m => m.toLowerCase() === part.toLowerCase());
      return isMistake ? (
        <span key={i} className="text-red-500 font-bold underline decoration-wavy decoration-red-300">
          {part}
        </span>
      ) : (
        <span key={i}>{part}</span>
      );
    });
  }, [report.extractedText, report.spellingMistakes, report.grammarMistakes, report.incorrectStatements]);

  const handleViewSource = (isReference: boolean) => {
    const data = isReference ? report.rawReferenceData : report.rawInputData;
    const type = isReference ? report.referenceType : report.inputType;
    const title = isReference ? 'Validator Source' : 'Submission';

    if (!data) return;

    let viewType: 'IMAGE' | 'TEXT' | 'PDF' | 'AUDIO' = 'TEXT';
    
    if (data.startsWith('data:image/')) viewType = 'IMAGE';
    else if (data.startsWith('data:application/pdf')) viewType = 'PDF';
    else if (data.startsWith('data:audio/')) viewType = 'AUDIO';
    else if (type === ReferenceType.IMAGE || type === InputType.IMAGE) viewType = 'IMAGE';
    else if (type === ReferenceType.PDF || type === InputType.PDF) viewType = 'PDF';
    else if (type === InputType.AUDIO) viewType = 'AUDIO';

    setModalPdfPage(1);
    setModalContent({
      title,
      data,
      type: viewType
    });
  };

  return (
    <div className="space-y-6 md:space-y-10 animate-in slide-in-from-bottom-6 duration-700 pb-20">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex flex-col">
          <h2 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tighter">Validation Report</h2>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">BrainGauge Semantic Analysis v2.5</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button 
            onClick={onClose} 
            className="flex-1 sm:flex-none px-8 py-3 bg-emerald-600 hover:bg-emerald-700 rounded-full font-black text-white transition-all text-sm shadow-md flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357-2H15" /></svg>
            Retry Validation
          </button>
          <button onClick={onClose} className="flex-1 sm:flex-none px-8 py-3 bg-slate-100 hover:bg-slate-200 rounded-full font-black text-slate-600 transition-all text-sm">
            Dismiss
          </button>
        </div>
      </div>

      {/* Primary Highlights: Annotated Submission */}
      <div className="bg-white rounded-[2rem] md:rounded-[3.5rem] shadow-xl border-2 border-slate-100 overflow-hidden">
        <div className="bg-slate-900 p-6 md:p-8 text-white flex items-center justify-between">
          <h3 className="text-lg md:text-xl font-black flex items-center gap-3">
            <span className="w-8 h-8 bg-emerald-500 text-white rounded-lg flex items-center justify-center text-sm">!</span>
            {report.inputType === InputType.AUDIO ? 'Transcribed Voice Submission' : 'Annotated Submission'}
          </h3>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">
            {report.inputType === InputType.AUDIO ? 'AI Formatted Transcription' : 'Errors Highlighted in Red'}
          </span>
        </div>
        <div className="p-8 md:p-12 bg-slate-50/50">
          <div className="bg-white p-8 md:p-12 rounded-[1.5rem] md:rounded-[2.5rem] border border-slate-100 shadow-sm text-lg md:text-xl leading-relaxed text-slate-700 font-medium whitespace-pre-wrap">
            {annotatedText}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
        {/* Score Circle */}
        <div className="bg-white p-8 md:p-10 rounded-[2rem] md:rounded-[3rem] shadow-xl border border-emerald-50 flex flex-col items-center">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Match Accuracy</h3>
          <div className="h-44 md:h-56 w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl md:text-3xl font-black text-emerald-600">{report.overallAccuracy}%</span>
              <span className="text-[8px] md:text-[10px] font-black text-slate-300 uppercase mt-1">Precision Rate</span>
            </div>
          </div>
        </div>

        {/* Skill Bars */}
        <div className="bg-white p-8 md:p-10 rounded-[2rem] md:rounded-[3rem] shadow-xl border border-emerald-50 space-y-6 md:space-y-8">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Skill Metrics</h3>
          <div className="space-y-6">
            <div className="group">
              <div className="flex justify-between text-[10px] font-black uppercase tracking-wider mb-2">
                <span className="text-slate-500">Subject Context (80%)</span>
                <span className="text-emerald-600 font-black">{displaySubject}/10</span>
              </div>
              <div className="w-full bg-slate-100 h-3 md:h-4 rounded-full overflow-hidden p-0.5 md:p-1">
                <div className="bg-emerald-500 h-full rounded-full transition-all duration-1000" style={{ width: `${displaySubject * 10}%` }}></div>
              </div>
            </div>
            <div className="group">
              <div className="flex justify-between text-[10px] font-black uppercase tracking-wider mb-2">
                <span className="text-slate-500">Structure (10%)</span>
                <span className="text-blue-600 font-black">{displayStructure}/10</span>
              </div>
              <div className="w-full bg-slate-100 h-3 md:h-4 rounded-full overflow-hidden p-0.5 md:p-1">
                <div className="bg-blue-500 h-full rounded-full transition-all duration-1000" style={{ width: `${displayStructure * 10}%` }}></div>
              </div>
            </div>
            <div className="group">
              <div className="flex justify-between text-[10px] font-black uppercase tracking-wider mb-2">
                <span className="text-slate-500">Grammar & Spelling (5%)</span>
                <span className="text-indigo-600 font-black">{displayGrammar}/10</span>
              </div>
              <div className="w-full bg-slate-100 h-3 md:h-4 rounded-full overflow-hidden p-0.5 md:p-1">
                <div className="bg-indigo-500 h-full rounded-full transition-all duration-1000" style={{ width: `${displayGrammar * 10}%` }}></div>
              </div>
            </div>
            <div className="group">
              <div className="flex justify-between text-[10px] font-black uppercase tracking-wider mb-2">
                <span className="text-slate-500">Calligraphy (5%)</span>
                <span className="text-teal-600 font-black">{displayCalligraphy}/10</span>
              </div>
              <div className="w-full bg-slate-100 h-3 md:h-4 rounded-full overflow-hidden p-0.5 md:p-1">
                <div className="bg-teal-500 h-full rounded-full transition-all duration-1000" style={{ width: `${displayCalligraphy * 10}%` }}></div>
              </div>
            </div>
          </div>
        </div>

        {/* Source Tracking */}
        <div className="bg-white p-8 md:p-10 rounded-[2rem] md:rounded-[3rem] shadow-xl border border-emerald-50 space-y-4 md:col-span-2 lg:col-span-1">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Logic Source</h3>
          <div className="grid grid-cols-1 gap-3 md:gap-4">
             <div className="p-4 bg-slate-50 rounded-2xl md:rounded-3xl flex flex-col gap-3 border border-transparent hover:border-emerald-100 transition-all">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase truncate">Validator</p>
                    <p className="text-xs md:text-sm font-bold text-slate-800 truncate">
                      {report.referenceType === ReferenceType.AI_TUTOR && report.subject && report.subject !== 'None' 
                        ? `Textbook (${report.subject})` 
                        : report.referenceType}
                    </p>
                    {report.subjectFile && (
                      <p className="text-[9px] font-bold text-emerald-600 truncate mt-0.5">
                        File: {report.subjectFile}
                      </p>
                    )}
                  </div>
                </div>
                {report.rawReferenceData && report.rawReferenceData.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {report.rawReferenceData.map((data, idx) => (
                      <button 
                        key={idx}
                        onClick={() => {
                          const isPdf = data.startsWith('data:application/pdf') || report.subjectFile?.split('?')[0].toLowerCase().endsWith('.pdf');
                          const isImage = data.startsWith('data:image/');
                          
                          let type: 'IMAGE' | 'TEXT' | 'PDF' = isPdf ? 'PDF' : (isImage ? 'IMAGE' : 'TEXT');
                          let displayData = data;

                          if (type === 'TEXT') {
                            displayData = parseDataUrl(data);
                          } else if (type === 'PDF' && report.subjectFile && report.referenceType === ReferenceType.AI_TUTOR) {
                            // Use the direct URL for subject PDFs to avoid data URL issues and "re-creation"
                            displayData = `/subjects/${report.subjectFile}`;
                          }

                          setModalPdfPage(1);
                          setModalContent({ 
                            title: report.referenceType === ReferenceType.AI_TUTOR && report.subject && report.subject !== 'None'
                              ? `${report.subject} Reference`
                              : `Validator Source ${idx + 1}`, 
                            data: displayData, 
                            type 
                          });
                        }}
                        className="w-10 h-10 bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm hover:border-emerald-500 transition-all flex items-center justify-center"
                      >
                        {data.startsWith('data:image/') ? (
                          <img src={data} alt="Ref" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center bg-emerald-50/50">
                            {(data.startsWith('data:application/pdf') || (report.subjectFile?.split('?')[0].toLowerCase().endsWith('.pdf') && report.referenceType === ReferenceType.AI_TUTOR)) ? (
                              <>
                                <svg className="w-4 h-4 text-emerald-600 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                                <span className="text-[7px] font-black text-emerald-700 uppercase">PDF</span>
                              </>
                            ) : (
                              <div className="flex flex-col items-center">
                                <span className="text-[8px] font-black text-emerald-600 uppercase">
                                  {report.referenceType === ReferenceType.AI_TUTOR ? 'DOC' : 'TXT'}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
             </div>
             <div className="p-4 bg-slate-50 rounded-2xl md:rounded-3xl flex flex-col gap-3 border border-transparent hover:border-teal-100 transition-all">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase truncate">Input</p>
                    <p className="text-xs md:text-sm font-bold text-slate-800 truncate">{report.inputType}</p>
                  </div>
                </div>
                {report.rawInputData && report.rawInputData.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {report.rawInputData.map((data, idx) => (
                      <button 
                        key={idx}
                        onClick={() => {
                          const isPdf = data.startsWith('data:application/pdf');
                          const isImage = data.startsWith('data:image/');
                          const isAudio = data.startsWith('data:audio/');
                          const type = isPdf ? 'PDF' : (isImage ? 'IMAGE' : (isAudio ? 'AUDIO' : 'TEXT'));
                          const displayData = type === 'TEXT' ? parseDataUrl(data) : data;

                          setModalPdfPage(1);
                          setModalContent({ title: `Submission ${idx + 1}`, data: displayData, type });
                        }}
                        className="w-10 h-10 bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm hover:border-teal-500 transition-all"
                      >
                        {data.startsWith('data:image/') ? (
                          <img src={data} alt="Sub" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center bg-teal-50/50">
                            {data.startsWith('data:application/pdf') ? (
                              <>
                                <svg className="w-4 h-4 text-teal-600 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                                <span className="text-[7px] font-black text-teal-700 uppercase">PDF</span>
                              </>
                            ) : data.startsWith('data:audio/') ? (
                              <>
                                <svg className="w-4 h-4 text-teal-600 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                </svg>
                                <span className="text-[7px] font-black text-teal-700 uppercase">AUDIO</span>
                              </>
                            ) : (
                              <span className="text-[8px] font-black text-teal-600 uppercase">TXT</span>
                            )}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
             </div>
          </div>
        </div>
      </div>

      {/* Reference Context Summary */}
      {report.referenceText && (
        <div className="bg-emerald-50/30 border border-emerald-100 p-8 md:p-10 rounded-[2rem] md:rounded-[3rem] shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h3 className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Reference Context Summary</h3>
          </div>
          <p className="text-slate-600 text-xs md:text-sm leading-relaxed font-medium italic">
            "{report.referenceText}"
          </p>
          <p className="text-[8px] font-bold text-emerald-500 uppercase mt-4 tracking-tighter">
            * This summary represents the relevant facts identified by BrainGauge AI from the source material.
          </p>
        </div>
      )}

      {/* NEW: Contradictory Statements Block with Merged TTS Analysis */}
      {report.incorrectStatements && report.incorrectStatements.length > 0 && (
        <div className="bg-red-50 border-2 border-red-100 p-8 md:p-12 rounded-[2rem] md:rounded-[3.5rem] shadow-xl animate-in zoom-in duration-500">
           <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
             <h3 className="text-xl md:text-2xl font-black text-red-900 flex items-center gap-3">
               <div className="w-10 h-10 bg-red-600 text-white rounded-xl flex items-center justify-center text-xl">✕</div>
               Contradictory Logic Detected
             </h3>
             <span className="text-[10px] font-black text-red-400 uppercase tracking-widest bg-white px-4 py-1.5 rounded-full border border-red-100 shadow-sm">AI Verification Critical</span>
           </div>
           
           <div className="space-y-6">
              {report.incorrectStatements.map((item, idx) => {
                const mergedAnalysisText = `Wrong Statement is ${item.statement} & correction is ${item.correction} & the reason is ${item.reason}`;
                const speechId = `merged-${idx}`;
                
                return (
                  <div key={idx} className="bg-white p-6 md:p-8 rounded-[2rem] border border-red-200 shadow-sm space-y-5 group relative hover:shadow-md transition-all">
                     <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">Wrong Statement</span>
                          <button 
                            onClick={() => handleSpeech(mergedAnalysisText, speechId)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all shadow-sm border ${isSpeaking === speechId ? 'bg-red-600 text-white border-red-600 scale-105' : 'bg-red-50 text-red-600 border-red-100 hover:bg-red-600 hover:text-white hover:border-red-600'}`}
                          >
                             <svg className={`w-4 h-4 ${isSpeaking === speechId ? 'animate-pulse' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                             </svg>
                             <span className="text-[10px] font-black uppercase tracking-widest">
                               {isSpeaking === speechId ? 'Reading Analysis...' : 'Play Full Explanation'}
                             </span>
                          </button>
                        </div>
                        <p className="text-slate-800 font-bold italic leading-relaxed text-sm md:text-base">"{item.statement}"</p>
                     </div>
                     
                     <div className="h-px bg-slate-100"></div>
                     
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="flex flex-col gap-2 p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100/50">
                           <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Academic Correction</span>
                           <p className="text-slate-700 font-bold text-sm leading-relaxed">{item.correction}</p>
                        </div>
                        <div className="flex flex-col gap-2 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                           <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Logic Reason</span>
                           <p className="text-slate-500 text-xs italic leading-relaxed font-medium">{item.reason}</p>
                        </div>
                     </div>
                  </div>
                );
              })}
           </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
        {/* Detailed Error Log */}
        <div className="bg-white p-8 md:p-12 rounded-[2rem] md:rounded-[3.5rem] shadow-xl border border-emerald-50">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl md:text-2xl font-black text-slate-800 flex items-center gap-3">
              <span className="w-8 h-8 md:w-10 md:h-10 bg-red-50 text-red-500 rounded-xl flex items-center justify-center">!</span>
              Detailed Corrections
            </h3>
            {report.audioData && (
              <div className="flex items-center gap-2">
                <button 
                  onClick={playReportAudio}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all shadow-sm border ${isSpeaking === 'report-audio' ? 'bg-emerald-600 text-white border-emerald-600 scale-105' : 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-600 hover:text-white hover:border-emerald-600'}`}
                >
                  <svg className={`w-4 h-4 ${isSpeaking === 'report-audio' && !isPaused ? 'animate-pulse' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {isSpeaking === 'report-audio' && !isPaused ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 9v6m4-6v6" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    )}
                  </svg>
                  <span className="text-[10px] font-black uppercase tracking-widest">
                    {isSpeaking === 'report-audio' ? (isPaused ? 'Paused' : 'Playing Summary...') : 'Play Audio Summary'}
                  </span>
                </button>
                {isSpeaking === 'report-audio' && (
                  <button 
                    onClick={() => {
                      if (audioSourceRef.current) {
                        audioSourceRef.current.stop();
                        audioSourceRef.current = null;
                      }
                      setIsSpeaking(null);
                      setIsPaused(false);
                    }}
                    className="p-2 bg-red-50 text-red-500 rounded-xl border border-red-100 hover:bg-red-500 hover:text-white transition-all shadow-sm"
                    title="Stop Audio"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            )}
          </div>

          {report.audioTranscript && (
            <div className="mb-8 p-6 bg-slate-50 rounded-2xl border border-slate-100 animate-in fade-in slide-in-from-top-2 duration-500">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Audio Summary Transcript
              </h4>
              <p className="text-xs md:text-sm text-slate-600 leading-relaxed font-medium italic">
                {report.audioTranscript}
              </p>
            </div>
          )}

          <div className="space-y-6">
            {report.spellingMistakes.length > 0 && (
              <div className="p-4 md:p-6 bg-red-50/30 rounded-2xl md:rounded-[2rem] border-2 border-red-50">
                <h4 className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-4">Spelling Mistakes</h4>
                <div className="flex flex-wrap gap-2 md:gap-3">
                  {report.spellingMistakes.map((m, idx) => (
                    <div key={idx} className="bg-white px-3 md:px-5 py-2 rounded-xl text-[10px] md:text-sm border border-red-100 flex items-center gap-2 shadow-sm">
                      <span className="text-red-400 font-bold line-through">{m.incorrect}</span>
                      <svg className="w-3 h-3 text-slate-300" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
                      <span className="text-emerald-600 font-black">{m.correct}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {report.grammarMistakes.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Grammatical Improvements</h4>
                {report.grammarMistakes.map((m, idx) => (
                  <div key={idx} className="p-4 bg-slate-50 rounded-2xl md:rounded-3xl border border-slate-100 text-xs md:text-sm group hover:border-emerald-200 transition-all">
                    <div className="flex flex-wrap items-center gap-2 md:gap-4 mb-2">
                      <span className="text-red-400/70 line-through font-medium">{m.incorrect}</span>
                      <span className="text-emerald-700 font-black">{m.correct}</span>
                    </div>
                    {m.explanation && <p className="text-[10px] text-slate-500 italic leading-relaxed bg-white/50 p-2 rounded-lg">{m.explanation}</p>}
                  </div>
                ))}
              </div>
            )}
            
            {report.subjectMistakes.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-2">Academic Discrepancies</h4>
                <ul className="space-y-2">
                  {report.subjectMistakes.map((m, idx) => (
                    <li key={idx} className="text-xs md:text-sm font-medium text-slate-700 bg-amber-50/50 p-4 rounded-2xl border border-amber-100 flex gap-3 shadow-sm">
                      <span className="text-amber-500 font-black flex-shrink-0">●</span>
                      {m}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {report.spellingMistakes.length === 0 && report.grammarMistakes.length === 0 && report.subjectMistakes.length === 0 && (
              <div className="py-10 text-center">
                 <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-emerald-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                 </div>
                 <p className="text-slate-500 font-bold">Flawless Submission. No errors detected.</p>
              </div>
            )}
          </div>
        </div>

        {/* AI Insights Block */}
        <div className="bg-slate-900 p-8 md:p-12 rounded-[2rem] md:rounded-[3.5rem] shadow-2xl text-white relative flex flex-col">
          <h3 className="text-xl md:text-2xl font-black mb-6 flex items-center gap-3">
            <span className="w-8 h-8 md:w-10 md:h-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center">★</span>
            BrainGauge AI Tutor Insights
          </h3>
          <div className="space-y-4 md:space-y-6 flex-1">
            {report.insights.map((insight, idx) => (
              <div key={idx} className="p-5 md:p-6 bg-white/5 rounded-2xl border border-white/10 flex gap-4 hover:bg-white/10 transition-all cursor-default">
                <span className="text-emerald-400 font-black text-lg md:text-2xl opacity-40">0{idx + 1}</span>
                <p className="text-slate-300 text-xs md:text-sm leading-relaxed font-medium">{insight}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 md:mt-12 p-6 bg-emerald-600/20 rounded-[1.5rem] border border-emerald-500/20 text-center">
             <p className="text-xs font-bold text-emerald-300">Semantic validation complete for {report.language} submission.</p>
          </div>
        </div>
      </div>

      {/* Viewer Modal */}
      {modalContent && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 md:p-6 bg-slate-900/90 backdrop-blur-md">
          <div className="bg-white rounded-[1.5rem] md:rounded-[3rem] shadow-2xl max-w-5xl w-full max-h-[95vh] flex flex-col overflow-hidden animate-in zoom-in-95">
            <div className="p-5 md:p-8 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
              <div className="flex flex-col min-w-0">
                <h3 className="text-lg md:text-2xl font-black text-slate-800 truncate pr-4">{modalContent.title}</h3>
                {modalContent.type === 'PDF' && (
                   <span className="text-xs font-black text-emerald-600 mt-0.5">Page {modalPdfPage} / {modalPdfTotal}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {modalContent.type === 'PDF' && (
                  <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-100 mr-2">
                     <button onClick={() => setModalPdfPage(p => Math.max(1, p - 1))} className="p-2 text-slate-500 hover:text-emerald-600 disabled:opacity-30" disabled={modalPdfPage <= 1}>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7" /></svg>
                     </button>
                     <button onClick={() => setModalPdfPage(p => Math.min(modalPdfTotal, p + 1))} className="p-2 text-slate-500 hover:text-emerald-600 disabled:opacity-30" disabled={modalPdfPage >= modalPdfTotal}>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7" /></svg>
                     </button>
                  </div>
                )}
                <button onClick={() => setModalContent(null)} className="flex-shrink-0 w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500 transition-all hover:bg-slate-200 hover:text-red-500">
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 md:p-10 bg-slate-50 flex items-center justify-center">
              {modalContent.type === 'IMAGE' ? (
                <div className="w-full flex justify-center">
                  <img src={modalContent.data} alt="View" className="max-w-full h-auto rounded-xl shadow-xl border-4 border-white bg-white" />
                </div>
              ) : modalContent.type === 'PDF' ? (
                <div className="w-full h-[60vh] md:h-[75vh] max-w-4xl rounded-xl overflow-hidden shadow-2xl bg-white border-2 border-slate-200">
                   {modalContent.data.startsWith('data:') ? (
                     <PdfPagePreview dataUrl={modalContent.data} pageNumber={modalPdfPage} onDocumentLoad={setModalPdfTotal} />
                   ) : (
                     <iframe src={modalContent.data} className="w-full h-full border-none" title="PDF Viewer" />
                   )}
                </div>
              ) : modalContent.type === 'AUDIO' ? (
                <div className="w-full max-w-2xl bg-white p-6 md:p-10 rounded-3xl border border-slate-100 shadow-xl flex flex-col items-center gap-6 overflow-auto">
                  <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  </div>
                  <audio src={modalContent.data} controls className="w-full" />
                  
                  <div className="w-full space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Transcribed Text</span>
                      <div className="h-px bg-slate-100 flex-1"></div>
                    </div>
                    <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 text-slate-700 font-medium leading-relaxed italic text-sm md:text-base whitespace-pre-wrap">
                      {report.extractedText ? `"${report.extractedText}"` : "No transcription available."}
                    </div>
                  </div>
                  
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Recorded Submission</p>
                </div>
              ) : (
                <div className="w-full bg-white p-6 md:p-10 rounded-2xl border border-slate-100 text-slate-700 font-mono text-sm md:text-base whitespace-pre-wrap leading-relaxed shadow-sm max-w-4xl">
                  {modalContent.data}
                </div>
              )}
            </div>
            <div className="p-6 md:p-8 border-t border-slate-100 flex justify-center bg-white">
               <button onClick={() => setModalContent(null)} className="w-full sm:w-auto px-12 py-3.5 bg-slate-900 text-white rounded-xl font-black text-sm active:scale-95 transition-all shadow-lg">Close Preview</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ValidationReportView;
