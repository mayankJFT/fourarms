import type { DocType, DocumentTemplate } from '../types';
import apiClient from './api';

export async function listTemplates(docType?: DocType): Promise<DocumentTemplate[]> {
  const response = await apiClient.get<DocumentTemplate[]>('/ai/templates', {
    params: docType ? { doc_type: docType } : undefined,
  });
  return response.data;
}

export async function uploadTemplate(
  file: File,
  docType: DocType,
  title?: string,
): Promise<DocumentTemplate> {
  const form = new FormData();
  form.append('file', file);
  form.append('doc_type', docType);
  if (title) form.append('title', title);

  const response = await apiClient.post<DocumentTemplate>('/ai/templates', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function deleteTemplate(id: string): Promise<void> {
  await apiClient.delete(`/ai/templates/${id}`);
}
