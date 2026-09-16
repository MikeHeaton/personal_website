# Mike Heaton's website

Next.js website with a private Electric Objects dashboard at `/display`.

## Display drawing framework

The display is a server-rendered SVG 1.1 scene on a **1080 × 1920 design surface**. It scales uniformly to the browser viewport and requires no client JavaScript, external fonts, or canvas runtime. Only the server contacts Google Calendar and Open-Meteo.

- `lib/display/drawing.mjs`: escaped text, rectangles, rules, equal-width columns, wrapped text, and the scalable surface.
- `lib/display/scene.mjs`: named layout frames, palette/typography choices, deterministic hourly quotations, agenda lists, weather panels, and the hourly chart.
- `lib/display-page.mjs`: HTML document, password form, and automatic refresh.
- `lib/display-calendar.mjs`: bounded iCalendar retrieval, recurrence expansion, overlap filtering, and caching.
- `lib/display-data.mjs`: weather retrieval and independent refresh/cache clocks.

Compose drawing primitives inside named frames and use design coordinates rather than screen pixels. The today/tomorrow agendas scroll with SVG `animateTransform` only when their clipped content is taller than the panel. Animation keyframes pause at both ends. Unsupported animation leaves the first entries visible as a static fallback.

## Calendar parser ecosystem fit

Before implementation, package metadata was checked for three maintained/minimal candidates:

- `ical.js` 2.2.1: updated 2025-08-08, no runtime dependencies, RFC 5545 parsing and recurrence support, about 1.2 MB unpacked.
- `node-ical` 0.27.2: updated 2026-09-13 and capable, but brings `rrule-temporal` and `temporal-polyfill` runtime dependencies.
- `ics-to-json-extended` 1.1.4: small, but last updated 2023-03-20 and depends on Moment.

`ical.js` was selected because it is maintained, standards-focused, recurrence-capable, and has no transitive runtime dependencies. The application wraps it with strict feed-size, event-count, occurrence-count, and timeout bounds rather than maintaining a narrow parser that could silently mishandle RFC escaping or recurrence.

## Content and refresh

Set `GOOGLE_CALENDAR_ICAL_URL` only in local/deployment server environment configuration. It must be an HTTP(S) private iCal feed URL; never prefix it with `NEXT_PUBLIC_`, commit it, or log it.

- Today and tomorrow use `America/Los_Angeles`, including recurring, all-day, overnight, and multiday events.
- San Francisco current conditions and five-day forecast come from Open-Meteo in Fahrenheit and inches.
- A deterministic local quotation rotates hourly without an external request.
- The page refreshes every ten minutes on ten-minute boundaries. Weather and calendar successes are cached independently in ten-minute slots.
- A weather failure retries once per minute; calendar and weather failures degrade independently.

## Development and tests

Use Node 24. Run `npm install`, `npm run dev`, `npm test`, and `npm run build`.

Tests cover authentication, session expiry/revocation, refresh timing, no-JavaScript rendering, degraded weather, calendar recurrence and overlap behavior, escaping, bounded ingestion, conditional agenda scrolling, dry-rain rendering, and frame bounds. Verify the actual route at 1080 × 1920 and a narrow viewport with empty, normal, and overflow calendar fixtures. Then check the actual EO1 after it refreshes; modern-browser screenshots alone do not establish old-device compatibility.

## Security and deployment

Set `DISPLAY_PASSWORD_HASH`, `DISPLAY_SESSION_SECRET`, and `GOOGLE_CALENDAR_ICAL_URL` in `.env.local` and the Vercel production environment. Generate display credentials with:

```
node scripts/create-display-password.mjs /tmp/display
```

The generated files are mode 0600. Keep credentials and the private calendar URL in a password manager; never commit them.

Passwords use scrypt. Signed HttpOnly, Secure, SameSite=Lax cookies expire after 180 days. Changing the password hash or session secret revokes existing cookies after redeployment. All private routes authenticate independently and return non-cacheable responses. Missing authentication credentials fail closed; a missing calendar URL produces an unavailable calendar panel without affecting weather.

Production: `personal-website-dtb8`, team `mikeheatons-projects`. Deploy with `vercel deploy --prod --yes --scope mikeheatons-projects`. Attribute commits to the verified account email so Vercel accepts the deployment.

The Vercel Firewall `Display login attempts` rule limits POSTs to the resolved login route to 10 per 300 seconds per IP. It is platform configuration outside this repository; recreate it if migrating. Counters are regional, not an exact global limit.
