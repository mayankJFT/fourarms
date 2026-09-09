import { AlertCircle, CheckCircle, Info, X, AlertTriangle } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import type { ToastType } from '../../stores/uiStore';

const STYLES: Record<ToastType, { bg: string; border: string; text: string; icon: React.ReactNode }> = {
  success: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-800',
    icon: <CheckCircle size={16} className="text-green-600 flex-shrink-0" />,
  },
  error: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-800',
    icon: <AlertCircle size={16} className="text-red-600 flex-shrink-0" />,
  },
  warning: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-800',
    icon: <AlertTriangle size={16} className="text-amber-600 flex-shrink-0" />,
  },
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-800',
    icon: <Info size={16} className="text-blue-600 flex-shrink-0" />,
  },
};

export function ToastContainer() {
  const { toasts, removeToast } = useUIStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => {
        const s = STYLES[toast.type];
        return (
          <div
            key={toast.id}
            className={`flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg pointer-events-auto
              ${s.bg} ${s.border} animate-in slide-in-from-right-4 duration-200`}
          >
            {s.icon}
            <p className={`text-sm font-medium flex-1 ${s.text}`}>{toast.message}</p>
            <button
              onClick={() => removeToast(toast.id)}
              className={`${s.text} opacity-60 hover:opacity-100 flex-shrink-0`}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
