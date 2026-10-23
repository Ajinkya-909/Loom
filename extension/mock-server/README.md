# ContextPort mock server

Dependency-free stand-in for the real backend (Node 20+).

```bash
node mock-server/server.mjs                  # http://localhost:4000, token "devtoken"
PORT=4100 MOCK_TOKEN=secret node mock-server/server.mjs
MOCK_GEMMA=0 node mock-server/server.mjs     # Summarize button disabled
MOCK_FAIL=401 node mock-server/server.mjs    # also: 413 | 429 | 500 | slow | drop
```

| Endpoint | Behaviour |
|---|---|
| `GET /api/config` | `{ version, gemmaEnabled, authorized, defaultMode }`; 401 on a bad token |
| `POST /api/captures` | parses the multipart body, stores it under `mock-server/mock-data/<captureId>/`, prints a summary, returns `202`. Same content as the previous capture of that URL returns `200 {duplicate:true}` unless `?force=1` |
| `GET /` | library listing (this is the extension's default **Web app URL**) |
| `GET /c/:id` | what was received: meta, messages, assets |

`MOCK_FAIL` only affects `POST /api/captures`, so the popup still connects and you can watch the failure state.
`slow` waits 10 s before answering; `drop` closes the socket mid-request. Duplicate tracking is in memory (restart = fresh versions).
