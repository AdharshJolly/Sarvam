"""Guards for repo rules in CLAUDE.md: Bun only, no forbidden infrastructure, no secrets."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SKIP = {".git", "node_modules", ".venv", "graphify-out", "dist", "__pycache__", ".ruff_cache"}


def _files(name_glob: str):
    return [p for p in ROOT.rglob(name_glob) if not (set(p.relative_to(ROOT).parts) & SKIP)]


def test_no_non_bun_lockfiles():
    for name in ("package-lock.json", "yarn.lock", "pnpm-lock.yaml"):
        assert not _files(name), f"{name} must not exist; use Bun"


def test_bun_lockfile_present():
    assert (ROOT / "bun.lock").exists()


def test_no_env_file_tracked_in_tree_examples_only():
    assert (ROOT / ".env.example").exists()


def test_forbidden_python_dependencies_absent():
    text = (ROOT / "pyproject.toml").read_text(encoding="utf-8").lower()
    for banned in (
        "sqlalchemy", "celery", "redis", "langchain", "langgraph", "crewai", "autogen",
        "psycopg", "qdrant", "neo4j", "kafka",
    ):  # fmt: skip
        assert banned not in text, f"{banned} is not permitted by the SSOT"
