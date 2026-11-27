/** Copy text with a fallback for old WebViews / non-secure contexts (no clipboard API). */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    // Text selection is disabled app-wide (user-select: none), and iOS refuses to copy from a
    // non-selectable element: force it selectable, 16px (no zoom), and select the full range.
    el.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px;-webkit-user-select:text;user-select:text;';
    document.body.appendChild(el);
    el.select();
    el.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}
