import type { Confidentiality, Role } from '../../types';

interface BadgeProps {
  label: string;
  variant: 'role' | 'state' | 'confidentiality' | 'custom';
  value?: string;
  className?: string;
}

function getRoleClass(value: string): string {
  switch (value as Role) {
    case 'SUPER_ADMIN': return 'bg-red-100 text-red-700';
    case 'BOARD_ADMIN': return 'bg-purple-100 text-purple-700';
    case 'TENDER_AUTHOR': return 'bg-amber-100 text-amber-700';
    default: return 'bg-slate-100 text-slate-600';
  }
}

function getStateClass(value: string): string {
  switch (value) {
    case 'DRAFT': return 'bg-blue-100 text-blue-700';
    case 'REVIEW': return 'bg-amber-100 text-amber-700';
    case 'APPROVED': return 'bg-green-100 text-green-700';
    default: return 'bg-slate-100 text-slate-600';
  }
}

function getConfidentialityClass(value: string): string {
  switch (value as Confidentiality) {
    case 'PUBLIC': return 'bg-green-100 text-green-700';
    case 'INTERNAL': return 'bg-blue-100 text-blue-700';
    case 'RESTRICTED': return 'bg-orange-100 text-orange-700';
    case 'CONFIDENTIAL': return 'bg-red-100 text-red-700';
    default: return 'bg-slate-100 text-slate-600';
  }
}

export function Badge({ label, variant, value, className = '' }: BadgeProps) {
  let colorClass = '';
  if (variant === 'role') colorClass = getRoleClass(value ?? label);
  else if (variant === 'state') colorClass = getStateClass(value ?? label);
  else if (variant === 'confidentiality') colorClass = getConfidentialityClass(value ?? label);

  return (
    <span
      className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${colorClass} ${className}`}
    >
      {label}
    </span>
  );
}
