# Mike Heaton's website

Next.js website with a private Electric Objects dashboard at `/display`.

## Display drawing framework

The display is a server-rendered SVG 1.1 scene on a **1080 × 1920 design surface**. It scales uniformly to the browser viewport and requires no client JavaScript, external fonts, or canvas runtime. Only the server contacts Google Calendar, Open-Meteo, and durable habit storage.

- `lib/display/drawing.mjs`: escaped text, rectangles, rules, equal-width columns, wrapped text, and the scalable surface.
- `lib/display/scene.mjs`: named layout frames, palette/typography choices, a seven-local-date habit grid, agenda lists, weather panels, and the midnight-based 48-hour chart.
- `lib/display-page.mjs`: HTML document, password form, and automatic refresh.
- `lib/display-calendar.mjs`: bounded iCalendar retrieval, recurrence expansion, overlap filtering, and caching.
- `lib/display-data.mjs`: weather retrieval and independent refresh/cache clocks.
- `lib/display-habits.mjs`: habit validation/date windows and the durable Upstash Redis REST provider.

Compose drawing primitives inside named frames and use design coordinates rather than screen pixels. The today/tomorrow agendas scroll with SVG `animateTransform` only when their clipped content is taller than the panel. Animation keyframes pause at both ends, and unsupported agenda animation leaves the first entries visible. The sole weather chart covers the local-midnight 48-hour today/tomorrow window and uses a thick black divider to mark the +24-hour boundary.

## Calendar parser ecosystem fit

Before implementation, package metadata was checked for three maintained/minimal candidates:

- `ical.js` 2.2.1: updated 2025-08-08, no runtime dependencies, RFC 5545 parsing and recurrence support, about 1.2 MB unpacked.
- `node-ical` 0.27.2: updated 2026-09-13 and capable, but brings `rrule-temporal` and `temporal-polyfill` runtime dependencies.
- `ics-to-json-extended` 1.1.4: small, but last updated 2023-03-20 and depends on Moment.

`ical.js` was selected because it is maintained, standards-focused, recurrence-capable, and has no transitive runtime dependencies. The application wraps it with strict feed-size, event-count, occurrence-count, and timeout bounds rather than maintaining a narrow parser that could silently mishandle RFC escaping or recurrence.

## Content and refresh

Set `GOOGLE_CALENDAR_ICAL_URL` only in local/deployment server environment configuration. It must be an HTTP(S) private iCal feed URL; never prefix it with `NEXT_PUBLIC_`, commit it, or log it.

- Today and tomorrow use `America/Los_Angeles`, including recurring, all-day, overnight, and multiday events.
- San Francisco current conditions and five-day forecast come from Open-Meteo in Fahrenheit and inches. Validated hourly data supplies exactly 48 local hourly points for today and tomorrow. The chart uses six-hour ticks, dated midnight labels, a thick black +24-hour divider, and a neutral elapsed-time mask; a dry window retains an explicit blue zero-inches line.
- A four-row habit grid shows the last seven `America/Los_Angeles` dates, with green checks for recorded true values and black Xs for false or missing values.
- The page refreshes every ten minutes on ten-minute boundaries. Weather and calendar successes are cached independently in ten-minute slots.
- A weather failure retries once per minute; calendar and weather failures degrade independently.

## Development and tests

Use Node 24. Run `npm install`, `npm run dev`, `npm test`, and `npm run build`.

Tests cover authentication, session expiry/revocation, refresh timing, no-JavaScript rendering, degraded weather, calendar recurrence and overlap behavior, escaping, bounded ingestion, conditional agenda scrolling, the midnight-based 48-hour weather window, elapsed mask, six-hour ticks, the +24-hour divider, dry-rain rendering, and frame bounds. Verify the actual route at 1080 × 1920 and a narrow viewport with empty, normal, and overflow calendar fixtures plus wet and dry weather fixtures. Confirm the chart is legible and no content clips or overlaps. Then check the actual EO1 after it refreshes; modern-browser screenshots alone do not establish old-device compatibility.

## Security and deployment

Set `DISPLAY_PASSWORD_HASH`, `DISPLAY_SESSION_SECRET`, `GOOGLE_CALENDAR_ICAL_URL`, `KV_REST_API_URL`, and `KV_REST_API_TOKEN` in `.env.local` and the Vercel production environment. Vercel Marketplace supplies the two `KV_` variables from a durable Upstash Redis database; direct Upstash setups may use `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` instead. Without either pair the dashboard displays missing habits as X and the write API returns HTTP 503. Generate display credentials with:

```
node scripts/create-display-password.mjs /tmp/display
```

The generated files are mode 0600. Keep credentials and the private calendar URL in a password manager; never commit them.

Passwords use scrypt. Signed HttpOnly, Secure, SameSite=Lax cookies expire after 180 days. Changing the password hash or session secret revokes existing cookies after redeployment. All private routes authenticate independently and return non-cacheable responses. `POST /api/display/habits` accepts a valid same-origin display cookie or `Authorization: Bearer <DISPLAY_SESSION_SECRET>` and a complete `{date, habits}` JSON record using the keys `dogTeeth`, `bed`, `strengthProtein`, and `strengthRun`. Missing authentication credentials fail closed; a missing calendar URL produces an unavailable calendar panel without affecting weather.

Production: `personal-website-dtb8`, team `mikeheatons-projects`. Deploy with `vercel deploy --prod --yes --scope mikeheatons-projects`. Attribute commits to the verified account email so Vercel accepts the deployment.

The Vercel Firewall `Display login attempts` rule limits POSTs to the resolved login route to 10 per 300 seconds per IP. It is platform configuration outside this repository; recreate it if migrating. Counters are regional, not an exact global limit.
