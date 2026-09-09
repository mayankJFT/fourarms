import { Loader2, Wand2 } from 'lucide-react';
import { useState } from 'react';
import type { DocType } from '../../types';

interface GeneratorFormProps {
  docType: DocType;
  templateVariant: number;
  onSubmit: (inputs: Record<string, string | number>) => Promise<void>;
  isLoading: boolean;
}

interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'textarea';
  placeholder?: string;
  required?: boolean;
}

const FIELDS: Record<DocType, FieldDef[]> = {
  PROPOSAL: [
    { key: 'counterparty_name', label: 'Counterparty Name', type: 'text', required: true, placeholder: 'Organisation or individual name' },
    { key: 'scope', label: 'Scope of Work', type: 'textarea', required: true, placeholder: 'Describe the scope in detail…' },
    { key: 'value', label: 'Value (INR)', type: 'number', required: true, placeholder: '5000000' },
    { key: 'start_date', label: 'Start Date', type: 'date', required: true },
    { key: 'duration', label: 'Duration (months)', type: 'number', required: true, placeholder: '12' },
    { key: 'team_size', label: 'Team Size', type: 'number', placeholder: '5' },
  ],
  MOU: [
    { key: 'counterparty_name', label: 'Counterparty Name', type: 'text', required: true, placeholder: 'Organisation name' },
    { key: 'purpose', label: 'Purpose', type: 'textarea', required: true, placeholder: 'Purpose of the MOU…' },
    { key: 'duration', label: 'Duration (months)', type: 'number', required: true, placeholder: '24' },
    { key: 'obligations', label: 'Obligations', type: 'textarea', required: true, placeholder: 'List mutual obligations…' },
  ],
  AGREEMENT: [
    { key: 'counterparty_name', label: 'Counterparty Name', type: 'text', required: true, placeholder: 'Organisation or individual name' },
    { key: 'scope', label: 'Scope of Services', type: 'textarea', required: true, placeholder: 'Describe services…' },
    { key: 'value', label: 'Contract Value (INR)', type: 'number', required: true, placeholder: '10000000' },
    { key: 'term_months', label: 'Term (months)', type: 'number', required: true, placeholder: '12' },
    { key: 'payment_terms', label: 'Payment Terms', type: 'text', required: true, placeholder: 'e.g. Net 30' },
    { key: 'termination_notice_days', label: 'Termination Notice (days)', type: 'number', placeholder: '30' },
  ],
  WORK_ORDER: [
    { key: 'reference_agreement_id', label: 'Reference Agreement ID', type: 'text', required: true, placeholder: 'AGR-2024-001' },
    { key: 'scope', label: 'Scope / Deliverables Summary', type: 'text', required: true, placeholder: 'Brief scope description' },
    { key: 'value', label: 'Work Order Value (INR)', type: 'number', required: true, placeholder: '500000' },
    { key: 'start_date', label: 'Start Date', type: 'date', required: true },
    { key: 'deliverables', label: 'Deliverables', type: 'textarea', required: true, placeholder: 'List all deliverables and milestones…' },
  ],
};

const DOC_TYPE_LABELS: Record<DocType, string> = {
  PROPOSAL: 'Proposal',
  MOU: 'Memorandum of Understanding',
  AGREEMENT: 'Agreement',
  WORK_ORDER: 'Work Order',
};

export function GeneratorForm({ docType, templateVariant, onSubmit, isLoading }: GeneratorFormProps) {
  const fields = FIELDS[docType];
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, ''])),
  );

  const handleChange = (key: string, val: string) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const inputs: Record<string, string | number> = {};
    for (const field of fields) {
      const raw = values[field.key];
      if (field.type === 'number' && raw) {
        inputs[field.key] = parseFloat(raw);
      } else if (raw) {
        inputs[field.key] = raw;
      }
    }
    await onSubmit(inputs);
  };

  return (
    <div>
      <div className="mb-5 p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-700">
        Generating: <strong>{DOC_TYPE_LABELS[docType]}</strong> — Template Variant{' '}
        {templateVariant}
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {fields.map((field) => (
          <div key={field.key}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </label>

            {field.type === 'textarea' ? (
              <textarea
                value={values[field.key]}
                onChange={(e) => handleChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                rows={3}
                required={field.required}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            ) : (
              <input
                type={field.type}
                value={values[field.key]}
                onChange={(e) => handleChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                required={field.required}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
          </div>
        ))}

        <button
          type="submit"
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-2 py-3 bg-blue-800 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors mt-6"
        >
          {isLoading ? (
            <>
              <Loader2 size={18} className="animate-spin" /> Generating…
            </>
          ) : (
            <>
              <Wand2 size={18} /> Generate Document
            </>
          )}
        </button>
      </form>
    </div>
  );
}
