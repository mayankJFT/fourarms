import { BookOpen, FileText, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChatHistory } from '../components/Chat/ChatHistory';
import { ChatInput } from '../components/Chat/ChatInput';
import { ChatMessage } from '../components/Chat/ChatMessage';
import { AppLayout } from '../components/Layout/AppLayout';
import { useAuth } from '../hooks/useAuth';
import { useChat } from '../hooks/useChat';
import * as documentsService from '../services/documents';
import type { Document } from '../types';

export function ChatPage() {
  const { currentUser } = useAuth();
  const { messages, conversationId, isLoading, sendMessage, loadConversation, newConversation } =
    useChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showDocPicker, setShowDocPicker] = useState(false);
  const [scopedDocIds, setScopedDocIds] = useState<string[]>([]);

  const { data: documents = [] } = useQuery<Document[]>({
    queryKey: ['documents'],
    queryFn: () => documentsService.list(),
    enabled: showDocPicker,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (query: string) => {
    void sendMessage(query, scopedDocIds.length ? scopedDocIds : undefined);
  };

  const toggleDocScope = (docId: string) => {
    setScopedDocIds((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId],
    );
  };

  const accessLabel = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'BOARD_ADMIN'
    ? 'Access: All docs'
    : currentUser?.role === 'TENDER_AUTHOR'
    ? 'Access: Public + Internal + Restricted docs'
    : 'Access: Public + Internal docs';

  const accessColor = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'BOARD_ADMIN'
    ? 'bg-red-50 text-red-700 border-red-200'
    : currentUser?.role === 'TENDER_AUTHOR'
    ? 'bg-amber-50 text-amber-700 border-amber-200'
    : 'bg-blue-50 text-blue-700 border-blue-200';

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
          {/* Scope indicator */}
          {scopedDocIds.length > 0 && (
            <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-center gap-2 text-sm">
              <BookOpen size={14} className="text-[#1a56db]" />
              <span className="text-[#1a56db] font-medium">
                Scoped to {scopedDocIds.length} document{scopedDocIds.length > 1 ? 's' : ''}
              </span>
              <button
                onClick={() => setScopedDocIds([])}
                className="ml-auto text-blue-500 hover:text-blue-700"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: '#0f2d5e' }}>
                  <BookOpen size={28} className="text-amber-400" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-2">
                  Ask anything about QCI documents
                </h3>
                <p className="text-sm text-slate-500 max-w-sm mb-4">
                  I can search across all indexed documents and provide cited answers based on QCI knowledge base.
                </p>
                <span className={`text-xs px-3 py-1.5 rounded-full border font-medium ${accessColor}`}>
                  {accessLabel}
                </span>
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
                    Thinking…
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
                onClick={() => setShowDocPicker((v) => !v)}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  scopedDocIds.length
                    ? 'border-[#1a56db] bg-blue-50 text-[#1a56db]'
                    : 'border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
              >
                <BookOpen size={13} />
                Scope to docs {scopedDocIds.length > 0 ? `(${scopedDocIds.length})` : ''}
              </button>
              <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${accessColor}`}>
                {accessLabel}
              </span>
            </div>
            <ChatInput onSend={handleSend} isLoading={isLoading} />
          </div>
        </div>
      </div>

      {/* Document picker modal */}
      {showDocPicker && (
        <div
          className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4"
          onClick={() => setShowDocPicker(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[70vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">Select Documents to Scope</h3>
              <button onClick={() => setShowDocPicker(false)}>
                <X size={18} className="text-slate-400 hover:text-slate-600" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {documents.map((doc) => (
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
                    <div className="text-xs text-slate-400">{doc.doc_type}</div>
                  </div>
                  {doc.is_indexed && (
                    <span className="ml-auto text-xs text-green-600 font-medium flex-shrink-0">
                      Indexed
                    </span>
                  )}
                </label>
              ))}
              {documents.length === 0 && (
                <div className="flex flex-col items-center py-12 text-slate-400">
                  <FileText size={32} className="mb-3" />
                  <p className="text-sm">No documents available</p>
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setScopedDocIds([])}
                className="text-sm px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Clear
              </button>
              <button
                onClick={() => setShowDocPicker(false)}
                className="text-sm px-4 py-1.5 bg-[#1a56db] text-white rounded-lg hover:bg-blue-700"
              >
                Done ({scopedDocIds.length} selected)
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
