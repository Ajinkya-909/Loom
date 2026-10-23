import { describe, expect, it } from 'vitest';
import { createChatGptAdapter } from '../src/content/adapters/chatgpt';
import { detectAdapter } from '../src/content/adapters';
import html from './fixtures/chatgpt-sample.html?raw';

const load = (src = html) => new DOMParser().parseFromString(src, 'text/html');

describe('ChatGPT adapter', () => {
  it('matches chatgpt.com and chat.openai.com only', () => {
    const a = createChatGptAdapter();
    expect(a.matches(new URL('https://chatgpt.com/c/abc'))).toBe(true);
    expect(a.matches(new URL('https://chat.openai.com/c/abc'))).toBe(true);
    expect(a.matches(new URL('https://example.com/'))).toBe(false);
    expect(a.matches(new URL('http://chatgpt.com/'))).toBe(false);
  });

  it('is picked by detectAdapter for ChatGPT URLs and null elsewhere', () => {
    const doc = load();
    expect(detectAdapter(new URL('https://chatgpt.com/c/1'), doc)?.id).toBe('chatgpt');
    expect(detectAdapter(new URL('https://example.com/'), doc)).toBeNull();
  });

  it('lists messages in DOM order with correct roles', () => {
    const a = createChatGptAdapter();
    const msgs = a.listMessageElements(load()).map((el, i) => a.toRawMessage(el, i));
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(msgs.map((m) => m.domId)).toEqual(['msg-u1', 'msg-a1', 'msg-u2', 'msg-a2']);
    expect(msgs.map((m) => m.idx)).toEqual([0, 1, 2, 3]);
    expect(msgs[0].text).toContain('sessions to JWT');
    expect(a.takeWarnings()).toEqual([]);
  });

  it('serializes html with scripts removed and leaves the live DOM untouched', () => {
    const doc = load();
    doc.querySelector('[data-message-id="msg-a1"]')!.insertAdjacentHTML('beforeend', '<script>evil()</script>');
    const a = createChatGptAdapter();
    const raw = a.toRawMessage(a.listMessageElements(doc)[1], 1);
    expect(raw.html).not.toContain('<script');
    expect(raw.html).toContain('<pre>');
    expect(doc.querySelectorAll('[data-message-id="msg-a1"] script')).toHaveLength(1);
  });

  it('countExpected counts 2 pre, 1 table, 1 content image (icons excluded)', () => {
    expect(createChatGptAdapter().countExpected(load())).toEqual({
      messageCount: 4, codeBlockCount: 2, tableCount: 1, imageCount: 1,
    });
  });

  it('finds the content image as an asset candidate, not the icon', () => {
    const a = createChatGptAdapter();
    const assets = a.listMessageElements(load()).flatMap((el) => a.findAssets(el));
    expect(assets.map((x) => x.url)).toEqual(['https://files.example.com/latency.png']);
  });

  it('title: strips the " - ChatGPT" suffix', () => {
    expect(createChatGptAdapter().getTitle(load())).toBe('Auth refactor: JWT vs sessions');
  });

  it('title fallback: first user message (60 chars), then "Untitled chat"', () => {
    const a = createChatGptAdapter();
    const bare = load(html.replace(/<title>.*<\/title>/, '<title>ChatGPT</title>'));
    expect(a.getTitle(bare)).toBe('Should we move our API from sessions to JWT?');

    const long = load(
      html.replace(/<title>.*<\/title>/, '<title></title>').replace('Should we move our API from sessions to JWT?', 'x'.repeat(100)),
    );
    expect(a.getTitle(long)).toBe('x'.repeat(60));

    expect(a.getTitle(load('<html><head><title>ChatGPT</title></head><body></body></html>'))).toBe('Untitled chat');
  });

  it('model label comes from the model switcher', () => {
    expect(createChatGptAdapter().getModelLabel?.(load())).toBe('GPT-5');
  });

  it('falls back to turn articles and records SELECTOR_FALLBACK_USED', () => {
    const stripped = html.replace(/ data-message-author-role="\w+"/g, '');
    const a = createChatGptAdapter();
    const els = a.listMessageElements(load(stripped));
    expect(els).toHaveLength(4);
    expect(a.toRawMessage(els[1], 1).role).toBe('assistant'); // from data-turn
    expect(a.takeWarnings().map((w) => w.code)).toContain('SELECTOR_FALLBACK_USED');
    expect(a.takeWarnings()).toEqual([]); // drained
  });

  it('unknown role becomes assistant plus a warning', () => {
    const a = createChatGptAdapter();
    const doc = load(html.replace('data-message-author-role="user" data-message-id="msg-u1"', 'data-message-author-role="wizard" data-message-id="msg-u1"'));
    expect(a.toRawMessage(a.listMessageElements(doc)[0], 0).role).toBe('assistant');
    expect(a.takeWarnings().map((w) => w.code)).toEqual(['UNKNOWN_ROLE']);
  });

  it('extracts PDFs from file cards and direct markdown links', () => {
    const doc = load(`
      <article data-testid="conversation-turn-5" data-turn="user">
        <div data-message-author-role="user" data-message-id="msg-u3">
          <div class="group/file-card">
            <a href="https://files.oaiusercontent.com/file-987abc">Quarterly_Report.pdf</a>
          </div>
          <p>Check the attached PDF and this external link: <a href="https://example.com/notes.pdf">Notes PDF</a></p>
        </div>
      </article>
    `);
    const a = createChatGptAdapter();
    const msg = a.listMessageElements(doc)[0];
    const assets = a.findAssets(msg);
    expect(assets).toHaveLength(2);
    expect(assets[0]).toEqual({
      url: 'https://files.oaiusercontent.com/file-987abc',
      kind: 'file',
      filename: 'Quarterly_Report.pdf',
    });
    expect(assets[1]).toEqual({
      url: 'https://example.com/notes.pdf',
      kind: 'file',
      filename: undefined,
    });
  });

  it('extracts content images inside dialog/lightbox preview buttons', () => {
    const doc = load(`
      <article data-testid="conversation-turn-6" data-turn="assistant">
        <div data-message-author-role="assistant" data-message-id="msg-a3">
          <button type="button" aria-haspopup="dialog">
            <img src="https://files.oaiusercontent.com/generated-chart.png" alt="Generated Chart" width="800" height="600" />
          </button>
        </div>
      </article>
    `);
    const a = createChatGptAdapter();
    const msg = a.listMessageElements(doc)[0];
    const assets = a.findAssets(msg);
    expect(assets).toHaveLength(1);
    expect(assets[0].url).toBe('https://files.oaiusercontent.com/generated-chart.png');
    expect(assets[0].kind).toBe('image');
  });
});
