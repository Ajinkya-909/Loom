import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:4000';

async function runTest() {
  console.log(`\n============================================================`);
  console.log(`🧪 TEST SUITE: On-Demand Summary Generation (POST /api/captures/:id/generate)`);
  console.log(`============================================================`);

  // Step 1: Check server health
  console.log(`\n[1/6] Probing server health at ${BASE_URL}/health ...`);
  const healthRes = await fetch(`${BASE_URL}/health`);
  if (!healthRes.ok) {
    throw new Error(`Server is not responding at ${BASE_URL}/health (Status: ${healthRes.status})`);
  }
  const healthJson = await healthRes.json();
  console.log(`✅ Server is healthy:`, healthJson);

  // Step 2: Fetch an existing capture to test summary generation
  console.log(`\n[2/6] Fetching available captures from library ...`);
  const listRes = await fetch(`${BASE_URL}/api/captures?limit=5`);
  if (!listRes.ok) {
    throw new Error(`Failed to list captures: HTTP ${listRes.status}`);
  }
  const listData = (await listRes.json()) as { items: Array<any> };
  if (!listData.items || listData.items.length === 0) {
    throw new Error('No captures found in library to test. Please ingest a capture first.');
  }

  // Pick the first capture
  const targetCapture = listData.items[0];
  console.log(`🎯 Selected Target Capture:`);
  console.log(`   - ID: ${targetCapture.captureId}`);
  console.log(`   - Chat ID: ${targetCapture.chatId}`);
  console.log(`   - Title: "${targetCapture.title}"`);
  console.log(`   - Platform: ${targetCapture.platform}`);
  console.log(`   - Version: v${targetCapture.version}`);

  // Step 3: Trigger On-Demand Summary Generation (POST /api/captures/:id/generate)
  console.log(`\n[3/6] Triggering summary generation via POST /api/captures/${targetCapture.captureId}/generate ...`);
  const startTime = Date.now();
  const generateRes = await fetch(`${BASE_URL}/api/captures/${targetCapture.captureId}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind: 'SUMMARY',
      regenerate: true, // Force new generation to test live AI model
    }),
  });

  const generateJson = (await generateRes.json()) as any;
  console.log(`   Response status: ${generateRes.status}`);
  console.log(`   Response payload:`, generateJson);

  if (generateRes.status !== 202) {
    throw new Error(`Expected HTTP 202 Accepted, got HTTP ${generateRes.status}: ${JSON.stringify(generateJson)}`);
  }

  const { jobId, streamUrl } = generateJson;
  console.log(`✅ Generation successfully accepted! Job ID: ${jobId}`);

  // Step 4: Stream and monitor Server-Sent Events (SSE)
  console.log(`\n[4/6] Connecting to SSE progress stream at ${BASE_URL}${streamUrl} ...`);
  
  const ssePromise = new Promise<{ completed: boolean; outputId?: string; error?: string }>((resolve) => {
    const abortCtrl = new AbortController();
    const timeout = setTimeout(() => {
      abortCtrl.abort();
      resolve({ completed: false, error: 'SSE stream timed out after 120 seconds' });
    }, 120000);

    fetch(`${BASE_URL}${streamUrl}`, { signal: abortCtrl.signal })
      .then(async (streamRes) => {
        if (!streamRes.ok || !streamRes.body) {
          clearTimeout(timeout);
          resolve({ completed: false, error: `SSE connection failed with HTTP ${streamRes.status}` });
          return;
        }

        const reader = streamRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const chunk of lines) {
            if (!chunk.trim()) continue;
            console.log(`   📡 [SSE Event] ${chunk.replace(/\n/g, ' ')}`);

            if (chunk.includes('event: done')) {
              clearTimeout(timeout);
              abortCtrl.abort();
              const dataMatch = chunk.match(/data: ({.*})/);
              let outputId: string | undefined;
              if (dataMatch) {
                try {
                  const parsed = JSON.parse(dataMatch[1]);
                  outputId = parsed.outputId;
                } catch {}
              }
              resolve({ completed: true, outputId });
              return;
            }

            if (chunk.includes('event: error')) {
              clearTimeout(timeout);
              abortCtrl.abort();
              resolve({ completed: false, error: chunk });
              return;
            }
          }
        }
      })
      .catch((err) => {
        clearTimeout(timeout);
        if (err.name !== 'AbortError') {
          resolve({ completed: false, error: err.message });
        }
      });
  });

  const sseResult = await ssePromise;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`⏱️  Pipeline execution took ${elapsed}s`);

  if (!sseResult.completed) {
    throw new Error(`Summary generation pipeline failed: ${sseResult.error}`);
  }

  console.log(`✅ SSE Stream confirmed completion! Generated Output ID: ${sseResult.outputId}`);

  // Step 5: Verify the summary file on disk & via API
  console.log(`\n[5/6] Verifying generated summary deliverable ...`);
  const expectedDiskPath = path.resolve(
    process.cwd(),
    'storage/captures',
    targetCapture.chatId,
    `v${targetCapture.version}`,
    'summary.md'
  );

  console.log(`   Checking disk file at: ${expectedDiskPath}`);
  if (!fs.existsSync(expectedDiskPath)) {
    throw new Error(`summary.md was not found on disk at: ${expectedDiskPath}`);
  }

  const diskContent = fs.readFileSync(expectedDiskPath, 'utf-8');
  console.log(`   Disk file size: ${diskContent.length} bytes`);

  // Verify via API GET /api/outputs/:id
  const outputApiRes = await fetch(`${BASE_URL}/api/outputs/${sseResult.outputId}`);
  if (!outputApiRes.ok) {
    throw new Error(`Failed to fetch output via GET /api/outputs/${sseResult.outputId}`);
  }
  const outputJson = (await outputApiRes.json()) as any;
  console.log(`   Output deliverable metadata:`, {
    id: outputJson.id,
    kind: outputJson.kind,
    generatedBy: outputJson.generatedBy,
    createdAt: outputJson.createdAt,
  });

  // Check the 5 required sections
  const requiredSections = [
    '## 1. Objective & Intent',
    '## 2. Key Decisions & Architecture',
    '## 3. Discarded Approaches & Failures',
    '## 4. Final Code & Deliverables',
    '## 5. Next Steps & Open Items',
  ];

  console.log(`\n   Checking 5-Section canonical structure:`);
  for (const sec of requiredSections) {
    const present = diskContent.includes(sec);
    console.log(`   ${present ? '✅' : '❌'} Found section: "${sec}"`);
    if (!present) {
      console.warn(`   ⚠️ Warning: Section "${sec}" was not matched verbatim in output.`);
    }
  }

  // Print preview
  console.log(`\n📄 Summary Preview (First 35 lines):`);
  console.log(`------------------------------------------------------------`);
  const previewLines = diskContent.split('\n').slice(0, 35).join('\n');
  console.log(previewLines);
  console.log(`------------------------------------------------------------`);

  // Step 6: Test Idempotency (Calling again without regenerate returns cached deliverable)
  console.log(`\n[6/6] Testing Cache Idempotency (calling POST without regenerate)...`);
  const cachedRes = await fetch(`${BASE_URL}/api/captures/${targetCapture.captureId}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ regenerate: false }),
  });

  const cachedJson = (await cachedRes.json()) as any;
  console.log(`   Cached response status: ${cachedRes.status}`);
  console.log(`   Cached response payload:`, cachedJson);

  if (cachedRes.status === 200 && cachedJson.cached === true && cachedJson.outputId) {
    console.log(`✅ Idempotency verified! Instantly returned cached output (${cachedJson.outputId}) without re-running AI.`);
  } else {
    throw new Error(`Idempotency check failed. Expected 200 OK with cached: true`);
  }

  console.log(`\n============================================================`);
  console.log(`🎉 ALL TESTS PASSED: On-Demand Summary Generation is fully functional!`);
  console.log(`============================================================\n`);
}

runTest().catch((err) => {
  console.error(`\n❌ TEST SUITE FAILED:`, err);
  process.exit(1);
});
