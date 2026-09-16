import { nextRefresh } from "./display-data.mjs";
import { renderScene } from "./display/scene.mjs";
import { escapeHtml } from "./display/drawing.mjs";
export { escapeHtml } from "./display/drawing.mjs";
export function refreshSeconds(now, hasWeather) {
  const untilRefresh = Math.max(1, Math.ceil((nextRefresh(now) - now) / 1000));
  return hasWeather ? untilRefresh : Math.min(60, untilRefresh);
}
export function displayPage(signedIn, error, ready, nonce, initial = null) {
  const refresh = signedIn
    ? `<meta id="refresh-fallback" http-equiv="refresh" content="${refreshSeconds(initial?.serverTime ?? Date.now(), !!initial?.weather)};url=/display">`
    : "";
  const content =
    signedIn && initial
      ? `<main class="display" data-layout="svg-1">${renderScene(initial)}</main>`
      : `<main class="login"><form method="post" action="/api/display/login"><div class="eyebrow">Mike Heaton · Private display</div><h1>Welcome home.</h1><p>A little art. A look outside.</p>${error ? '<p role="alert">That password wasn’t right. Please try again.</p>' : ""}${ready ? '<label for="password">Display password</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="256"><button type="submit">Open display</button><p>Your browser will stay signed in for six months.</p>' : "<p>The display is being set up. Please check back shortly.</p>"}</form></main>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">${refresh}<title>At home · Mike Heaton</title><style nonce="${escapeHtml(nonce)}">
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:#f5f1e7;color:#16251c}body{font-family:Georgia,'Times New Roman',serif}.display{position:absolute;top:0;right:0;bottom:0;left:0}.display>svg{display:block;width:100%;height:100%}.login{padding:60px 24px;margin:0 auto;max-width:420px}.login h1{font-size:48px;font-weight:normal}.login p{line-height:1.6;color:#4b554b}.eyebrow{font:12px Arial,sans-serif;letter-spacing:.16em;text-transform:uppercase}.login label{display:block;margin:28px 0 10px}.login input,.login button{display:block;width:100%;padding:16px;font:18px Arial,sans-serif}.login input{border:1px solid #b2b6a6;background:#fff}.login button{border:0;margin-top:16px;background:#243d2e;color:#fff;cursor:pointer}
</style></head><body>${content}</body></html>`;
}
