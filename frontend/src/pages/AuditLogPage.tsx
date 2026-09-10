import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, ClipboardList, Download, Loader2, Search } from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AppLayout } from '../components/Layout/AppLayout';
import { EmptyState } from '../components/UI/EmptyState';
import { PageHeader } from '../components/UI/PageHeader';
import apiClient from '../services/api';
import type { AuditEntry } from '../types';
import { actionBadgeClass, AUDIT_ACTION_TYPES } from '../utils/auditActions';

const ACTION_TYPES = AUDIT_ACTION_TYPES;
const PAGE_SIZE = 20;
const actionBadge = actionBadgeClass;

export function AuditLogPage() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [page, setPage] = useState(0);

  const params: Record<string, string | number> = {
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  };
  if (startDate) params.start_date = startDate;
  if (endDate) params.end_date = endDate;
  if (actionFilter) params.action = actionFilter;
  if (userSearch) params.user_email = userSearch;

  const { data: entries = [], isLoading } = useQuery<AuditEntry[]>({
    queryKey: ['audit', params],
    queryFn: () => apiClient.get('/audit/logs', { params }).then((r) => r.data as AuditEntry[]),
  });

  const handleExportCSV = () => {
    const headers = ['ID', 'Timestamp', 'User', 'Action', 'Resource Type', 'Resource ID', 'Detail'];
    const rows = entries.map((e) => [
      e.id,
      e.timestamp,
      e.user_email,
      e.action,
      e.resource_type ?? '',
      e.resource_id ?? '',
      e.detail ? JSON.stringify(e.detail) : '',
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout title="Audit Log">
      <div className="max-w-6xl mx-auto">
        <PageHeader
          title="Audit Log"
          subtitle="Track all system actions and user activity"
          actions={
            <button
              onClick={handleExportCSV}
              disabled={entries.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-[#1a56db] text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              <Download size={15} /> Export CSV
            </button>
          }
        />

        {/* Filters */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm mb-5">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">From date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setPage(0); }}
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#1a56db] text-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">To date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setPage(0); }}
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#1a56db] text-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Action type</label>
              <select
                value={actionFilter}
                onChange={(e) => { setActionFilter(e.target.value); setPage(0); }}
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#1a56db] bg-white text-slate-800"
              >
                <option value="">All actions</option>
                {ACTION_TYPES.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>

            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs font-medium text-slate-500 mb-1.5">User email</label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => { setUserSearch(e.target.value); setPage(0); }}
                  placeholder="Search by email…"
                  className="w-full text-sm border border-slate-200 rounded-lg pl-8 pr-3 py-2 outline-none focus:ring-2 focus:ring-[#1a56db] text-slate-800"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 size={28} className="animate-spin text-[#1a56db]" />
            </div>
          ) : entries.length === 0 ? (
            <EmptyState
              icon={<ClipboardList size={28} />}
              heading="No audit entries found"
              body="Try adjusting your filters or date range."
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      {['Timestamp', 'User', 'Action', 'Resource', 'Details'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {entries.map((entry) => (
                      <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs font-mono">
                          {format(new Date(entry.timestamp), 'yyyy-MM-dd HH:mm:ss')}
                        </td>
                        <td className="px-4 py-3 text-slate-700 truncate max-w-[160px] text-sm">
                          {entry.user_email}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block font-mono text-xs px-2 py-0.5 rounded-full font-medium ${actionBadge(entry.action)}`}>
                            {entry.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs">
                          {entry.resource_type && (
                            <span>
                              <span className="font-medium">{entry.resource_type}</span>
                              {entry.resource_id && (
                                <span className="ml-1 text-slate-400 font-mono">
                                  #{entry.resource_id.slice(0, 8)}
                                </span>
                              )}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400 max-w-[200px] truncate">
                          {entry.detail ? JSON.stringify(entry.detail) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between">
                <div className="text-xs text-slate-400">
                  Showing {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + entries.length} results
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-sm text-slate-600 px-2">Page {page + 1}</span>
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={entries.length < PAGE_SIZE}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
