import { CheckCircle2, Loader2, Plus, Server, Shield, Trash2, Users, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../components/Layout/AppLayout';
import { Badge } from '../components/UI/Badge';
import { ConfirmModal } from '../components/UI/ConfirmModal';
import { PageHeader } from '../components/UI/PageHeader';
import { useAuth } from '../hooks/useAuth';
import apiClient from '../services/api';
import * as authService from '../services/auth';
import type { CreateUserRequest, HealthInfo, Role, User } from '../types';

const ROLES: { value: Role; label: string }[] = [
  { value: 'STANDARD_USER', label: 'Standard User' },
  { value: 'TENDER_AUTHOR', label: 'Tender Author' },
  { value: 'BOARD_ADMIN', label: 'Board Admin' },
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
];

function roleLabel(role: Role): string {
  return ROLES.find((r) => r.value === role)?.label ?? role;
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState<CreateUserRequest>({
    email: '',
    password: '',
    full_name: '',
    role: 'STANDARD_USER',
    division: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await authService.createUser({ ...form, division: form.division || undefined });
      onCreated();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create user';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-200">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Plus size={18} className="text-[#1a56db]" /> Create New User
          </h3>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Full Name *</label>
            <input
              type="text"
              required
              value={form.full_name}
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              placeholder="e.g. Priya Sharma"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#1a56db] text-slate-800"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Email Address *</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="user@qci.org.in"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#1a56db] text-slate-800"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Password *</label>
            <input
              type="password"
              required
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="Min 8 characters"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#1a56db] text-slate-800"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Role *</label>
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#1a56db] bg-white text-slate-800"
              >
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Division</label>
              <input
                type="text"
                value={form.division}
                onChange={(e) => setForm((f) => ({ ...f, division: e.target.value }))}
                placeholder="Optional"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#1a56db] text-slate-800"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium bg-[#1a56db] text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Create User
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UserRow({
  user,
  isSuperAdmin,
  onRefresh,
}: {
  user: User;
  isSuperAdmin: boolean;
  onRefresh: () => void;
}) {
  const [updatingRole, setUpdatingRole] = useState(false);
  const [updatingActive, setUpdatingActive] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role>(user.role);
  const [showRoleConfirm, setShowRoleConfirm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const initials = user.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  const handleRoleChange = (newRole: Role) => {
    setSelectedRole(newRole);
    if (newRole !== user.role) setShowRoleConfirm(true);
    else setShowRoleConfirm(false);
  };

  const confirmRoleChange = async () => {
    setUpdatingRole(true);
    setShowRoleConfirm(false);
    try {
      await authService.updateRole(user.id, selectedRole);
      onRefresh();
    } finally {
      setUpdatingRole(false);
    }
  };

  const handleToggleActive = async () => {
    setUpdatingActive(true);
    try {
      await authService.toggleActive(user.id, !user.is_active);
      onRefresh();
    } finally {
      setUpdatingActive(false);
    }
  };

  const handleDelete = async () => {
    await authService.deleteUser(user.id);
    onRefresh();
  };

  return (
    <>
      <tr className="hover:bg-slate-50 transition-colors">
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#1a56db]/10 text-[#1a56db] font-bold text-xs flex items-center justify-center flex-shrink-0">
              {initials}
            </div>
            <span className="font-medium text-slate-800 text-sm">{user.full_name}</span>
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-slate-500">{user.email}</td>
        <td className="px-4 py-3">
          {isSuperAdmin ? (
            <div className="flex items-center gap-2">
              <select
                value={selectedRole}
                onChange={(e) => handleRoleChange(e.target.value as Role)}
                disabled={updatingRole}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-[#1a56db] bg-white text-slate-700 disabled:opacity-50"
              >
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              {showRoleConfirm && (
                <button
                  onClick={() => void confirmRoleChange()}
                  disabled={updatingRole}
                  className="text-xs px-2 py-1.5 bg-[#1a56db] text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-1"
                >
                  {updatingRole ? <Loader2 size={11} className="animate-spin" /> : 'Save'}
                </button>
              )}
            </div>
          ) : (
            <Badge label={roleLabel(user.role)} variant="role" value={user.role} />
          )}
        </td>
        <td className="px-4 py-3 text-sm text-slate-500">{user.division ?? '—'}</td>
        <td className="px-4 py-3">
          {user.is_active ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
              <CheckCircle2 size={10} /> Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-medium bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
              <XCircle size={10} /> Inactive
            </span>
          )}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => void handleToggleActive()}
              disabled={updatingActive}
              className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-colors disabled:opacity-50 ${
                user.is_active
                  ? 'border-red-200 text-red-600 hover:bg-red-50'
                  : 'border-green-200 text-green-600 hover:bg-green-50'
              }`}
            >
              {updatingActive ? '…' : user.is_active ? 'Deactivate' : 'Activate'}
            </button>
            {isSuperAdmin && (
              <button
                onClick={() => setConfirmDelete(true)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                title="Delete user"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </td>
      </tr>

      {confirmDelete && (
        <tr>
          <td colSpan={6}>
            <ConfirmModal
              title="Delete User"
              message={`Are you sure you want to permanently delete "${user.full_name}" (${user.email})? This cannot be undone.`}
              confirmLabel="Delete User"
              danger
              onConfirm={() => void handleDelete()}
              onCancel={() => setConfirmDelete(false)}
            />
          </td>
        </tr>
      )}
    </>
  );
}

export function AdminPage() {
  const { hasAnyRole } = useAuth();
  const isSuperAdmin = hasAnyRole(['SUPER_ADMIN']);
  const [activeTab, setActiveTab] = useState<'users' | 'system'>('users');
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  const {
    data: users = [],
    isLoading: usersLoading,
    refetch: refetchUsers,
  } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: authService.listUsers,
  });

  const { data: health, isLoading: healthLoading } = useQuery<HealthInfo>({
    queryKey: ['health'],
    queryFn: () => apiClient.get('/health').then((r) => r.data as HealthInfo),
    enabled: isSuperAdmin && activeTab === 'system',
  });

  const filteredUsers = users.filter(
    (u) =>
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.division ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  const tabs = [
    { id: 'users' as const, label: 'Users', icon: <Users size={15} /> },
    ...(isSuperAdmin
      ? [{ id: 'system' as const, label: 'System', icon: <Server size={15} /> }]
      : []),
  ];

  return (
    <AppLayout title="Administration">
      <div className="max-w-6xl mx-auto">
        <PageHeader
          title="Administration"
          subtitle="Manage users, roles, and system configuration"
          actions={
            activeTab === 'users' ? (
              <button
                onClick={() => setShowCreateUser(true)}
                className="flex items-center gap-2 px-4 py-2 bg-[#1a56db] text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus size={15} /> Create User
              </button>
            ) : undefined
          }
        />

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-6 border-b border-slate-200">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab.id
                  ? 'border-[#1a56db] text-[#1a56db]'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.id === 'users' && (
                <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full ml-1">
                  {users.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'users' && (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            {/* Search row */}
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center gap-3">
              <Shield size={16} className="text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search users by name, email, division…"
                className="text-sm outline-none flex-1 bg-transparent text-slate-700 placeholder-slate-400"
              />
              <span className="text-xs text-slate-400">{filteredUsers.length} users</span>
            </div>

            {usersLoading ? (
              <div className="flex justify-center py-20">
                <Loader2 size={28} className="animate-spin text-[#1a56db]" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      {['Name', 'Email', 'Role', 'Division', 'Status', 'Actions'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredUsers.map((user) => (
                      <UserRow
                        key={user.id}
                        user={user}
                        isSuperAdmin={isSuperAdmin}
                        onRefresh={() => {
                          void refetchUsers();
                          void queryClient.invalidateQueries({ queryKey: ['users'] });
                        }}
                      />
                    ))}
                    {filteredUsers.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-400">
                          No users found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'system' && isSuperAdmin && (
          <div className="space-y-4">
            {healthLoading ? (
              <div className="flex justify-center py-20">
                <Loader2 size={28} className="animate-spin text-[#1a56db]" />
              </div>
            ) : health ? (
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-3">
                  <Server size={18} className="text-slate-500" />
                  <h3 className="font-semibold text-slate-900">Platform Health</h3>
                  <span
                    className={`ml-auto text-sm font-medium px-3 py-1 rounded-full ${
                      health.status === 'ok' || health.status === 'healthy'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {health.status}
                  </span>
                </div>

                <div className="p-6 grid grid-cols-2 gap-4 text-sm">
                  {[
                    { label: 'AI Model', value: health.model ?? '—' },
                    { label: 'API Version', value: health.version ?? '—' },
                    { label: 'Pinecone Index', value: health.pinecone_index ?? '—' },
                    { label: 'Vector DB Status', value: health.pinecone_stats ? 'Connected' : '—' },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-slate-50 rounded-xl p-4">
                      <div className="text-xs text-slate-400 mb-1 uppercase tracking-wide">{label}</div>
                      <div className="font-semibold text-slate-800 truncate">{value}</div>
                    </div>
                  ))}
                </div>

                {health.pinecone_stats && (
                  <div className="px-6 pb-6">
                    <div className="bg-slate-50 rounded-xl p-4">
                      <div className="text-xs text-slate-400 mb-2 uppercase tracking-wide">Index Stats</div>
                      <pre className="text-xs text-slate-700 overflow-auto">
                        {JSON.stringify(health.pinecone_stats, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-20 text-slate-400 text-sm">
                Unable to fetch system information.
              </div>
            )}
          </div>
        )}
      </div>

      {showCreateUser && (
        <CreateUserModal
          onClose={() => setShowCreateUser(false)}
          onCreated={() => void refetchUsers()}
        />
      )}
    </AppLayout>
  );
}
