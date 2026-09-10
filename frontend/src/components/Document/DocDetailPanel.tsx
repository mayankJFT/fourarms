import { format } from 'date-fns';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Download,
  Eye,
  FileText,
  Info,
  Loader2,
  Pencil,
  Share2,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Badge } from '../UI/Badge';
import { ConfirmModal } from '../UI/ConfirmModal';
import { DocumentViewer } from './DocumentViewer';
import { EditMetadataModal } from './EditMetadataModal';
import { IndexingProgress } from './IndexingProgress';
import { ShareModal } from './ShareModal';
import { useAuth } from '../../hooks/useAuth';
import * as aiService from '../../services/ai';
import * as documentsService from '../../services/documents';
import { DOCUMENT_CATEGORIES } from '../../types';
import type { Document, DocumentVersion } from '../../types';

type Tab = 'details' | 'content';

interface Props {
  doc: Document;
  onClose: () => void;
  onDelete: (id: string) => void;
  onIndexed?: (updated: Document) => void;
}

export function DocDetailPanel({ doc: initialDoc, onClose, onDelete, onIndexed }: Props) {
  const { currentUser, hasAnyRole } = useAuth();
  const queryClient = useQueryClient();
  const isSuperAdmin = hasAnyRole(['SUPER_ADMIN']);
  const canDelete = isSuperAdmin || initialDoc.uploader_id === currentUser?.id;
  const [tab, setTab] = useState<Tab>('details');
  const [summarising, setSummarising] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [doc, setDoc] = useState<Document>(initialDoc);
  const [editingCategory, setEditingCategory] = useState(false);
  const [categoryChoice, setCategoryChoice] = useState('');
  const [categoryDescription, setCategoryDescription] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [uploadingVersion, setUploadingVersion] = useState(false);
  const newVersionInputRef = useRef<HTMLInputElement>(null);

  const handleUploadNewVersion = async (file: File | null) => {
    if (!file) return;
    setUploadingVersion(true);
    try {
      const updated = await documentsService.uploadNewVersion(doc.id, file);
      setDoc(updated);
      await queryClient.invalidateQueries({ queryKey: ['versions', doc.id] });
      await queryClient.invalidateQueries({ queryKey: ['documents'] });
    } catch {
      // ConfirmModal/toasts aren't wired to this component; the version-history
      // list and status badge reflect the outcome either way on next refresh.
    } finally {
      setUploadingVersion(false);
      if (newVersionInputRef.current) newVersionInputRef.current.value = '';
    }
  };

  const needsCategoryReview = doc.is_indexed && !doc.category_confirmed;
  const showCategoryEditor = needsCategoryReview || editingCategory;

  // Seed the picker from the AI's actual suggestion the first time it becomes reviewable
  // (e.g. right after indexing finishes) — but only while untouched, so it doesn't clobber
  // an in-progress manual edit from startEditingCategory/the pencil icon.
  useEffect(() => {
    if (needsCategoryReview && categoryChoice === '') {
      setCategoryChoice(
        doc.doc_type && (DOCUMENT_CATEGORIES as readonly string[]).includes(doc.doc_type) ? doc.doc_type : 'Other',
      );
      setCategoryDescription(doc.ai_detected_type ?? '');
    }
  }, [needsCategoryReview, categoryChoice, doc.doc_type, doc.ai_detected_type]);

  const startEditingCategory = () => {
    setCategoryChoice(
      doc.doc_type && (DOCUMENT_CATEGORIES as readonly string[]).includes(doc.doc_type) ? doc.doc_type : 'Other',
    );
    setCategoryDescription(doc.ai_detected_type ?? '');
    setEditingCategory(true);
  };

  const handleConfirmCategory = async () => {
    if (!categoryChoice) return;
    setSavingCategory(true);
    try {
      const updated = await documentsService.confirmCategory(
        doc.id,
        categoryChoice,
        categoryChoice === 'Other' ? categoryDescription : undefined,
      );
      setDoc(updated);
      setEditingCategory(false);
    } finally {
      setSavingCategory(false);
    }
  };

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
    } catch (err) {
      setSummary(err instanceof Error && err.message ? err.message : 'Failed to generate summary. Please try again.');
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
            <div className="flex items-center gap-1 flex-shrink-0 ml-3">
              {canDelete && (
                <>
                  <button
                    onClick={() => setShowEditModal(true)}
                    title="Edit metadata"
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => setShowShareModal(true)}
                    title="Share"
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <Share2 size={16} />
                  </button>
                  <button
                    onClick={() => newVersionInputRef.current?.click()}
                    title="Upload new version"
                    disabled={uploadingVersion}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40"
                  >
                    {uploadingVersion ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
                  </button>
                  <input
                    ref={newVersionInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => void handleUploadNewVersion(e.target.files?.[0] ?? null)}
                  />
                </>
              )}
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1.5">
                <X size={20} />
              </button>
            </div>
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
                <div className="flex flex-wrap items-center gap-2">
                  {doc.doc_type && !showCategoryEditor && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                      {doc.doc_type}
                      <button
                        onClick={startEditingCategory}
                        title="Change category"
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <Pencil size={10} />
                      </button>
                    </span>
                  )}
                  <Badge label={doc.confidentiality} variant="confidentiality" value={doc.confidentiality} />
                  {doc.is_indexed ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-green-100 text-green-700">
                      <CheckCircle size={10} /> Indexed
                    </span>
                  ) : doc.ingestion_error ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-red-100 text-red-700">
                      <AlertTriangle size={10} /> Failed
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
                      <Clock size={10} /> Pending Index
                    </span>
                  )}
                </div>

                {/* AI category suggestion / review */}
                {showCategoryEditor && (
                  <div className="bg-violet-50 border border-violet-100 rounded-xl p-4 space-y-3">
                    <div className="flex items-start gap-2">
                      <Sparkles size={15} className="text-violet-600 flex-shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-violet-900">
                          {needsCategoryReview ? 'AI-suggested category' : 'Change category'}
                        </p>
                        {doc.ai_detected_type && (
                          <p className="text-xs text-violet-600 mt-0.5">
                            Aria identified this as: <span className="font-medium">{doc.ai_detected_type}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={categoryChoice}
                        onChange={(e) => setCategoryChoice(e.target.value)}
                        className="flex-1 text-sm border border-violet-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-violet-400 bg-white text-slate-800"
                      >
                        {DOCUMENT_CATEGORIES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>

                    {categoryChoice === 'Other' && (
                      <input
                        type="text"
                        value={categoryDescription}
                        onChange={(e) => setCategoryDescription(e.target.value)}
                        placeholder="Describe the document type (optional)"
                        className="w-full text-sm border border-violet-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-violet-400 text-slate-800"
                      />
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={() => void handleConfirmCategory()}
                        disabled={savingCategory}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white text-xs font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
                      >
                        {savingCategory ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                        Confirm
                      </button>
                      {!needsCategoryReview && (
                        <button
                          onClick={() => setEditingCategory(false)}
                          className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                )}

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
            {canDelete && (
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

      {showEditModal && (
        <EditMetadataModal
          doc={doc}
          onClose={() => setShowEditModal(false)}
          onSaved={(updated) => {
            setDoc(updated);
            void queryClient.invalidateQueries({ queryKey: ['documents'] });
          }}
        />
      )}

      {showShareModal && (
        <ShareModal docId={doc.id} docTitle={doc.title} onClose={() => setShowShareModal(false)} />
      )}
    </>
  );
}
