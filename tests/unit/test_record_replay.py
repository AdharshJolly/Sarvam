import asyncio

import pytest
from pydantic import BaseModel

from backend.gateway import GatewayError
from backend.gateway.core import ToolGateway
from backend.gateway.llm import LLMRole
from backend.gateway.record_replay import RecordMode, RecordReplay
from backend.gateway.search import SearchHit
from contracts.config import Settings
from contracts.models import Budget, FailureType, Mode
from tests.support.fakes import FakeFetcher, FakeLLM, FakeSearch, html_result

URL = "https://a.example/p"
HITS = [SearchHit(url=URL, title="A", snippet="s", cleaned_text="full text")]
SETTINGS = Settings(
    env="test",
    llm_model_fast="fast-m",
    llm_model_strong="strong-m",
    search_provider="fake-search",  # in production this equals the provider class name
)


class Pong(BaseModel):
    ok: bool


def gateway(mode, record_dir, *, live=True):
    rec_mode = RecordMode.RECORD if mode is Mode.LIVE else RecordMode.REPLAY
    kwargs = {}
    if live:
        kwargs = dict(
            search=FakeSearch({"q": HITS}),
            fetcher=FakeFetcher(
                {
                    URL: html_result(URL, "<html><p>hello</p></html>"),
                    "https://blocked.example": GatewayError(
                        FailureType.SOURCE_UNAVAILABLE, "http_403"
                    ),
                }
            ),
            llm=FakeLLM({"planner.v1": ["garbage", '{"ok": true}']}, tokens=9, cost_usd=0.5),
        )
    return ToolGateway(
        settings=SETTINGS,
        budget=Budget(),
        mode=mode,
        recorder=RecordReplay(record_dir, rec_mode),
        **kwargs,
    )


async def exercise(gw):
    s = await gw.search("q")
    f = await gw.fetch(URL)
    llm = await gw.llm(LLMRole.PLANNER, "planner.v1", Pong, {"x": 1})
    try:
        await gw.fetch("https://blocked.example")
        failure = None
    except GatewayError as exc:
        failure = (exc.failure, exc.message)
    return s, f, llm, failure


def test_record_then_replay_is_identical_with_no_providers(tmp_path):
    recorded = asyncio.run(exercise(gateway(Mode.LIVE, tmp_path)))
    assert (
        len(list(tmp_path.glob("*.json"))) == 5
    )  # search, 2 fetches (one a failure), 2 llm attempts
    replay_gw = gateway(Mode.REPLAY, tmp_path, live=False)  # no search/fetcher/llm objects at all
    replayed = asyncio.run(exercise(replay_gw))
    assert replayed[0].value == recorded[0].value and replayed[0].metrics == recorded[0].metrics
    assert replayed[1].value == recorded[1].value and replayed[1].metrics == recorded[1].metrics
    assert replayed[2].value == recorded[2].value and replayed[2].metrics == recorded[2].metrics
    assert replayed[3] == recorded[3] == (FailureType.SOURCE_UNAVAILABLE, "http_403")
    assert replay_gw.usage().llm_calls == 2  # meters still count, so budgets behave the same


def test_replay_miss_is_a_typed_blocked_error(tmp_path):
    gw = gateway(Mode.REPLAY, tmp_path, live=False)
    with pytest.raises(GatewayError) as ei:
        asyncio.run(gw.search("never recorded"))
    assert ei.value.failure is FailureType.BLOCKED and "replay miss: search-" in ei.value.message


def test_recorder_off_passes_straight_through(tmp_path):
    rec = RecordReplay(tmp_path, RecordMode.OFF)

    async def live():
        return {"n": 1}

    assert asyncio.run(rec.call("x", {"a": 1}, live)) == {"n": 1}
    assert list(tmp_path.glob("*.json")) == []
