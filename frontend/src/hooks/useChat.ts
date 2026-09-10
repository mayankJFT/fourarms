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
    conversationOwnerId,
    conversationOwnerEmail,
    isLoading,
    addMessage,
    setMessages,
    setConversationId,
    setConversationOwner,
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
        setConversationOwner(undefined, undefined); // sending always targets/creates your own conversation
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
    [conversationId, addMessage, setConversationId, setConversationOwner, setIsLoading],
  );

  const loadConversation = useCallback(async (id: string) => {
    setIsLoading(true);
    try {
      const detail = await aiService.getConversation(id);
      setMessages(detail.messages);
      setConversationId(id);
      setConversationOwner(detail.ownerId, detail.ownerEmail);
    } catch {
      // silently fail
    } finally {
      setIsLoading(false);
    }
  }, [setMessages, setConversationId, setConversationOwner, setIsLoading]);

  const newConversation = useCallback(() => {
    resetConversation();
  }, [resetConversation]);

  return {
    messages,
    conversationId,
    conversationOwnerId,
    conversationOwnerEmail,
    isLoading,
    sendMessage,
    loadConversation,
    newConversation,
  };
}
