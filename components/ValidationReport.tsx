
import React, { useState, useMemo } from 'react';
import { ValidationReport, InputType, ReferenceType } from '../types';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { PdfPagePreview } from '../App';

interface ReportProps {
  report: ValidationReport;
  onClose: () => void;
}

const ValidationReportView: React.FC<ReportProps> = ({ report, onClose }) => {
  const [modalContent, setModalContent] = useState<{ title: string; data: string; type: 'IMAGE' | 'TEXT' | 'PDF' } | null>(null);
  const [modalPdfPage, setModalPdfPage] = useState(1);
  const [modalPdfTotal, setModalPdfTotal] = useState(1);

  const chartData = [
    { name: 'Correct', value: report.overallAccuracy },
    { name: 'Incorrect', value: 100 - report.overallAccuracy }
  ];

  const COLORS = ['#10b981', '#f1f5f9'];

  const displayGrammar = Math.min(10, report.grammarScore);
  const displayCalligraphy = report.calligraphyScore !== undefined ? Math.min(10, report.calligraphyScore) : undefined;

  /**
   * Renders the extracted text with spelling and grammar mistakes highlighted in red.
   */
  const annotatedText = useMemo(() => {
    let text = report.extractedText;
    if (!text) return <span className="text-slate-400 italic">No text extracted.</span>;

    // Collect all incorrect strings to highlight
    const mistakes = [
      ...report.spellingMistakes.map(m => m.incorrect),
      ...report.grammarMistakes.map(m => m.incorrect)
    ].filter(Boolean);

    if (mistakes.length === 0) return <span>{text}</span>;

    // Sort by length descending to avoid partial matches inside longer matches
    const sortedMistakes = [...new Set(mistakes)].sort((a, b) => b.length - a.length);
    
    // Create a regex that matches any of the mistakes
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
  }, [report.extractedText, report.spellingMistakes, report.grammarMistakes]);

  const handleViewSource = (isReference: boolean) => {
    const data = isReference ? report.rawReferenceData : report.rawInputData;
    const type = isReference ? report.referenceType : report.inputType;
    const title = isReference ? 'Validator Source' : 'Submission';

    if (!data) return;

    let viewType: 'IMAGE' | 'TEXT' | 'PDF' = 'TEXT';
    
    if (data.startsWith('data:image/')) viewType = 'IMAGE';
    else if (data.startsWith('data:application/pdf')) viewType = 'PDF';
    else if (type === ReferenceType.IMAGE || type === InputType.IMAGE) viewType = 'IMAGE';
    else if (type === ReferenceType.PDF || type === InputType.PDF) viewType = 'PDF';

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
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Linguix Semantic Analysis v2.5</p>
        </div>
        <button onClick={onClose} className="w-full sm:w-auto px-8 py-3 bg-slate-100 hover:bg-slate-200 rounded-full font-black text-slate-600 transition-all text-sm">
          Dismiss Report
        </button>
      </div>

      {/* Primary Highlights: Annotated Submission */}
      <div className="bg-white rounded-[2rem] md:rounded-[3.5rem] shadow-xl border-2 border-slate-100 overflow-hidden">
        <div className="bg-slate-900 p-6 md:p-8 text-white flex items-center justify-between">
          <h3 className="text-lg md:text-xl font-black flex items-center gap-3">
            <span className="w-8 h-8 bg-emerald-500 text-white rounded-lg flex items-center justify-center text-sm">!</span>
            Annotated Submission
          </h3>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">Errors Highlighted in Red</span>
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
              <span className="text-4xl md:text-5xl font-black text-emerald-600">{report.overallAccuracy}%</span>
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
                <span className="text-slate-500">Grammar Score</span>
                <span className="text-emerald-600 font-black">{displayGrammar}/10</span>
              </div>
              <div className="w-full bg-slate-100 h-3 md:h-4 rounded-full overflow-hidden p-0.5 md:p-1">
                <div className="bg-emerald-500 h-full rounded-full transition-all duration-1000" style={{ width: `${displayGrammar * 10}%` }}></div>
              </div>
            </div>
            {displayCalligraphy !== undefined && (
              <div className="group">
                <div className="flex justify-between text-[10px] font-black uppercase tracking-wider mb-2">
                  <span className="text-slate-500">Presentation Quality</span>
                  <span className="text-teal-600 font-black">{displayCalligraphy}/10</span>
                </div>
                <div className="w-full bg-slate-100 h-3 md:h-4 rounded-full overflow-hidden p-0.5 md:p-1">
                  <div className="bg-teal-500 h-full rounded-full transition-all duration-1000" style={{ width: `${displayCalligraphy * 10}%` }}></div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Source Tracking */}
        <div className="bg-white p-8 md:p-10 rounded-[2rem] md:rounded-[3rem] shadow-xl border border-emerald-50 space-y-4 md:col-span-2 lg:col-span-1">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Logic Source</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3 md:gap-4">
             <div className="p-4 bg-slate-50 rounded-2xl md:rounded-3xl flex items-center justify-between border border-transparent hover:border-emerald-100 transition-all">
                <div className="min-w-0">
                  <p className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase truncate">Validator</p>
                  <p className="text-xs md:text-sm font-bold text-slate-800 truncate">{report.referenceType}</p>
                </div>
                {report.referenceType !== ReferenceType.AI_TUTOR && report.rawReferenceData && (
                  <button 
                    onClick={() => handleViewSource(true)}
                    className="flex-shrink-0 p-2.5 bg-emerald-600 text-white rounded-xl shadow-lg transition-all active:scale-95"
                    title="View Source"
                  >
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" /></svg>
                  </button>
                )}
             </div>
             <div className="p-4 bg-slate-50 rounded-2xl md:rounded-3xl flex items-center justify-between border border-transparent hover:border-teal-100 transition-all">
                <div className="min-w-0">
                  <p className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase truncate">Input</p>
                  <p className="text-xs md:text-sm font-bold text-slate-800 truncate">{report.inputType}</p>
                </div>
                {report.rawInputData && (
                  <button 
                    onClick={() => handleViewSource(false)}
                    className="flex-shrink-0 p-2.5 bg-teal-600 text-white rounded-xl shadow-lg transition-all active:scale-95"
                    title="View Original Submission"
                  >
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" /></svg>
                  </button>
                )}
             </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
        {/* Detailed Error Log */}
        <div className="bg-white p-8 md:p-12 rounded-[2rem] md:rounded-[3.5rem] shadow-xl border border-emerald-50">
          <h3 className="text-xl md:text-2xl font-black text-slate-800 mb-6 flex items-center gap-3">
            <span className="w-8 h-8 md:w-10 md:h-10 bg-red-50 text-red-500 rounded-xl flex items-center justify-center">!</span>
            Detailed Corrections
          </h3>

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
            Linguix AI Tutor Insights
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
                <div className="w-full h-[60vh] md:h-[75vh] max-w-3xl rounded-xl overflow-hidden shadow-2xl bg-white border-2 border-slate-200">
                   <PdfPagePreview dataUrl={modalContent.data} pageNumber={modalPdfPage} onDocumentLoad={setModalPdfTotal} />
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
