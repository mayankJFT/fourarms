import { Loader2, Upload, X } from 'lucide-react';
import { useState } from 'react';
import type { Confidentiality, UploadMetadata } from '../../types';

const DOC_TYPES = ['PROPOSAL', 'MOU', 'AGREEMENT', 'WORK_ORDER'];
const CONFIDENTIALITIES: Confidentiality[] = ['PUBLIC', 'INTERNAL', 'RESTRICTED', 'CONFIDENTIAL'];

interface Props {
  onClose: () => void;
  onUpload: (file: File, metadata: UploadMetadata) => Promise<void>;
  isUploading: boolean;
}

export function UploadDrawer({ onClose, onUpload, isUploading }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState('PROPOSAL');
  const [confidentiality, setConfidentiality] = useState<Confidentiality>('INTERNAL');
  const [division, setDivision] = useState('');
  const [project, setProject] = useState('');
  const [tags, setTags] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const handleSubmit = async () => {
    if (!file) return;
    await onUpload(file, { doc_type: docType, confidentiality, division, project, tags });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="bg-black/40 absolute inset-0" />
      <div
        className="relative bg-white w-full max-w-md h-full flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <Upload size={18} className="text-[#1a56db]" /> Upload Document
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const dropped = e.dataTransfer.files[0];
              if (dropped) setFile(dropped);
            }}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              isDragging ? 'border-[#1a56db] bg-blue-50' : 'border-slate-300 hover:border-[#1a56db]'
            }`}
            onClick={() => document.getElementById('repo-file-input')?.click()}
          >
            <Upload size={28} className="mx-auto text-slate-400 mb-3" />
            {file ? (
              <div>
                <p className="text-sm font-medium text-slate-800">{file.name}</p>
                <p className="text-xs text-slate-400 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            ) : (
              <div>
                <p className="text-sm font-medium text-slate-700">Drop file here or click to browse</p>
                <p className="text-xs text-slate-400 mt-1">PDF, DOCX, TXT, XLSX up to 50MB</p>
              </div>
            )}
            <input
              id="repo-file-input"
              type="file"
              className="hidden"
              accept=".pdf,.docx,.doc,.txt,.xlsx,.xls,.csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Document Type *</label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#1a56db] bg-white text-slate-800"
              >
                {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Confidentiality *</label>
              <select
                value={confidentiality}
                onChange={(e) => setConfidentiality(e.target.value as Confidentiality)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#1a56db] bg-white text-slate-800"
              >
                {CONFIDENTIALITIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Division</label>
            <input
              type="text"
              value={division}
              onChange={(e) => setDivision(e.target.value)}
              placeholder="e.g. Quality Standards"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#1a56db] text-slate-800"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Project</label>
            <input
              type="text"
              value={project}
              onChange={(e) => setProject(e.target.value)}
              placeholder="e.g. QCI/0826/550"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#1a56db] text-slate-800"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Tags (comma-separated)</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g. tender, certification, audit"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#1a56db] text-slate-800"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-medium border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={!file || isUploading}
            className="flex-1 px-4 py-2 text-sm font-medium bg-[#1a56db] text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {isUploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            Upload
          </button>
        </div>
      </div>
    </div>
  );
}
