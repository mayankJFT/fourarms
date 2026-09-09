import { ChevronDown, ChevronUp, FileText, Loader2, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as documentsService from '../../services/documents';
import type { Chunk } from '../../types';

interface Section {
  title: string | null;
  page: number | null;
  chunks: Chunk[];
}

function groupBySections(chunks: Chunk[]): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;

  for (const chunk of chunks) {
    const key = chunk.section_title ?? null;
    if (!current || current.title !== key) {
      current = { title: key, page: chunk.page_number, chunks: [] };
      sections.push(current);
    }
    current.chunks.push(chunk);
  }
  return sections;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function HighlightedText({
  text,
  query,
  activeMatchIndex,
  matchOffset,
  onMatchRefs,
}: {
  text: string;
  query: string;
  activeMatchIndex: number;
  matchOffset: number;
  onMatchRefs: (refs: HTMLElement[]) => void;
}) {
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!containerRef.current || !query) return;
    const marks = Array.from(containerRef.current.querySelectorAll<HTMLElement>('mark'));
    onMatchRefs(marks);
  });

  if (!query.trim()) {
    return <span>{text}</span>;
  }

  const re = new RegExp(`(${escapeRegex(query)})`, 'gi');
  const parts = text.split(re);

  let localMatchIdx = matchOffset;
  return (
    <span ref={containerRef}>
      {parts.map((part, i) => {
        if (re.test(part)) {
          re.lastIndex = 0;
          const idx = localMatchIdx++;
          return (
            <mark
              key={i}
              data-match-index={idx}
              className={`rounded px-0.5 ${
                idx === activeMatchIndex
                  ? 'bg-amber-400 text-slate-900'
                  : 'bg-yellow-200 text-slate-800'
              }`}
            >
              {part}
            </mark>
          );
        }
        return part;
      })}
    </span>
  );
}

interface Props {
  docId: string;
  docTitle: string;
}

export function DocumentViewer({ docId, docTitle }: Props) {
  const [search, setSearch] = useState('');
  const [activeMatch, setActiveMatch] = useState(0);
  const matchRefs = useRef<HTMLElement[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: chunks = [], isLoading } = useQuery<Chunk[]>({
    queryKey: ['doc-content', docId],
    queryFn: () => documentsService.getDocContent(docId),
    staleTime: Infinity,
  });

  const sections = useMemo(() => groupBySections(chunks), [chunks]);

  const totalText = useMemo(() => chunks.map((c) => c.text).join(' '), [chunks]);

  const matchCount = useMemo(() => {
    if (!search.trim()) return 0;
    const re = new RegExp(escapeRegex(search), 'gi');
    return (totalText.match(re) ?? []).length;
  }, [search, totalText]);

  const chunkMatchCounts = useMemo(() => {
    if (!search.trim()) return chunks.map(() => 0);
    const re = new RegExp(escapeRegex(search), 'gi');
    return chunks.map((c) => (c.text.match(re) ?? []).length);
  }, [search, chunks]);

  const chunkMatchOffsets = useMemo(() => {
    const offsets: number[] = [];
    let running = 0;
    for (const count of chunkMatchCounts) {
      offsets.push(running);
      running += count;
    }
    return offsets;
  }, [chunkMatchCounts]);

  const scrollToMatch = useCallback((idx: number) => {
    const el = matchRefs.current.find(
      (m) => Number(m.dataset.matchIndex) === idx,
    );
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  useEffect(() => {
    setActiveMatch(0);
  }, [search]);

  useEffect(() => {
    if (matchCount > 0) scrollToMatch(activeMatch);
  }, [activeMatch, matchCount, scrollToMatch]);

  const collectRefs = useCallback((refs: HTMLElement[]) => {
    for (const r of refs) {
      const idx = Number(r.dataset.matchIndex);
      matchRefs.current[idx] = r;
    }
  }, []);

  const prev = () => setActiveMatch((m) => (m - 1 + matchCount) % matchCount);
  const next = () => setActiveMatch((m) => (m + 1) % matchCount);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') next();
    if (e.key === 'Escape') setSearch('');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 gap-2 text-slate-400">
        <Loader2 size={20} className="animate-spin" />
        <span className="text-sm">Loading document content…</span>
      </div>
    );
  }

  if (chunks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <FileText size={32} className="mb-3" />
        <p className="text-sm font-medium">No content available</p>
        <p className="text-xs mt-1">This document hasn't been indexed yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="px-1 py-2 border-b border-slate-100 flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Search in document…"
            className="w-full pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#1a56db]"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={12} />
            </button>
          )}
        </div>
        {search && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="text-xs text-slate-500 min-w-[60px] text-center">
              {matchCount === 0 ? 'No matches' : `${activeMatch + 1} / ${matchCount}`}
            </span>
            <button
              onClick={prev}
              disabled={matchCount === 0}
              className="p-1 rounded hover:bg-slate-100 disabled:opacity-40 text-slate-600"
            >
              <ChevronUp size={14} />
            </button>
            <button
              onClick={next}
              disabled={matchCount === 0}
              className="p-1 rounded hover:bg-slate-100 disabled:opacity-40 text-slate-600"
            >
              <ChevronDown size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Document body */}
      <div className="flex-1 overflow-y-auto px-1 py-3 space-y-4 text-sm leading-relaxed">
        {sections.map((section, si) => (
          <div key={si}>
            {section.title && (
              <div className="flex items-center gap-2 mb-2 sticky top-0 bg-white py-1 z-10">
                <span className="text-xs font-semibold text-[#0f2d5e] uppercase tracking-wide">
                  {section.title}
                </span>
                {section.page != null && (
                  <span className="text-xs text-slate-400">· p.{section.page}</span>
                )}
                <div className="flex-1 h-px bg-slate-100" />
              </div>
            )}
            <div className="space-y-2">
              {section.chunks.map((chunk) => (
                <p key={chunk.id} className="text-slate-700 text-xs leading-relaxed">
                  {chunk.page_number != null && !section.title && (
                    <span className="text-[10px] text-slate-400 mr-1 font-mono">[p.{chunk.page_number}]</span>
                  )}
                  <HighlightedText
                    text={chunk.text}
                    query={search}
                    activeMatchIndex={activeMatch}
                    matchOffset={chunkMatchOffsets[chunks.indexOf(chunk)]}
                    onMatchRefs={collectRefs}
                  />
                </p>
              ))}
            </div>
          </div>
        ))}

        <div className="pt-4 border-t border-slate-100 text-center text-xs text-slate-400">
          {chunks.length} chunks · {chunks.reduce((a, c) => a + c.token_count, 0).toLocaleString()} tokens
        </div>
      </div>
    </div>
  );
}
