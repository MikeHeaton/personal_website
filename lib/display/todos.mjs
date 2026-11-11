import { columns, escapeHtml, text } from './drawing.mjs';

export const MINUTE = 60000;
export const nextDisplayRefresh = (now = Date.now()) => (Math.floor(now / MINUTE) + 1) * MINUTE;
export const displayMode = (now) => Math.floor(now / MINUTE) % 2 === 0 ? 'weather' : 'todos';

// Fixed-width wrapping also breaks a single long word so it cannot leave its column.
export function todoLines(value, width = 29) {
  const charWidth = (char) => /[MWmw@%]/.test(char) ? 1.85 : /[ilI.,'!:;|]/.test(char) ? 0.55 : /[A-Z]/.test(char) ? 1.4 : /[^\x20-\x7e]/.test(char) ? 2 : 1;
  const measure = (text) => Array.from(text).reduce((sum, char) => sum + charWidth(char), 0);
  const words = String(value).split(/\s+/).flatMap((word) => {
    const chunks = []; let chunk = '';
    for (const char of Array.from(word)) {
      if (chunk && measure(chunk + char) > width) { chunks.push(chunk); chunk = ''; }
      chunk += char;
    }
    if (chunk) chunks.push(chunk);
    return chunks;
  });
  const lines = [];
  let line = '';
  for (const word of words) {
    if (line && measure(line + ' ' + word) > width) { lines.push(line); line = ''; }
    line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

export function todoPages(items) {
  const pages = [];
  let page = [[], []], column = 0, used = 0;
  for (const item of items) {
    // At most two lines on the glanceable display; full text remains on the phone.
    const all = todoLines(item.text);
    const lines = all.slice(0, 2);
    if (all.length > 2) lines[1] = Array.from(lines[1]).slice(0, -2).join('') + '…';
    const height = lines.length * 32 + 14;
    if (used + height > 226) {
      if (column === 1) { pages.push(page); page = [[], []]; column = 0; }
      else column = 1;
      used = 0;
    }
    page[column].push({ ...item, lines, offset: used });
    used += height;
  }
  if (page[0].length || !pages.length) pages.push(page);
  // Balance each page, including short lists, while retaining column-major order.
  return pages.map((packed) => {
    const entries = packed.flat();
    const height = (values) => values.reduce((sum, item) => sum + item.lines.length * 32 + 14, 0);
    let split = packed[0].length, best = Infinity;
    for (let i = 1; i < entries.length; i++) {
      const left = height(entries.slice(0, i)), right = height(entries.slice(i));
      if (left <= 226 && right <= 226 && Math.abs(left - right) < best) { split = i; best = Math.abs(left - right); }
    }
    return [entries.slice(0, split), entries.slice(split)].map((values) => {
      let offset = 0;
      return values.map((item) => { const result = { ...item, offset }; offset += item.lines.length * 32 + 14; return result; });
    });
  });
}

export function todosPanel(snapshot, frame, now) {
  const items = snapshot?.items;
  const pages = todoPages(items || []);
  const index = Math.floor(now / (2 * MINUTE)) % pages.length;
  const title = text('TO DO', frame.x, frame.y + 25, { size: 25, weight: 700, 'letter-spacing': 2 });
  const counter = text(items ? `${items.length} outstanding${pages.length > 1 ? ` · ${index + 1}/${pages.length}` : ''}` : '', frame.x + frame.width, frame.y + 25, { size: 21, anchor: 'end', fill: '#4b554b' });
  if (!items || !items.length) return `<g id="todos-panel">${title}${counter}${text(items ? 'All done. A little room to breathe.' : 'To-do list unavailable. Retrying shortly.', frame.x, frame.y + 112, { size: 30, fill: '#4b554b' })}</g>`;
  const boxes = columns(frame, 2, 32);
  return `<g id="todos-panel" role="group" aria-label="Outstanding to-do items">${title}${counter}${pages[index].map((entries, col) => entries.map((item) => {
    const x = boxes[col].x;
    const y = frame.y + 66 + item.offset;
    return `<g aria-label="${escapeHtml(item.text)}">${text('•', x, y, { size: 28 })}${item.lines.map((line, i) => text(line, x + 24, y + i * 32, { size: 27, weight: 600 })).join('')}</g>`;
  }).join('')).join('')}</g>`;
}
