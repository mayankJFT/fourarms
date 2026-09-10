import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Confidentiality, Document } from '../types';

type ViewMode = 'grid' | 'list';

interface RepositoryStore {
  // Filters
  searchQuery: string;
  activeDocType: string;
  activeConf: string;
  activeDivision: string;
  activeProject: string;
  viewMode: ViewMode;

  // Selection
  selectedDocId: string | null;

  // Actions
  setSearchQuery: (q: string) => void;
  setActiveDocType: (t: string) => void;
  setActiveConf: (c: string) => void;
  setActiveDivision: (d: string) => void;
  setActiveProject: (p: string) => void;
  setViewMode: (m: ViewMode) => void;
  setSelectedDocId: (id: string | null) => void;
  clearFilters: () => void;
}

export const useRepositoryStore = create<RepositoryStore>()(
  persist(
    (set) => ({
      searchQuery: '',
      activeDocType: '',
      activeConf: '',
      activeDivision: '',
      activeProject: '',
      viewMode: 'grid',
      selectedDocId: null,

      setSearchQuery: (q) => set({ searchQuery: q }),
      setActiveDocType: (t) => set({ activeDocType: t }),
      setActiveConf: (c) => set({ activeConf: c }),
      setActiveDivision: (d) => set({ activeDivision: d }),
      setActiveProject: (p) => set({ activeProject: p }),
      setViewMode: (m) => set({ viewMode: m }),
      setSelectedDocId: (id) => set({ selectedDocId: id }),
      clearFilters: () =>
        set({ searchQuery: '', activeDocType: '', activeConf: '', activeDivision: '', activeProject: '' }),
    }),
    {
      name: 'qci-repository',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({
        searchQuery: s.searchQuery,
        activeDocType: s.activeDocType,
        activeConf: s.activeConf,
        activeDivision: s.activeDivision,
        activeProject: s.activeProject,
        viewMode: s.viewMode,
        // Don't persist selected doc — stale after reload
      }),
    },
  ),
);
