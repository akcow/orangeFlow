# syntax=docker/dockerfile:1

FROM python:3.12-slim AS runtime

LABEL description="OrangeFlow production image using prebuilt frontend assets"

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    LANGFLOW_CONFIG_DIR=/app/orangeflow_config \
    LANGFLOW_LOG_LEVEL=INFO

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    ffmpeg \
    git \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY pyproject.toml uv.lock README.md ./
COPY src/backend/base/pyproject.toml src/backend/base/README.md ./src/backend/base/
COPY src/lfx/pyproject.toml src/lfx/README.md ./src/lfx/
COPY src/backend ./src/backend
COPY src/lfx ./src/lfx
COPY src/frontend/build/ ./src/backend/base/langflow/frontend/

RUN uv sync --frozen --no-dev --extra postgresql

# Fail the image build immediately if psycopg cannot load a working libpq wrapper.
RUN /app/.venv/bin/python -c "import psycopg; from psycopg import pq; print({'psycopg': psycopg.__version__, 'impl': pq.__impl__, 'libpq': pq.version()})"

ENV PATH="/app/.venv/bin:$PATH"

RUN mkdir -p /app/orangeflow_config /app/data

EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -fsS http://localhost:7860/health_check || exit 1

CMD ["langflow", "run", \
     "--host", "0.0.0.0", \
     "--port", "7860", \
     "--log-level", "info", \
     "--frontend-path", "/app/src/backend/base/langflow/frontend"]
