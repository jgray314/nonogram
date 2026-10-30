# Mutation audit: src/views/grid.js (line-cap-300, Wave 0c-2b)

Baseline at main `67d68ff`: `npm test` 533 pass; `npm run test:ux` 51 pass, 0 fail.

Method: each mutation is one exact-string replacement in a scratch copy of the repo (never `src/` in a worktree). The script runs `node --test test/*.test.js` first and only if that passes runs `npm run test:ux`; the file is restored after each. "caught" names the first suite that failed. "SURVIVED" means both suites passed with the mutation in place. 25 mutations (the cap), weighted to the paint half and the pointer/destroy path. Line numbers are in main `67d68ff`.

Result: **25 mutations, 2 caught, 23 survived.** `renderGrid` has no unit test and the UX checks drive only the mouse path through play, so almost nothing is pinned.

| id | location | mutation | result |
|---|---|---|---|
| G1 | update:177 | `painted && v >= 1 && ...` becomes `false && ...` (no pop on newly filled cells) | SURVIVED |
| G2 | update:189 | `inks[v - 1]` becomes `inks[v]` (color cell uses the next ink's color) | SURVIVED |
| G3 | update:190 | `toggle('nng-ink', v >= 1)` becomes `toggle('nng-ink', true)` | SURVIVED |
| G4 | setClueDone:199 | row flag `rows[r]?.[k]` becomes `rows[r]?.[0]` | SURVIVED |
| G5 | setClueDone:202 | column flag `cols[c]?.[k]` becomes `cols[c]?.[0]` | SURVIVED |
| G6 | setOverlay:210 | drop `overlay?.remove()` (old overlay stays when replaced) | SURVIVED |
| G7 | setWrong:220 | drop the clear of `nng-wrong` (wrong marks accumulate) | SURVIVED |
| G8 | setHighlight:226 | drop the clear of `nng-hl` | SURVIVED |
| G9 | sweep:235 | `--sweep-i` always `'0'` (no stagger) | SURVIVED |
| G10 | sweep:237 | drop `getBoundingClientRect()` (animation does not restart) | SURVIVED |
| G11 | update:179 | pop cleanup on `animationend` becomes a no-op (`nng-pop` stays) | SURVIVED |
| G12 | highlight:249 | drop the row clear of `nng-hot` (stale hot row) | SURVIVED |
| G13 | onDown:278 | drop the `button !== null` re-press guard | SURVIVED |
| G14 | onDown:278 | drop the `!(e.button in BUTTONS)` guard (middle button starts a stroke) | SURVIVED |
| G15 | BUTTONS:17 | right button maps to `'left'` | caught (test:ux) |
| G16 | enterCell:295 | drop the same-cell dedupe | SURVIVED |
| G17 | onMove:305 | drop the `button === null` guard (hover-drag emits for touch with no press) | SURVIVED |
| G18 | onLeave:310 | drop `emit('enter', null)` on pointerleave | SURVIVED |
| G19 | onUp:314 | drop the `button === null` guard (stray up emits) | SURVIVED |
| G20 | onUp:317 | drop `button = null` (stroke never ends) | caught (test:ux) |
| G21 | onUp:318 | drop the touch `highlight(null)` after lift | SURVIVED |
| G22 | listen:325 | drop the `pointerleave` listener | SURVIVED |
| G23 | listen:329 | drop the window `pointercancel` listener | SURVIVED |
| G24 | destroy:342 | drop `removeEventListener('pointerup')` (window listener leak) | SURVIVED |
| G25 | destroy:343 | drop `removeEventListener('pointercancel')` (window listener leak) | SURVIVED |

## Survivors and suggested closing checks

None of these is on a trust boundary (the grid takes already-validated puzzle data and emits events). All are user-visible output or input handling, so under the plan's rule of thumb all should be closed or accepted in writing.

The cheapest single closer for G1-G12 is a `test/grid.test.js` block over a minimal DOM (the repo's existing helpers permit it; if there is no DOM shim, a UX check on `/` that renders a fixed `renderGrid` and asserts classes). Specific checks:

| survivors | suggested closing check | kind |
|---|---|---|
| G2, G3 | render a 2-color palette grid; assert `style.backgroundColor` and `nng-ink` on filled cells of both inks, and none on crossed/unknown | unit (DOM) |
| G4, G5 | `setClueDone({rows:[[true,false]], cols:[[false,true]]})` on a multi-number line; assert exactly the flagged chips have `nng-clue-done`, per axis | unit (DOM) |
| G6 | `setOverlay(a)` then `setOverlay(b)`; assert `a.isConnected` is false and only one overlay child; `setOverlay(null)` removes | unit (DOM) |
| G7, G8 | call `setWrong([[0,0]])` then `setWrong([[1,1]])`; assert only (1,1) carries the class; same for `setHighlight` | unit (DOM) |
| G1, G11 | `update` twice with a newly filled cell; assert `nng-pop` after the second and not the first; dispatch `animationend`, assert it clears | unit (DOM) |
| G9, G10 | `sweep` of three cells; assert `--sweep-i` values 0,1,2 and `nng-sweep` class present; the restart (G10) is only observable as an animation replay, likely an accepted survivor (no behavior a DOM test can see without layout) | unit / accept G10 |
| G12 | hover (0,0) then (1,1) via `pointerover`; assert `nng-hot` only on row 1 and column 1 | unit (DOM) |
| G13, G14 | dispatch `pointerdown` with button 1 (middle): no `down` emitted; second `pointerdown` mid-stroke: no second `down` | unit (DOM) |
| G16 | two `pointerover` on the same cell: exactly one `enter` | unit (DOM) |
| G17, G21 | touch `pointermove` with no press emits nothing; after a touch `pointerup` no `nng-hot` remains | unit (DOM) |
| G18, G22 | `pointerleave` after a hover emits `enter` with r and c null and clears `nng-hot` | unit (DOM) |
| G19 | window `pointerup` with no press emits nothing | unit (DOM) |
| G23 | window `pointercancel` during a stroke emits `up` and ends the stroke (next `pointerdown` emits `down`) | unit (DOM) |
| G24, G25 | after `destroy()`, window `pointerup` and `pointercancel` do not call `onPointer`; spy on `window.removeEventListener` | unit (DOM) |

Dispatch uses `PointerEvent` with `pointerType` set; `document.elementFromPoint` (touch path) needs a stub. If the project has no DOM shim, these need a headless-Chrome UX check instead (slower, but the browser is already there).

Notes for Wave 0e: G15 and G20 show the mouse down/up path is exercised by play-view UX checks; the survivors are the secondary paths (touch, pen, cancel, leave, teardown) and every paint method except the initial `update`. Treat G10 as an accepted survivor with the reason given above. G16 and G19 are defensive and may be harmless to the play view today (it ignores extra events), but they define the event contract for any other caller (Create, Print), so close them with the same DOM test.
