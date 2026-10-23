import fs from 'fs';
import { scrapeChatHtml } from '../src/pipeline/htmlScraper.js';

const testFiles = [
  ['ChatGPT', 'plan/Testing files/Chat GPT/List Frequent GSoC Organizations.html'],
  ['Claude', 'plan/Testing files/Claude/Engineering project ideas with real-world impact - Claude.html'],
  ['Gemini', 'plan/Testing files/Gemini/Managing a Multi-Department Team - Google Gemini.html'],
  ['Grok', 'plan/Testing files/Grok/Finance Issues Discussion - Grok.html'],
  ['Perplexity', 'plan/Testing files/Perplexity/hi can you help me regarding my investments and how can i do them.html'],
];

console.log('Testing scraper across all platform test files:\n');

for (const [platform, filePath] of testFiles) {
  if (!fs.existsSync(filePath)) {
    console.log(`❌ ${platform}: File missing at ${filePath}`);
    continue;
  }

  const html = fs.readFileSync(filePath, 'utf-8');
  try {
    const result = scrapeChatHtml(html);
    console.log(`✅ [${platform}] Detected: ${result.platform}`);
    console.log(`   Title: "${result.title}"`);
    console.log(`   Messages scraped: ${result.messages.length}`);
    const userCount = result.messages.filter(m => m.role === 'USER').length;
    const asstCount = result.messages.filter(m => m.role === 'ASSISTANT').length;
    console.log(`   Turns: ${userCount} User, ${asstCount} Assistant\n`);
  } catch (err) {
    console.error(`❌ [${platform}] Error:`, err);
  }
}
