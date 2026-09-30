# Sarvam task runner. Frontend commands use Bun only; backend commands use uv.
# Only targets that actually work are listed. SSOT also names `fixtures`, `record` and `replay`;
# they are added by tasks T08 / T25 when the commands behind them exist.

.PHONY: help dev backend frontend install lint typecheck test test-backend test-frontend \
        build contracts contracts-check check graph

help:
	@echo "Targets: install dev backend frontend lint typecheck test build contracts contracts-check check graph"

install:
	uv sync
	bun install

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

# Refresh the Graphify code graph (AST only, no LLM). Output: graphify-out/ (git-ignored).
graph:
	graphify update .
