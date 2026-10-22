# PRODUCT SPECIFICATION: LOOM

> **Status:** Draft / Ready for Approval  
<!-- > **Target Deadline:** Saturday, 4:00 PM (~36–40 hours remaining)   -->
> **Core Focus:** Developer context capture, normalization, distillation, and 1-click sharing.

---

## 1. Executive Summary & Problem Statement

Developers frequently collaborate across multiple AI platforms (ChatGPT, Claude, Gemini, DeepSeek, Perplexity). In day-to-day multi-chat workflows:
1. Valuable prompt-response contexts, architecture decisions, and code snippets remain trapped in fragmented browser tabs.
2. Sharing context with teammates or across LLM sessions requires tedious, lossy manual copy-pasting.
3. Native platform shared links often expire, leak irrelevant messages, or lose raw artifacts/diagrams.

**Loom** is a developer productivity tool comprising:
- A **Browser Extension** with a focused 2-button workflow (*Get Context* vs. *Get & Summarize*).
- A **Backend Ingestion & Normalization Engine** that transforms raw chat DOMs and files into clean, canonical `context.md` documents.
- A **Distillation Service** powered by Gemma to synthesize executive summaries, decisions, and action plans (`summary.md`).
- A **Web Workspace Dashboard** with a 3-pane layout (Chat Library, Context/Summary Viewer, Assets & Export Inspector).

---

## 2. Scope & Timeline Strategy (Saturday 4:00 PM Deadline)

Given the tight timeline, we prioritize rock-solid reliability over fragile dynamic features.

### Option Comparison for Gemma & Center Dashboard:
* **Option 1 (Recommended & Scoped): Rich Markdown + Structured Stat Badges**
  * Gemma outputs a standardized, predictable `summary.md` with well-defined markdown sections.
  * The center pane renders both `summary.md` and `context.md` with beautiful typography, code highlighting, copy buttons, and quick metadata chips.
  * **Risk:** Very low. Works 100% reliably without LLM JSON hallucinations or UI chart crashes.
* **Option 2 (Deferred to Post-Deadline / v2): Dynamic JSON Dashboard & Chart Generation**
  * Gemma generates a custom JSON layout containing chart configs, widget types, and graph metrics.
  * **Risk:** High under time constraints. Small local/open LLMs frequently break complex JSON formatting, causing frontend rendering exceptions.

> **Decision:** We implement **Option 1** for the Saturday prototype. Option 1 fulfills 100% of the core user goal (instant clean context + distilled summary + downloads).

### In-Scope for Saturday 4:00 PM:
1. **Extension**:
   * Single-click capture on active chat tab (ChatGPT & Claude prioritized, generic DOM parser fallback).
   * 2 Action Buttons:
     * `Get Context`
     * `Get & Summarize Context`
   * Simple Bearer Token authentication to API.
   * Redirects user immediately to the web dashboard once uploaded.
2. **Backend**:
   * Multipart ingest endpoint (`POST /api/captures`) handling raw HTML snapshot, messages JSON, and binary assets (images, diagrams).
   * Disk storage structure (`storage/captures/<chatId>/v<N>/`) for raw files, assets, `context.md`, and `summary.md`.
   * Normalization pipeline: converts raw messages into chronological request-response cycles with code blocks and asset references.
   * Distillation pipeline: prompts Gemma to generate `summary.md`.
   * Single-archive export streamer (`.zip`, `.md`).
3. **Database (PostgreSQL via Prisma)**:
   * Lean, robust schema: `Chat`, `Capture`, `Message`, `Asset`, `Output`, `Job`.
4. **Web App (React/Vite + Vanilla CSS)**:
   * **Left Sidebar**: List of captures with search and status badges.
   * **Center Panel**: View switcher (`Summary` | `Context Transcript`), markdown renderer with syntax highlighting.
   * **Right Sidebar**: Extracted assets gallery and 1-click download actions (`context.md`, `summary.md`, and full `.zip`).

---

## 3. Core User Flows

```
[ Active AI Chat Tab ]
         │
         ├── User clicks Loom Extension Icon
         │
         ├── Action A: "Get Context"
         │     │
         │     ├── 1. Ingest DOM & Assets -> Disk Storage
         │     ├── 2. Normalization -> Generate `context.md`
         │     └── 3. Redirect to Web App (`/c/:captureId?tab=context`)
         │
         └── Action B: "Get & Summarize Context"
               │
               ├── 1. Ingest DOM & Assets -> Disk Storage
               ├── 2. Normalization -> Generate `context.md`
               ├── 3. Send `context.md` to Gemma -> Generate `summary.md`
               └── 4. Redirect to Web App (`/c/:captureId?tab=summary`)
```

### Flow 1: "Get Context"
1. User activates the Loom extension on a supported AI chat tab.
2. User clicks **"Get Context"**.
3. Extension extracts title, platform URL, message hierarchy, and image blobs.
4. Payload is submitted to `POST /api/captures`.
5. Backend stores raw files, builds chronological request-response markdown, and saves `context.md`.
6. Extension receives `{ captureId, viewerUrl }` and opens the viewer dashboard.

### Flow 2: "Get & Summarize Context"
1. User clicks **"Get & Summarize"**.
2. Pipeline completes Flow 1 (raw storage + `context.md`).
3. Worker sends `context.md` to Gemma with a structured prompt.
4. Gemma outputs `summary.md`.
5. Web dashboard opens directly on the `Summary` tab with immediate toggle to `context.md`.

---

## 4. Output Formats

### 4.1 Canonical Request-Response Transcript (`context.md`)
```markdown
# Context: [Chat Title]
- **Platform:** [ChatGPT / Claude / Gemini]
- **Captured At:** [ISO Timestamp]
- **Source URL:** [URL]

---

### 👤 User (Prompt #1)
[User prompt text]

### 🤖 Assistant (Response #1)
[Assistant markdown response, tables, code blocks]
![Asset reference](assets/asset_1.png)

---
```

### 4.2 Distilled Summary (`summary.md`)
```markdown
# Summary & Context Analysis: [Chat Title]

## 1. Objective & Intent
[Clear synthesis of developer's core inquiry and requirements]

## 2. Key Decisions & Architecture
* **[Decision 1]**: [Rationale and chosen solution]
* **[Decision 2]**: [Framework/library trade-offs]

## 3. Discarded Approaches & Failures
* [Attempted solutions that failed or were abandoned]

## 4. Final Code & Deliverables
```[language]
[Clean, consolidated working code snippet]
```

## 5. Next Steps & Open Items
- [ ] [Remaining action items or unresolved questions]
```

### 4.3 Export Packages
* **Context Only**: Downloads pure `context.md`.
* **Summary Only**: Downloads pure `summary.md`.
* **Full Bundle (`.zip`)**:
  ```
  loom-<chatId>-v<N>/
  ├── context.md
  ├── summary.md
  ├── metadata.json
  ├── assets/
  │   └── [extracted images & figures]
  └── raw/
      ├── snapshot.html
      └── messages.json
  ```

---

## 5. Web Workspace UI Layout

* **Left Panel (Library)**:
  * Fast search input for chats.
  * List of chats showing title, platform icon (ChatGPT, Claude, etc.), and capture time.
* **Center Panel (Reader & Editor)**:
  * Top navigation bar: Title, platform, tab toggle (`Summary` | `Context Transcript`).
  * Reading view: High-contrast typography, code blocks with syntax highlighting and 1-click copy buttons.
* **Right Panel (Asset & Export Inspector)**:
  * Quick metrics (message count, code blocks, token estimate).
  * **Download Buttons**:
    * 📄 Download `context.md`
    * 📝 Download `summary.md`
    * 📦 Download Full Analysis (`.zip`)
  * **Rescued Assets**: Gallery of all images/diagrams captured from the session.

---

## 6. Definition of Done for Saturday 4:00 PM
1. Chrome Extension successfully extracts conversation content and assets from ChatGPT/Claude.
2. Backend receives payload, stores files on disk, and writes database records.
3. Normalization pipeline deterministically generates `context.md`.
4. Gemma generates `summary.md` reliably.
5. Web Dashboard allows browsing chats, viewing both markdown tabs, and downloading all 3 export options.
