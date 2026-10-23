/**
 * ============================================================================
 * Loom - Database Seeding Script (Sample Chats, Transcripts, Summaries & Assets)
 * ============================================================================
 * 
 * HOW TO RUN THIS SCRIPT:
 * 
 * 1. From the backend folder:
 *      cd backend
 *      npm run db:seed
 *    OR directly:
 *      cd backend
 *      npx tsx scripts/seedDb.ts
 * 
 * 2. From the root directory:
 *      npm --prefix backend run db:seed
 * 
 * WHAT THIS SCRIPT DOES:
 * - Populates PostgreSQL with 6 high-quality, realistic developer AI chats across
 *   ChatGPT, Claude, Gemini, Grok, Perplexity, and DeepSeek.
 * - Creates complete capture snapshots with code blocks, tables, and asset references.
 * - Generates canonical context.md documents and Gemma 4 structured summary.md files.
 * - Stores all physical files in backend/storage/captures/<chatId>/v1/.
 * - Provides a rich, populated 3-pane Web Workspace ready for screenshots and presentations!
 * ============================================================================
 */

import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { PrismaClient, Platform, CaptureStatus, OutputKind, JobType, JobStatus, MessageRole } from '@prisma/client';
import * as normalizer from '../src/pipeline/normalizer';

// Load environment variables (.env in backend or root)
const backendEnvPath = path.resolve(__dirname, '../.env');
const rootEnvPath = path.resolve(__dirname, '../../.env');

if (fs.existsSync(backendEnvPath)) {
  dotenv.config({ path: backendEnvPath });
} else if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else {
  dotenv.config();
}

const prisma = new PrismaClient();

interface SeedChatData {
  title: string;
  platform: Platform;
  sourceUrl: string;
  tags: string[];
  messages: Array<{
    role: MessageRole;
    text: string;
  }>;
  summaryMarkdown: string;
  sampleAssetFilename?: string;
  sampleAssetMime?: string;
}

const sampleChats: SeedChatData[] = [
  {
    title: 'Top Open-Source GSoC Organizations & Contribution Roadmap',
    platform: Platform.CHATGPT,
    sourceUrl: 'https://chatgpt.com/c/gsoc-orgs-roadmap-2026',
    tags: ['opensource', 'gsoc', 'python', 'community'],
    messages: [
      {
        role: MessageRole.USER,
        text: 'Can you list the most frequent organizations in Google Summer of Code (GSoC) that accept Python and Web development contributions, and give me a step-by-step roadmap for preparing early?',
      },
      {
        role: MessageRole.ASSISTANT,
        text: `Here are the most established organizations frequently participating in Google Summer of Code (GSoC) with strong Python and Web stacks:

### 🌟 High-Frequency GSoC Organizations

| Organization | Primary Languages | Focus Domain | Beginner Friendly? |
| :--- | :--- | :--- | :--- |
| **Python Software Foundation (PSF)** | Python, C | Core CPython, PyPI, Packaging | ⭐⭐⭐ Moderate |
| **Django Software Foundation** | Python, SQL, HTML/CSS | Web Framework, Async ORM | ⭐⭐⭐⭐ High |
| **Zulip** | Python (Django), TypeScript | Real-time Team Collaboration | ⭐⭐⭐⭐⭐ Extremely High |
| **CERN-HSF** | C++, Python, WebAssembly | High Energy Physics, Analysis | ⭐⭐ High Complexity |
| **OpenCV** | C++, Python | Computer Vision, Deep Learning | ⭐⭐⭐ Moderate |

### 🚀 Recommended 4-Month Preparation Roadmap

\`\`\`python
# sample_qualification_tracker.py
def check_gsoc_readiness(prs_merged: int, issues_filed: int, proposal_drafted: bool) -> str:
    readiness_score = (prs_merged * 20) + (issues_filed * 10) + (50 if proposal_drafted else 0)
    if readiness_score >= 100:
        return "Strong Candidate: Submit proposal before deadline!"
    return f"Keep Contributing: Current readiness {readiness_score}/100"

print(check_gsoc_readiness(prs_merged=3, issues_filed=5, proposal_drafted=True))
\`\`\`

1. **Month 1 (Exploration)**: Clone repositories, build the local dev environment, and fix documentation typos or good-first-issues.
2. **Month 2 (Core Contributions)**: Submit 2–3 meaningful feature PRs or unit test improvements.
3. **Month 3 (Proposal Formulation)**: Discuss ideas on Zulip/IRC developer channels and align with prospective mentors.
4. **Month 4 (Final Polish)**: Submit official proposal with detailed milestones and architectural diagrams.`,
      },
      {
        role: MessageRole.USER,
        text: 'What are the top 3 mistakes to avoid when drafting the final proposal?',
      },
      {
        role: MessageRole.ASSISTANT,
        text: `The 3 most common reasons proposals get rejected:
1. **Vague Timeline**: Not specifying weekly deliverables or test milestones.
2. **Zero Interaction Prior to Proposal**: Organizations rarely accept candidates who appear on deadline day without merged PRs.
3. **Underestimating Scope**: Trying to rewrite an entire subsystem instead of shipping a focused, production-ready module.`,
      },
    ],
    summaryMarkdown: `# Executive Summary: GSoC Organization & Candidate Strategy

> **Platform:** ChatGPT | **Model Distillation:** Gemma 4 | **Domain:** Open Source / Dev Career

## 📌 Executive Overview
Comprehensive roadmap identifying top open-source organizations in Google Summer of Code (Zulip, Django, PSF) and outlining a structured 4-month preparation strategy for aspiring contributors.

## 🎯 Key Recommendations
- **Target Zulip & Django** for modern fullstack Python/TypeScript development.
- **Engage early** in community chat platforms (Zulip channels, mailing lists) before proposal submission.
- Maintain consistent PR activity to prove commitment and codebase familiarity.

## 🛠️ Implementation Highlights
- Defined quantifiable candidate readiness tracker in Python.
- 4-phase milestone structure: Environment setup ➔ First PR ➔ Mentor Alignment ➔ Proposal Draft.

## 🚀 Immediate Next Steps
1. Select 1 target organization from the comparison table.
2. Complete local containerized dev setup and run test suite.
3. Claim one unassigned \`good-first-issue\` on GitHub.`,
  },
  {
    title: 'High-Impact Engineering Projects: AI, Microservices & IoT',
    platform: Platform.CLAUDE,
    sourceUrl: 'https://claude.ai/chat/engineering-impact-projects',
    tags: ['architecture', 'microservices', 'iot', 'system-design'],
    messages: [
      {
        role: MessageRole.USER,
        text: 'I want to build a capstone engineering project that solves a real-world problem and stands out on resumes. What are 3 novel, high-impact systems involving distributed backends and AI?',
      },
      {
        role: MessageRole.ASSISTANT,
        text: `Here are 3 high-impact engineering projects with enterprise-grade architectures:

### 1. Smart Grid Fault Isolation Engine (IoT + Distributed Stream Processing)
- **Problem**: Power distribution grids experience localized phase faults that take minutes to isolate manually.
- **Architecture**: Simulated IoT smart meters streaming telemetry over **Apache Kafka** to a **Rust** edge consumer that detects voltage anomalies using rolling exponential averages.
- **Tech Stack**: Rust, Kafka, TimescaleDB, Grafana, React.

### 2. Autonomous Document Compliance Redactor (Local LLM + Privacy Pipeline)
- **Problem**: Healthcare & legal teams cannot upload sensitive patient data or contracts to public cloud LLMs due to HIPAA/GDPR constraints.
- **Architecture**: A zero-cloud document parser using OCR + local **Gemma 4** for PII identification and deterministic PDF bounding box redaction.

\`\`\`typescript
// redactPipeline.ts
export interface RedactionRule {
  field: 'SSN' | 'PATIENT_NAME' | 'FINANCIAL_ACCOUNT';
  confidenceThreshold: number;
}

export async function processDocumentStream(docBuffer: Buffer, rules: RedactionRule[]) {
  const extractedText = await runLocalOcr(docBuffer);
  const piiSpans = await detectWithLocalGemma(extractedText, rules);
  return applyPdfRedactionMasks(docBuffer, piiSpans);
}
\`\`\`

### 3. Distributed Cache with Raft Consensus Engine
- **Problem**: Understanding distributed consensus, partition tolerance, and split-brain scenarios.
- **Architecture**: A Go or Rust implementation of the Raft consensus algorithm supporting distributed key-value replication, log compaction, and leader election.`,
      },
      {
        role: MessageRole.USER,
        text: 'Between Project 1 and Project 2, which one has higher recruiter appeal for cloud/backend roles?',
      },
      {
        role: MessageRole.ASSISTANT,
        text: `**Project 2 (Autonomous Privacy/AI Pipeline)** currently has the highest appeal:
1. **Industry Hot Topic**: Privacy-preserving on-device AI with open-weight models (Gemma) is actively sought after by enterprises.
2. **Full-Stack Depth**: Involves file processing, vectorization/embeddings, and robust backend microservices.`,
      },
    ],
    summaryMarkdown: `# Executive Summary: High-Impact Engineering Capstone Strategy

> **Platform:** Claude | **Model Distillation:** Gemma 4 | **Domain:** Distributed Systems & AI

## 📌 Executive Overview
Exploration of three architectural project designs demonstrating distributed systems, stream processing, and local AI compliance to maximize recruiter impact.

## 🏗️ Selected Architecture: Privacy-Preserving Redaction Engine
- **Core Technology:** Google Gemma 4 on-premise inference combined with deterministic PDF token masking.
- **Key Advantage:** Solves real enterprise HIPAA/GDPR data leakage concerns without third-party cloud exposure.

## ⚖️ Technical Trade-offs
- **Kafka Smart Grid:** Excellent for low-level systems and high throughput, but lacks visual showcase appeal.
- **Local AI Redactor:** Highest market relevance, visual proof-of-concept, and demonstrates modern AI engineering.

## 🚀 Immediate Next Steps
1. Initialize monorepo with Node.js/TypeScript backend and Ollama Gemma service.
2. Implement PDF text stream parser.`,
  },
  {
    title: 'Managing Multi-Department Engineering Teams & Sprint Velocity',
    platform: Platform.GEMINI,
    sourceUrl: 'https://gemini.google.com/app/multi-dept-team-leadership',
    tags: ['management', 'leadership', 'agile', 'sprint'],
    messages: [
      {
        role: MessageRole.USER,
        text: 'How should an engineering lead manage cross-department dependencies between Frontend, Backend, and Data Engineering teams during 2-week agile sprints without stalling releases?',
      },
      {
        role: MessageRole.ASSISTANT,
        text: `Managing cross-department dependencies requires shifting from **reactive sync meetings** to **contract-first development**:

### 🎯 The 4 Pillars of Cross-Team Alignment

1. **API Contract-First Design**:
   - Backend and Frontend teams align on an OpenAPI / JSON schema specification on **Day 1** of the sprint.
   - Frontend mocks the endpoints immediately using Mock Service Worker (MSW) or Prism, eliminating dependency wait times.

2. **Decoupled Release Trains**:
   - Feature flags (e.g., LaunchDarkly or Unleash) allow backend migrations to merge into main without exposing incomplete UI states to end users.

3. **Buffer Sprints for Data Pipelines**:
   - Data Engineering tasks typically have a 1-sprint latency offset because model training relies on schema changes stabilized in preceding sprints.

\`\`\`yaml
# cross-team-sprint-flow.yaml
sprint_day_1:
  action: "Review OpenAPI Contract & PR Schema"
  owners: [Backend-Lead, Frontend-Lead]
sprint_day_2_to_8:
  action: "Parallel Implementation (FE on Mock Server, BE on DB Migrations)"
sprint_day_9:
  action: "Integration Testing on Staging Environment"
sprint_day_10:
  action: "Canary Deployment behind Feature Flag"
\`\`\``,
      },
    ],
    summaryMarkdown: `# Executive Summary: Cross-Functional Engineering Alignment

> **Platform:** Google Gemini | **Model Distillation:** Gemma 4 | **Domain:** Engineering Management

## 📌 Executive Overview
Framework for eliminating cross-team blocking dependencies between Frontend, Backend, and Data Engineering via contract-first development and feature-flagged release trains.

## 🎯 Key Methodologies
- **Contract-First:** OpenAPI schemas finalized on Day 1 to enable immediate unblocked frontend mocking.
- **Canary Flags:** Code merged continuously without waiting for simultaneous multi-service deployments.

## 🚀 Immediate Next Steps
1. Establish standard OpenAPI pull request review templates.
2. Implement staging mock service worker for UI pair programming.`,
  },
  {
    title: 'Algorithmic Risk Management & Order Execution Systems',
    platform: Platform.GROK,
    sourceUrl: 'https://x.com/i/grok/c/algorithmic-risk-finance',
    tags: ['finance', 'python', 'algorithms', 'risk'],
    messages: [
      {
        role: MessageRole.USER,
        text: 'Explain how algorithmic trading systems manage real-time risk exposure using Value at Risk (VaR) and circuit breakers during high market volatility.',
      },
      {
        role: MessageRole.ASSISTANT,
        text: `Modern algorithmic trading systems implement multi-tiered risk layers operating in sub-millisecond execution cycles:

### 🛡️ Multi-Tier Risk Controls

1. **Pre-Trade Risk Checks (Latency: <50μs)**:
   - Verifies available margin, maximum order size, and symbol price deviations before orders hit the exchange gateway.
2. **Real-time Value at Risk (Parametric & Historical VaR)**:
   - Evaluates portfolio-level 99% 1-day drawdown potential across open positions.
3. **Automated Kill Switches**:
   - Triggers instantaneous cancel-on-disconnect and liquidates positions if daily drawdown breaches 2.5%.

\`\`\`python
# risk_engine.py
import numpy as np

def calculate_parametric_var(portfolio_value: float, confidence_level: float = 0.99, daily_volatility: float = 0.02) -> float:
    z_score = 2.326  # 99% confidence standard normal quantile
    var_dollar = portfolio_value * z_score * daily_volatility
    return var_dollar

current_var = calculate_parametric_var(portfolio_value=1_000_000, daily_volatility=0.018)
print("99% 1-Day VaR: $" + f"{current_var:,.2f}")
\`\`\``,
      },
    ],
    summaryMarkdown: `# Executive Summary: High-Frequency Risk Engine Architecture

> **Platform:** Grok | **Model Distillation:** Gemma 4 | **Domain:** Quantitative Finance

## 📌 Executive Overview
Architecture review of algorithmic risk management architectures including sub-millisecond pre-trade gates, Value at Risk (VaR) bounds, and automated kill switches.

## 🛠️ Key Technical Components
- Parametric VaR computed at 99% confidence level.
- Multi-tier latency gates ensuring non-compliant orders are dropped before reaching market gateways.

## 🚀 Immediate Next Steps
1. Run sensitivity stress tests on portfolio asset correlation matrices.`,
  },
  {
    title: 'Long-Term Tech Investment Allocation & Index Hedging',
    platform: Platform.PERPLEXITY,
    sourceUrl: 'https://perplexity.ai/search/long-term-tech-investments',
    tags: ['finance', 'investing', 'strategy', 'portfolio'],
    messages: [
      {
        role: MessageRole.USER,
        text: 'What are the most evidence-based investment strategies for a software engineer looking to allocate savings across index funds and tech sectors over a 15-year horizon?',
      },
      {
        role: MessageRole.ASSISTANT,
        text: `For a 15-year horizon, academic literature strongly favors a **Core-and-Satellite Index Strategy**:

### 📊 Recommended Allocation Model

| Asset Class | Allocation | Target Index / Vehicle | Rationale |
| :--- | :--- | :--- | :--- |
| **Core Global Equities** | 60% | Total World Market (VTI / VXUS) | Broad macroeconomic diversification |
| **Tech Growth Satellite** | 25% | Nasdaq-100 (QQQ / QQQM) | High-beta exposure to cloud & AI infrastructure |
| **Defensive Assets** | 10% | Treasury Bills / Short-Term Govt Bonds | Volatility dampener and rebalancing liquidity |
| **Cash Reserves** | 5% | High-Yield Savings Account (HYSA) | 6-month emergency buffer |

### Key Tenets:
1. **Dollar-Cost Averaging (DCA)**: Automate contributions monthly to neutralize market timing anxiety.
2. **Tax-Advantaged Accounts First**: Maximize 401(k) / IRA matching prior to taxable brokerage accounts.
3. **Annual Rebalancing**: Trim outperforming sectors back to target weightings to lock in gains.`,
      },
    ],
    summaryMarkdown: `# Executive Summary: 15-Year Core-Satellite Portfolio Allocation

> **Platform:** Perplexity | **Model Distillation:** Gemma 4 | **Domain:** Personal Finance

## 📌 Executive Overview
Evidence-based portfolio design for technology professionals balancing diversified global equity index exposure with high-growth tech sector satellites.

## 📈 Strategic Asset Distribution
- **60% Core Broad Market**: Resilient foundation across domestic and international markets.
- **25% Tech Satellite**: Captures compound upside of AI and enterprise software expansion.
- **15% Defensive Buffer**: Liquid stability for opportunistic rebalancing during corrections.

## 🚀 Immediate Next Steps
1. Set up automatic monthly DCA deposits.
2. Schedule automated calendar reminder for annual portfolio rebalancing.`,
  },
  {
    title: 'High-Throughput Microservices with Rust & Apache Kafka',
    platform: Platform.DEEPSEEK,
    sourceUrl: 'https://chat.deepseek.com/c/rust-microservices-kafka',
    tags: ['rust', 'kafka', 'performance', 'distributed'],
    messages: [
      {
        role: MessageRole.USER,
        text: 'How can we structure an ultra-low latency event-driven microservice in Rust consuming 100k events/sec from Apache Kafka with zero memory allocations on the hot path?',
      },
      {
        role: MessageRole.ASSISTANT,
        text: `Achieving 100k+ events/sec in Rust requires **zero-copy deserialization** and **batched async channel ingestion**:

### ⚡ Architectural Blueprint

\`\`\`rust
// consumer.rs
use rdkafka::consumer::{StreamConsumer, Consumer};
use rdkafka::Message;

pub async fn run_event_loop(consumer: StreamConsumer) {
    loop {
        match consumer.recv().await {
            Ok(msg) => {
                if let Some(payload) = msg.payload() {
                    // Zero-copy parse using rkyv or postcard
                    process_zero_copy_frame(payload);
                }
            }
            Err(e) => eprintln!("Kafka recv error: {:?}", e),
        }
    }
}

#[inline(always)]
fn process_zero_copy_frame(raw_bytes: &[u8]) {
    // Hot-path processing without heap allocation
}
\`\`\`

### Key Optimizations:
1. **Zero-Copy Deserialization**: Use \`rkyv\` instead of \`serde_json\` to access struct fields directly from Kafka's byte slice without heap allocation.
2. **Core Pinning**: Pin Kafka consumer threads to dedicated CPU cores via \`core_affinity\`.
3. **Ring Buffer Queues**: Pass events to worker pools using crossbeam bounded channels.`,
      },
    ],
    summaryMarkdown: `# Executive Summary: Zero-Allocation Rust Microservice on Kafka

> **Platform:** DeepSeek | **Model Distillation:** Gemma 4 | **Domain:** High-Performance Systems

## 📌 Executive Overview
Technical blueprint for building sub-millisecond event ingestion microservices in Rust capable of processing 100k+ messages/sec with zero allocations on the critical hot path.

## ⚡ Core Technical Principles
- **Zero-Copy Frame Processing:** Replacing traditional JSON serialization with direct memory-mapped buffer validation.
- **Hardware Affinity:** Dedicated thread pinning preventing OS context-switch overheads.

## 🚀 Immediate Next Steps
1. Benchmark deserialization throughput using Criterion.rs.
2. Configure Kafka partition balancing across consumer instances.`,
  },
];

async function seedDatabase() {
  console.log('\n============================================================');
  console.log('🌱 LOOM SEED DATABASE SCRIPT (6 Multi-Platform Real Chats)');
  console.log('============================================================');

  try {
    console.log('\n🔌 Connecting to PostgreSQL database...');
    await prisma.$connect();
    console.log('✅ Connected successfully.\n');

    const storageCapturesDir = path.resolve(__dirname, '../storage/captures');
    fs.mkdirSync(storageCapturesDir, { recursive: true });

    // Source sample logo / asset to attach as real media files
    const sourceAssetPath = path.resolve(__dirname, '../../assets/logo.png');
    const hasSourceAsset = fs.existsSync(sourceAssetPath);

    let chatCounter = 0;

    for (const data of sampleChats) {
      chatCounter++;
      console.log(`\n[${chatCounter}/6] Creating Chat: "${data.title}" (${data.platform}) ...`);

      // 1. Create Chat
      const chat = await prisma.chat.create({
        data: {
          platform: data.platform,
          sourceUrl: data.sourceUrl,
          title: data.title,
          tags: data.tags,
        },
      });

      // 2. Setup directory structure
      const version = 1;
      const captureDiskDir = path.join(storageCapturesDir, chat.id, `v${version}`);
      const assetsDiskDir = path.join(captureDiskDir, 'assets');
      const rawDiskDir = path.join(captureDiskDir, 'raw');

      fs.mkdirSync(captureDiskDir, { recursive: true });
      fs.mkdirSync(assetsDiskDir, { recursive: true });
      fs.mkdirSync(rawDiskDir, { recursive: true });

      // 3. Compute stats & content hash
      const totalChars = data.messages.reduce((acc, m) => acc + m.text.length, 0);
      const tokenEstimate = Math.ceil(totalChars / 4);
      const contentHash = crypto.createHash('sha256').update(JSON.stringify(data.messages)).digest('hex');

      const stats = {
        messageCount: data.messages.length,
        tokenEstimate,
        codeBlockCount: data.messages.filter((m) => m.text.includes('```')).length,
        tableCount: data.messages.filter((m) => m.text.includes('|')).length,
        assetCount: hasSourceAsset ? 1 : 0,
      };

      // 4. Create Capture
      const capture = await prisma.capture.create({
        data: {
          chatId: chat.id,
          version,
          contentHash,
          status: CaptureStatus.READY,
          rawPath: `captures/${chat.id}/v${version}`,
          stats,
        },
      });

      // 5. Create Asset if available
      const assetRecords: any[] = [];
      if (hasSourceAsset) {
        const assetId = crypto.randomUUID();
        const assetFilename = `architecture_diagram_${chatCounter}.png`;
        const destAssetPath = path.join(assetsDiskDir, assetFilename);

        fs.copyFileSync(sourceAssetPath, destAssetPath);

        const asset = await prisma.asset.create({
          data: {
            id: assetId,
            captureId: capture.id,
            messageIdx: 1,
            mime: 'image/png',
            originalUrl: `${data.sourceUrl}/assets/${assetFilename}`,
            localPath: `assets/${assetFilename}`,
            sha256: crypto.createHash('sha256').update(fs.readFileSync(destAssetPath)).digest('hex'),
          },
        });

        assetRecords.push({
          id: asset.id,
          messageIdx: 1,
          localPath: asset.localPath,
          mime: asset.mime,
        });
      }

      // 6. Create Messages & normalize blocks
      const messageRecords: any[] = [];
      for (let i = 0; i < data.messages.length; i++) {
        const msg = data.messages[i];
        const blocks = normalizer.parseTextIntoBlocks(msg.text);
        const msgTokens = normalizer.estimateTokens(msg.text);

        await prisma.message.create({
          data: {
            captureId: capture.id,
            idx: i,
            role: msg.role,
            textPlain: msg.text,
            blocks: blocks as any,
            tokenEstimate: msgTokens,
          },
        });

        messageRecords.push({
          idx: i,
          role: msg.role,
          text: msg.text,
          blocks,
        });
      }

      // 7. Generate canonical context.md
      const contextMarkdown = normalizer.buildContextMarkdown(
        data.title,
        data.platform,
        data.sourceUrl,
        capture.createdAt.toISOString(),
        messageRecords,
        assetRecords
      );

      const contextFilePath = path.join(captureDiskDir, 'context.md');
      fs.writeFileSync(contextFilePath, contextMarkdown, 'utf-8');

      await prisma.output.create({
        data: {
          captureId: capture.id,
          kind: OutputKind.CONTEXT,
          markdown: contextMarkdown,
          filePath: contextFilePath,
          generatedBy: { tool: 'Loom Normalizer', version: '1.0.0' },
        },
      });

      // 8. Generate summary.md (Gemma 4 Distillation)
      const summaryFilePath = path.join(captureDiskDir, 'summary.md');
      fs.writeFileSync(summaryFilePath, data.summaryMarkdown, 'utf-8');

      await prisma.output.create({
        data: {
          captureId: capture.id,
          kind: OutputKind.SUMMARY,
          markdown: data.summaryMarkdown,
          filePath: summaryFilePath,
          generatedBy: { tool: 'Gemma 4 Distillation Pipeline', model: 'gemma4' },
        },
      });

      // 9. Create Completed Job record
      await prisma.job.create({
        data: {
          captureId: capture.id,
          type: JobType.INGEST_AND_NORMALIZE,
          stage: 'completed',
          status: JobStatus.COMPLETED,
          progress: 1.0,
        },
      });

      // 10. Save raw messages.json
      fs.writeFileSync(path.join(rawDiskDir, 'messages.json'), JSON.stringify(data.messages, null, 2), 'utf-8');

      console.log(`   ✅ Chat & Capture seeded (v1, ${data.messages.length} messages, ${stats.tokenEstimate} tokens, hasSummary: YES)`);
    }

    console.log('\n============================================================');
    console.log('🎉 DATABASE SEEDING COMPLETED SUCCESSFULLY!');
    console.log('📸 6 realistic multi-platform AI chats are ready in your library.');
    console.log('✨ You can now open http://localhost:8080 and take your screenshots!');
    console.log('============================================================\n');
  } catch (error) {
    console.error('\n❌ Error seeding database:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seedDatabase();
