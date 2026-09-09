import { Loader2, Mic, MicOff, Send } from 'lucide-react';
import { useRef, useState } from 'react';
import { transcribeAudio } from '../../services/ai';

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  disabled?: boolean;
}

type RecordingState = 'idle' | 'recording' | 'transcribing';

export function ChatInput({ onSend, isLoading, disabled }: ChatInputProps) {
  const [value, setValue] = useState('');
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || isLoading || disabled) return;
    onSend(trimmed);
    setValue('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const ta = e.target;
    ta.style.height = 'auto';
    const lineHeight = 24;
    const maxHeight = lineHeight * 4 + 24;
    ta.style.height = Math.min(ta.scrollHeight, maxHeight) + 'px';
  };

  const startRecording = async () => {
    setVoiceError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecordingState('transcribing');
        try {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          const result = await transcribeAudio(blob, 'recording.webm');
          if (result.transcript) {
            setValue((prev) => prev ? `${prev} ${result.transcript}` : result.transcript);
            textareaRef.current?.focus();
          } else {
            setVoiceError('No speech detected. Please try again.');
          }
        } catch {
          setVoiceError('Transcription failed. Check your Deepgram API key.');
        } finally {
          setRecordingState('idle');
        }
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecordingState('recording');
    } catch {
      setVoiceError('Microphone access denied.');
      setRecordingState('idle');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
  };

  const handleMicClick = () => {
    if (recordingState === 'recording') stopRecording();
    else if (recordingState === 'idle') startRecording();
  };

  const micBusy = recordingState !== 'idle';

  return (
    <div className="flex flex-col gap-1">
      {voiceError && (
        <p className="text-xs text-red-500 px-1">{voiceError}</p>
      )}
      <div className="flex items-end gap-2 bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
        {/* Mic button — Deepgram voice input */}
        <button
          onClick={handleMicClick}
          disabled={recordingState === 'transcribing' || isLoading || disabled}
          title={recordingState === 'recording' ? 'Stop recording' : 'Record voice (EN / HI / Hinglish)'}
          className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed
            ${recordingState === 'recording'
              ? 'bg-red-500 text-white hover:bg-red-600 animate-pulse'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          {recordingState === 'transcribing'
            ? <Loader2 size={16} className="animate-spin" />
            : recordingState === 'recording'
            ? <MicOff size={16} />
            : <Mic size={16} />}
        </button>

        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={micBusy ? 'Listening…' : 'Ask a question… (Ctrl+Enter to send)'}
          disabled={isLoading || disabled || micBusy}
          rows={1}
          className="flex-1 resize-none outline-none text-sm text-gray-800 placeholder-gray-400 leading-6 max-h-[120px] overflow-y-auto disabled:opacity-50"
          style={{ height: '38px' }}
        />

        <button
          onClick={handleSend}
          disabled={!value.trim() || isLoading || disabled || micBusy}
          className="flex-shrink-0 w-9 h-9 rounded-lg bg-blue-800 text-white flex items-center justify-center hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="Send (Ctrl+Enter)"
        >
          {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
    </div>
  );
}
