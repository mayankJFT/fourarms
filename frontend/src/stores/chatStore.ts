import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ChatMessage } from '../types';

interface ChatStore {
  // Conversation
  messages: ChatMessage[];
  conversationId: string | undefined;
  // Set only when viewing another user's conversation (SUPER_ADMIN browsing all chats)
  conversationOwnerId: number | undefined;
  conversationOwnerEmail: string | undefined;
  isLoading: boolean;

  // Document scoping
  scopedDocIds: string[];
  docSearch: string;

  // Actions
  setMessages: (messages: ChatMessage[]) => void;
  addMessage: (message: ChatMessage) => void;
  setConversationId: (id: string | undefined) => void;
  setConversationOwner: (userId: number | undefined, email: string | undefined) => void;
  setIsLoading: (loading: boolean) => void;
  setScopedDocIds: (ids: string[]) => void;
  toggleScopedDoc: (id: string) => void;
  setDocSearch: (q: string) => void;
  resetConversation: () => void;
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      messages: [],
      conversationId: undefined,
      conversationOwnerId: undefined,
      conversationOwnerEmail: undefined,
      isLoading: false,
      scopedDocIds: [],
      docSearch: '',

      setMessages: (messages) => set({ messages }),
      addMessage: (message) => set((s) => ({ messages: [...s.messages, message] })),
      setConversationId: (id) => set({ conversationId: id }),
      setConversationOwner: (userId, email) =>
        set({ conversationOwnerId: userId, conversationOwnerEmail: email }),
      setIsLoading: (loading) => set({ isLoading: loading }),
      setScopedDocIds: (ids) => set({ scopedDocIds: ids }),
      toggleScopedDoc: (id) =>
        set((s) => ({
          scopedDocIds: s.scopedDocIds.includes(id)
            ? s.scopedDocIds.filter((d) => d !== id)
            : [...s.scopedDocIds, id],
        })),
      setDocSearch: (q) => set({ docSearch: q }),
      resetConversation: () =>
        set({
          messages: [],
          conversationId: undefined,
          conversationOwnerId: undefined,
          conversationOwnerEmail: undefined,
          scopedDocIds: [],
        }),
    }),
    {
      name: 'qci-chat',
      storage: createJSONStorage(() => sessionStorage),
      // Don't persist loading state
      partialize: (s) => ({
        messages: s.messages,
        conversationId: s.conversationId,
        conversationOwnerId: s.conversationOwnerId,
        conversationOwnerEmail: s.conversationOwnerEmail,
        scopedDocIds: s.scopedDocIds,
        docSearch: s.docSearch,
      }),
    },
  ),
);
