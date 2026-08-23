const ALLOWED_TAGS = new Set(['B', 'I', 'BR', 'EM', 'STRONG']);

/**
 * ESI region lore occasionally embeds simple formatting tags (seen in the
 * wild across live data: <b>, <i>, <br>) -- this walks the parsed DOM
 * rather than regex-matching tags, rebuilding only an allowlist (dropping
 * every attribute on them too) so nothing -- an <a href="javascript:...">,
 * an onclick, a <script> -- can sneak through from source data we don't
 * fully control the shape of.
 */
export function sanitizeLoreHtml(text: string): string {
  const doc = new DOMParser().parseFromString(text, 'text/html');
  const out = document.createElement('div');

  function walk(source: Node, target: Node) {
    for (const child of Array.from(source.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        target.appendChild(document.createTextNode(child.textContent ?? ''));
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as Element;
        if (ALLOWED_TAGS.has(el.tagName)) {
          const clean = document.createElement(el.tagName.toLowerCase());
          target.appendChild(clean);
          walk(el, clean);
        } else {
          walk(el, target);
        }
      }
    }
  }

  walk(doc.body, out);
  return out.innerHTML;
}
