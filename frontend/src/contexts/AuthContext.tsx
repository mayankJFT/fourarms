import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Role, User } from '../types';
import * as authService from '../services/auth';

interface AuthContextValue {
  currentUser: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
  isRole: (role: Role) => boolean;
  hasAnyRole: (roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function decodeJwt(token: string): { exp: number } | null {
  try {
    const part = token.split('.')[1];
    const padded = part + '=='.slice(0, (4 - (part.length % 4)) % 4);
    return JSON.parse(atob(padded.replace(/-/g, '+').replace(/_/g, '/'))) as { exp: number };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    localStorage.removeItem('access_token');
    setCurrentUser(null);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) { setLoading(false); return; }

    const payload = decodeJwt(token);
    if (!payload || payload.exp * 1000 < Date.now()) {
      localStorage.removeItem('access_token');
      setLoading(false);
      return;
    }

    authService.getMe()
      .then(setCurrentUser)
      .catch(() => { localStorage.removeItem('access_token'); })
      .finally(() => setLoading(false));
  }, []);

  // API interceptor fires this event on 401 instead of window.location redirect
  useEffect(() => {
    window.addEventListener('auth:logout', logout);
    return () => window.removeEventListener('auth:logout', logout);
  }, [logout]);

  const login = useCallback(async (email: string, password: string) => {
    const { access_token } = await authService.login(email, password);
    localStorage.setItem('access_token', access_token);
    const user = await authService.getMe();
    setCurrentUser(user);
    return user;
  }, []);

  const isRole = useCallback((role: Role) => currentUser?.role === role, [currentUser]);

  const hasAnyRole = useCallback(
    (roles: Role[]) => roles.includes(currentUser?.role as Role),
    [currentUser],
  );

  return (
    <AuthContext.Provider value={{ currentUser, loading, login, logout, isRole, hasAnyRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
