import {
  palette,
  text,
  line,
  rect,
  columns,
  wrapLines,
  surface,
  escapeHtml,
  attributes,
} from "./drawing.mjs";

export const layout = {
  canvas: { width: 1080, height: 1920 },
  quote: { x: 48, y: 102, width: 984, height: 154 },
  calendar: { x: 48, y: 290, width: 984, height: 466 },
  weather: { x: 48, y: 808, width: 984, height: 480 },
  forecast: { x: 48, y: 972, width: 984, height: 286 },
  chart: { x: 48, y: 1336, width: 984, height: 470 },
};

const QUOTES = [
  ["The best way out is always through.", "Robert Frost"],
  ["Nothing can dim the light that shines from within.", "Maya Angelou"],
  ["Forever is composed of nows.", "Emily Dickinson"],
  ["The world is full of magic things, patiently waiting for our senses to grow sharper.", "W. B. Yeats"],
  ["There are years that ask questions and years that answer.", "Zora Neale Hurston"],
  ["Hope is a waking dream.", "Aristotle"],
  ["No act of kindness, no matter how small, is ever wasted.", "Aesop"],
  ["What we think, we become.", "Buddha"],
  ["The sun is new each day.", "Heraclitus"],
  ["Wherever you go, go with all your heart.", "Confucius"],
  ["Life is trying things to see if they work.", "Ray Bradbury"],
  ["Make each day your masterpiece.", "John Wooden"],
];

export function quoteForHour(now) {
  return QUOTES[Math.floor(now / 3600000) % QUOTES.length];
}

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

function localTime(value) {
  return new Date(value).toLocaleTimeString("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit",
  });
}

function eventTime(event, dayKey) {
  if (event.allDay) return "ALL DAY";
  const startKey = new Date(event.start).toLocaleDateString("en-CA", {
    timeZone: "America/Los_Angeles",
  });
  const endKey = new Date(Math.max(event.start, event.end - 1)).toLocaleDateString("en-CA", {
    timeZone: "America/Los_Angeles",
  });
  if (startKey !== dayKey && endKey === dayKey) return `UNTIL ${localTime(event.end)}`;
  if (startKey === dayKey && endKey !== dayKey) return `${localTime(event.start)} · CONTINUES`;
  if (startKey !== dayKey) return "CONTINUES";
  return `${localTime(event.start)} – ${localTime(event.end)}`;
}

export function calendarDayPanel(day, frame, index) {
  const headerHeight = 92;
  const itemHeight = 76;
  const viewportHeight = frame.height - headerHeight - 18;
  const events = day?.events || [];
  const contentHeight = Math.max(viewportHeight, events.length * itemHeight);
  const overflow = Math.max(0, contentHeight - viewportHeight);
  const clipId = `calendar-clip-${index}`;
  const title = day ? `${day.label} · ${new Date(day.key + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" })}` : index ? "TOMORROW" : "TODAY";
  let items;
  if (!day) {
    items = text("Calendar unavailable", frame.x + 24, frame.y + 150, {
      size: 28,
      fill: palette.secondary,
    });
  } else if (!events.length) {
    items = text("Nothing scheduled", frame.x + 24, frame.y + 150, {
      size: 28,
      fill: palette.secondary,
    });
  } else {
    items = events
      .map((event, eventIndex) => {
        const y = frame.y + headerHeight + eventIndex * itemHeight;
        const titleLines = wrapLines(event.title, 27, 1);
        return `<g aria-label="${escapeHtml(eventTime(event, day.key) + ": " + event.title)}">${eventIndex ? line(frame.x + 24, y, frame.x + frame.width - 24, y) : ""}${text(eventTime(event, day.key), frame.x + 24, y + 28, { size: 20, weight: 700, fill: "#175a78", "letter-spacing": 1 })}${text(titleLines[0], frame.x + 24, y + 61, { size: 27, weight: 700 })}</g>`;
      })
      .join("");
  }
  const animation = overflow
    ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 0;0 -${overflow};0 -${overflow};0 0" keyTimes="0;0.18;0.48;0.78;1" dur="18s" repeatCount="indefinite"/>`
    : "";
  return `<g id="calendar-${index}">${rect(frame, "#fffdf7")}${text(title, frame.x + 24, frame.y + 48, { size: 27, weight: 700, "letter-spacing": 1 })}${line(frame.x + 24, frame.y + 68, frame.x + frame.width - 24, frame.y + 68)}<defs><clipPath id="${clipId}"><rect ${attributes({ x: frame.x, y: frame.y + headerHeight, width: frame.width, height: viewportHeight })}/></clipPath></defs><g clip-path="url(#${clipId})"><g>${items}${animation}</g></g>${overflow ? text("SCROLLING", frame.x + frame.width - 24, frame.y + 48, { size: 17, weight: 700, anchor: "end", fill: palette.secondary, "letter-spacing": 1 }) : ""}</g>`;
}

export function calendarPanel(calendar, frame = layout.calendar) {
  const panels = columns(frame, 2, 24);
  return `<g id="calendar" role="group" aria-label="Calendar for today and tomorrow">${panels.map((panel, index) => calendarDayPanel(calendar?.days?.[index], panel, index)).join("")}</g>`;
}

export function forecastPanel(weather, frame = layout.forecast) {
  if (!weather)
    return text("Forecast unavailable — retrying shortly", frame.x, frame.y + 100, {
      size: 32,
      weight: 700,
    });
  return `<g id="forecast">${columns(frame, 5)
    .map((box, i) => {
      const day = weather.days[i];
      if (!day) return "";
      const cx = box.x + box.width / 2;
      const label =
        i === 0
          ? "TODAY"
          : new Date(day.date + "T12:00:00Z")
              .toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })
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
  const plot = { left: frame.x + 88, right: frame.x + frame.width - 88, top: frame.y + 90, bottom: frame.y + frame.height - 62 };
  const width = plot.right - plot.left;
  const height = plot.bottom - plot.top;
  const temperatures = weather.hours.map(({ temperature }) => temperature);
  const rawMin = Math.min(...temperatures);
  const rawMax = Math.max(...temperatures);
  const step = rawMax - rawMin < 8 ? 2 : 5;
  const temperatureMin = Math.floor((rawMin - 1) / step) * step;
  const temperatureMax = Math.ceil((rawMax + 1) / step) * step;
  const rainValues = weather.hours.map(({ rain }) => rain);
  const allDry = rainValues.every((rain) => rain === 0);
  const rainMax = Math.max(0.1, Math.ceil(Math.max(...rainValues) * 10) / 10);
  const x = (i) => plot.left + (i / 23) * width;
  const temperatureY = (value) => plot.top + ((temperatureMax - value) / (temperatureMax - temperatureMin || 1)) * height;
  const rainY = (value) => plot.bottom - (value / rainMax) * height;
  const temperatureTicks = [temperatureMin, (temperatureMin + temperatureMax) / 2, temperatureMax];
  const rainTicks = [0, rainMax / 2, rainMax];
  const timeTicks = [0, 6, 12, 18, 23];
  const points = weather.hours.map((hour, i) => ({ x: x(i), value: hour.temperature }));
  const barWidth = Math.max(14, (width / 24) * 0.68);
  const grid = temperatureTicks.map((tick) => {
    const y = temperatureY(tick);
    return `${line(plot.left, y, plot.right, y)}${text(Math.round(tick) + "°", plot.left - 16, y + 9, { size: 26, weight: 700, anchor: "end", fill: temperatureColor })}`;
  }).join("");
  const rainAxis = rainTicks.map((tick) => text(tick.toFixed(tick && tick < 1 ? 2 : 1), plot.right + 16, rainY(tick) + 9, { size: 25, weight: 700, fill: rainColor })).join("");
  const bars = allDry
    ? line(plot.left, plot.bottom, plot.right, plot.bottom, rainColor).replace('stroke-width="2"', 'stroke-width="5"')
    : weather.hours.map((hour, i) => {
        const y = rainY(hour.rain);
        return `<rect x="${(x(i) - barWidth / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(0, plot.bottom - y).toFixed(1)}" rx="3" fill="${rainColor}" opacity=".82"/>`;
      }).join("");
  const times = timeTicks.map((i) => `${line(x(i), plot.bottom, x(i), plot.bottom + 10, palette.ink)}${text(hourLabel(weather.hours[i].time), x(i), plot.bottom + 38, { size: 25, weight: 700, anchor: "middle" })}`).join("");
  return `<g id="hourly-chart" role="img" aria-label="Next 24 hours: temperature in degrees Fahrenheit and predicted rainfall in inches">${line(frame.x, frame.y - 20, frame.x + frame.width, frame.y - 20)}${text("NEXT 24 HOURS", frame.x, frame.y + 32, { size: 32, weight: 700, "letter-spacing": 2 })}${text("TEMPERATURE", frame.x + 332, frame.y + 32, { size: 23, weight: 700, fill: temperatureColor })}${line(frame.x + 292, frame.y + 23, frame.x + 324, frame.y + 23, temperatureColor)}${text("RAINFALL", frame.x + 640, frame.y + 32, { size: 23, weight: 700, fill: rainColor })}<rect x="${frame.x + 602}" y="${frame.y + 12}" width="27" height="20" rx="2" fill="${rainColor}" opacity=".82"/>${text("TEMPERATURE (°F)", frame.x + 24, plot.top + height / 2, { size: 22, weight: 700, anchor: "middle", fill: temperatureColor, transform: `rotate(-90 ${frame.x + 24} ${plot.top + height / 2})` })}${text("RAINFALL (IN)", frame.x + frame.width - 20, plot.top + height / 2, { size: 22, weight: 700, anchor: "middle", fill: rainColor, transform: `rotate(90 ${frame.x + frame.width - 20} ${plot.top + height / 2})` })}${grid}${rainAxis}${bars}<path d="${chartLine(points, temperatureY)}" fill="none" stroke="${palette.paper}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/><path d="${chartLine(points, temperatureY)}" fill="none" stroke="${temperatureColor}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>${timeTicks.map((i) => `<circle cx="${x(i)}" cy="${temperatureY(weather.hours[i].temperature)}" r="7" fill="${temperatureColor}" stroke="${palette.paper}" stroke-width="3"/>`).join("")}${times}</g>`;
}

export function renderScene(initial) {
  const now = new Date(initial.serverTime);
  const date = now.toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", weekday: "long", month: "short", day: "numeric" });
  const [quote, attribution] = quoteForHour(initial.serverTime);
  const quoteLines = wrapLines(`“${quote}”`, 60, 2);
  return surface(
    layout.canvas,
    rect({ x: 0, y: 0, ...layout.canvas }, palette.paper) +
      text("AT HOME", 48, 62, { size: 25, weight: 700, "letter-spacing": 4 }) +
      text(date, 1032, 62, { size: 27, anchor: "end", fill: palette.secondary }) +
      `<g id="hourly-quote">${quoteLines.map((value, index) => text(value, 540, layout.quote.y + 42 + index * 43, { size: 34, anchor: "middle", family: "Georgia, serif" })).join("")}${text("— " + attribution, 540, layout.quote.y + 132, { size: 23, anchor: "middle", fill: palette.secondary })}</g>` +
      calendarPanel(initial.calendar) +
      weatherPanel(initial.weather) +
      hourlyChart(initial.weather) +
      text("Calendar · Google", 48, 1866, { size: 21, fill: palette.secondary }) +
      text("Weather · Open-Meteo", 1032, 1866, { size: 21, anchor: "end", fill: palette.secondary }) +
      (initial.weather?.updatedAt ? text("Last changed " + new Date(initial.weather.updatedAt).toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" }), 540, 1866, { size: 21, anchor: "middle", fill: palette.secondary }) : ""),
    "Calendar and San Francisco weather",
  );
}
