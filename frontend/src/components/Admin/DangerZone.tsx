import { AlertTriangle, Loader2, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as adminService from '../../services/admin';
import type { ResetAllResponse } from '../../services/admin';

const CONFIRM_PHRASE = 'DELETE ALL';

function ResetAllModal({ onClose, onDone }: { onClose: () => void; onDone: (result: ResetAllResponse) => void }) {
  const [confirmText, setConfirmText] = useState('');
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canConfirm = confirmText === CONFIRM_PHRASE;

  const handleReset = async () => {
    if (!canConfirm) return;
    setResetting(true);
    setError(null);
    try {
      const result = await adminService.resetAll();
      onDone(result);
    } catch {
      setError('Reset failed. Check the backend logs and try again.');
      setResetting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={resetting ? undefined : onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-red-100 bg-red-50 flex items-center gap-2 rounded-t-2xl">
          <AlertTriangle size={18} className="text-red-600" />
          <h3 className="font-bold text-red-800">Reset entire system</h3>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-600">This permanently deletes, for every user:</p>
          <ul className="text-sm text-slate-600 list-disc list-inside space-y-1">
            <li>All documents, their versions, chunks, and shares</li>
            <li>Every vector in Pinecone (documents <span className="font-medium">and</span> HR records — HR data becomes unsearchable until re-uploaded)</li>
            <li>All chat conversations</li>
            <li>All AI-generated documents and their workflow/review history</li>
          </ul>
          <p className="text-sm text-slate-600">
            <span className="font-medium">Not</span> deleted: user accounts, the audit log, HR record rows (just their search index).
          </p>
          <p className="text-sm font-medium text-red-700">This cannot be undone.</p>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">
              Type <span className="font-mono font-bold text-red-700">{CONFIRM_PHRASE}</span> to confirm
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={resetting}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-red-500"
              autoComplete="off"
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex gap-3">
          <button
            onClick={onClose}
            disabled={resetting}
            className="flex-1 px-4 py-2 text-sm font-medium border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleReset()}
            disabled={!canConfirm || resetting}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {resetting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            Delete everything
          </button>
        </div>
      </div>
    </div>
  );
}

function ResultSummary({ result, onClose }: { result: ResetAllResponse; onClose: () => void }) {
  const rows: [string, number | string][] = [
    ['Documents deleted', result.documents_deleted],
    ['Chunks deleted', result.chunks_deleted],
    ['Conversations deleted', result.conversation_sessions_deleted],
    ['Generated documents deleted', result.generated_documents_deleted],
    ['Files removed from disk', `${result.files_deleted}${result.files_failed ? ` (${result.files_failed} failed)` : ''}`],
    ['Pinecone cleared', result.pinecone_cleared ? 'Yes' : 'Failed — check backend logs'],
  ];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-slate-900">System reset complete</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>
        <div className="p-6 space-y-2">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-50 last:border-0">
              <span className="text-slate-500">{label}</span>
              <span className="font-medium text-slate-800">{value}</span>
            </div>
          ))}
        </div>
        <div className="px-6 py-4 border-t border-slate-200">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 text-sm font-medium bg-[#1a56db] text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export function DangerZone() {
  const [showConfirm, setShowConfirm] = useState(false);
  const [result, setResult] = useState<ResetAllResponse | null>(null);
  const queryClient = useQueryClient();

  const handleDone = (r: ResetAllResponse) => {
    setShowConfirm(false);
    setResult(r);
    void queryClient.invalidateQueries();
  };

  return (
    <>
      <div className="bg-white border border-red-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-red-100 bg-red-50 flex items-center gap-3">
          <AlertTriangle size={18} className="text-red-600" />
          <h3 className="font-semibold text-red-800">Danger Zone</h3>
        </div>
        <div className="p-6 flex items-center justify-between gap-4">
          <div>
            <div className="font-medium text-slate-800 text-sm">Reset entire system</div>
            <p className="text-xs text-slate-500 mt-1 max-w-md">
              Permanently deletes all documents, Pinecone vectors, chat history, and AI-generated documents
              for every user. User accounts, the audit log, and HR records are kept.
            </p>
          </div>
          <button
            onClick={() => setShowConfirm(true)}
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
          >
            <Trash2 size={15} /> Delete All
          </button>
        </div>
      </div>

      {showConfirm && <ResetAllModal onClose={() => setShowConfirm(false)} onDone={handleDone} />}
      {result && <ResultSummary result={result} onClose={() => setResult(null)} />}
    </>
  );
}
