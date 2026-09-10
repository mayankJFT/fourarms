import { Loader2, Share2, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as documentsService from '../../services/documents';

interface Props {
  docId: string;
  docTitle: string;
  onClose: () => void;
}

export function ShareModal({ docId, docTitle, onClose }: Props) {
  const queryClient = useQueryClient();
  const [emailInput, setEmailInput] = useState('');
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: shares = [], isLoading } = useQuery({
    queryKey: ['doc-shares', docId],
    queryFn: () => documentsService.listShares(docId),
  });

  const handleShare = async () => {
    const emails = emailInput.split(',').map((e) => e.trim()).filter(Boolean);
    if (!emails.length) return;
    setSharing(true);
    setError(null);
    try {
      await documentsService.shareDocument(docId, emails);
      setEmailInput('');
      await queryClient.invalidateQueries({ queryKey: ['doc-shares', docId] });
    } catch {
      setError('Failed to share. Check the email addresses and try again.');
    } finally {
      setSharing(false);
    }
  };

  const handleRevoke = async (userId: number) => {
    try {
      await documentsService.unshareDocument(docId, userId);
      await queryClient.invalidateQueries({ queryKey: ['doc-shares', docId] });
    } catch {
      // silently fail
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="min-w-0">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <Share2 size={16} className="text-[#1a56db]" /> Share document
            </h3>
            <p className="text-xs text-slate-400 mt-0.5 truncate">{docTitle}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">
              Add people by email (comma-separated)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="colleague@qci.gov.in"
                className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#1a56db]"
              />
              <button
                onClick={() => void handleShare()}
                disabled={!emailInput.trim() || sharing}
                className="px-4 py-2 bg-[#1a56db] text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors flex items-center gap-1.5"
              >
                {sharing ? <Loader2 size={14} className="animate-spin" /> : 'Share'}
              </button>
            </div>
            {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
          </div>

          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              People with access
            </h4>
            {isLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 size={20} className="animate-spin text-slate-300" />
              </div>
            ) : shares.length === 0 ? (
              <p className="text-sm text-slate-400 py-2">Only you can see this document.</p>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {shares.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg text-sm">
                    <span className="flex-1 min-w-0 truncate text-slate-700">{s.shared_with_email}</span>
                    <button
                      onClick={() => void handleRevoke(s.shared_with_user_id)}
                      title="Revoke access"
                      className="text-slate-400 hover:text-red-600 transition-colors flex-shrink-0"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
