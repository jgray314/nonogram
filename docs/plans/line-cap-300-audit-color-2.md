# Mutation audit: src/color.js, second half (the pixel path)

Lane 0e-2 of docs/plans/line-cap-300.md. Baseline commit 92e9b8e. The first audit (line-cap-300-audit-color.md) stopped after C47. This sweep ran C48 to C98 on the later pixel path: histogram bins and order, the seeds, the weighted Lloyd loop, the merge, the cell vote and the cell mean option, the final ordering. Each mutation was applied one at a time in a scratch copy of the repo (exact-string replacement, never in the worktree) and run against `test/*.test.js` (without `docs_claims`, `public_docs`, `lint_rules` and `lint_size_cap`, which need the real repo and node_modules) plus the new `test/linecap_color.test.js`. `test:ux` was not run.

Numbers: 51 mutations (C48 to C98). Run against the existing tests alone, 28 were caught and 23 survived (C49, C53, C54, C58, C65, C67, C68, C69, C73 to C77, C80, C81, C84 to C87, C93, C96, C97, C98). The new tests close 15 of the 23; the other 8 are accepted below. The table's last column is the result with the new tests added.

| id | mutation | result after the new tests |
|---|---|---|
| C48 | binKey red shift `<< 8` to `<< 4` | caught |
| C49 | binKey green shift `<< 4` to `<< 3` | caught (new: bins differing in the green nibble alone) |
| C50 | histogram: drop `.sort` by key | caught |
| C51 | histogram sort reversed | caught |
| C52 | `bin.n += 1` to `+= 2` | caught |
| C53 | histogram y step 1 | caught (new: big-crop palette grid) |
| C54 | histogram x step 1 | caught (new) |
| C55 | bin mean not divided by n | caught |
| C56 | 'heavy' seeds sorted ascending | caught |
| C57 | 'heavy' `.slice(0, k - 1)` | caught |
| C58 | vivid divisor `/ 50` to `/ 25` | caught (new snapshot: vivid) |
| C59 | seed pick `>` to `>=` | caught |
| C60 | `while (out.length <= k)` | caught |
| C61 | falloff without `1 -` | caught |
| C62 | `SEED_FALLOFF ** 2` to `SEED_FALLOFF` | caught |
| C63 | Lloyd sum unweighted | caught |
| C64 | Lloyd count `+= 1` | caught |
| C65 | `s[3] >= 0` (keep empty clusters) | accepted |
| C66 | movement threshold `1e-6` to `1e6` | caught |
| C67 | drop `if (!moved) break` | accepted |
| C68 | drop `next.length !== c.length` | accepted |
| C69 | `nearest` tie `<=` | caught (new snapshot: tie + saturate) |
| C70 | default seed 'heavy' | caught |
| C71 | default cell 'mean' | caught |
| C72 | default saturate 1.1 | caught |
| C73 | merge weights count 1 per bin | caught (new snapshot: merge weights) |
| C74 | merged centre unweighted | caught (new snapshot: mean) |
| C75 | `\|\| 1` to `\|\| 0` | accepted |
| C76 | merge tie `d <= best.d` | accepted |
| C77 | merged centre placed first | caught (new snapshot: merged) |
| C78 | palette sum unweighted | caught |
| C79 | palette from Lab centroids | caught |
| C80 | saturate not applied to a | caught (new snapshot: saturate) |
| C81 | assign against Lab centroids, not stored colors | caught (new snapshot: stored) |
| C82 | vote cache key constant | caught |
| C83 | cell mean `n = 1` | caught |
| C84 | vote loop y step 1 | caught (new: vote sampling) |
| C85 | vote loop x step 1 | caught (new) |
| C86 | vote tie `>=` | caught (new snapshot: saturate) |
| C87 | final sort without `\|\| a - b` | accepted (EQ: stable sort) |
| C88 | final sort tie `b - a` | caught |
| C89 | keep zero-count palette entries | caught |
| C90 | blank from palette entry 0 | caught |
| C91 | `order.slice(0)` | caught |
| C92 | one-colour palette fallback `[]` | caught |
| C93 | binKey of floor, not round (histogram) | caught (new snapshot: stored, alpha pixels) |
| C94 | alpha divisor 256 | caught |
| C95 | default vivid 1 | caught |
| C96 | binKey of unrounded colors | caught (new snapshot: stored) |
| C97 | `s[3] > 1` in the palette mean | accepted |
| C98 | mulberry divisor `4294967295` | accepted |

## Accepted (8)

C65, C67, C68, C75, C76 and C97 were searched for a difference on 4000 random strips each (6 to 12 pixels, 2 to 4 base colors, noise, some with alpha, random k, seed, cell, saturate and vivid) and none was found. C98 was searched on 3000 random cell grids through `quantizeColors` (the only user of the generator) with no difference; C87 is equivalent by reasoning. Boundary: none visible to a user.

- **C65** (EQ in practice): an empty cluster needs two equal bin means; bins are disjoint colour boxes, so seeds are distinct.
- **C67**, **C68**: the loop is a fixed point once nothing moves, so running the extra pass (or testing the count) cannot change the result; only the cost.
- **C75**: `|| 1` guards `w[i] + w[j] === 0`, and a centre with no bin nearest is not reachable after seeding.
- **C76**: needs two pairs at exactly equal Lab distance.
- **C87**: stable sort over an index-ordered list.
- **C97**: a one-pixel cluster's Lab centroid and its pixel's Lab give the same stored colour.
- **C98**: the seeded random generator in the D25 research path (`quantizeColors`); a divisor change of 2e-10 relative does not move a pick on any image tried.

## Notes

- The snapshots in `test/linecap_color.test.js` marked "snapshot" are taken from the current code. They were found by searching random small strips for ones on which the listed mutation changes the result, so they fail on that change. They are not hand-derived.
- Survivors from the first audit (C02 to C47) are closed in the same file; their mutation table is in the lane report.
