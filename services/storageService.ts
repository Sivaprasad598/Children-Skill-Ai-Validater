
import { User, ValidationHistoryItem, ValidatorType } from '../types';

const USER_KEY = 'braingauge_user';
const HISTORY_KEY = 'braingauge_history';

export const storageService = {
  getUser: (): User | null => {
    const data = localStorage.getItem(USER_KEY);
    if (!data) return null;
    const user = JSON.parse(data);
    // Migration: Add default validatorType if missing
    if (!user.validatorType) {
      user.validatorType = ValidatorType.CONCEPTUAL;
    }
    return user;
  },
  setUser: (user: User) => {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clearUser: () => {
    localStorage.removeItem(USER_KEY);
  },
  getHistory: (userId: string): ValidationHistoryItem[] => {
    const data = localStorage.getItem(HISTORY_KEY);
    const history: ValidationHistoryItem[] = data ? JSON.parse(data) : [];
    return history.filter(item => item.userId === userId);
  },
  saveHistory: (item: ValidationHistoryItem) => {
    const data = localStorage.getItem(HISTORY_KEY);
    let history: ValidationHistoryItem[] = data ? JSON.parse(data) : [];
    
    // Strip large base64 data from the report before saving to history to save space
    const strippedItem: ValidationHistoryItem = {
      ...item,
      report: {
        ...item.report,
        rawInputData: undefined,
        rawReferenceData: undefined,
        audioData: undefined
      }
    };

    history.unshift(strippedItem);
    
    // Limit history to last 15 items to prevent quota exceeded error
    if (history.length > 15) {
      history = history.slice(0, 15);
    }
    
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (e) {
      console.error("Failed to save history to localStorage:", e);
      // If still failing, try clearing older items even more aggressively
      if (history.length > 5) {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 5)));
      }
    }
  },
  clearHistory: () => {
    localStorage.removeItem(HISTORY_KEY);
  }
};
