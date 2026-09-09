import { BookOpen, CheckCircle, FileCheck, FileText, Hammer } from 'lucide-react';
import { useState } from 'react';
import type { DocType } from '../../types';

export interface TemplateSelection {
  docType: DocType;
  templateVariant: number;
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

interface VariantInfo {
  variant: number;
  label: string;
  description: string;
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

const VARIANTS: VariantInfo[] = [
  {
    variant: 1,
    label: 'Template 1 — Standard',
    description: 'Clean, formal language suitable for government and institutional bodies.',
  },
  {
    variant: 2,
    label: 'Template 2 — Detailed',
    description: 'Extended format with additional clauses, schedules, and annexures.',
  },
  {
    variant: 3,
    label: 'Template 3 — Concise',
    description: 'Streamlined single-page format for quick approvals and SME engagements.',
  },
];

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

        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Choose a template variant</h3>
          <div className="space-y-3">
            {VARIANTS.map((v) => (
              <button
                key={v.variant}
                onClick={() => onSelect({ docType: selectedType, templateVariant: v.variant })}
                className="w-full text-left p-4 border border-gray-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all group"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-sm text-gray-800 group-hover:text-blue-800">
                      {v.label}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{v.description}</div>
                  </div>
                  <CheckCircle
                    size={16}
                    className="text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5"
                  />
                </div>
              </button>
            ))}
          </div>
        </div>
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
