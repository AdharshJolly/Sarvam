# Security boundaries

Implements SSOT section 17. Status column is honest: only rows marked "Implemented" are enforced by code and tests.

| Threat | Control (SSOT 17) | Where | Status |
| --- | --- | --- | --- |
| SSRF via fetched URLs | http/https only; resolve DNS; block loopback, private, link-local, metadata addresses; max 3 redirects, re-check each hop | `backend/gateway/ssrf.py`, limits in `contracts/config.py::SSRFPolicy` | Implemented (T02): scheme, credentials, port allowlist, local names, every resolved address must be public, IPv4-mapped IPv6, decimal/hex IP spellings, every redirect hop re-checked. Tested in `tests/unit/test_ssrf.py`, `test_fetch.py` |
| Oversized / binary responses | 12 s timeout, 3 MB cap, HTML content types only | `SSRFPolicy`, `gateway/fetch.py` | Implemented (T02): 12 s total timeout, 3 MiB streamed cap (also on declared length), HTML types only (`non_html` is SOURCE_EMPTY) |
| Prompt injection in pages | Retrieved text wrapped in `<source>` tags and labelled untrusted; extractor/verifier have no tools; schema-validated output; instruction-like text never reaches the controller | `gateway/llm.py`, `prompts/` | Implemented in the gateway (T02): untrusted text only inside escaped `<source>` blocks, never in the system message, schema-validated JSON with 2 retries. Extractor and verifier prompts: T06 and T09 |
| Fabricated citation | Quote guard on every claim; citations rendered from stored IDs; report verifier | `pipeline/claims.py`, `synth/` | Planned (T06, T07, T15); schema requires `quote` + `passage_id` today |
| Secret leakage | Keys only in environment variables; never in prompts, events or logs | `contracts/config.py` (`SecretStr`), `.gitignore`, `.env.example` | Enforced for config; tested |
| Runaway cost/time | Hard budgets enforced in the gateway; wrap-up path | `gateway/`, `controller.py` | Implemented (T02): searches, fetches, LLM calls, cost, soft and hard wall time; 80% warning. Wrap-up path: T07 and T14 |
| Site etiquette | Identify user agent; respect robots.txt where feasible; no login-walled scraping | `SSRFPolicy.user_agent` | robots.txt: planned. User agent: implemented |
| Overstated output | Certainty labels, state banner, labelled system inference | `synth/` | Planned (T15) |

Typed failures (`FailureType` in `contracts/models.py`) exist so that no failure is silent (NFR-04).
Accounts exist (B-32): PBKDF2-SHA256 passwords, opaque bearer sessions stored as SHA-256 hashes with a 7-day expiry. `users.role` is `user` or `admin`; admins are promoted only through `SARVAM_ADMIN_EMAILS`, and every `/api/admin/*` route is gated server-side by `require_admin`, admin mutations are recorded in the append-only `admin_actions` table, and disabled accounts lose their sessions immediately (the frontend guard is only a convenience). The API is intended for local use only and CORS is limited to the dev origin.

## Known residual risks

- **DNS rebinding (TOCTOU):** the guard resolves a host and then httpx resolves it again to connect, so a hostile DNS server could answer with a public address for the check and a private one for the connection. Not solved in the MVP; mitigations would be connecting to the vetted IP directly. Accepted for a local, single-user tool.
- **robots.txt** is not consulted yet (SSOT asks "where feasible").
- Cost is metered only from values the provider reports; providers that report none (for example Groq) are limited by the call, fetch, search and time budgets instead.
