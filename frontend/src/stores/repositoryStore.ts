import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Confidentiality, Document } from '../types';

type ViewMode = 'grid' | 'list';

interface RepositoryStore {
  // Filters
  searchQuery: string;
  activeDocType: string;
  activeConf: string;
  viewMode: ViewMode;

  // Selection
  selectedDocId: string | null;

  // Actions
  setSearchQuery: (q: string) => void;
  setActiveDocType: (t: string) => void;
  setActiveConf: (c: string) => void;
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
      viewMode: 'grid',
      selectedDocId: null,

      setSearchQuery: (q) => set({ searchQuery: q }),
      setActiveDocType: (t) => set({ activeDocType: t }),
      setActiveConf: (c) => set({ activeConf: c }),
      setViewMode: (m) => set({ viewMode: m }),
      setSelectedDocId: (id) => set({ selectedDocId: id }),
      clearFilters: () =>
        set({ searchQuery: '', activeDocType: '', activeConf: '' }),
    }),
    {
      name: 'qci-repository',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({
        searchQuery: s.searchQuery,
        activeDocType: s.activeDocType,
        activeConf: s.activeConf,
        viewMode: s.viewMode,
        // Don't persist selected doc — stale after reload
      }),
    },
  ),
);
