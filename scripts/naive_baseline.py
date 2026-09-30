import asyncio
import re
from dataclasses import dataclass

from backend.gateway.core import ToolGateway
from backend.gateway.fetch import HttpFetcher
from backend.gateway.llm import LLMRole, llm_from_settings
from backend.gateway.search import search_from_settings
from backend.gateway.ssrf import DefaultSSRFGuard
from backend.synth.report_verify import verify_report
from contracts.config import Settings
from contracts.llm import ReportDraft
from contracts.models import Claim, ClaimStatus, CoverageState, Dimension, Mode


@dataclass
class RunMock:
    question: str
    scope: object


class DummyScope:
    def model_dump(self):
        return {}


async def naive_baseline(question: str):
    settings = Settings.from_env()
    budget = settings.budget
    llm = llm_from_settings(settings)
    search = search_from_settings(settings)
    fetcher = HttpFetcher(settings.ssrf, DefaultSSRFGuard(settings.ssrf))

    gateway = ToolGateway(
        settings=settings, budget=budget, mode=Mode.LIVE, search=search, fetcher=fetcher, llm=llm
    )

    # 1. Single-pass search
    search_res = await gateway.search(question, max_results=3)

    passages = []
    # 2. Fetch and split
    for hit in search_res.value:
        try:
            fetch_res = await gateway.fetch(hit.url)
            text = fetch_res.value.body.decode("utf-8", errors="ignore")
            # very naive extraction (e.g. just stripping HTML roughly and splitting)
            text = re.sub(r"<[^>]+>", " ", text)
            chunks = [t.strip() for t in text.split("\n\n") if len(t.strip()) > 50]
            passages.extend(chunks[:5])  # take top 5 chunks per page
        except Exception:
            continue

    # Mock claims
    claims = []
    for i, p in enumerate(passages):
        claims.append(
            Claim(
                id=f"C{i}",
                run_id="naive",
                slot_id="naive_slot",
                round=0,
                text=p[:1000],
                quote=p[:1000],
                passage_id=f"P{i}",
                status=ClaimStatus.SUPPORTED,
                quote_verified=1,
            )
        )

    dimensions = [Dimension(id="D1", run_id="naive", name="General", description="")]

    # 3. LLM Writer (we will mock the WRITER role payload)
    payload = {
        "question": question,
        "scope": {},
        "dimensions": [{"id": "D1", "name": "General"}],
        "claims": [
            {
                "id": c.id,
                "dimension_id": "D1",
                "dimension": "General",
                "slot_id": "naive_slot",
                "text": c.text,
                "source_tier": 3,
            }
            for c in claims
        ],
    }

    res = await gateway.llm(LLMRole.WRITER, "writer.v1", ReportDraft, payload)
    draft = res.value

    # 4. Verify
    slot_state = {"naive_slot": CoverageState.GREEN}

    verified = verify_report(
        draft,
        claims,
        dimensions,
        slot_state,
        set(),  # allowed numbers from scope
    )

    # Calculate unsupported-claim rate
    total_findings = sum(len(s.findings) for s in draft.sections)
    dropped = len(verified.dropped)

    print(f"Question: {question}")
    print(f"Total findings drafted: {total_findings}")
    print(f"Dropped (unsupported/hallucinated): {dropped}")
    if total_findings > 0:
        print(f"Unsupported claim rate: {dropped / total_findings * 100:.1f}%")
    else:
        print("No findings drafted.")


if __name__ == "__main__":
    asyncio.run(
        naive_baseline(
            "Should a company launch an electric scooter subscription service in Bengaluru in 2027?"
        )
    )
