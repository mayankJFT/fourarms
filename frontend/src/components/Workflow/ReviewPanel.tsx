import { CheckCircle, Loader2, MessageSquare, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import type { GeneratedDocument } from '../../types';
import { WorkflowBadge } from './WorkflowBadge';

interface ReviewPanelProps {
  document: GeneratedDocument;
  onApprove: (id: string) => Promise<void>;
  onRevise: (id: string, comment: string) => Promise<void>;
}

export function ReviewPanel({ document, onApprove, onRevise }: ReviewPanelProps) {
  const [showReviseForm, setShowReviseForm] = useState(false);
  const [comment, setComment] = useState('');
  const [approving, setApproving] = useState(false);
  const [revising, setRevising] = useState(false);

  const handleApprove = async () => {
    setApproving(true);
    try {
      await onApprove(document.id);
    } finally {
      setApproving(false);
    }
  };

  const handleRevise = async () => {
    if (!comment.trim()) return;
    setRevising(true);
    try {
      await onRevise(document.id, comment.trim());
      setShowReviseForm(false);
      setComment('');
    } finally {
      setRevising(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-800">Review Panel</h3>
        <WorkflowBadge state={document.state} />
      </div>

      <div className="mb-4 p-3 bg-gray-50 rounded-lg">
        <div className="text-sm font-medium text-gray-700 mb-1">{document.title}</div>
        <div className="text-xs text-gray-400">
          {document.doc_type} · Template {document.template_variant}
        </div>
      </div>

      {document.state === 'REVIEW' && (
        <div className="space-y-3">
          <button
            onClick={() => void handleApprove()}
            disabled={approving}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white font-medium rounded-lg hover:bg-green-500 disabled:opacity-50 transition-colors"
          >
            {approving ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <CheckCircle size={16} />
            )}
            Approve Document
          </button>

          {!showReviseForm ? (
            <button
              onClick={() => setShowReviseForm(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-50 text-orange-700 border border-orange-200 font-medium rounded-lg hover:bg-orange-100 transition-colors"
            >
              <RotateCcw size={16} />
              Request Revision
            </button>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-orange-700">
                <MessageSquare size={14} />
                Revision comment
              </div>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Explain what needs to be revised…"
                rows={3}
                className="w-full text-sm border border-orange-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-orange-400 resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => void handleRevise()}
                  disabled={revising || !comment.trim()}
                  className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-orange-600 text-white text-sm font-medium rounded-lg hover:bg-orange-500 disabled:opacity-50 transition-colors"
                >
                  {revising ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                  Send for Revision
                </button>
                <button
                  onClick={() => {
                    setShowReviseForm(false);
                    setComment('');
                  }}
                  className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {document.state === 'APPROVED' && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5">
          <CheckCircle size={16} />
          This document has been approved.
        </div>
      )}

      {document.state === 'DRAFT' && (
        <div className="text-sm text-gray-500 text-center py-2">
          Document is in draft — awaiting submission for review.
        </div>
      )}
    </div>
  );
}
