export type Role = "SUPER_ADMIN" | "BOARD_ADMIN" | "STANDARD_USER" | "TENDER_AUTHOR";
export type DocState = "DRAFT" | "REVIEW" | "APPROVED";
export type DocType = "PROPOSAL" | "MOU" | "AGREEMENT" | "WORK_ORDER";
export type Confidentiality = "PUBLIC" | "INTERNAL" | "RESTRICTED" | "CONFIDENTIAL";
export type GuardrailOutcome = "OK" | "NO_INFO" | "ACCESS_DENIED" | "INSUFFICIENT_CONTEXT" | "OUT_OF_SCOPE";

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: Role;
  division?: string;
  is_active: boolean;
}

export interface Document {
  id: string;
  title: string;
  file_name: string;
  file_type: string;
  doc_type: string | null;
  confidentiality: Confidentiality;
  uploader_id: number;
  division?: string;
  project?: string;
  is_indexed: boolean;
  is_scanned: boolean;
  page_count: number;
  current_version: number;
  created_at: string;
  tags: string[];
  ai_abstract?: string;
  file_size_bytes: number;
  ai_detected_type?: string | null;
  category_confirmed: boolean;
  ingestion_error?: string | null;
}

export interface DocumentShare {
  id: number;
  document_id: string;
  shared_with_user_id: number;
  shared_with_email: string;
  shared_by_user_id: number;
  created_at: string;
}

/** The fixed category buckets the AI classifier maps documents onto. Keep in sync with
 * backend/app/documents/classifier.py:DOCUMENT_CATEGORIES. */
export const DOCUMENT_CATEGORIES = [
  'Internal',
  'External',
  'Confidential',
  'Legal',
  'Financial',
  'HR',
  'Technical',
  'Other',
] as const;

export interface Chunk {
  id: string;
  document_id: string;
  chunk_index: number;
  text: string;
  page_number: number | null;
  section_title: string | null;
  token_count: number;
  created_at: string;
}

export interface DocumentVersion {
  id: number;
  document_id: string;
  version_number: number;
  file_path: string;
  changed_by: number;
  created_at: string;
  change_note?: string;
}

export interface Citation {
  chunk_id: string;
  document_id: string;
  document_title: string;
  page_number?: number;
  section_title?: string;
  passage: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  timestamp: string;
  guardrail_outcome?: GuardrailOutcome;
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  user_id: number;
  user_email?: string | null; // populated only when a SUPER_ADMIN is viewing another user's chat
}

export interface GeneratedDocSection {
  heading: string;
  content: string;
}

// The backend stores generated document body as a JSON string (content_json):
// {title, reference_number, sections: [{heading, content}]}. It is not a flat
// markdown/plain-text field — parse it before rendering.
export interface GeneratedDocument {
  id: string;
  title: string;
  doc_type: DocType;
  template_variant: number;
  template_id?: string | null;
  state: DocState;
  owner_id: number;
  created_at: string;
  updated_at: string;
  content_json: string;
}

// A user-uploaded reference document (per DocType category) whose structure the
// AI mimics when generating a new document of that type.
export interface DocumentTemplate {
  id: string;
  doc_type: DocType;
  title: string;
  file_name: string;
  file_type: string;
  outline: string[];
  uploaded_by: number;
  created_at: string;
}

export interface WorkflowDoc {
  id: string;
  title: string;
  doc_type: DocType;
  template_variant: number;
  state: 'DRAFT' | 'REVIEW' | 'APPROVED';
  owner_id: number;
  created_at: string;
  updated_at: string;
  content_json: string;
}

export interface WorkflowEvent {
  id: number;
  from_state: string | null;
  to_state: string;
  triggered_by: number;
  comment?: string;
  timestamp: string;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  full_name: string;
  role: Role;
  division?: string;
}

export interface AuditEntry {
  id: number;
  user_email: string;
  action: string;
  resource_type?: string;
  resource_id?: string;
  detail?: Record<string, unknown>;
  timestamp: string;
}

export interface HRRecord {
  id: number;
  employee_id: string;
  name: string;
  qualifications: string;
  years_experience: number;
  current_bandwidth_pct: number;
  location?: string;
  availability_date?: string;
  ingested_at: string;
  ingested_by: number;
}

export interface DocumentFilters {
  query?: string;
  doc_type?: string[];
  confidentiality?: Confidentiality[];
  indexed_only?: boolean;
  division?: string;
  project?: string;
}

export interface UploadMetadata {
  confidentiality: Confidentiality;
  division?: string;
  project?: string;
  tags?: string;
}

export interface HealthInfo {
  status: string;
  db?: string;
  pinecone?: string;
  pinecone_index?: string;
  vector_db_status?: string;
  vector_count?: number;
  model?: string;
  api_version?: string;
  timestamp?: string;
}

export interface TokenPayload {
  sub: string;
  user_id: number;
  email: string;
  full_name: string;
  role: Role;
  division?: string;
  exp: number;
}
