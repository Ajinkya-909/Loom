import { zipSync, strToU8 } from "fflate";
import diagramUrl from "@/assets/diagram-architecture.png";
import chartUrl from "@/assets/chart-pool-latency.png";
import shotUrl from "@/assets/shot-middleware.png";
import type {
  Asset,
  CaptureDetail,
  CaptureListItem,
  Message,
  Output,
  ServerConfig,
} from "./types";
import type { Platform } from "./types";
import { slugify } from "./format";

/* ------------------------------------------------------------------ */
/* Mock dataset — mirrors the companion-server API so the whole UI is  */
/* explorable when the local server (default :4000) is offline.        */
/* ------------------------------------------------------------------ */

const h = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

export const serverConfig: ServerConfig = {
  version: "1.4.2",
  authorized: true,
  llm: { provider: "ollama", model: "gemma-3-12b", available: true },
};

export function mockHealth() {
  return { status: "ok", database: { connected: true } };
}

const assets = {
  ast_arch: {
    id: "ast_arch",
    name: "capture-flow-diagram.png",
    mime: "image/png",
    size: 148_620,
    url: diagramUrl,
  },
  ast_shot: {
    id: "ast_shot",
    name: "middleware-editor.png",
    mime: "image/png",
    size: 96_410,
    url: shotUrl,
  },
  ast_chart: {
    id: "ast_chart",
    name: "pool-latency-benchmark.png",
    mime: "image/png",
    size: 112_890,
    url: chartUrl,
  },
} satisfies Record<string, Asset>;

/* ----------------------------- Capture 1 ----------------------------- */

const authMwMessages: Message[] = [
  {
    id: "m-auth-1",
    idx: 0,
    role: "user",
    textPlain:
      "I've got Express auth middleware that's grown into a tangle — session lookups, JWT verification and role checks all mixed together. Here's the current version. How should I refactor it?",
    blocks: [
      {
        type: "text",
        content:
          "Current middleware (everything inline, ~90 lines). It works but every new route needs copy-pasted role logic and the error paths are inconsistent.",
      },
      {
        type: "code",
        lang: "ts",
        content: [
          "export const authMiddleware = (req, res, next) => {",
          "  const header = req.headers.authorization;",
          "  if (!header || !header.startsWith('Bearer ')) {",
          "    return res.status(401).json({ error: 'Missing or invalid authorization header' });",
          "  }",
          "  try {",
          "    const token = header.split(' ')[1];",
          "    const payload = verifyToken(token);",
          "    // session lookup buried in here",
          "    const session = db.sessions.find({ userId: payload.sub });",
          "    if (!session || session.revoked) {",
          "      return res.status(401).json({ error: 'Session revoked' });",
          "    }",
          "    // role checks copy-pasted per route",
          "    if (req.path.startsWith('/admin') && !payload.roles.includes('admin')) {",
          "      return res.status(403).json({ error: 'Forbidden' });",
          "    }",
          "    req.user = { id: payload.sub, email: payload.email, roles: payload.roles ?? [] };",
          "    next();",
          "  } catch (err) {",
          "    return res.status(401).json({ error: 'Invalid or expired token' });",
          "  }",
          "};",
        ].join("\n"),
      },
    ],
    tokenEstimate: 410,
  },
  {
    id: "m-auth-2",
    idx: 1,
    role: "assistant",
    textPlain:
      "The core issue is that verification, session state and authorization are three distinct concerns fused into one function. Split them into composable layers.",
    blocks: [
      {
        type: "text",
        content:
          "**Split it into three layers**, each with one job:\n\n1. `authenticate` — verify the JWT, attach the payload\n2. `loadSession` — resolve + validate the session row\n3. `requireRole(...roles)` — a factory, so route files declare their own authorization\n\nEach layer fails fast with a consistent error shape, so error handling stops being per-route guesswork.",
      },
      {
        type: "code",
        lang: "ts",
        content: [
          "// middleware/auth.ts — composable layers",
          "export const authenticate: RequestHandler = async (req, res, next) => {",
          "  const header = req.headers.authorization;",
          "  if (!header?.startsWith('Bearer ')) {",
          "    return fail(res, 401, 'missing_token');",
          "  }",
          "  try {",
          "    req.payload = verifyToken(header.split(' ')[1]);",
          "    next();",
          "  } catch {",
          "    return fail(res, 401, 'invalid_token');",
          "  }",
          "};",
          "",
          "export const loadSession: RequestHandler = async (req, res, next) => {",
          "  const session = await sessions.getActive(req.payload.sub);",
          "  if (!session) return fail(res, 401, 'session_revoked');",
          "  req.user = toUser(req.payload, session);",
          "  next();",
          "};",
          "",
          "export const requireRole =",
          "  (...roles: string[]): RequestHandler =>",
          "  (req, res, next) => {",
          "    if (!req.user.roles.some((r) => roles.includes(r))) {",
          "      return fail(res, 403, 'forbidden');",
          "    }",
          "    next();",
          "  };",
          "",
          "// router wiring",
          "router.use('/api', authenticate, loadSession);",
          "router.use('/admin', requireRole('admin'));",
        ].join("\n"),
      },
      {
        type: "text",
        content:
          "`fail()` is a tiny helper that always emits `{ error: { code, message } }` — one shape everywhere, which makes client-side handling trivial.",
      },
    ],
    tokenEstimate: 980,
  },
  {
    id: "m-auth-3",
    idx: 2,
    role: "user",
    textPlain:
      "Nice. Can you lay out the failure modes as a matrix so I can double-check the client handles each one? And what happens with expired-but-valid signatures?",
    blocks: [],
    tokenEstimate: 120,
  },
  {
    id: "m-auth-4",
    idx: 3,
    role: "assistant",
    textPlain:
      "Here is the full failure matrix with the HTTP status each layer emits.",
    blocks: [
      {
        type: "table",
        content: [
          "| Failure mode | Layer | Status | Error code | Client action |",
          "| --- | --- | --- | --- | --- |",
          "| Missing header | authenticate | 401 | `missing_token` | Redirect to login |",
          "| Bad signature | authenticate | 401 | `invalid_token` | Silent re-login |",
          "| Expired token | authenticate | 401 | `token_expired` | Refresh, retry once |",
          "| Revoked session | loadSession | 401 | `session_revoked` | Force logout |",
          "| Role not held | requireRole | 403 | `forbidden` | Show 403 page |",
        ].join("\n"),
      },
      {
        type: "text",
        content:
          "Expired-but-valid signatures still fail verification — `verifyToken` checks `exp` — but they get their own `token_expired` code so the client can attempt a **refresh-and-retry** instead of a full logout. Wire the refresh call into your fetch wrapper and the user never sees the failure.",
      },
    ],
    tokenEstimate: 760,
  },
  {
    id: "m-auth-5",
    idx: 4,
    role: "user",
    textPlain: "Can you draw the request flow so I can drop it into the README?",
    blocks: [],
    tokenEstimate: 90,
  },
  {
    id: "m-auth-6",
    idx: 5,
    role: "assistant",
    textPlain: "Here is the flow diagram and how the editor view of the final middleware looks.",
    blocks: [
      { type: "image", content: "ast_arch" },
      {
        type: "text",
        content:
          "The three layers run strictly in order — a request that fails verification never touches the session store.",
      },
      { type: "image", content: "ast_shot" },
    ],
    tokenEstimate: 640,
  },
];

const authSummaryMd = [
  "# Refactoring Auth Middleware — Distilled Summary",
  "",
  "## 1. Goal & Scope",
  "Replace a monolithic Express auth middleware (~90 lines mixing JWT verification, session lookups and role checks) with three composable layers, without changing route behavior.",
  "",
  "## 2. Key Decisions",
  "- Split into `authenticate` → `loadSession` → `requireRole(...roles)`; each layer owns exactly one concern.",
  "- Standardize every failure as `{ error: { code, message } }` via a shared `fail()` helper.",
  "- Give expired tokens their own `token_expired` code so clients can refresh-and-retry instead of logging out.",
  "- Declare authorization per route with the `requireRole` factory instead of path-prefix checks buried in middleware.",
  "",
  "## 3. Implementation Walkthrough",
  "- `authenticate` verifies the Bearer JWT and attaches the payload; fails fast on missing/invalid tokens.",
  "- `loadSession` resolves the active session row, rejects revoked sessions, and hydrates `req.user`.",
  "- Router wiring: `router.use('/api', authenticate, loadSession)` then `router.use('/admin', requireRole('admin'))`.",
  "",
  "## 4. Pitfalls & Edge Cases",
  "- Revoked sessions must short-circuit before role checks run.",
  "- A 403 (`forbidden`) must never leak which roles the route expects.",
  "- Clock skew can reject tokens seconds early — allow ~30s leeway on `exp`.",
  "",
  "## 5. Next Steps",
  "- Wire refresh-token retry into the fetch wrapper.",
  "- Add integration tests covering each row of the failure matrix.",
  "- Migrate the remaining path-prefix checks to `requireRole` factories.",
].join("\n");

/* ----------------------------- Capture 2 ----------------------------- */

const poolMessages: Message[] = [
  {
    id: "m-pool-1",
    idx: 0,
    role: "user",
    textPlain:
      "Our API p95 spikes under load. Postgres 16 on a 4 vCPU box, node-postgres, currently pool size 10. Should we just crank it up?",
    blocks: [],
    tokenEstimate: 130,
  },
  {
    id: "m-pool-2",
    idx: 1,
    role: "assistant",
    textPlain:
      "Not blindly — bigger pools queue contention inside Postgres. Benchmark first, then pick the knee of the curve.",
    blocks: [
      {
        type: "code",
        lang: "ts",
        content: [
          "import { Pool } from 'pg';",
          "",
          "export const pool = new Pool({",
          "  host: process.env.PGHOST,",
          "  database: process.env.PGDATABASE,",
          "  max: Number(process.env.PG_POOL_MAX ?? 40),",
          "  idleTimeoutMillis: 30_000,",
          "  connectionTimeoutMillis: 5_000,",
          "  // statement_timeout guards against runaway queries",
          "  statement_timeout: 10_000,",
          "});",
          "",
          "// pgbench harness used for the numbers below:",
          "//   pgbench -c 200 -j 4 -T 60 -f mix.sql appdb",
        ].join("\n"),
      },
      {
        type: "table",
        content: [
          "| Pool size | p95 (ms) | Throughput (rps) | Notes |",
          "| --- | --- | --- | --- |",
          "| 10 | 180 | 940 | connection thrash under 200 clients |",
          "| 20 | 110 | 1,180 | still queuing at peaks |",
          "| 40 | 75 | 1,340 | **sweet spot** |",
          "| 80 | 120 | 1,290 | context-switch + lock contention |",
        ].join("\n"),
      },
      { type: "image", content: "ast_chart" },
      {
        type: "text",
        content:
          "The curve bottoms out around **40** on this box — roughly `4 vCPU × 10` is a decent starting heuristic, but let the benchmark decide. Also set `statement_timeout` so one slow query can't monopolize a connection.",
      },
    ],
    tokenEstimate: 890,
  },
  {
    id: "m-pool-3",
    idx: 2,
    role: "user",
    textPlain: "Where does PgBouncer fit? Do we still need a big node pool?",
    blocks: [],
    tokenEstimate: 100,
  },
  {
    id: "m-pool-4",
    idx: 3,
    role: "assistant",
    textPlain:
      "With PgBouncer in transaction mode you shrink the app pool dramatically — PgBouncer multiplexes many client connections onto few server connections.",
    blocks: [
      {
        type: "code",
        lang: "ini",
        content: [
          "; pgbouncer.ini",
          "[databases]",
          "appdb = host=127.0.0.1 port=5432 dbname=appdb",
          "",
          "[pgbouncer]",
          "pool_mode = transaction",
          "default_pool_size = 25",
          "max_client_conn = 200",
          "server_reset_query = DISCARD ALL",
        ].join("\n"),
      },
      {
        type: "text",
        content:
          "In this setup set `max: 10–15` in node — PgBouncer absorbs the burst. One caveat: transaction mode breaks session-level features (advisory locks, `SET` state), so move those to explicit transactions.",
      },
    ],
    tokenEstimate: 720,
  },
];

const poolSummaryMd = [
  "# Postgres Connection Pool Tuning — Distilled Summary",
  "",
  "## 1. Goal & Scope",
  "Diagnose p95 latency spikes under load for a Postgres 16 / node-postgres API and determine the right connection pool size.",
  "",
  "## 2. Key Decisions",
  "- Benchmark before resizing; pool size 40 hit the knee of the curve (p95 75ms, 1,340 rps).",
  "- Add `statement_timeout: 10s` so runaway queries can't monopolize connections.",
  "- Adopt PgBouncer in transaction mode; shrink the node pool to 10–15.",
  "",
  "## 3. Implementation Walkthrough",
  "- `pgbench -c 200 -j 4 -T 60` harness produced the pool-size comparison table.",
  "- PgBouncer config: `pool_mode=transaction`, `default_pool_size=25`, `max_client_conn=200`.",
  "",
  "## 4. Pitfalls & Edge Cases",
  "- Oversizing (80) regresses p95 via context switching and lock contention.",
  "- Transaction pooling breaks session state (`SET`, advisory locks) — move those into explicit transactions.",
  "",
  "## 5. Next Steps",
  "- Re-run the benchmark after enabling PgBouncer.",
  "- Alert on `connectionTimeoutMillis` breaches to catch pool exhaustion early.",
].join("\n");

/* ----------------------------- Capture 3 ----------------------------- */

const r19Messages: Message[] = [
  {
    id: "m-r19-1",
    idx: 0,
    role: "user",
    textPlain:
      "We're still on React 18 with a REST layer of fetch helpers. What does migrating to React 19 Server Actions actually buy us, and what breaks?",
    blocks: [],
    tokenEstimate: 140,
  },
  {
    id: "m-r19-2",
    idx: 1,
    role: "assistant",
    textPlain:
      "Server Actions collapse the client-side fetch/useState/useEffect mutation pipeline into callable functions with built-in revalidation.",
    blocks: [
      {
        type: "code",
        lang: "tsx",
        content: [
          "// app/actions.ts  ('use server' at module top)",
          "'use server';",
          "",
          "import { revalidatePath } from 'next/cache';",
          "import { db } from '@/lib/db';",
          "",
          "export async function createProject(formData: FormData) {",
          "  const title = String(formData.get('title') ?? '');",
          "  if (!title.trim()) {",
          "    return { error: 'Title is required' };",
          "  }",
          "  await db.project.create({ data: { title } });",
          "  revalidatePath('/projects');",
          "  return { ok: true };",
          "}",
          "",
          "// app/projects/new/page.tsx",
          "import { createProject } from '@/app/actions';",
          "",
          "export default function NewProjectPage() {",
          "  return (",
          "    <form action={createProject}>",
          "      <input name=\"title\" required />",
          "      <button type=\"submit\">Create</button>",
          "    </form>",
          "  );",
          "}",
        ].join("\n"),
      },
      {
        type: "text",
        content:
          "What changes conceptually:\n\n- **No client fetch plumbing** — the form posts straight to the server function.\n- **`revalidatePath`** replaces manual cache invalidation.\n- **Progressive enhancement** works by default: the form submits without JS.\n\nWhat breaks: any code assuming `useState`-driven mutation state, axios interceptors around mutations, and REST-shaped error handling — move validation into the action and return typed results.",
      },
    ],
    tokenEstimate: 810,
  },
  {
    id: "m-r19-3",
    idx: 2,
    role: "user",
    textPlain: "How do we handle optimistic UI then? We like the instant feedback.",
    blocks: [],
    tokenEstimate: 90,
  },
  {
    id: "m-r19-4",
    idx: 3,
    role: "assistant",
    textPlain:
      "Use `useOptimistic` — it pairs naturally with actions and keeps the snappy feel without manual state juggling.",
    blocks: [
      {
        type: "code",
        lang: "tsx",
        content: [
          "'use client';",
          "",
          "import { useOptimistic } from 'react';",
          "import { createProject } from '@/app/actions';",
          "",
          "export function ProjectList({ projects }: { projects: Project[] }) {",
          "  const [optimistic, addOptimistic] = useOptimistic(",
          "    projects,",
          "    (state, title: string) => [...state, { id: 'temp', title }],",
          "  );",
          "",
          "  async function onSubmit(fd: FormData) {",
          "    addOptimistic(String(fd.get('title')));",
          "    await createProject(fd);",
          "  }",
          "",
          "  return (",
          "    <form action={onSubmit}>",
          "      <input name=\"title\" />",
          "      <ul>",
          "        {optimistic.map((p) => (",
          "          <li key={p.id}>{p.title}</li>",
          "        ))}",
          "      </ul>",
          "    </form>",
          "  );",
          "}",
        ].join("\n"),
      },
    ],
    tokenEstimate: 640,
  },
];

/* ----------------------------- Capture 4 ----------------------------- */

const vectorMessages: Message[] = [
  {
    id: "m-vec-1",
    idx: 0,
    role: "user",
    textPlain:
      "Our pgvector recall@10 dropped from 0.92 to 0.71 after growing the corpus 10x. HNSW settings were never touched. What do we tune?",
    blocks: [],
    tokenEstimate: 120,
  },
  {
    id: "m-vec-2",
    idx: 1,
    role: "assistant",
    textPlain:
      "Default HNSW build parameters trade recall for build speed. Rebuild the index with higher `m` and `ef_construction`, and raise `ef_search` at query time.",
    blocks: [
      {
        type: "code",
        lang: "sql",
        content: [
          "-- Rebuild HNSW with quality-oriented parameters",
          "DROP INDEX IF EXISTS docs_embedding_idx;",
          "CREATE INDEX docs_embedding_idx",
          "  ON docs USING hnsw (embedding vector_cosine_ops)",
          "  WITH (m = 24, ef_construction = 128);",
          "",
          "-- Per-session recall/latency knob",
          "SET hnsw.ef_search = 80;",
        ].join("\n"),
      },
      {
        type: "table",
        content: [
          "| Config | recall@10 | p95 query (ms) | Build time |",
          "| --- | --- | --- | --- |",
          "| defaults (m=16, ef=64) | 0.71 | 8 | 14 min |",
          "| m=24, efc=128, ef=80 | 0.93 | 21 | 38 min |",
          "| m=32, efc=200, ef=120 | 0.95 | 35 | 61 min |",
        ].join("\n"),
      },
      {
        type: "text",
        content:
          "The middle configuration recovers recall to 0.93 at ~3× query latency — usually the right trade. Set `ef_search` per session, not globally, so dashboards can use the fast lane.",
      },
    ],
    tokenEstimate: 690,
  },
];

const vectorSummaryMd = [
  "# Optimizing Vector Search Recall — Distilled Summary",
  "",
  "## 1. Goal & Scope",
  "Restore recall@10 after a 10× corpus growth degraded HNSW quality from 0.92 to 0.71.",
  "",
  "## 2. Key Decisions",
  "- Rebuild the HNSW index with `m = 24`, `ef_construction = 128`.",
  "- Raise `hnsw.ef_search` to 80 per session at query time.",
  "",
  "## 3. Implementation Walkthrough",
  "- `DROP INDEX` + `CREATE INDEX ... WITH (m = 24, ef_construction = 128)`; benchmarked three configurations.",
  "- Chosen config: recall 0.93 at 21ms p95 (3× latency, acceptable).",
  "",
  "## 4. Pitfalls & Edge Cases",
  "- Rebuilding a large index takes ~38 min — schedule off-peak, build concurrently.",
  "- Global `ef_search` changes penalize latency-sensitive dashboards; scope per session.",
  "",
  "## 5. Next Steps",
  "- Track recall@10 in CI with a fixed probe set.",
  "- Re-evaluate parameters after the next 5× growth.",
].join("\n");

/* ----------------------------- Capture 5 ----------------------------- */

const wsMessages: Message[] = [
  {
    id: "m-ws-1",
    idx: 0,
    role: "user",
    textPlain:
      "After a load-balancer change our clients reconnect-storm the server: thousands of sockets reconnect within ~200ms of each deploy. How do we fix the thundering herd?",
    blocks: [],
    tokenEstimate: 130,
  },
  {
    id: "m-ws-2",
    idx: 1,
    role: "assistant",
    textPlain:
      "Classic reconnect storm: everyone's backoff timer fires at the same instant. Add jittered exponential backoff and cap concurrent reconnects server-side.",
    blocks: [
      {
        type: "code",
        lang: "ts",
        content: [
          "function reconnectDelay(attempt: number) {",
          "  const base = Math.min(30_000, 500 * 2 ** attempt);",
          "  // full jitter: uniform in [0, base]",
          "  return Math.random() * base;",
          "}",
          "",
          "socket.on('close', () => {",
          "  const delay = reconnectDelay(attempt++);",
          "  setTimeout(() => socket.connect(), delay);",
          "});",
        ].join("\n"),
      },
      {
        type: "text",
        content:
          "Server-side, admit reconnects through a token bucket so a storm degrades to a queue instead of a crash. Also send a `Retry-After` hint in the close frame — well-behaved clients honor it.",
      },
    ],
    tokenEstimate: 540,
  },
  {
    id: "m-ws-3",
    idx: 2,
    role: "user",
    textPlain: "Does full jitter hurt perceived latency for the happy path?",
    blocks: [],
    tokenEstimate: 80,
  },
  {
    id: "m-ws-4",
    idx: 3,
    role: "assistant",
    textPlain:
      "No — jitter only spreads the herd. The median client reconnects sooner than with fixed backoff because half draw a delay below the base; the tail thins out instead of synchronizing on the next deploy.",
    blocks: [],
    tokenEstimate: 320,
  },
];

/* ----------------------------- Database ----------------------------- */

interface MockCapture {
  list: CaptureListItem;
  detail: CaptureDetail;
  messages: Message[];
  summary: Output | null;
}

function makeMessages(captureId: string, messages: Message[]): Message[] {
  return messages.map((m) => ({ ...m, id: `${captureId}-${m.id}` }));
}

const cap1Latest = makeMessages("cap_auth_mw", authMwMessages);

const captures: MockCapture[] = [
  {
    list: {
      chatId: "chat-7f3a91",
      captureId: "cap_auth_mw",
      title: "Refactoring Auth Middleware",
      platform: "claude",
      version: 2,
      status: "READY",
      messageCount: 6,
      tokenEstimate: 3000,
      hasSummary: true,
      updatedAt: h(2),
    },
    detail: {
      captureId: "cap_auth_mw",
      chatId: "chat-7f3a91",
      title: "Refactoring Auth Middleware",
      platform: "claude",
      version: 2,
      status: "READY",
      sourceUrl: "https://claude.ai/chat/7f3a91",
      capturedAt: h(2),
      stats: { tokens: 3000, messages: 6, codeBlocks: 3, tables: 1, assets: 2 },
      versions: [
        { captureId: "cap_auth_mw", version: 1, createdAt: h(74) },
        { captureId: "cap_auth_mw", version: 2, createdAt: h(2) },
      ],
      hasSummary: true,
      assets: [assets.ast_arch, assets.ast_shot],
    },
    messages: cap1Latest,
    summary: {
      id: "out_auth_mw",
      captureId: "cap_auth_mw",
      kind: "SUMMARY",
      markdown: authSummaryMd,
      generatedBy: "gemma-3-12b",
      createdAt: h(1),
    },
  },
  {
    list: {
      chatId: "chat-b21c05",
      captureId: "cap_pg_pool",
      title: "Postgres Connection Pool Tuning",
      platform: "chatgpt",
      version: 1,
      status: "READY",
      messageCount: 4,
      tokenEstimate: 1840,
      hasSummary: true,
      updatedAt: h(5),
    },
    detail: {
      captureId: "cap_pg_pool",
      chatId: "chat-b21c05",
      title: "Postgres Connection Pool Tuning",
      platform: "chatgpt",
      version: 1,
      status: "READY",
      sourceUrl: "https://chatgpt.com/c/b21c05",
      capturedAt: h(5),
      stats: { tokens: 1840, messages: 4, codeBlocks: 2, tables: 1, assets: 1 },
      versions: [{ captureId: "cap_pg_pool", version: 1, createdAt: h(5) }],
      hasSummary: true,
      assets: [assets.ast_chart],
    },
    messages: makeMessages("cap_pg_pool", poolMessages),
    summary: {
      id: "out_pg_pool",
      captureId: "cap_pg_pool",
      kind: "SUMMARY",
      markdown: poolSummaryMd,
      generatedBy: "gemma-3-12b",
      createdAt: h(4),
    },
  },
  {
    list: {
      chatId: "chat-9d4e77",
      captureId: "cap_r19_actions",
      title: "React 19 Server Actions Migration",
      platform: "gemini",
      version: 1,
      status: "READY",
      messageCount: 4,
      tokenEstimate: 1680,
      hasSummary: false,
      updatedAt: h(26),
    },
    detail: {
      captureId: "cap_r19_actions",
      chatId: "chat-9d4e77",
      title: "React 19 Server Actions Migration",
      platform: "gemini",
      version: 1,
      status: "READY",
      sourceUrl: "https://gemini.google.com/app/9d4e77",
      capturedAt: h(26),
      stats: { tokens: 1680, messages: 4, codeBlocks: 2, tables: 0, assets: 0 },
      versions: [{ captureId: "cap_r19_actions", version: 1, createdAt: h(26) }],
      hasSummary: false,
      assets: [],
    },
    messages: makeMessages("cap_r19_actions", r19Messages),
    summary: null,
  },
  {
    list: {
      chatId: "chat-4a88e2",
      captureId: "cap_vector_recall",
      title: "Optimizing Vector Search Recall",
      platform: "deepseek",
      version: 1,
      status: "READY",
      messageCount: 2,
      tokenEstimate: 930,
      hasSummary: true,
      updatedAt: h(74),
    },
    detail: {
      captureId: "cap_vector_recall",
      chatId: "chat-4a88e2",
      title: "Optimizing Vector Search Recall",
      platform: "deepseek",
      version: 1,
      status: "READY",
      sourceUrl: "https://chat.deepseek.com/a/4a88e2",
      capturedAt: h(74),
      stats: { tokens: 930, messages: 2, codeBlocks: 1, tables: 1, assets: 0 },
      versions: [{ captureId: "cap_vector_recall", version: 1, createdAt: h(74) }],
      hasSummary: true,
      assets: [],
    },
    messages: makeMessages("cap_vector_recall", vectorMessages),
    summary: {
      id: "out_vector_recall",
      captureId: "cap_vector_recall",
      kind: "SUMMARY",
      markdown: vectorSummaryMd,
      generatedBy: "gemma-3-12b",
      createdAt: h(72),
    },
  },
  {
    list: {
      chatId: "chat-e0f7b3",
      captureId: "cap_ws_storms",
      title: "Debugging WebSocket Reconnect Storms",
      platform: "perplexity",
      version: 1,
      status: "READY",
      messageCount: 4,
      tokenEstimate: 1070,
      hasSummary: false,
      updatedAt: h(190),
    },
    detail: {
      captureId: "cap_ws_storms",
      chatId: "chat-e0f7b3",
      title: "Debugging WebSocket Reconnect Storms",
      platform: "perplexity",
      version: 1,
      status: "READY",
      sourceUrl: "https://perplexity.ai/c/e0f7b3",
      capturedAt: h(190),
      stats: { tokens: 1070, messages: 4, codeBlocks: 1, tables: 0, assets: 0 },
      versions: [{ captureId: "cap_ws_storms", version: 1, createdAt: h(190) }],
      hasSummary: false,
      assets: [],
    },
    messages: makeMessages("cap_ws_storms", wsMessages),
    summary: null,
  },
];

/* ----------------------------- Mock API ----------------------------- */

export function listCaptures(q: string, platform: "all" | Platform): CaptureListItem[] {
  const needle = q.trim().toLowerCase();
  return captures
    .filter((c) => platform === "all" || c.list.platform === platform)
    .filter(
      (c) =>
        !needle ||
        c.list.title.toLowerCase().includes(needle) ||
        JSON.stringify(c.messages).toLowerCase().includes(needle),
    )
    .map((c) => c.list)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getCapture(id: string, version?: number): CaptureDetail | null {
  const base = captures.find((c) => c.detail.captureId === id);
  if (!base) return null;
  if (!version || version === base.detail.version) return base.detail;
  // Version 1 of the auth capture is a shorter, earlier pass over the same thread.
  if (id === "cap_auth_mw" && version === 1) {
    return {
      ...base.detail,
      version: 1,
      capturedAt: h(74),
      stats: { tokens: 1720, messages: 4, codeBlocks: 2, tables: 1, assets: 0 },
      versions: base.detail.versions,
      assets: [],
    };
  }
  return null;
}

export function getMessages(id: string, version?: number): Message[] {
  const base = captures.find((c) => c.detail.captureId === id);
  if (!base) return [];
  if (id === "cap_auth_mw" && version === 1) return base.messages.slice(0, 4);
  return base.messages;
}

export function getOutput(id: string, kind: "SUMMARY" | "CONTEXT" = "SUMMARY"): Output | null {
  if (kind !== "SUMMARY") return null;
  const base = captures.find((c) => c.detail.captureId === id);
  return base?.summary ?? null;
}

/** Register a freshly generated summary in the mock store. */
export function putSummary(id: string, markdown?: string): Output {
  const base = captures.find((c) => c.detail.captureId === id);
  const md =
    markdown ??
    (base
      ? mockOutputMarkdownFor(base.detail)
      : [
          `# Capture — Distilled Summary`,
          "",
          "## 1. Goal & Scope",
          "Distill this captured thread into a portable, lossless brief.",
          "",
          "## 2. Key Decisions",
          "- Keep the transcript lossless in `context.md`.",
          "- Distill into five fixed sections.",
          "",
          "## 3. Implementation Walkthrough",
          "- Normalized transcript, then distilled with the local model.",
          "",
          "## 4. Pitfalls & Edge Cases",
          "- Re-run the distillation after major edits to the source chat.",
          "",
          "## 5. Next Steps",
          "- Export the full bundle and drop it into your project docs.",
        ].join("\n"));
  const out: Output = {
    id: `out_${id}`,
    captureId: id,
    kind: "SUMMARY",
    markdown: md,
    generatedBy: serverConfig.llm.model,
    createdAt: new Date().toISOString(),
  };
  if (base) {
    base.summary = out;
    base.list.hasSummary = true;
    base.detail.hasSummary = true;
  }
  return out;
}

/* ------------------------- Export builders -------------------------- */

function turnLabel(role: "user" | "assistant") {
  return role === "user" ? "👤 User" : "🤖 Assistant";
}

export function buildContextMarkdown(detail: CaptureDetail, messages: Message[]): string {
  const parts: string[] = [
    `# ${detail.title}`,
    "",
    `> Platform: ${detail.platform} · Version: v${detail.version} · Captured: ${detail.capturedAt}`,
    `> Source: ${detail.sourceUrl}`,
    "",
  ];
  for (const m of messages) {
    parts.push(`## Turn ${m.idx + 1} — ${turnLabel(m.role)}`, "");
    for (const b of m.blocks) {
      if (b.type === "code") {
        parts.push("```" + (b.lang ?? ""), b.content, "```", "");
      } else if (b.type === "table") {
        parts.push(b.content, "");
      } else if (b.type === "image") {
        parts.push(`![rescued asset](assets/asset-${b.content}.png)`, "");
      } else {
        parts.push(b.content, "");
      }
    }
    parts.push(`_~${m.tokenEstimate} tokens_`, "");
  }
  return parts.join("\n");
}

export function buildSummaryMarkdown(output: Output): string {
  return output.markdown;
}

export function buildMetadataJson(detail: CaptureDetail): string {
  return JSON.stringify(
    {
      tool: "Loom (ContextPort)",
      captureId: detail.captureId,
      chatId: detail.chatId,
      title: detail.title,
      platform: detail.platform,
      version: detail.version,
      sourceUrl: detail.sourceUrl,
      capturedAt: detail.capturedAt,
      stats: detail.stats,
      exportedAt: new Date().toISOString(),
    },
    null,
    2,
  );
}

/** Build the full export bundle as a real .zip in memory. */
export async function buildZipBundle(
  detail: CaptureDetail,
  messages: Message[],
  output: Output | null,
): Promise<Blob> {
  const files: Record<string, Uint8Array> = {
    "context.md": strToU8(buildContextMarkdown(detail, messages)),
    "metadata.json": strToU8(buildMetadataJson(detail)),
    "README.txt": strToU8(
      [
        "Loom (ContextPort) full export bundle",
        "",
        "- context.md   lossless prompt/response transcript",
        output ? "- summary.md   distilled 5-section summary" : "- summary.md   (not generated yet)",
        "- metadata.json capture metadata and fidelity stats",
        "- assets/      rescued media saved with this chat",
      ].join("\n"),
    ),
  };
  if (output) files["summary.md"] = strToU8(buildSummaryMarkdown(output));
  await Promise.all(
    detail.assets.map(async (a) => {
      try {
        const res = await fetch(a.url);
        const buf = new Uint8Array(await res.arrayBuffer());
        files[`assets/${a.name}`] = buf;
      } catch {
        /* skip unreadable asset */
      }
    }),
  );
  const zipped = zipSync(files, { level: 6 });
  return new Blob([zipped as BlobPart], { type: "application/zip" });
}

export function mockOutputMarkdownFor(detail: CaptureDetail): string {
  return [
    `# ${detail.title} — Distilled Summary`,
    "",
    "## 1. Goal & Scope",
    `Distill the ${detail.stats.messages}-message "${detail.title}" thread from ${detail.platform} into a portable, lossless brief.`,
    "",
    "## 2. Key Decisions",
    "- Keep the transcript lossless: every turn preserved in `context.md`.",
    "- Distill into five fixed sections for predictable downstream consumption.",
    "",
    "## 3. Implementation Walkthrough",
    "- Normalized transcript, then distilled with the local model.",
    "- Code blocks, tables and rescued assets carried through untouched.",
    "",
    "## 4. Pitfalls & Edge Cases",
    "- Re-run the distillation after major edits to the source chat.",
    "",
    "## 5. Next Steps",
    "- Export the full bundle and drop it into your project docs.",
  ].join("\n");
}

export const mockFilenames = {
  context: (detail: CaptureDetail) => `${slugify(detail.title)}-context.md`,
  summary: (detail: CaptureDetail) => `${slugify(detail.title)}-summary.md`,
  zip: (detail: CaptureDetail) => `loom-${slugify(detail.title)}-v${detail.version}.zip`,
};
