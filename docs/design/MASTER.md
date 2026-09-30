# Sarvam Design System (MASTER)

## Identity
"Audit-grade calm". The product promise is trust in evidence. The identity is institutional and precise, not flashy.

## Tokens & Scale
- **Brand**: Deep institutional navy (`#1E3A5F`), Blue secondary (`#2563EB`)
- **Neutrals**: Cool paper background (`#F8FAFC`) in light, navy-ink background (`#0B1120`) in dark.
- **Status**:
  - **GREEN** (ok): fg, bg, border chosen for contrast. Shape: `CheckCircle`
  - **AMBER** (warn): ochre (separate from brand). Shape: `AlertTriangle`
  - **RED** (bad): Shape: `XOctagon`
  - **INFO**: Shape: `Info`
- **Typography**:
  - **Newsreader**: Display headings and report reading view.
  - **Fira Sans**: UI.
  - **Fira Code**: Claim IDs, numbers, quotes, timestamps.
  - Minimum 16px body, 14px labels.
- **Shape & Depth**: Radius scale (4, 8, 12), one elevation scale, 1px hairlines.
- **Motion**: 120ms (fast), 200ms (normal), 320ms (slow) with ease-out for enter, ease-in for exit. 

## Rules
- **Do**: Always provide an icon and a word for state (never color alone, NFR-10).
- **Do**: Maintain projectors-legible contrast (4.5:1 body, 3:1 UI).
- **Do**: Use meaning-driven motion (e.g., cell state change), no decorative enter animations.
- **Don't**: Use inline styles for standard tokens.
- **Don't**: Use unicode glyphs for UI icons.
