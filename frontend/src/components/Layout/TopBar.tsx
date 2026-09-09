import { Bell } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

interface TopBarProps {
  title: string;
}

export function TopBar({ title }: TopBarProps) {
  const { currentUser } = useAuth();

  const initials = currentUser?.full_name
    ? currentUser.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?';

  return (
    <header className="fixed top-0 left-60 right-0 h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 z-10">
      <h1 className="text-base font-bold text-slate-900">{title}</h1>

      <div className="flex items-center gap-3">
        <button className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors relative">
          <Bell size={18} />
        </button>

        <div className="w-px h-6 bg-slate-200" />

        {currentUser && (
          <div className="flex items-center gap-2.5">
            <span className="text-sm text-slate-600 hidden sm:block">{currentUser.full_name}</span>
            <div className="w-8 h-8 rounded-full bg-[#1a56db] text-white font-bold text-xs flex items-center justify-center flex-shrink-0">
              {initials}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
