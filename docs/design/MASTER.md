# Sarvam design system (MASTER)

Source of truth for how the Sarvam UI looks and behaves. If this file and the code disagree, fix
whichever is wrong in the same change. The SSOT (section 12, NFR-10) always wins over this file.

Code lives in `frontend/src`: tokens in `styles/tokens.css`, primitives in `components/ui/`, theme
logic in `lib/theme.ts`. Status of each part is tracked in the redesign plan (phases P0 to P8).

## 1. Identity: "audit-grade calm"

The product promise is trust in evidence, so the interface is institutional and precise, not
flashy. Colour is reserved for meaning; every state is shown as **colour + icon + word**, never
colour alone (SSOT section 12, NFR-10). Amber is a status colour only, never a brand colour.

## 2. Colour

All colour is a semantic token (`--color-*`), exposed to Tailwind through `@theme`
(`bg-surface`, `text-text-muted`, `border-border-strong`, `text-bad-fg` ...). Raw hex appears only in
`tokens.css`. Dark values live in one block, `:root[data-theme="dark"]`.

| Token | Light | Dark | Use |
|---|---|---|---|
| `brand` | `#1E3A5F` | `#60A5FA` | Primary fills, brand accents |
| `on-brand` | `#FFFFFF` | `#0B1120` | Text and icons on a `brand` fill |
| `brand-secondary` | `#2563EB` | `#93C5FD` | Links and focus rings |
| `bg` | `#F8FAFC` | `#0B1120` | Page background (also the browser `theme-color`) |
| `surface` | `#FFFFFF` | `#1E293B` | Cards, panels |
| `surface-2` | `#F1F5F9` | `#334155` | Hover, raised or nested areas |
| `text` | `#0F172A` | `#F8FAFC` | Body text |
| `text-muted` | `#475569` | `#A7B5C9` | Secondary text |
| `border-hairline` | `#E2E8F0` | `#334155` | Decorative dividers only |
| `border-strong` | `#7C8CA3` | `#7C8DA5` | **Control edges** (inputs, buttons, cells) |
| `ok-*` (green) | fg `#15803D` bg `#F0FDF4` | fg `#4ADE80` bg `#14532D` | Supported, success, GREEN |
| `warn-*` (ochre) | fg `#B45309` bg `#FFFBEB` | fg `#FBBF24` bg `#78350F` | Caution, AMBER |
| `bad-*` (red) | fg `#B91C1C` bg `#FEF2F2` | fg `#FCA5A5` bg `#7F1D1D` | Failure, conflict, RED |
| `info-*` (blue) | fg `#0369A1` bg `#F0F9FF` | fg `#7DD3FC` bg `#0C4A6E` | Neutral information |

Each status family also has a `-border` token.

**Contrast rules:** 4.5:1 for text, 3:1 for large text and for the edges of controls (WCAG 1.4.11).
`border-hairline` is decorative and exempt; never use it as the only edge of a control. All 23 text
and control pairs in `tokens.css` were checked in both themes and pass. A permanent test that fails
the build on regression is planned for P5.

**Token names:** a Tailwind colour utility that names a missing token (`border-border`, `bg-good`)
produces no CSS and silently loses its styling. `src/design/tokens.test.ts` fails the build on any such
class, so a renamed or mistyped token is caught immediately.

## 3. State language

| State | Icon | Word | Colour family |
|---|---|---|---|
| GREEN (supported, sufficient) | `CheckCircle` | GREEN / supported | ok |
| AMBER (partial, single origin, caveats) | `AlertTriangle` | AMBER / partial | warn |
| RED (missing, contradicted, failure) | `XOctagon` | RED / contradicts | bad |
| Contested or open conflict | `Zap` | contested / open | bad |
| Unresolved or unknown | `HelpCircle` | unresolved | warn or muted |
| Information | `Info` | (text) | info |

The mapping lives in `components/ui/chips.ts` (`StateChip`). Add new states there, not in
components.

## 4. Typography

Fonts are self-hosted (`@fontsource`) because REPLAY must work fully offline (NFR-07).

| Role | Tailwind | Font | Use |
|---|---|---|---|
| UI | `font-sans` (default) | Fira Sans 400 / 500 / 600 / 700 | All interface text |
| Data | `font-mono` | Fira Code 400 / 500 / 600 | Claim ids, numbers, quotes, timestamps |
| Display | `font-display` | Newsreader 400 / 600 / 700 | Headline moments and the report reading view |

- Every weight the UI uses is loaded, so nothing is synthesised: `font-normal` 400, `font-medium` 500,
  `font-semibold` 600, `font-bold` 700.
- **Floors:** 16px for reading text (SSOT NFR-10); **14px for any label, chip or metadata**. Do not use
  `text-xs` (12px). Existing violations are tracked for the P5 sweep.
- Use tabular numerals for meters and matrix counts so digits do not jump.
- The combined `@fontsource/<font>/<weight>.css` files are imported (not the per-subset files)
  because only they carry `unicode-range`; the latin-ext face covers the rupee sign. Browsers fetch a
  face only when a page needs it.

## 5. Shape, depth and spacing

- Radius scale: `--radius-4`, `--radius-8`, `--radius-12`. Cards use 8, buttons 6 to 8, chips full.
- One elevation token, `--shadow-elevation`, with a stronger dark variant. No other shadows.
- Spacing follows Tailwind's 4px scale; group with 8, 12, 16, 24.

## 6. Icons

- SVG icons from `lucide-react`, used only through `components/ui/Icon.tsx`.
- **Registry:** `Icon.tsx` imports each icon by name; `IconName` is derived from it, so an unknown
  name is a compile error and the bundle only contains icons in use. To add one, import it in
  `Icon.tsx`.
- Sizes: 14 (inline with small text), 16 (default), 18 (buttons), 24 (empty states).
- Decorative icons are `aria-hidden`; an icon that stands alone needs a `label`.
- Never use unicode glyphs (✓ ▲ ✕ ⚡) or emoji as icons; they render differently per platform.

## 7. Motion

Tokens: `--animate-enter-fast` 120 ms, `--animate-enter` 200 ms, `--animate-enter-slow` 320 ms with
ease-out; `--animate-exit-*` use ease-in. Exits are faster than enters.

Motion must mean something: a cell changing state, a source collapsing into an origin, a drawer
docking, a phase advancing. No decorative entrance animation on static cards. A global
`prefers-reduced-motion` rule turns animation and transition off, so every animated state must still
make sense when static.

## 8. Components

All live in `frontend/src/components/ui/`.

| Component | Notes |
|---|---|
| `Icon` | Strict registry, see section 6 |
| `Button` | primary, secondary, ghost, danger; sizes sm, md, lg, icon; 44 px touch target on coarse pointers; icon-only buttons need `aria-label` |
| `Card` | The one surface: hairline border, 8 px radius. `pad` (xs to lg), `accent` (4 px status edge), `frame` (full 2 px status frame), `interactive` (hover), `as` (div, section, article, li, button) |
| `Tabs` | WAI-ARIA tabs with the keyboard model in `lib/tabs.ts`; scrolls sideways on narrow screens |
| `Dialog` | Native `<dialog>`: modal (browser focus trap, inert background, Escape) or docked (non-modal, Escape handled on the element) |
| `Tooltip` | Hover, focus and Escape (WCAG 1.4.13); use for explanations, never for the only copy of a fact. `Badge` with a `title` uses it |
| `Banner`, `Meter`, `Metric`, `Panel`, `Skeleton`, `EmptyState`, `Badge`, `StateChip` | As named; `StateChip` is the single place state is turned into icon + word + colour |

Rules: use `Button`, not a raw `<button>`, for actions. Custom controls (tabs, matrix cells) keep a raw
element but must have `type`, a visible focus ring and 44 px touch targets on touch devices. Do not
hand-build a card with border classes; use `Card`.

## 9. Theme mechanics

- The user chooses system, light or dark. The resolved value is written to `<html data-theme>`, plus
  `color-scheme` and `<meta name="theme-color">`.
- The choice persists in `localStorage` under `theme`; a corrupted value means system. System follows
  the OS while the page is open.
- `index.html` contains a small inline script that applies the theme before first paint. It mirrors
  `lib/theme.ts`; `theme.test.ts` fails if the storage key or the `theme-color` values drift.
- To add a token: define it in `:root` **and** `:root[data-theme="dark"]`, then expose it in
  `@theme`. Check its contrast against every surface it can sit on.

## 10. Responsive targets

Design and test at 375, 768, 1024 and 1440 px, both themes, with no horizontal page scroll. Behaviour
per screen is defined in phase P6 of the redesign plan.

## 11. Do and don't

- **Do** show every state as icon + word + colour.
- **Do** keep a one-line reason next to every change of direction (SSOT section 12).
- **Do** make every number link to the record that produced it (SSOT section 12).
- **Do** label every spinner; prefer skeletons that match the final layout.
- **Do** keep failures visible on the affected source or cell and in the timeline.
- **Don't** convey state by colour alone, or use `border-hairline` as a control edge.
- **Don't** use inline styles for anything a token covers, or raw hex outside `tokens.css`.
- **Don't** use `text-xs`, unicode glyph icons, or decorative motion.
- **Don't** present a replayed run as live: REPLAY is always labelled.

## 12. Decisions

| Decision | Reason |
|---|---|
| Amber is a status colour only; brand is navy | An amber brand would collide with the AMBER coverage state |
| Dark theme uses a lighter brand blue and its own `on-brand` | Navy on a navy-ink surface is unreadable |
| Dark background is navy ink, not pure black | Keeps parity with the light theme and avoids harsh contrast |
| Fonts are not preloaded | Vite hashes asset names, so a static `<link rel="preload">` cannot name them; `font-display: swap` avoids invisible text |
| `border-strong` darkened (light) and lightened (dark) | The first palette had control edges at 1.4:1 to 2.5:1 against a 3:1 minimum |
