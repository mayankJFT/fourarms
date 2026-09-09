import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { DocumentFilters, UploadMetadata } from '../types';
import * as documentsService from '../services/documents';

export function useDocuments(filters?: DocumentFilters) {
  const queryClient = useQueryClient();
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

  const documentsQuery = useQuery({
    queryKey: ['documents', filters],
    queryFn: () => documentsService.list(filters),
  });

  const uploadMutation = useMutation({
    mutationFn: ({ file, metadata }: { file: File; metadata: UploadMetadata }) => {
      return documentsService.upload(file, metadata, (pct) => {
        setUploadProgress((prev) => ({ ...prev, [file.name]: pct }));
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
      setUploadProgress({});
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => documentsService.deleteDoc(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });

  return {
    documents: documentsQuery.data ?? [],
    isLoading: documentsQuery.isLoading,
    isError: documentsQuery.isError,
    refetch: documentsQuery.refetch,
    upload: uploadMutation.mutateAsync,
    isUploading: uploadMutation.isPending,
    uploadProgress,
    deleteDoc: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  };
}

export function useDocumentSearch() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<DocumentFilters>({});

  const searchResult = useQuery({
    queryKey: ['documents', 'search', searchQuery, filters],
    queryFn: () => documentsService.search(searchQuery, filters),
    enabled: searchQuery.length > 0,
  });

  const listResult = useQuery({
    queryKey: ['documents', filters],
    queryFn: () => documentsService.list(filters),
    enabled: searchQuery.length === 0,
  });

  const activeQuery = searchQuery.length > 0 ? searchResult : listResult;

  const documents =
    searchQuery.length > 0
      ? (searchResult.data?.documents ?? [])
      : (listResult.data ?? []);

  return {
    documents,
    isLoading: activeQuery.isLoading,
    searchQuery,
    setSearchQuery,
    filters,
    setFilters,
  };
}
