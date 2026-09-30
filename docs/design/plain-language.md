# Plain-language layer (B-36, CL-11)

Task record for making every result readable by non-specialists, in the UI and in the report.
Decided with the project owner on 1 Oct 2026. The change is permanent: results must be
understandable without knowing what RED, AMBER, `SUFFICIENT_WITH_CAVEATS` or "single origin" mean.

## Decisions

| Question | Answer |
| --- | --- |
| Where does the wording live? | One glossary, `contracts/glossary.py`, generated to `contracts/generated/glossary.ts` by `make contracts`. The UI and the report renderer both read it, so they cannot drift. |
| How does the report get the wording? | Deterministic. Code renders the headline, the stop reason, a "How to read this report" block and plain labels from the glossary. The writer LLM still writes only the findings (rule 8). |
| Headline wording | `SUFFICIENT` = "Answer is solid", `SUFFICIENT_WITH_CAVEATS` = "Answer is solid, with caveats", `INSUFFICIENT` = "Not enough to answer yet". |
| Coverage wording | `GREEN` = "Well supported", `AMBER` = "Partly supported", `RED` = "Not enough evidence". |

Enum values, stored data, events and `schema.sql` do not change. Only what people read changes.

## What the glossary covers

Each entry has `label`, `meaning` and `next_step`. Tables: `coverage_state`, `final_state`, `verdict`,
`challenge_outcome` (plus `pending`), `conflict_kind`, `conflict_status`, `termination_reason`, `failure`,
`source_status`, `certainty`. `READING_GUIDE` is the five-line "how to read this" text.

## Where it is used

| Surface | Change |
| --- | --- |
| `frontend/src/components/ui/chips.ts` | Every chip label, tooltip (`hint`) and the conflict-kind text come from the glossary through `gloss()`. `ChipSpec` gains `raw` (technical term) and `hint`. |
| `frontend/src/lib/format.ts` | `stateStyle` labels come from the glossary. |
| `StateChip` | Shows the plain label, a tooltip with the meaning, and in Detailed mode the technical term in parentheses. |
| `StopCard` | Headline, meaning and stop reason from the glossary; "Key points" tiles use the coverage labels; open conflicts read "disagreements between sources not yet explained". |
| `ReadingGuide` (new) | Collapsible legend inside `StopCard` plus the Simple / Detailed switch. |
| `lib/readingMode.ts` (new) | Per-viewer preference in `localStorage` (default Simple); works without storage. |
| `CoverageMatrix` | Cell badge and aria-label use plain labels; Detailed mode appends the colour term. |
| `backend/synth/render.py` | Headline and meaning, "Why the research stopped", a "How to read this report" section, plain labels in the coverage table, conflicts, critical gaps and challenges. |

The line `**Assurance state: <STATE>** (<reason>)` stays in the report, after the plain headline, because
gates and tools match it. It is the technical reference line, not the first thing a reader sees.

## Reading modes

- **Simple** (default): plain wording only.
- **Detailed**: plain wording plus the technical term, for example "Well supported (GREEN)".

Colour is never the only signal: every chip keeps its icon and its words.

## Tests

- `tests/unit/test_glossary.py`: every enum value has an entry (a new enum value without wording fails the
  build), the two headline sets are pinned to the approved wording, the reading guide contains no bracketed
  citation id (the citation checker would read it as a real claim), and `glossary.ts` is current.
- `tests/unit/test_writer_render.py`: the plain header precedes the technical line.
- `tests/gates/g3/test_g3.py`: conflict wording updated to "not yet explained".
- Frontend: `render.test.tsx`, `format.test.ts`, `MatrixPanel.test.ts` updated to the new labels.
- `make contracts-check` now also fails when `glossary.ts` is stale.

## Phase 2 (CL-12)

| Card | What changed |
| --- | --- |
| A. Gaps in plain English | `gap_text()` (Python) and `gapText()` (`frontend/src/lib/gap.ts`) turn a non-green cell into a sentence such as "only one independent source, so it is partly supported" plus a next step borrowed from the matching glossary entry. They are built from stored cell fields, never by parsing the raw reason, and both are tested against the shared `GAP_CASES`. `StopCard` and the Matrix summary show them through `GapList`; the report's "Conflicts and unresolved items" shows them with "Next step:" (conflicts too). |
| B. Simple mode is simple | In Simple mode the Matrix tab shows the totals, the gaps with next steps and a "Show details" button; the grid, table, round slider and cell detail appear after it is pressed. Detailed mode is unchanged. The stop card already showed only the headline, caveats and key-point tiles. |
| C. Jargon sweep | `TERMS` in the glossary (slot = key point, origin = independent source, round = research round, claim = statement) is read through `lib/terms.ts` by `CoverageMatrix`, `MatrixPanel`, `OriginGroupView`, `ClaimList`, `ConflictList`, `SourcesTable`, `EvidenceDrawer` and `ReportPanel`. The mock report uses the new wording. `LeftRail` had no such terms. `src/design/simpleMode.test.tsx` fails if an uppercase enum value such as RED reaches Simple-mode HTML. |

## Phase 3 (CL-13)

| Item | What changed |
| --- | --- |
| Dig deeper | Each gap in the stop card, the Matrix summary and the report view has a "Dig deeper on this" button. It does not start a run: it stores a focused question (`lib/digDeeper.ts`, in `sessionStorage`) and opens the new-run form prefilled with that question and the original scope. A banner says it is prefilled and that a live run uses credits; the run starts only when the person presses Start run, through the existing `POST /api/runs`. No backend change. A follow-up is a new run, not a hidden extra round, so the controller's round and stop logic is untouched. |
| Jargon sweep | New glossary tables `phase` (plain step names) and `event` (activity labels), read through `lib/labels.ts`. The phase stepper, the Activity dock labels and filter chips ("Statements", "Quality checks"), the plan tree ("needs 2 independent sources") and the challenge list ("What was tested") use plain wording. Detailed mode keeps the technical event names. |
| Real report check | A recorded canonical run (`canon-b3-o3`) was replayed offline (keys blanked) and its report read. That found the coverage table still said "Slot", "Independent origins" and showed the engine's raw reason; the table now says "Key point" and "Independent sources" and gives the plain reason. |

## Not in this task

Any change to coverage, stop or conflict logic.

## Known follow-ups

- The mock scenario reports in `frontend/src/mocks/data/` were generated by the new renderer; `bun run gen:mocks` was not re-run for the table wording of Phase 3.
- The report body is written in English only; a translation layer is not planned.
- Recorded reports made before this change keep their stored Markdown. The wording was checked on a replay of a real recorded run, not on a fresh live run.
