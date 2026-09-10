import { Loader2, Pencil, X } from 'lucide-react';
import { useState } from 'react';
import * as documentsService from '../../services/documents';
import type { Confidentiality, Document } from '../../types';

const CONFIDENTIALITIES: Confidentiality[] = ['PUBLIC', 'INTERNAL', 'RESTRICTED', 'CONFIDENTIAL'];

interface Props {
  doc: Document;
  onClose: () => void;
  onSaved: (updated: Document) => void;
}

export function EditMetadataModal({ doc, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(doc.title);
  const [division, setDivision] = useState(doc.division ?? '');
  const [project, setProject] = useState(doc.project ?? '');
  const [confidentiality, setConfidentiality] = useState<Confidentiality>(doc.confidentiality);
  const [tags, setTags] = useState((doc.tags ?? []).join(', '));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!title.trim()) {
      setError('Title cannot be empty.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await documentsService.editDocument(doc.id, {
        title: title.trim(),
        division: division.trim(),
        project: project.trim(),
        confidentiality,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      });
      onSaved(updated);
      onClose();
    } catch {
      setError('Failed to save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <Pencil size={16} className="text-[#1a56db]" /> Edit document
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#1a56db]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Division</label>
              <input
                type="text"
                value={division}
                onChange={(e) => setDivision(e.target.value)}
                placeholder="e.g. Quality Standards"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#1a56db]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Confidentiality</label>
              <select
                value={confidentiality}
                onChange={(e) => setConfidentiality(e.target.value as Confidentiality)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#1a56db] bg-white"
              >
                {CONFIDENTIALITIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Project</label>
            <input
              type="text"
              value={project}
              onChange={(e) => setProject(e.target.value)}
              placeholder="e.g. QCI/0826/550"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#1a56db]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Tags (comma-separated)</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g. tender, certification, audit"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#1a56db]"
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-medium border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="flex-1 px-4 py-2 text-sm font-medium bg-[#1a56db] text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
