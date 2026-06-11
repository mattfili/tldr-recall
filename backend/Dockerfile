# Recall API — Railway service image (issue #28, spec §12.2).
# Build context = backend/ (the Railway service rootDirectory).
# Migrations run on every deploy before uvicorn starts (spec §12.2).

FROM python:3.12-slim

# uv from the official distroless image — same toolchain as local dev/CI.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy

# Dependency layer first for cache-friendly rebuilds.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY . .
RUN uv sync --frozen --no-dev

# alembic.ini + migrations ship with the source COPY above.
# PORT is injected by Railway; default keeps local `docker run` usable.
CMD ["sh", "-c", "uv run --no-sync alembic upgrade head && uv run --no-sync uvicorn recall.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
