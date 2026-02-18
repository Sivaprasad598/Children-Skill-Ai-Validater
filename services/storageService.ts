
import { User, ValidationHistoryItem } from '../types';

const USER_KEY = 'linguix_user';
const HISTORY_KEY = 'linguix_history';

export const storageService = {
  getUser: (): User | null => {
    const data = localStorage.getItem(USER_KEY);
    return data ? JSON.parse(data) : null;
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
    const history: ValidationHistoryItem[] = data ? JSON.parse(data) : [];
    history.unshift(item);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }
};
