import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import { sanitizeHtml } from '../sanitizeHtml';

// The sanitizer needs a DOM. jsdom is not a project dependency, so load it if present
// (or from JSDOM_PATH) and skip the DOM-dependent cases otherwise.
let available = false;
beforeAll(() => {
  const candidates = [process.env.JSDOM_PATH, 'jsdom'].filter(Boolean) as string[];
  for (const c of candidates) {
    try {
      const req = createRequire(import.meta.url);
      const { JSDOM } = req(c);
      (globalThis as unknown as { DOMParser: unknown }).DOMParser = new JSDOM('').window.DOMParser;
      available = true;
      return;
    } catch {
      /* try next */
    }
  }
});

const run = (name: string, fn: () => void) => it(name, (ctx) => { if (!available) return ctx.skip(); fn(); });

describe('sanitizeHtml', () => {
  it('returns empty string for empty input', () => {
    expect(sanitizeHtml('')).toBe('');
  });
  run('removes script tags and their content', () => {
    const out = sanitizeHtml('<p>hi</p><script>alert(1)</script>');
    expect(out).toBe('<p>hi</p>');
  });
  run('strips inline event handlers', () => {
    const out = sanitizeHtml('<img src="https://x.test/a.png" onerror="alert(1)"><p onclick="x()">t</p>');
    expect(out.toLowerCase()).not.toContain('onerror');
    expect(out.toLowerCase()).not.toContain('onclick');
  });
  run('removes javascript:/data: hrefs but keeps the link text', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">x</a><a href=" JaVaScRiPt:alert(1)">y</a><a href="data:text/html,hi">z</a>');
    expect(out.toLowerCase()).not.toContain('javascript');
    expect(out).not.toContain('data:');
    expect(out).toContain('x');
  });
  run('keeps https and mailto links with safe rel/target', () => {
    const out = sanitizeHtml('<a href="https://ok.test/p" onclick="x()">a</a><a href="mailto:a@b.co">m</a>');
    expect(out).toContain('href="https://ok.test/p"');
    expect(out).toContain('href="mailto:a@b.co"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).not.toContain('onclick');
  });
  run('drops iframe/object/embed/svg/form/style content', () => {
    const out = sanitizeHtml('<iframe src="https://evil.test"></iframe><object data="x"></object><embed src="x"><svg onload="x()"><circle/></svg><form><input></form><style>body{display:none}</style><p>ok</p>');
    expect(out).toBe('<p>ok</p>');
  });
  run('strips style and class attributes on allowed tags', () => {
    const out = sanitizeHtml('<p style="position:fixed" class="x" id="y">t</p>');
    expect(out).toBe('<p>t</p>');
  });
  run('removes non-https images', () => {
    expect(sanitizeHtml('<img src="http://x.test/a.png">')).toBe('');
    expect(sanitizeHtml('<img src="javascript:alert(1)">')).toBe('');
    expect(sanitizeHtml('<img src="https://x.test/a.png" alt="a">')).toContain('src="https://x.test/a.png"');
  });
  run('keeps allowed formatting tags and unwraps unknown ones', () => {
    const out = sanitizeHtml('<h1>T</h1><ul><li><strong>b</strong> <em>i</em></li></ul><custom-x>txt</custom-x><br><blockquote>q</blockquote>');
    expect(out).toContain('<h1>T</h1>');
    expect(out).toContain('<li><strong>b</strong> <em>i</em></li>');
    expect(out).toContain('txt');
    expect(out).not.toContain('custom-x');
    expect(out).toContain('<blockquote>q</blockquote>');
  });
});
