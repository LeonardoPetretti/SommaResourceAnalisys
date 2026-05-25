import { create } from 'zustand';
import type { AppUser, UserRole } from '@/types';

interface AuthState {
  user: AppUser | null;
  loading: boolean;
  initialized: boolean;
  setUser: (u: AppUser | null) => void;
  setLoading: (l: boolean) => void;
  setInitialized: (v: boolean) => void;
  hasRole: (...roles: UserRole[]) => boolean;
  canManage: () => boolean;
  isAdmin: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  initialized: false,
  setUser: (u) => set({ user: u }),
  setLoading: (l) => set({ loading: l }),
  setInitialized: (v) => set({ initialized: v }),
  hasRole: (...roles) => {
    const u = get().user;
    return !!u && u.active && roles.includes(u.role);
  },
  canManage: () => {
    const u = get().user;
    return !!u && u.active && (u.role === 'admin' || u.role === 'manager');
  },
  isAdmin: () => {
    const u = get().user;
    return !!u && u.active && u.role === 'admin';
  },
}));
