# Third-Party Notices

## Twemoji graphics

The full-color habit artwork in `lib/display/twemoji.mjs` is derived from six SVG graphics in [jdecked/twemoji](https://github.com/jdecked/twemoji):

- Release: `v17.0.3`
- Commit: [`b6b55fef1e8636b540a6d016a4729ca8cdf2e60b`](https://github.com/jdecked/twemoji/tree/b6b55fef1e8636b540a6d016a4729ca8cdf2e60b)
- Assets: `1f415.svg` (dog), `1faa5.svg` (toothbrush), `1f6cf.svg` (bed), `1f4aa.svg` (flexed biceps), `1f964.svg` (cup with straw), and `1f3c3.svg` (person running)
- Changes: the outer `<svg>` wrappers were removed and the original shape markup was stored as JavaScript string constants so the server can place it directly inside the dashboard SVG. The artwork path/shape data and colors are unchanged.

Copyright Twitter, Inc. and other contributors.

The Twemoji graphics are licensed under the [Creative Commons Attribution 4.0 International license (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/). The upstream graphics license text is available in [`LICENSE-GRAPHICS`](https://github.com/jdecked/twemoji/blob/b6b55fef1e8636b540a6d016a4729ca8cdf2e60b/LICENSE-GRAPHICS).
