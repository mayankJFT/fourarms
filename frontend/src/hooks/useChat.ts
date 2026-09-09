import { useCallback, useState } from 'react';
import type { ChatMessage } from '../types';
import * as aiService from '../services/ai';

let msgCounter = 0;
function nextId(): string {
  return `msg-${++msgCounter}-${Date.now()}`;
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = useCallback(
    async (query: string, scopeDocIds?: string[]) => {
      const userMsg: ChatMessage = {
        id: nextId(),
        role: 'user',
        content: query,
        citations: [],
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);

      try {
        const response = await aiService.chat(query, conversationId, scopeDocIds);
        setConversationId(response.conversation_id);
        setMessages((prev) => [...prev, response.message]);
      } catch {
        const errMsg: ChatMessage = {
          id: nextId(),
          role: 'assistant',
          content: 'An error occurred. Please try again.',
          citations: [],
          timestamp: new Date().toISOString(),
          guardrail_outcome: 'NO_INFO',
        };
        setMessages((prev) => [...prev, errMsg]);
      } finally {
        setIsLoading(false);
      }
    },
    [conversationId],
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
  }, []);

  const newConversation = useCallback(() => {
    setMessages([]);
    setConversationId(undefined);
  }, []);

  return { messages, conversationId, isLoading, sendMessage, loadConversation, newConversation };
}
