# syntax=docker/dockerfile:1

# Multi-stage production build:
# - frontend-builder: builds the React/Vite frontend to static files
# - runtime: installs Python deps (via uv.lock) + copies custom code

FROM node:20-bookworm-slim AS frontend-builder
WORKDIR /frontend

ENV NODE_OPTIONS=--max-old-space-size=8192

COPY src/frontend/package.json src/frontend/package-lock.json ./
RUN npm ci

COPY src/frontend/ ./
RUN npm run build

FROM python:3.12-slim AS runtime

LABEL description="Custom Langflow (includes lfx custom components)"

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    LANGFLOW_CONFIG_DIR=/app/langflow_config \
    LANGFLOW_LOG_LEVEL=INFO

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    ffmpeg \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN pip install --no-cache-dir uv

# Copy workspace metadata and sources (uv workspace install needs local sources).
COPY pyproject.toml uv.lock README.md ./
COPY src/backend/base/pyproject.toml src/backend/base/README.md ./src/backend/base/
COPY src/lfx/pyproject.toml src/lfx/README.md ./src/lfx/
COPY src/backend ./src/backend
COPY src/lfx ./src/lfx

# Replace backend-bundled frontend assets with freshly built ones.
RUN rm -rf ./src/backend/base/langflow/frontend/*
COPY --from=frontend-builder /frontend/build/ ./src/backend/base/langflow/frontend/

# Install Python deps (and workspace packages) deterministically from uv.lock.
RUN uv sync --frozen --no-dev --extra postgresql

ENV PATH="/app/.venv/bin:$PATH"

RUN mkdir -p /app/langflow_config /app/data

EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -fsS http://localhost:7860/health_check || exit 1

CMD ["langflow", "run", \
     "--host", "0.0.0.0", \
     "--port", "7860", \
     "--log-level", "info", \
     "--frontend-path", "/app/src/backend/base/langflow/frontend"]
