import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'light' | 'dark';

interface UIState {
  theme: Theme;
  sidebarOpen: boolean;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  setSidebarOpen: (v: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      // SOMMA identity: dark theme é o padrão (preto + verde)
      theme: 'dark',
      sidebarOpen: true,
      setTheme: (t) => {
        set({ theme: t });
        document.documentElement.classList.toggle('dark', t === 'dark');
      },
      toggleTheme: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark';
        set({ theme: next });
        document.documentElement.classList.toggle('dark', next === 'dark');
      },
      setSidebarOpen: (v) => set({ sidebarOpen: v }),
    }),
    { name: 'ra-ui' }
  )
);
