export const HOUR = 3600000;
export const REFRESH_INTERVAL = 60 * 1000;
export const nextRefresh = (now = Date.now()) =>
  (Math.floor(now / REFRESH_INTERVAL) + 1) * REFRESH_INTERVAL;
export const hourSlot = (now = Date.now()) => Math.floor(now / HOUR);
export const nextHour = (now = Date.now()) => (hourSlot(now) + 1) * HOUR;
export function weatherLabel(code) {
  if (code === 0) return "Clear skies";
  if (code <= 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code <= 48) return "Fog";
  if (code <= 57) return "Drizzle";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Showers";
  if (code <= 86) return "Snow showers";
  return "Thunderstorms";
}
const WEATHER_CACHE_INTERVAL = 10 * 60 * 1000;
let cached;
export async function weather(now = Date.now()) {
  if (cached && cached.slot === Math.floor(now / WEATHER_CACHE_INTERVAL))
    return cached.value;
  const url =
    "https://api.open-meteo.com/v1/forecast?latitude=37.7749&longitude=-122.4194&current=temperature_2m,weather_code&hourly=temperature_2m,precipitation&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=America%2FLos_Angeles&forecast_days=5";
  const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!response.ok) throw new Error("Weather service unavailable");
  const data = await response.json();
  if (
    !Number.isFinite(data.current?.temperature_2m) ||
    typeof data.current?.time !== "string" ||
    data.daily?.time?.length < 5 ||
    data.hourly?.time?.length < 24
  )
    throw new Error("Incomplete forecast");
  let hourlyStart = data.hourly.time.findIndex(
    (time) => time >= data.current.time.slice(0, 13) + ":00",
  );
  if (hourlyStart < 0) hourlyStart = 0;
  const hours = data.hourly.time
    .slice(hourlyStart, hourlyStart + 24)
    .map((time, i) => ({
      time,
      temperature: data.hourly.temperature_2m[hourlyStart + i],
      rain: data.hourly.precipitation[hourlyStart + i],
    }));
  if (
    hours.length !== 24 ||
    hours.some(
      ({ temperature, rain }) =>
        !Number.isFinite(temperature) || !Number.isFinite(rain),
    )
  )
    throw new Error("Incomplete hourly forecast");
  const value = {
    temperature: Math.round(data.current.temperature_2m),
    code: data.current.weather_code,
    label: weatherLabel(data.current.weather_code),
    updatedAt: now,
    hours,
    days: data.daily.time.map((date, i) => ({
      date,
      code: data.daily.weather_code[i],
      label: weatherLabel(data.daily.weather_code[i]),
      high: Math.round(data.daily.temperature_2m_max[i]),
      low: Math.round(data.daily.temperature_2m_min[i]),
      rain: data.daily.precipitation_probability_max[i],
    })),
  };
  cached = { slot: Math.floor(now / WEATHER_CACHE_INTERVAL), value };
  return value;
}
