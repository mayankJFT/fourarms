import { format } from 'date-fns';
import {
  CheckCircle,
  Clock,
  Download,
  Eye,
  FileText,
  Info,
  Loader2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Badge } from '../UI/Badge';
import { ConfirmModal } from '../UI/ConfirmModal';
import { DocumentViewer } from './DocumentViewer';
import { IndexingProgress } from './IndexingProgress';
import { useAuth } from '../../hooks/useAuth';
import * as aiService from '../../services/ai';
import * as documentsService from '../../services/documents';
import type { Document, DocumentVersion } from '../../types';

type Tab = 'details' | 'content';

interface Props {
  doc: Document;
  onClose: () => void;
  onDelete: (id: string) => void;
  onIndexed?: (updated: Document) => void;
}

export function DocDetailPanel({ doc: initialDoc, onClose, onDelete, onIndexed }: Props) {
  const { hasAnyRole } = useAuth();
  const isAdmin = hasAnyRole(['SUPER_ADMIN', 'BOARD_ADMIN']);
  const [tab, setTab] = useState<Tab>('details');
  const [summarising, setSummarising] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [doc, setDoc] = useState<Document>(initialDoc);

  const { data: versions = [] } = useQuery<DocumentVersion[]>({
    queryKey: ['versions', doc.id],
    queryFn: () => documentsService.getVersions(doc.id),
  });

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const blob = await documentsService.downloadDoc(doc.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.file_name;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  const handleSummarise = async () => {
    setSummarising(true);
    try {
      const result = await aiService.summarise(doc.id);
      setSummary(result.summary);
    } catch {
      setSummary('Failed to generate summary.');
    } finally {
      setSummarising(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 flex justify-end" onClick={onClose}>
        <div
          className="bg-white w-full max-w-xl h-full flex flex-col shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900 truncate">{doc.title}</h3>
              <p className="text-xs text-slate-400 mt-0.5 truncate">{doc.file_name}</p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 flex-shrink-0 ml-3">
              <X size={20} />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-slate-200 px-6 bg-white">
            {([
              { id: 'details', label: 'Details', icon: <Info size={13} /> },
              { id: 'content', label: 'Content', icon: <Eye size={13} />, disabled: !doc.is_indexed },
            ] as { id: Tab; label: string; icon: React.ReactNode; disabled?: boolean }[]).map(({ id, label, icon, disabled }) => (
              <button
                key={id}
                onClick={() => !disabled && setTab(id)}
                disabled={disabled}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors -mb-px ${
                  tab === id
                    ? 'border-[#1a56db] text-[#1a56db]'
                    : disabled
                    ? 'border-transparent text-slate-300 cursor-not-allowed'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {icon}{label}
                {disabled && <span className="text-[9px] bg-amber-100 text-amber-600 px-1 rounded">pending</span>}
              </button>
            ))}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {tab === 'content' ? (
              <div className="flex-1 overflow-hidden px-6 py-4">
                <DocumentViewer docId={doc.id} docTitle={doc.title} />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Status badges */}
                <div className="flex flex-wrap gap-2">
                  {doc.doc_type && (
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                      {doc.doc_type}
                    </span>
                  )}
                  <Badge label={doc.confidentiality} variant="confidentiality" value={doc.confidentiality} />
                  {doc.is_indexed ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-green-100 text-green-700">
                      <CheckCircle size={10} /> Indexed
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
                      <Clock size={10} /> Pending Index
                    </span>
                  )}
                </div>

                {!doc.is_indexed && (
                  <IndexingProgress
                    doc={doc}
                    onIndexed={(updated) => {
                      setDoc(updated);
                      onIndexed?.(updated);
                    }}
                  />
                )}

                {/* Metadata */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Metadata</h4>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    {[
                      ['Division', doc.division ?? '—'],
                      ['Project', doc.project ?? '—'],
                      ['Pages', doc.page_count],
                      ['Version', `v${doc.current_version}`],
                      ['Uploaded', format(new Date(doc.created_at), 'MMM d, yyyy')],
                      ['Scanned', doc.is_scanned ? 'Yes' : 'No'],
                    ].map(([label, val]) => (
                      <div key={String(label)}>
                        <dt className="text-xs text-slate-400">{label}</dt>
                        <dd className="font-medium text-slate-700 mt-0.5">{val}</dd>
                      </div>
                    ))}
                  </dl>
                </div>

                {/* Tags */}
                {(doc.tags?.length ?? 0) > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Tags</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {doc.tags.map((tag) => (
                        <span key={tag} className="text-xs bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full border border-blue-100">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* AI Abstract */}
                {doc.ai_abstract && (
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">AI Abstract</h4>
                    <p className="text-sm text-slate-700 leading-relaxed bg-blue-50 border border-blue-100 rounded-xl p-4">
                      {doc.ai_abstract}
                    </p>
                  </div>
                )}

                {/* AI Summary on demand */}
                {summary && (
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">AI Summary</h4>
                    <div className="text-sm text-slate-700 leading-relaxed bg-purple-50 border border-purple-100 rounded-xl p-4 prose prose-sm max-w-none prose-p:my-1 prose-li:my-0">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary}</ReactMarkdown>
                    </div>
                  </div>
                )}

                {/* Version History */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Version History</h4>
                  {versions.length === 0 ? (
                    <p className="text-sm text-slate-400">No version history available.</p>
                  ) : (
                    <div className="space-y-2">
                      {versions.map((v) => (
                        <div key={v.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg text-sm">
                          <Clock size={14} className="text-slate-400 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-slate-700">Version {v.version_number}</div>
                            <div className="text-xs text-slate-400 truncate">
                              {v.change_note ?? v.file_path.split('/').pop()}
                            </div>
                          </div>
                          <div className="text-xs text-slate-400">
                            {format(new Date(v.created_at), 'MMM d, yyyy')}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer actions */}
          <div className="px-6 py-4 border-t border-slate-200 flex gap-3">
            <button
              onClick={() => void handleDownload()}
              disabled={downloading}
              className="flex items-center gap-2 px-4 py-2 bg-[#1a56db] text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {downloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              Download
            </button>
            <button
              onClick={() => void handleSummarise()}
              disabled={summarising || !doc.is_indexed}
              className="flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 text-sm font-medium rounded-lg hover:bg-purple-200 transition-colors disabled:opacity-50"
            >
              {summarising ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              Summarise
            </button>
            {doc.is_indexed && tab !== 'content' && (
              <button
                onClick={() => setTab('content')}
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 transition-colors"
              >
                <FileText size={15} /> View
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => setConfirmDelete(true)}
                className="ml-auto flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 text-sm font-medium rounded-lg hover:bg-red-100 transition-colors"
              >
                <Trash2 size={15} /> Delete
              </button>
            )}
          </div>
        </div>
      </div>

      {confirmDelete && (
        <ConfirmModal
          title="Delete Document"
          message={`Are you sure you want to delete "${doc.title}"? This action cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => {
            onDelete(doc.id);
            onClose();
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}
