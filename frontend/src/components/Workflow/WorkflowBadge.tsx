import type { DocState } from '../../types';

interface WorkflowBadgeProps {
  state: DocState;
  className?: string;
}

const STATE_STYLES: Record<DocState, string> = {
  DRAFT: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
  REVIEW: 'bg-blue-100 text-blue-800 border border-blue-200',
  APPROVED: 'bg-green-100 text-green-800 border border-green-200',
};

const STATE_LABELS: Record<DocState, string> = {
  DRAFT: 'Draft',
  REVIEW: 'Under Review',
  APPROVED: 'Approved',
};

export function WorkflowBadge({ state, className = '' }: WorkflowBadgeProps) {
  return (
    <span
      className={`inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-full ${STATE_STYLES[state]} ${className}`}
    >
      {STATE_LABELS[state]}
    </span>
  );
}
