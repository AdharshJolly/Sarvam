import asyncio
import os
import sqlite3
import uuid
from datetime import UTC, datetime

from backend.controller import RunHandle, run_research
from contracts.config import Settings
from contracts.models import Budget, Mode, Scope


async def main():
    # Force recording on
    os.environ["SARVAM_RECORD"] = "1"

    settings = Settings.from_env()

    # Initialize DB if needed
    db_path = settings.db_path
    if not db_path.exists():
        from backend.store.db import init_db

        conn = init_db(db_path)
        conn.close()

    questions = [
        "Should a company launch an electric scooter subscription service in Bengaluru in 2027?",
        "Should a D2C brand enter quick commerce in tier-2 Indian cities in 2027?",
        "Is a franchise model for EV charging stations in Karnataka viable?",
    ]

    for idx, q_text in enumerate(questions):
        run_id = f"R_CANON_{idx + 1}_{uuid.uuid4().hex[:4]}"
        print(f"Starting run {run_id} for question: {q_text}")

        # Insert run into DB
        conn = sqlite3.connect(db_path)
        budget = Budget()
        conn.execute(
            "INSERT INTO runs (id, question, scope_json, mode, budget_json, status, started_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                run_id,
                q_text,
                Scope().model_dump_json(),
                Mode.LIVE.value,
                budget.model_dump_json(),
                "queued",
                datetime.now(UTC).isoformat(),
            ),
        )
        conn.commit()
        conn.close()

        handle = RunHandle()
        # Run it
        try:
            await run_research(run_id, settings=settings, handle=handle)
            print(f"Run {run_id} finished.")
        except Exception as e:
            print(f"Run {run_id} failed: {e}")


if __name__ == "__main__":
    asyncio.run(main())
