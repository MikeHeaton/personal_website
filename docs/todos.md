# Shared family to-do list

The phone app is `/todos`. The dashboard at `/display` alternates its five-day forecast and a two-column to-do panel on one-minute boundaries. Calendars, habits, current conditions and the hourly chart remain visible. Weather/calendar caches keep their ten-minute interval. The display uses server-rendered SVG and HTML refresh, with no client JavaScript. Long lists page across successive to-do appearances, in saved order down the left column then the right. Display labels use at most two lines; the phone shows the complete text.

## Storage and setup

The single source of truth is a JSON string in durable Upstash Redis. No application data is written to Vercel's ephemeral filesystem, the repository or browser local storage. To-do data is separate from `display:habits:*`. Backups and revision history are intentionally deferred; the authenticated export endpoint downloads the current document but is not an automatic backup.

Required server environment variables:

| Variable | Purpose |
| --- | --- |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Existing Upstash REST connection; `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` aliases also work |
| `DISPLAY_PASSWORD_HASH`, `DISPLAY_SESSION_SECRET` | Existing dashboard password/session authentication |
| `TODO_API_TOKEN_SHA256` | SHA-256 digest of the dedicated OpenClaw bearer token |
| `TODO_REDIS_KEY` | Production defaults to `family:todos:v1`. Local and preview require an explicit isolated key such as `family:todos:dev:mike` and reject `family:todos:v1` |

Never prefix these variables with `NEXT_PUBLIC_`. Production Redis credentials already exist on this Vercel project; use separate database credentials for development/preview when available, and always isolate their to-do key. Do not put production task content into fixtures.

Generate a new OpenClaw credential (files are created with mode 0600 and will not overwrite existing files):

```sh
node scripts/create-todo-token.mjs .vercel/todo-token
```

Configure the contents of `.vercel/todo-token.sha256` as `TODO_API_TOKEN_SHA256` in the intended Vercel environment. Give OpenClaw the contents of `.vercel/todo-token.txt` as its bearer credential. Do not send OpenClaw the hash. This new API does not accept `DISPLAY_SESSION_SECRET`; the existing habit recorder keeps its original credential and behavior. Rotating the to-do token only requires generating a new token/hash pair, updating OpenClaw and the deployment variable, and redeploying. The browser keeps using the existing dashboard password.

Initialize the target namespace once, using an ignored environment file containing the intended credentials, key and environment. Standalone scripts do not load Next.js environment files automatically:

```sh
node --env-file=.env.local scripts/init-todos.mjs
```

For production initialization, explicitly set `VERCEL_ENV=production` and `TODO_REDIS_KEY=family:todos:v1` in that private environment file. The script uses Redis `SET NX`, so it will preserve an existing list. It reports the namespace, revision and item count, never credentials or task text. Missing, unavailable or malformed data fails closed; requests and deployments never silently create an empty replacement. Deployments and application rollbacks do not roll back Redis data.

Development: Node 24, `npm install`, `npm run dev`. Validation: `npm test` and `npm run build`. Keep the production storage key identical between deployments. Preview/development credentials, keys and tokens must stay isolated from production.

## Data model and concurrency

```json
{
  "schemaVersion": 1,
  "revision": 1,
  "activeOrder": ["be4b6329-4c74-4a5d-b3bc-fbeadf8da4c8"],
  "items": [{
    "id": "be4b6329-4c74-4a5d-b3bc-fbeadf8da4c8",
    "text": "Buy milk",
    "createdAt": "2026-11-10T18:00:00.000Z",
    "done": false,
    "completedAt": null
  }]
}
```

Text is trimmed, 1–300 Unicode code points, with no control characters or line separators. IDs are server-generated UUID v4 values; dates are server-generated UTC ISO timestamps. New items append. Completion removes the ID from `activeOrder` and sets the completion timestamp once; the item remains archived. Archive reads sort newest completion first, then ID. Undo clears the timestamp and appends to the active list. DELETE removes the item, including an archived item, permanently. There are no other task fields.

Every mutation reads and validates the document, then uses a Redis Lua compare-and-set to replace exactly the version read. Independent server instances cannot overwrite each other's updates. Safe item operations retry up to eight conflicts; reorder requires the exact client revision. The document limit is 2 MiB; reaching it returns 507 without deleting or truncating anything. No TTL is applied to the actual list.

POST requires an `Idempotency-Key` of 8–128 letters, digits, colons, underscores or hyphens. The original result and a request fingerprint are stored for 24 hours atomically with the new item. Retry the same request with the same key after an uncertain network response. Changing its body returns 409. After 24 hours, the key can create a new item, so reconcile with the list before retrying an old request. Completion and deletion are naturally idempotent.

## Authentication and API

Base URL: `https://www.mikeheaton.uk/api/todos` (use the canonical `www` hostname to avoid redirect handling in HTTP clients).

Every endpoint, including reads and export, requires either the `display_session` cookie or `Authorization: Bearer <TODO_API_TOKEN>`. Cookie writes require a matching Origin and reject cross-site requests. JSON mutations require `Content-Type: application/json`. No cross-origin browser access is enabled. Responses are private, no-store and noindex. Authenticated writes are limited to 120/minute per credential/session in shared Redis and return `Retry-After: 60` on a limit. The existing Vercel login firewall rule continues to protect `/api/display/login`; retain it when migrating.

| Method and path | Request body | Response |
| --- | --- | --- |
| `GET /` | — | `200 {revision, items}`; outstanding items in saved order |
| `GET /?status=done` | — | `200 {revision, items}`; archived items |
| `GET /?status=all` | — | `200 {revision, items}`; outstanding then archived |
| `POST /` | `{"text":"Buy milk"}` | `201 {revision, item}`; requires Idempotency-Key |
| `PATCH /{id}` | `{"done":true}` or `{"done":false}` | `200 {revision, item}` |
| `DELETE /{id}` | — | `200 {revision, deletedId}`; also succeeds if already deleted |
| `PUT /order` | `{"ids":["id-b","id-a"]}` | `200 {revision, ids}`; requires If-Match |
| `GET /export` | — | Full document as `todos.json` attachment |

List/mutation responses include `ETag: "todos-N"`. Send the list's ETag as `If-Match` for reorder. Its body must contain every current outstanding ID exactly once, including an empty array for an empty list. If another device changed the document, refresh it and reconsider the intended order rather than overwriting it blindly.

Example OpenClaw calls, with the token supplied through its secret configuration:

```http
GET /api/todos HTTP/1.1
Host: www.mikeheaton.uk
Authorization: Bearer <TODO_API_TOKEN>
```

```json
{"revision":0,"items":[]}
```

```http
POST /api/todos HTTP/1.1
Host: www.mikeheaton.uk
Authorization: Bearer <TODO_API_TOKEN>
Content-Type: application/json
Idempotency-Key: 14b9736d-fc91-4dc1-9cf7-54d9ad6a44bd

{"text":"Buy milk"}
```

```json
{"revision":1,"item":{"id":"be4b6329-4c74-4a5d-b3bc-fbeadf8da4c8","text":"Buy milk","createdAt":"2026-11-10T18:00:00.000Z","done":false,"completedAt":null}}
```

```http
PUT /api/todos/order HTTP/1.1
Host: www.mikeheaton.uk
Authorization: Bearer <TODO_API_TOKEN>
Content-Type: application/json
If-Match: "todos-1"

{"ids":["be4b6329-4c74-4a5d-b3bc-fbeadf8da4c8"]}
```

Errors are JSON `{ "error": "code" }`: 400 invalid fields/text/order or missing idempotency key; 401 unauthorized; 403 cross-origin cookie mutation; 404 missing item for PATCH; 405 unsupported method; 409 conflicting retry or exhausted concurrent retries; 412 stale reorder; 413 oversized request; 415 non-JSON mutation; 428 missing reorder revision; 429 rate limited; 503 unconfigured/uninitialized/invalid/unavailable storage; 507 document full. Next.js produces the body-parser 413 response. Internal service details and secrets are never included in application errors.

## iPhone use

Open `/todos` in Safari, sign in with the dashboard password, then Share → Add to Home Screen. Keep “Open as Web App” enabled when shown. The icon opens a standalone app; an installed app may ask you to sign in again. The manifest, PNG icons (180/192/512), theme color and safe-area spacing are included. Login remains in the web-app context and only accepts `/todos` or `/display` as its return destination.

Add, complete, restore and delete items directly. Choose Arrange for touch-drag handles and accessible up/down buttons. Deletion asks for confirmation. The app refreshes every 30 seconds while visible and on focus/reconnect. It retains an unsent draft on failure and does not claim an uncertain write succeeded. Offline mutations are disabled; there is no offline write queue, service worker, push notification or browser copy of the authoritative list.

## Verification checklist

- Use an isolated namespace: unauthorized requests to every endpoint, valid cookie/bearer requests, CSRF rejection, exact validation and failure responses.
- Exercise concurrent additions/completions, identical-key retries, conflicting-key retries, stale reorder and corrupted storage without data loss.
- Confirm new clients, service restarts and separate deployments read identical IDs/order/archive from the same key; initialization must not replace data.
- Check weather and to-do slots on consecutive minute boundaries, multi-page overflow, long words, escaping, empty and unavailable lists; keep other dashboard panels intact.
- Check the app at narrow iPhone and desktop sizes, including keyboard, drag handles, arrows, archive and failed requests. Verify actual Home Screen install/relaunch/session persistence on an iPhone and refresh behavior on the EO1; desktop browser emulation cannot establish those device-specific results.
