# React 19 and UI SDK: what was measured, and what changed

27 November 2026. The ask: adopt Vercel's UI SDK in brandi's product kit, upgrade to React 19, test
everything, and only ship it if it measures better. Each call below was made without a check-in
(the owner was away and asked for none) and is listed here so it can be reviewed.

## What was found

**React 19 is already in place where brandi can choose.** The kit and the Next.js starter run React
19.3.1. The canvas build runs on React 18.3.1 because the Design canvas host supplies it.
`dc-runtime.js` ships the React and ReactDOM 18.3.1 UMD builds and reads `window.React` on every
call. `tools/build-canvas.mjs` sends every React import to that global. A bundle carrying its
own React 19 fails on the runtime (`Cannot read properties of null (reading 'useContext')`), and so
does swapping `window.React` after it boots. brandi's own 18.3.1 pins (`pagereact.mjs`,
`productds.mjs`, `productgates.mjs`) copy the host so local previews behave as the canvas does.
They stay as they are: bumping them would make previews pass while the real canvas breaks.

**UI SDK can't replace Radix in the kit yet.**

- `@ui-sdk/react` (0.1.0-beta.18) needs React 19 or later, so it can't render on the canvas.
- A trial port of Switch, Popover and Select on React 19 boards passed 73 checks and failed 38.
  Radix passes all 111 of those checks.
- On React 18 boards, even with an adapter, 56 checks passed.
- The `@ui-sdk/web` route (custom elements inside kit components) is the only one that ran on the
  canvas. It was put through a go/no-go gate (below).

**Licence: CISO review needed before any adoption.** The npm packages are Apache-2.0. The
project's README also puts it under Vercel's public beta terms, which limit use to the beta period
and internal use, require a Vercel account and bar redistribution. Their section 3 carves open
source components out to their own licence. brandi is a public tool, so which terms bind it is a
vendor question for the CISO. Until that's answered, no UI SDK code goes into the kit or into any
built bundle.

**shadcn has no UI SDK base yet.** shadcn 4.23.1 lists Base UI, React Aria and Radix as bases.
shadcn has said a UI SDK base is coming.

## What changed in this branch

1. **Security advisories.**
   - Next.js 16.4.3 to 16.4.6 fixes the seven open Dependabot alerts.
   - The shadcn CLI 4.22.2 to 4.23.1 fixes a minimatch advisory, GHSA-g3hv-75wg-m249, which came
     in through ts-morph.
   - npm audit on a fresh lockfile of the kit: 0 vulnerabilities.
2. **CI actions.** These are the three bumps Dependabot proposed in #3, #4 and #5. Those pull
   requests closed when their branches were force-pushed.
3. **Agent-ready checks in the gates.** `axe-pages.mjs` now reports two things:
   - `row-control-unnamed`: a control repeated in two rows that doesn't name its row.
   - `destructive-dialog-undescribed`: a dialog with a destructive button and no description.

   Run over all 204 kit previews, these found two cases in the kit's own components, and both are
   fixed. One was the DataTable sticky example's links. The other was the Undo and close buttons
   when two toasts show.
4. **The system as a shadcn theme.** `brandi product theme` writes a `registry:theme` item that
   `npx shadcn add` applies to any shadcn project, whatever primitives sit under it. When shadcn
   ships a UI SDK base, a brandi system already dresses it.

## The bar for "better", and the numbers

Both sides ran on the same machine, with the same kit modules and the same canvas runtime file
(`BRANDI_DC_RUNTIME`, so no canvas test skipped). Chrome 158 on this Mac writes its output and then
exits 2 ("Teardown watchdog expired"). A test-only wrapper maps that one exit to 0 on both sides.

| | Before (product-system) | After (this branch) |
|---|---|---|
| brandi suite | 2,350 of 2,351 | 2,357 of 2,357, none skipped |
| Kit advisories (npm audit, fresh lockfile) | 5 moderate: next (the 7 Dependabot alerts), and minimatch through shadcn | 0 |
| A starter's first `next build` | exits 1, `SecurityFatalError` (Next 16.4.3) | exits 0 (Next 16.4.6) |
| Agent-ready findings on the kit's 204 previews | 4, unreported | 0, and the gates now report them |
| Kit catalogue (`try.mjs`, every component) | 1,095 of 1,095 | 1,095 of 1,095 |
| New rules: 204 component previews | 4 findings, unreported | 0 |
| New rules: starter routes (15 routes, 3 widths, 2 themes) | not checked | 90 pages, 0 |
| New rules: the system's generated boards | not checked | 50 renders, 0 |
| shadcn theme | none | schema-valid, applied by `shadcn add` |

## The UI SDK gate

The question: could `@ui-sdk/web` inside the kit's components match Radix on the existing checks,
left unchanged, on the canvas host (React 18.3.1) and on React 19, from the same component source?
It was tried on Switch, Popover, Select, Combobox, Toggletip and DatePicker. The bar was that every
user-facing guarantee passes on both renderers, with failures allowed only in checks that test
where Radix puts things in the DOM, and the starter builds clean.

**Verdict: no-go.**

| Component | Radix | UI SDK web | UI SDK web, Radix-only selectors swapped |
|---|---|---|---|
| Switch | 8/8 | 8/8 | 8/8 |
| Popover | 8/8 | 5/8 | 8/8 |
| Select | 17/17 | 14/17 | 16/17 |
| Combobox | 19/19 | 10/19 | 14/19 |
| Toggletip | 7/7 | 2/7 | 6/7 |
| DatePicker | 15/15 | 9/15 | 12/15 |
| Total | 74/74 | 48/74 | 64/74 |

The same results came out on both renderers.

User-facing guarantees that fail on the unchanged checks:
- Combobox: Escape doesn't close the list at once, and the next Escape is swallowed.
- Combobox: leaving the field keeps a choice the field no longer shows.
- DatePicker: Tab from the end of the calendar loses focus and leaves it open.

Found outside the checks:
- Toggletip: the Escape that closes it also reaches the page.
- DatePicker: the trigger's `aria-expanded` lands on a wrapper, not the button.
- Select: while the list is open, the rest of the page stays exposed to screen readers.

In the Next starter:
- The /kit page threw a hydration error (React #418) on 5 of 5 production loads, against 0 of 5
  for Radix.
- With scripts off, the first paint sends a bare `<ui-switch>`, with no role, no state and no
  track colour. Radix sends `<button role="switch" aria-checked>`.

Bundle cost:
- Three UI SDK primitives add 69 KB gzipped to the canvas bundle.
- They add 53 KB gzipped to the starter's first load, while Radix stays for everything else.

Some of these failures may be gaps in a time-boxed adapter rather than limits of UI SDK. The
first-paint gap comes from custom elements only taking their roles when their script runs. The
hydration error is inferred, not proven, to come from the same cause: UI SDK writes the chosen
label into `<ui-select-value>` when it upgrades, before React hydrates an element it rendered empty.
The experiment's files stay out of this branch.

While building a starter for that experiment, Next.js 16.4.3 refused the first `next build` with
`SecurityFatalError` (a known vulnerability) on both sides. On 16.4.6, from this branch, the first
build exits 0. So the Next.js bump also fixes a broken first build in every product starter.

## Left for later

- Porting the kit to UI SDK waits on the CISO's call on the terms, a gate that passes, and ideally
  a canvas host on React 19 or shadcn's UI SDK base. The ported files and the measurements stay in
  the experiment, not in this branch.
- `checkPattern` from `@ui-sdk/core`, as a dev-only ARIA check, has the same licence question.
- A `--ui-*` variable alias block: nothing reads one yet.
