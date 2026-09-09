import { format } from 'date-fns';
import {
  BookOpen,
  CheckCircle,
  Clock,
  Download,
  FileText,
  Loader2,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import * as aiService from '../../services/ai';
import * as documentsService from '../../services/documents';
import type { Confidentiality, Document } from '../../types';

interface DocumentCardProps {
  document: Document;
  onDelete?: (id: string) => void;
  onClick?: (doc: Document) => void;
}

const confidentialityStyles: Record<Confidentiality, string> = {
  PUBLIC: 'bg-green-100 text-green-700 border-green-200',
  INTERNAL: 'bg-blue-100 text-blue-700 border-blue-200',
  RESTRICTED: 'bg-orange-100 text-orange-700 border-orange-200',
  CONFIDENTIAL: 'bg-red-100 text-red-700 border-red-200',
};

function DocTypeIcon({ type }: { type: string | null }) {
  const t = (type ?? '').toUpperCase();
  if (t === 'PROPOSAL') return <FileText size={18} className="text-purple-500" />;
  if (t === 'MOU' || t === 'AGREEMENT') return <BookOpen size={18} className="text-blue-500" />;
  return <FileText size={18} className="text-gray-400" />;
}

export function DocumentCard({ document: doc, onDelete, onClick }: DocumentCardProps) {
  const { hasAnyRole } = useAuth();
  const isAdmin = hasAnyRole(['SUPER_ADMIN', 'BOARD_ADMIN']);
  const [summarising, setSummarising] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDownloading(true);
    try {
      const blob = await documentsService.downloadDoc(doc.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.file_name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently fail
    } finally {
      setDownloading(false);
    }
  };

  const handleSummarise = async (e: React.MouseEvent) => {
    e.stopPropagation();
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

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Delete "${doc.title}"?`)) {
      onDelete?.(doc.id);
    }
  };

  return (
    <div
      onClick={() => onClick?.(doc)}
      className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md hover:border-blue-200 transition-all cursor-pointer group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-gray-50 rounded-lg">
            <DocTypeIcon type={doc.doc_type} />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-sm text-gray-800 line-clamp-2 leading-snug">
              {doc.title}
            </div>
            <div className="text-xs text-gray-400 mt-0.5 truncate">{doc.file_name}</div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
          {doc.doc_type}
        </span>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full border ${confidentialityStyles[doc.confidentiality] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}
        >
          {doc.confidentiality}
        </span>
        {doc.is_indexed ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
            <CheckCircle size={10} /> Indexed
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200">
            <Clock size={10} /> Pending
          </span>
        )}
      </div>

      <div className="text-xs text-gray-400 flex items-center gap-3 mb-3">
        <span>{doc.page_count} pages</span>
        <span>v{doc.current_version}</span>
        <span>{format(new Date(doc.created_at), 'MMM d, yyyy')}</span>
      </div>

      {doc.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {doc.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
              #{tag}
            </span>
          ))}
        </div>
      )}

      {summary && (
        <div className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2 mb-3 line-clamp-3 border border-gray-100">
          {summary}
        </div>
      )}

      <div className="flex items-center gap-1.5 pt-2 border-t border-gray-100 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => void handleDownload(e)}
          disabled={downloading}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded text-gray-600 hover:bg-gray-100 transition-colors"
          title="Download"
        >
          {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
          Download
        </button>

        <button
          onClick={(e) => void handleSummarise(e)}
          disabled={summarising}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded text-blue-700 hover:bg-blue-50 transition-colors"
          title="AI Summary"
        >
          {summarising ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Sparkles size={12} />
          )}
          Summarise
        </button>

        {isAdmin && onDelete && (
          <button
            onClick={handleDelete}
            className="ml-auto flex items-center gap-1 text-xs px-2 py-1 rounded text-red-600 hover:bg-red-50 transition-colors"
            title="Delete"
          >
            <Trash2 size={12} />
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
