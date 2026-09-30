# Security boundaries

Implements SSOT section 17. Status column is honest: nothing marked "planned" is enforced yet.

| Threat | Control (SSOT 17) | Where | Status |
| --- | --- | --- | --- |
| SSRF via fetched URLs | http/https only; resolve DNS; block loopback, private, link-local, metadata addresses; max 3 redirects, re-check each hop | `backend/gateway/ssrf.py`, limits in `contracts/config.py::SSRFPolicy` | Config + interface only; guard planned (T02) |
| Oversized / binary responses | 12 s timeout, 3 MB cap, HTML content types only | `SSRFPolicy`, `gateway/fetch.py` | Limits defined; enforcement planned (T02) |
| Prompt injection in pages | Retrieved text wrapped in `<source>` tags and labelled untrusted; extractor/verifier have no tools; schema-validated output; instruction-like text never reaches the controller | `gateway/llm.py`, `prompts/` | Planned (T02, T06, T09) |
| Fabricated citation | Quote guard on every claim; citations rendered from stored IDs; report verifier | `pipeline/claims.py`, `synth/` | Planned (T06, T07, T15); schema requires `quote` + `passage_id` today |
| Secret leakage | Keys only in environment variables; never in prompts, events or logs | `contracts/config.py` (`SecretStr`), `.gitignore`, `.env.example` | Enforced for config; tested |
| Runaway cost/time | Hard budgets enforced in the gateway; wrap-up path | `gateway/`, `controller.py` | Budget contract defined; enforcement planned (T02, T14) |
| Site etiquette | Identify user agent; respect robots.txt where feasible; no login-walled scraping | `SSRFPolicy.user_agent` | Planned |
| Overstated output | Certainty labels, state banner, labelled system inference | `synth/` | Planned (T15) |

Typed failures (`FailureType` in `contracts/models.py`) exist so that no failure is silent (NFR-04).
No authentication is in MVP scope; the API is intended for local use only and CORS is limited to the dev origin.
