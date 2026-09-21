# Display Specification

## Purpose and current behavior

`/display` is a private, password-authenticated portrait dashboard designed on a 1080 × 1920 SVG surface and scaled uniformly to the browser viewport. It is server-rendered without client-side JavaScript so it remains compatible with the Electric Objects EO1 browser.

The display contains:

- A four-row habit grid covering the seven completed `America/Los_Angeles` calendar dates ending yesterday; today is never included. The 112-design-unit left label column closely fits centered, high-contrast inline SVG drawings for Brush dog teeth, Make bed, Strength and protein, and Strength and run, leaving the remaining width to seven equal date columns. Each drawing is centered horizontally and vertically in its row and uses only SVG 1.1 primitives and paths—no emoji, webfonts, raster assets, JavaScript, or network images. Every row retains its full accessible text label. A stored `true` renders as a bold green check, a stored `false` renders as a black X, and a date with no valid stored record (including unavailable storage) leaves all four cells blank.
- Side-by-side agenda lists for today and tomorrow in `America/Los_Angeles`. The server reads the private Google Calendar iCal feed from `GOOGLE_CALENDAR_ICAL_URL`, expands recurrence, includes all-day and multiday events that overlap either day, and handles iCalendar escaping. A list scrolls with native SVG animation only when its contents overflow; the animation dwells at the top and bottom, and browsers without animation support retain a useful static top-of-list view.
- Mission District current temperature and conditions from Open-Meteo, using the address-level forecast point at `37.7565942, -122.4111482`.
- A five-day forecast with daily conditions, high and low temperatures, and maximum precipitation probability.
- One weather chart spanning exactly 48 hourly points from midnight at the start of today through midnight after tomorrow in `America/Los_Angeles`. It uses six-hour ticks across the full window, dated midnight labels, a prominent thick black divider at the +24-hour boundary, and neutral-gray shading for elapsed time. It uses an orange temperature line and blue rainfall bars with separate labeled °F and inches axes, without a visible legend. Actual Open-Meteo sunrise and sunset times for both displayed local dates appear at their fractional time positions as short, subtle vertical markers centered on the interpolated temperature line. Each marker has a font-independent monochrome inline-SVG sun or crescent on its own line and a compact, suffix-free 12-hour time such as `6:52` directly below it in small type; accessible labels identify the event and time. Missing or malformed solar data omits only the affected markers. The temperature axis preserves padding around every displayed hourly value, then rounds its lower bound down and upper bound up to multiples of 10°F, including flat forecasts and values that fall on a 10°F boundary. The rainfall axis normally tops out at 0.05 inches and expands to a rounded upper bound with headroom when any displayed hourly rainfall exceeds that baseline; an explicit blue line marks zero inches when the full window is dry.
- A footer crediting Google Calendar and Open-Meteo, plus `Last changed` showing the weather refresh time in `America/Los_Angeles`.

The authenticated HTML page refreshes every ten minutes, aligned to ten-minute boundaries. Successful weather and calendar responses are cached in ten-minute slots. If either upstream fails, its panel degrades without preventing the other data from rendering. Weather failure causes the page to retry once per minute until weather recovers; calendar failure recovers on the normal page refresh.

## Implementation map

- `next.config.js` rewrites `/display` to the authenticated server-rendered route at `pages/api/display/screen.js`.
- `lib/display-page.mjs` renders the login or display document and schedules refreshes.
- `lib/display/scene.mjs` defines the 1080 × 1920 layout and renders the seven-date habit grid, agendas, current conditions, five-day forecast, midnight-based 48-hour chart, and footer.
- `lib/display/drawing.mjs` provides SVG 1.1 drawing primitives compatible with the EO1.
- `lib/display-calendar.mjs` performs bounded server-only iCal fetching and parsing, recurrence expansion, day-overlap selection, and ten-minute caching.
- `lib/display-data.mjs` fetches and validates bounded Open-Meteo data for the Mission District address-level forecast point, selects the local-midnight 48-hour forecast window and its two dates' sunrise/sunset values, and controls weather caching and refresh clocks.
- `lib/display-habits.mjs` defines the habit/date model and an explicit durable-store provider backed by the Upstash Redis REST API. Each local date is a separate Redis key; the dashboard reads the seven completed dates ending yesterday with `MGET`, and unavailable, missing, or malformed values remain blank rather than being treated as false.
- `lib/display-auth.mjs`, `pages/api/display/login.js`, and `pages/api/display/habits.js` implement display and record-API authentication. Credentials, storage credentials, and the private calendar URL belong only in local and deployment environment configuration and must never be committed, logged, or exposed to the browser.

## Habit record API and persistence

`POST /api/display/habits` accepts JSON in this exact form:

```json
{
  "date": "2026-09-21",
  "habits": {
    "dogTeeth": true,
    "bed": false,
    "strengthProtein": true,
    "strengthRun": false
  }
}
```

The date must be a real `YYYY-MM-DD` local calendar date, all four keys are required, no extra keys are accepted, and every result must be boolean. Authentication may use the existing valid `display_session` HttpOnly cookie from a same-origin request or `Authorization: Bearer <DISPLAY_SESSION_SECRET>` for a server-to-server recorder. Success returns HTTP 200 with the normalized record. Invalid input returns 400, missing/invalid authentication returns 401 (or 403 for a cross-site cookie request), and unconfigured or unavailable durable storage returns 503.

Production persistence requires a free Upstash Redis database connected through Vercel Marketplace with server-only `KV_REST_API_URL` and `KV_REST_API_TOKEN`. Direct Upstash setups may instead use the compatible aliases `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. The dashboard remains renderable if storage is absent, but the record endpoint deliberately fails with `habit_storage_unconfigured`; process memory and the serverless filesystem are never used.
- `tests/display.test.mjs` covers display and record-API authentication, habit validation/persistence, missing-versus-false rendering, the yesterday-ended local date window, font-independent centered label drawings and their accessible bounds, narrow label-column geometry, timing, server rendering, degraded weather behavior, calendar recurrence and boundaries, escaping, conditional scrolling, the 48-hour weather window, solar-data parsing and fallback, fractional solar-marker positioning and temperature interpolation, two-day solar labels, temperature-axis bounds, six-hour ticks, the +24-hour divider, elapsed shading, zero-rain rendering, and layout bounds.

# How To Update

1. Preserve the public home page and the `/display` authentication boundary. Private display routes must continue to require a valid display session and return non-cacheable responses.
2. Keep the display glanceable at a distance: use the named layout frames and 1080 × 1920 design coordinates, retain strong contrast and bold weather typography, allow for long labels, and check that all content remains inside the portrait canvas.
3. Weather and calendar displays must remain time-relative. The local-midnight today-and-tomorrow 48-hour forecast, elapsed-time mask, and today/tomorrow agenda must follow the current time in `America/Los_Angeles`; healthy automatic updates do not require manual edits as time advances.
4. Keep calendar ingestion server-only. Bound response size, component count, recurrence expansion, and fetch duration; treat malformed, missing, or unavailable feeds as a graceful panel failure. Never log, render, commit, or otherwise disclose `GOOGLE_CALENDAR_ICAL_URL`.
5. Preserve the existing weather source and units unless intentionally changing the product: Open-Meteo, Fahrenheit, inches of rainfall, and `America/Los_Angeles` display times.
6. Avoid unnecessary pushes. Make focused changes only when the implementation needs to change, and keep unrelated files out of the commit.
7. Before pushing, run `npm test` and `npm run build`. Visually check `/display` at 1080 × 1920 and a narrow viewport with empty, normal, and overflowing agendas plus wet and dry forecast fixtures. Inspect the seven-date habit grid and exact labels/symbol colors, scroll dwell/fallback, the sole 48-hour chart, elapsed mask, six-hour ticks, dated midnight labels, the thick black +24-hour divider, all available sunrise/sunset markers and labels, the dry-rain line, axes, and footer; confirm nothing clips or overlaps. Verify `/` remains unchanged. When available, verify the actual EO1 after refresh; a modern-browser screenshot alone does not prove old-device compatibility.
8. Update this specification whenever intended display behavior, data sources, timing, authentication, layout, or verification changes.
