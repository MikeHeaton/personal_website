# Mike Heaton's website

Next.js website with a private Electric Objects display at `/display`.

## Display

- Public-domain paintings from the Metropolitan Museum of Art, served through authenticated image routes. Provenance lives in `lib/art.json`; images are outside `public/`.
- Current San Francisco conditions and five-day forecast in Fahrenheit, from Open-Meteo.
- Artwork rotates every clock hour. A server-clock-aligned timer fetches content on the hour; visibility/network recovery and a watchdog catch missed updates. Failed requests retry after a minute and retain already displayed content.
- Initial artwork, date, and weather are rendered on the server. The page works without JavaScript; an HTML refresh targets the next hour (or retries within a minute if weather is unavailable). A forced HTML refresh remains active on every browser, even when the same-origin ES5 script is also fetching updates. No museum or weather requests originate from the device.
- Plain HTML, CSS and ES5 JavaScript avoid requiring React hydration or modern browser APIs on the E01.

## Development

Use Node 24, run `npm install`, then `npm run dev`. Open `/display`.

Set `DISPLAY_PASSWORD_HASH` and `DISPLAY_SESSION_SECRET` in `.env.local`. Generate a random password and hash with:

```
node scripts/create-display-password.mjs /tmp/display
```

This writes three mode-0600 files: `-password.txt`, `-hash.txt`, and `-secret.txt`. Store the hash and secret in environment variables; keep the password in your password manager. Do not commit any of them.

## Security and deployment

Password verification uses scrypt. Signed HttpOnly, Secure, SameSite=Lax cookies expire after 180 days. Rotating either the password hash or session secret revokes existing sessions after redeployment. Every data/image route independently verifies the cookie; protected responses are private and non-cacheable. Missing credentials fail closed. Local development permits HTTP cookies; deployed environments require HTTPS.

Production project: `personal-website-dtb8` in `mikeheatons-projects`. Configure the two secrets in Vercel before deploying. Preview deployments without secrets remain locked.

Vercel Firewall rule `Display login attempts` limits the login route to 10 requests per 300 seconds per IP. This platform setting is essential: it persists outside this repository and should be recreated when migrating projects. Vercel counters are regional, not an exact global limit.

Run `npm test` and `npm run build`, then `vercel deploy --prod --yes --scope mikeheatons-projects`. Verify the public homepage, display login, protected JSON/images, cookie flags, and the firewall rule after deployment.

The E01's own browser still needs a physical check for HTTPS support and login persistence across a power cycle.
