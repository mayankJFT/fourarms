import { format } from 'date-fns';
import {
  BookOpen,
  CheckCircle,
  Clock,
  Download,
  FileText,
  Grid3X3,
  Loader2,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../components/Layout/AppLayout';
import { EmptyState } from '../components/UI/EmptyState';
import { PageHeader } from '../components/UI/PageHeader';
import { DocDetailPanel } from '../components/Document/DocDetailPanel';
import { GridCard } from '../components/Document/GridCard';
import { UploadDrawer } from '../components/Document/UploadDrawer';
import { useAuth } from '../hooks/useAuth';
import { useDocuments } from '../hooks/useDocuments';
import * as documentsService from '../services/documents';
import { useRepositoryStore } from '../stores/repositoryStore';
import { DOCUMENT_CATEGORIES } from '../types';
import type { Confidentiality, Document, DocumentFilters, UploadMetadata } from '../types';

const CONFIDENTIALITIES: Confidentiality[] = ['PUBLIC', 'INTERNAL', 'RESTRICTED', 'CONFIDENTIAL'];

const confidentialityColor: Record<Confidentiality, string> = {
  PUBLIC: 'bg-green-100 text-green-700 border-green-200',
  INTERNAL: 'bg-blue-100 text-blue-700 border-blue-200',
  RESTRICTED: 'bg-orange-100 text-orange-700 border-orange-200',
  CONFIDENTIAL: 'bg-red-100 text-red-700 border-red-200',
};

export function RepositoryPage() {
  const {
    searchQuery, setSearchQuery,
    viewMode, setViewMode,
    activeDocType, setActiveDocType,
    activeConf, setActiveConf,
    activeDivision, setActiveDivision,
    activeProject, setActiveProject,
    setSelectedDocId,
  } = useRepositoryStore();
  const [selectedDoc, setSelectedDocState] = useState<Document | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const queryClient = useQueryClient();

  const setSelectedDoc = (doc: Document | null) => {
    setSelectedDocState(doc);
    setSelectedDocId(doc?.id ?? null);
  };

  const activeFilters: DocumentFilters = {
    ...(searchQuery ? { query: searchQuery } : {}),
    ...(activeDocType ? { doc_type: [activeDocType] } : {}),
    ...(activeConf ? { confidentiality: [activeConf as Confidentiality] } : {}),
    ...(activeDivision ? { division: activeDivision } : {}),
    ...(activeProject ? { project: activeProject } : {}),
  };

  const { documents, isLoading, upload, deleteDoc, isUploading } = useDocuments(activeFilters);
  const { currentUser, hasAnyRole } = useAuth();
  const isSuperAdmin = hasAnyRole(['SUPER_ADMIN']);

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

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={activeDivision}
              onChange={(e) => setActiveDivision(e.target.value)}
              placeholder="Filter by department / division…"
              className="flex-1 text-sm px-3 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#1a56db] bg-white text-slate-800"
            />
            <input
              type="text"
              value={activeProject}
              onChange={(e) => setActiveProject(e.target.value)}
              placeholder="Filter by project…"
              className="flex-1 text-sm px-3 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#1a56db] bg-white text-slate-800"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setActiveDocType('')}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors border ${
                activeDocType === '' ? 'bg-[#1a56db] text-white border-[#1a56db]' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              All Types
            </button>
            {DOCUMENT_CATEGORIES.map((t) => (
              <button
                key={t}
                onClick={() => setActiveDocType(activeDocType === t ? '' : t)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors border ${
                  activeDocType === t ? 'bg-[#1a56db] text-white border-[#1a56db]' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
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
                  activeConf === c ? `${confidentialityColor[c]} border-current` : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {c}
              </button>
            ))}

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
              <GridCard
                key={doc.id}
                doc={doc}
                onClick={setSelectedDoc}
                isAdmin={isSuperAdmin || doc.uploader_id === currentUser?.id}
                onDelete={handleDelete}
              />
            ))}
          </div>
        ) : (
          <ListTable
            documents={documents}
            isSuperAdmin={isSuperAdmin}
            currentUserId={currentUser?.id}
            onSelect={setSelectedDoc}
            onDelete={handleDelete}
          />
        )}
      </div>

      {showUpload && (
        <UploadDrawer onClose={() => setShowUpload(false)} onUpload={handleUpload} isUploading={isUploading} />
      )}

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

function ListTable({
  documents,
  isSuperAdmin,
  currentUserId,
  onSelect,
  onDelete,
}: {
  documents: Document[];
  isSuperAdmin: boolean;
  currentUserId: number | undefined;
  onSelect: (doc: Document) => void;
  onDelete: (id: string) => void;
}) {
  return (
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
              <ListRow
                key={doc.id}
                doc={doc}
                isAdmin={isSuperAdmin || doc.uploader_id === currentUserId}
                onSelect={onSelect}
                onDelete={onDelete}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ListRow({
  doc,
  isAdmin,
  onSelect,
  onDelete,
}: {
  doc: Document;
  isAdmin: boolean;
  onSelect: (doc: Document) => void;
  onDelete: (id: string) => void;
}) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
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
    <tr className="hover:bg-slate-50 cursor-pointer transition-colors" onClick={() => onSelect(doc)}>
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
            onClick={() => void handleDownload()}
            disabled={downloading}
            className="p-1.5 rounded text-slate-400 hover:text-[#1a56db] hover:bg-blue-50 transition-colors disabled:opacity-50"
            title="Download"
          >
            {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          </button>
          {isAdmin && (
            <button
              onClick={() => void onDelete(doc.id)}
              className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
