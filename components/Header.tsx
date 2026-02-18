
import React from 'react';
import { User } from '../types';

interface HeaderProps {
  user: User;
  activeTab: 'validate' | 'history' | 'profile';
  setActiveTab: (tab: 'validate' | 'history' | 'profile') => void;
  onLogout: () => void;
  isSyncing?: boolean;
}

const Header: React.FC<HeaderProps> = ({ user, activeTab, setActiveTab, onLogout, isSyncing }) => {
  return (
    <>
      <header className="sticky top-0 z-50 glass-morphism border-b border-emerald-100/50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 md:h-20 flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-3 cursor-pointer group" onClick={() => setActiveTab('validate')}>
            <div className="w-8 h-8 md:w-10 md:h-10 bg-gradient-to-br from-emerald-600 to-teal-500 rounded-lg md:rounded-xl flex items-center justify-center text-white font-black text-lg md:text-xl shadow-lg shadow-emerald-100 transition-transform">L</div>
            <span className="text-xl md:text-2xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-emerald-600 to-cyan-600">
              Linguix
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-2">
            <button
              onClick={() => setActiveTab('validate')}
              className={`px-5 py-2 rounded-full font-bold transition-all text-sm ${activeTab === 'validate' ? 'text-emerald-700 bg-emerald-100' : 'text-slate-500 hover:text-emerald-600 hover:bg-emerald-50'}`}
            >
              Validate
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-5 py-2 rounded-full font-bold transition-all text-sm ${activeTab === 'history' ? 'text-emerald-700 bg-emerald-100' : 'text-slate-500 hover:text-emerald-600 hover:bg-emerald-50'}`}
            >
              History
            </button>
          </nav>

          <div className="flex items-center gap-2 md:gap-4">
            {isSyncing && (
              <div className="flex items-center gap-1.5 text-[8px] md:text-[10px] font-black uppercase tracking-widest text-emerald-500">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                <span className="hidden sm:inline">Syncing</span>
              </div>
            )}
            <button 
              onClick={() => setActiveTab('profile')}
              className="flex items-center gap-2 group p-1 md:pr-4 rounded-full transition-all border border-transparent hover:border-emerald-100"
            >
              <img src={user.profilePicture} alt={user.name} className="w-8 h-8 md:w-9 md:h-9 rounded-full border-2 border-white shadow-sm" />
              <span className="text-xs md:text-sm font-bold text-slate-700 hidden lg:inline">{user.name}</span>
            </button>
            <button 
              onClick={onLogout}
              className="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center text-slate-400 hover:text-red-500 transition-all"
            >
              <svg className="h-5 w-5 md:h-6 md:w-6" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Fixed Bottom Navigation for Mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-[100] bg-white/95 backdrop-blur-md border-t border-emerald-100 flex items-center justify-around py-2 shadow-[0_-8px_30px_rgb(0,0,0,0.04)]">
        <button 
          onClick={() => setActiveTab('validate')}
          className={`flex-1 flex flex-col items-center gap-1 transition-all py-1 ${activeTab === 'validate' ? 'text-emerald-600 scale-110' : 'text-slate-400'}`}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span className="text-[10px] font-black uppercase tracking-widest">Verify</span>
        </button>
        <button 
          onClick={() => setActiveTab('history')}
          className={`flex-1 flex flex-col items-center gap-1 transition-all py-1 ${activeTab === 'history' ? 'text-emerald-600 scale-110' : 'text-slate-400'}`}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span className="text-[10px] font-black uppercase tracking-widest">History</span>
        </button>
        <button 
          onClick={() => setActiveTab('profile')}
          className={`flex-1 flex flex-col items-center gap-1 transition-all py-1 ${activeTab === 'profile' ? 'text-emerald-600 scale-110' : 'text-slate-400'}`}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
          <span className="text-[10px] font-black uppercase tracking-widest">Me</span>
        </button>
      </nav>
    </>
  );
};

export default Header;
