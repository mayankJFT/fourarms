import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, CheckCircle, Circle, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as documentsService from '../../services/documents';
import type { Document } from '../../types';

const STEPS = [
  { key: 'uploaded',   label: 'File uploaded',          detail: 'Stored securely on server' },
  { key: 'extracting', label: 'Extracting text',         detail: 'OCR / parsing document content' },
  { key: 'embedding',  label: 'Creating embeddings',     detail: 'Running all-MiniLM-L6-v2 model' },
  { key: 'indexing',   label: 'Indexing in Pinecone',    detail: 'Writing vectors to knowledge base' },
  { key: 'done',       label: 'Ready for AI search',     detail: 'Document is fully indexed' },
];

interface Props {
  doc: Document;
  onIndexed: (updated: Document) => void;
}

export function IndexingProgress({ doc, onIndexed }: Props) {
  const queryClient = useQueryClient();
  const uploadedAt = new Date(doc.created_at).getTime();
  const [elapsed, setElapsed] = useState(Date.now() - uploadedAt);

  useEffect(() => {
    const t = setInterval(() => setElapsed(Date.now() - uploadedAt), 1000);
    return () => clearInterval(t);
  }, [uploadedAt]);

  const { data: live } = useQuery<Document>({
    queryKey: ['doc-status', doc.id],
    queryFn: () => documentsService.getDoc(doc.id),
    refetchInterval: (query) =>
      query.state.data?.is_indexed || query.state.data?.ingestion_error ? false : 3000,
    initialData: doc,
  });

  useEffect(() => {
    if (live?.is_indexed) {
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
      onIndexed(live);
    } else if (live?.ingestion_error) {
      // Still refresh the grid/list so the failure badge shows up there too —
      // just don't call onIndexed since nothing was actually indexed.
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
    }
  }, [live?.is_indexed, live?.ingestion_error, live, queryClient, onIndexed]);

  if (live?.ingestion_error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800">Processing failed</p>
            <p className="text-xs text-red-600 mt-1">{live.ingestion_error}</p>
            <p className="text-xs text-red-500 mt-2">
              Try re-uploading the file, or upload a corrected copy as a new version.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const elapsedSec = elapsed / 1000;
  let activeStep = 0;
  if (elapsedSec > 2)  activeStep = 1;
  if (elapsedSec > 6)  activeStep = 2;
  if (elapsedSec > 12) activeStep = 3;
  if (live?.is_indexed) activeStep = 4;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-center gap-2 mb-4">
        <Loader2 size={15} className="animate-spin text-amber-600" />
        <span className="text-sm font-semibold text-amber-800">Processing document…</span>
        <span className="ml-auto text-xs text-amber-600 font-mono">
          {formatDistanceToNow(new Date(doc.created_at), { includeSeconds: true })} ago
        </span>
      </div>

      <ol className="space-y-3">
        {STEPS.map((step, i) => {
          const done = i < activeStep;
          const current = i === activeStep && !live?.is_indexed;
          return (
            <li key={step.key} className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                {done ? (
                  <CheckCircle size={16} className="text-green-600" />
                ) : current ? (
                  <Loader2 size={16} className="animate-spin text-amber-600" />
                ) : (
                  <Circle size={16} className="text-slate-300" />
                )}
              </div>
              <div>
                <p className={`text-sm font-medium leading-tight ${done ? 'text-green-700' : current ? 'text-amber-800' : 'text-slate-400'}`}>
                  {step.label}
                </p>
                <p className={`text-xs mt-0.5 ${done ? 'text-green-600' : current ? 'text-amber-600' : 'text-slate-300'}`}>
                  {step.detail}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-4 h-1.5 bg-amber-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-amber-500 rounded-full transition-all duration-1000"
          style={{ width: `${Math.min(100, (activeStep / (STEPS.length - 1)) * 100)}%` }}
        />
      </div>
    </div>
  );
}
