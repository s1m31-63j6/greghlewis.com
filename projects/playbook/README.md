# Playbook

A searchable, editable book of football plays for 5-, 7-, and 11-man teams.
Lives at `/projects/playbook`.

## The one idea

**A play is never stored as coordinates.** A play is a sentence in a small
vocabulary — a formation reference, a per-slot assignment for each player, and
some tags — and every coordinate is derived by `resolvePlay`. Hand-placing x/y
for 127 plays across three field sizes would have been infeasible and
unmaintainable; a compositional spec is about thirty lines of data per play and
mirrors, rescales, and re-fits itself to any variant for free.

`92 Mesh` is 32 lines of JSON with **zero coordinates** in it. `Power Right` is
six assignments and one scheme name, and produces five offensive-line paths, a
puller, a kickout, a double team with a climb branch, two stalk blocks and a
ball path.

Resolution happens at **render time, not build time**. That is what keeps
library plays and user-edited plays on one code path — bake offline and you need
a second renderer for user plays, and the two drift within a week.

## Layout

```
src/lib/playbook/          the engine, shared by the app and the offline build
  types.ts                 the type model
  field.ts                 variant table, yard <-> svg, gap anchors, landmarks
  formations.ts            resolveFormation + the formation library
  routes.ts                resolveRoute + the route library + the mesh
  blocking.ts              resolveBlocking + the scheme library
  defense.ts               fronts, coverages, pressures
  resolve.ts               resolvePlay — the single entry point
  validate.ts              no-run zones, formation legality, route depth
  search.ts                buildIndexEntry, matchPlay — one index, two callers
  geometry.ts              yards -> SVG path data
  store.ts                 DynamoDB, mirroring src/lib/telemetry/store.ts
src/app/projects/playbook/ the app
projects/playbook/         offline authoring
  src/plays/*.ts           the library, as typed TypeScript
  build.mts                validate, then emit to public/playbook/
  results/                 headless harnesses
public/playbook/           the emitted library JSON
infra/stacks/playbook_data.py
```

## Commands

```
npm run playbook:build     validate the library and emit public/playbook/
npm run playbook:check     search assertions + copy-on-write + render every play
npm run playbook:preview   write SVGs and a true-dimension 12-up print sheet
bash projects/playbook/results/roundtrip.sh    end-to-end persistence (needs npm run dev)
```

`build.mts` runs on plain Node with **no dependencies** — `--experimental-strip-types`
is enough, which is why the engine modules import each other with explicit
`.ts` extensions and `tsconfig.json` sets `allowImportingTsExtensions`. Node has
no tsconfig path mapping, so the build uses relative imports rather than `@/`.

## What the build actually checks

Reference integrity (every formation, route, scheme, front, coverage and
pressure id resolves), then a smoke resolve of **every play against every
variant it claims**. The most common authoring bug at this scale is an
assignment for a slot the formation does not have, and it fails the build rather
than the browser. Flip parity is asserted too: one check covers half the library,
and it is what caught pre-snap motion travelling the same direction on both
versions of a mirrored call.

## Copy-on-write, which the editing model rests on

Editing a library play never touches the library play. It forks into a new play
whose `lineage.rootId` points back at the original, and the original stays
exactly as it shipped. `results/copy-on-write.mts` asserts that at the document
level — the fork's id, its lineage, that the original's routes and name and
notes are unchanged, that resolving the fork does not mutate the original, and
that `public/playbook/plays.json` is byte-identical afterwards.

Only a hand-drawn path gives up its route identity, and only that one path.

## Things that were wrong and are now right

- **Motion did not mirror under flip.** `toSide` is absolute, so it has to flip
  with the play. The build harness caught it.
- **The body budget dropped the two players Mesh is about.** A player the play
  assigns now always outranks one it does not.
- **`toSide` was declared and never consumed.** Once implemented it had to be
  reconciled with route shape: route-local `+x` is *outward*, so asking an
  in-breaking route to work left flips the outward sign rather than adopting it.
- **The mesh crossed and then stopped.** On a thirty-yard-wide field the
  shallow's authored width lands both runners in the middle. They now run
  through.
- **7-on-7 was modelled with three linemen.** A passing league has a snapper and
  five eligibles; modelling it otherwise is what stopped 11-man passing concepts
  from porting over, which is the entire point of 7v7.
- **The diagram drew the full 53-yard width.** Every playbook product crops,
  because a play uses about thirty yards and drawing the other twenty-three
  makes everything tiny.
- **The dev memory store was a module variable.** Route handlers and server
  components are separate module graphs, so the API could write a playbook the
  print page then could not find.

## Not built

The league → team → coach → player permission tree, accounts, video, practice
scripts, installs and study tracking, and the 6-, 8- and 9-man variants. The
field object and `variantScope` are shaped so each is an addition rather than a
migration — `field.ts` already carries 9-man and 8-man rows.

Two numbers to re-verify against a target league's rulebook before relying on
them: 6-man's 15-yard first down varies by state association, and one 8-man
rules PDF extracted a garbled "40 yards for a first down" that is almost
certainly the field width.
