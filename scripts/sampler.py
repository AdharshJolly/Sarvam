"""Audit sampler (SSOT 16.3, T23): 20 findings sentences from a report, stratified by dimension.

    uv run python -m scripts.sampler [db] [run_id]

Defaults to the latest report in `db` (SARVAM_DB_PATH, else data/sarvam.db). Sentences come from the
report's "Findings by dimension" section, one per cited bullet, taken round-robin across dimensions
with a fixed seed so the sample is reproducible. Writes docs/audit/audit_sheet.csv with the label
columns blank for two reviewers, and docs/audit/evidence_pack.md with the quote and source of
every cited claim.
"""

from __future__ import annotations

import csv
import os
import random
import re
import sqlite3
import sys
from pathlib import Path

OUTPUT_CSV = Path("docs/audit/audit_sheet.csv")
PACK = Path("docs/audit/evidence_pack.md")
SAMPLE_SIZE = 20
SEED = 23
HEADER = ["run_id", "dimension", "sentence", "reviewer_1_label", "reviewer_2_label", "notes"]


def findings_by_dimension(markdown: str) -> dict[str, list[str]]:
    """Cited finding bullets under '## Findings by dimension', grouped by '### Dimension'."""
    groups: dict[str, list[str]] = {}
    in_findings, dimension = False, None
    for line in markdown.splitlines():
        if line.startswith("## "):
            in_findings = line.strip() == "## Findings by dimension"
            dimension = None
        elif in_findings and line.startswith("### "):
            dimension = line[4:].strip()
            groups.setdefault(dimension, [])
        elif in_findings and dimension and line.startswith("- ") and re.search(r"\[C\w+\]", line):
            groups[dimension].append(
                re.sub(r"\s*\{\{certainty:[^}]*\}\}\s*$", "", line[2:]).strip()
            )
    return {d: s for d, s in groups.items() if s}


def stratified_sample(
    groups: dict[str, list[str]], size: int = SAMPLE_SIZE, seed: int = SEED
) -> list[tuple[str, str]]:
    """Round-robin over dimensions (each shuffled), so no dimension repeats before all are used."""
    rng = random.Random(seed)
    pools = {d: rng.sample(s, len(s)) for d, s in groups.items()}
    out: list[tuple[str, str]] = []
    while len(out) < size and any(pools.values()):
        for dimension, pool in pools.items():
            if pool and len(out) < size:
                out.append((dimension, pool.pop()))
    return out


def evidence_pack(sample: list[tuple[str, str]], claims: dict[str, tuple[str, str, str]]) -> str:
    """Markdown for reviewers: each sampled sentence with its claims' quote, source and status."""
    lines = [
        "# Audit evidence pack",
        "",
        "Label each sentence supported, partial or unsupported.",
        "",
    ]
    for n, (dimension, sentence) in enumerate(sample, 1):
        lines += [f"## {n}. {dimension}", "", sentence, ""]
        for cid in re.findall(r"\[(C\w+)\]", sentence):
            if cid in claims:
                quote, url, status = claims[cid]
                lines += [f"- **{cid}** ({status}) {url}", f"  > {quote}"]
            else:
                lines.append(f"- **{cid}**: claim not found in this run")
        lines.append("")
    return "\n".join(lines)


def main(db: str, run_id: str | None = None) -> None:
    if not os.path.exists(db):
        print(f"Database not found at {db}")
        return
    conn = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    sql = "SELECT run_id, markdown FROM reports"
    row = (
        conn.execute(sql + " WHERE run_id = ? ORDER BY version DESC LIMIT 1", (run_id,))
        if run_id
        else conn.execute(sql + " ORDER BY rowid DESC LIMIT 1")
    ).fetchone()
    claims = {
        cid: (quote, url, status)
        for cid, quote, url, status in conn.execute(
            "SELECT c.id, c.quote, s.url, c.status FROM claims c"
            " JOIN passages p ON p.id = c.passage_id JOIN sources s ON s.id = p.source_id"
        )
    }
    conn.close()
    if not row:
        print("No report found in the database.")
        return
    rid, markdown = row
    groups = findings_by_dimension(markdown)
    sample = stratified_sample(groups)
    if not sample:
        print("No cited findings found in the report.")
        return
    OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(HEADER)
        for dimension, sentence in sample:
            writer.writerow([rid, dimension, sentence, "", "", ""])
    PACK.write_text(evidence_pack(sample, claims), encoding="utf-8")
    print(
        f"Sampled {len(sample)} of {sum(map(len, groups.values()))} findings sentences from {rid}"
    )
    print(f"across {len(groups)} dimensions into {OUTPUT_CSV}")


if __name__ == "__main__":
    main(
        sys.argv[1] if len(sys.argv) > 1 else os.environ.get("SARVAM_DB_PATH", "data/sarvam.db"),
        sys.argv[2] if len(sys.argv) > 2 else None,
    )
