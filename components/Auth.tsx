
import React from 'react';
import { User } from '../types';
import { storageService } from '../services/storageService';

interface AuthProps {
  onLogin: (user: User) => void;
}

const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const handleGuestLogin = () => {
    const guestUser: User = {
      id: `guest_${crypto.randomUUID().slice(0, 8)}`,
      name: 'Guest Explorer',
      email: 'guest@linguix.ai',
      profilePicture: `https://picsum.photos/seed/${Math.random()}/200`,
      loginType: 'guest',
      preferredLanguage: 'English',
      createdDate: new Date().toISOString()
    };
    storageService.setUser(guestUser);
    onLogin(guestUser);
  };

  const handleGoogleLogin = () => {
    const googleUser: User = {
      id: `google_${crypto.randomUUID().slice(0, 8)}`,
      name: 'Alex Johnson',
      email: 'alex.j@gmail.com',
      profilePicture: 'https://picsum.photos/seed/alex/200',
      loginType: 'google',
      preferredLanguage: 'English',
      createdDate: new Date().toISOString()
    };
    storageService.setUser(googleUser);
    onLogin(googleUser);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-600 via-teal-500 to-cyan-500 p-4">
      <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl max-w-md w-full text-center space-y-8 animate-in fade-in zoom-in duration-700">
        <div>
          <h1 className="text-5xl font-black text-slate-800 mb-2 tracking-tight">Linguix</h1>
          <p className="text-teal-600 font-bold uppercase tracking-widest text-xs">Academic AI Validator</p>
        </div>

        <div className="space-y-4">
          <button
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white border border-slate-200 py-4 rounded-2xl font-bold text-slate-700 hover:bg-slate-50 transition-all active:scale-95 shadow-sm"
          >
            <img src="https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png" alt="Google" className="w-6 h-6" />
            Continue with Google
          </button>

          <div className="flex items-center gap-4 text-slate-300">
            <div className="h-px bg-slate-100 flex-1"></div>
            <span className="text-[10px] font-black uppercase tracking-widest">or</span>
            <div className="h-px bg-slate-100 flex-1"></div>
          </div>

          <button
            onClick={handleGuestLogin}
            className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black text-lg hover:bg-emerald-700 transition-all active:scale-95 shadow-xl shadow-emerald-200"
          >
            Enter as Guest
          </button>
        </div>

        <p className="text-[10px] text-slate-400 font-medium">
          Secure, private, and powered by Gemini. By continuing, you agree to Linguix's Terms & Privacy policy.
        </p>
      </div>
    </div>
  );
};

export default Auth;
