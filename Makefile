# Sarvam task runner. Frontend commands use Bun only; backend commands use uv.
# Only targets that actually work are listed. SSOT also names `record` and `replay`; they are
# added by task T25 when the commands behind them exist.

.PHONY: help dev backend frontend install lint typecheck test test-backend test-frontend \
        build contracts contracts-check check graph fixtures gates benchmark-llm

help:
	@echo "Targets: install dev demo backend frontend lint typecheck test build contracts contracts-check check graph fixtures gates"

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

# Fixture corpus suite (SSOT 16.2): origins, conflicts, coverage and verifier on the 14 documents.
fixtures:
	uv run pytest tests/fixtures

# Offline gate suites (G0 needs provider keys for its live cases; G1-G3 are deterministic).
gates:
	uv run pytest tests/gates/g1/test_g1.py tests/gates/g2 tests/gates/g3 tests/gates/g4

# Live LLM benchmark (needs provider keys): LABEL=baseline RUNS=3 make benchmark-llm. Env overrides
# (SARVAM_LLM_MAX_TOKENS, SARVAM_VERIFIER_BATCH_SIZE, ...) select the configuration under test.
benchmark-llm:
	uv run python -m scripts.benchmark_llm --label $(or $(LABEL),baseline) --runs $(or $(RUNS),3)

build:
	bun run build

# Regenerate contracts/generated/{schema.json,types.ts} from the Pydantic models.
contracts:
	uv run python -m contracts.schema_export
	bun run gen:types

# Fail if committed generated contracts are stale.
contracts-check:
	uv run python -m contracts.schema_export --check

# Canonical local quality gate (SSOT 13.1: never merge red).
check: lint contracts-check typecheck test build

# Create or promote the preset admin account (prints a random password once).
seed-admin:
	uv run python -m backend.admin.seed

# Refresh the Graphify code graph (AST only, no LLM). Output: graphify-out/ (git-ignored).
graph:
	graphify update .
