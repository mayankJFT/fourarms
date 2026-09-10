import { BookOpen, CheckCircle, FileCheck, FileText, Hammer, Loader2, Trash2, Upload, UploadCloud } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import * as templatesService from '../../services/templates';
import { useUIStore } from '../../stores/uiStore';
import type { DocType, DocumentTemplate } from '../../types';

export interface TemplateSelection {
  docType: DocType;
  templateVariant: number;
  templateId?: string;
}

interface TemplateSelectorProps {
  onSelect: (selection: TemplateSelection) => void;
}

interface DocTypeInfo {
  type: DocType;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

const DOC_TYPES: DocTypeInfo[] = [
  {
    type: 'PROPOSAL',
    label: 'Proposal',
    description: 'Commercial or project proposals with scope, value, and team details.',
    icon: <FileText size={28} className="text-purple-600" />,
    color: 'border-purple-200 hover:border-purple-400 hover:bg-purple-50',
  },
  {
    type: 'MOU',
    label: 'MOU',
    description: 'Memorandum of Understanding for partnerships and collaborations.',
    icon: <BookOpen size={28} className="text-blue-600" />,
    color: 'border-blue-200 hover:border-blue-400 hover:bg-blue-50',
  },
  {
    type: 'AGREEMENT',
    label: 'Agreement',
    description: 'Formal service or contractual agreements with payment terms.',
    icon: <FileCheck size={28} className="text-green-600" />,
    color: 'border-green-200 hover:border-green-400 hover:bg-green-50',
  },
  {
    type: 'WORK_ORDER',
    label: 'Work Order',
    description: 'Specific delivery work orders referencing a master agreement.',
    icon: <Hammer size={28} className="text-orange-600" />,
    color: 'border-orange-200 hover:border-orange-400 hover:bg-orange-50',
  },
];

function UploadTemplateForm({
  docType,
  onUploaded,
}: {
  docType: DocType;
  onUploaded: (t: DocumentTemplate) => void;
}) {
  const toast = useUIStore((s) => s.toast);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = async () => {
    if (!file) return;
    setIsUploading(true);
    try {
      const template = await templatesService.uploadTemplate(file, docType, title || undefined);
      toast.success(`Template "${template.title}" uploaded — future ${docType.replace('_', ' ').toLowerCase()} generations will mimic its format.`);
      setFile(null);
      setTitle('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      onUploaded(template);
    } catch (err) {
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        ?? 'Could not upload this template — check the file and try again.';
      toast.error(message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="border-2 border-dashed border-gray-300 rounded-xl p-4 bg-gray-50">
      <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-gray-700">
        <UploadCloud size={16} className="text-blue-700" />
        Upload a reference template
      </div>
      <p className="text-xs text-gray-500 mb-3">
        Upload a real {docType.replace('_', ' ').toLowerCase()} (.docx or .pdf) — the AI will reuse its
        section structure, ordering, and tone when generating new documents in this category.
      </p>
      <div className="flex flex-col gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".docx,.pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-xs text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-blue-800 file:text-white file:text-xs file:font-medium hover:file:bg-blue-900 file:cursor-pointer cursor-pointer"
        />
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Display name (optional — defaults to file name)"
          className="text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
        <button
          onClick={handleUpload}
          disabled={!file || isUploading}
          className="flex items-center justify-center gap-2 text-sm font-medium bg-blue-800 text-white rounded-lg py-2 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-900 transition-colors"
        >
          {isUploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
          {isUploading ? 'Uploading…' : 'Upload Template'}
        </button>
      </div>
    </div>
  );
}

function TemplatePicker({
  docType,
  onSelect,
}: {
  docType: DocType;
  onSelect: (selection: TemplateSelection) => void;
}) {
  const { hasAnyRole } = useAuth();
  const toast = useUIStore((s) => s.toast);
  const canManageTemplates = hasAnyRole(['SUPER_ADMIN']);

  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadTemplates = () => {
    setIsLoading(true);
    templatesService
      .listTemplates(docType)
      .then(setTemplates)
      .catch(() => toast.error('Could not load templates for this category.'))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docType]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Delete this template? Documents already generated from it are unaffected.')) return;
    setDeletingId(id);
    try {
      await templatesService.deleteTemplate(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      toast.success('Template deleted.');
    } catch {
      toast.error('Could not delete this template.');
    } finally {
      setDeletingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-gray-400">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {templates.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Choose a template to mimic
          </h3>
          <div className="space-y-3">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => onSelect({ docType, templateVariant: 1, templateId: t.id })}
                className="w-full text-left p-4 border border-gray-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all group relative"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-gray-800 group-hover:text-blue-800 truncate">
                      {t.title}
                    </div>
                    <div className="text-xs text-gray-500 mt-1 truncate">{t.file_name}</div>
                    {t.outline.length > 0 && (
                      <div className="text-xs text-gray-400 mt-1.5 line-clamp-1">
                        {t.outline.slice(0, 4).join(' · ')}
                        {t.outline.length > 4 ? ' · …' : ''}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {canManageTemplates && (
                      <span
                        role="button"
                        onClick={(e) => handleDelete(e, t.id)}
                        className="text-gray-300 hover:text-red-600 transition-colors p-1"
                        title="Delete template"
                      >
                        {deletingId === t.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Trash2 size={14} />
                        )}
                      </span>
                    )}
                    <CheckCircle
                      size={16}
                      className="text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
                    />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-6 px-4 bg-gray-50 rounded-xl border border-gray-200">
          <p className="text-sm text-gray-500">
            No template uploaded yet for this category — generation will use the AI's default format.
          </p>
        </div>
      )}

      <button
        onClick={() => onSelect({ docType, templateVariant: 1 })}
        className="w-full text-left p-3 border border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors"
      >
        Continue without a template (AI default format) →
      </button>

      {canManageTemplates && (
        showUpload ? (
          <UploadTemplateForm
            docType={docType}
            onUploaded={(t) => {
              setTemplates((prev) => [t, ...prev]);
              setShowUpload(false);
            }}
          />
        ) : (
          <button
            onClick={() => setShowUpload(true)}
            className="w-full flex items-center justify-center gap-2 text-sm font-medium text-blue-800 border border-blue-200 rounded-xl py-2.5 hover:bg-blue-50 transition-colors"
          >
            <UploadCloud size={15} /> Upload a New Template
          </button>
        )
      )}
    </div>
  );
}

export function TemplateSelector({ onSelect }: TemplateSelectorProps) {
  const [selectedType, setSelectedType] = useState<DocType | null>(null);

  if (selectedType) {
    const typeInfo = DOC_TYPES.find((d) => d.type === selectedType)!;
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl border border-gray-200">
          <div className="p-2 bg-white rounded-lg shadow-sm">{typeInfo.icon}</div>
          <div>
            <div className="font-semibold text-gray-800">{typeInfo.label}</div>
            <div className="text-sm text-gray-500">{typeInfo.description}</div>
          </div>
          <button
            onClick={() => setSelectedType(null)}
            className="ml-auto text-sm text-blue-700 hover:underline"
          >
            Change
          </button>
        </div>

        <TemplatePicker docType={selectedType} onSelect={onSelect} />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {DOC_TYPES.map((docType) => (
        <button
          key={docType.type}
          onClick={() => setSelectedType(docType.type)}
          className={`text-left p-5 border-2 rounded-xl transition-all ${docType.color} bg-white`}
        >
          <div className="mb-3">{docType.icon}</div>
          <div className="font-semibold text-gray-800 mb-1">{docType.label}</div>
          <div className="text-xs text-gray-500 leading-relaxed">{docType.description}</div>
        </button>
      ))}
    </div>
  );
}
