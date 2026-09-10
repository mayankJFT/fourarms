import type { DocState, DocType, GeneratedDocument, WorkflowEvent } from '../types';
import apiClient from './api';

export interface WorkflowFilters {
  state?: DocState;
  doc_type?: DocType;
}

export async function listGenerated(filters?: WorkflowFilters): Promise<GeneratedDocument[]> {
  const response = await apiClient.get<GeneratedDocument[]>('/workflow/documents', {
    params: filters,
  });
  return response.data;
}

export async function getGenerated(id: string): Promise<GeneratedDocument> {
  const response = await apiClient.get<GeneratedDocument>(`/workflow/documents/${id}`);
  return response.data;
}

export async function updateDraft(id: string, contentJson: string): Promise<GeneratedDocument> {
  const response = await apiClient.put<GeneratedDocument>(`/workflow/documents/${id}`, {
    content_json: contentJson,
  });
  return response.data;
}

export async function submit(id: string): Promise<GeneratedDocument> {
  const response = await apiClient.post<GeneratedDocument>(`/workflow/documents/${id}/submit`);
  return response.data;
}

export async function approve(id: string): Promise<GeneratedDocument> {
  const response = await apiClient.post<GeneratedDocument>(`/workflow/documents/${id}/approve`);
  return response.data;
}

export async function revise(id: string, comment: string): Promise<GeneratedDocument> {
  const response = await apiClient.post<GeneratedDocument>(`/workflow/documents/${id}/revise`, {
    comment,
  });
  return response.data;
}

export async function deleteGenerated(id: string): Promise<void> {
  await apiClient.delete(`/workflow/documents/${id}`);
}

export async function exportDocx(id: string): Promise<Blob> {
  const response = await apiClient.get(`/workflow/documents/${id}/export`, {
    responseType: 'blob',
  });
  return response.data as Blob;
}

export async function getHistory(id: string): Promise<WorkflowEvent[]> {
  const response = await apiClient.get<WorkflowEvent[]>(`/workflow/documents/${id}/history`);
  return response.data;
}
