import { CheckCircle, ChevronLeft } from 'lucide-react';
import { useState } from 'react';
import { DocumentPreview } from '../components/DocGen/DocumentPreview';
import { GeneratorForm } from '../components/DocGen/GeneratorForm';
import { TemplateSelector, type TemplateSelection } from '../components/DocGen/TemplateSelector';
import { ReviewPanel } from '../components/Workflow/ReviewPanel';
import { AppLayout } from '../components/Layout/AppLayout';
import { useAuth } from '../hooks/useAuth';
import * as aiService from '../services/ai';
import type { GenerateResponse } from '../services/ai';
import * as workflowService from '../services/workflow';
import type { GeneratedDocument } from '../types';

type Step = 1 | 2 | 3;

const STEP_LABELS = ['Select Template', 'Fill Details', 'Review & Export'];

function StepProgress({ current }: { current: Step }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEP_LABELS.map((label, i) => {
        const stepNum = (i + 1) as Step;
        const done = current > stepNum;
        const active = current === stepNum;
        return (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            <div
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                done
                  ? 'text-green-700'
                  : active
                    ? 'text-blue-800'
                    : 'text-gray-400'
              }`}
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  done
                    ? 'bg-green-100 text-green-700'
                    : active
                      ? 'bg-blue-800 text-white'
                      : 'bg-gray-100 text-gray-400'
                }`}
              >
                {done ? <CheckCircle size={14} /> : stepNum}
              </div>
              {label}
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div className={`flex-1 h-px mx-2 ${done ? 'bg-green-200' : 'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function DocGenPage() {
  const { hasAnyRole } = useAuth();
  const isReviewer = hasAnyRole(['SUPER_ADMIN', 'BOARD_ADMIN']);

  const [step, setStep] = useState<Step>(1);
  const [selection, setSelection] = useState<TemplateSelection | null>(null);
  const [generated, setGenerated] = useState<GenerateResponse | null>(null);
  const [workflowDoc, setWorkflowDoc] = useState<GeneratedDocument | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleTemplateSelect = (sel: TemplateSelection) => {
    setSelection(sel);
    setStep(2);
  };

  const handleGenerate = async (inputs: Record<string, string | number>) => {
    if (!selection) return;
    setIsGenerating(true);
    try {
      const result = await aiService.generate(selection.docType, selection.templateVariant, inputs);
      setGenerated(result);

      // Fetch the created workflow doc
      try {
        const wfDoc = await workflowService.getGenerated(result.document_id);
        setWorkflowDoc(wfDoc);
      } catch {
        // workflow doc may not exist yet
      }

      setStep(3);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApprove = async (id: string) => {
    await workflowService.approve(id);
    const updated = await workflowService.getGenerated(id);
    setWorkflowDoc(updated);
  };

  const handleRevise = async (id: string, comment: string) => {
    await workflowService.revise(id, comment);
    const updated = await workflowService.getGenerated(id);
    setWorkflowDoc(updated);
  };

  return (
    <AppLayout title="Generate Documents">
      <div className="max-w-3xl mx-auto">
        <StepProgress current={step} />

        {step > 1 && (
          <button
            onClick={() => setStep((s) => (s - 1) as Step)}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-5 transition-colors"
          >
            <ChevronLeft size={16} /> Back
          </button>
        )}

        {step === 1 && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <h2 className="font-semibold text-gray-800 mb-5">
              Choose a document type and template
            </h2>
            <TemplateSelector onSelect={handleTemplateSelect} />
          </div>
        )}

        {step === 2 && selection && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <h2 className="font-semibold text-gray-800 mb-5">Fill in document details</h2>
            <GeneratorForm
              docType={selection.docType}
              templateVariant={selection.templateVariant}
              onSubmit={handleGenerate}
              isLoading={isGenerating}
            />
          </div>
        )}

        {step === 3 && generated && (
          <div className="space-y-5">
            <DocumentPreview
              generated={generated}
              workflowId={generated.document_id}
              onSubmit={() => {
                if (workflowDoc) setWorkflowDoc({ ...workflowDoc, state: 'REVIEW' });
              }}
            />

            {isReviewer && workflowDoc && (
              <ReviewPanel
                document={workflowDoc}
                onApprove={handleApprove}
                onRevise={handleRevise}
              />
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
