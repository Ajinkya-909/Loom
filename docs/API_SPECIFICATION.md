# API SPECIFICATION: LOOM

> **Status:** Finalized & Approved  
> **Base URL:** `/api` (Backend on `:4000`, proxied in production/dev)  
> **Authentication:**  
> - **Extension:** `Authorization: Bearer <API_TOKEN>`  
> - **Web App:** Direct same-origin or localhost access (token optional in local single-tenant mode)  
> **Format:** JSON requests/responses (except multipart uploads and binary stream downloads)  
> **Error Envelope:**  
> ```json
> {
>   "error": {
>     "code": "VALIDATION_ERROR" | "NOT_FOUND" | "UNAUTHORIZED" | "INTERNAL_ERROR",
>     "message": "Human readable error description",
>     "details": {}
>   }
> }
> ```

---

## 1. System & Runtime Configuration

### 1.1 Health & Connectivity Probe
* **Endpoint:** `GET /health`
* **Purpose:** Probes backend server availability, process liveness, and PostgreSQL connectivity. Used by Docker healthchecks and monitoring.
* **Authentication:** None
* **Query Parameters:**
  * `deep` (`boolean`, optional): If `1` or `true`, executes a probe query (`SELECT 1`) on the database.
* **Success Response (`200 OK`):**
  ```json
  {
    "status": "ok",
    "timestamp": "2026-10-22T21:15:00.000Z",
    "uptimeSeconds": 142.5,
    "database": {
      "connected": true,
      "latencyMs": 4
    }
  }
  ```

---

### 1.2 Runtime Configuration & Extension Ping
* **Endpoint:** `GET /api/config`
* **Purpose:** Returns public runtime settings and feature availability. The extension calls this upon popup open to test connectivity, verify the pairing token, and check if local Gemma or Gemini fallback is active.
* **Authentication:** Optional `Authorization: Bearer <API_TOKEN>`
* **Success Response (`200 OK`):**
  ```json
  {
    "version": "1.0.0",
    "authorized": true,
    "llm": {
      "provider": "GEMMA_LOCAL" | "GEMINI_FALLBACK" | "NONE",
      "model": "gemma-2b-it",
      "available": true
    },
    "supportedPlatforms": [
      "CHATGPT",
      "CLAUDE",
      "GEMINI",
      "DEEPSEEK",
      "PERPLEXITY",
      "GENERIC"
    ],
    "limits": {
      "maxPayloadMb": 50,
      "maxMessageCount": 500
    }
  }
  ```

---

## 2. Ingestion & Normalization

### 2.1 Ingest Chat Capture
* **Endpoint:** `POST /api/captures`
* **Purpose:** Primary entry point for captured conversations. Receives the raw HTML snapshot, extracted message payloads, metadata, and rescued binary assets from the Chrome extension. Stores raw data, dedupes against existing captures, and kicks off normalization to generate `context.md` (and optionally `summary.md`).
* **Authentication:** Required `Authorization: Bearer <API_TOKEN>`
* **Content-Type:** `multipart/form-data`
* **Request Multipart Fields:**

| Field Name | Type | Description |
|---|---|---|
| `meta` | `text (JSON string)` | Capture metadata: platform, source URL, title, capture mode, expected counts. |
| `messages` | `text (JSON string)` | Array of raw message objects extracted by content script. |
| `snapshot` | `file (text/html)` | Full DOM snapshot of the chat page (safety net backup). |
| `assets` | `file[] (binary)` | One or more binary files (images/diagrams) rescued from the chat. |

#### Example `meta` JSON payload:
```json
{
  "platform": "CHATGPT",
  "sourceUrl": "https://chatgpt.com/c/6789-abcd-1234",
  "title": "Refactoring Auth Middleware",
  "mode": "CONTEXT_ONLY", // Options: "CONTEXT_ONLY" | "SUMMARIZE"
  "stats": {
    "expectedMessages": 14,
    "expectedCodeBlocks": 5,
    "expectedImages": 2
  }
}
```

#### Example `messages` JSON payload:
```json
[
  {
    "idx": 0,
    "role": "USER",
    "text": "How do I implement JWT middleware in Express with TypeScript?",
    "html": "<p>How do I implement JWT middleware in Express with TypeScript?</p>"
  },
  {
    "idx": 1,
    "role": "ASSISTANT",
    "text": "Here is the complete implementation...",
    "html": "<div><p>Here is the complete implementation...</p><pre><code class=\"language-typescript\">...</code></pre></div>"
  }
]
```

* **Internal Processing Lifecycle:**
  1. **Token Verification:** Validates the bearer token against `.env` `API_TOKEN`.
  2. **Hash & Deduplication:** Computes SHA-256 `contentHash` over the ordered plain text of all messages.
  3. **Chat Entity Resolution:** Checks if a `Chat` exists matching `(sourceUrl, platform)`. If not, creates a new `Chat`.
  4. **Deduplication Check:** If the latest version of this chat has the exact same `contentHash`, returns existing capture info with `"duplicate": true` (skips duplicate processing).
  5. **Version Incrementation:** Determines `version = currentMaxVersion + 1`.
  6. **Storage Directory Preparation:** Creates `storage/captures/<chatId>/v<version>/raw/` and `storage/captures/<chatId>/v<version>/assets/`.
  7. **Raw File Ingestion:** Saves `snapshot.html` and `messages.json` to the `raw/` folder. Writes uploaded binary assets to `assets/`.
  8. **Database Records Creation:**
     * Creates a `Job` record with `type: INGEST_AND_NORMALIZE`, `status: RUNNING`, `progress: 0.1`.
     * Creates a `Capture` record with `version`, `contentHash`, `status: PROCESSING`, and `rawPath`.
  9. **Asynchronous Normalization Execution:**
     * Parses messages into structured `blocks` (code blocks with detected language, paragraphs, tables, diagram blocks).
     * Inserts `Message` records.
     * Inserts `Asset` records, rewriting message image references to local `/api/assets/<assetId>` endpoints.
     * **Compiles `context.md`:** Generates clean canonical request-response markdown, writes it to `storage/captures/<chatId>/v<version>/context.md`, and creates an `Output` record with `kind: CONTEXT`.
     * **Conditional Distillation:** If `meta.mode === "SUMMARIZE"`, pipes `context.md` into Gemma (or Gemini fallback), compiles `summary.md`, writes it to disk, and creates an `Output` record with `kind: SUMMARY`.
     * Updates `Job` (`status: COMPLETED`, `progress: 1.0`) and `Capture` (`status: READY`).

* **Success Response (`202 Accepted`):**
  ```json
  {
    "chatId": "e3b0c442-98fc-4b8c-8f92-5d9c2a1e0b5f",
    "captureId": "c7a8b9d0-12e3-4f5a-6b7c-8d9e0f1a2b3c",
    "version": 1,
    "jobId": "f1e2d3c4-5b6a-7c8d-9e0f-1a2b3c4d5e6f",
    "status": "PROCESSING",
    "viewerUrl": "/c/c7a8b9d0-12e3-4f5a-6b7c-8d9e0f1a2b3c",
    "duplicate": false
  }
  ```

---

## 3. Library & Chat Inspection

### 3.1 List Saved Chats (Library & Search)
* **Endpoint:** `GET /api/captures`
* **Purpose:** Supplies the Left Sidebar in the web dashboard with the list of saved chats, latest version metadata, and full-text search.
* **Authentication:** None (or Bearer token)
* **Query Parameters:**
  * `q` (`string`, optional): Search query matching chat titles or message content.
  * `platform` (`enum`, optional): Filter by `CHATGPT`, `CLAUDE`, `GEMINI`, etc.
  * `limit` (`integer`, default: `20`, max: `100`): Pagination limit.
  * `cursor` (`string`, optional): Cursor ID for pagination.
* **Success Response (`200 OK`):**
  ```json
  {
    "items": [
      {
        "chatId": "e3b0c442-98fc-4b8c-8f92-5d9c2a1e0b5f",
        "captureId": "c7a8b9d0-12e3-4f5a-6b7c-8d9e0f1a2b3c",
        "title": "Refactoring Auth Middleware",
        "platform": "CHATGPT",
        "version": 1,
        "status": "READY",
        "messageCount": 14,
        "tokenEstimate": 3400,
        "hasSummary": true,
        "updatedAt": "2026-10-22T21:18:00.000Z"
      }
    ],
    "nextCursor": null
  }
  ```

---

### 3.2 Get Capture Overview
* **Endpoint:** `GET /api/captures/:id`
* **Purpose:** Returns complete metadata for a capture snapshot: parent chat info, version history, fidelity stats, and available outputs (`context.md`, `summary.md`).
* **Authentication:** None
* **URL Parameters:**
  * `id` (`UUID`): Capture ID.
* **Success Response (`200 OK`):**
  ```json
  {
    "id": "c7a8b9d0-12e3-4f5a-6b7c-8d9e0f1a2b3c",
    "chatId": "e3b0c442-98fc-4b8c-8f92-5d9c2a1e0b5f",
    "title": "Refactoring Auth Middleware",
    "platform": "CHATGPT",
    "sourceUrl": "https://chatgpt.com/c/6789-abcd-1234",
    "version": 1,
    "status": "READY",
    "stats": {
      "messageCount": 14,
      "codeBlockCount": 5,
      "tokenEstimate": 3400
    },
    "versions": [
      {
        "captureId": "c7a8b9d0-12e3-4f5a-6b7c-8d9e0f1a2b3c",
        "version": 1,
        "createdAt": "2026-10-22T21:18:00.000Z"
      }
    ],
    "outputs": [
      {
        "id": "out-context-uuid",
        "kind": "CONTEXT",
        "createdAt": "2026-10-22T21:18:05.000Z"
      },
      {
        "id": "out-summary-uuid",
        "kind": "SUMMARY",
        "createdAt": "2026-10-22T21:18:15.000Z"
      }
    ],
    "assets": [
      {
        "id": "ast-1-uuid",
        "mime": "image/png",
        "localPath": "assets/diagram_0.png"
      }
    ]
  }
  ```

---

### 3.3 Get Structured Transcript (Messages & Blocks)
* **Endpoint:** `GET /api/captures/:id/messages`
* **Purpose:** Returns the chronological request-response message transcript with typed blocks (text, code, tables, diagrams).
* **Authentication:** None
* **URL Parameters:**
  * `id` (`UUID`): Capture ID.
* **Success Response (`200 OK`):**
  ```json
  {
    "items": [
      {
        "id": "msg-0-uuid",
        "idx": 0,
        "role": "USER",
        "textPlain": "How do I implement JWT middleware in Express with TypeScript?",
        "blocks": [
          {
            "type": "text",
            "content": "How do I implement JWT middleware in Express with TypeScript?"
          }
        ],
        "tokenEstimate": 15
      },
      {
        "id": "msg-1-uuid",
        "idx": 1,
        "role": "ASSISTANT",
        "textPlain": "Here is the complete implementation...",
        "blocks": [
          {
            "type": "text",
            "content": "Here is the complete implementation:"
          },
          {
            "type": "code",
            "lang": "typescript",
            "content": "import { Request, Response, NextFunction } from 'express';\n\nexport const authMiddleware = ...;"
          }
        ],
        "tokenEstimate": 250
      }
    ]
  }
  ```

---

## 4. Distillation & Outputs

### 4.1 On-Demand Summary Generation
* **Endpoint:** `POST /api/captures/:id/generate`
* **Purpose:** Generates `summary.md` on demand for captures that were originally ingested as "Context Only" (or triggers a regeneration if requested).
* **Authentication:** None (or Bearer token)
* **URL Parameters:**
  * `id` (`UUID`): Capture ID.
* **Request Body (JSON):**
  ```json
  {
    "kind": "SUMMARY",
    "regenerate": false
  }
  ```
* **Internal Processing:**
  1. Checks if `Output(kind: SUMMARY)` already exists for this capture.
  2. If found and `regenerate: false`, returns `200 OK` with the existing output ID.
  3. Otherwise, creates a `Job` with `type: SUMMARIZE`, `status: RUNNING`.
  4. Reads the capture's `context.md` from disk and prompts Gemma (or Gemini fallback).
  5. Writes `summary.md` to `storage/captures/<chatId>/v<version>/summary.md`.
  6. Upserts the `Output` record with `kind: SUMMARY`.
  7. Marks `Job` as `COMPLETED`.
* **Success Response (`202 Accepted`):**
  ```json
  {
    "jobId": "f1e2d3c4-5b6a-7c8d-9e0f-1a2b3c4d5e6f",
    "outputId": "out-summary-uuid",
    "status": "COMPLETED"
  }
  ```

---

### 4.2 Get Markdown Output
* **Endpoint:** `GET /api/outputs/:id`
* **Purpose:** Fetches a specific generated markdown deliverable (`context.md` or `summary.md`) for the center reading view.
* **Authentication:** None
* **URL Parameters:**
  * `id` (`UUID`): Output ID.
* **Query Parameters:**
  * `format` (`string`, optional): If `raw`, returns response as `text/markdown` directly instead of JSON.
* **Success Response (`200 OK` - JSON default):**
  ```json
  {
    "id": "out-summary-uuid",
    "captureId": "c7a8b9d0-12e3-4f5a-6b7c-8d9e0f1a2b3c",
    "kind": "SUMMARY",
    "markdown": "# Summary & Context Analysis: Refactoring Auth Middleware\n\n## 1. Objective & Intent\n...",
    "generatedBy": {
      "model": "gemma-2b-it",
      "version": "1.0"
    },
    "createdAt": "2026-10-22T21:18:15.000Z"
  }
  ```

---

## 5. Assets & Exports

### 5.1 Stream Rescued Asset
* **Endpoint:** `GET /api/assets/:id`
* **Purpose:** Serves rescued image, chart, or diagram files to `<img src="...">` tags in the web frontend markdown viewer.
* **Authentication:** None
* **URL Parameters:**
  * `id` (`UUID`): Asset ID.
* **Processing:** Looks up asset by ID in database, verifies file exists at `localPath` on disk, and streams binary contents with appropriate headers (`Content-Type: image/png`, `Cache-Control: public, max-age=86400`).
* **Success Response (`200 OK`):** Binary stream of the image file.

---

### 5.2 Export Context Package
* **Endpoint:** `GET /api/captures/:id/export`
* **Purpose:** 1-click download of the session artifacts in user's selected format.
* **Authentication:** None
* **URL Parameters:**
  * `id` (`UUID`): Capture ID.
* **Query Parameters:**
  * `format` (`enum`, required): `context` | `summary` | `zip`
* **Formats:**
  * `?format=context`: Streams `context.md` as attachment (`Content-Disposition: attachment; filename="<title>-context.md"`).
  * `?format=summary`: Streams `summary.md` as attachment (`Content-Disposition: attachment; filename="<title>-summary.md"`).
  * `?format=zip`: Streams an on-the-fly `.zip` bundle containing:
    ```
    loom-export-<title>-v<N>/
    ├── context.md
    ├── summary.md
    ├── metadata.json
    ├── assets/
    │   └── [all rescued image files]
    └── raw/
        └── snapshot.html
    ```
* **Success Response (`200 OK`):** Attachment download stream.

---

## 6. Real-Time Pipeline Progress

### 6.1 Server-Sent Events (SSE) Progress Stream
* **Endpoint:** `GET /api/jobs/:id/events`
* **Purpose:** Pushes live progress updates to the Chrome extension popup and web frontend while a capture is being normalized and summarized.
* **Authentication:** None
* **URL Parameters:**
  * `id` (`UUID`): Job ID.
* **Headers:** `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
* **Stream Events:**
  * `stage`:
    ```text
    event: stage
    data: {"stage": "normalize", "progress": 0.4, "status": "RUNNING"}
    ```
  * `stage`:
    ```text
    event: stage
    data: {"stage": "distill", "progress": 0.8, "status": "RUNNING"}
    ```
  * `done`:
    ```text
    event: done
    data: {"stage": "completed", "progress": 1.0, "status": "COMPLETED", "captureId": "c7a8b9d0-..."}
    ```
  * `error`:
    ```text
    event: error
    data: {"stage": "distill", "status": "FAILED", "error": "LLM connection timeout"}
    ```

---

## 7. Endpoint Summary Matrix

| Method | Path | Consumer | Primary Purpose |
|---|---|---|---|
| `GET` | `/health` | Docker / Dev | Health & DB ping |
| `GET` | `/api/config` | Extension / Web | Extension ping & LLM feature flags |
| `POST` | `/api/captures` | Extension | **Core Ingest**: Save raw files, generate `context.md` |
| `GET` | `/api/captures` | Web App | Left sidebar library list with search |
| `GET` | `/api/captures/:id` | Web App | Capture header, versions, outputs list |
| `GET` | `/api/captures/:id/messages` | Web App | Message-by-message transcript view |
| `POST` | `/api/captures/:id/generate` | Web App | On-demand Gemma summarization |
| `GET` | `/api/outputs/:id` | Web App | Load `context.md` or `summary.md` markdown |
| `GET` | `/api/assets/:id` | Web App | Stream images & chart assets |
| `GET` | `/api/captures/:id/export` | Web App | Download `context.md`, `summary.md`, or `.zip` |
| `GET` | `/api/jobs/:id/events` | Extension / Web | Live SSE progress updates |
