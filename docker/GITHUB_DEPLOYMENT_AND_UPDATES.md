# GitHub Deployment And Updates

This document covers two production patterns:

- pull source code from GitHub onto the server and deploy from source
- publish OrangeFlow images from GitHub Actions and update the server by pulling images

For public multi-user deployments, the recommended path is:

- PostgreSQL in Docker
- MinIO in Docker
- OrangeFlow image published by GitHub Actions to GHCR
- server updates driven by `git pull` + `docker compose pull`

## 1. Important constraint first

`src/frontend/build/` is ignored by Git.

That means:

- plain `git clone` / `git pull` on the server does **not** include prebuilt frontend assets
- `full-prebuilt` only works if `src/frontend/build/` was created before deployment
- if the server is weak and cannot build the frontend reliably, you should not rely on source-only builds on the server

## 2. Option A: Pull source from GitHub and deploy on the server

Use this when:

- the server has enough memory to build the frontend inside Docker
- or you can build `src/frontend/build/` on the server safely

Initial deployment:

```bash
git clone <your-github-repo-url> /opt/orangeflow
cd /opt/orangeflow/docker
cp .env.production.example .env
# edit .env
ORANGEFLOW_DEPLOY_MODE=full-prebuilt ./deploy.sh
```

If the server is strong enough to build everything itself:

```bash
ORANGEFLOW_DEPLOY_MODE=full ./deploy.sh
```

If the server cannot build the frontend, but you still want to deploy from source:

1. Build `src/frontend/build/` locally or in CI.
2. Make sure those files are present on the server working tree before running `full-prebuilt`.

## 3. Option B: GitHub builds the app image, server only pulls and runs it

This is the recommended public multi-user production flow.

Benefits:

- no frontend build pressure on the server
- smaller update window
- predictable runtime image
- easier rollback by image tag

Files added for this flow:

- `docker/production-image.docker-compose.yml`
- `.github/workflows/publish-orangeflow-image.yml`
- `docker/update-from-git.sh`

### 3.1 Publish the image from GitHub

The workflow publishes a production image to GHCR with tags such as:

- `main`
- `sha-<commit>`

Suggested image name:

```env
ORANGEFLOW_IMAGE=ghcr.io/<github-owner>/<repo-name>-orangeflow:main
```

### 3.2 Initial server deployment from a GitHub checkout

```bash
git clone <your-github-repo-url> /opt/orangeflow
cd /opt/orangeflow/docker
cp .env.production.example .env
```

Set at least:

```env
ORANGEFLOW_IMAGE=ghcr.io/<github-owner>/<repo-name>-orangeflow:main
POSTGRES_PASSWORD=...
MINIO_ROOT_PASSWORD=...
SUPERUSER_PASSWORD=...
SECRET_KEY=...
LANGFLOW_PUBLIC_BASE_URL=https://your-domain
LANGFLOW_CORS_ORIGINS=https://your-domain
LANGFLOW_ACCESS_SECURE=true
LANGFLOW_REFRESH_SECURE=true
```

Then deploy:

```bash
docker compose --env-file .env -f production-image.docker-compose.yml pull
docker compose --env-file .env -f production-image.docker-compose.yml up -d
```

## 4. Updating after you push a new version

### 4.1 Recommended fast update flow

1. Push code to GitHub.
2. Wait for the GitHub Actions image publish workflow to finish.
3. On the server:

```bash
cd /opt/orangeflow/docker
ORANGEFLOW_DEPLOY_MODE=image ./update-from-git.sh
```

What this does:

- `git fetch` + `git pull --ff-only`
- `docker compose pull orangeflow`
- `docker compose up -d`

This is usually a short restart, not true zero-downtime hot update.

### 4.2 Roll back if the new version is bad

Change `ORANGEFLOW_IMAGE` in `docker/.env` from `main` to a known-good `sha-...` tag, then run:

```bash
docker compose --env-file .env -f production-image.docker-compose.yml pull orangeflow
docker compose --env-file .env -f production-image.docker-compose.yml up -d
```

## 5. What “hot update” means here

On a single Docker Compose stack with one OrangeFlow app container:

- `docker compose up -d` is a fast replace
- there is usually a short interruption while the old app container stops and the new one becomes healthy

So this is:

- acceptable for many products
- easy to operate
- but not true zero-downtime hot update

## 6. If you really want near-zero-downtime updates

Use blue-green deployment.

Recommended structure:

- one stable infrastructure stack: PostgreSQL + MinIO
- one host reverse proxy: Nginx or Caddy
- two app stacks: `orangeflow-blue` and `orangeflow-green`

High-level process:

1. Keep `blue` serving traffic.
2. Deploy the new version to `green`.
3. Wait for `green` health check to pass.
4. Switch the reverse proxy upstream from `blue` to `green`.
5. Drain and stop `blue`.

Important caveat:

- near-zero-downtime only works safely if database migrations are backward-compatible across the old and new app versions during the overlap window

If your release contains risky schema changes:

- schedule a maintenance window
- or stop old app traffic before the new version runs migrations

## 7. Recommended production answer

For your use case, the most practical answer is:

1. Keep PostgreSQL + MinIO.
2. Use GitHub Actions to publish the OrangeFlow image.
3. Use `docker/production-image.docker-compose.yml` on the server.
4. Update with `docker/update-from-git.sh`.
5. When traffic becomes large enough that a few seconds of restart is unacceptable, move to blue-green.
