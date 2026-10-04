# pbiplint brand

The pbiplint logo, mark, profile picture, and banners. The name pbiplint and its logo are trademarks
of McKinley Consulting, and the code license does not cover them (see [License](../README.md#license)).

## Files

| File | What it is |
|---|---|
| `pbiplint-logo-square.svg` | The logo: a blue chevron, a teal check mark, a blue divider, and the wordmark inside a teal ring, on an 800 × 800 square. |
| `pbiplint-logo-square.png` | The logo at 800 × 800. |
| `pbiplint-mark-only.svg` | The chevron and check mark in the ring, drawn larger and with no divider or wordmark, so it reads at small sizes. |
| `pbiplint-mark-only.png` | The mark at 800 × 800. |
| `pbiplint-mark-only-64.png` | The mark at 64 × 64. |
| `pbiplint-avatar.png` | The profile picture at 1024 × 1024, used as the pbiplint GitHub organization's avatar. |
| `pbiplint-avatar-512.png` | The profile picture at 512 × 512. |
| `pbiplint-avatar-128.png` | The profile picture at 128 × 128. |
| `banner/pbiplint-banner-1280x640-github-social` | Banner sized for a GitHub repository's social preview (`.svg` and `.png`). |
| `banner/pbiplint-banner-1500x500-x-header` | Banner sized for an X header (`.svg` and `.png`). |
| `banner/pbiplint-banner-2560x1440-youtube-master` | Banner sized for a YouTube channel (`.svg` and `.png`). |

The site's favicon, `packages/web/public/favicon.svg`, is a copy of `pbiplint-mark-only.svg`. Change
both together.

The profile picture is a raster drawing of the logo's design and has no SVG. Where a vector is
needed, use `pbiplint-logo-square.svg`.

## Colors

| Role | Hex |
|---|---|
| Canvas (every background) | `#0A0E1A` |
| Blue (chevron, divider) | `#2D7DD2` |
| Teal (check mark, ring, wordmark) | `#00A9A5` |
| Text (banner title) | `#E6EDF6` |
| Secondary text (banner subtitle) | `#A9B4C7` |

The site uses the same values as custom properties at the top of `packages/web/src/styles.css`.

The faint constellation of lines and dots behind the banners belongs to the banners only.

## Type

The logo's wordmark and the banner text are set in Helvetica Neue, and the profile picture's
wordmark in Inter. The SVGs keep their text as text, so a system without Helvetica Neue draws it in
Helvetica or Arial instead. Use the PNGs where the exact look matters.
