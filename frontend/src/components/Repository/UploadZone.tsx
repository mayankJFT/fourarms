import { CloudUpload, File, Loader2, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import type { UploadMetadata } from '../../types';
import { MetadataForm } from './MetadataForm';

interface QueuedFile {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
}

interface UploadZoneProps {
  onUpload: (file: File, metadata: UploadMetadata) => Promise<void>;
  isUploading?: boolean;
}

const DEFAULT_METADATA: UploadMetadata = {
  confidentiality: 'INTERNAL',
  division: '',
  project: '',
  tags: '',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadZone({ onUpload }: UploadZoneProps) {
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [metadata, setMetadata] = useState<UploadMetadata>(DEFAULT_METADATA);
  const [isUploading, setIsUploading] = useState(false);

  const onDrop = useCallback((accepted: File[]) => {
    const newFiles = accepted.map((f) => ({
      file: f,
      progress: 0,
      status: 'pending' as const,
    }));
    setQueue((prev) => [...prev, ...newFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxSize: 200 * 1024 * 1024, // 200 MB
    accept: {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    },
  });

  const removeFile = (index: number) => {
    setQueue((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUploadAll = async () => {
    if (!metadata.confidentiality) {
      alert('Please select a Confidentiality level before uploading.');
      return;
    }

    setIsUploading(true);
    for (let i = 0; i < queue.length; i++) {
      if (queue[i].status !== 'pending') continue;
      setQueue((prev) =>
        prev.map((f, idx) => (idx === i ? { ...f, status: 'uploading' } : f)),
      );
      try {
        await onUpload(queue[i].file, metadata);
        setQueue((prev) =>
          prev.map((f, idx) =>
            idx === i ? { ...f, status: 'done', progress: 100 } : f,
          ),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed';
        setQueue((prev) =>
          prev.map((f, idx) =>
            idx === i ? { ...f, status: 'error', error: msg } : f,
          ),
        );
      }
    }
    setIsUploading(false);
    // Clear done files after 2 s
    setTimeout(() => {
      setQueue((prev) => prev.filter((f) => f.status !== 'done'));
    }, 2000);
  };

  const pendingCount = queue.filter((f) => f.status === 'pending').length;

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
          isDragActive
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
        }`}
      >
        <input {...getInputProps()} />
        <CloudUpload
          size={32}
          className={`mx-auto mb-3 ${isDragActive ? 'text-blue-500' : 'text-gray-400'}`}
        />
        <p className="text-sm font-medium text-gray-700">
          {isDragActive ? 'Drop files here' : 'Drop files here or click to browse'}
        </p>
        <p className="text-xs text-gray-400 mt-1">PDF, DOC, DOCX, TXT, XLS, XLSX — max 200 MB</p>
      </div>

      {/* File queue */}
      {queue.length > 0 && (
        <div className="space-y-2">
          {queue.map((item, i) => (
            <div
              key={`${item.file.name}-${i}`}
              className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2 text-sm"
            >
              <File size={16} className="text-gray-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="truncate text-gray-700 font-medium">{item.file.name}</div>
                <div className="text-xs text-gray-400">{formatBytes(item.file.size)}</div>
                {item.status === 'uploading' && (
                  <div className="mt-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full transition-all"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                )}
                {item.status === 'error' && (
                  <div className="text-xs text-red-500 mt-0.5">{item.error}</div>
                )}
              </div>
              {item.status === 'uploading' && (
                <Loader2 size={14} className="animate-spin text-blue-600" />
              )}
              {item.status === 'done' && (
                <span className="text-xs text-green-600 font-medium">Done</span>
              )}
              {(item.status === 'pending' || item.status === 'error') && (
                <button
                  onClick={() => removeFile(i)}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Metadata form */}
      <div className="border-t border-gray-100 pt-4">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">Document Metadata</h4>
        <MetadataForm value={metadata} onChange={setMetadata} />
      </div>

      {/* Upload button */}
      {pendingCount > 0 && (
        <button
          onClick={() => void handleUploadAll()}
          disabled={isUploading}
          className="w-full py-2.5 bg-blue-800 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          {isUploading ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Uploading…
            </>
          ) : (
            <>
              <CloudUpload size={16} /> Upload {pendingCount} file{pendingCount > 1 ? 's' : ''}
            </>
          )}
        </button>
      )}
    </div>
  );
}
