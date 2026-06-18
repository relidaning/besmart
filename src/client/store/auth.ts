import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
  id: number;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  setAuth: (token: string, user: AuthUser) => void;
  clearAuth: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      clearAuth: () => set({ token: null, user: null }),
    }),
    { name: 'besmart-auth' }
  )
);
