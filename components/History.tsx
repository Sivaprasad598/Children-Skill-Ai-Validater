
import React, { useState } from 'react';
import { ValidationHistoryItem } from '../types';

interface HistoryProps {
  history: ValidationHistoryItem[];
  onSelectItem: (item: ValidationHistoryItem) => void;
}

const History: React.FC<HistoryProps> = ({ history, onSelectItem }) => {
  const [filter, setFilter] = useState('');

  const filteredHistory = history.filter(item => 
    item.language.toLowerCase().includes(filter.toLowerCase()) ||
    item.inputType.toLowerCase().includes(filter.toLowerCase()) ||
    item.referenceType.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6 px-2">
        <h2 className="text-3xl md:text-4xl font-black text-slate-800 tracking-tight">Report History</h2>
        <div className="relative group w-full md:w-96">
          <input 
            type="text" 
            placeholder="Search reports..." 
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-12 pr-6 py-3.5 md:py-4 bg-white border-2 border-slate-100 rounded-[1.25rem] md:rounded-[1.5rem] focus:border-emerald-500 outline-none w-full font-bold text-slate-700 text-sm md:text-base transition-all shadow-sm"
          />
          <svg className="h-6 w-6 absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
          </svg>
        </div>
      </div>

      {filteredHistory.length === 0 ? (
        <div className="bg-white rounded-[2.5rem] p-16 md:p-24 text-center border-3 border-dashed border-emerald-50/50 mx-2">
          <p className="text-slate-400 font-bold text-lg">No reports found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 px-2">
          {filteredHistory.map((item) => (
            <div 
              key={item.id} 
              onClick={() => onSelectItem(item)}
              className="bg-white p-5 md:p-6 rounded-3xl md:rounded-[2rem] border-2 border-transparent hover:border-emerald-500/20 shadow-sm transition-all cursor-pointer group flex flex-col sm:flex-row sm:items-center justify-between gap-5 relative overflow-hidden"
            >
              <div className="flex items-center gap-4 md:gap-6">
                <div className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl md:rounded-3xl flex flex-col items-center justify-center font-black text-white shrink-0 ${item.accuracy > 80 ? 'bg-gradient-to-br from-emerald-500 to-emerald-700' : 'bg-gradient-to-br from-amber-400 to-amber-600'}`}>
                  <span className="text-xl md:text-2xl">{item.accuracy}%</span>
                  <span className="text-[7px] md:text-[8px] uppercase tracking-tighter opacity-70">Match</span>
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <h3 className="text-base md:text-lg font-black text-slate-800 tracking-tight group-hover:text-emerald-600 transition-colors truncate">
                      {new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </h3>
                    <span className="px-2 py-0.5 bg-slate-100 text-[9px] font-black uppercase tracking-widest text-slate-400 rounded-md">
                      {item.language}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-y-1 gap-x-3 text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <div className="flex items-center gap-1">
                      <span className="w-1 h-1 bg-emerald-400 rounded-full"></span>
                      {item.inputType}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-1 h-1 bg-teal-400 rounded-full"></span>
                      {item.referenceType}
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3 sm:w-auto border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-50">
                <button className="flex-1 sm:flex-none px-6 py-2.5 bg-slate-50 text-slate-400 font-black text-[10px] uppercase tracking-widest rounded-xl group-hover:bg-emerald-600 group-hover:text-white transition-all">
                  Open Report
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default History;
