import { format } from 'date-fns';
import { CheckCircle, Clock, Download, FileText, Loader2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import * as documentsService from '../../services/documents';
import type { Confidentiality, Document } from '../../types';

const confidentialityColor: Record<Confidentiality, string> = {
  PUBLIC: 'bg-green-100 text-green-700 border-green-200',
  INTERNAL: 'bg-blue-100 text-blue-700 border-blue-200',
  RESTRICTED: 'bg-orange-100 text-orange-700 border-orange-200',
  CONFIDENTIAL: 'bg-red-100 text-red-700 border-red-200',
};

interface Props {
  doc: Document;
  onClick: (doc: Document) => void;
  isAdmin: boolean;
  onDelete: (id: string) => void;
}

export function GridCard({ doc, onClick, isAdmin, onDelete }: Props) {
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
