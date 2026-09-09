import { format, formatDistanceToNow } from 'date-fns';
import {
  BookOpen,
  CheckCircle,
  Circle,
  Clock,
  Download,
  FileText,
  Grid3X3,
  Loader2,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../components/Layout/AppLayout';
import { Badge } from '../components/UI/Badge';
import { ConfirmModal } from '../components/UI/ConfirmModal';
import { EmptyState } from '../components/UI/EmptyState';
import { PageHeader } from '../components/UI/PageHeader';
import { useAuth } from '../hooks/useAuth';
import { useDocuments } from '../hooks/useDocuments';
import * as aiService from '../services/ai';
import * as documentsService from '../services/documents';
import type { Confidentiality, Document, DocumentFilters, DocumentVersion, UploadMetadata } from '../types';

type ViewMode = 'grid' | 'list';

const DOC_TYPES = ['PROPOSAL', 'MOU', 'AGREEMENT', 'WORK_ORDER'];
const CONFIDENTIALITIES: Confidentiality[] = ['PUBLIC', 'INTERNAL', 'RESTRICTED', 'CONFIDENTIAL'];

const confidentialityColor: Record<Confidentiality, string> = {
  PUBLIC: 'bg-green-100 text-green-700 border-green-200',
  INTERNAL: 'bg-blue-100 text-blue-700 border-blue-200',
  RESTRICTED: 'bg-orange-100 text-orange-700 border-orange-200',
  CONFIDENTIAL: 'bg-red-100 text-red-700 border-red-200',
};

function UploadDrawer({
  onClose,
  onUpload,
  isUploading,
}: {
  onClose: () => void;
  onUpload: (file: File, metadata: UploadMetadata) => Promise<void>;
  isUploading: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState('PROPOSAL');
  const [confidentiality, setConfidentiality] = useState<Confidentiality>('INTERNAL');
  const [division, setDivision] = useState('');
  const [project, setProject] = useState('');
  const [tags, setTags] = useState('');
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const handleSubmit = async () => {
    if (!file) return;
    await onUpload(file, { doc_type: docType, confidentiality, division, project, tags });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="bg-black/40 absolute inset-0" />
      <div
        className="relative bg-white w-full max-w-md h-full flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <Upload size={18} className="text-[#1a56db]" /> Upload Document
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const dropped = e.dataTransfer.files[0];
              if (dropped) setFile(dropped);
            }}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              isDragging ? 'border-[#1a56db] bg-blue-50' : 'border-slate-300 hover:border-[#1a56db]'
            }`}
            onClick={() => document.getElementById('repo-file-input')?.click()}
          >
            <Upload size={28} className="mx-auto text-slate-400 mb-3" />
            {file ? (
              <div>
                <p className="text-sm font-medium text-slate-800">{file.name}</p>
                <p className="text-xs text-slate-400 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            ) : (
              <div>
                <p className="text-sm font-medium text-slate-700">Drop file here or click to browse</p>
                <p className="text-xs text-slate-400 mt-1">PDF, DOCX, TXT, XLSX up to 50MB</p>
              </div>
            )}
            <input
              id="repo-file-input"
              type="file"
              className="hidden"
              accept=".pdf,.docx,.doc,.txt,.xlsx,.xls,.csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {isUploading && (
            <div>
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Uploading…</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-1.5">
                <div className="bg-[#1a56db] h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Document Type *</label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#1a56db] bg-white text-slate-800"
              >
                {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Confidentiality *</label>
              <select
                value={confidentiality}
                onChange={(e) => setConfidentiality(e.target.value as Confidentiality)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#1a56db] bg-white text-slate-800"
              >
                {CONFIDENTIALITIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Division</label>
            <input
              type="text"
              value={division}
              onChange={(e) => setDivision(e.target.value)}
              placeholder="e.g. Quality Standards"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#1a56db] text-slate-800"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Project</label>
            <input
              type="text"
              value={project}
              onChange={(e) => setProject(e.target.value)}
              placeholder="e.g. QCI/0826/550"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#1a56db] text-slate-800"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Tags (comma-separated)</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g. tender, certification, audit"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#1a56db] text-slate-800"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-medium border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={!file || isUploading}
            className="flex-1 px-4 py-2 text-sm font-medium bg-[#1a56db] text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {isUploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            Upload
          </button>
        </div>
      </div>
    </div>
  );
}

const INGESTION_STEPS = [
  { key: 'uploaded',   label: 'File uploaded',          detail: 'Stored securely on server' },
  { key: 'extracting', label: 'Extracting text',         detail: 'OCR / parsing document content' },
  { key: 'embedding',  label: 'Creating embeddings',     detail: 'Running all-MiniLM-L6-v2 model' },
  { key: 'indexing',   label: 'Indexing in Pinecone',    detail: 'Writing vectors to knowledge base' },
  { key: 'done',       label: 'Ready for AI search',     detail: 'Document is fully indexed' },
];

function IndexingProgress({ doc, onIndexed }: { doc: Document; onIndexed: (updated: Document) => void }) {
  const queryClient = useQueryClient();
  const uploadedAt = new Date(doc.created_at).getTime();
  const [elapsed, setElapsed] = useState(Date.now() - uploadedAt);

  // Advance the step estimate every second
  useEffect(() => {
    const t = setInterval(() => setElapsed(Date.now() - uploadedAt), 1000);
    return () => clearInterval(t);
  }, [uploadedAt]);

  // Poll backend every 3 s until indexed
  const { data: live } = useQuery<Document>({
    queryKey: ['doc-status', doc.id],
    queryFn: () => documentsService.getDoc(doc.id),
    refetchInterval: (query) => (query.state.data?.is_indexed ? false : 3000),
    initialData: doc,
  });

  useEffect(() => {
    if (live?.is_indexed) {
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
      onIndexed(live);
    }
  }, [live?.is_indexed, live, queryClient, onIndexed]);

  // Estimate current step from elapsed time (heuristic — real progress unknown)
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
        {INGESTION_STEPS.map((step, i) => {
          const done    = i < activeStep;
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

      {/* Progress bar */}
      <div className="mt-4 h-1.5 bg-amber-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-amber-500 rounded-full transition-all duration-1000"
          style={{ width: `${Math.min(100, (activeStep / (INGESTION_STEPS.length - 1)) * 100)}%` }}
        />
      </div>
    </div>
  );
}

function DocDetailPanel({
  doc: initialDoc,
  onClose,
  onDelete,
  onIndexed,
}: {
  doc: Document;
  onClose: () => void;
  onDelete: (id: string) => void;
  onIndexed?: (updated: Document) => void;
}) {
  const { hasAnyRole } = useAuth();
  const isAdmin = hasAnyRole(['SUPER_ADMIN', 'BOARD_ADMIN']);
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
      <div
        className="fixed inset-0 bg-black/40 z-40 flex justify-end"
        onClick={onClose}
      >
        <div
          className="bg-white w-full max-w-xl h-full flex flex-col shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900 truncate">{doc.title}</h3>
              <p className="text-xs text-slate-400 mt-0.5 truncate">{doc.file_name}</p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 flex-shrink-0 ml-3">
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Badges row */}
            <div className="flex flex-wrap gap-2">
              {doc.doc_type && (
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                  {doc.doc_type}
                </span>
              )}
              <Badge
                label={doc.confidentiality}
                variant="confidentiality"
                value={doc.confidentiality}
              />
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

            {/* Indexing progress */}
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
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                Metadata
              </h4>
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
                <p className="text-sm text-slate-700 leading-relaxed bg-purple-50 border border-purple-100 rounded-xl p-4">
                  {summary}
                </p>
              </div>
            )}

            {/* Version History */}
            <div>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                Version History
              </h4>
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
              disabled={summarising}
              className="flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 text-sm font-medium rounded-lg hover:bg-purple-200 transition-colors disabled:opacity-50"
            >
              {summarising ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              Summarise
            </button>
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

export function RepositoryPage() {
  const [filters, setFilters] = useState<DocumentFilters>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [activeDocType, setActiveDocType] = useState<string>('');
  const [activeConf, setActiveConf] = useState<string>('');

  const queryClient = useQueryClient();

  const activeFilters: DocumentFilters = {
    ...filters,
    ...(searchQuery ? { query: searchQuery } : {}),
    ...(activeDocType ? { doc_type: [activeDocType] } : {}),
    ...(activeConf ? { confidentiality: [activeConf as Confidentiality] } : {}),
  };

  const { documents, isLoading, upload, deleteDoc, isUploading } = useDocuments(activeFilters);
  const { hasAnyRole } = useAuth();
  const isAdmin = hasAnyRole(['SUPER_ADMIN', 'BOARD_ADMIN']);

  const handleDelete = async (id: string) => {
    await deleteDoc(id);
    if (selectedDoc?.id === id) setSelectedDoc(null);
    void queryClient.invalidateQueries({ queryKey: ['documents'] });
  };

  const handleUpload = async (file: File, metadata: UploadMetadata) => {
    await upload({ file, metadata });
  };

  return (
    <AppLayout title="Document Repository">
      <div className="max-w-[1400px] mx-auto">
        <PageHeader
          title="Document Repository"
          subtitle="Manage and search across all QCI knowledge documents"
          actions={
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#1a56db] text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Upload size={15} /> Upload Document
            </button>
          }
        />

        {/* Search + filters */}
        <div className="space-y-3 mb-5">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search documents by title, content, tags…"
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#1a56db] bg-white text-slate-800"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Doc type chips */}
            <button
              onClick={() => setActiveDocType('')}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors border ${
                activeDocType === ''
                  ? 'bg-[#1a56db] text-white border-[#1a56db]'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              All Types
            </button>
            {DOC_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setActiveDocType(activeDocType === t ? '' : t)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors border ${
                  activeDocType === t
                    ? 'bg-[#1a56db] text-white border-[#1a56db]'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {t}
              </button>
            ))}

            <div className="w-px h-4 bg-slate-200 mx-1" />

            {CONFIDENTIALITIES.map((c) => (
              <button
                key={c}
                onClick={() => setActiveConf(activeConf === c ? '' : c)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors border ${
                  activeConf === c
                    ? `${confidentialityColor[c]} border-current`
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {c}
              </button>
            ))}

            {/* View toggle */}
            <div className="ml-auto flex items-center gap-1 bg-slate-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white shadow-sm text-[#1a56db]' : 'text-slate-500 hover:text-slate-700'}`}
                title="Grid view"
              >
                <Grid3X3 size={14} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white shadow-sm text-[#1a56db]' : 'text-slate-500 hover:text-slate-700'}`}
                title="List view"
              >
                <FileText size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={28} className="animate-spin text-[#1a56db]" />
          </div>
        ) : documents.length === 0 ? (
          <EmptyState
            icon={<BookOpen size={28} />}
            heading="No documents found"
            body="Upload documents to get started or adjust your search filters."
            action={{ label: 'Upload Document', onClick: () => setShowUpload(true) }}
          />
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {documents.map((doc) => (
              <GridCard key={doc.id} doc={doc} onClick={setSelectedDoc} isAdmin={isAdmin} onDelete={handleDelete} />
            ))}
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    {['Title', 'Type', 'Confidentiality', 'Division', 'Pages', 'Status', 'Date', 'Actions'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {documents.map((doc) => (
                    <tr
                      key={doc.id}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                      onClick={() => setSelectedDoc(doc)}
                    >
                      <td className="px-4 py-3 max-w-[220px]">
                        <div className="font-medium text-slate-800 truncate">{doc.title}</div>
                        <div className="text-xs text-slate-400 truncate">{doc.file_name}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{doc.doc_type ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${confidentialityColor[doc.confidentiality] ?? ''}`}>
                          {doc.confidentiality}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{doc.division ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{doc.page_count}</td>
                      <td className="px-4 py-3">
                        {doc.is_indexed ? (
                          <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                            <CheckCircle size={10} /> Indexed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                            <Clock size={10} /> Pending
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                        {format(new Date(doc.created_at), 'MMM d, yyyy')}
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={async () => {
                              const blob = await documentsService.downloadDoc(doc.id);
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url; a.download = doc.file_name; a.click();
                              URL.revokeObjectURL(url);
                            }}
                            className="p-1.5 rounded text-slate-400 hover:text-[#1a56db] hover:bg-blue-50 transition-colors"
                            title="Download"
                          >
                            <Download size={14} />
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => void handleDelete(doc.id)}
                              className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Upload Drawer */}
      {showUpload && (
        <UploadDrawer
          onClose={() => setShowUpload(false)}
          onUpload={handleUpload}
          isUploading={isUploading}
        />
      )}

      {/* Detail Panel */}
      {selectedDoc && (
        <DocDetailPanel
          doc={selectedDoc}
          onClose={() => setSelectedDoc(null)}
          onDelete={handleDelete}
          onIndexed={(updated) => setSelectedDoc(updated)}
        />
      )}
    </AppLayout>
  );
}

function GridCard({
  doc,
  onClick,
  isAdmin,
  onDelete,
}: {
  doc: Document;
  onClick: (doc: Document) => void;
  isAdmin: boolean;
  onDelete: (id: string) => void;
}) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDownloading(true);
    try {
      const blob = await documentsService.downloadDoc(doc.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = doc.file_name; a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      onClick={() => onClick(doc)}
      className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md hover:border-slate-300 transition-all cursor-pointer group"
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 flex-shrink-0">
          <FileText size={18} className="text-[#1a56db]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm text-slate-900 line-clamp-2 leading-snug">{doc.title}</div>
          <div className="text-xs text-slate-400 mt-0.5 truncate">{doc.file_name}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {doc.doc_type && (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
            {doc.doc_type}
          </span>
        )}
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${confidentialityColor[doc.confidentiality] ?? ''}`}>
          {doc.confidentiality}
        </span>
        {doc.is_indexed ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-100">
            <CheckCircle size={9} /> Indexed
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100">
            <Clock size={9} /> Pending
          </span>
        )}
      </div>

      <div className="text-xs text-slate-400 flex items-center gap-3 mb-3">
        <span>{doc.page_count} pages</span>
        <span>v{doc.current_version}</span>
        <span>{format(new Date(doc.created_at), 'MMM d, yyyy')}</span>
      </div>

      {(doc.tags?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {doc.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
              #{tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1.5 pt-2 border-t border-slate-100 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => void handleDownload(e)}
          disabled={downloading}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded text-slate-600 hover:bg-slate-100 transition-colors"
        >
          {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
          Download
        </button>
        {isAdmin && (
          <button
            onClick={(e) => { e.stopPropagation(); void onDelete(doc.id); }}
            className="ml-auto flex items-center gap-1 text-xs px-2 py-1 rounded text-red-600 hover:bg-red-50 transition-colors"
          >
            <Trash2 size={12} /> Delete
          </button>
        )}
      </div>
    </div>
  );
}
