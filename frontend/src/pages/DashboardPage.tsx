import { format } from 'date-fns';
import {
  Activity,
  ArrowRight,
  BookOpen,
  FileEdit,
  GitBranch,
  MessageSquare,
  Server,
  UploadCloud,
  Users,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '../components/Layout/AppLayout';
import { StatCard } from '../components/UI/StatCard';
import { useAuth } from '../hooks/useAuth';
import apiClient from '../services/api';
import type { AuditEntry, HealthInfo } from '../types';
import { actionBadgeClass } from '../utils/auditActions';

export function DashboardPage() {
  const { currentUser, hasAnyRole } = useAuth();
  const navigate = useNavigate();
  const isAdmin = hasAnyRole(['SUPER_ADMIN', 'BOARD_ADMIN']);
  const isSuperAdmin = hasAnyRole(['SUPER_ADMIN']);

  const { data: documents = [] } = useQuery({
    queryKey: ['documents'],
    queryFn: () => apiClient.get('/documents').then((r) => r.data as unknown[]),
  });

  const { data: conversations = [] } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => apiClient.get('/ai/conversations').then((r) => r.data as unknown[]),
  });

  const { data: myDrafts = [] } = useQuery({
    queryKey: ['workflow', 'documents', { state: 'DRAFT' }],
    queryFn: () =>
      apiClient.get('/workflow/documents', { params: { state: 'DRAFT' } }).then((r) => r.data as unknown[]),
  });

  const { data: pendingReview = [] } = useQuery({
    queryKey: ['workflow', 'documents', { state: 'REVIEW' }],
    queryFn: () =>
      apiClient.get('/workflow/documents', { params: { state: 'REVIEW' } }).then((r) => r.data as unknown[]),
    enabled: isAdmin,
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => apiClient.get('/auth/users').then((r) => r.data as unknown[]),
    enabled: isAdmin,
  });

  const { data: health } = useQuery<HealthInfo>({
    queryKey: ['health'],
    queryFn: () => apiClient.get('/health').then((r) => r.data as HealthInfo),
    refetchInterval: 60_000,
  });

  const { data: auditEntries = [] } = useQuery<AuditEntry[]>({
    queryKey: ['audit', 'recent'],
    queryFn: () => apiClient.get('/audit/logs', { params: { limit: 10 } }).then((r) => r.data as AuditEntry[]),
    enabled: isAdmin, // /audit/logs is SUPER_ADMIN/BOARD_ADMIN only — don't even ask for standard users
  });

  const indexedCount = (documents as Array<{ is_indexed?: boolean }>).filter((d) => d.is_indexed).length;

  const quickActions = [
    {
      label: 'Upload Document',
      description: 'Add new files to the repository',
      icon: <UploadCloud size={20} className="text-[#1a56db]" />,
      to: '/repository',
    },
    {
      label: 'New AI Chat',
      description: 'Ask questions about your documents',
      icon: <MessageSquare size={20} className="text-green-600" />,
      to: '/chat',
    },
    {
      label: 'Generate Document',
      description: 'Create proposals, MOUs, agreements',
      icon: <FileEdit size={20} className="text-purple-600" />,
      to: '/generate',
    },
    ...(isAdmin && pendingReview.length > 0
      ? [{
          label: `Review Documents (${pendingReview.length})`,
          description: 'Documents awaiting approval',
          icon: <GitBranch size={20} className="text-amber-600" />,
          to: '/workflow',
        }]
      : []),
  ];

  return (
    <AppLayout title="Dashboard">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Greeting */}
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Welcome back, {currentUser?.full_name?.split(' ')[0]}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Here's an overview of your QCI AI Knowledge Hub activity.
          </p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <StatCard
            label="Documents Indexed"
            value={indexedCount}
            icon={<BookOpen size={22} className="text-[#1a56db]" />}
            iconBg="bg-blue-50"
            onClick={() => navigate('/repository')}
          />
          <StatCard
            label="My Conversations"
            value={conversations.length}
            icon={<MessageSquare size={22} className="text-green-600" />}
            iconBg="bg-green-50"
            onClick={() => navigate('/chat')}
          />
          <StatCard
            label="My Drafts"
            value={myDrafts.length}
            icon={<FileEdit size={22} className="text-purple-600" />}
            iconBg="bg-purple-50"
            onClick={() => navigate('/workflow')}
          />
          {isAdmin && (
            <StatCard
              label="Pending Reviews"
              value={pendingReview.length}
              icon={<GitBranch size={22} className="text-amber-600" />}
              iconBg="bg-amber-50"
              onClick={() => navigate('/workflow')}
            />
          )}
          {isAdmin && (
            <StatCard
              label="Total Users"
              value={allUsers.length}
              icon={<Users size={22} className="text-teal-600" />}
              iconBg="bg-teal-50"
              onClick={() => navigate('/admin')}
            />
          )}
          {isSuperAdmin && (
            <StatCard
              label="Total Documents"
              value={documents.length}
              icon={<BookOpen size={22} className="text-red-600" />}
              iconBg="bg-red-50"
            />
          )}
        </div>

        {/* Two column layout */}
        <div className={`grid grid-cols-1 gap-6 ${isAdmin ? 'lg:grid-cols-5' : ''}`}>
          {/* Recent Activity — admin only; standard users have no audit-log access */}
          {isAdmin && (
            <div className="lg:col-span-3">
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
                  <Activity size={16} className="text-slate-500" />
                  <h3 className="font-semibold text-slate-900 text-sm">Recent Activity</h3>
                </div>
                <div className="divide-y divide-slate-50">
                  {auditEntries.length === 0 && (
                    <div className="px-5 py-10 text-center text-sm text-slate-400">
                      No recent activity.
                    </div>
                  )}
                  {auditEntries.map((entry) => (
                    <div key={entry.id} className="px-5 py-3 flex items-start gap-3 hover:bg-slate-50 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-slate-700 truncate">{entry.user_email}</span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${actionBadgeClass(entry.action)}`}>
                            {entry.action}
                          </span>
                          {entry.resource_type && (
                            <span className="text-xs text-slate-400">{entry.resource_type}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-slate-400 flex-shrink-0 pt-0.5 font-mono">
                        {format(new Date(entry.timestamp), 'MMM d, yyyy, h:mm:ss a')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className={isAdmin ? 'lg:col-span-2' : ''}>
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200">
                <h3 className="font-semibold text-slate-900 text-sm">Quick Actions</h3>
              </div>
              <div className="p-3 space-y-2">
                {quickActions.map((action) => (
                  <button
                    key={action.to}
                    onClick={() => navigate(action.to)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all text-left group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 group-hover:bg-white transition-colors">
                      {action.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-800">{action.label}</div>
                      <div className="text-xs text-slate-500">{action.description}</div>
                    </div>
                    <ArrowRight size={14} className="text-slate-300 group-hover:text-slate-500 transition-colors flex-shrink-0" />
                  </button>
                ))}
              </div>
            </div>

            {/* Platform Status */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden mt-4">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
                <Server size={16} className="text-slate-500" />
                <h3 className="font-semibold text-slate-900 text-sm">Platform Status</h3>
                {health && (
                  <span
                    className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${
                      health.status === 'ok' || health.status === 'healthy'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {health.status ?? 'checking…'}
                  </span>
                )}
              </div>
              <div className="p-4 grid grid-cols-2 gap-2 text-xs">
                {[
                  { label: 'AI Model', value: health?.model },
                  { label: 'API Version', value: health?.api_version },
                  { label: 'Pinecone Index', value: health?.pinecone_index },
                  {
                    label: 'Vector DB',
                    value: health?.vector_db_status
                      ? health.vector_db_status === 'connected'
                        ? `Connected · ${health.vector_count ?? 0} vectors`
                        : health.vector_db_status
                      : undefined,
                    ok: health?.vector_db_status === 'connected',
                  },
                ].map(({ label, value, ok }) => (
                  <div key={label} className="bg-slate-50 rounded-lg p-3">
                    <div className="text-slate-400 mb-0.5">{label}</div>
                    <div
                      className={`font-medium truncate ${
                        ok === false ? 'text-red-600' : ok === true ? 'text-green-700' : 'text-slate-700'
                      }`}
                    >
                      {value ?? '—'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
