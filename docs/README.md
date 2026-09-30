# Sarvam documentation map

| Location | What it is | Authority |
| --- | --- | --- |
| [`ssot/SSOT_v2.docx`](ssot/SSOT_v2.docx) | ResearchOps 24-Hour MVP Single Source of Truth v2.0: scope, requirements, architecture, data model, algorithms, gates. | **Canonical.** Wins every conflict. |
| [`ssot/SSOT_v2.extracted.md`](ssot/SSOT_v2.extracted.md) | Plain-text extraction of the .docx for agents and diffing (no diagrams). | Derived; the .docx wins. |
| [`STATUS.md`](STATUS.md) | Build status by task card and gate, and the plan for what is next. | Update whenever a task lands. |
| [`architecture/`](architecture/README.md) | Concise architecture of Sarvam as built. | Must match the SSOT. |
| [`architecture/security.md`](architecture/security.md) | Security boundaries and what is implemented vs. planned. | Implements SSOT section 17. |
| [`OPEN_PROBLEMS.md`](OPEN_PROBLEMS.md) | Known defects and unverified items, with status. | Never delete history; mark RESOLVED with cause, fix, verification. |
| [`LLM_OPTIMIZATION_REPORT.md`](LLM_OPTIMIZATION_REPORT.md) | LLM usage measurements, optimisation experiments, doc audit, next-step analysis. | Measurements in `benchmarks/`. |
| [`decisions/`](decisions/README.md) | ADRs and the change log (SSOT sections 20-21). | Log every contract/schema/threshold change. |
| [`audit/`](audit/README.md) | Manual audit sheet and evaluation results (SSOT 16.3). | Filled during evaluation. |
| [`research/`](research/README.md) | External evidence base and market notes (SSOT 2.4, 23). | Reference only. |
| [`design/plain-language.md`](design/plain-language.md) | Plain-language layer: glossary, reading modes, where the wording is used (B-36). | Update when wording surfaces change. |
| [`design/MASTER.md`](design/MASTER.md) | Design system source of truth (Tokens, typography, UI rules). | Must match the UI redesign. |

"ResearchOps" refers to the GATEWAYS 2026 challenge domain and the SSOT title. The product is **Sarvam**.
