import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';

export type PlatformEnum =
  | 'CHATGPT'
  | 'CLAUDE'
  | 'GEMINI'
  | 'DEEPSEEK'
  | 'PERPLEXITY'
  | 'GROK'
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
 * Clean platform branding and UI buttons from page title.
 */
function cleanTitle(rawTitle: string): string {
  return rawTitle
    .replace(/Back Button.*$/i, '')
    .replace(/\s*[-–—|\\/]\s*(ChatGPT|Claude|Google Gemini|Gemini|Perplexity|DeepSeek|Anthropic|Google|Grok).*/i, '')
    .trim() || 'Untitled Chat';
}

/**
 * Detect AI platform from HTML markers, scripts, and meta tags.
 */
export function detectPlatform(html: string, $: cheerio.CheerioAPI): PlatformEnum {
  const lowerHtml = html.toLowerCase();

  // ChatGPT
  if (
    lowerHtml.includes('chatgpt.com') ||
    lowerHtml.includes('oaistatic') ||
    $('[data-chatgpt-search-unit-key]').length > 0 ||
    $('[data-markdown-text-style="assistant-message"]').length > 0 ||
    $('script#client-bootstrap').length > 0
  ) {
    return 'CHATGPT';
  }

  // Claude
  if (
    lowerHtml.includes('claude.ai') ||
    lowerHtml.includes('anthropic') ||
    $('[data-testid="transcript-row"]').length > 0 ||
    $('[data-testid*="claude"]').length > 0 ||
    $('.font-claude-message').length > 0
  ) {
    return 'CLAUDE';
  }

  // Gemini
  if (
    lowerHtml.includes('gemini.google.com') ||
    lowerHtml.includes('bard.google.com') ||
    $('user-query').length > 0 ||
    $('model-response').length > 0 ||
    $('sparkler-chat-turn').length > 0
  ) {
    return 'GEMINI';
  }

  // Grok
  if (
    lowerHtml.includes('grok.com') ||
    lowerHtml.includes('x.ai') ||
    $('.bg-surface-user-bubble').length > 0 ||
    $('.streamdown-chat-md').length > 0
  ) {
    return 'GROK';
  }

  // Perplexity
  if (
    lowerHtml.includes('perplexity.ai') ||
    $('[data-asset-chip]').length > 0 ||
    $('[data-testid="trusted-citation-check"]').length > 0 ||
    $('[data-testid="answer-content"]').length > 0
  ) {
    return 'PERPLEXITY';
  }

  // DeepSeek
  if (
    lowerHtml.includes('deepseek.com') ||
    $('.ds-markdown').length > 0 ||
    $('.chat-assistant-message').length > 0
  ) {
    return 'DEEPSEEK';
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

  // ChatGPT
  if (platform === 'CHATGPT') {
    const threadLink = $('a[href*="/c/"]').attr('href');
    if (threadLink) {
      if (threadLink.startsWith('http')) return threadLink;
      return `https://chatgpt.com${threadLink}`;
    }
  }

  // Claude
  if (platform === 'CLAUDE') {
    const claudeLink = $('a[href*="/chat/"]').attr('href');
    if (claudeLink) {
      if (claudeLink.startsWith('http')) return claudeLink;
      return `https://claude.ai${claudeLink}`;
    }
  }

  // Gemini
  if (platform === 'GEMINI') {
    const geminiLink = $('a[href*="/app/"]').attr('href');
    if (geminiLink) {
      if (geminiLink.startsWith('http')) return geminiLink;
      return `https://gemini.google.com${geminiLink}`;
    }
  }

  // Grok
  if (platform === 'GROK') {
    const grokLink = $('a[href*="/share/"]').attr('href');
    if (grokLink) {
      if (grokLink.startsWith('http')) return grokLink;
      return `https://grok.com${grokLink}`;
    }
    return 'https://grok.com';
  }

  // Perplexity
  if (platform === 'PERPLEXITY') {
    const perpLink = $('a[href*="/search/"]').attr('href');
    if (perpLink) {
      if (perpLink.startsWith('http')) return perpLink;
      return `https://www.perplexity.ai${perpLink}`;
    }
    return 'https://www.perplexity.ai';
  }

  return 'https://loom.local/chat';
}

/**
 * Convert an HTML table element to GitHub-flavored Markdown table syntax.
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
 * Extract rich Markdown from an assistant message container element,
 * preserving code fences (with languages), tables, lists, attachments, and formatting.
 */
function extractMarkdownFromElement($: cheerio.CheerioAPI, container: cheerio.Cheerio<any>): string {
  const parts: string[] = [];

  container.children().each((_, child) => {
    const tagName = (child as any).tagName?.toLowerCase();
    const className = $(child).attr('class') || '';

    // File card / PDF attachment / download chip
    const hasFileCard =
      className.includes('file-card') ||
      $(child).find('[class*="file-card"]').length > 0 ||
      Boolean($(child).attr('aria-label')?.includes('.pdf')) ||
      Boolean($(child).find('[aria-label*=".pdf"]').length > 0);

    if (hasFileCard) {
      const card = className.includes('file-card')
        ? $(child)
        : $(child).find('[class*="file-card"]').length > 0
        ? $(child).find('[class*="file-card"]').first()
        : $(child);
      const filename =
        card.find('.text-fg-primary, .truncate').first().text().trim() ||
        card.attr('aria-label') ||
        card.find('[aria-label*=".pdf"]').first().attr('aria-label') ||
        'attachment';
      const cleanFilename = filename
        .replace(/^Open\s+/i, '')
        .replace(/View Preview$/i, '')
        .trim();
      parts.push(`\n📎 **Attachment:** \`${cleanFilename}\`\n`);
      return;
    }

    if (tagName === 'pre' || tagName === 'code-block') {
      const codeEl = $(child).find('code');
      const langClass = (codeEl.attr('class') || $(child).attr('class') || '')
        .split(' ')
        .find((c) => c.startsWith('language-'));
      const lang = langClass ? langClass.replace('language-', '') : '';
      const codeText = codeEl.length > 0 ? codeEl.text() : $(child).text();
      parts.push(`\`\`\`${lang}\n${codeText.replace(/\r\n/g, '\n')}\n\`\`\``);
    } else if (tagName === 'table') {
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
      if ($(child).find('pre, code-block, table, ul, ol, [class*="file-card"], [aria-label*=".pdf"]').length > 0) {
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

  const units = $('[data-chatgpt-search-unit-key]');
  if (units.length > 0) {
    units.each((_, el) => {
      const key = $(el).attr('data-chatgpt-search-unit-key') || '';
      if (key.includes(':user')) {
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

  // Fallback: data-message-author-role
  $('[data-message-author-role]').each((_, el) => {
    const roleAttr = $(el).attr('data-message-author-role')?.toLowerCase();
    const role = roleAttr === 'user' ? 'USER' : 'ASSISTANT';
    let text = '';
    if (role === 'ASSISTANT') {
      const mdRoot = $(el).find('.markdown, [data-markdown-text-style="assistant-message"]');
      text = mdRoot.length > 0 ? extractMarkdownFromElement($, mdRoot) : $(el).text().trim();
    } else {
      text = $(el).text().trim();
    }
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
 * Scrape conversation from Claude (claude.ai) DOM structure.
 */
function scrapeClaude($: cheerio.CheerioAPI): ScrapedMessage[] {
  const messages: ScrapedMessage[] = [];

  const rows = $('[data-testid="transcript-row"]');
  if (rows.length > 0) {
    rows.each((_, row) => {
      const userEl = $(row).find('[data-testid="user-message"], .font-user-message');
      const asstEl = $(row).find('[data-testid="assistant-message"], .font-claude-message');

      if (userEl.length > 0) {
        const clone = userEl.clone();
        clone.find('button, svg, [role="button"], [data-testid*="user-message-"]').remove();
        const text = clone.text().trim();
        if (text) {
          messages.push({
            idx: messages.length,
            role: 'USER',
            textPlain: text,
          });
        }
      } else if (asstEl.length > 0) {
        const clone = asstEl.clone();
        clone.find('h2.sr-only, h3.sr-only, h4.sr-only, button, svg, [data-testid="message-actions"], [data-testid="tool-cell-row"]').remove();
        const mdContainer = clone.find('.standard-markdown, .markdown');
        const target = mdContainer.length > 0 ? mdContainer.first() : clone;
        const text = extractMarkdownFromElement($, target);
        const cleanText = text.replace(/^Claude responded:\s*/i, '').trim();
        if (cleanText) {
          messages.push({
            idx: messages.length,
            role: 'ASSISTANT',
            textPlain: cleanText,
          });
        }
      }
    });
    if (messages.length > 0) return messages;
  }

  return messages;
}

/**
 * Scrape conversation from Gemini (gemini.google.com) DOM structure.
 */
function scrapeGemini($: cheerio.CheerioAPI): ScrapedMessage[] {
  const messages: ScrapedMessage[] = [];

  const turns = $('user-query, model-response');
  if (turns.length > 0) {
    turns.each((_, el) => {
      const tagName = (el as any).tagName ? (el as any).tagName.toLowerCase() : '';

      if (tagName === 'user-query') {
        const queryEl = $(el).find('.query-text, .query-content');
        const clone = (queryEl.length > 0 ? queryEl : $(el)).clone();
        clone.find('.screen-reader-user-query-label, .cdk-visually-hidden, button, svg, [role="button"]').remove();
        let text = clone.text().trim();
        text = text.replace(/^You said\s*/i, '').trim();

        if (text) {
          messages.push({
            idx: messages.length,
            role: 'USER',
            textPlain: text,
          });
        }
      } else if (tagName === 'model-response') {
        const contentEl = $(el).find('message-content, .model-response-text');
        const target = contentEl.length > 0 ? contentEl.first() : $(el);
        const clone = target.clone();
        clone.find('button, svg, .response-actions, .thoughts-header').remove();
        const mdContainer = clone.find('.markdown, .md-content');
        const mdTarget = mdContainer.length > 0 ? mdContainer.first() : clone;
        let text = extractMarkdownFromElement($, mdTarget);
        text = text.replace(/^Gemini said\s*/i, '').trim();

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

  return messages;
}

/**
 * Scrape conversation from Grok (grok.com / x.ai) DOM structure.
 */
function scrapeGrok($: cheerio.CheerioAPI): ScrapedMessage[] {
  const messages: ScrapedMessage[] = [];

  // In Grok, each message turn is in .response-content-markdown
  const markdowns = $('.response-content-markdown');
  if (markdowns.length > 0) {
    markdowns.each((_, el) => {
      const isUser = $(el).parents('.bg-surface-user-bubble').length > 0;
      const role = isUser ? 'USER' : 'ASSISTANT';

      const clone = $(el).clone();

      let text = '';
      if (role === 'ASSISTANT') {
        // 1. Extract any attached file cards (e.g. PDFs or document downloads) FIRST before removing buttons/roles
        const fileCards = clone.find('[class*="file-card"]');
        let fileCardMarkdown = '';
        if (fileCards.length > 0) {
          const seenFiles = new Set<string>();
          fileCards.each((_, fc) => {
            const rawName =
              $(fc).find('.text-fg-primary, .truncate').first().text().trim() ||
              $(fc).attr('aria-label') ||
              '';
            const cleanName = rawName
              .replace(/^(Download|preview for|Open)\s+/i, '')
              .replace(/View Preview$/i, '')
              .trim();
            if (cleanName && !seenFiles.has(cleanName)) {
              seenFiles.add(cleanName);
              fileCardMarkdown += `\n\n📎 **Attachment:** \`${cleanName}\`\n\n`;
            }
          });
          fileCards.remove();
        }

        // 2. Remove remaining interactive buttons and icons
        clone.find('button, svg, [role="button"]').remove();

        text = extractMarkdownFromElement($, clone);
        if (fileCardMarkdown && !text.includes('Attachment:')) {
          text += fileCardMarkdown;
        }
        // Clean thinking indicators like "GrokWorked for 2m 56s"
        text = text.replace(/^GrokWorked for [^\n]+\n*/i, '').trim();
      } else {
        clone.find('button, svg, [role="button"]').remove();
        text = clone.text().trim();
        text = text.replace(/^You\s*/i, '').trim();
      }

      if (text) {
        messages.push({
          idx: messages.length,
          role,
          textPlain: text,
        });
      }
    });
    if (messages.length > 0) return messages;
  }

  return messages;
}

/**
 * Scrape conversation from Perplexity (perplexity.ai) DOM structure.
 */
function scrapePerplexity($: cheerio.CheerioAPI): ScrapedMessage[] {
  const messages: ScrapedMessage[] = [];

  // 1. User Prompt (Title question or default-question)
  let userText = cleanTitle($('title').text().trim());
  const questionEl = $('[data-testid="default-question"], .default-query');
  if (questionEl.length > 0) {
    userText = questionEl.first().text().trim();
  }

  // Check if user attached an image
  const userImageChip = $('[data-asset-chip="true"]');
  if (userImageChip.length > 0) {
    const imgLabel = userImageChip.attr('aria-label') || userImageChip.attr('title') || 'uploaded_image.jpg';
    userText += `\n\n![User Upload](${imgLabel})`;
  }

  if (userText) {
    messages.push({
      idx: 0,
      role: 'USER',
      textPlain: userText,
    });
  }

  // 2. Assistant Response (.prose or [data-testid="answer-content"])
  const answerEl = $('.prose, [data-testid="answer-content"]');
  if (answerEl.length > 0) {
    const clone = answerEl.first().clone();
    clone.find('button, svg, [data-testid*="citation"], footer').remove();
    const text = extractMarkdownFromElement($, clone);
    if (text) {
      messages.push({
        idx: 1,
        role: 'ASSISTANT',
        textPlain: text,
      });
    }
  }

  return messages;
}

/**
 * Scrape conversation from DeepSeek (chat.deepseek.com) DOM structure.
 */
function scrapeDeepSeek($: cheerio.CheerioAPI): ScrapedMessage[] {
  const messages: ScrapedMessage[] = [];

  $('.chat-user-message, .chat-assistant-message, .ds-markdown').each((_, el) => {
    const isUser = $(el).hasClass('chat-user-message');
    const role = isUser ? 'USER' : 'ASSISTANT';

    let text = '';
    if (role === 'ASSISTANT') {
      text = extractMarkdownFromElement($, $(el));
    } else {
      text = $(el).text().trim();
    }

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
    case 'GROK':
      messages = scrapeGrok($);
      break;
    case 'PERPLEXITY':
      messages = scrapePerplexity($);
      break;
    case 'DEEPSEEK':
      messages = scrapeDeepSeek($);
      break;
    default:
      messages = scrapeGeneric($);
      break;
  }

  // Cascading fallbacks if platform-specific selectors returned 0 items
  if (messages.length === 0) {
    messages = scrapeChatGPT($);
  }
  if (messages.length === 0) {
    messages = scrapeClaude($);
  }
  if (messages.length === 0) {
    messages = scrapeGemini($);
  }
  if (messages.length === 0) {
    messages = scrapeGrok($);
  }
  if (messages.length === 0) {
    messages = scrapePerplexity($);
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
