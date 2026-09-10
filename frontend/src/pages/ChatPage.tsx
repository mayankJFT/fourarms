import { BookOpen, FileText, Search, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChatHistory } from '../components/Chat/ChatHistory';
import { ChatInput } from '../components/Chat/ChatInput';
import { ChatMessage } from '../components/Chat/ChatMessage';
import { AppLayout } from '../components/Layout/AppLayout';
import { useAuth } from '../hooks/useAuth';
import { useChat } from '../hooks/useChat';
import * as aiService from '../services/ai';
import * as documentsService from '../services/documents';
import { useChatStore } from '../stores/chatStore';
import type { Document } from '../types';

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: 'All docs',
  BOARD_ADMIN: 'All docs',
  TENDER_AUTHOR: 'Public + Internal + Restricted',
  STANDARD_USER: 'Public + Internal',
};

const ROLE_COLOR: Record<string, string> = {
  SUPER_ADMIN: 'bg-red-50 text-red-700 border-red-200',
  BOARD_ADMIN: 'bg-red-50 text-red-700 border-red-200',
  TENDER_AUTHOR: 'bg-amber-50 text-amber-700 border-amber-200',
  STANDARD_USER: 'bg-blue-50 text-blue-700 border-blue-200',
};

function UserProfileChip({ name, role }: { name: string; role: string }) {
  const initials = name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-full shadow-sm">
      <div className="w-7 h-7 rounded-full bg-[#0f2d5e] text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
        {initials}
      </div>
      <div className="leading-tight">
        <div className="text-xs font-semibold text-slate-800 truncate max-w-[120px]">{name}</div>
        <div className="text-[10px] text-slate-400">{role.replace('_', ' ')}</div>
      </div>
    </div>
  );
}

export function ChatPage() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const {
    messages,
    conversationId,
    conversationOwnerId,
    conversationOwnerEmail,
    isLoading,
    sendMessage,
    loadConversation,
    newConversation,
  } = useChat();
  const isReadOnly = conversationOwnerId !== undefined && conversationOwnerId !== currentUser?.id;
  const { scopedDocIds, docSearch, setScopedDocIds, toggleScopedDoc, setDocSearch } = useChatStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showDocPicker, setShowDocPicker] = useState(false);

  const { data: allDocs = [] } = useQuery<Document[]>({
    queryKey: ['documents'],
    queryFn: () => documentsService.list(),
    enabled: showDocPicker,
  });

  const filteredDocs = allDocs.filter((d) =>
    !docSearch || d.title.toLowerCase().includes(docSearch.toLowerCase()) ||
    (d.doc_type ?? '').toLowerCase().includes(docSearch.toLowerCase())
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (query: string) => {
    void sendMessage(query, scopedDocIds.length ? scopedDocIds : undefined);
  };

  const toggleDocScope = (docId: string) => {
    toggleScopedDoc(docId);
  };

  const handleDeleteConversation = async () => {
    if (!conversationId) return;
    if (!window.confirm('Delete this conversation?')) return;
    try {
      await aiService.deleteConversation(conversationId);
      await queryClient.invalidateQueries({ queryKey: ['conversations'] });
      newConversation();
    } catch { /* silently fail */ }
  };

  const role = currentUser?.role ?? 'STANDARD_USER';
  const accessLabel = ROLE_LABEL[role] ?? 'Public + Internal';
  const accessColor = ROLE_COLOR[role] ?? ROLE_COLOR.STANDARD_USER;

  return (
    <AppLayout title="AI Chat">
      <div className="-m-6 flex h-[calc(100vh-56px)]">
        {/* Left: Chat history panel */}
        <div className="w-64 flex-shrink-0 border-r border-slate-200">
          <ChatHistory
            activeId={conversationId}
            onSelect={(id) => void loadConversation(id)}
            onNew={newConversation}
          />
        </div>

        {/* Right: Chat interface */}
        <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">

          {/* Top bar: user profile + delete */}
          <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-slate-200">
            <div className="flex items-center gap-2">
              {currentUser && (
                <UserProfileChip name={currentUser.full_name} role={currentUser.role} />
              )}
              <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${accessColor}`}>
                Access: {accessLabel}
              </span>
            </div>
            {conversationId && !isReadOnly && (
              <button
                onClick={() => void handleDeleteConversation()}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                title="Delete this conversation"
              >
                <Trash2 size={13} /> Delete chat
              </button>
            )}
          </div>

          {/* Read-only banner: SUPER_ADMIN viewing another user's conversation */}
          {isReadOnly && (
            <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 flex items-center gap-2 text-sm text-amber-800">
              <BookOpen size={14} />
              <span>
                Viewing <span className="font-medium">{conversationOwnerEmail ?? 'another user'}</span>'s conversation — read-only
              </span>
            </div>
          )}

          {/* Scope indicator */}
          {scopedDocIds.length > 0 && (
            <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-center gap-2 text-sm">
              <BookOpen size={14} className="text-[#1a56db]" />
              <span className="text-[#1a56db] font-medium">
                Scoped to {scopedDocIds.length} document{scopedDocIds.length > 1 ? 's' : ''}
              </span>
              <button onClick={() => setScopedDocIds([])} className="ml-auto text-blue-500 hover:text-blue-700">
                <X size={14} />
              </button>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: '#0f2d5e' }}>
                  <BookOpen size={28} className="text-amber-400" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-1">Ask Aria anything</h3>
                <p className="text-sm text-slate-500 max-w-sm mb-1">
                  Search across all indexed QCI documents. Scope to specific files or ask freely.
                </p>
                <p className="text-xs text-slate-400 max-w-sm mb-4">
                  Tip: for a summary of one specific document, use the <span className="font-medium">Summarise</span> button
                  on that document's page in the Repository instead — it's more accurate than asking here.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {['What documents are available?', 'What tenders are currently in the repository?', 'What are the eligibility criteria for our tenders?'].map((q) => (
                    <button
                      key={q}
                      onClick={() => handleSend(q)}
                      className="text-xs px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-600 hover:border-[#1a56db] hover:text-[#1a56db] transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}

            {isLoading && (
              <div className="flex justify-start mb-4">
                <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce [animation-delay:0ms]" />
                      <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce [animation-delay:150ms]" />
                      <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce [animation-delay:300ms]" />
                    </div>
                    Aria is thinking…
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Bottom controls */}
          <div className="px-4 pb-4 pt-2 space-y-2 border-t border-slate-200 bg-white">
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setShowDocPicker((v) => !v); if (!showDocPicker) setDocSearch(''); }}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  scopedDocIds.length
                    ? 'border-[#1a56db] bg-blue-50 text-[#1a56db]'
                    : 'border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
              >
                <BookOpen size={13} />
                {scopedDocIds.length ? `Scoped (${scopedDocIds.length})` : 'Scope to docs'}
              </button>
              {scopedDocIds.length > 0 && (
                <button
                  onClick={() => setScopedDocIds([])}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  Clear scope
                </button>
              )}
            </div>
            <ChatInput onSend={handleSend} isLoading={isLoading} disabled={isReadOnly} />
          </div>
        </div>
      </div>

      {/* Document picker modal */}
      {showDocPicker && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4" onClick={() => setShowDocPicker(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[72vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-800">Scope to Documents</h3>
                <button onClick={() => setShowDocPicker(false)}>
                  <X size={18} className="text-slate-400 hover:text-slate-600" />
                </button>
              </div>
              {/* Search */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={docSearch}
                  onChange={(e) => setDocSearch(e.target.value)}
                  placeholder="Search documents…"
                  className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#1a56db]"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {/* All docs option */}
              <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                <input
                  type="checkbox"
                  checked={scopedDocIds.length === 0}
                  onChange={() => setScopedDocIds([])}
                  className="rounded accent-[#1a56db]"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-800">All documents</div>
                  <div className="text-xs text-slate-400">Search across entire knowledge base</div>
                </div>
              </label>

              <div className="border-t border-slate-100 pt-2 text-xs text-slate-400 uppercase tracking-wide font-medium px-1">
                Specific documents
              </div>

              {filteredDocs.map((doc) => (
                <label
                  key={doc.id}
                  className="flex items-center gap-3 p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={scopedDocIds.includes(doc.id)}
                    onChange={() => toggleDocScope(doc.id)}
                    className="rounded accent-[#1a56db]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-800 truncate">{doc.title}</div>
                    <div className="text-xs text-slate-400">{doc.doc_type ?? 'Document'}</div>
                  </div>
                  {doc.is_indexed
                    ? <span className="ml-auto text-xs text-green-600 font-medium flex-shrink-0">Indexed</span>
                    : <span className="ml-auto text-xs text-amber-500 font-medium flex-shrink-0">Pending</span>
                  }
                </label>
              ))}

              {filteredDocs.length === 0 && (
                <div className="flex flex-col items-center py-12 text-slate-400">
                  <FileText size={32} className="mb-3" />
                  <p className="text-sm">{docSearch ? 'No matching documents' : 'No documents available'}</p>
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                {scopedDocIds.length === 0 ? 'All docs selected' : `${scopedDocIds.length} selected`}
              </span>
              <div className="flex gap-2">
                <button onClick={() => setScopedDocIds([])} className="text-sm px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg">
                  Clear
                </button>
                <button onClick={() => setShowDocPicker(false)} className="text-sm px-4 py-1.5 bg-[#1a56db] text-white rounded-lg hover:bg-blue-700">
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
