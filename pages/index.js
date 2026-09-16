import Head from 'next/head';
import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from '../styles/Home.module.css';

const LOCATION = {
  name: 'San Francisco',
  latitude: 37.7749,
  longitude: -122.4194,
};
const REFRESH_INTERVAL = 15 * 60 * 1000;

const WEATHER_LABELS = {
  0: 'Clear',
  1: 'Mostly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Foggy',
  48: 'Foggy',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  80: 'Rain showers',
  81: 'Rain showers',
  82: 'Heavy showers',
  95: 'Thunderstorms',
};

function formatHour(value, timeZone) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    timeZone,
  }).format(new Date(value));
}

function WeatherChart({ hours, temperatureUnit, rainUnit, timeZone }) {
  const width = 1000;
  const height = 430;
  const plot = { left: 92, right: 92, top: 54, bottom: 82 };
  const chartWidth = width - plot.left - plot.right;
  const chartHeight = height - plot.top - plot.bottom;

  const values = useMemo(() => {
    const temperatures = hours.map((hour) => hour.temperature);
    const rain = hours.map((hour) => hour.rain);
    const rawMin = Math.min(...temperatures);
    const rawMax = Math.max(...temperatures);
    const temperatureStep = rawMax - rawMin < 8 ? 2 : 5;
    const temperatureMin = Math.floor((rawMin - 1) / temperatureStep) * temperatureStep;
    const temperatureMax = Math.ceil((rawMax + 1) / temperatureStep) * temperatureStep;
    const rainMax = Math.max(1, Math.ceil(Math.max(...rain) * 2) / 2);

    return { temperatureMin, temperatureMax, rainMax };
  }, [hours]);

  const x = (index) => plot.left + (index / (hours.length - 1)) * chartWidth;
  const temperatureY = (value) =>
    plot.top +
    ((values.temperatureMax - value) /
      (values.temperatureMax - values.temperatureMin || 1)) *
      chartHeight;
  const rainY = (value) => plot.top + chartHeight - (value / values.rainMax) * chartHeight;
  const linePath = hours
    .map((hour, index) => `${index ? 'L' : 'M'} ${x(index)} ${temperatureY(hour.temperature)}`)
    .join(' ');
  const tickIndexes = [0, 6, 12, 18, 23].filter((index) => index < hours.length);
  const temperatureTicks = Array.from({ length: 5 }, (_, index) =>
    values.temperatureMin + ((values.temperatureMax - values.temperatureMin) * index) / 4
  );
  const rainTicks = Array.from({ length: 3 }, (_, index) => (values.rainMax * index) / 2);
  const barWidth = Math.max(8, (chartWidth / hours.length) * 0.62);

  return (
    <section className={styles.forecastCard} aria-labelledby="forecast-title">
      <div className={styles.chartHeading}>
        <div>
          <p className={styles.eyebrow}>Hourly forecast</p>
          <h2 id="forecast-title">Next 24 hours</h2>
        </div>
        <div className={styles.legend} aria-label="Chart legend">
          <span><i className={styles.temperatureKey} />Temperature</span>
          <span><i className={styles.rainKey} />Rainfall</span>
        </div>
      </div>

      <div className={styles.chartScroller}>
        <svg
          className={styles.chart}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-labelledby="chart-title chart-description"
        >
          <title id="chart-title">Temperature and rainfall forecast for the next 24 hours</title>
          <desc id="chart-description">
            Orange line shows temperature on the left axis. Blue bars show predicted rainfall on the right axis.
          </desc>

          <text className={styles.axisTitle} x="22" y={plot.top + chartHeight / 2} transform={`rotate(-90 22 ${plot.top + chartHeight / 2})`}>
            Temperature ({temperatureUnit})
          </text>
          <text className={styles.axisTitle} x={width - 18} y={plot.top + chartHeight / 2} transform={`rotate(90 ${width - 18} ${plot.top + chartHeight / 2})`}>
            Rainfall ({rainUnit})
          </text>

          {temperatureTicks.map((tick) => {
            const y = temperatureY(tick);
            return (
              <g key={tick}>
                <line className={styles.gridLine} x1={plot.left} x2={width - plot.right} y1={y} y2={y} />
                <text className={styles.axisLabel} x={plot.left - 16} y={y + 6} textAnchor="end">{Math.round(tick)}°</text>
              </g>
            );
          })}

          {rainTicks.map((tick) => (
            <text
              className={styles.axisLabel}
              key={tick}
              x={width - plot.right + 16}
              y={rainY(tick) + 6}
              textAnchor="start"
            >
              {tick.toFixed(tick % 1 ? 1 : 0)}
            </text>
          ))}

          {hours.map((hour, index) => {
            const y = rainY(hour.rain);
            return (
              <rect
                className={styles.rainBar}
                key={hour.time}
                x={x(index) - barWidth / 2}
                y={y}
                width={barWidth}
                height={plot.top + chartHeight - y}
                rx="3"
              />
            );
          })}

          <path className={styles.temperatureLineShadow} d={linePath} />
          <path className={styles.temperatureLine} d={linePath} />
          {hours.filter((_, index) => index % 3 === 0 || index === hours.length - 1).map((hour) => {
            const index = hours.indexOf(hour);
            return <circle className={styles.temperaturePoint} key={hour.time} cx={x(index)} cy={temperatureY(hour.temperature)} r="6" />;
          })}

          {tickIndexes.map((index) => (
            <g key={hours[index].time}>
              <line className={styles.tickLine} x1={x(index)} x2={x(index)} y1={plot.top + chartHeight} y2={plot.top + chartHeight + 10} />
              <text className={styles.timeLabel} x={x(index)} y={plot.top + chartHeight + 38} textAnchor="middle">
                {formatHour(hours[index].time, timeZone)}
              </text>
              {index === 0 && <text className={styles.nowLabel} x={x(index)} y={plot.top + chartHeight + 62} textAnchor="middle">NOW</text>}
            </g>
          ))}
        </svg>
      </div>
    </section>
  );
}

export default function Home() {
  const [weather, setWeather] = useState(null);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadWeather = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        latitude: LOCATION.latitude,
        longitude: LOCATION.longitude,
        current: 'temperature_2m,apparent_temperature,weather_code,precipitation,wind_speed_10m',
        hourly: 'temperature_2m,precipitation',
        temperature_unit: 'fahrenheit',
        wind_speed_unit: 'mph',
        precipitation_unit: 'inch',
        timezone: 'auto',
        forecast_days: '2',
      });
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
      if (!response.ok) throw new Error(`Weather request failed (${response.status})`);
      const data = await response.json();
      const currentHour = new Date(data.current.time).setMinutes(0, 0, 0);
      let startIndex = data.hourly.time.findIndex((time) => new Date(time).getTime() >= currentHour);
      if (startIndex < 0) startIndex = 0;
      const hours = data.hourly.time.slice(startIndex, startIndex + 24).map((time, index) => ({
        time,
        temperature: data.hourly.temperature_2m[startIndex + index],
        rain: data.hourly.precipitation[startIndex + index],
      }));

      setWeather({ ...data, hours });
      setLastUpdated(new Date());
      setError('');
    } catch (requestError) {
      setError(requestError.message || 'Weather is temporarily unavailable.');
    }
  }, []);

  useEffect(() => {
    loadWeather();
    const interval = window.setInterval(loadWeather, REFRESH_INTERVAL);
    return () => window.clearInterval(interval);
  }, [loadWeather]);

  return (
    <div className={styles.container}>
      <Head>
        <title>Mike Heaton | San Francisco weather</title>
        <meta name="description" content="Mike Heaton and a glanceable San Francisco weather forecast." />
        <link rel="icon" href="/happy.ico" />
      </Head>

      <main className={styles.main}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Hello there</p>
            <h1>Hi, I&apos;m Mike.</h1>
            <p className={styles.intro}>A quick look at home and the weather ahead.</p>
          </div>
          <img className={styles.profileImage} src="/face.png" alt="Mike by the ocean" />
        </header>

        <section className={styles.weatherSummary} aria-live="polite">
          <div>
            <p className={styles.eyebrow}>Current weather</p>
            <h2>{LOCATION.name}</h2>
            {weather ? (
              <p className={styles.condition}>{WEATHER_LABELS[weather.current.weather_code] || 'Current conditions'}</p>
            ) : (
              <p className={styles.condition}>{error || 'Loading forecast…'}</p>
            )}
          </div>
          {weather && (
            <>
              <div className={styles.currentTemperature}>
                {Math.round(weather.current.temperature_2m)}<span>°F</span>
              </div>
              <dl className={styles.weatherDetails}>
                <div><dt>Feels like</dt><dd>{Math.round(weather.current.apparent_temperature)}°</dd></div>
                <div><dt>Wind</dt><dd>{Math.round(weather.current.wind_speed_10m)} mph</dd></div>
                <div><dt>Rain now</dt><dd>{weather.current.precipitation.toFixed(2)} in</dd></div>
              </dl>
            </>
          )}
        </section>

        {weather?.hours?.length === 24 ? (
          <WeatherChart
            hours={weather.hours}
            temperatureUnit={weather.hourly_units.temperature_2m}
            rainUnit={weather.hourly_units.precipitation}
            timeZone={weather.timezone}
          />
        ) : (
          <section className={styles.forecastCard} aria-busy="true">
            <p className={styles.loadingMessage}>{error || 'Loading the next 24 hours…'}</p>
          </section>
        )}

        <div className={styles.updateRow}>
          <span>{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Connecting to Open-Meteo'}</span>
          <button type="button" onClick={loadWeather}>Refresh forecast</button>
        </div>

        <footer className={styles.contacts} aria-label="Contact Mike">
          <a href="https://www.linkedin.com/in/mikeheatonsf/">
            <img src="/linkedin-circle-large.png" alt="LinkedIn: @mikeheatonsf" />
          </a>
          <a href="mailto:mike@mikeheaton.uk">
            <img src="/email-circle-large.png" alt="Email: mike@mikeheaton.uk" />
          </a>
          <a href="https://twitter.com/realmikeheaton/">
            <img src="/twitter-circle-large.png" alt="Twitter: @realmikeheaton" />
          </a>
        </footer>
      </main>
    </div>
  );
}
