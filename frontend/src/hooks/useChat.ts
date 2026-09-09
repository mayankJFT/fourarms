import { useCallback } from 'react';
import type { ChatMessage } from '../types';
import * as aiService from '../services/ai';
import { useChatStore } from '../stores/chatStore';

let msgCounter = 0;
function nextId(): string {
  return `msg-${++msgCounter}-${Date.now()}`;
}

export function useChat() {
  const {
    messages,
    conversationId,
    isLoading,
    addMessage,
    setMessages,
    setConversationId,
    setIsLoading,
    resetConversation,
  } = useChatStore();

  const sendMessage = useCallback(
    async (query: string, scopeDocIds?: string[]) => {
      const userMsg: ChatMessage = {
        id: nextId(),
        role: 'user',
        content: query,
        citations: [],
        timestamp: new Date().toISOString(),
      };

      addMessage(userMsg);
      setIsLoading(true);

      try {
        const response = await aiService.chat(query, conversationId, scopeDocIds);
        setConversationId(response.conversation_id);
        addMessage(response.message);
      } catch {
        const errMsg: ChatMessage = {
          id: nextId(),
          role: 'assistant',
          content: 'An error occurred. Please try again.',
          citations: [],
          timestamp: new Date().toISOString(),
          guardrail_outcome: 'NO_INFO',
        };
        addMessage(errMsg);
      } finally {
        setIsLoading(false);
      }
    },
    [conversationId, addMessage, setConversationId, setIsLoading],
  );

  const loadConversation = useCallback(async (id: string) => {
    setIsLoading(true);
    try {
      const history = await aiService.getConversation(id);
      setMessages(history);
      setConversationId(id);
    } catch {
      // silently fail
    } finally {
      setIsLoading(false);
    }
  }, [setMessages, setConversationId, setIsLoading]);

  const newConversation = useCallback(() => {
    resetConversation();
  }, [resetConversation]);

  return { messages, conversationId, isLoading, sendMessage, loadConversation, newConversation };
}
