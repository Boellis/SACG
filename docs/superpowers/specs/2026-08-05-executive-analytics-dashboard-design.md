# Executive Analytics Dashboard — Design

**Date:** 2026-08-05
**Status:** Approved (Brandon, in-session)
**Route:** `/analytics` (admin-only)

## Purpose

A single-page, executive-grade analytics dashboard for SACG with two jobs:

1. **Real tool** — give garden admins a committee-ready view of occupancy, dues,
   participation, and plot upkeep, with a printable report for committee meetings.
2. **Portfolio piece** — Brandon will screen-share this from his admin login to
   demonstrate executive-dashboard work (target role: building data dashboards
   for company presidents). Craft bar is therefore high: dense-but-legible
   layout, period deltas, drill-downs, light/dark theming, print output.

Language stays right-sized for a community garden: "committee report," not
"board deck."

## Decisions (from brainstorm)

| Question | Decision |
|---|---|
| Access | Admin-only, behind existing `RequireAdmin`; demoed via screen-share |
| Data | Live Firestore + a **Demo data** toggle (rich generated dataset for presentations) |
| Structure | **One page** with tabs: Overview, Finance, Operations, Engagement |
| Tab URLs | Active tab reflected in URL (`/analytics`, `/analytics/finance`, …) — back button/bookmarks work; zero navigation feel |
| Capabilities | Date-range filter, print/PDF committee report, period-over-period deltas, drill-down interactions — all in scope |
| Theme | Polished light default + dark toggle, scoped to the analytics area |
| Charts | Recharts (2.x line, React-18-compatible), lazy-loaded so it stays out of the main bundle |

## Architecture

### Route & code-splitting

- `App.tsx`: under the existing `RequireAdmin` nest, add nested routes
  `/analytics` (index = Overview), `/analytics/finance`, `/analytics/operations`,
  `/analytics/engagement`, all rendering one lazily-imported `AnalyticsPage`
  shell (same `lazy()` + `Suspense` pattern as `WholeGardenPage`), so Recharts
  and all analytics code land in their own chunk.
- `Layout.tsx`: "Analytics" link in the admin nav section. Existing admin
  `Dashboard` gets an "Open Analytics →" link.

### Data flow (one direction, demo swap upstream)

```
listeners (existing APIs)          demoData.ts (deterministic)
   plots, members, allHours,   OR    same shapes, ~2.5yr history
   events, threads, polls,
   settings
        └────────────┬────────────────┘
                     ▼
        raw datasets (Member[], Plot[], VolunteerHour[], …)
                     ▼
        src/logic/analytics.ts  — pure, unit-tested math:
          window filtering, prior-window comparison, cumulative
          growth series, weekly hours series, participation rate,
          dues rollups by size tier & season, upkeep scoring,
          hours-requirement cohorts
                     ▼
        tabs & widgets (KpiTile, ChartCard, …)
```

- `useAnalyticsData.ts` subscribes to `listenPlots`, `listenMembers`,
  `listenAllHours`, `listenEvents`, `listenThreads`, `listenPolls`,
  `listenSettings`; returns `{ data, loading, error }`.
- The demo toggle swaps the **raw datasets** above the logic layer, so live and
  demo modes exercise identical aggregation/render code.
- Per-event RSVP counts and per-poll vote counts are bounded one-shot
  `getDocs` reads (few events/polls), fetched where used: the next upcoming
  event's RSVPs on Overview mount, in-window events' RSVPs on Engagement tab
  mount. Forum engagement uses thread `createdAt` only — **no** per-thread
  reply fan-out (N+1 guard).
- `settings/org` is absent in prod → `listenSettings` yields null → fall back to
  code defaults (requiredHours 12, firstHalf 6/6, season "2026").

### File structure

```
src/features/analytics/
  AnalyticsPage.tsx        // shell: header controls + tab nav + pane
  useAnalyticsData.ts      // listeners → raw datasets (+ demo swap)
  demoData.ts              // seeded/deterministic generator, anchored to a passed-in "now"
  analytics.css            // scoped CSS variables (light/dark) + @media print
  components/
    KpiTile.tsx            // value, delta badge, sparkline
    ChartCard.tsx          // titled card wrapper w/ empty & loading states
    DeltaBadge.tsx         // ▲ / ▼ / — vs prior window
    EmptyState.tsx
    DrilldownPanel.tsx     // click-through list (e.g. unpaid plots)
  tabs/
    OverviewTab.tsx
    FinanceTab.tsx
    OperationsTab.tsx
    EngagementTab.tsx
src/logic/analytics.ts     // ALL math, pure functions
src/logic/analytics.test.ts
```

## Page chrome (shared across tabs)

- **Date range:** `This season · Last 90 days · Last 12 months · All time`.
  Every widget respects it. "This season" = calendar year of
  `settings.currentSeason` (default 2026).
- **Deltas:** each KPI compares its window against the immediately-preceding
  window of equal length ("This season" → prior season). "All time" shows no
  delta. Empty prior window renders "—", never a fake 0%.
- **Demo data toggle:** prominent "DEMO DATA" badge whenever on (including in
  print output — honesty over polish). Persisted in `localStorage`.
- **Theme toggle:** light default; dark applies a CSS-variable theme on the
  analytics root only (rest of the app untouched). Persisted in `localStorage`.
- **Print committee report:** button → `window.print()`. `@media print` rules:
  force light tokens, hide nav/controls, stack the grid, `break-inside: avoid`
  on cards, add a print-only header ("South Austin Community Garden — Committee
  Report", period label, generated date).

## Tab contents

### Overview (index)

- **KPI row (6 tiles, each with delta + sparkline):** Plot occupancy %,
  Dues collected ($ and rate), Active members, Participation rate (% of active
  members with ≥1 logged hour in window), Volunteer hours (window total),
  Waitlist depth. Sparklines plot that metric bucketed across the selected
  window (weekly buckets for Last 90 days, monthly otherwise).
- **Hero charts:** cumulative member growth (line, from `joinedAt`); volunteer
  hours by week (bars); dues collected vs outstanding (part-to-whole); plot
  status breakdown (assigned/available/reserved/inactive).
- **Activity strip:** next upcoming event + RSVP count, newest forum threads,
  open polls.

### Finance

- Dues collected vs outstanding, stacked by size tier ($35/$42/$55/$69).
- Collection-rate trend across the window.
- Deposits collected vs outstanding.
- **Season-over-season dues table** ("dues increases"): rate per size tier per
  season with % change. Real data has one season; demo shows three.
- Drill-down: clicking an "unpaid" segment opens `DrilldownPanel` listing those
  plots (holder, tier, amount) with links to `/plots/:id` and `/dues`.

### Operations (plot upkeep)

- **Upkeep tiers** per assigned plot — "needs attention" requires positive
  evidence of staleness; total absence of signals is its own honest tier
  (prod `lastWateredAt` is sparse; missing data must not read as neglect):
  - *Thriving:* fresh signal — watered ≤14 days ago OR a crop planted ≤120 days ago
  - *Okay:* crops recorded but no fresh signal (incl. crops without dates)
  - *Needs attention:* no crops recorded AND stale watering (`lastWateredAt` >30 days ago)
  - *No data:* no crops recorded AND no `lastWateredAt` at all
- Upkeep distribution chart + "needs attention" list (links to plots).
- Crop popularity (top crops across the garden).
- Split-plot utilization (whole vs A/B halves).
- Open plots vs waitlist depth.

### Engagement (participation)

- Hours-requirement cohorts vs the 12-hour rule (honoring the 6-hours-by-June
  midpoint from settings): Done / On track / Behind.
- Participation trend (distinct members logging hours per month).
- Top volunteers table (window hours, links to member pages).
- Per-event RSVP totals (yes/maybe/no) for events in window.
- Forum threads + poll votes over time.

## Demo dataset (`demoData.ts`)

- **Deterministic**: seeded PRNG (mulberry32, fixed seed) — same output every
  render/test run. "Now" is a parameter, not `Date.now()` inside the
  generator.
- ~2.5 years of history: ~70 members with seasonal join clustering, 42 plots at
  ~90% occupancy with mostly-paid dues (some unpaid for realistic charts),
  weekly hours entries with spring/fall peaks, ~30 events with RSVP counts,
  threads and polls spread over time, three seasons of dues rates showing
  increases.
- Emits the exact production TypeScript types so the logic layer can't tell the
  difference.

## Empty / loading / error states

- Skeleton loaders for tiles and charts while listeners hydrate.
- Every chart has a designed empty state ("No hours logged in this window") so
  thin real data looks intentional, not broken.
- Listener error → inline retry card scoped to the affected widget group.

## Testing

- **TDD (unit, vitest):** everything in `logic/analytics.ts` — window edges
  (inclusive bounds, timezone-stable day math), delta math incl. empty prior
  window, participation, upkeep tiering (incl. "no data" honesty rule), dues
  rollups by tier/season, demo-generator determinism (two calls, same seed →
  deep-equal).
- **Component (RTL):** KPI tile renders value/delta/"—", demo toggle swaps
  datasets, tab routing renders the right pane, empty states render, drilldown
  opens with correct rows.
- **Known jsdom caveat:** Recharts `ResponsiveContainer` measures 0×0 in jsdom —
  tests assert on card/tile semantics, not SVG internals; chart components get
  shallow smoke tests.
- No Firestore rules changes → rules suite untouched.

## Non-goals (YAGNI)

- No public/no-login demo route (screen-share covers the portfolio use).
- No Cloud Functions, no precomputed aggregates — 52 members / 42 plots is
  trivially client-side.
- No per-thread reply counts (N+1), no CSV export, no scheduled email reports,
  no member-facing analytics.

## Risks / notes

- Recharts version: install latest **React-18-compatible** release (2.x line;
  verify peer deps at install — do not pull a React-19-only major).
- Bundle: analytics chunk is lazy; main bundle size must not regress.
- Pre-existing debt, untouched: 4 failing RSVP tests in
  `CalendarPage.test.tsx` (documented, unrelated).
