import { AlertCircle, CheckCircle, Info } from 'lucide-react';
import { format } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage as ChatMessageType } from '../../types';
import { CitationBadge } from './CitationBadge';

interface ChatMessageProps {
  message: ChatMessageType;
}

function GuardrailBadge({ outcome }: { outcome: string }) {
  if (outcome === 'ANSWERED') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
        <CheckCircle size={11} /> Answered
      </span>
    );
  }
  if (outcome === 'NO_INFO') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
        <Info size={11} /> No Info
      </span>
    );
  }
  if (outcome === 'ACCESS_DENIED') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
        <AlertCircle size={11} /> Access Denied
      </span>
    );
  }
  return null;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const timestamp = format(new Date(message.timestamp), 'HH:mm');

  if (isUser) {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[70%]">
          <div className="bg-blue-800 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed">
            {message.content}
          </div>
          <div className="text-right text-xs text-gray-400 mt-1 pr-1">{timestamp}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start mb-4">
      <div className="max-w-[80%]">
        <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
          {message.guardrail_outcome && (
            <div className="mb-2">
              <GuardrailBadge outcome={message.guardrail_outcome} />
            </div>
          )}

          <div className="text-sm text-gray-800 leading-relaxed prose prose-sm max-w-none
            prose-headings:font-semibold prose-headings:text-slate-800
            prose-p:my-1.5 prose-p:leading-relaxed
            prose-ul:my-1.5 prose-ul:pl-5 prose-li:my-0.5
            prose-ol:my-1.5 prose-ol:pl-5
            prose-table:text-xs prose-table:border-collapse
            prose-th:bg-slate-50 prose-th:px-3 prose-th:py-2 prose-th:border prose-th:border-slate-200 prose-th:text-left prose-th:font-semibold prose-th:text-slate-600
            prose-td:px-3 prose-td:py-2 prose-td:border prose-td:border-slate-200
            prose-strong:text-slate-900 prose-strong:font-semibold
            prose-code:bg-slate-100 prose-code:px-1 prose-code:rounded prose-code:text-xs
            prose-blockquote:border-l-4 prose-blockquote:border-blue-300 prose-blockquote:pl-3 prose-blockquote:text-slate-600 prose-blockquote:italic">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>

          {message.citations?.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wide">
                Sources
              </div>
              <div className="flex flex-wrap gap-1.5">
                {message.citations.map((citation, i) => (
                  <CitationBadge key={citation.chunk_id} citation={citation} index={i} />
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="text-left text-xs text-gray-400 mt-1 pl-1">{timestamp}</div>
      </div>
    </div>
  );
}
