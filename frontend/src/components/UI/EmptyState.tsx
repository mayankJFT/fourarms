interface EmptyStateProps {
  icon: React.ReactNode;
  heading: string;
  body?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon, heading, body, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4 text-slate-400">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-slate-700 mb-2">{heading}</h3>
      {body && <p className="text-sm text-slate-500 max-w-sm mb-4">{body}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 bg-[#1a56db] text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
