// Pure text helpers for subtitles (no three.js, so the tests can run them).

const CHARS_PER_LINE = 52;
const LINES_PER_PAGE = 2;
export const SECONDS_PER_CHAR = 0.075; // about the pace of the narration
export const MIN_PAGE_SECONDS = 1.4;

/** Split into lines of at most `max` characters, never breaking a word. */
export function wrapLines(text, max = CHARS_PER_LINE) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + word.length + 1 > max) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

/** Long lines become pages of two lines, each shown for as long as it takes to say. */
export function paginate(text, { max = CHARS_PER_LINE, perPage = LINES_PER_PAGE } = {}) {
  const lines = wrapLines(text, max);
  const pages = [];
  for (let i = 0; i < lines.length; i += perPage) {
    const page = lines.slice(i, i + perPage);
    const chars = page.join(' ').length;
    pages.push({ lines: page, seconds: Math.max(MIN_PAGE_SECONDS, chars * SECONDS_PER_CHAR) });
  }
  return pages;
}
