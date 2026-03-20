# Frontend Build Notes

This frontend uses `Vite`, not Create React App.

## Recommended runtime

- `Node.js 22` for CI and Docker builds
- `npm ci` for deterministic installs

## Common commands

- Install: `npm ci`
- Dev server: `npm start`
- Production build: `npm run build`
- Tests: `npm test`
- Lint: `npm run lint`
- Type check: `npm run type-check`

## Output

`npm run build` writes static assets to `src/frontend/build`.

For the local production Docker path, `docker/production.Dockerfile` expects that folder to exist before the image build starts.
For Render, `docker/render.Dockerfile` builds the frontend inside the image, so no prebuilt `src/frontend/build` directory is required in the repo.
