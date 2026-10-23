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
      "GROK",
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
* **Purpose:** Primary entry point for captured conversations. Designed for a **zero-trust, lightweight extension model**: the extension only needs to save and upload raw files (HTML snapshot and assets, similar to browser `Ctrl + S`). The backend automatically detects the AI platform, extracts conversation turns (User prompts and Assistant responses), cleans UI noise, converts tables to Markdown, preserves code fences with language tags, compiles canonical `context.md`, deduplicates, and saves everything to disk and PostgreSQL.
* **Authentication:** Optional `Authorization: Bearer <API_TOKEN>` (local single-user default)
* **Content-Type:** `multipart/form-data`
* **Request Multipart Fields:**

| Field Name | Type | Required | Description |
|---|---|---|---|
| `snapshot` | `file (text/html)` | **Conditional\*** | Full raw HTML file (e.g. browser saved web page or DOM snapshot). **Recommended**. |
| `assets` | `file[] (binary)` | Optional | Images, diagrams, screenshots, or stylesheets saved alongside the chat session. |
| `meta` | `text (JSON string)` | Optional | Optional metadata overrides: `{ "title"?, "sourceUrl"?, "platform"?, "mode"? }`. Auto-detected if omitted. |
| `messages` | `text (JSON string)` | **Conditional\*** | Optional pre-parsed messages array. If omitted, backend scrapes `snapshot` HTML. |

*\* Note: At least one of `snapshot` (HTML file) or `messages` (JSON string) must be provided.*

#### Example `meta` JSON payload (Optional):
```json
{
  "platform": "CHATGPT",                        // Auto-detected if omitted
  "sourceUrl": "https://chatgpt.com/c/6789-abcd", // Auto-detected from canonical links if omitted
  "title": "Refactoring Auth Middleware",        // Auto-extracted from <title> if omitted
  "mode": "CONTEXT_ONLY",                        // "CONTEXT_ONLY" (default) | "SUMMARIZE"
  "stats": {
    "expectedMessages": 14,
    "expectedCodeBlocks": 5,
    "expectedImages": 2
  }
}
```

#### Example `messages` JSON payload (Optional fallback):
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
  1. **Multipart Parsing:** Multer receives and buffers incoming files (`snapshot`, `assets`) and fields (`meta`, `messages`).
  2. **Metadata & Content Ingestion (Two Paths):**
     * **Path A (Raw HTML Snapshot — Default):** If `messages` is omitted, the backend's server-side `htmlScraper` parses `snapshot.html`:
       - Auto-detects platform (`CHATGPT`, `CLAUDE`, `GEMINI`, `DEEPSEEK`, `PERPLEXITY`, `GENERIC`).
       - Extracts clean chat title from `<title>` (cleans platform suffixes like ` - ChatGPT`).
       - Extracts canonical `sourceUrl` from `<link rel="canonical">`, OpenGraph tags, or thread links.
       - Scrapes conversation turns:
         - **User Turns:** Cleans reaction badges, copy/edit action buttons, and extracts clean prompt text.
         - **Assistant Turns:** Converts HTML tables (`<table>`) to Markdown tables, extracts code fences (`<pre><code>`) with syntax language tags, processes bulleted/numbered lists, blockquotes, and headings with zero content loss.
     * **Path B (Pre-Parsed Payload):** If `messages` is provided by the client, it is validated against `messagesSchema`.
  3. **Hash & Deduplication:** Computes SHA-256 `contentHash` over the ordered text of all messages.
  4. **Chat Entity Resolution:** Resolves or creates a `Chat` record keyed by `(sourceUrl, platform)`.
  5. **Deduplication Check:** If the latest version of this chat has the exact same `contentHash`, returns existing capture info with `"duplicate": true` (skips redundant processing and storage).
  6. **Version Incrementation:** Determines `version = latestCapture.version + 1` (or `1` for new chats).
  7. **Storage Directory Preparation:** Creates `storage/captures/<chatId>/v<version>/raw/` and `storage/captures/<chatId>/v<version>/assets/`.
  8. **Raw File Persistence:**
     - Saves `snapshot.html` to `raw/snapshot.html`.
     - Saves `messages.json` to `raw/messages.json`.
     - Saves each uploaded asset to `assets/<assetId>.<ext>`.
  9. **Database Records Creation:**
     - Creates `Capture` record with `version`, `contentHash`, `status: PROCESSING`, `rawPath`.
     - Creates `Job` record with `type: INGEST_AND_NORMALIZE`, `status: RUNNING`.
     - Inserts `Asset` records linked to specific message indices.
  10. **Normalization Pipeline (Core Engine):**
      - Parses each message into typed `Block[]` (`text`, `code`, `table`, `diagram`).
      - Inserts `Message` records with typed blocks and token estimates.
      - **Compiles Canonical `context.md`:** Builds the request-response Markdown transcript adhering to PRODUCT_SPEC.md §4.1 with embedded asset links (`![Asset](assets/<id>.<ext>)`).
      - Writes `context.md` to `storage/captures/<chatId>/v<version>/context.md`.
      - Creates `Output` record with `kind: CONTEXT`.
  11. **Finalization:** Updates `Job` (`status: COMPLETED`, `progress: 1.0`) and `Capture` (`status: READY`).
  12. **Response (`202 Accepted`):** Returns complete identifiers and viewer URL.

* **Success Response (`202 Accepted`):**
  ```json
  {
    "chatId": "e3b0c442-98fc-4b8c-8f92-5d9c2a1e0b5f",
    "captureId": "c7a8b9d0-12e3-4f5a-6b7c-8d9e0f1a2b3c",
    "version": 1,
    "jobId": "f1e2d3c4-5b6a-7c8d-9e0f-1a2b3c4d5e6f",
    "status": "READY",
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
  * `format` (`enum`, optional, default: `zip`): `context` | `summary` | `zip`
* **Formats & Behavior:**
  * `?format=context`: Streams only the canonical `context.md` transcript as an attachment (`Content-Disposition: attachment; filename="<title>-v<N>-context.md"`).
  * `?format=summary`: Streams only the distilled `summary.md` deliverable as an attachment (`Content-Disposition: attachment; filename="<title>-v<N>-summary.md"`). If the summary has not yet been generated for this capture, returns `404 SUMMARY_NOT_FOUND` with clear user guidance.
  * `?format=zip` (default): Streams an on-the-fly, maximum-compression `.zip` archive bundle containing:
    ```
    loom-export-<title>-v<N>/
    ├── context.md          # Canonical request-response transcript
    ├── summary.md          # Distilled summary (included if generated)
    ├── metadata.json       # Complete session metadata, token counts, asset mappings & timestamps
    ├── assets/             # Rescued screenshots, diagrams, and image attachments
    │   └── [all rescued image/media files]
    └── raw/                # Original unedited sources for full reproducibility
        ├── snapshot.html   # Full browser DOM snapshot
        └── messages.json   # Extracted messages payload
    ```
* **Success Response (`200 OK`):** Attachment download stream (`text/markdown` or `application/zip`).

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

| Method | Path | Consumer | Primary Purpose | Implementation Status |
|---|---|---|---|---|
| `GET` | `/health` | Docker / Dev | Health & DB ping | ✅ **Implemented & Verified** |
| `POST` | `/api/captures` | Extension | **Core Ingest**: Save raw files, auto-detect platform (ChatGPT, Claude, Gemini, Grok, Perplexity), generate `context.md` | ✅ **Implemented & Verified** |
| `GET` | `/api/captures` | Web App | Left sidebar library list with full-text search & pagination | ✅ **Implemented & Verified** |
| `GET` | `/api/captures/:id` | Web App | Capture header, fidelity stats, versions, outputs list | ✅ **Implemented & Verified** |
| `GET` | `/api/captures/:id/messages` | Web App | Message-by-message transcript with typed blocks | ✅ **Implemented & Verified** |
| `GET` | `/api/outputs/:id` | Web App | Load `context.md` or `summary.md` (JSON or raw markdown stream) | ✅ **Implemented & Verified** |
| `GET` | `/api/assets/:id` | Web App | Stream images & chart assets with caching headers | ✅ **Implemented & Verified** |
| `GET` | `/api/captures/:id/export` | Web App | Download `context.md`, `summary.md`, or full `.zip` bundle | ✅ **Implemented & Verified** |
| `GET` | `/api/config` | Extension / Web | Extension ping & LLM feature flags | ⏳ **Pending** |
| `POST` | `/api/captures/:id/generate` | Web App | On-demand Gemma / Gemini summarization | ⏳ **Pending** |
| `GET` | `/api/jobs/:id/events` | Extension / Web | Live SSE progress updates | ⏳ **Pending** |
