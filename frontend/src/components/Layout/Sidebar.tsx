import {
  ClipboardList,
  FileEdit,
  FolderOpen,
  GitBranch,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  ShieldCheck,
  Users2,
} from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import type { Role } from '../../types';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  roles?: Role[];
}

const navItems: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { to: '/repository', label: 'Repository', icon: <FolderOpen size={18} /> },
  { to: '/chat', label: 'AI Chat', icon: <MessageSquare size={18} /> },
  { to: '/generate', label: 'Generate Docs', icon: <FileEdit size={18} /> },
  { to: '/workflow', label: 'Workflow', icon: <GitBranch size={18} /> },
  {
    to: '/hr',
    label: 'HR Records',
    icon: <Users2 size={18} />,
    roles: ['SUPER_ADMIN', 'BOARD_ADMIN', 'TENDER_AUTHOR'],
  },
  {
    to: '/admin',
    label: 'Admin',
    icon: <ShieldCheck size={18} />,
    roles: ['SUPER_ADMIN', 'BOARD_ADMIN'],
  },
  {
    to: '/audit',
    label: 'Audit Log',
    icon: <ClipboardList size={18} />,
    roles: ['SUPER_ADMIN', 'BOARD_ADMIN'],
  },
];

function roleLabel(role: Role): string {
  switch (role) {
    case 'SUPER_ADMIN': return 'Super Admin';
    case 'BOARD_ADMIN': return 'Board Admin';
    case 'TENDER_AUTHOR': return 'Tender Author';
    default: return 'Standard User';
  }
}

function roleBadgeClass(role: Role): string {
  switch (role) {
    case 'SUPER_ADMIN': return 'bg-red-100 text-red-700';
    case 'BOARD_ADMIN': return 'bg-purple-100 text-purple-700';
    case 'TENDER_AUTHOR': return 'bg-amber-100 text-amber-700';
    default: return 'bg-slate-100 text-slate-600';
  }
}

export function Sidebar() {
  const { currentUser, hasAnyRole, logout } = useAuth();
  const navigate = useNavigate();

  const visibleItems = navItems.filter(
    (item) => !item.roles || hasAnyRole(item.roles),
  );

  const initials = currentUser?.full_name
    ? currentUser.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside
      className="fixed left-0 top-0 h-screen w-60 flex flex-col z-20 shadow-xl"
      style={{ backgroundColor: '#0f2d5e' }}
    >
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-400/20 flex items-center justify-center flex-shrink-0">
            <ShieldCheck size={20} className="text-amber-400" />
          </div>
          <div>
            <div className="text-white font-bold text-sm leading-tight tracking-wide">QCI Hub</div>
            <div className="text-slate-300 text-xs">AI Knowledge Platform</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-[#1a56db] text-white shadow-sm'
                  : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`
            }
          >
            {item.icon}
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* User footer */}
      {currentUser && (
        <div className="px-3 py-4 border-t border-white/10 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#1a56db] text-white font-bold text-xs flex items-center justify-center flex-shrink-0">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-white text-sm font-medium truncate">
                {currentUser.full_name}
              </div>
              <span className={`inline-block text-xs px-1.5 py-0.5 rounded font-medium mt-0.5 ${roleBadgeClass(currentUser.role)}`}>
                {roleLabel(currentUser.role)}
              </span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <LogOut size={15} />
            <span>Sign Out</span>
          </button>
        </div>
      )}
    </aside>
  );
}
