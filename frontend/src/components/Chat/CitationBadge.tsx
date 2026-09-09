import { ExternalLink, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Citation } from '../../types';

interface CitationBadgeProps {
  citation: Citation;
  index: number;
}

export function CitationBadge({ citation, index }: CitationBadgeProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const label = `${citation.document_title.slice(0, 25)}${
    citation.document_title.length > 25 ? '…' : ''
  }${citation.page_number ? `, p.${citation.page_number}` : ''}`;

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5 hover:bg-blue-100 transition-colors font-medium"
        title="View citation"
      >
        <span className="font-bold text-blue-800">[{index + 1}]</span>
        <span>{label}</span>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-80 bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-4">
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="font-semibold text-sm text-gray-800">{citation.document_title}</div>
              {citation.page_number && (
                <div className="text-xs text-gray-400 mt-0.5">Page {citation.page_number}</div>
              )}
              {citation.section_title && (
                <div className="text-xs text-gray-500 italic mt-0.5">{citation.section_title}</div>
              )}
            </div>
            <button
              onClick={() => setOpen(false)}
              className="ml-2 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          </div>

          <p className="text-sm text-gray-600 leading-relaxed border-l-2 border-blue-300 pl-3 bg-blue-50 rounded-r py-2">
            {citation.passage}
          </p>

          <a
            href={`/repository?doc=${citation.document_id}`}
            className="mt-3 inline-flex items-center gap-1 text-xs text-blue-700 hover:underline"
          >
            <ExternalLink size={12} />
            Open document
          </a>
        </div>
      )}
    </div>
  );
}
