interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  iconBg?: string;
  trend?: { value: string; up: boolean } | null;
  onClick?: () => void;
}

export function StatCard({ label, value, icon, iconBg = 'bg-blue-50', trend, onClick }: StatCardProps) {
  return (
    <div
      className={`bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center gap-4 ${onClick ? 'cursor-pointer hover:shadow-md hover:border-slate-300 transition-all' : ''}`}
      onClick={onClick}
    >
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold text-slate-900">{value}</div>
        <div className="text-sm text-slate-500 mt-0.5">{label}</div>
        {trend && (
          <div className={`text-xs mt-1 font-medium ${trend.up ? 'text-green-600' : 'text-red-600'}`}>
            {trend.up ? '↑' : '↓'} {trend.value}
          </div>
        )}
      </div>
    </div>
  );
}
