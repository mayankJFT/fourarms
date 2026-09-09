import type { ChatMessage, Conversation, DocType } from '../types';
import apiClient from './api';

export interface ChatResponse {
  message: ChatMessage;
  conversation_id: string;
}

interface _BackendChatResponse {
  session_id: string;
  answer: string;
  citations: ChatMessage['citations'];
  outcome: string;
}

export interface SummaryResponse {
  summary: string;
  document_id: string;
}

export interface MultiSummaryResponse {
  summary: string;
  document_ids: string[];
}

export interface GenerateResponse {
  document_id: string;
  title: string;
  content: string;
  doc_type: DocType;
  template_variant: number;
}

export async function chat(
  query: string,
  conversationId?: string,
  scopeDocIds?: string[],
): Promise<ChatResponse> {
  const response = await apiClient.post<_BackendChatResponse>('/ai/chat', {
    query,
    conversation_id: conversationId,
    scope_doc_ids: scopeDocIds,
  });
  const raw = response.data;
  return {
    conversation_id: raw.session_id,
    message: {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: raw.answer,
      citations: raw.citations ?? [],
      timestamp: new Date().toISOString(),
      guardrail_outcome: raw.outcome as ChatMessage['guardrail_outcome'],
    },
  };
}

export async function listConversations(): Promise<Conversation[]> {
  const response = await apiClient.get<Conversation[]>('/ai/conversations');
  return response.data;
}

export async function getConversation(id: string): Promise<ChatMessage[]> {
  const response = await apiClient.get<{ session: unknown; messages: Array<{
    id: string; role: string; content: string;
    citations?: string | null; guardrail_outcome?: string | null; created_at: string;
  }> }>(`/ai/conversations/${id}`);
  return response.data.messages.map((m) => ({
    id: m.id,
    role: m.role as ChatMessage['role'],
    content: m.content,
    citations: (() => { try { return m.citations ? JSON.parse(m.citations) : []; } catch { return []; } })(),
    timestamp: m.created_at,
    guardrail_outcome: m.guardrail_outcome as ChatMessage['guardrail_outcome'] ?? undefined,
  }));
}

export async function deleteConversation(id: string): Promise<void> {
  await apiClient.delete(`/ai/conversations/${id}`);
}

export async function summarise(
  documentId: string,
  length: 'short' | 'medium' | 'long' = 'medium',
): Promise<SummaryResponse> {
  const response = await apiClient.post<SummaryResponse>('/ai/summarise', {
    document_id: documentId,
    length,
  });
  return response.data;
}

export async function summariseMulti(
  documentIds: string[],
  query?: string,
): Promise<MultiSummaryResponse> {
  const response = await apiClient.post<MultiSummaryResponse>('/ai/summarise/multi', {
    document_ids: documentIds,
    query,
  });
  return response.data;
}

export async function generate(
  docType: DocType,
  templateVariant: number,
  inputs: Record<string, string | number>,
): Promise<GenerateResponse> {
  const response = await apiClient.post<GenerateResponse>('/ai/generate', {
    doc_type: docType,
    template_variant: templateVariant,
    inputs,
  });
  return response.data;
}

export interface TranscribeResponse {
  transcript: string;
  confidence: number;
  detected_language: string;
}

/** Transcribe audio via Deepgram. language: 'en' | 'hi' | 'hi-Latn' */
export async function transcribeAudio(
  audioBlob: Blob,
  filename: string,
  language?: string,
): Promise<TranscribeResponse> {
  const form = new FormData();
  form.append('audio', audioBlob, filename);
  if (language) form.append('language', language);

  const response = await apiClient.post<TranscribeResponse>('/ai/transcribe', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}
