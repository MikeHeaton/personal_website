export const HOUR = 3600000;
export const REFRESH_INTERVAL = 10 * 60 * 1000;
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

function nextDateKey(dateKey) {
  const date = new Date(dateKey + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function validSolarTime(value, dateKey) {
  return typeof value === "string" &&
    new RegExp(`^${dateKey}T(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d)?$`).test(value)
    ? value
    : null;
}

export function parseSunTimes(daily, firstDateKey) {
  if (!firstDateKey) return [];
  return [firstDateKey, nextDateKey(firstDateKey)].map((date) => {
    const index = Array.isArray(daily?.time) ? daily.time.indexOf(date) : -1;
    return {
      date,
      sunrise: validSolarTime(daily?.sunrise?.[index], date),
      sunset: validSolarTime(daily?.sunset?.[index], date),
    };
  });
}
const WEATHER_CACHE_INTERVAL = 10 * 60 * 1000;
let cached;
export async function weather(now = Date.now(), fetcher = fetch) {
  if (cached && cached.slot === Math.floor(now / WEATHER_CACHE_INTERVAL))
    return cached.value;
  const url =
    "https://api.open-meteo.com/v1/forecast?latitude=37.7565942&longitude=-122.4111482&current=temperature_2m,weather_code&hourly=temperature_2m,precipitation&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=America%2FLos_Angeles&forecast_days=5";
  const response = await fetcher(url, { signal: AbortSignal.timeout(6000) });
  if (!response.ok) throw new Error("Weather service unavailable");
  const data = await response.json();
  if (
    !Number.isFinite(data.current?.temperature_2m) ||
    typeof data.current?.time !== "string" ||
    data.daily?.time?.length < 5 ||
    !Array.isArray(data.hourly?.time) ||
    !Array.isArray(data.hourly?.temperature_2m) ||
    !Array.isArray(data.hourly?.precipitation) ||
    data.hourly.time.length > 24 * 7 ||
    data.hourly.temperature_2m.length !== data.hourly.time.length ||
    data.hourly.precipitation.length !== data.hourly.time.length
  )
    throw new Error("Incomplete forecast");
  const twoDayStart = data.hourly.time.findIndex(
    (time) => time === data.current.time.slice(0, 10) + "T00:00",
  );
  const twoDayHours = data.hourly.time
    .slice(twoDayStart, twoDayStart + 48)
    .map((time, i) => ({
      time,
      temperature: data.hourly.temperature_2m[twoDayStart + i],
      rain: data.hourly.precipitation[twoDayStart + i],
    }));
  if (
    twoDayStart < 0 ||
    twoDayHours.length !== 48 ||
    twoDayHours.some(
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
    twoDayHours,
    sunTimes: parseSunTimes(data.daily, twoDayHours[0].time.slice(0, 10)),
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
