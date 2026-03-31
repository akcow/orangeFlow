# Production Deployment

This repository is now branded and deployed externally as **OrangeFlow**.
It still keeps `LANGFLOW_*` environment variables and the `langflow` CLI entrypoint internally for compatibility with the upstream runtime.

If you want a practical step-by-step server checklist, see `docker/ORANGEFLOW_SERVER_CHECKLIST.md`.

This repository is now wired for a PostgreSQL-first deployment.
For a small private beta and later commercialization, the recommended stack is:

- `OrangeFlow app`
- `PostgreSQL`
- `MinIO` (or AWS S3 later)

This avoids the old SQLite failure mode where history, generated assets, and multi-user data become fragile after restart.

## 1. Recommended topology

- Use `docker/production.docker-compose.yml`
- Keep PostgreSQL on a persistent volume
- Keep generated media in MinIO/S3, not inside the app container filesystem
- Set `LANGFLOW_PUBLIC_BASE_URL` to the public OrangeFlow URL so signed proxy preview links work
- Keep `LANGFLOW_AUTO_LOGIN=false` for beta/commercial use
- Keep `LANGFLOW_SKIP_AUTH_AUTO_LOGIN=false`
- Keep PostgreSQL and MinIO internal to Docker unless you explicitly need host access

## 2. First deployment

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

Then start the stack:

```bash
docker compose -f production.docker-compose.yml up -d --build
```

The production image now builds the frontend inside Docker, so a fresh server does not need a prebuilt `src/frontend/build`.
The production template also binds OrangeFlow to `0.0.0.0:7860` by default so direct beta access works immediately.

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

Important: the configured `SUPERUSER_PASSWORD` is used when the superuser is first created. Changing it later in `.env`
does not reset the password already stored in PostgreSQL.

## 3. Why this is the default now

`start_service.py` was changed to reject SQLite defaults and prefer PostgreSQL.
The production compose file matches that direction:

- database: PostgreSQL only
- media storage: MinIO by default
- preview/history URLs: signed OrangeFlow proxy URLs by default

This means:

- generated history survives restart
- workspace preview can still load after restart
- image/video assets are not tied to one app container
- the stack can scale to S3 later with the same config model

The production image now also installs `ffmpeg`, so server-side video trim/edit flows do not fail after deployment.

## 4. MinIO vs S3

Use MinIO now if you want:

- low-cost private beta
- single server deployment
- S3-compatible API without cloud lock-in

Move to AWS S3 later if you want:

- managed durability
- CDN integration
- easier multi-instance deployment

To switch later, keep `LANGFLOW_STORAGE_TYPE=s3` and replace the S3 env values with your cloud bucket settings.

## 5. Important preview/history notes

This repo now supports:

- nested object keys like `images/output.png`
- signed proxy preview URLs through OrangeFlow
- `draft_output` fallback for the latest generated result
- user-scoped generation history records

Those changes directly address the old cases where:

- generated work was missing from `generation history`
- flow workspace preview did not show the newest generated image
- restart caused media references to break

## 6. Reverse proxy

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

## 7. Backup

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

## 8. Upgrade checklist

Before exposing to more users:

1. Set a real domain and `LANGFLOW_PUBLIC_BASE_URL`
2. Enable HTTPS
3. Change all default passwords
4. Set `LANGFLOW_CORS_ORIGINS` to your real public origin
5. Keep `LANGFLOW_SKIP_AUTH_AUTO_LOGIN=false`
6. Keep PostgreSQL and MinIO ports closed unless you explicitly need host access
7. Put PostgreSQL and MinIO volumes on reliable disks
8. Add regular DB and object-storage backups
