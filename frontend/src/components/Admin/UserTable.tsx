import { Search } from 'lucide-react';
import { useState } from 'react';
import * as authService from '../../services/auth';
import type { User } from '../../types';
import { RoleEditor } from './RoleEditor';

interface UserTableProps {
  users: User[];
  onRefresh: () => void;
}

export function UserTable({ users, onRefresh }: UserTableProps) {
  const [search, setSearch] = useState('');
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const filtered = users.filter(
    (u) =>
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.division ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  const handleToggleActive = async (user: User) => {
    setUpdatingId(user.id);
    try {
      await authService.toggleActive(user.id, !user.is_active);
      onRefresh();
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Search row */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
        <Search size={16} className="text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search users…"
          className="text-sm outline-none flex-1 bg-transparent text-gray-700 placeholder-gray-400"
        />
        <span className="text-xs text-gray-400">{filtered.length} users</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Email
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Role
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Division
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center flex-shrink-0">
                      {user.full_name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .toUpperCase()
                        .slice(0, 2)}
                    </div>
                    <span className="font-medium text-gray-800">{user.full_name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-500">{user.email}</td>
                <td className="px-4 py-3">
                  <RoleEditor
                    user={user}
                    onUpdated={() => onRefresh()}
                  />
                </td>
                <td className="px-4 py-3 text-gray-500">{user.division ?? '—'}</td>
                <td className="px-4 py-3">
                  {user.is_active ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                      Inactive
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => void handleToggleActive(user)}
                    disabled={updatingId === user.id}
                    className={`text-xs px-2 py-1 rounded-lg border font-medium transition-colors disabled:opacity-50 ${
                      user.is_active
                        ? 'border-red-200 text-red-600 hover:bg-red-50'
                        : 'border-green-200 text-green-600 hover:bg-green-50'
                    }`}
                  >
                    {updatingId === user.id ? '…' : user.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
