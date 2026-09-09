import { format, formatDistanceToNow } from 'date-fns';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  FileText,
  GitBranch,
  Loader2,
  Send,
} from 'lucide-react';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../components/Layout/AppLayout';
import { Badge } from '../components/UI/Badge';
import { EmptyState } from '../components/UI/EmptyState';
import { PageHeader } from '../components/UI/PageHeader';
import { useAuth } from '../hooks/useAuth';
import * as workflowService from '../services/workflow';
import type { DocState, GeneratedDocument, WorkflowEvent } from '../types';

const STATE_TABS: { id: DocState | 'ALL'; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'DRAFT', label: 'Draft' },
  { id: 'REVIEW', label: 'In Review' },
  { id: 'APPROVED', label: 'Approved' },
];

function StateTimeline({ events }: { events: WorkflowEvent[] }) {
  return (
    <div className="space-y-3 mt-4">
      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">State History</h4>
      {events.length === 0 ? (
        <p className="text-xs text-slate-400">No history available.</p>
      ) : (
        <ol className="relative border-l border-slate-200 ml-3 space-y-4">
          {events.map((ev, i) => (
            <li key={ev.id} className="ml-4">
              <div
                className={`absolute -left-1.5 w-3 h-3 rounded-full border-2 border-white ${
                  i === 0 ? 'bg-[#1a56db]' : 'bg-slate-300'
                }`}
              />
              <div className="text-xs text-slate-400">
                {formatDistanceToNow(new Date(ev.timestamp), { addSuffix: true })}
              </div>
              <div className="text-sm font-medium text-slate-700 mt-0.5">
                {ev.from_state ? (
                  <span>
                    <span className="text-slate-400">{ev.from_state}</span>
                    {' → '}
                    <span className="font-semibold">{ev.to_state}</span>
                  </span>
                ) : (
                  <span>Created as <span className="font-semibold">{ev.to_state}</span></span>
                )}
              </div>
              {ev.comment && (
                <div className="mt-1 text-xs text-slate-500 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  {ev.comment}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function RevisionModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (comment: string) => Promise<void>;
}) {
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!comment.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit(comment.trim());
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-slate-900 mb-1">Request Revision</h3>
        <p className="text-sm text-slate-500 mb-4">
          Provide a comment explaining what changes are needed.
        </p>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="e.g. Please revise Section 3 to include the updated compliance clause…"
          rows={4}
          className="w-full text-sm border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#1a56db] text-slate-800 resize-none"
          autoFocus
        />
        <div className="flex justify-end gap-3 mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={!comment.trim() || submitting}
            className="px-4 py-2 text-sm font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Request Revision
          </button>
        </div>
      </div>
    </div>
  );
}

function DocRow({
  doc,
  isAdmin,
  onAction,
}: {
  doc: GeneratedDocument;
  isAdmin: boolean;
  onAction: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [actioning, setActioning] = useState<string | null>(null);
  const [showReviseModal, setShowReviseModal] = useState(false);
  const queryClient = useQueryClient();

  const { data: history = [] } = useQuery<WorkflowEvent[]>({
    queryKey: ['workflow', 'history', doc.id],
    queryFn: () => workflowService.getHistory(doc.id),
    enabled: expanded,
  });

  const handleSubmit = async () => {
    setActioning('submit');
    try {
      await workflowService.submit(doc.id);
      await queryClient.invalidateQueries({ queryKey: ['workflow', 'documents'] });
      onAction();
    } finally {
      setActioning(null);
    }
  };

  const handleApprove = async () => {
    setActioning('approve');
    try {
      await workflowService.approve(doc.id);
      await queryClient.invalidateQueries({ queryKey: ['workflow', 'documents'] });
      onAction();
    } finally {
      setActioning(null);
    }
  };

  const handleRevise = async (comment: string) => {
    await workflowService.revise(doc.id, comment);
    await queryClient.invalidateQueries({ queryKey: ['workflow', 'documents'] });
    onAction();
  };

  const handleExport = async () => {
    setActioning('export');
    try {
      const blob = await workflowService.exportDocx(doc.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${doc.title.replace(/\s+/g, '_')}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setActioning(null);
    }
  };

  return (
    <>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div
          className="px-4 py-3 flex items-center gap-4 cursor-pointer hover:bg-slate-50 transition-colors"
          onClick={() => setExpanded((v) => !v)}
        >
          <div className="p-2 bg-slate-100 rounded-lg flex-shrink-0">
            <FileText size={16} className="text-slate-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-slate-800 text-sm truncate">{doc.title}</div>
            <div className="text-xs text-slate-400 mt-0.5">
              {doc.doc_type} · v{doc.template_variant} ·{' '}
              {format(new Date(doc.created_at), 'MMM d, yyyy')}
            </div>
          </div>
          <Badge label={doc.state} variant="state" value={doc.state} />
          <div className="flex items-center gap-2 ml-2" onClick={(e) => e.stopPropagation()}>
            {doc.state === 'DRAFT' && (
              <button
                onClick={() => void handleSubmit()}
                disabled={actioning === 'submit'}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-[#1a56db] text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {actioning === 'submit' ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                Submit for Review
              </button>
            )}
            {doc.state === 'REVIEW' && isAdmin && (
              <>
                <button
                  onClick={() => void handleApprove()}
                  disabled={actioning === 'approve'}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {actioning === 'approve' ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                  Approve
                </button>
                <button
                  onClick={() => setShowReviseModal(true)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors"
                >
                  <AlertCircle size={12} />
                  Request Revision
                </button>
              </>
            )}
            {doc.state === 'APPROVED' && (
              <button
                onClick={() => void handleExport()}
                disabled={actioning === 'export'}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 disabled:opacity-50 transition-colors"
              >
                {actioning === 'export' ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                Export .docx
              </button>
            )}
          </div>
          <div className="text-slate-300">
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </div>
        </div>

        {expanded && (
          <div className="border-t border-slate-100 px-4 py-4 bg-slate-50">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Content preview */}
              {doc.content && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Content Preview
                  </h4>
                  <div className="bg-white border border-slate-200 rounded-lg p-4 text-sm text-slate-700 leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap">
                    {doc.content.slice(0, 800)}
                    {doc.content.length > 800 && '…'}
                  </div>
                </div>
              )}

              {/* Timeline */}
              <StateTimeline events={history} />
            </div>
          </div>
        )}
      </div>

      {showReviseModal && (
        <RevisionModal
          onClose={() => setShowReviseModal(false)}
          onSubmit={handleRevise}
        />
      )}
    </>
  );
}

export function WorkflowPage() {
  const { hasAnyRole } = useAuth();
  const isAdmin = hasAnyRole(['SUPER_ADMIN', 'BOARD_ADMIN']);
  const [activeTab, setActiveTab] = useState<DocState | 'ALL'>('ALL');
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: allDocs = [], isLoading } = useQuery<GeneratedDocument[]>({
    queryKey: ['workflow', 'documents', refreshKey],
    queryFn: () => workflowService.listGenerated(),
  });

  const { data: pendingDocs = [] } = useQuery<GeneratedDocument[]>({
    queryKey: ['workflow', 'documents', 'REVIEW', refreshKey],
    queryFn: () => workflowService.listGenerated({ state: 'REVIEW' }),
    enabled: isAdmin,
  });

  const filtered =
    activeTab === 'ALL'
      ? allDocs
      : allDocs.filter((d) => d.state === activeTab);

  const pendingCount = pendingDocs.length;

  return (
    <AppLayout title="Document Workflow">
      <div className="max-w-5xl mx-auto">
        <PageHeader
          title="Document Workflow"
          subtitle="Track and manage document review and approval lifecycle"
        />

        {/* Pending Reviews (admin only) */}
        {isAdmin && pendingCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle size={16} className="text-amber-600" />
              <h3 className="font-semibold text-amber-800 text-sm">
                {pendingCount} Document{pendingCount > 1 ? 's' : ''} Awaiting Review
              </h3>
            </div>
            <div className="space-y-2">
              {pendingDocs.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between bg-white rounded-lg px-4 py-3 border border-amber-100">
                  <div>
                    <span className="font-medium text-slate-800 text-sm">{doc.title}</span>
                    <span className="text-xs text-slate-400 ml-2">{doc.doc_type}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-amber-700">
                    <Clock size={12} />
                    {formatDistanceToNow(new Date(doc.updated_at), { addSuffix: true })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* State tabs */}
        <div className="flex items-center gap-1 mb-5 border-b border-slate-200">
          {STATE_TABS.map((tab) => {
            const count =
              tab.id === 'ALL'
                ? allDocs.length
                : allDocs.filter((d) => d.state === tab.id).length;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                  activeTab === tab.id
                    ? 'border-[#1a56db] text-[#1a56db]'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.label}
                <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Document list */}
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 size={28} className="animate-spin text-[#1a56db]" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<GitBranch size={28} />}
            heading="No documents"
            body={
              activeTab === 'ALL'
                ? 'Generate a document first, then manage its workflow here.'
                : `No ${activeTab.toLowerCase()} documents found.`
            }
          />
        ) : (
          <div className="space-y-3">
            {filtered.map((doc) => (
              <DocRow
                key={doc.id}
                doc={doc}
                isAdmin={isAdmin}
                onAction={() => setRefreshKey((k) => k + 1)}
              />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
