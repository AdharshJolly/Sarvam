# Sarvam: one image, one process. The backend serves the built frontend (same origin).

# ---- 1. Frontend build (Bun) ----
FROM oven/bun:1.3.1 AS web
WORKDIR /app
COPY package.json bun.lock ./
COPY frontend/package.json frontend/package.json
RUN bun install --frozen-lockfile --no-progress
COPY frontend frontend
COPY contracts/generated contracts/generated
# Empty base URL = same-origin API calls.
ENV VITE_API_BASE_URL=""
RUN bun run build

# ---- 2. Runtime (Python + uv) ----
FROM python:3.12-slim AS runtime
COPY --from=ghcr.io/astral-sh/uv:0.5 /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PYTHONUNBUFFERED=1
COPY pyproject.toml README.md ./
COPY uv.lock* ./
RUN uv sync --no-dev --no-install-project
COPY backend backend
COPY contracts contracts
COPY cache cache
COPY --from=web /app/frontend/dist frontend/dist

ENV PATH="/app/.venv/bin:$PATH" \
    SARVAM_ENV=production \
    SARVAM_API_HOST=0.0.0.0 \
    SARVAM_API_PORT=8000 \
    SARVAM_DB_PATH=/data/sarvam.db \
    SARVAM_ARTIFACT_DIR=/data/artifacts
VOLUME /data
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD python -c "import urllib.request as u; u.urlopen('http://127.0.0.1:8000/api/health', timeout=2)"
CMD ["uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8000"]
