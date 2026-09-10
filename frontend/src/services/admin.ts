import apiClient from './api';

export interface ResetAllResponse {
  documents_deleted: number;
  chunks_deleted: number;
  document_versions_deleted: number;
  document_shares_deleted: number;
  conversation_sessions_deleted: number;
  conversation_messages_deleted: number;
  generated_documents_deleted: number;
  workflow_events_deleted: number;
  files_deleted: number;
  files_failed: number;
  pinecone_cleared: boolean;
}

/** SUPER_ADMIN only. Irreversibly wipes all documents, Pinecone vectors, chat
 * history, and AI-generated documents. Users, the audit log, and HR records
 * are left intact. */
export async function resetAll(): Promise<ResetAllResponse> {
  const response = await apiClient.post<ResetAllResponse>('/admin/reset-all');
  return response.data;
}
