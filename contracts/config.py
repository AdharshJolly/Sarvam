"""Typed configuration: one object for all thresholds, limits and paths (SSOT section 9 preamble).

Values come from environment variables (see .env.example); secrets are read here only and must
never be logged, put in prompts or written to events (SSOT section 17).
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, SecretStr

from contracts.models import Budget


def read_env_file(path: str | Path = ".env") -> dict[str, str]:
    """Parse a simple KEY=VALUE .env file (stdlib only). A missing file yields no values."""
    file = Path(path)
    if not file.is_file():
        return {}
    values: dict[str, str] = {}
    for line in file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        value = value.split(" #", 1)[0].strip().strip("\"'")
        values[key.strip()] = value
    return values


class Thresholds(BaseModel):
    """Algorithm thresholds (SSOT 9.x). Tuned on golden questions at hours 14-16."""

    model_config = ConfigDict(frozen=True)

    quote_fuzzy_ratio: float = 0.95  # 9.4 quote guard
    near_duplicate_jaccard: float = 0.60  # 9.6 S2
    shingle_words: int = 5  # 9.6 S2
    shared_phrase_words: int = 6  # 9.6 S3
    conflict_tolerance: float = 0.15  # 9.7
    default_min_independent: int = 2  # 9.8
    passage_words_min: int = 120  # FR-07
    passage_words_max: int = 200  # FR-07
    passages_per_slot_source: int = 6  # 5.1
    source_char_cap: int = 60_000  # 5.1
    queries_per_task: int = 2  # FR-04, CL-05
    results_per_query: int = 6  # CL-05
    sources_per_task: int = 4  # CL-05
    max_initial_tasks: int = 10  # CL-05


class SSRFPolicy(BaseModel):
    """Fetch limits and SSRF guard parameters (SSOT section 17). Enforced by backend/gateway."""

    model_config = ConfigDict(frozen=True)

    allowed_schemes: tuple[str, ...] = ("http", "https")
    max_redirects: int = 3
    timeout_seconds: float = 12.0
    max_response_bytes: int = 3 * 1024 * 1024
    allowed_content_types: tuple[str, ...] = ("text/html", "application/xhtml+xml")
    block_private_ranges: bool = True  # loopback, private, link-local, metadata endpoints
    user_agent: str = "SarvamResearchBot/0.1 (evidence-first research agent)"


class Settings(BaseModel):
    model_config = ConfigDict(frozen=True)

    env: Literal["development", "test", "production"] = "development"
    mode: Literal["live", "replay"] = "live"

    api_host: str = "127.0.0.1"
    api_port: int = 8000
    api_prefix: str = "/api"
    cors_origins: tuple[str, ...] = ("http://localhost:5173",)

    db_path: Path = Path("data/sarvam.db")
    artifact_dir: Path = Path("data/artifacts")
    record_dir: Path = Path("cache/recorded")

    search_provider: str = ""
    search_api_key: SecretStr = SecretStr("")
    search_fallback_provider: str = ""
    search_fallback_api_key: SecretStr = SecretStr("")

    llm_provider: str = ""
    llm_api_key: SecretStr = SecretStr("")
    llm_model_fast: str = ""
    llm_model_strong: str = ""

    fetch_concurrency: int = 8
    llm_concurrency: int = 8

    budget: Budget = Field(default_factory=Budget)
    thresholds: Thresholds = Field(default_factory=Thresholds)
    ssrf: SSRFPolicy = Field(default_factory=SSRFPolicy)

    @classmethod
    def from_env(cls, environ: Mapping[str, str] | None = None) -> Settings:
        # Real environment variables win over .env; an explicit mapping never reads the file.
        e = {**read_env_file(), **os.environ} if environ is None else environ

        def get(name: str, default: str) -> str:
            return e.get(f"SARVAM_{name}", default)

        d = cls()
        b = d.budget
        origins = get("CORS_ORIGINS", ",".join(d.cors_origins))
        return cls(
            env=get("ENV", d.env),  # type: ignore[arg-type]
            mode=get("MODE", d.mode),  # type: ignore[arg-type]
            api_host=get("API_HOST", d.api_host),
            api_port=int(get("API_PORT", str(d.api_port))),
            cors_origins=tuple(o.strip() for o in origins.split(",") if o.strip()),
            db_path=Path(get("DB_PATH", str(d.db_path))),
            artifact_dir=Path(get("ARTIFACT_DIR", str(d.artifact_dir))),
            record_dir=Path(get("RECORD_DIR", str(d.record_dir))),
            search_provider=get("SEARCH_PROVIDER", ""),
            search_api_key=SecretStr(get("SEARCH_API_KEY", "")),
            search_fallback_provider=get("SEARCH_FALLBACK_PROVIDER", ""),
            search_fallback_api_key=SecretStr(get("SEARCH_FALLBACK_API_KEY", "")),
            llm_provider=get("LLM_PROVIDER", ""),
            llm_api_key=SecretStr(get("LLM_API_KEY", "")),
            llm_model_fast=get("LLM_MODEL_FAST", ""),
            llm_model_strong=get("LLM_MODEL_STRONG", ""),
            fetch_concurrency=int(get("FETCH_CONCURRENCY", str(d.fetch_concurrency))),
            llm_concurrency=int(get("LLM_CONCURRENCY", str(d.llm_concurrency))),
            budget=Budget(
                max_searches=int(get("MAX_SEARCHES", str(b.max_searches))),
                max_fetches=int(get("MAX_FETCHES", str(b.max_fetches))),
                max_llm_calls=int(get("MAX_LLM_CALLS", str(b.max_llm_calls))),
                max_cost_usd=float(get("MAX_COST_USD", str(b.max_cost_usd))),
                max_wall_seconds_soft=int(
                    get("MAX_WALL_SECONDS_SOFT", str(b.max_wall_seconds_soft))
                ),
                max_wall_seconds_hard=int(
                    get("MAX_WALL_SECONDS_HARD", str(b.max_wall_seconds_hard))
                ),
                max_followup_rounds=int(get("MAX_FOLLOWUP_ROUNDS", str(b.max_followup_rounds))),
            ),
        )
