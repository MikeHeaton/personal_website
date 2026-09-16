# Display Specification

## Purpose and current behavior

`/display` is a private, password-authenticated portrait display designed on a 1080 × 1920 SVG surface and scaled uniformly to the browser viewport. It is server-rendered without client-side JavaScript so it remains compatible with the Electric Objects EO1 browser.

The display contains:

- One of four public-domain artworks from The Metropolitan Museum of Art, rotated on the hour. The complete image is centered without cropping, with its title, artist, and date below it.
- San Francisco current temperature and conditions from Open-Meteo.
- A five-day forecast with daily conditions, high and low temperatures, and maximum precipitation probability.
- A bold “Next 24 Hours” chart using an orange temperature line and blue rainfall bars. Temperature in °F uses the left axis; rainfall in inches uses the separate right axis.
- A footer crediting The Metropolitan Museum of Art and Open-Meteo, plus `Last changed` showing the weather data refresh time in `America/Los_Angeles`.

The authenticated HTML page refreshes every ten minutes, aligned to ten-minute boundaries. Artwork selection changes hourly, while successful weather responses are cached in ten-minute slots. If weather retrieval fails, the artwork still renders, the weather area reports that it is unavailable, and the page retries once per minute until weather recovers.

## Implementation map

- `next.config.js` rewrites `/display` to the authenticated server-rendered route at `pages/api/display/screen.js`.
- `lib/display-page.mjs` renders the login or display document and schedules refreshes.
- `lib/display/scene.mjs` defines the 1080 × 1920 layout and renders the artwork, current conditions, five-day forecast, 24-hour chart, and footer.
- `lib/display/drawing.mjs` provides SVG 1.1 drawing primitives compatible with the EO1.
- `lib/display-data.mjs` fetches Open-Meteo data, selects the current 24-hour forecast window, and controls weather caching and artwork rotation clocks.
- `lib/art.json` records artwork metadata and Metropolitan Museum provenance; authenticated image delivery is handled by `pages/api/display/art.js`.
- `lib/display-auth.mjs` and `pages/api/display/login.js` implement display authentication. Credentials belong only in local and deployment environment configuration and must never be committed.
- `tests/display.test.mjs` covers authentication, timing, server rendering, degraded weather behavior, escaping, and layout bounds.

# How To Update

1. Preserve the public home page and the `/display` authentication boundary. Private artwork and weather display routes must continue to require a valid display session and return non-cacheable responses.
2. Keep the display glanceable at a distance: use the named layout frames and 1080 × 1920 design coordinates, retain strong contrast and bold weather typography, allow for long labels, and check that all content remains inside the portrait canvas.
3. Weather displays must show timely predictions relative to the current time. For example, a “next 24 hours” prediction must cover the next 24 hours as of the current time, not a stale fixed window. A self-updating implementation satisfies this requirement: no manual code or content update is required merely because time advances when the live weather fetch, cache, and refresh logic automatically keeps that window aligned to the current time. In that healthy automatic-update case, periodic maintenance checks must remain read-only and must not create a commit or push. Maintenance should change and push the implementation only when that mechanism is absent, stale, broken, or no longer produces the required current window.
4. Preserve the existing sources, units, and timezone conventions unless intentionally changing the product: Metropolitan Museum artwork, Open-Meteo weather, Fahrenheit temperatures, inches of rainfall, and `America/Los_Angeles` display times.
5. Keep artwork provenance in `lib/art.json`, use public-domain works, and serve private artwork only through the authenticated route. Do not add secrets or credentials to the repository.
6. Avoid unnecessary pushes. Make focused changes only when the implementation needs to change, and keep unrelated files out of the commit.
7. Before pushing, run `npm test` and `npm run build`. Visually check `/display` with both portrait and landscape artworks, confirm current conditions and all five forecast columns are readable, and inspect both chart axes and the `Last changed` footer. When available, verify the actual EO1 after its refresh; a modern-browser screenshot alone does not prove old-device compatibility.
8. Update this specification whenever the intended display behavior, data sources, timing, authentication, layout, or verification process changes.
