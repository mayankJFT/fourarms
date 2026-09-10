import type { ChatMessage, Conversation, DocType } from '../types';
import apiClient from './api';

// The real /ai/generate response — a GeneratedDocumentOut, not the flat
// {document_id, content} shape this file used to assume.
interface _BackendGeneratedDoc {
  id: string;
  title: string;
  doc_type: string;
  template_variant: number;
  template_id?: string | null;
  content_json: string;
  state: string;
}

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
  content_json: string;
  doc_type: DocType;
  template_variant: number;
  template_id?: string | null;
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

export interface ConversationDetail {
  messages: ChatMessage[];
  ownerId: number;
  ownerEmail?: string;
}

export async function getConversation(id: string): Promise<ConversationDetail> {
  const response = await apiClient.get<{
    session: { user_id: number; user_email?: string | null };
    messages: Array<{
      id: string; role: string; content: string;
      citations?: string | null; guardrail_outcome?: string | null; created_at: string;
    }>;
  }>(`/ai/conversations/${id}`);
  return {
    ownerId: response.data.session.user_id,
    ownerEmail: response.data.session.user_email ?? undefined,
    messages: response.data.messages.map((m) => ({
      id: m.id,
      role: m.role as ChatMessage['role'],
      content: m.content,
      citations: (() => { try { return m.citations ? JSON.parse(m.citations) : []; } catch { return []; } })(),
      timestamp: m.created_at,
      guardrail_outcome: m.guardrail_outcome as ChatMessage['guardrail_outcome'] ?? undefined,
    })),
  };
}

export async function deleteConversation(id: string): Promise<void> {
  await apiClient.delete(`/ai/conversations/${id}`);
}

export async function summarise(
  documentId: string,
  length: 'short' | 'medium' | 'long' = 'medium',
): Promise<SummaryResponse> {
  // The backend returns the same ChatResponse shape as /ai/chat ({answer, outcome, ...}),
  // not {summary}. Surface a clear error for NO_INFO/INSUFFICIENT_CONTEXT rather than
  // silently returning an empty summary.
  const response = await apiClient.post<_BackendChatResponse>('/ai/summarise', {
    document_id: documentId,
    length,
  });
  if (response.data.outcome !== 'OK') {
    throw new Error(response.data.answer);
  }
  return { summary: response.data.answer, document_id: documentId };
}

export async function summariseMulti(
  documentIds: string[],
  query?: string,
): Promise<MultiSummaryResponse> {
  const response = await apiClient.post<_BackendChatResponse>('/ai/summarise/multi', {
    document_ids: documentIds,
    query,
  });
  if (response.data.outcome !== 'OK') {
    throw new Error(response.data.answer);
  }
  return { summary: response.data.answer, document_ids: documentIds };
}

export async function generate(
  docType: DocType,
  templateVariant: number,
  inputs: Record<string, string | number>,
  templateId?: string,
): Promise<GenerateResponse> {
  const response = await apiClient.post<_BackendGeneratedDoc>('/ai/generate', {
    doc_type: docType,
    template_variant: templateVariant,
    template_id: templateId,
    inputs,
  });
  const raw = response.data;
  return {
    document_id: raw.id,
    title: raw.title,
    content_json: raw.content_json,
    doc_type: raw.doc_type as DocType,
    template_variant: raw.template_variant,
    template_id: raw.template_id,
  };
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
