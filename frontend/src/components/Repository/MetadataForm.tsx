import type { Confidentiality, UploadMetadata } from '../../types';

interface MetadataFormProps {
  value: UploadMetadata;
  onChange: (value: UploadMetadata) => void;
}

const DOC_TYPES = [
  { value: 'PROPOSAL', label: 'Proposal' },
  { value: 'MOU', label: 'MOU' },
  { value: 'AGREEMENT', label: 'Agreement' },
  { value: 'WORK_ORDER', label: 'Work Order' },
  { value: 'POLICY', label: 'Policy' },
  { value: 'OTHER', label: 'Other' },
];

const CONFIDENTIALITY_LEVELS: { value: Confidentiality; label: string }[] = [
  { value: 'PUBLIC', label: 'Public' },
  { value: 'INTERNAL', label: 'Internal' },
  { value: 'RESTRICTED', label: 'Restricted' },
  { value: 'CONFIDENTIAL', label: 'Confidential' },
];

export function MetadataForm({ value, onChange }: MetadataFormProps) {
  const update = (patch: Partial<UploadMetadata>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Document Type *</label>
        <select
          value={value.doc_type}
          onChange={(e) => update({ doc_type: e.target.value })}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">Select type…</option>
          {DOC_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Confidentiality *
        </label>
        <select
          value={value.confidentiality}
          onChange={(e) => update({ confidentiality: e.target.value as Confidentiality })}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">Select level…</option>
          {CONFIDENTIALITY_LEVELS.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Division</label>
        <input
          type="text"
          value={value.division ?? ''}
          onChange={(e) => update({ division: e.target.value })}
          placeholder="e.g. Technology, Finance"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Project</label>
        <input
          type="text"
          value={value.project ?? ''}
          onChange={(e) => update({ project: e.target.value })}
          placeholder="Project name or reference"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Tags <span className="text-gray-400">(comma-separated)</span>
        </label>
        <input
          type="text"
          value={value.tags ?? ''}
          onChange={(e) => update({ tags: e.target.value })}
          placeholder="e.g. contract, 2024, vendor"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </div>
  );
}
