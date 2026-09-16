# Mike Heaton's website

Next.js website with a private Electric Objects display at `/display`.

## Display drawing framework

The display is a server-rendered SVG 1.1 scene on a **1080 × 1920 design surface**. It scales uniformly to the browser viewport. It requires no client JavaScript, modern CSS layout, external fonts, or canvas runtime. Artwork and weather are loaded from the same website; only the server contacts Open-Meteo.

- `lib/display/drawing.mjs`: escaped text, rectangles, rules, equal-width columns, wrapped text, fitted images, and the scalable surface.
- `lib/display/scene.mjs`: named layout frames, palette/typography choices, and reusable artwork, current-weather, and forecast panels.
- `lib/display-page.mjs`: HTML document, password form, and automatic refresh.
- `lib/display-data.mjs`: independent refresh, artwork rotation, and weather-cache clocks.

To change the scene, compose drawing primitives inside a named frame. Use design coordinates instead of screen pixels. Keep text sizes explicit, reserve space for long labels, and use `columns()` to distribute repeated panels. Images use SVG `preserveAspectRatio="xMidYMid meet"` to center the complete artwork without cropping. SVG transforms and `xlink:href` support the EO1's older browser.

The current layout gives the weather a full-width band with bold sans-serif type and five evenly spaced forecast columns. Artwork captions use serif type.

## Content and refresh

- Four public-domain paintings from the Metropolitan Museum of Art. Provenance is in `lib/art.json`; image files are outside `public/` and served only after authentication.
- San Francisco current conditions and five-day forecast in Fahrenheit from Open-Meteo.
- **Forced page refresh every 60 seconds**, aligned to minute boundaries, for device iteration. Change `REFRESH_INTERVAL` to alter this.
- Artwork rotation remains hourly; weather is cached for ten minutes independently of page refresh.
- A weather-service failure still renders the painting and retries on the next refresh. A complete network outage can interrupt page reloads.

## Development and tests

Use Node 24. Run `npm install`, `npm run dev`, `npm test`, and `npm run build`.

Tests cover authentication, session expiry/revocation, refresh timing, no-JavaScript rendering, weather failure, escaping, and frame/column bounds. Verify both portrait and landscape artworks in a browser; then check the actual EO1 through the camera after it refreshes. Modern-browser screenshots alone do not establish old-device compatibility.

## Security and deployment

Set `DISPLAY_PASSWORD_HASH` and `DISPLAY_SESSION_SECRET` in `.env.local` and the Vercel production environment. Generate credentials with:

```
node scripts/create-display-password.mjs /tmp/display
```

The generated files are mode 0600. Keep the password in a password manager; never commit credentials.

Passwords use scrypt. Signed HttpOnly, Secure, SameSite=Lax cookies expire after 180 days. Changing the password hash or session secret revokes existing cookies after redeployment. All private routes authenticate independently and return non-cacheable responses. Missing credentials fail closed.

Production: `personal-website-dtb8`, team `mikeheatons-projects`. Deploy with `vercel deploy --prod --yes --scope mikeheatons-projects`. Attribute commits to the verified account email so Vercel accepts the deployment.

The Vercel Firewall `Display login attempts` rule limits POSTs to the resolved login route to 10 per 300 seconds per IP. It is platform configuration outside this repository; recreate it if migrating. Counters are regional, not an exact global limit.
