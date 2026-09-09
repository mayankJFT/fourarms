import { formatDistanceToNow } from 'date-fns';
import { MessageSquarePlus, Trash2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as aiService from '../../services/ai';
import type { Conversation } from '../../types';

interface ChatHistoryProps {
  activeId?: string;
  onSelect: (id: string) => void;
  onNew: () => void;
}

export function ChatHistory({ activeId, onSelect, onNew }: ChatHistoryProps) {
  const queryClient = useQueryClient();

  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ['conversations'],
    queryFn: aiService.listConversations,
  });

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await aiService.deleteConversation(id);
      await queryClient.invalidateQueries({ queryKey: ['conversations'] });
    } catch {
      // silently fail
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 border-r border-slate-200">
      <div className="p-3 border-b border-slate-200">
        <button
          onClick={onNew}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-[#1a56db] text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <MessageSquarePlus size={16} />
          New Chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {conversations.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-slate-400">
            No conversations yet.
          </div>
        )}

        {conversations.map((conv) => (
          <div
            key={conv.id}
            onClick={() => onSelect(conv.id)}
            className={`group mx-2 mb-1 px-3 py-2.5 rounded-lg cursor-pointer flex items-start justify-between gap-2 transition-colors ${
              activeId === conv.id
                ? 'bg-blue-100 text-blue-800'
                : 'hover:bg-slate-100 text-slate-700'
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">
                {conv.title?.slice(0, 40) || 'Untitled chat'}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {formatDistanceToNow(new Date(conv.updated_at), { addSuffix: true })}
              </div>
            </div>
            <button
              onClick={(e) => void handleDelete(e, conv.id)}
              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:text-red-600 hover:bg-red-50 transition-all flex-shrink-0 text-slate-400"
              title="Delete conversation"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
