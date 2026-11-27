// Minimal allowlist HTML sanitizer for rendering stored campaign HTML in the
// admin UI (DOMPurify is not a dependency). Drops scripts, styles, event
// handlers, non-http(s)/mailto links and unknown tags (keeping their text).
const ALLOWED_TAGS = new Set([
  'P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'UL', 'OL', 'LI', 'A', 'H1', 'H2', 'H3', 'H4',
  'BLOCKQUOTE', 'SPAN', 'DIV', 'HR', 'IMG',
]);
const DROP_WITH_CONTENT = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'NOSCRIPT', 'TEMPLATE', 'FORM', 'SVG', 'MATH']);
const SAFE_URL = /^(https?:|mailto:)/i;

export function sanitizeHtml(html: string): string {
  if (!html || typeof DOMParser === 'undefined') return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const clean = (node: Element) => {
    Array.from(node.children).forEach((child) => {
      const tag = child.tagName.toUpperCase();
      if (DROP_WITH_CONTENT.has(tag)) {
        child.remove();
        return;
      }
      clean(child);
      if (!ALLOWED_TAGS.has(tag)) {
        child.replaceWith(...Array.from(child.childNodes));
        return;
      }
      Array.from(child.attributes).forEach((attr) => {
        const name = attr.name.toLowerCase();
        const ok =
          (tag === 'A' && (name === 'href' || name === 'target' || name === 'rel')) ||
          (tag === 'IMG' && (name === 'src' || name === 'alt')) ||
          false;
        if (!ok) child.removeAttribute(attr.name);
      });
      if (tag === 'A') {
        const href = child.getAttribute('href') || '';
        if (!SAFE_URL.test(href.trim())) child.removeAttribute('href');
        child.setAttribute('rel', 'noopener noreferrer');
        child.setAttribute('target', '_blank');
      }
      if (tag === 'IMG') {
        const src = child.getAttribute('src') || '';
        if (!/^https:/i.test(src.trim())) child.remove();
      }
    });
  };
  clean(doc.body);
  return doc.body.innerHTML;
}
