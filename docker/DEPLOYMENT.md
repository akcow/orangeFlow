# Production Deployment

This repository is now branded and deployed externally as **OrangeFlow**.
It still keeps `LANGFLOW_*` environment variables and the `langflow` CLI entrypoint internally for compatibility with the upstream runtime.

If you want a practical step-by-step server checklist, see `docker/ORANGEFLOW_SERVER_CHECKLIST.md`.
If you want to deploy from a GitHub checkout and manage updates from GitHub, see `docker/GITHUB_DEPLOYMENT_AND_UPDATES.md`.

This repository is now wired for a PostgreSQL-first deployment.
There are now three supported production paths:

- `full`: `docker/production.docker-compose.yml`
- `full-prebuilt`: `docker/production-prebuilt.docker-compose.yml`
- `image`: `docker/production-image.docker-compose.yml`
- `lite`: `docker/production-lite.docker-compose.yml`

Use `full` when the server can build the frontend inside Docker and can reliably pull MinIO images.
Use `full-prebuilt` when you still want PostgreSQL + MinIO for public multi-user deployment, but you don't want the server to run the frontend build.
Use `image` when GitHub Actions publishes the production image and the server should only pull and run it.
Use `lite` only when you explicitly accept local persistent storage for a single-node beta.

For a small private beta and later commercialization, the default recommended stack is:

- `OrangeFlow app`
- `PostgreSQL`
- `MinIO` (or AWS S3 later)

This avoids the old SQLite failure mode where history, generated assets, and multi-user data become fragile after restart.

## 1. Recommended topology

- Default: use `docker/production.docker-compose.yml`
- Best fallback for public multi-user servers: use `docker/production-prebuilt.docker-compose.yml`
- Best long-term GitHub-driven production flow: use `docker/production-image.docker-compose.yml`
- Low-resource fallback: use `docker/production-lite.docker-compose.yml`
- Keep PostgreSQL on a persistent volume
- `full`: keep generated media in MinIO/S3, not inside the app container filesystem
- `full-prebuilt`: keep generated media in MinIO/S3, not inside the app container filesystem
- `lite`: keep generated media in the persistent app config volume with `LANGFLOW_STORAGE_TYPE=local`
- Set `LANGFLOW_PUBLIC_BASE_URL` to the public OrangeFlow URL so signed proxy preview links work
- Keep `LANGFLOW_AUTO_LOGIN=false` for beta/commercial use
- Keep `LANGFLOW_SKIP_AUTH_AUTO_LOGIN=false`
- Keep PostgreSQL and MinIO internal to Docker unless you explicitly need host access

## 2. Choose the right mode first

Pick `full` if:

- the server has enough memory to run the Docker frontend build
- Docker Hub access is stable enough to pull MinIO images
- you want the default object-storage topology now

Pick `full-prebuilt` if:

- you want the same PostgreSQL + MinIO production topology
- the server previously failed during `npm ci`, `npm run build`, or Docker frontend build
- you can build `src/frontend/build/` on your workstation or in CI first

Pick `image` if:

- you want the server to deploy from a GitHub checkout without building the app image locally
- GitHub Actions can publish your production image to GHCR
- you want the cleanest rollback story using image tags

Pick `lite` if:

- MinIO is not required for this deployment
- this is a single-node deployment and local storage is acceptable for now

The recurring deployment failures in `DEPLOYMENT_ISSUES.md` came mainly from forcing in-server frontend builds onto a server that should have used `full-prebuilt`.
For long-term multi-user production, `image` is usually cleaner than source builds on the server.

## 3. First deployment

From the repo root:

```bash
cd docker
cp .env.example .env
```

If you want a more opinionated server template, start from:

```bash
cp .env.production.example .env
```

Edit `docker/.env` and change at least:

```bash
POSTGRES_PASSWORD=change-this-postgres-password
SUPERUSER_PASSWORD=change-this-admin-password
MINIO_ROOT_PASSWORD=change-this-minio-password
SECRET_KEY=replace-with-a-random-secret
```

Pick one of these browser access modes:

Direct HTTP beta on the server port:

```bash
LANGFLOW_BIND_ADDRESS=0.0.0.0
LANGFLOW_PUBLIC_BASE_URL=http://your-server-ip-or-domain:7860
LANGFLOW_CORS_ORIGINS=http://your-server-ip-or-domain:7860
LANGFLOW_ACCESS_SECURE=false
LANGFLOW_REFRESH_SECURE=false
```

HTTPS behind Nginx or Caddy:

```bash
LANGFLOW_BIND_ADDRESS=127.0.0.1
LANGFLOW_PUBLIC_BASE_URL=https://your-app-domain.example.com
LANGFLOW_CORS_ORIGINS=https://your-app-domain.example.com
LANGFLOW_ACCESS_SECURE=true
LANGFLOW_REFRESH_SECURE=true
```

Then start the full stack:

```bash
docker compose -f production.docker-compose.yml up -d --build
```

The production image now builds the frontend inside Docker, so a fresh server does not need a prebuilt `src/frontend/build`.
The production template also binds OrangeFlow to `0.0.0.0:7860` by default so direct beta access works immediately.

If you need the prebuilt frontend path while keeping MinIO:

1. Build the frontend on your workstation or in CI so `src/frontend/build/` exists.
2. Copy `docker/.env.production.example` to `docker/.env`.
3. Start the prebuilt full stack:

```bash
docker compose -f production-prebuilt.docker-compose.yml up -d --build
```

The prebuilt image uses `docker/production-prebuilt.Dockerfile`, skips the in-container Node build, and keeps the PostgreSQL + MinIO production topology.

If you explicitly need the lite path instead:

1. Build the frontend on your workstation or in CI so `src/frontend/build/` exists.
2. Copy `docker/.env.lite.example` to `docker/.env`.
3. Start the lite stack:

```bash
docker compose -f production-lite.docker-compose.yml up -d --build
```

The lite image uses `docker/production-prebuilt.Dockerfile`, skips the in-container Node build, and removes the MinIO dependency.

If you want GitHub to publish the app image and the server to only pull it:

1. Configure `ORANGEFLOW_IMAGE` in `docker/.env`.
2. Publish the image from GitHub Actions.
3. Start the image-based stack:

```bash
docker compose -f production-image.docker-compose.yml pull
docker compose -f production-image.docker-compose.yml up -d
```

If you want the bundled HTTPS Nginx sidecar, enable the profile and provide certificates first:

```bash
mkdir -p ssl
# place your TLS files at:
#   ssl/cert.pem
#   ssl/key.pem
echo "COMPOSE_PROFILES=https-proxy" >> .env
```

When you deploy a reverse proxy, switch the app bind address back to `127.0.0.1`.

Check health:

```bash
docker compose -f production.docker-compose.yml ps
docker compose -f production.docker-compose.yml logs -f orangeflow
curl http://127.0.0.1:7860/health_check
```

Login check after startup:

1. Open the public URL from a browser session that is not already logged in.
2. Create a normal user from the sign-up page.
3. Sign in with that new user and confirm the home page, file upload, and generation history all work.
4. Sign out and sign back in with `SUPERUSER_USERNAME` and `SUPERUSER_PASSWORD`.
5. Confirm the admin account can open `/admin`.
6. Confirm `/admin/provider-relays` shows the 11 built-in system relays.

Important: the configured `SUPERUSER_PASSWORD` is used when the superuser is first created. Changing it later in `.env`
does not reset the password already stored in PostgreSQL.

If `/admin/provider-relays` shows an empty list after Docker deployment, treat that as an authentication/session problem first, not as missing built-in relay data:

- `/api/v1/provider-relays` is a superuser-only backend route
- the built-in relay entries are generated in backend code and appended for admins on every request
- a normal user session, stale superuser password, or broken public cookie/proxy setup can make the page appear empty if the frontend cannot complete the authenticated admin request

## 4. Why these modes exist now

`start_service.py` was changed to reject SQLite defaults and prefer PostgreSQL.
The production compose files match that direction:

- database: PostgreSQL only
- `full` media storage: MinIO by default
- `full-prebuilt` media storage: MinIO by default
- `image` media storage: MinIO by default
- `lite` media storage: local persistent volume
- preview/history URLs: signed OrangeFlow proxy URLs by default when object storage is enabled

This means:

- generated history survives restart
- workspace preview can still load after restart
- image/video assets are not tied to one app container
- the full and full-prebuilt stacks can scale to S3 later with the same config model
- the image stack has the cleanest CI/CD and rollback path
- the lite stack gives a supported escape hatch for weak-network or low-memory servers

The production image now also installs `ffmpeg`, so server-side video trim/edit flows do not fail after deployment.

## 5. MinIO vs S3

Use MinIO now if you want:

- low-cost private beta
- single server deployment
- S3-compatible API without cloud lock-in

Move to AWS S3 later if you want:

- managed durability
- CDN integration
- easier multi-instance deployment

To switch later from the full stack, keep `LANGFLOW_STORAGE_TYPE=s3` and replace the S3 env values with your cloud bucket settings.

## 6. Important preview/history notes

This repo now supports:

- nested object keys like `images/output.png`
- signed proxy preview URLs through OrangeFlow
- `draft_output` fallback for the latest generated result
- user-scoped generation history records

Those changes directly address the old cases where:

- generated work was missing from `generation history`
- flow workspace preview did not show the newest generated image
- restart caused media references to break

## 7. Reverse proxy

For real users, put Nginx or Caddy in front of OrangeFlow and terminate HTTPS there.
Minimum routing:

- `https://app.example.com` -> OrangeFlow `:7860`

Ready-to-use examples are included:

- `docker/nginx.orangeflow.conf.example`
- `docker/Caddyfile.example`

If you use the bundled Docker Nginx profile, it exposes:

- `http://server:80` -> redirects to HTTPS
- `https://server:443` -> OrangeFlow

If you later expose MinIO directly through a CDN/domain, set:

```bash
MINIO_PUBLIC_BASE_URL=https://assets.example.com/orangeflow-assets
```

If you do not set `MINIO_PUBLIC_BASE_URL`, OrangeFlow will generate signed proxy URLs through `LANGFLOW_PUBLIC_BASE_URL`.
That is the safer default for a private beta.

Do not leave `LANGFLOW_ACCESS_SECURE=true` unless the public browser URL is really HTTPS.
Otherwise browsers can reject the login cookies and users will appear to log in successfully but lose their session.

## 8. Backup

PostgreSQL:

```bash
docker compose -f production.docker-compose.yml exec postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backup.sql
```

Restore:

```bash
cat backup.sql | docker compose -f production.docker-compose.yml exec -T postgres \
  psql -U "$POSTGRES_USER" "$POSTGRES_DB"
```

MinIO:

- snapshot the `orangeflow-minio-data` volume
- or replicate objects to S3 on a schedule

Lite mode:

- back up the `orangeflow-config-data` volume because local-generated media is stored there

## 9. Deployment Script

`docker/deploy.sh` now supports all modes:

```bash
# Full stack: PostgreSQL + MinIO + OrangeFlow
ORANGEFLOW_DEPLOY_MODE=full ./deploy.sh

# Full-prebuilt stack: PostgreSQL + MinIO + prebuilt frontend assets
ORANGEFLOW_DEPLOY_MODE=full-prebuilt ./deploy.sh

# Image stack: GitHub-published production image + PostgreSQL + MinIO
# Use docker/update-from-git.sh for this mode.

# Lite stack: PostgreSQL + local storage + prebuilt frontend
ORANGEFLOW_DEPLOY_MODE=lite ./deploy.sh
```

When using `full-prebuilt` or `lite`, make sure `src/frontend/build/` has already been created before you run the script.

## 10. Upgrade checklist

Before exposing to more users:

1. Set a real domain and `LANGFLOW_PUBLIC_BASE_URL`
2. Enable HTTPS
3. Change all default passwords
4. Set `LANGFLOW_CORS_ORIGINS` to your real public origin
5. Keep `LANGFLOW_SKIP_AUTH_AUTO_LOGIN=false`
6. Keep PostgreSQL and MinIO ports closed unless you explicitly need host access
7. Put PostgreSQL and MinIO volumes on reliable disks
8. Add regular DB and object-storage backups
