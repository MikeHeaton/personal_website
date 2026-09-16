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
  artwork: { x: 48, y: 96, width: 984, height: 634 },
  caption: { x: 48, y: 766, width: 984, height: 124 },
  weather: { x: 48, y: 924, width: 984, height: 448 },
  forecast: { x: 48, y: 1080, width: 984, height: 286 },
  chart: { x: 48, y: 1402, width: 984, height: 416 },
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
      { size: 32, weight: 700 },
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
      return `<g aria-label="${escapeHtml(label + ": " + day.label + ", high " + day.high + ", low " + day.low)}">${i ? line(box.x, box.y + 6, box.x, box.y + 270) : ""}${text(label, cx, box.y + 30, { size: 30, weight: 700, anchor: "middle" })}${weatherIcon(day.code, cx - 34, box.y + 50, 68)}${text(day.high + "°", cx, box.y + 188, { size: 70, weight: 700, anchor: "middle" })}${text(day.low + "°", cx, box.y + 232, { size: 38, weight: 700, anchor: "middle", fill: palette.secondary })}${text(day.rain === null ? "—" : day.rain + "% rain", cx, box.y + 270, { size: 25, weight: 700, anchor: "middle", fill: palette.secondary })}</g>`;
    })
    .join("")}</g>`;
}
export function weatherPanel(weather, frame = layout.weather) {
  const right = frame.x + frame.width;
  return `<g id="weather">${line(frame.x, frame.y - 24, right, frame.y - 24)}${text("SAN FRANCISCO", frame.x, frame.y + 44, { size: 52, weight: 700 })}${text(weather?.label || "Weather unavailable", frame.x, frame.y + 102, { size: 34, weight: 700, fill: palette.secondary })}${weather ? weatherIcon(weather.code, right - 370, frame.y + 40, 94) : ""}${text((weather?.temperature ?? "—") + "°", right - 44, frame.y + 127, { size: 144, weight: 700, anchor: "end" })}${text("F", right, frame.y + 47, { size: 34, weight: 700, anchor: "end" })}${forecastPanel(weather)}</g>`;
}
function hourLabel(value) {
  const hour = Number(String(value).slice(11, 13));
  if (!Number.isFinite(hour)) return "";
  return `${hour % 12 || 12}${hour < 12 ? "a" : "p"}`;
}
function chartLine(points, valueY) {
  return points
    .map((point, i) => `${i ? "L" : "M"}${point.x.toFixed(1)} ${valueY(point.value).toFixed(1)}`)
    .join(" ");
}
export function hourlyChart(weather, frame = layout.chart) {
  if (!weather?.hours || weather.hours.length !== 24) return "";
  const temperatureColor = "#9b351b";
  const rainColor = "#175a78";
  const plot = {
    left: frame.x + 88,
    right: frame.x + frame.width - 88,
    top: frame.y + 90,
    bottom: frame.y + frame.height - 62,
  };
  const width = plot.right - plot.left;
  const height = plot.bottom - plot.top;
  const temperatures = weather.hours.map(({ temperature }) => temperature);
  const rawMin = Math.min(...temperatures);
  const rawMax = Math.max(...temperatures);
  const step = rawMax - rawMin < 8 ? 2 : 5;
  const temperatureMin = Math.floor((rawMin - 1) / step) * step;
  const temperatureMax = Math.ceil((rawMax + 1) / step) * step;
  const rainMax = Math.max(
    0.1,
    Math.ceil(Math.max(...weather.hours.map(({ rain }) => rain)) * 10) / 10,
  );
  const x = (i) => plot.left + (i / 23) * width;
  const temperatureY = (value) =>
    plot.top +
    ((temperatureMax - value) / (temperatureMax - temperatureMin || 1)) *
      height;
  const rainY = (value) => plot.bottom - (value / rainMax) * height;
  const temperatureTicks = [temperatureMin, (temperatureMin + temperatureMax) / 2, temperatureMax];
  const rainTicks = [0, rainMax / 2, rainMax];
  const timeTicks = [0, 6, 12, 18, 23];
  const points = weather.hours.map((hour, i) => ({ x: x(i), value: hour.temperature }));
  const barWidth = Math.max(14, (width / 24) * 0.68);
  const grid = temperatureTicks
    .map((tick) => {
      const y = temperatureY(tick);
      return `${line(plot.left, y, plot.right, y)}${text(Math.round(tick) + "°", plot.left - 16, y + 9, { size: 26, weight: 700, anchor: "end", fill: temperatureColor })}`;
    })
    .join("");
  const rainAxis = rainTicks
    .map((tick) =>
      text(tick.toFixed(tick && tick < 1 ? 2 : 1), plot.right + 16, rainY(tick) + 9, {
        size: 25,
        weight: 700,
        fill: rainColor,
      }),
    )
    .join("");
  const bars = weather.hours
    .map((hour, i) => {
      const y = rainY(hour.rain);
      return `<rect x="${(x(i) - barWidth / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(0, plot.bottom - y).toFixed(1)}" rx="3" fill="${rainColor}" opacity=".82"/>`;
    })
    .join("");
  const times = timeTicks
    .map(
      (i) =>
        `${line(x(i), plot.bottom, x(i), plot.bottom + 10, palette.ink)}${text(hourLabel(weather.hours[i].time), x(i), plot.bottom + 38, { size: 25, weight: 700, anchor: "middle" })}`,
    )
    .join("");
  return `<g id="hourly-chart" role="img" aria-label="Next 24 hours: temperature in degrees Fahrenheit and predicted rainfall in inches">${line(frame.x, frame.y - 20, frame.x + frame.width, frame.y - 20)}${text("NEXT 24 HOURS", frame.x, frame.y + 32, { size: 32, weight: 700, "letter-spacing": 2 })}${text("TEMPERATURE", frame.x + 332, frame.y + 32, { size: 23, weight: 700, fill: temperatureColor })}${line(frame.x + 292, frame.y + 23, frame.x + 324, frame.y + 23, temperatureColor)}${text("RAINFALL", frame.x + 640, frame.y + 32, { size: 23, weight: 700, fill: rainColor })}<rect x="${frame.x + 602}" y="${frame.y + 12}" width="27" height="20" rx="2" fill="${rainColor}" opacity=".82"/>${text("TEMPERATURE (°F)", frame.x + 24, plot.top + height / 2, { size: 22, weight: 700, anchor: "middle", fill: temperatureColor, transform: `rotate(-90 ${frame.x + 24} ${plot.top + height / 2})` })}${text("RAINFALL (IN)", frame.x + frame.width - 20, plot.top + height / 2, { size: 22, weight: 700, anchor: "middle", fill: rainColor, transform: `rotate(90 ${frame.x + frame.width - 20} ${plot.top + height / 2})` })}${grid}${rainAxis}${bars}<path d="${chartLine(points, temperatureY)}" fill="none" stroke="${palette.paper}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/><path d="${chartLine(points, temperatureY)}" fill="none" stroke="${temperatureColor}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>${timeTicks.map((i) => `<circle cx="${x(i)}" cy="${temperatureY(weather.hours[i].temperature)}" r="7" fill="${temperatureColor}" stroke="${palette.paper}" stroke-width="3"/>`).join("")}${times}</g>`;
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
      hourlyChart(initial.weather) +
      text("The Metropolitan Museum of Art", 48, 1866, {
        size: 21,
        fill: palette.secondary,
      }) +
      text("Weather by Open-Meteo", 1032, 1866, {
        size: 21,
        anchor: "end",
        fill: palette.secondary,
      }) +
      (initial.weather?.updatedAt
        ? text(
            "Last changed " +
              new Date(initial.weather.updatedAt).toLocaleTimeString("en-US", {
                timeZone: "America/Los_Angeles",
                hour: "numeric",
                minute: "2-digit",
              }),
            540,
            1866,
            { size: 21, anchor: "middle", fill: palette.secondary },
          )
        : ""),
    "Art and San Francisco weather",
  );
}
