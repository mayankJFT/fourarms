import { Loader2, Mic, MicOff, Send } from 'lucide-react';
import { useRef, useState } from 'react';
import { transcribeAudio } from '../../services/ai';

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  disabled?: boolean;
}

type RecordingState = 'idle' | 'recording' | 'transcribing';

function VoiceWave() {
  return (
    <span className="flex items-center gap-[3px] h-4">
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="w-[3px] bg-white rounded-full animate-[voiceBar_0.8s_ease-in-out_infinite_alternate]"
          style={{
            animationDelay: `${i * 0.12}s`,
            height: '60%',
          }}
        />
      ))}
    </span>
  );
}

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
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
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
    else if (recordingState === 'idle') void startRecording();
  };

  const isRecording = recordingState === 'recording';
  const isTranscribing = recordingState === 'transcribing';

  return (
    <div className="flex flex-col gap-1.5">
      {voiceError && (
        <p className="text-xs text-red-500 px-1">{voiceError}</p>
      )}

      {/* Recording banner */}
      {isRecording && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
          <span className="flex gap-[3px] items-center h-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className="w-[3px] rounded-full bg-red-500"
                style={{
                  height: `${50 + Math.sin(i) * 30}%`,
                  animation: `voiceBar 0.6s ease-in-out ${i * 0.1}s infinite alternate`,
                }}
              />
            ))}
          </span>
          Recording… tap mic to stop
          <button
            onClick={stopRecording}
            className="ml-auto text-red-600 hover:text-red-800 underline text-xs"
          >
            Stop
          </button>
        </div>
      )}

      {isTranscribing && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 font-medium">
          <Loader2 size={13} className="animate-spin" />
          Transcribing your voice…
        </div>
      )}

      <div className={`flex items-end gap-2 border rounded-xl p-3 shadow-sm transition-colors ${
        isRecording
          ? 'bg-red-50 border-red-300'
          : 'bg-white border-gray-200'
      }`}>
        {/* Mic button */}
        <button
          onClick={handleMicClick}
          disabled={isTranscribing || isLoading || disabled}
          title={isRecording ? 'Stop recording' : 'Record voice (EN / HI / Hinglish)'}
          className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed
            ${isRecording
              ? 'bg-red-500 text-white shadow-[0_0_0_4px_rgba(239,68,68,0.2)]'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          {isTranscribing
            ? <Loader2 size={16} className="animate-spin" />
            : isRecording
            ? <VoiceWave />
            : <Mic size={16} />}
        </button>

        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={isRecording ? 'Listening… speak now' : isTranscribing ? 'Transcribing…' : 'Ask anything… (Ctrl+Enter to send)'}
          disabled={isLoading || disabled || isRecording || isTranscribing}
          rows={1}
          className="flex-1 resize-none outline-none text-sm text-gray-800 placeholder-gray-400 leading-6 max-h-[120px] overflow-y-auto disabled:opacity-50 bg-transparent"
          style={{ height: '38px' }}
        />

        <button
          onClick={handleSend}
          disabled={!value.trim() || isLoading || disabled || isRecording || isTranscribing}
          className="flex-shrink-0 w-9 h-9 rounded-lg bg-[#1a56db] text-white flex items-center justify-center hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="Send (Ctrl+Enter)"
        >
          {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
    </div>
  );
}
