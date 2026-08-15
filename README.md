# EXIF Lens Frontend

Static Next.js frontend for the EXIF Lens metadata inspector.

## Live Deployment

- Frontend: https://aerovista-us.github.io/exif-lens-pages/
- GitHub repo: https://github.com/aerovista-us/exif-lens-pages
- Backend API base: https://workspaces.aerocoreos.com/exif-api
- Backend health: https://workspaces.aerocoreos.com/exif-api/health

The backend root path returns `404` by design. Use `/health`, `/api/inspect`, or `/api/clean`.

## Configuration

The API URL is compiled into the static bundle from the GitHub repository variable:

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

## API Notes

The frontend calls:

- `POST /api/inspect` for metadata inspection
- `POST /api/clean` for cleaned file downloads

CORS on the backend currently allows `https://aerovista-us.github.io` for the deployed Pages frontend.
