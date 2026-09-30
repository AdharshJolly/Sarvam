import asyncio
import os
import sqlite3
import uuid
from datetime import UTC, datetime

from backend.controller import RunHandle, run_research
from contracts.config import Settings
from contracts.models import Budget, Mode, Scope


async def main():
    # Force replay mode and invalidate real keys to prove it works entirely offline
    os.environ["SARVAM_MODE"] = "replay"
    os.environ["SARVAM_LLM_API_KEY"] = "fake-key-offline"
    os.environ["SARVAM_SEARCH_API_KEY"] = "fake-key-offline"

    settings = Settings.from_env()

    # We must match the questions EXACTLY so cache hits
    questions = [
        "Should a company launch an electric scooter subscription service in Bengaluru in 2027?",
        "Should a D2C brand enter quick commerce in tier-2 Indian cities in 2027?",
        "Is a franchise model for EV charging stations in Karnataka viable?",
    ]

    for idx, q_text in enumerate(questions):
        run_id = f"R_REPLAY_{idx + 1}_{uuid.uuid4().hex[:4]}"
        print(f"Starting OFFLINE REPLAY for run {run_id} | question: {q_text}")

        conn = sqlite3.connect(settings.db_path)
        budget = Budget()
        # Mode.REPLAY explicitly
        conn.execute(
            "INSERT INTO runs (id, question, scope_json, mode, budget_json, status, started_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                run_id,
                q_text,
                Scope().model_dump_json(),
                Mode.REPLAY.value,
                budget.model_dump_json(),
                "queued",
                datetime.now(UTC).isoformat(),
            ),
        )
        conn.commit()
        conn.close()

        handle = RunHandle()
        try:
            await run_research(run_id, settings=settings, handle=handle)
            print(f"Replay {run_id} finished successfully offline!")
        except Exception as e:
            print(f"Replay {run_id} failed: {e}")


if __name__ == "__main__":
    asyncio.run(main())
