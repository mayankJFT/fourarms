import {
  Loader2,
  MapPin,
  Search,
  Upload,
  UserCheck,
  Users2,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AppLayout } from '../components/Layout/AppLayout';
import { EmptyState } from '../components/UI/EmptyState';
import { PageHeader } from '../components/UI/PageHeader';
import * as documentsService from '../services/documents';
import type { HRRecord } from '../types';

function BandwidthBar({ value }: { value: number }) {
  const color =
    value >= 75 ? 'bg-green-500' : value >= 40 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
        <div
          className={`h-2 rounded-full transition-all ${color}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      <span className="text-xs font-medium text-slate-600 w-8 text-right">{value}%</span>
    </div>
  );
}

export function HRRecordsPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [location, setLocation] = useState('');
  const [minBandwidth, setMinBandwidth] = useState<number | ''>('');
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  const filters: documentsService.HRFilters = {};
  if (location) filters.location = location;
  if (minBandwidth !== '') filters.min_bandwidth = Number(minBandwidth);
  if (debouncedSearch) filters.skills = debouncedSearch;

  const { data: records = [], isLoading, refetch } = useQuery<HRRecord[]>({
    queryKey: ['hr', 'records', filters],
    queryFn: () => documentsService.listHR(filters),
  });

  const handleUploadCSV = async (file: File) => {
    setUploading(true);
    setUploadMsg(null);
    try {
      const result = await documentsService.uploadHR(file);
      setUploadMsg({ text: `Successfully imported ${result.imported} records.`, type: 'success' });
      void refetch();
    } catch {
      setUploadMsg({ text: 'Upload failed. Please check your CSV format.', type: 'error' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <AppLayout title="HR Records">
      <div className="max-w-6xl mx-auto">
        <PageHeader
          title="HR Records"
          subtitle="Search and manage human resource capacity and availability"
          actions={
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleUploadCSV(file);
                  e.target.value = '';
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 px-4 py-2 bg-[#1a56db] text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                Upload CSV
              </button>
            </>
          }
        />

        {/* Upload feedback */}
        {uploadMsg && (
          <div
            className={`mb-4 flex items-center gap-3 px-4 py-3 rounded-xl border text-sm ${
              uploadMsg.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            {uploadMsg.type === 'success' ? <UserCheck size={16} /> : <X size={16} />}
            {uploadMsg.text}
            <button
              onClick={() => setUploadMsg(null)}
              className="ml-auto opacity-60 hover:opacity-100"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Search + Filters */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm mb-5">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[220px]">
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Search by Skills</label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="e.g. ISO 9001, auditing, quality…"
                  className="w-full pl-8 pr-4 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#1a56db] text-slate-800"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Location</label>
              <div className="relative">
                <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Delhi, Mumbai"
                  className="pl-8 pr-4 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#1a56db] text-slate-800"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                Min Bandwidth %
              </label>
              <input
                type="number"
                min={0}
                max={100}
                value={minBandwidth}
                onChange={(e) => setMinBandwidth(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="0–100"
                className="w-24 px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#1a56db] text-slate-800"
              />
            </div>

            {(location || minBandwidth !== '' || search) && (
              <button
                onClick={() => {
                  setSearch('');
                  setLocation('');
                  setMinBandwidth('');
                }}
                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 px-3 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <X size={14} /> Clear Filters
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 size={28} className="animate-spin text-[#1a56db]" />
          </div>
        ) : records.length === 0 ? (
          <EmptyState
            icon={<Users2 size={28} />}
            heading="No HR records found"
            body="Upload a CSV file to import HR records, or adjust your search filters."
            action={{ label: 'Upload CSV', onClick: () => fileInputRef.current?.click() }}
          />
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    {['Employee ID', 'Name', 'Qualifications', 'Experience', 'Bandwidth', 'Location', 'Available From'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {records.map((rec) => (
                    <tr key={rec.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded">
                          {rec.employee_id}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">{rec.name}</td>
                      <td className="px-4 py-3 max-w-[200px]">
                        <p className="text-slate-600 text-xs truncate" title={rec.qualifications}>
                          {rec.qualifications}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-xs">
                        {rec.years_experience} yr{rec.years_experience !== 1 ? 's' : ''}
                      </td>
                      <td className="px-4 py-3 min-w-[120px]">
                        <BandwidthBar value={rec.current_bandwidth_pct} />
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        <div className="flex items-center gap-1">
                          <MapPin size={11} className="text-slate-400" />
                          {rec.location ?? '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {rec.availability_date
                          ? new Date(rec.availability_date).toLocaleDateString('en-IN', {
                              day: 'numeric', month: 'short', year: 'numeric',
                            })
                          : 'Immediate'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-slate-200 text-xs text-slate-400">
              {records.length} record{records.length !== 1 ? 's' : ''} found
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
