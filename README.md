# EXIF Lens Frontend

Static Next.js frontend for the EXIF Lens metadata inspector.

## Live Deployment

- Frontend: https://aerovista-us.github.io/exif-lens-pages/
- GitHub repo: https://github.com/aerovista-us/exif-lens-pages
- Deep ExifTool API base: https://workspaces.aerocoreos.com/exif-api
- Backend health: https://workspaces.aerocoreos.com/exif-api/health

## Processing model

EXIF Lens is **local-first** for JPEG photos:

- JPEG EXIF inspection runs in the browser.
- JPEG privacy cleaning / metadata stripping runs in the browser.
- JPEG files do not need to cross the network for those operations.
- Video, PDF, audio, HEIC and other deep-format inspection still use the ExifTool API.

The deep API currently lives behind Cloudflare Access because it is mounted under the protected Workspaces hostname. A public GitHub Pages application cannot safely embed a Cloudflare service token, and an Access login redirect is not a usable `fetch()` response. Therefore the remaining infrastructure fix is a **narrow public EXIF API route or dedicated public hostname**, not a blanket bypass for `workspaces.aerocoreos.com`.

Any public deep-format route should preserve these controls:

- CORS restricted to `https://aerovista-us.github.io` (and any future canonical EXIF Lens hostname)
- request rate limiting
- upload/file-size limits
- MIME / file validation
- bounded processing time
- temporary-file cleanup
- no access to unrelated Workspaces routes

## Configuration

The deep API URL is compiled into the static bundle from the GitHub repository variable:

```text
NEXT_PUBLIC_API_BASE=https://workspaces.aerocoreos.com/exif-api
```

After changing that variable, rerun the `Deploy to GitHub Pages` workflow so the static JavaScript bundle is rebuilt.

## Local Development

```bash
npm install
NEXT_PUBLIC_API_BASE=http://localhost:8787 npm run dev
```

For local development, start the backend separately and make sure its `FRONTEND_ORIGIN` includes `http://localhost:3000`.

## Static Export

This repo is configured for GitHub Pages with:

- `output: "export"`
- `basePath: "/exif-lens-pages"`
- `assetPrefix: "/exif-lens-pages/"`
- `trailingSlash: true`

GitHub Actions builds the static site with `npm ci` and `npm run build`, then deploys `./out` to Pages.

## Deep API notes

The ExifTool fallback calls:

- `POST /api/inspect` for metadata inspection
- `POST /api/clean` for cleaned file downloads

The backend root path returns `404` by design. Use `/health`, `/api/inspect`, or `/api/clean`.
