import {
  palette,
  text,
  line,
  rect,
  columns,
  image,
  wrapLines,
  surface,
  escapeHtml,
} from "./drawing.mjs";

/** Change these frames to compose new scenes. Each panel receives explicit frames; no CSS layout or device-pixel assumptions are required. */
export const layout = {
  canvas: { width: 1080, height: 1920 },
  artwork: { x: 48, y: 108, width: 984, height: 936 },
  caption: { x: 48, y: 1090, width: 984, height: 136 },
  weather: { x: 48, y: 1254, width: 984, height: 580 },
  forecast: { x: 48, y: 1436, width: 984, height: 392 },
};
export function weatherIcon(code, x, y, size = 72) {
  const sun =
    '<circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12l2 2M4 20l2-2M18 6l2-2"/>';
  const cloud =
    '<path d="M6 17h12a4 4 0 0 0 0-8 6 6 0 0 0-11-2 5 5 0 0 0-1 10Z"/>';
  const rain = '<path d="m8 20-1 2m6-2-1 2m6-2-1 2"/>';
  const fog = '<path d="M3 20h18M5 23h14"/>';
  const snow = '<path d="M8 20v3m-1.5-1.5h3M16 20v3m-1.5-1.5h3"/>';
  let shape = code === 0 ? sun : cloud;
  if (code === 45 || code === 48) shape += fog;
  else if ((code >= 71 && code <= 77) || code === 85 || code === 86)
    shape += snow;
  else if (code >= 51) shape += rain;
  return `<g transform="translate(${x} ${y}) scale(${size / 24})" fill="none" stroke="${palette.ink}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${shape}</g>`;
}
export function artworkPanel(
  art,
  frame = layout.artwork,
  captionFrame = layout.caption,
) {
  if (!art)
    return text("A moment for art.", 540, 580, {
      anchor: "middle",
      size: 44,
      family: "Georgia, serif",
    });
  const title = art.display_title || art.title;
  const titleLines = wrapLines(title, Math.floor(captionFrame.width / 20), 2);
  const caption = titleLines
    .map((s, i) =>
      text(s, captionFrame.x, captionFrame.y + i * 44, {
        size: 36,
        family: "Georgia, serif",
      }),
    )
    .join("");
  return `<g id="artwork">${image("/api/display/art?id=" + art.id, frame, art.title + " by " + art.artist_title)}${caption}${text(art.artist_title + " · " + art.date_display, captionFrame.x, captionFrame.y + titleLines.length * 44 + 24, { size: 27, fill: palette.secondary })}</g>`;
}
export function forecastPanel(weather, frame = layout.forecast) {
  if (!weather)
    return text(
      "Forecast unavailable — retrying shortly",
      frame.x,
      frame.y + 100,
      { size: 34, weight: 700 },
    );
  return `<g id="forecast">${columns(frame, 5)
    .map((box, i) => {
      const day = weather.days[i];
      if (!day) return "";
      const cx = box.x + box.width / 2;
      const label =
        i === 0
          ? "TODAY"
          : new Date(day.date + "T12:00:00Z")
              .toLocaleDateString("en-US", {
                weekday: "short",
                timeZone: "UTC",
              })
              .toUpperCase();
      return `<g aria-label="${escapeHtml(label + ": " + day.label + ", high " + day.high + ", low " + day.low)}">${i ? line(box.x, box.y + 6, box.x, box.y + 360) : ""}${text(label, cx, box.y + 34, { size: 36, weight: 700, anchor: "middle" })}${weatherIcon(day.code, cx - 42, box.y + 66, 84)}${text(day.high + "°", cx, box.y + 244, { size: 88, weight: 700, anchor: "middle" })}${text(day.low + "°", cx, box.y + 304, { size: 48, weight: 700, anchor: "middle", fill: palette.secondary })}${text(day.rain === null ? "—" : day.rain + "% rain", cx, box.y + 358, { size: 30, weight: 700, anchor: "middle", fill: palette.secondary })}</g>`;
    })
    .join("")}</g>`;
}
export function weatherPanel(weather, frame = layout.weather) {
  const right = frame.x + frame.width;
  return `<g id="weather">${line(frame.x, frame.y - 24, right, frame.y - 24)}${text("SAN FRANCISCO", frame.x, frame.y + 44, { size: 52, weight: 700 })}${text(weather?.label || "Weather unavailable", frame.x, frame.y + 102, { size: 34, weight: 700, fill: palette.secondary })}${weather ? weatherIcon(weather.code, right - 370, frame.y + 40, 94) : ""}${text((weather?.temperature ?? "—") + "°", right - 44, frame.y + 127, { size: 144, weight: 700, anchor: "end" })}${text("F", right, frame.y + 47, { size: 34, weight: 700, anchor: "end" })}${forecastPanel(weather)}</g>`;
}
export function renderScene(initial) {
  const now = new Date(initial.serverTime);
  const date = now.toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  return surface(
    layout.canvas,
    rect({ x: 0, y: 0, ...layout.canvas }, palette.paper) +
      text("AT HOME", 48, 62, { size: 25, weight: 700, "letter-spacing": 4 }) +
      text(date, 1032, 62, {
        size: 27,
        anchor: "end",
        fill: palette.secondary,
      }) +
      artworkPanel(initial.art) +
      weatherPanel(initial.weather) +
      text("The Metropolitan Museum of Art", 48, 1866, {
        size: 21,
        fill: palette.secondary,
      }) +
      text("Weather by Open-Meteo", 1032, 1866, {
        size: 21,
        anchor: "end",
        fill: palette.secondary,
      }),
    "Art and San Francisco weather",
  );
}
