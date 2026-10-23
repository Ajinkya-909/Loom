// Global FormData and Blob in Node 20+

async function testIngest() {
  const form = new FormData();

  const meta = {
    action: 'context',
    platform: 'chatgpt',
    sourceUrl: 'https://chatgpt.com/c/test-live-integration',
    title: 'Live Extension Integration Test',
    expected: {
      messageCount: 2,
      codeBlockCount: 1,
      tableCount: 0,
      imageCount: 0,
    },
  };

  const messages = [
    {
      idx: 0,
      role: 'user',
      text: 'How does Loom ingest context from the extension?',
    },
    {
      idx: 1,
      role: 'assistant',
      text: 'Loom receives the multipart payload, normalizes text into typed blocks, and generates canonical context.md.',
    },
  ];

  form.append('meta', new Blob([JSON.stringify(meta)], { type: 'application/json' }), 'meta.json');
  form.append('messages', new Blob([JSON.stringify(messages)], { type: 'application/json' }), 'messages.json');
  form.append('snapshot', new Blob(['<html><title>Live Extension Integration Test - ChatGPT</title><body>chat</body></html>'], { type: 'text/html' }), 'snapshot.html');

  console.log('Sending capture to http://localhost:4000/api/captures ...');
  const res = await fetch('http://localhost:4000/api/captures', {
    method: 'POST',
    body: form,
  });

  console.log('Status:', res.status);
  const data = await res.json();
  console.log('Response:', data);

  // Test duplicate detection
  console.log('\nTesting duplicate detection (re-sending same capture)...');
  const dupRes = await fetch('http://localhost:4000/api/captures', {
    method: 'POST',
    body: form,
  });
  console.log('Duplicate Status:', dupRes.status);
  const dupData = await dupRes.json();
  console.log('Duplicate Response:', dupData);

  // Test force capture
  console.log('\nTesting force capture (?force=1)...');
  const forceRes = await fetch('http://localhost:4000/api/captures?force=1', {
    method: 'POST',
    body: form,
  });
  console.log('Force Status:', forceRes.status);
  const forceData = await forceRes.json();
  console.log('Force Response:', forceData);
}

testIngest().catch(console.error);
