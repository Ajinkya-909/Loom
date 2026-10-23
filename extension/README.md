# ContextPort extension

Chrome (MV3) **collector** for ContextPort. It does no thinking: on click it loads the whole ChatGPT chat, captures raw HTML/text/images and uploads everything to your backend, which produces `context.md` (and `summary.md` with Gemma).

- **Get context**: capture, backend writes `context.md` only.
- **Summarize context**: same capture, the backend also writes `summary.md` (`meta.action = "summarize"`).

Design rule: capture raw, send everything, never drop data. Anything uncertain is sent and recorded as a warning.

## 1. Install and build

Requires Node 20+.

```bash
pnpm i && pnpm build      # or: npm i && npm run build
pnpm dev                  # rebuilds on change (reload the extension in chrome://extensions)
pnpm test                 # Vitest + jsdom
```

`build` regenerates the placeholder icons, type-checks, and bundles into `dist/`. Dependencies are pinned to exact versions. The build uses `@crxjs/vite-plugin` 2.0.0 with Vite 5.4; no fallback to a hand-written manifest was needed.

## 2. Load unpacked

1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** and choose the `dist/` folder.
3. Pin the ContextPort icon to the toolbar.

## 3. Run the mock server

```bash
node mock-server/server.mjs          # http://localhost:4000, token "devtoken"
```

In the popup, open **Settings (gear)** and use:

| Field | Value |
|---|---|
| Server URL (API) | `http://localhost:4000` |
| Web app URL | `http://localhost:4000` (the mock serves `/` and `/c/:id` itself) |
| API token | `devtoken` |

Click **Save & test connection**. You should see "Connected · server v0.1.0-mock · Gemma on".

## 4. Manual test script

1. Open a ChatGPT conversation, click **Get context**. Watch the steps advance (Loading chat, Capturing, Saving images, Uploading). The mock console prints a summary; the message count should equal the "expected" count. The viewer tab opens.
2. Click **Summarize context**. The mock console shows `action=summarize`. (Content is unchanged, so this one returns **Already captured**; see step 3.)
3. **Duplicate**: capture the same chat twice without changes. The second run shows "Already captured". Click **Capture again anyway** for a new version.
4. **Failures**, restart the mock with `MOCK_FAIL=…` and press Get context:
   - `401` shows UNAUTHORIZED, `413` shows PAYLOAD_TOO_LARGE with **Retry without images**, `429` RATE_LIMITED, `500` SERVER_ERROR (Retry works for the retryable ones).
   - `slow` takes 10 s: close and reopen the popup mid-upload, it still shows live progress. Click **Cancel**.
   - `drop` closes the socket and shows NETWORK.
   - `MOCK_GEMMA=0` disables **Summarize context** with a tooltip.
5. **Cancel mid-run**: on a long chat press **Cancel** while "Loading full chat…". Nothing is uploaded; the state is "Cancelled".
6. **NO_CHAT**: open `https://chatgpt.com/` (new chat, no messages), open the popup: "No conversation found".
7. **UNSUPPORTED_PAGE**: open any other site: "Open a chat to start".
8. Stop the mock server and open the popup: "Can't reach server". Clear the token: "Token needed".
9. Reload or navigate the tab mid-run: the run is cancelled and the popup resets.

## 5. Permissions

| Permission | Why |
|---|---|
| `storage` | Settings (`storage.local`) and per-tab run state (`storage.session`). |
| `scripting` | Inject the content script into ChatGPT tabs that were open before the extension was installed/updated. |
| `tabs` | Read the tab URL (is this a supported chat?) and receive URL-change events for SPA navigation. |
| host `chatgpt.com`, `chat.openai.com` | Content script + background fetch of signed image URLs. |
| host `localhost`, `127.0.0.1` | Default dev server. A bare `localhost` pattern matches every port. |
| optional hosts `https://*/*`, `http://*/*` | Requested at runtime only for a non-local server URL you type in settings. |

`activeTab` was dropped: the host permissions above already cover everything it would. No `unsafe-eval`, no remote code, no analytics. The extension talks only to the configured server URL.

**Security note:** the API token is stored in `chrome.storage.local` in plain text. That is acceptable for this prototype, not for production. The token is never logged or included in "Copy error details". Chat content is never stored persistently by the extension and never logged.

## 6. Architecture

```
popup (React)  ──OPEN/START/CANCEL/RETRY──▶  background worker  ──PING/PROBE/START_CAPTURE/ABORT──▶  content script
   ▲                                              │  ▲                                                   │
   └──────── storage.session `state:<tabId>` ─────┘  └── PROGRESS / PART / ASSET_* / FETCH_ASSET ─────────┘
                                                  │
                                            apiClient ──▶  GET /api/config, POST /api/captures
```

- **State** is per tab, owned by the background, persisted in `chrome.storage.session`. The popup only renders it (it subscribes to storage changes, so reopening mid-run shows live progress). The reducer is a pure function in `src/shared/stateMachine.ts`.
- **Worker restart:** the in-memory run table is lost, so on boot any stored `RUNNING` state is marked `FAILED (UNKNOWN, "Capture interrupted, please retry")`.
- **Transfer:** runtime messages are JSON, so strings are chunked at 8 MB and assets travel as base64 chunks of 4 MB (3 MB raw) with `sha256` and size verified in `assetReceiver.ts`.
- **Cancel:** aborts the upload `fetch`, tells the content script to stop scrolling and downloading, frees buffers, state becomes `CANCELLED`. After the upload finishes it has no effect.

Sequence of one capture:

```
popup        background                    content                      server
  │ OPEN ───▶ │ GET /api/config ───────────────────────────────────────▶ │
  │           │ ◀─ config ──────────────────────────────────────────────  │
  │           │ PING/PROBE ───▶ │ count messages
  │ ◀ READY ─ │ ◀── n msgs ──── │
  │ START ──▶ │ START_CAPTURE ─▶ │ scroll to load all, collect by message id
  │           │ ◀─ PROGRESS ──── │ capture messages + snapshot + expected counts
  │           │ ◀─ PART×N ────── │ (chunked JSON)
  │           │ ◀─ ASSET_* ───── │ rescue images (fetch → bg fetch → canvas), base64 chunks
  │           │ ◀─ response ──── │ done
  │           │ POST /api/captures (multipart) ─────────────────────────▶ │
  │           │ ◀─ 202 {viewerUrl} ─────────────────────────────────────  │
  │ ◀ SUCCESS │ open viewer tab (if enabled)
```

## 7. Adding a platform

Touch only `src/content/adapters/`:

1. Create `adapters/<name>.ts` exporting `createXAdapter(): PlatformAdapter` (see `adapters/types.ts` and the full `chatgpt.ts`). Keep every selector in one `SELECTORS` object with ordered fallbacks and never use hashed class names.
2. Register it in `adapters/index.ts` (`FACTORIES`).
3. Add the site to `matches` / `host_permissions` in `manifest.config.ts`, and its hostname to `src/shared/platforms.ts` so the background can detect it.

`claude.ts` and `generic.ts` are honest stubs (`matches` works, `listMessageElements` returns `[]`). Contributions welcome.

## 8. Troubleshooting

- **"No messages were found" / wrong counts:** ChatGPT changed its markup. Inspect a message in DevTools, update `SELECTORS` in `adapters/chatgpt.ts`, and run `pnpm test` against an updated fixture. A `SELECTOR_FALLBACK_USED` warning means the primary selector broke.
- **"Couldn't talk to the page":** reload the ChatGPT tab (the extension auto-injects, but a discarded tab can fail).
- **Permission denied:** a non-local server URL needs a runtime grant; click **Save & test connection** and accept Chrome's prompt.
- **Service worker logs:** `chrome://extensions` → ContextPort → **service worker** (inspect). Content-script logs are in the ChatGPT tab's DevTools console. Set `DEBUG = true` in `src/shared/constants.ts` for verbose logs (never logs chat content or the token).
- **Images missing:** signed URLs may have expired or be cross-origin; they are listed in `meta.assets` with `uploaded: false` and an `ASSET_FAILED` warning.
- **Success badge doesn't clear:** the 5 s timer lives in the worker; if Chrome stopped the worker first the badge clears on the next run.

## 9. Tests

`tests/chatgpt.adapter.test.ts` (fixture parsing, roles, order, expected counts, title fallback, fallback selectors), `tests/payload.test.ts` (multipart parts and asset matching), `tests/stateMachine.test.ts` (every transition, ignored second START, worker restart), `tests/loadAll.test.ts` (DOM-order merge for virtualized lists).
