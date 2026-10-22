import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';

export type PlatformEnum =
  | 'CHATGPT'
  | 'CLAUDE'
  | 'GEMINI'
  | 'DEEPSEEK'
  | 'PERPLEXITY'
  | 'GENERIC';

export interface ScrapedMessage {
  idx: number;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  textPlain: string;
}

export interface ScrapedResult {
  title: string;
  sourceUrl: string;
  platform: PlatformEnum;
  messages: ScrapedMessage[];
}

/**
 * Clean platform branding from page title (e.g., "Casual Greeting Reply - ChatGPT" -> "Casual Greeting Reply")
 */
function cleanTitle(rawTitle: string): string {
  return rawTitle
    .replace(/\s*[-–—|]\s*(ChatGPT|Claude|Gemini|Perplexity|DeepSeek).*/i, '')
    .trim() || 'Untitled Chat';
}

/**
 * Detect AI platform from HTML markers, scripts, and meta tags.
 */
export function detectPlatform(html: string, $: cheerio.CheerioAPI): PlatformEnum {
  const lowerHtml = html.toLowerCase();

  if (
    lowerHtml.includes('chatgpt.com') ||
    lowerHtml.includes('oaistatic') ||
    $('[data-chatgpt-search-unit-key]').length > 0 ||
    $('[data-markdown-text-style="assistant-message"]').length > 0 ||
    $('script#client-bootstrap').length > 0
  ) {
    return 'CHATGPT';
  }

  if (
    lowerHtml.includes('claude.ai') ||
    lowerHtml.includes('anthropic') ||
    $('[data-testid*="claude"]').length > 0 ||
    $('.font-claude-message').length > 0
  ) {
    return 'CLAUDE';
  }

  if (
    lowerHtml.includes('gemini.google.com') ||
    lowerHtml.includes('bard.google.com') ||
    $('sparkler-chat-turn').length > 0 ||
    $('user-query-container').length > 0 ||
    $('model-response').length > 0
  ) {
    return 'GEMINI';
  }

  if (lowerHtml.includes('deepseek.com')) {
    return 'DEEPSEEK';
  }

  if (lowerHtml.includes('perplexity.ai')) {
    return 'PERPLEXITY';
  }

  return 'GENERIC';
}

/**
 * Detect source URL from canonical links, OpenGraph tags, or in-DOM thread links.
 */
function extractSourceUrl($: cheerio.CheerioAPI, platform: PlatformEnum): string {
  const canonical = $('link[rel="canonical"]').attr('href');
  if (canonical && canonical.startsWith('http')) return canonical;

  const ogUrl = $('meta[property="og:url"]').attr('content');
  if (ogUrl && ogUrl.startsWith('http')) return ogUrl;

  // ChatGPT specific: look for conversation link
  if (platform === 'CHATGPT') {
    const threadLink = $('a[href*="/c/"]').attr('href');
    if (threadLink) {
      if (threadLink.startsWith('http')) return threadLink;
      return `https://chatgpt.com${threadLink}`;
    }
  }

  return 'https://chatgpt.com';
}

/**
 * Convert an HTML table element to Markdown table syntax.
 */
function convertTableToMarkdown($: cheerio.CheerioAPI, tableEl: Element): string {
  const rows: string[][] = [];

  $(tableEl)
    .find('tr')
    .each((_, tr) => {
      const row: string[] = [];
      $(tr)
        .find('th, td')
        .each((_, cell) => {
          // Normalize internal whitespace
          const cellText = $(cell).text().trim().replace(/\|/g, '\\|').replace(/\n+/g, ' ');
          row.push(cellText);
        });
      if (row.length > 0) rows.push(row);
    });

  if (rows.length === 0) return '';

  const colCount = Math.max(...rows.map((r) => r.length));
  const normalizedRows = rows.map((r) => {
    while (r.length < colCount) r.push('');
    return r;
  });

  const headerRow = normalizedRows[0];
  const separatorRow = new Array(colCount).fill('---');
  const dataRows = normalizedRows.slice(1);

  const lines: string[] = [];
  lines.push(`| ${headerRow.join(' | ')} |`);
  lines.push(`| ${separatorRow.join(' | ')} |`);
  for (const dr of dataRows) {
    lines.push(`| ${dr.join(' | ')} |`);
  }

  return lines.join('\n');
}

/**
 * Convert an HTML list (ul/ol) to Markdown list syntax.
 */
function convertListToMarkdown($: cheerio.CheerioAPI, listEl: Element, isOrdered: boolean): string {
  const items: string[] = [];
  $(listEl)
    .children('li')
    .each((i, li) => {
      const text = $(li).text().trim();
      const prefix = isOrdered ? `${i + 1}. ` : '- ';
      items.push(`${prefix}${text}`);
    });
  return items.join('\n');
}

/**
 * Extract rich Markdown from an assistant message element, preserving code fences, tables, and formatting.
 */
function extractMarkdownFromElement($: cheerio.CheerioAPI, container: cheerio.Cheerio<Element>): string {
  const parts: string[] = [];

  container.children().each((_, child) => {
    const tagName = child.tagName?.toLowerCase();

    if (tagName === 'pre') {
      // Code block
      const codeEl = $(child).find('code');
      const langClass = (codeEl.attr('class') || '')
        .split(' ')
        .find((c) => c.startsWith('language-'));
      const lang = langClass ? langClass.replace('language-', '') : '';
      const codeText = codeEl.length > 0 ? codeEl.text() : $(child).text();
      parts.push(`\`\`\`${lang}\n${codeText.replace(/\r\n/g, '\n')}\n\`\`\``);
    } else if (tagName === 'table') {
      // Table
      const mdTable = convertTableToMarkdown($, child);
      if (mdTable) parts.push(mdTable);
    } else if (tagName === 'ul') {
      parts.push(convertListToMarkdown($, child, false));
    } else if (tagName === 'ol') {
      parts.push(convertListToMarkdown($, child, true));
    } else if (tagName === 'blockquote') {
      const text = $(child).text().trim();
      parts.push(text.split('\n').map((l) => `> ${l}`).join('\n'));
    } else if (/^h[1-6]$/.test(tagName)) {
      const level = '#'.repeat(parseInt(tagName[1], 10));
      parts.push(`${level} ${$(child).text().trim()}`);
    } else {
      // Paragraph or div or other wrapper
      // Check if this element contains pre or table internally
      if ($(child).find('pre, table, ul, ol').length > 0) {
        parts.push(extractMarkdownFromElement($, $(child)));
      } else {
        const text = $(child).text().trim();
        if (text) parts.push(text);
      }
    }
  });

  return parts.filter(Boolean).join('\n\n');
}

/**
 * Scrape conversation from ChatGPT DOM structure.
 */
function scrapeChatGPT($: cheerio.CheerioAPI): ScrapedMessage[] {
  const messages: ScrapedMessage[] = [];

  // Modern search unit selector
  const units = $('[data-chatgpt-search-unit-key]');
  if (units.length > 0) {
    units.each((_, el) => {
      const key = $(el).attr('data-chatgpt-search-unit-key') || '';
      if (key.includes(':user')) {
        // Find bubble, removing reaction badges and action buttons
        const bubble = $(el).find('[data-user-message-bubble="true"]');
        let text = '';
        if (bubble.length > 0) {
          const clone = bubble.clone();
          clone.find('[role="img"], button, svg').remove();
          text = clone.text().trim();
        } else {
          text = $(el).text().trim();
        }
        if (text) {
          messages.push({
            idx: messages.length,
            role: 'USER',
            textPlain: text,
          });
        }
      } else if (key.includes(':assistant')) {
        const markdownRoot = $(el).find('[data-markdown-text-style="assistant-message"]');
        let text = '';
        if (markdownRoot.length > 0) {
          text = extractMarkdownFromElement($, markdownRoot);
        } else {
          text = $(el).text().trim();
        }
        if (text) {
          messages.push({
            idx: messages.length,
            role: 'ASSISTANT',
            textPlain: text,
          });
        }
      }
    });
    if (messages.length > 0) return messages;
  }

  // Fallback 1: data-message-author-role (older ChatGPT)
  $('[data-message-author-role]').each((_, el) => {
    const roleAttr = $(el).attr('data-message-author-role')?.toLowerCase();
    const role = roleAttr === 'user' ? 'USER' : 'ASSISTANT';
    const text = $(el).text().trim();
    if (text) {
      messages.push({
        idx: messages.length,
        role,
        textPlain: text,
      });
    }
  });
  if (messages.length > 0) return messages;

  // Fallback 2: user-message class
  $('.group\\/user-message, [data-user-message-bubble="true"]').each((_, el) => {
    const text = $(el).text().trim();
    if (text) {
      messages.push({
        idx: messages.length,
        role: 'USER',
        textPlain: text,
      });
    }
  });

  return messages;
}

/**
 * Scrape conversation from Claude DOM structure.
 */
function scrapeClaude($: cheerio.CheerioAPI): ScrapedMessage[] {
  const messages: ScrapedMessage[] = [];

  $('[data-test-render-count], .font-user-message, .font-claude-message').each((_, el) => {
    const isUser = $(el).hasClass('font-user-message') || $(el).attr('data-testid')?.includes('user');
    const role = isUser ? 'USER' : 'ASSISTANT';
    const text = $(el).text().trim();
    if (text) {
      messages.push({
        idx: messages.length,
        role,
        textPlain: text,
      });
    }
  });

  return messages;
}

/**
 * Scrape conversation from Gemini DOM structure.
 */
function scrapeGemini($: cheerio.CheerioAPI): ScrapedMessage[] {
  const messages: ScrapedMessage[] = [];

  $('user-query-container, model-response, .query-content, .model-response-text').each((_, el) => {
    const tagName = el.tagName?.toLowerCase();
    const isUser = tagName === 'user-query-container' || $(el).hasClass('query-content');
    const role = isUser ? 'USER' : 'ASSISTANT';
    const text = $(el).text().trim();
    if (text) {
      messages.push({
        idx: messages.length,
        role,
        textPlain: text,
      });
    }
  });

  return messages;
}

/**
 * Generic DOM scraping fallback for unknown or unbranded chat layouts.
 */
function scrapeGeneric($: cheerio.CheerioAPI): ScrapedMessage[] {
  const messages: ScrapedMessage[] = [];

  $('article, [role="article"]').each((i, el) => {
    const text = $(el).text().trim();
    if (text) {
      messages.push({
        idx: messages.length,
        role: i % 2 === 0 ? 'USER' : 'ASSISTANT',
        textPlain: text,
      });
    }
  });

  return messages;
}

/**
 * Main Scraper Entry Point:
 * Ingests raw HTML content and produces a normalized ScrapedResult.
 */
export function scrapeChatHtml(rawHtml: string): ScrapedResult {
  const $ = cheerio.load(rawHtml);

  // 1. Title
  const rawTitle = $('title').first().text().trim() || 'Untitled Chat';
  const title = cleanTitle(rawTitle);

  // 2. Platform
  const platform = detectPlatform(rawHtml, $);

  // 3. Source URL
  const sourceUrl = extractSourceUrl($, platform);

  // 4. Messages
  let messages: ScrapedMessage[] = [];
  switch (platform) {
    case 'CHATGPT':
      messages = scrapeChatGPT($);
      break;
    case 'CLAUDE':
      messages = scrapeClaude($);
      break;
    case 'GEMINI':
      messages = scrapeGemini($);
      break;
    default:
      messages = scrapeGeneric($);
      break;
  }

  // If platform-specific didn't find messages, try ChatGPT fallback, then generic
  if (messages.length === 0) {
    messages = scrapeChatGPT($);
  }
  if (messages.length === 0) {
    messages = scrapeGeneric($);
  }

  return {
    title,
    sourceUrl,
    platform,
    messages,
  };
}
