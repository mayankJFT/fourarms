import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WorkflowFilters } from '../services/workflow';
import * as workflowService from '../services/workflow';

export function useWorkflow(filters?: WorkflowFilters) {
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ['workflow', 'documents', filters],
    queryFn: () => workflowService.listGenerated(filters),
  });

  const submitMutation = useMutation({
    mutationFn: (id: string) => workflowService.submit(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workflow'] });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => workflowService.approve(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workflow'] });
    },
  });

  const reviseMutation = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment: string }) =>
      workflowService.revise(id, comment),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workflow'] });
    },
  });

  const exportMutation = useMutation({
    mutationFn: async (id: string) => {
      const blob = await workflowService.exportDocx(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `document-${id}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  return {
    documents: listQuery.data ?? [],
    isLoading: listQuery.isLoading,
    refetch: listQuery.refetch,
    submit: submitMutation.mutateAsync,
    isSubmitting: submitMutation.isPending,
    approve: approveMutation.mutateAsync,
    isApproving: approveMutation.isPending,
    revise: reviseMutation.mutateAsync,
    isRevising: reviseMutation.isPending,
    exportDoc: exportMutation.mutateAsync,
    isExporting: exportMutation.isPending,
  };
}

export function useGeneratedDoc(id: string) {
  const queryClient = useQueryClient();

  const docQuery = useQuery({
    queryKey: ['workflow', 'document', id],
    queryFn: () => workflowService.getGenerated(id),
    enabled: !!id,
  });

  const historyQuery = useQuery({
    queryKey: ['workflow', 'history', id],
    queryFn: () => workflowService.getHistory(id),
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: (content: string) => workflowService.updateDraft(id, content),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workflow', 'document', id] });
    },
  });

  return {
    document: docQuery.data,
    isLoading: docQuery.isLoading,
    history: historyQuery.data ?? [],
    update: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
  };
}
