import type { SplitUnit } from './types';

export interface SplitResult {
  /** Wrapper holding the generated markup; append this into the visible container. */
  root: HTMLElement;
  /** Animated unit elements (lines, words, or chars depending on `splitBy`), in reading order. */
  units: HTMLElement[];
}

const WHITESPACE_ONLY_RE = /^\s+$/;
const TOKEN_RE = /(\s+)/;

/**
 * Splits `text` into a DOM tree of line/word/char spans for the fade & grow
 * animations to animate individually. Lines always wrap in a block-level
 * span (so explicit "\n"s in the source text keep their line breaks);
 * words and chars are additionally split out as inline-block spans so each
 * can be transformed independently without affecting layout of its
 * siblings. Whitespace between words is kept as plain text nodes so word
 * wrapping behaves normally.
 *
 * The returned root is `aria-hidden`; callers should set `aria-label` on the
 * real container with the plain `text` so screen readers see one coherent
 * string instead of the fragmented spans.
 */
export function buildSplitDom(text: string, splitBy: SplitUnit): SplitResult {
  const root = document.createElement('div');
  root.setAttribute('aria-hidden', 'true');
  const units: HTMLElement[] = [];

  const lines = text.split('\n');
  lines.forEach((line) => {
    const lineSpan = document.createElement('span');
    lineSpan.style.display = 'block';

    if (splitBy === 'lines') {
      lineSpan.textContent = line.length > 0 ? line : ' ';
      units.push(lineSpan);
    } else {
      const tokens = line.split(TOKEN_RE).filter((t) => t.length > 0);
      if (tokens.length === 0) lineSpan.appendChild(document.createTextNode(' '));

      for (const token of tokens) {
        if (WHITESPACE_ONLY_RE.test(token)) {
          lineSpan.appendChild(document.createTextNode(token));
          continue;
        }

        const wordSpan = document.createElement('span');
        wordSpan.style.display = 'inline-block';

        if (splitBy === 'words') {
          wordSpan.textContent = token;
          units.push(wordSpan);
        } else {
          for (const ch of token) {
            const charSpan = document.createElement('span');
            charSpan.style.display = 'inline-block';
            charSpan.textContent = ch;
            wordSpan.appendChild(charSpan);
            units.push(charSpan);
          }
        }
        lineSpan.appendChild(wordSpan);
      }
    }

    root.appendChild(lineSpan);
  });

  return { root, units };
}
