# contracts/generated (GENERATED: do not edit by hand)

| File | Produced by | Command |
| --- | --- | --- |
| `schema.json` | `contracts/schema_export.py` (Pydantic -> JSON Schema) | `make contracts` |
| `glossary.ts` | `contracts/glossary.py` (plain-language wording, B-36) | `make contracts` |
| `types.ts` | `json-schema-to-typescript` via `bun run gen:types` | `make contracts` |

Both are committed so the frontend typechecks on a fresh checkout. `make contracts-check`
fails if either is stale relative to `contracts/models.py` / `contracts/events.py`.
To change a shape, edit the Pydantic model (with a change-log row per SSOT section 21),
then regenerate.
