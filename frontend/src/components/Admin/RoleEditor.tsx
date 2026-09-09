import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import * as authService from '../../services/auth';
import type { Role, User } from '../../types';

interface RoleEditorProps {
  user: User;
  onUpdated: (user: User) => void;
}

const ROLES: { value: Role; label: string }[] = [
  { value: 'STANDARD_USER', label: 'Standard User' },
  { value: 'TENDER_AUTHOR', label: 'Tender Author' },
  { value: 'BOARD_ADMIN', label: 'Board Admin' },
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
];

export function RoleEditor({ user, onUpdated }: RoleEditorProps) {
  const { isRole } = useAuth();
  const isSuperAdmin = isRole('SUPER_ADMIN');
  const [selected, setSelected] = useState<Role>(user.role);
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  if (!isSuperAdmin) {
    return (
      <span className="text-sm text-gray-600">{ROLES.find((r) => r.value === user.role)?.label}</span>
    );
  }

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelected(e.target.value as Role);
    if (e.target.value !== user.role) setShowConfirm(true);
    else setShowConfirm(false);
  };

  const handleConfirm = async () => {
    setSaving(true);
    try {
      const updated = await authService.updateRole(user.id, selected);
      onUpdated(updated);
      setShowConfirm(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <select
        value={selected}
        onChange={handleChange}
        className="text-sm border border-gray-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
      >
        {ROLES.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>

      {showConfirm && (
        <button
          onClick={() => void handleConfirm()}
          disabled={saving}
          className="text-xs px-2 py-1 bg-blue-800 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? '…' : 'Confirm'}
        </button>
      )}
    </div>
  );
}
