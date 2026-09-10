/**
 * Canonical list of audit-log action strings actually written by the backend
 * (see `action="..."` calls to log_event across backend/app/). Keep this in
 * sync with the backend — a mismatch here means filters/badges silently show
 * nothing for real actions.
 */
export const AUDIT_ACTION_TYPES = [
  'USER_REGISTER',
  'USER_LOGIN',
  'USER_ROLE_CHANGE',
  'USER_ACTIVATE',
  'USER_DEACTIVATE',
  'USER_DELETE',
  'DOCUMENT_UPLOAD',
  'DOCUMENT_DOWNLOAD',
  'DOCUMENT_EDIT',
  'DOCUMENT_CATEGORY_CONFIRM',
  'DOCUMENT_VERSION_UPLOAD',
  'DOCUMENT_SHARE',
  'DOCUMENT_UNSHARE',
  'DOCUMENT_DELETE',
  'HR_CSV_UPLOAD',
  'RAG_QUERY',
  'CONVERSATION_DELETE',
  'VOICE_TRANSCRIBE',
  'DOCUMENT_GENERATE',
  'DOCUMENT_EXPORT',
  'TEMPLATE_UPLOAD',
  'TEMPLATE_DELETE',
  'WORKFLOW_TRANSITION',
  'SYSTEM_RESET_ALL',
] as const;

const ACTION_BADGE_CLASS: Record<string, string> = {
  USER_REGISTER: 'bg-green-100 text-green-700',
  USER_LOGIN: 'bg-green-100 text-green-700',
  USER_ROLE_CHANGE: 'bg-amber-100 text-amber-700',
  USER_ACTIVATE: 'bg-green-100 text-green-700',
  USER_DEACTIVATE: 'bg-slate-100 text-slate-600',
  USER_DELETE: 'bg-red-100 text-red-700',
  DOCUMENT_UPLOAD: 'bg-blue-100 text-blue-700',
  DOCUMENT_DOWNLOAD: 'bg-teal-100 text-teal-700',
  DOCUMENT_EDIT: 'bg-amber-100 text-amber-700',
  DOCUMENT_CATEGORY_CONFIRM: 'bg-violet-100 text-violet-700',
  DOCUMENT_VERSION_UPLOAD: 'bg-blue-100 text-blue-700',
  DOCUMENT_SHARE: 'bg-cyan-100 text-cyan-700',
  DOCUMENT_UNSHARE: 'bg-slate-100 text-slate-600',
  DOCUMENT_DELETE: 'bg-red-100 text-red-700',
  HR_CSV_UPLOAD: 'bg-blue-100 text-blue-700',
  RAG_QUERY: 'bg-purple-100 text-purple-700',
  CONVERSATION_DELETE: 'bg-red-100 text-red-700',
  VOICE_TRANSCRIBE: 'bg-purple-100 text-purple-700',
  DOCUMENT_GENERATE: 'bg-violet-100 text-violet-700',
  DOCUMENT_EXPORT: 'bg-cyan-100 text-cyan-700',
  TEMPLATE_UPLOAD: 'bg-blue-100 text-blue-700',
  TEMPLATE_DELETE: 'bg-red-100 text-red-700',
  WORKFLOW_TRANSITION: 'bg-indigo-100 text-indigo-700',
  SYSTEM_RESET_ALL: 'bg-red-100 text-red-700',
};

export function actionBadgeClass(action: string): string {
  return ACTION_BADGE_CLASS[action] ?? 'bg-slate-100 text-slate-600';
}
