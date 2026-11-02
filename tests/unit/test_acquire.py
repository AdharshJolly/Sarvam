import asyncio
import hashlib
from pathlib import Path

import pytest

from backend.gateway import BudgetExceeded, GatewayError
from backend.gateway.core import ToolGateway
from backend.gateway.fetch import FetchResult
from backend.pipeline.acquire import run_acquire
from backend.pipeline.extract import run_extract
from backend.store import repo
from backend.store.db import init_db
from backend.store.emit import Emitter
from backend.store.events import read_events
from contracts.config import Settings, Thresholds
from contracts.events import EventType
from contracts.models import Budget, FailureType, Mode
from tests.support.fakes import FakeFetcher, html_result
from tests.support.pdf import make_pdf

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "html"
ARTICLE = (FIXTURES / "article.html").read_text(encoding="utf-8")
SHELL = (FIXTURES / "empty_shell.html").read_text(encoding="utf-8")
PROVIDER_TEXT = " ".join(f"provider{i}" for i in range(150))


class Env:
    def __init__(self, tmp_path, fetcher, urls, *, budget=None, thresholds=None):
        self.settings = Settings(
            env="test",
            db_path=tmp_path / "t.db",
            artifact_dir=tmp_path / "art",
            thresholds=thresholds or Thresholds(),
        )
        self.conn = init_db(self.settings.db_path)
        self.conn.execute(
            "INSERT INTO runs (id, question, mode, budget_json, started_at) VALUES (?,?,?,?,?)",
            ("R1", "q", "LIVE", "{}", "2026-01-01T00:00:00+00:00"),
        )
        self.conn.commit()
        self.sources = [
            repo.insert_source(
                self.conn,
                "R1",
                url=u,
                canonical_url=u,
                domain="a.example",
                publisher="a.example",
                source_type="news",
                authority_tier=2,
                task_id="T1",
            )
            for u in urls
        ]
        self.gateway = ToolGateway(
            settings=self.settings,
            budget=budget or Budget(),
            mode=Mode.LIVE,
            fetcher=fetcher,
        )
        self.em = Emitter(self.conn, "R1")

    def acquire(self):
        return asyncio.run(run_acquire(self.gateway, self.conn, self.em, self.settings, "R1"))

    def source(self, i=0):
        return repo.get_source(self.conn, self.sources[i].id)

    def art(self, name):
        return self.settings.artifact_dir / "R1" / name

    def events(self, type_):
        return [e for e in read_events(self.conn, "R1") if e.type is type_]


U1, U2 = "https://a.example/1", "https://a.example/2"


def test_success_stores_raw_clean_text_hash_and_published_date(tmp_path):
    env = Env(tmp_path, FakeFetcher({U1: html_result(U1, ARTICLE)}), [U1])
    assert env.acquire() == 1
    s = env.source()
    text = env.art(f"{s.id}.txt").read_text(encoding="utf-8")
    assert s.status == "fetched" and s.fail_reason is None and s.retrieved_at is not None
    assert s.content_hash == hashlib.sha256(text.encode("utf-8")).hexdigest()
    assert s.published_at.date().isoformat() == "2025-03-14"
    assert env.art(f"{s.id}.raw.html").read_bytes() == ARTICLE.encode("utf-8")
    (ev,) = env.events(EventType.SOURCE_FETCHED)
    assert ev.payload == {"source_id": s.id, "chars": len(text), "content_hash": s.content_hash}
    assert ev.step_ms is not None
    phases = [e.payload["phase"] for e in env.events(EventType.PHASE_ENTERED)]
    assert phases == ["ACQUIRE"]


def test_403_is_source_unavailable_and_visible_and_does_not_stop_others(tmp_path):
    f = FakeFetcher(
        {
            U1: GatewayError(FailureType.SOURCE_UNAVAILABLE, "http_403"),
            U2: html_result(U2, ARTICLE),
        }
    )
    env = Env(tmp_path, f, [U1, U2])
    assert env.acquire() == 1
    assert (env.source(0).status, env.source(0).fail_reason) == ("SOURCE_UNAVAILABLE", "http_403")
    assert env.source(1).status == "fetched"
    (ev,) = env.events(EventType.SOURCE_FAILED)
    assert ev.payload == {
        "source_id": env.sources[0].id,
        "failure": "SOURCE_UNAVAILABLE",
        "reason": "http_403",
    }
    assert f.calls.count(U1) == 1  # only timeouts are retried


def test_empty_extraction_is_source_empty_without_provider_text(tmp_path):
    env = Env(tmp_path, FakeFetcher({U1: html_result(U1, SHELL)}), [U1])
    env.acquire()
    s = env.source()
    assert (s.status, s.fail_reason) == ("SOURCE_EMPTY", "empty_extraction")
    assert env.events(EventType.SOURCE_FAILED)[0].payload["failure"] == "SOURCE_EMPTY"


def test_empty_extraction_uses_provider_text_when_available(tmp_path):
    env = Env(tmp_path, FakeFetcher({U1: html_result(U1, SHELL)}), [U1])
    folder = env.settings.artifact_dir / "R1"
    folder.mkdir(parents=True)
    (folder / f"{env.sources[0].id}.provider.txt").write_text(PROVIDER_TEXT, encoding="utf-8")
    assert env.acquire() == 1
    s = env.source()
    assert (s.status, s.fail_reason) == ("fetched", "provider_text_fallback")
    assert env.art(f"{s.id}.txt").read_text(encoding="utf-8") == PROVIDER_TEXT
    assert env.events(EventType.SOURCE_FETCHED) and not env.events(EventType.SOURCE_FAILED)


def test_short_provider_text_is_not_good_enough(tmp_path):
    env = Env(tmp_path, FakeFetcher({U1: html_result(U1, SHELL)}), [U1])
    folder = env.settings.artifact_dir / "R1"
    folder.mkdir(parents=True)
    (folder / f"{env.sources[0].id}.provider.txt").write_text("only a few words", encoding="utf-8")
    env.acquire()
    assert env.source().status == "SOURCE_EMPTY"


def test_unsupported_type_is_source_empty_with_or_without_fallback(tmp_path):
    unsupported_type = GatewayError(FailureType.SOURCE_EMPTY, "unsupported_type")
    env = Env(tmp_path, FakeFetcher({U1: unsupported_type}), [U1])
    env.acquire()
    assert (env.source().status, env.source().fail_reason) == ("SOURCE_EMPTY", "unsupported_type")
    env2 = Env(tmp_path / "b", FakeFetcher({U1: unsupported_type}), [U1])
    folder = env2.settings.artifact_dir / "R1"
    folder.mkdir(parents=True)
    (folder / f"{env2.sources[0].id}.provider.txt").write_text(PROVIDER_TEXT, encoding="utf-8")
    env2.acquire()
    assert env2.source().status == "fetched"


def pdf_result(url: str, body: bytes) -> FetchResult:
    return FetchResult(
        url=url, final_url=url, status_code=200, content_type="application/pdf", body=body
    )


PDF_LINES = [
    "Karnataka offers a road tax exemption for",
    "electric two-wheelers registered before 2030.",
]


def test_pdf_is_fetched_as_reflowed_text_with_its_creation_date(tmp_path):
    body = make_pdf([PDF_LINES], creation_date="D:20250314000000Z")
    env = Env(tmp_path, FakeFetcher({U1: pdf_result(U1, body)}), [U1])
    assert env.acquire() == 1
    s = env.source()
    text = env.art(f"{s.id}.txt").read_text(encoding="utf-8")
    assert s.status == "fetched" and s.fail_reason is None
    assert " ".join(PDF_LINES) in text.split("\n")
    assert s.published_at.date().isoformat() == "2025-03-14"
    assert env.art(f"{s.id}.raw.pdf").read_bytes() == body
    assert not env.art(f"{s.id}.raw.html").exists()


def test_pdf_passages_hold_whole_sentences(tmp_path):
    env = Env(tmp_path, FakeFetcher({U1: pdf_result(U1, make_pdf([PDF_LINES]))}), [U1])
    env.acquire()
    run_extract(env.conn, env.em, env.settings, "R1")
    passages = repo.list_passages(env.conn, env.sources[0].id)
    assert any(" ".join(PDF_LINES) in p.text for p in passages)


def test_pdf_without_text_is_source_empty_and_says_why(tmp_path):
    env = Env(tmp_path, FakeFetcher({U1: pdf_result(U1, make_pdf([[]]))}), [U1])
    assert env.acquire() == 0
    assert (env.source().status, env.source().fail_reason) == ("SOURCE_EMPTY", "pdf_no_text")


def test_unreadable_pdf_is_source_empty_and_says_why(tmp_path):
    env = Env(tmp_path, FakeFetcher({U1: pdf_result(U1, b"%PDF-1.4 truncated")}), [U1])
    assert env.acquire() == 0
    assert (env.source().status, env.source().fail_reason) == ("SOURCE_EMPTY", "pdf_unreadable")


class FlakyFetcher:
    def __init__(self, failures):
        self.failures, self.calls = failures, 0

    async def fetch(self, url):
        self.calls += 1
        if self.calls <= self.failures:
            raise GatewayError(FailureType.SOURCE_UNAVAILABLE, "timeout")
        return html_result(url, ARTICLE)


def test_timeout_is_retried_exactly_once(tmp_path):
    ok = FlakyFetcher(failures=1)
    env = Env(tmp_path, ok, [U1])
    assert env.acquire() == 1 and ok.calls == 2
    bad = FlakyFetcher(failures=5)
    env2 = Env(tmp_path / "b", bad, [U1])
    env2.acquire()
    assert bad.calls == 2 and env2.source().fail_reason == "timeout"


def test_budget_error_surfaces_after_persisting_finished_fetches(tmp_path):
    f = FakeFetcher({U1: html_result(U1, ARTICLE), U2: html_result(U2, ARTICLE)})
    env = Env(tmp_path, f, [U1, U2], budget=Budget(max_fetches=1, max_followup_rounds=0))
    with pytest.raises(BudgetExceeded) as ei:
        env.acquire()
    assert ei.value.limit == "max_fetches"
    assert sorted(s.status for s in repo.list_sources(env.conn, "R1")) == ["fetched", "found"]


def test_cap_is_applied_after_cleaning_and_reported_in_the_event(tmp_path):
    env = Env(
        tmp_path,
        FakeFetcher({U1: html_result(U1, ARTICLE)}),
        [U1],
        thresholds=Thresholds(source_char_cap=400),
    )
    env.acquire()
    s = env.source()
    text = env.art(f"{s.id}.txt").read_text(encoding="utf-8")
    assert len(text) == 400 and env.events(EventType.SOURCE_FETCHED)[0].payload["chars"] == 400


def test_extract_creates_passages_with_exact_offsets_and_is_idempotent(tmp_path):
    env = Env(
        tmp_path, FakeFetcher({U1: html_result(U1, ARTICLE), U2: html_result(U2, SHELL)}), [U1, U2]
    )
    env.acquire()
    created = run_extract(env.conn, env.em, env.settings, "R1")
    s = env.source(0)
    text = env.art(f"{s.id}.txt").read_text(encoding="utf-8")
    passages = repo.list_passages(env.conn, s.id)
    assert created == len(passages) >= 2
    assert all(text[p.char_start : p.char_end] == p.text for p in passages)
    assert [p.idx for p in passages] == list(range(len(passages)))
    assert repo.list_passages(env.conn, env.sources[1].id) == []  # the failed source has none
    (pc,) = env.events(EventType.PASSAGES_CREATED)
    assert pc.payload == {"source_id": s.id, "count": len(passages)}
    assert run_extract(env.conn, env.em, env.settings, "R1") == 0  # already split
    phases = [e.payload["phase"] for e in env.events(EventType.PHASE_ENTERED)]
    assert phases == ["ACQUIRE", "EXTRACT", "EXTRACT"]


def test_retry_blocked_by_the_fetch_budget_fails_only_that_source(tmp_path):
    """Regression (live Gemini run): timeout retries used up the fetch cap and the BudgetExceeded
    ended the whole run with zero claims. The retry must be dropped, not the run."""
    f = FlakyFetcher(failures=5)
    env = Env(tmp_path, f, [U1], budget=Budget(max_fetches=1, max_followup_rounds=0))
    assert env.acquire() == 0  # no BudgetExceeded escapes
    s = env.source()
    assert (s.status, s.fail_reason) == ("SOURCE_UNAVAILABLE", "timeout") and f.calls == 1
    assert env.events(EventType.SOURCE_FAILED)[0].payload["reason"] == "timeout"
