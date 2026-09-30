# Sarvam frontend architecture

Bun + Vite + React 19 + Tailwind 4, TypeScript strict. Domain types come only from `@contracts/types`
(generated from the Pydantic contracts). The UI talks to the backend through the seven REST endpoints plus SSE.

## State flow

```
useRunSession (SessionProvider)
  hash #/run/<id> -> GET /state (hydrate) -> EventSource /events?after=<last_event_id>
  GET /runs/{id} polled every 2 s while queued/running (budget meters)
        |
        v
runStore.reduce(view, action)   pure, idempotent per event.id, exhaustive over EventType
        |
        v
selectors.ts (pure)  ->  panels / components (props only)
```

- `src/api/client.ts`: `RunApi` interface, real implementation, `ApiError` carrying the server `detail`.
- `src/api/sse.ts`: `OpenStream` interface and the real `EventSource` wrapper (unnamed `data:` frames, `after`).
- `src/api/index.ts`: picks real or mock transport from `VITE_USE_MOCK`.
- Components never fetch directly; the evidence drawer and report panel go through `runApi`.

## Decisions (F1 to F7)

- **F1** SSE: `onmessage` only; `?after=<n>` on first connect; duplicates ignored by event id; connection state shown.
- **F2** Hydrate then stream; run id from the URL hash, no router.
- **F3** Mock mode (`VITE_USE_MOCK=1`): scripted, typed scenarios in `src/mocks/`; persistent "MOCK DATA" banner; mock runs
  are never presented as live (the `replay` scenario uses mode REPLAY).
- **F4** Activity dock at the bottom of the centre column; plan, sources and claims live in the Evidence tab.
- **F5** `lib/reportMarkdown.ts`: dependency-free parser producing a data tree; React renders text nodes only.
- **F6** Budget meters use the 2 s summary poll; amber at 80 percent, LIMIT at 100 percent.
- **F7** Coverage rollups always come from the server; the UI never recomputes coverage rules.

## Plain wording (B-38)

Every user-visible enum value is worded by `contracts/glossary.py` (generated to `@contracts/glossary`). Components never hard-code state words: they call `chips.ts` (`gloss()` and the `*Chip` helpers). `StateChip` shows the plain label, the meaning as a tooltip, and the technical term in Detailed mode (`lib/readingMode.ts`, default Simple). `StopCard` holds the legend (`ReadingGuide`). See `docs/design/plain-language.md`.

## Mock mode

`cd frontend && VITE_USE_MOCK=1 bun run dev`. Pick a scenario (complete, insufficient, budget-wrapup, failure, replay),
a speed, or "Skip to end". Reloading `#/run/mock-<scenario>-<n>` shows the finished run.
`bun run gen:mocks` writes `src/mocks/data/*.json`; `tests/unit/test_frontend_mocks.py` validates every event and payload
against `contracts.events`, so the mocks cannot drift from the backend contracts.

## Known limitations

- `RunState` does not include the run.failed message or rejected claims, so after a reload the failure banner says the
  detail was recorded earlier, and the rejected-claims list only holds rejections seen on the stream.
- The timeline holds only events received since the page attached (hydrate then stream from `last_event_id`).
- Tasks are marked `pending` or `running`; no per-task completion state exists in the contracts.
- `sourcesForSlot` groups sources by `task_id -> slot_id`; a source found for several slots counts once, under its task.
