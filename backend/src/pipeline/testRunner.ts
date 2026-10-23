import fs from 'fs';
import path from 'path';

interface RunResult {
  folder: string;
  success: boolean;
  chatId?: string;
  captureId?: string;
  version?: number;
  duplicate?: boolean;
  contextMarkdownPath?: string;
  markdownPreview?: string;
  messageCount?: number;
  error?: string;
}

export async function testPlatformFolder(folderName: string): Promise<RunResult> {
  const baseDir = path.resolve(__dirname, '../../../plan/Testing files', folderName);
  console.log(`\n============================================================`);
  console.log(`🚀 TESTING AI MODEL: [${folderName}]`);
  console.log(`📁 Directory: ${baseDir}`);
  console.log(`============================================================`);

  if (!fs.existsSync(baseDir)) {
    return { folder: folderName, success: false, error: `Folder not found: ${baseDir}` };
  }

  // 1. Locate the HTML file
  const allFiles = fs.readdirSync(baseDir);
  const htmlFile = allFiles.find((f) => f.endsWith('.html') || f.endsWith('.htm'));
  if (!htmlFile) {
    return { folder: folderName, success: false, error: 'No .html file found in folder' };
  }

  const htmlPath = path.join(baseDir, htmlFile);
  const htmlStats = fs.statSync(htmlPath);
  console.log(`📄 Found snapshot: "${htmlFile}" (${(htmlStats.size / 1024).toFixed(1)} KB)`);

  // 2. Locate any asset files in _files directory
  const filesDir = allFiles.find((f) => f.endsWith('_files') && fs.statSync(path.join(baseDir, f)).isDirectory());
  const assetBuffers: Array<{ name: string; buffer: Buffer; mime: string }> = [];

  if (filesDir) {
    const assetsDirPath = path.join(baseDir, filesDir);
    const subFiles = fs.readdirSync(assetsDirPath);
    for (const file of subFiles) {
      // Pick images, pdfs, diagrams
      if (/\.(png|jpe?g|webp|svg|gif|pdf)$/i.test(file)) {
        const filePath = path.join(assetsDirPath, file);
        const buf = fs.readFileSync(filePath);
        let mime = 'application/octet-stream';
        if (file.endsWith('.png')) mime = 'image/png';
        else if (/\.jpe?g$/i.test(file)) mime = 'image/jpeg';
        else if (file.endsWith('.svg')) mime = 'image/svg+xml';
        else if (file.endsWith('.webp')) mime = 'image/webp';
        else if (file.endsWith('.pdf')) mime = 'application/pdf';
        assetBuffers.push({ name: file, buffer: buf, mime });
      }
    }
  }
  console.log(`🖼️  Found ${assetBuffers.length} media asset(s) to upload`);

  // 3. Build multipart form data
  const form = new FormData();
  const htmlBlob = new Blob([fs.readFileSync(htmlPath)], { type: 'text/html' });
  form.append('snapshot', htmlBlob, htmlFile);

  for (const asset of assetBuffers) {
    const assetBlob = new Blob([asset.buffer], { type: asset.mime });
    form.append('assets', assetBlob, asset.name);
  }

  // 4. Send request to POST /api/captures
  console.log(`🌐 Submitting to POST http://localhost:4000/api/captures ...`);
  const startTime = Date.now();
  const response = await fetch('http://localhost:4000/api/captures', {
    method: 'POST',
    body: form,
  });

  const durationMs = Date.now() - startTime;
  const json = (await response.json()) as any;

  if (!response.ok) {
    console.error(`❌ HTTP ${response.status} Error:`, json);
    return { folder: folderName, success: false, error: JSON.stringify(json) };
  }

  console.log(`✅ Server responded with HTTP ${response.status} in ${durationMs}ms:`);
  console.log(JSON.stringify(json, null, 2));

  // 5. Read generated context.md from disk
  const chatId = json.chatId;
  const version = json.version;
  const contextPath = path.resolve(
    __dirname,
    '../../storage/captures',
    chatId,
    `v${version}`,
    'context.md'
  );

  let markdownContent = '';
  if (fs.existsSync(contextPath)) {
    markdownContent = fs.readFileSync(contextPath, 'utf-8');
    console.log(`\n📄 Generated context.md (${markdownContent.length} chars, saved at: ${contextPath}):`);
    console.log(`------------------------------------------------------------`);
    // Print first 40 lines of context.md
    const lines = markdownContent.split('\n');
    console.log(lines.slice(0, 45).join('\n'));
    if (lines.length > 45) {
      console.log(`\n... [${lines.length - 45} more lines in context.md] ...`);
    }
    console.log(`------------------------------------------------------------`);
  } else {
    console.warn(`⚠️ context.md not found at ${contextPath}`);
  }

  return {
    folder: folderName,
    success: true,
    chatId,
    captureId: json.captureId,
    version,
    duplicate: json.duplicate,
    contextMarkdownPath: contextPath,
    markdownPreview: markdownContent.substring(0, 500),
  };
}

// CLI argument execution: npx tsx src/pipeline/testRunner.ts "Chat GPT"
const targetArg = process.argv[2] || 'Chat GPT';
testPlatformFolder(targetArg).catch(console.error);
