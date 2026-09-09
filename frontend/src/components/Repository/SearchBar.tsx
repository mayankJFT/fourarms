import { ChevronDown, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Confidentiality, DocumentFilters } from '../../types';

interface SearchBarProps {
  onSearch: (query: string, filters: DocumentFilters) => void;
}

const DOC_TYPES = ['PROPOSAL', 'MOU', 'AGREEMENT', 'WORK_ORDER', 'POLICY', 'OTHER'];
const CONFIDENTIALITY_LEVELS: Confidentiality[] = [
  'PUBLIC',
  'INTERNAL',
  'RESTRICTED',
  'CONFIDENTIAL',
];

interface MultiSelectProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

function MultiSelect({ label, options, selected, onChange }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (opt: string) => {
    onChange(
      selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt],
    );
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors ${
          selected.length > 0
            ? 'border-blue-400 bg-blue-50 text-blue-700'
            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
        }`}
      >
        {label}
        {selected.length > 0 && (
          <span className="font-bold text-blue-700">({selected.length})</span>
        )}
        <ChevronDown size={14} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 min-w-[160px] py-1">
          {options.map((opt) => (
            <label
              key={opt}
              className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm"
            >
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => toggle(opt)}
                className="rounded accent-blue-700"
              />
              <span className="text-gray-700">{opt}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function SearchBar({ onSearch }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [docTypes, setDocTypes] = useState<string[]>([]);
  const [confidentiality, setConfidentiality] = useState<Confidentiality[]>([]);
  const [indexedOnly, setIndexedOnly] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onSearch(query, {
        doc_type: docTypes.length ? docTypes : undefined,
        confidentiality: confidentiality.length ? confidentiality : undefined,
        indexed_only: indexedOnly || undefined,
      });
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, docTypes, confidentiality, indexedOnly, onSearch]);

  const clearAll = () => {
    setQuery('');
    setDocTypes([]);
    setConfidentiality([]);
    setIndexedOnly(false);
  };

  const hasFilters = docTypes.length > 0 || confidentiality.length > 0 || indexedOnly || query;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2.5 shadow-sm focus-within:ring-2 focus-within:ring-blue-300 focus-within:border-blue-400 transition-all">
        <Search size={18} className="text-gray-400 flex-shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search documents…"
          className="flex-1 outline-none text-sm text-gray-800 placeholder-gray-400"
        />
        {query && (
          <button onClick={() => setQuery('')} className="text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        )}
      </div>

      <div className="flex items-center flex-wrap gap-2">
        <MultiSelect
          label="Doc Type"
          options={DOC_TYPES}
          selected={docTypes}
          onChange={setDocTypes}
        />
        <MultiSelect
          label="Confidentiality"
          options={CONFIDENTIALITY_LEVELS}
          selected={confidentiality}
          onChange={(v) => setConfidentiality(v as Confidentiality[])}
        />

        <label className="flex items-center gap-1.5 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={indexedOnly}
            onChange={(e) => setIndexedOnly(e.target.checked)}
            className="rounded accent-blue-700"
          />
          <span className="text-gray-600">Indexed only</span>
        </label>

        {hasFilters && (
          <button
            onClick={clearAll}
            className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 transition-colors"
          >
            <X size={12} /> Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
