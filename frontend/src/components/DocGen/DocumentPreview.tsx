import { Download, Edit2, Loader2, Save, Send, X } from 'lucide-react';
import { useState } from 'react';
import type { GenerateResponse } from '../../services/ai';
import * as workflowService from '../../services/workflow';
import type { GeneratedDocSection } from '../../types';
import { WorkflowBadge } from '../Workflow/WorkflowBadge';

interface DocumentPreviewProps {
  generated: GenerateResponse;
  workflowId?: string;
  onSubmit?: () => void;
  onExport?: () => void;
}

interface ParsedContent {
  title?: string;
  reference_number?: string;
  sections: GeneratedDocSection[];
}

/** content_json is a JSON string ({title, reference_number, sections}), not flat text. */
function parseContentJson(contentJson: string): ParsedContent {
  try {
    const parsed = JSON.parse(contentJson) as Partial<ParsedContent>;
    return {
      title: parsed.title,
      reference_number: parsed.reference_number,
      sections: Array.isArray(parsed.sections) ? parsed.sections : [],
    };
  } catch {
    return { sections: [] };
  }
}

/** Section content sometimes embeds a raw `<table>...</table>` HTML block (the
 * generator/RAG pipeline represents tables as HTML — see
 * app.documents.ingestion._table_to_html on the backend), which the LLM may
 * echo back verbatim. Split it out from surrounding prose so each part can be
 * rendered appropriately instead of showing the literal tags as text. */
function splitContentSegments(content: string): Array<{ type: 'text' | 'table'; value: string }> {
  const segments: Array<{ type: 'text' | 'table'; value: string }> = [];
  const tableRe = /<table[\s\S]*?<\/table>/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = tableRe.exec(content)) !== null) {
    if (match.index > lastIndex) segments.push({ type: 'text', value: content.slice(lastIndex, match.index) });
    segments.push({ type: 'table', value: match[0] });
    lastIndex = tableRe.lastIndex;
  }
  if (lastIndex < content.length) segments.push({ type: 'text', value: content.slice(lastIndex) });
  return segments;
}

/** Parse a `<table>` HTML string into plain rows/cells of text. Uses DOMParser
 * to build a detached document (never attached to the page, scripts inert)
 * and reads back only .textContent — never dangerouslySetInnerHTML — so
 * nothing embedded in document content can inject markup into the real DOM. */
function parseHtmlTable(html: string): string[][] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return Array.from(doc.querySelectorAll('tr')).map((row) =>
    Array.from(row.querySelectorAll('td, th')).map((cell) => cell.textContent?.trim() ?? ''),
  );
}

/** Flatten sections into an editable plain-text form: "## Heading\nBody\n\n## Heading\nBody" */
function sectionsToText(sections: GeneratedDocSection[]): string {
  return sections.map((s) => `## ${s.heading}\n${s.content}`).join('\n\n');
}

/** Parse the flattened edit form back into sections. Lines starting with "## " begin a new
 * section; everything else is appended to the current section's body. */
function textToSections(text: string): GeneratedDocSection[] {
  const lines = text.split('\n');
  const sections: GeneratedDocSection[] = [];
  let current: GeneratedDocSection | null = null;

  for (const line of lines) {
    const headingMatch = /^##\s+(.*)$/.exec(line);
    if (headingMatch) {
      if (current) sections.push(current);
      current = { heading: headingMatch[1].trim(), content: '' };
    } else if (current) {
      current.content += (current.content ? '\n' : '') + line;
    } else if (line.trim()) {
      current = { heading: '', content: line };
    }
  }
  if (current) sections.push(current);
  return sections.map((s) => ({ ...s, content: s.content.trim() })).filter((s) => s.heading || s.content);
}

export function DocumentPreview({ generated, workflowId, onSubmit, onExport }: DocumentPreviewProps) {
  const parsed = parseContentJson(generated.content_json);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(() => sectionsToText(parsed.sections));
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displaySections = editing ? textToSections(editContent) : parsed.sections;

  const handleSave = async () => {
    if (!workflowId) return;
    setSaving(true);
    setError(null);
    try {
      const contentJson = JSON.stringify({
        title: parsed.title ?? generated.title,
        reference_number: parsed.reference_number,
        sections: textToSections(editContent),
      });
      await workflowService.updateDraft(workflowId, contentJson);
      setEditing(false);
    } catch {
      setError('Failed to save changes. Please try again.');
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
          <h2 className="font-bold text-lg text-gray-800">{parsed.title ?? generated.title}</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-gray-500">
              {generated.doc_type}
              {' · '}
              {generated.template_id ? 'Formatted from uploaded template' : 'AI default format'}
              {parsed.reference_number && <> · Ref: {parsed.reference_number}</>}
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
                  setEditContent(sectionsToText(parsed.sections));
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
        {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
        {editing ? (
          <>
            <p className="text-xs text-gray-400 mb-2">
              Sections start with a line like <code className="bg-gray-100 px-1 rounded">## Heading</code>.
            </p>
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full h-96 text-sm font-mono border border-gray-200 rounded-lg p-4 outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </>
        ) : displaySections.length === 0 ? (
          <p className="text-sm text-gray-400">This document has no content yet.</p>
        ) : (
          <div className="space-y-5">
            {displaySections.map((section, i) => (
              <div key={i}>
                {section.heading && (
                  <h3 className="font-bold text-gray-800 text-base mb-2 pb-1 border-b border-gray-100">
                    {section.heading}
                  </h3>
                )}
                {splitContentSegments(section.content).map((seg, j) =>
                  seg.type === 'table' ? (
                    <div key={j} className="overflow-x-auto my-2">
                      <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                        <tbody>
                          {parseHtmlTable(seg.value).map((row, ri) => (
                            <tr key={ri} className={ri === 0 ? 'bg-gray-50 font-medium' : 'border-t border-gray-100'}>
                              {row.map((cell, ci) => (
                                <td key={ci} className="px-3 py-2 align-top">{cell}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    seg.value.trim() && (
                      <p key={j} className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                        {seg.value.trim()}
                      </p>
                    )
                  ),
                )}
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
