import { Download, Edit2, Loader2, Save, Send, X } from 'lucide-react';
import { useState } from 'react';
import type { GenerateResponse } from '../../services/ai';
import * as workflowService from '../../services/workflow';
import { WorkflowBadge } from '../Workflow/WorkflowBadge';

interface DocumentPreviewProps {
  generated: GenerateResponse;
  workflowId?: string;
  onSubmit?: () => void;
  onExport?: () => void;
}

function parseSections(content: string): { heading: string; body: string }[] {
  // Split on lines that look like headings (ALL CAPS, or starting with #, or numbered)
  const lines = content.split('\n');
  const sections: { heading: string; body: string }[] = [];
  let current: { heading: string; body: string } | null = null;

  for (const line of lines) {
    const isHeading =
      /^#{1,3}\s/.test(line) || /^[A-Z][A-Z\s]{4,}$/.test(line.trim()) || /^\d+\.\s+[A-Z]/.test(line);
    if (isHeading) {
      if (current) sections.push(current);
      current = { heading: line.replace(/^#{1,3}\s/, '').trim(), body: '' };
    } else if (current) {
      current.body += (current.body ? '\n' : '') + line;
    } else {
      // preamble
      if (!sections.length) sections.push({ heading: 'Document', body: line });
      else sections[0].body += '\n' + line;
    }
  }
  if (current) sections.push(current);
  return sections.filter((s) => s.heading || s.body.trim());
}

export function DocumentPreview({ generated, workflowId, onSubmit, onExport }: DocumentPreviewProps) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(generated.content);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const sections = parseSections(editing ? editContent : generated.content);

  const handleSave = async () => {
    if (!workflowId) return;
    setSaving(true);
    try {
      await workflowService.updateDraft(workflowId, editContent);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!workflowId) return;
    setSubmitting(true);
    try {
      await workflowService.submit(workflowId);
      onSubmit?.();
    } finally {
      setSubmitting(false);
    }
  };

  const handleExport = async () => {
    if (!workflowId) return;
    setExporting(true);
    try {
      const blob = await workflowService.exportDocx(workflowId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${generated.title}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      onExport?.();
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <div>
          <h2 className="font-bold text-lg text-gray-800">{generated.title}</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-gray-500">
              {generated.doc_type} · Template {generated.template_variant}
            </span>
            <WorkflowBadge state="DRAFT" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
            >
              <Edit2 size={14} /> Edit
            </button>
          ) : (
            <>
              <button
                onClick={() => void handleSave()}
                disabled={saving}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-500 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Save
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setEditContent(generated.content);
                }}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
              >
                <X size={14} /> Cancel
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-5">
        {editing ? (
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full h-96 text-sm font-mono border border-gray-200 rounded-lg p-4 outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        ) : (
          <div className="space-y-5">
            {sections.map((section, i) => (
              <div key={i}>
                {section.heading && section.heading !== 'Document' && (
                  <h3 className="font-bold text-gray-800 text-base mb-2 pb-1 border-b border-gray-100">
                    {section.heading}
                  </h3>
                )}
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {section.body}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center gap-3">
        {workflowId && (
          <button
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="flex items-center gap-2 px-4 py-2 bg-blue-800 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Submit for Review
          </button>
        )}

        {workflowId && (
          <button
            onClick={() => void handleExport()}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors"
          >
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Export .docx
          </button>
        )}
      </div>
    </div>
  );
}
