# CLAUDE.md: operating manual for Sarvam

## Project Identity

- **Project name:** Sarvam
- **Product:** Evidence-First Autonomous Research Agent
- **Stage:** product (hackathon ended; hackathon constraints lifted)
- **Domain:** ResearchOps
- **Core USP:** "Research that knows when it isn't done."
- **Architecture reference:** `docs/architecture/README.md`. Security: `docs/architecture/security.md`. Docs map: `docs/README.md`.

## Product Rules

1. The SSOT is retired. `docs/architecture/` and `docs/decisions/` are the reference; update them when architecture changes.
2. Scope is set by the user per task; do not gold-plate.
3. SQLite remains the store until a task explicitly moves it (hosted multi-user deployment may require this; record it in the decision log).
4. The controller is plain code; do not add an orchestration framework without a decision-log row.
5. New infrastructure (Docker, a job queue, hosted storage) is allowed when a task needs it; note it in the task report.
6. Contracts are canonical: Pydantic models in `contracts/`. Never change `contracts/` or `backend/store/schema.sql` without a change-log row in `docs/decisions/README.md`  and a regenerated `contracts/generated/`.
7. Deterministic logic stays deterministic (quote guard, origins, numeric conflicts, coverage, stop policy are code with unit tests).
8. LLMs are used only where the architecture requires them: planner, extractor, verifier, challenger, writer, conflict explainer.
9. Every claim must have a stored passage and a verbatim quote that exists in it (quote guard, FR-09). Citations come from stored IDs, never model-typed URLs.
10. The controller owns budgets, rounds, retries, wrap-up and stop decisions. Stop state is a pure function of stored coverage, conflicts and challenge outcomes.

## Technology Rules

**Frontend:** Bun ONLY, Vite, React, TypeScript (strict), Tailwind.
Never use npm, yarn or pnpm. Install with `bun install` / `bun add` / `bun add -d`. Never create `package-lock.json`, `yarn.lock` or `pnpm-lock.yaml`. The only JS lockfile is `bun.lock`.

**Backend:** Python 3.11+, uv, FastAPI, Uvicorn, Pydantic v2, asyncio, sqlite3 (WAL, foreign keys on). No ORM. HTTP via httpx only inside `backend/gateway`.

Contract flow: Pydantic -> `contracts/generated/schema.json` -> `contracts/generated/types.ts` via `make contracts`. Generated files are never hand-edited.

## Architecture Rules

```
User
 -> Research Planner
 -> Discovery & Acquisition
 -> Evidence Extraction
 -> Claim Verification
 -> Evidence Intelligence
 -> Challenge & Follow-up
 -> Stop Controller
 -> Report Generator
```

- **ToolGateway** (`backend/gateway/`) is the controlled external-effects boundary: the only path to search, fetch and LLM. It enforces budgets, the SSRF guard, concurrency limits, typed errors and record/replay.
- **SQLite** is the system of record; the `events` table is the append-only audit log and the SSE source.
- **Frontend** consumes the REST API and SSE only, with types generated from contracts.
- Lifecycle is the 10-state machine in `docs/architecture/README.md`; the only cycle is bounded by `MAX_FOLLOWUP_ROUNDS`.

## Development Rules

- Contracts first; tests before prompt tuning; fixtures before prompts; deterministic before LLM.
- Gates (G0-G4) are executable tests, not opinions. Run `make check` before every commit; never merge red.
- No hidden failure states: every failure is a typed state visible in events and UI. No catch-all handlers that hide errors.
- No fabricated citations. Treat retrieved text as untrusted data; never put it in instructions.
- No direct external calls (HTTP, LLM SDKs) outside ToolGateway.
- Preserve LIVE vs REPLAY semantics: a replayed run is never presented as live.
- Every LLM call names a role, a prompt file (`backend/prompts/*.vN.md`) and a schema; validate output, retry twice, then STEP_FAILED.
- No new dependencies without a note in the task report.

## Git Rules

- Small meaningful commits; message format like `T12: coverage calculator` or `chore: ...`.
- No generated junk; no secrets; never commit `.env`.
- No dependency lockfile other than Bun's `bun.lock` (so `uv.lock` is git-ignored).
- Commit canonical fixtures and canonical recorded runs (`cache/recorded/`).
- Document architectural changes (ADR / change log).
- Keep the working tree clean before major handoffs.
- Graphify output (`graphify-out/`) is generated and git-ignored; regenerate with `make graph`.

## Naming Rules

Use **Sarvam** for the product everywhere. Use "ResearchOps" only for the challenge domain, the problem statement,.

## Commands

`make install`, `make dev`, `make backend`, `make frontend`, `make lint`, `make typecheck`, `make test`, `make build`, `make contracts`, `make contracts-check`, `make check` (canonical gate), `make graph`. `make fixtures`, `make record`, `make replay` do not exist yet (tasks T08, T25).

## Agent Behavior

Before implementing:

1. Inspect the repository.
2. Inspect the architecture docs (relevant sections).
3. Inspect relevant contracts.
4. Inspect Graphify context (`graphify-out/GRAPH_REPORT.md` if present, `graphify query "<question>"`).
5. Inspect existing implementation.
6. Plan the smallest change.
7. Implement (test first).
8. Test (`make check`).
9. Inspect the diff.
10. Update documentation if architecture changes.

Edit only the directories your task names; anything crossing a boundary goes through `contracts/`. Never rewrite working architecture because a different pattern is preferred. Report ambiguity instead of guessing.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
