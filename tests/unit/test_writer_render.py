import asyncio

import pytest

from backend.gateway import BudgetExceeded, GatewayError
from backend.gateway.core import ToolGateway
from backend.store import repo
from backend.store.db import init_db
from backend.synth.render import CitationError, render_markdown, verify_citations
from backend.synth.report_verify import verify_report
from backend.synth.writer import (
    NO_CLAIMS_SUMMARY,
    clean_draft,
    eligible_claims,
    eligible_statuses,
    write_draft,
)
from contracts.config import Settings
from contracts.llm import ReportDraft, ReportFindingDraft, ReportSectionDraft
from contracts.models import (
    Budget,
    BudgetUsage,
    FailureType,
    FinalState,
    Mode,
    Plan,
    StopDecision,
    TerminationReason,
    Verdict,
)
from tests.support.data import plan_dict
from tests.support.fakes import FakeLLM

TEXT = "The monthly price of the basic plan is Rs. 1,299 and the fleet size is 4,000 scooters."


class Env:
    def __init__(self, tmp_path):
        self.settings = Settings(env="test", db_path=tmp_path / "t.db", llm_model_strong="strong-m")
        self.conn = init_db(self.settings.db_path)
        for rid in ("R1", "R2"):
            self.conn.execute(
                "INSERT INTO runs (id, question, scope_json, mode, budget_json, started_at)"
                " VALUES (?,?,?,?,?,?)",
                (
                    rid,
                    "Should we launch X?",
                    '{"geography": "Bengaluru"}',
                    "LIVE",
                    "{}",
                    "2026-01-01T00:00:00+00:00",
                ),
            )
        self.conn.commit()
        from backend.pipeline.plan import normalise

        repo.insert_plan(self.conn, "R1", normalise(Plan.model_validate(plan_dict(4)), Budget()))
        src = repo.insert_source(
            self.conn,
            "R1",
            url="https://a.example/x|y",
            canonical_url="a.example/x|y",
            domain="a.example",
            publisher="a.example",
            source_type="news",
            authority_tier=2,
            task_id="T1",
        )
        repo.update_source(
            self.conn, src.id, status="fetched", retrieved_at="2026-02-03T00:00:00+00:00"
        )
        self.passage = repo.insert_passages(self.conn, src.id, [(TEXT, 0, len(TEXT))])[0]
        self.claim = repo.insert_claim(
            self.conn,
            "R1",
            slot_id="D1S1",
            text="Basic plan costs 1299",
            quote="The monthly price of the basic plan is Rs. 1,299",
            passage_id=self.passage.id,
        )
        repo.record_verdict(self.conn, self.claim.id, Verdict.SUPPORTS, "states the price")
        self.run = repo.get_run(self.conn, "R1")

    def gateway(self, llm):
        return ToolGateway(settings=self.settings, budget=Budget(), mode=Mode.LIVE, llm=llm)

    def write(self, llm, claims=None):
        gw = self.gateway(llm)
        claims = eligible_claims(self.conn, "R1") if claims is None else claims
        return asyncio.run(write_draft(gw, self.conn, self.run, claims))

    def render(self, draft, claims=None, **kw):
        claims = eligible_claims(self.conn, "R1") if claims is None else claims
        decision = kw.pop("decision", None) or StopDecision(
            state=FinalState.SUFFICIENT_WITH_CAVEATS,
            termination_reason=TerminationReason.MAX_ROUNDS,
        )
        verified = verify_report(draft, claims, repo.list_dimensions(self.conn, "R1"), {}, set())
        return render_markdown(
            self.conn,
            self.run,
            verified,
            kw.pop("usage", BudgetUsage()),
            self.settings,
            claims,
            decision=decision,
            **kw,
        )


def draft_with(*findings, dim="D1"):
    return ReportDraft(
        decision_summary="Summary.",
        sections=[ReportSectionDraft(dimension_id=dim, heading="H", findings=list(findings))],
    )


def test_only_judged_quote_verified_claims_are_eligible(tmp_path):
    env = Env(tmp_path)
    assert eligible_statuses() == {"supported", "partial", "contested"}

    def add(text, **kw):
        return repo.insert_claim(
            env.conn,
            "R1",
            slot_id="D1S1",
            text=text,
            quote="The monthly price of the basic plan",
            passage_id=env.passage.id,
            **kw,
        )

    add("quote not proven", quote_verified=False)
    add("never judged")  # pending: no verdict yet, so not evidence (FR-18)
    partial = add("hedged")
    repo.record_verdict(env.conn, partial.id, Verdict.PARTIAL)
    dropped = add("irrelevant")
    repo.record_verdict(env.conn, dropped.id, Verdict.IRRELEVANT)
    contested = add("in an open conflict")
    repo.record_verdict(env.conn, contested.id, Verdict.SUPPORTS)
    repo.set_claim_statuses(env.conn, {contested.id: "contested"})
    assert [c.id for c in eligible_claims(env.conn, "R1")] == [
        env.claim.id,
        partial.id,
        contested.id,
    ]


def test_clean_draft_drops_uncited_unknown_empty_and_unknown_dimension(tmp_path):
    env = Env(tmp_path)
    dims = repo.list_dimensions(env.conn, "R1")
    f = ReportFindingDraft
    draft = draft_with(
        f(text="Good.", claim_ids=[env.claim.id, env.claim.id]),
        f(text="No cite.", claim_ids=[]),
        f(text="Unknown cite.", claim_ids=[env.claim.id, "C9999"]),
        f(text="   ", claim_ids=[env.claim.id]),
    )
    cleaned, dropped = clean_draft(draft, [env.claim], dims)
    assert [x.text for x in cleaned.sections[0].findings] == ["Good."]
    assert cleaned.sections[0].findings[0].claim_ids == [env.claim.id]  # de-duplicated
    assert dropped == ["No cite.", "Unknown cite.", "(empty finding)"]
    bad_dim = draft_with(f(text="Orphan.", claim_ids=[env.claim.id]), dim="D99")
    cleaned, dropped = clean_draft(bad_dim, [env.claim], dims)
    assert cleaned.sections == [] and dropped == ["Orphan."]


def test_no_claims_means_no_llm_call_and_a_plain_statement(tmp_path):
    env = Env(tmp_path)
    llm = FakeLLM({"writer.v1": "{}"})
    res = env.write(llm, claims=[])
    assert llm.calls == [] and res.draft.decision_summary == NO_CLAIMS_SUMMARY
    md = env.render(res.draft, claims=[])
    assert "No sources are cited" in md and "No verified claims were found" in md


@pytest.mark.parametrize(
    "error",
    [
        BudgetExceeded("max_llm_calls"),
        GatewayError(FailureType.STEP_FAILED, "bad output"),
        GatewayError(FailureType.BLOCKED, "provider outage"),
    ],
)
def test_writer_failure_falls_back_to_an_evidence_only_report(tmp_path, error):
    env = Env(tmp_path)
    res = env.write(FakeLLM({"writer.v1": error}))
    assert res.degraded_reason and res.metrics is None
    assert res.draft.sections[0].findings[0].claim_ids == [env.claim.id]
    md = env.render(res.draft, degraded_reason=res.degraded_reason)
    assert f"[{env.claim.id}]" in md and "could not be written" in md
    assert verify_citations(env.conn, "R1", md) == [env.claim.id]


def test_render_strips_typed_markers_escapes_tables_and_reports_unreported_cost(tmp_path):
    env = Env(tmp_path)
    draft = draft_with(
        ReportFindingDraft(
            text="Plans cost Rs. 1,299 [C999] per month [C1].", claim_ids=[env.claim.id]
        )
    )
    md = env.render(draft, usage=BudgetUsage(searches=3, fetches=2, llm_calls=5, cost_usd=0.0))
    assert "[C999]" not in md and md.count(f"[{env.claim.id}]") == 1
    assert "- Plans cost Rs. 1,299 per month . [C1]" in md or "Plans cost Rs. 1,299" in md
    assert "https://a.example/x\\|y" in md  # pipe escaped inside the sources table
    assert "| S1 | a.example | news | 2 | 2026-02-03 |" in md
    assert "Cost: not reported by provider" in md
    assert (
        "- Geography: Bengaluru" in md
        and "**Assurance state: SUFFICIENT_WITH_CAVEATS** (max_rounds)" in md
    )
    assert "Searches: 3/24" in md and "Mode: LIVE" in md
    assert "### Demand" in md and "No verified claims were found for this dimension." in md
    costed = env.render(draft, usage=BudgetUsage(cost_usd=0.1234))
    assert "Cost: $0.1234" in costed
    early = env.render(
        draft,
        decision=StopDecision(
            state=FinalState.INSUFFICIENT, termination_reason=TerminationReason.BUDGET
        ),
    )
    assert "Run ended early: budget" in early


def test_verify_citations_rejects_every_unresolvable_citation(tmp_path):
    env = Env(tmp_path)
    assert verify_citations(env.conn, "R1", f"text [{env.claim.id}]") == [env.claim.id]
    with pytest.raises(CitationError, match="C9999: no stored claim"):
        verify_citations(env.conn, "R1", "text [C9999]")
    with pytest.raises(CitationError, match="no stored claim in this run"):
        verify_citations(env.conn, "R2", f"text [{env.claim.id}]")  # another run's claim
    env.conn.execute(
        "INSERT INTO claims (id, run_id, slot_id, round, text, quote, passage_id, quote_verified)"
        " VALUES ('C500','R1','D1S1',0,'t','a quote that is nowhere in the passage text',?,1)",
        (env.passage.id,),
    )
    env.conn.commit()
    with pytest.raises(CitationError, match="C500: quote is not in passage"):
        verify_citations(env.conn, "R1", "text [C500]")
