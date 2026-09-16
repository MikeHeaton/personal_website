/** Small SVG 1.1 drawing toolkit. All coordinates are design units, not CSS pixels. */
export const palette = {
  paper: "#f5f1e7",
  ink: "#16251c",
  secondary: "#4b554b",
  rule: "#b2b6a6",
};
export function escapeHtml(value = "") {
  return String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
export function attributes(values) {
  return Object.entries(values)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}="${escapeHtml(v)}"`)
    .join(" ");
}
export function text(value, x, y, options = {}) {
  const {
    size = 32,
    weight = 400,
    fill = palette.ink,
    anchor = "start",
    family = "Arial, Helvetica, sans-serif",
    ...extra
  } = options;
  return `<text ${attributes({ x, y, "font-size": size, "font-weight": weight, fill, "text-anchor": anchor, "font-family": family, ...extra })}>${escapeHtml(value)}</text>`;
}
export function line(x1, y1, x2, y2, color = palette.rule) {
  return `<line ${attributes({ x1, y1, x2, y2, stroke: color, "stroke-width": 2 })}/>`;
}
export function rect(box, fill) {
  return `<rect ${attributes({ ...box, fill })}/>`;
}
export function columns(box, count, gap = 0) {
  const width = (box.width - gap * (count - 1)) / count;
  return Array.from({ length: count }, (_, i) => ({
    ...box,
    x: box.x + i * (width + gap),
    width,
  }));
}
export function image(url, box, label) {
  // SVG's image fitting works on the EO1 without object-fit, flexbox, or CSS transforms.
  return `<image ${attributes({ ...box, "xlink:href": url, preserveAspectRatio: "xMidYMid meet", role: "img", "aria-label": label })}><title>${escapeHtml(label)}</title></image>`;
}
export function wrapLines(value, maxCharacters, maxLines = 2) {
  const words = String(value).split(/\s+/),
    lines = [];
  let current = "";
  for (const word of words) {
    if (current && (current + " " + word).length > maxCharacters) {
      lines.push(current);
      current = word;
    } else current += (current ? " " : "") + word;
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].replace(/[ ,;:]+$/, "") + "…";
  }
  return lines;
}
export function surface({ width, height }, content, label) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100%" height="100%" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeHtml(label)}">${content}</svg>`;
}
