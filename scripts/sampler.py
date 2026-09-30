import csv
import os
import random
import re
import sqlite3

DB_PATH = os.environ.get("SARVAM_DB_PATH", "data/sarvam.db")
OUTPUT_CSV = "docs/audit/audit_sheet.csv"


def main():
    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Get the latest report
    cursor.execute("SELECT run_id, markdown FROM reports ORDER BY rowid DESC LIMIT 1")
    row = cursor.fetchone()

    if not row:
        print("No reports found in the database.")
        return

    run_id = row["run_id"]
    markdown = row["markdown"]

    # Simple sentence tokenizer that looks for citations like [C1]
    sentences = re.split(r"(?<=[.!?])\s+", markdown.strip())
    findings = []

    for sentence in sentences:
        sentence = sentence.strip()
        # Look for claim citations e.g. [C123]
        if re.search(r"\[C\w+\]", sentence) and len(sentence) > 20:
            findings.append(sentence)

    if not findings:
        print("No findings with citations found in the report.")
        return

    # Sample up to 20 sentences
    sample_size = min(20, len(findings))
    sampled = random.sample(findings, sample_size)

    # Read existing CSV or create new one

    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(
            ["run_id", "dimension", "sentence", "reviewer_1_label", "reviewer_2_label", "notes"]
        )
        for sentence in sampled:
            # The dimension is not extracted here: the reviewers fill it in.
            writer.writerow([run_id, "", sentence, "", "", ""])

    print(f"Sampled {sample_size} sentences from run {run_id} into {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
