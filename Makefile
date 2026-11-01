# Sarvam task runner. Frontend commands use Bun only; backend commands use uv.
# Only targets that actually work are listed.

.PHONY: help dev backend frontend install lint typecheck test test-backend test-frontend \
        build contracts contracts-check check graph fixtures gates docker

help:
	@echo "Targets: install dev demo backend frontend lint typecheck test build contracts contracts-check check graph fixtures gates docker"

install:
	uv sync
	bun install

demo: install
	@python -c "import os, shutil; shutil.copy('.env.example', '.env') if not os.path.exists('.env') else None"
	$(MAKE) dev

# Run backend and frontend together (two parallel jobs).
dev:
	$(MAKE) -j2 backend frontend

backend:
	uv run uvicorn backend.app:app --reload --host 127.0.0.1 --port 8000

frontend:
	bun run --cwd frontend dev

lint:
	uv run ruff check .
	uv run ruff format --check .

typecheck:
	bun run typecheck

test-backend:
	uv run pytest

test-frontend:
	bun run test

test: test-backend test-frontend

# Fixture corpus suite: origins, conflicts, coverage and verifier on the 14 documents.
fixtures:
	uv run pytest tests/fixtures

# Offline gate suites (G0 needs provider keys for its live cases; G1-G3 are deterministic).
gates:
	uv run pytest tests/gates/g1/test_g1.py tests/gates/g2 tests/gates/g3 tests/gates/g4

build:
	bun run build

# Regenerate contracts/generated/{schema.json,types.ts} from the Pydantic models.
contracts:
	uv run python -m contracts.schema_export
	bun run gen:types

# Fail if committed generated contracts are stale.
contracts-check:
	uv run python -m contracts.schema_export --check

# Canonical local quality gate.
check: lint contracts-check typecheck test build

# Build and start the single-container deployment (API + UI on port 8000, data in a volume).
docker:
	docker compose up --build -d

# Create or promote the preset admin account (prints a random password once).
seed-admin:
	uv run python -m backend.admin.seed

# Refresh the Graphify code graph (AST only, no LLM). Output: graphify-out/ (git-ignored).
graph:
	graphify update .
