import type { Chunk, Confidentiality, Document, DocumentFilters, DocumentShare, DocumentVersion, HRRecord, UploadMetadata } from '../types';
import apiClient from './api';

export interface SearchResult {
  documents: Document[];
  total: number;
}

export async function upload(
  file: File,
  metadata: UploadMetadata,
  onProgress?: (pct: number) => void,
): Promise<Document> {
  const formData = new FormData();
  formData.append('file', file);

  // Backend reads metadata from query params, not form fields.
  // doc_type is intentionally omitted — the AI classifier suggests it during
  // ingestion, and the user confirms/changes it afterwards (see confirmCategory).
  const params: Record<string, string> = {
    confidentiality: metadata.confidentiality,
  };
  if (metadata.division) params.division = metadata.division;
  if (metadata.project) params.project = metadata.project;
  if (metadata.tags) {
    const tagList = metadata.tags.split(',').map((t) => t.trim()).filter(Boolean);
    if (tagList.length) params.tags = JSON.stringify(tagList);
  }

  const response = await apiClient.post<Document>('/documents/upload', formData, {
    params,
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (progressEvent) => {
      if (progressEvent.total && onProgress) {
        const pct = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress(pct);
      }
    },
  });
  return response.data;
}

export async function list(filters?: DocumentFilters): Promise<Document[]> {
  const params: Record<string, string | boolean | string[]> = {};
  if (filters?.query) params.query = filters.query;
  if (filters?.doc_type?.length) params.doc_type = filters.doc_type;
  if (filters?.confidentiality?.length) params.confidentiality = filters.confidentiality;
  if (filters?.indexed_only) params.indexed_only = filters.indexed_only;
  if (filters?.division) params.division = filters.division;
  if (filters?.project) params.project = filters.project;

  const response = await apiClient.get<Document[]>('/documents', { params });
  return response.data;
}

export async function getDoc(id: string): Promise<Document> {
  const response = await apiClient.get<Document>(`/documents/${id}`);
  return response.data;
}

export async function downloadDoc(id: string): Promise<Blob> {
  const response = await apiClient.get(`/documents/${id}/download`, {
    responseType: 'blob',
  });
  return response.data as Blob;
}

export async function deleteDoc(id: string): Promise<void> {
  await apiClient.delete(`/documents/${id}`);
}

/** Accept or override the AI-suggested category for a document. */
export async function confirmCategory(
  id: string,
  category: string,
  detectedTypeDescription?: string,
): Promise<Document> {
  const response = await apiClient.put<Document>(`/documents/${id}/category`, {
    category,
    detected_type_description: detectedTypeDescription,
  });
  return response.data;
}

export interface DocumentEdit {
  title?: string;
  division?: string;
  project?: string;
  confidentiality?: Confidentiality;
  tags?: string[];
}

/** Edit title/division/project/confidentiality/tags. Owner or SUPER_ADMIN only. */
export async function editDocument(id: string, edit: DocumentEdit): Promise<Document> {
  const response = await apiClient.put<Document>(`/documents/${id}`, edit);
  return response.data;
}

/** Upload a new file as the next version of an existing document. */
export async function uploadNewVersion(
  id: string,
  file: File,
  changeNote?: string,
  onProgress?: (pct: number) => void,
): Promise<Document> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post<Document>(`/documents/${id}/versions`, formData, {
    params: changeNote ? { change_note: changeNote } : undefined,
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (progressEvent) => {
      if (progressEvent.total && onProgress) {
        onProgress(Math.round((progressEvent.loaded * 100) / progressEvent.total));
      }
    },
  });
  return response.data;
}

export async function listShares(id: string): Promise<DocumentShare[]> {
  const response = await apiClient.get<DocumentShare[]>(`/documents/${id}/shares`);
  return response.data;
}

/** Grant read access to one or more users by email. */
export async function shareDocument(id: string, userEmails: string[]): Promise<DocumentShare[]> {
  const response = await apiClient.post<DocumentShare[]>(`/documents/${id}/share`, { user_emails: userEmails });
  return response.data;
}

export async function unshareDocument(id: string, userId: number): Promise<void> {
  await apiClient.delete(`/documents/${id}/share/${userId}`);
}

export async function getDocContent(id: string): Promise<Chunk[]> {
  const response = await apiClient.get<Chunk[]>(`/documents/${id}/content`);
  return response.data;
}

export async function getVersions(id: string): Promise<DocumentVersion[]> {
  const response = await apiClient.get<DocumentVersion[]>(`/documents/${id}/versions`);
  return response.data;
}

export async function search(query: string, filters?: DocumentFilters): Promise<SearchResult> {
  const response = await apiClient.post<SearchResult>('/documents/search', {
    query,
    ...filters,
  });
  return response.data;
}

export async function uploadHR(file: File): Promise<{ imported: number }> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await apiClient.post<{ imported: number }>('/documents/hr/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export interface HRFilters {
  location?: string;
  min_bandwidth?: number;
  skills?: string;
}

export async function listHR(filters?: HRFilters): Promise<HRRecord[]> {
  const response = await apiClient.get<HRRecord[]>('/documents/hr/records', { params: filters });
  return response.data;
}
