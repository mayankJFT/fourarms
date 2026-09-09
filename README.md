# QCI AI Knowledge Hub — PoC

A full-stack AI-powered document management and knowledge retrieval system for Quality Council of India.

---

## Prerequisites

- Python 3.11+
- Node.js 18+
- A Groq API key (https://console.groq.com)
- A Pinecone API key (https://app.pinecone.io)
- Tesseract OCR installed (`brew install tesseract` on macOS)

---

## Backend Setup

### 1. Navigate to backend directory

```bash
cd /Users/mynkchaudhry/Fourarms/poc/backend
```

### 2. Create and activate a virtual environment

```bash
python3 -m venv venv
source venv/bin/activate
```

### 3. Install Python dependencies

```bash
pip install -r requirements.txt
```

### 4. Create the environment file

Create a file named `.env` in the `backend/` directory:

```env
# JWT
SECRET_KEY=your-super-secret-jwt-key-change-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480

# Groq LLM
GROQ_API_KEY=your-groq-api-key-here

# Pinecone Vector DB
PINECONE_API_KEY=your-pinecone-api-key-here
PINECONE_INDEX_NAME=qci-hub-index

# App
UPLOAD_DIR=uploads
```

> **Note:** You need a valid Groq API key to use the chat and document generation features, and a Pinecone API key for semantic document search. Create a Pinecone index named `qci-hub-index` with dimension 768 (sentence-transformers/all-mpnet-base-v2).

### 5. Run the backend server

```bash
cd /Users/mynkchaudhry/Fourarms/poc/backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The API will be available at: http://localhost:8000

Interactive API docs: http://localhost:8000/docs

---

## Frontend Setup

### 1. Navigate to frontend directory

```bash
cd /Users/mynkchaudhry/Fourarms/poc/frontend
```

### 2. Install Node dependencies

```bash
npm install
```

### 3. Start the development server

```bash
npm run dev
```

The app will be available at: http://localhost:5173

---

## First Login

1. Open http://localhost:5173
2. Click **Register** and create your first account
3. To assign `SUPER_ADMIN` role: after registering, update the role directly in the SQLite database (`backend/qci_hub.db`) using any SQLite browser, then log back in.

---

## Architecture Overview

```
poc/
├── backend/           # FastAPI Python backend
│   ├── app/
│   │   ├── main.py    # App entry point + route mounting
│   │   ├── routers/   # auth, documents, ai, workflow, audit
│   │   ├── models/    # SQLAlchemy ORM models
│   │   └── services/  # LLM (Groq), vector (Pinecone), OCR
│   ├── requirements.txt
│   └── uploads/       # Uploaded files stored here
│
└── frontend/          # React 18 + TypeScript + Vite frontend
    ├── src/
    │   ├── pages/     # LoginPage, DashboardPage, ChatPage, etc.
    │   ├── components/# Layout, Chat, Repository, DocGen, Workflow, Admin
    │   ├── hooks/     # useAuth, useDocuments, useChat, useWorkflow
    │   ├── services/  # axios API clients (auth, documents, ai, workflow)
    │   └── types/     # TypeScript interfaces
    └── package.json
```

---

## Key Features

- **Secure Auth**: JWT-based with role hierarchy (SUPER_ADMIN > BOARD_ADMIN > TENDER_AUTHOR > STANDARD_USER)
- **Document Repository**: Upload, version, OCR-scan, and semantically search documents
- **AI Chat**: RAG-powered Q&A with inline citations and guardrail outcomes
- **Document Generation**: AI-generated proposals, MOUs, agreements, and work orders using Groq LLM
- **Workflow**: Draft → Review → Approved workflow with .docx export
- **Audit Log**: Full audit trail of all user actions
