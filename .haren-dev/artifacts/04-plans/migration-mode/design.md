---
module: migration-mode
date: 2026-11-02
status: draft
---

# Design: migration mode

A fifth haren mode for rewrites of legacy systems where 1:1 parity with the live legacy system is the acceptance bar. The core owns the lifecycle, the artifacts and the gates. A per-technology **adapter** plugin owns parsing and checking of the legacy source.

Source: field feedback from a team that migrates a legacy system. No client names, screen IDs, tables or domain terms may appear in haren, in its examples or in its commits.

## Architecture Overview

```
core (haren)                                adapter plugin (per technology)
-------------------------------------       ---------------------------------
mode: migration in manifest.yaml            haren-plugin.json → "adapter" block
progress.json v3: modules.*.units           commands: inventory / extract / gate
haren track unit                            skill: spec writer
haren migrate inventory|extract|gate  ───▶  rules/legacy-semantics.md
templates + skills + gates
```

- The core never knows the legacy technology. It calls adapter commands and validates their JSON output.
- Every adapter command is optional. A missing command means a manual step. Manual mode (no adapter) keeps the same lifecycle.
- Client-specific adapters live in the client's private repo. haren ships only the contract and a neutral sample adapter.

## Existing Code

| Table / side effect | Existing writer or caller (file:line) | Verdict | Note |
|---|---|---|---|
| repo roles | `apps/cli/src/workspace/manifest.ts:5` `RepoRole` | extend | add `legacy`, add `readOnly` to `RepoEntry` |
| progress schema + migration | `apps/cli/src/workspace/progress.ts`, `progress-migrate` tests | extend | v2 → v3 adds `units` |
| status transitions | `apps/cli/src/workspace/progress.ts:75` transition table | extend | add unit transition table, module gates |
| tracking CLI | `apps/cli/src/commands/track.ts` | extend | add `track unit`; `track check` gets migration checks |
| code gate hook | `apps/cli/src/workspace/root-files.ts:105`, `brainstorm-gate.ts` | extend | block writes to `readOnly` repos, even with override |
| plugin manifest | `apps/cli/src/plugins/manifest.ts:5` `HAREN_API = "1"` | extend | `harenApi` "2" adds optional `adapter` block |
| plugin runner | `apps/cli/src/plugins/runner.ts:124` runs hooks with `sh -c` | do not reuse for adapters | adapter commands need argv split with substituted placeholders; add a small adapter runner using `Bun.spawn(argv)` |
| discover strategies | `content/skills/discover/*.md` | extend | add `migration.md` |

## Data Model

### manifest.yaml

```yaml
mode: migration
repos:
  legacy_src: { path: ../legacy_src, role: legacy, readOnly: true }
  backend:    { path: ../backend,    role: backend }
  frontend:   { path: ../frontend,   role: frontend }
migration:
  adapter: sample            # plugin name; empty = manual
  unitId: '^SCR_[A-Z]\d{3}(_P\d+)?$'
  parentOf: '_P\d+$'         # a popup travels with its parent screen
  acceptance: parity-with-approved-deviations   # parity | parity-with-approved-deviations
  liveLegacy: true
```

### progress.json v3

```json
"modules": { "order-entry": {
  "status": "planned",
  "units": { "SCR_A001": "spec-approved", "SCR_A001_P1": "spec-draft" }
}}
```

- Reading v2 migrates to v3 with `units: {}` on every module.
- Unit statuses, in order: `inventoried`, `extracted`, `spec-draft`, `spec-approved`, `built`, `verified`, `parity-signed`.
- Side statuses: `blocked` (from any status, back to the previous one) and `static-review-only` (instead of `verified` when the live legacy system was not used).
- There is no `deviated` status. Deviations are rows in `deviation-log.md`; a unit with approved deviations still ends at `parity-signed`.

### Owned (write)

`progress.json`, `events/events.jsonl`, `artifacts/02-discovery/unit-map.md`, `artifacts/02-discovery/units/<unit>/*`, `artifacts/_registry/artifact-index.md`.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|---|---|---|---|
| D1 Where unit status lives | `progress.json` `units`, set by CLI | artifact frontmatter; adapter-owned state | state that agents must remember drifts (the index drift feedback) |
| D2 Deviation as status | no; rows in `deviation-log.md` | `deviated` unit status | a unit usually has 1-2 deviations and is parity elsewhere |
| D3 How core calls adapter | commands for deterministic steps, skill for spec writing | commands only; skills only | skills only cannot be enforced; commands only cannot write specs |
| D4 Adapter scaffold (`haren adapter new`) | out of scope | build now | YAGNI until a second adapter exists |
| D5 Where the reference adapter lives | neutral sample in haren; real adapters private | a generic real-technology adapter in haren | rules and parsers come from a real project; leak risk |
| D6 Who sets `extracted` / `spec-approved` | `haren migrate` when the adapter has the command; `track unit` only in manual mode | always manual | agents must not mark a unit approved without the gate |

## CLI

| Command | Effect |
|---|---|
| `haren track unit <module> <unit> <status>` | Transition with order check. Refuses `extracted` and `spec-approved` when the adapter declares `extract` / `gate`. |
| `haren migrate inventory` | Runs `adapter.inventory`; creates or updates `unit-map.md`; adds new units as `inventoried`. Units that disappeared are reported, not deleted. |
| `haren migrate extract <unit>` | Runs `adapter.extract`; files go to `artifacts/02-discovery/units/<unit>/`; sets `extracted`. |
| `haren migrate gate <unit>` | Runs `adapter.gate`; writes `gate.json`. PASS asks for human approval (or `--approve`), then sets `spec-approved`. FAIL prints findings and keeps `spec-draft`. |

Module gates:

- `track status <module> planned` fails while a unit of the module is below `spec-approved`.
- `track status <module> completed` fails while a unit is below `parity-signed`.

`track check` in migration mode also fails when:

- no repo has `role: legacy`, or the `migration` block is missing;
- a unit in progress.json does not match `migration.unitId`;
- a unit at `spec-approved` or later has no `gate.json` with `pass: true` (adapter mode only).

Hook: the code gate blocks Edit/Write in a repo with `readOnly: true`. Gate override does not lift this block.

## Adapter Contract (harenApi "2")

```json
"adapter": {
  "unitKind": "screen",
  "commands": {
    "inventory": "bun tools/inventory.ts --root {legacyRoot}",
    "extract":   "bun tools/extract.ts {unit} --root {legacyRoot} --out {unitDir}",
    "gate":      "bun tools/gate.ts {specPath} --ir {unitDir}"
  },
  "skills": { "spec": "sample-spec" },
  "semantics": "rules/legacy-semantics.md"
}
```

- Placeholders: `{legacyRoot}`, `{unit}`, `{unitDir}`, `{specPath}`. The CLI passes each value as one argument (argv split, no shell string concatenation).
- `{unit}` must match `migration.unitId` before the command runs.
- stdout schemas, validated by the CLI:

```jsonc
// inventory
{ "units": [ { "id": "SCR_A001", "parent": null, "family": "order", "title": "Order list" } ] }
// extract
{ "unit": "SCR_A001", "files": ["ir.json", "view.txt"] }
// gate
{ "unit": "SCR_A001", "pass": false,
  "findings": [ { "severity": "error", "rule": "missing-binding", "message": "..." } ] }
```

- Non-zero exit = adapter error. Output that does not match the schema = adapter error. Both differ from a gate FAIL, and the CLI reports them differently. No status changes on an adapter error.
- On install, `semantics` is copied to `artifacts/01-research/legacy-semantics.md` only when that file does not exist. The project owns the copy after that.

## Artifacts and Templates

| Template | Location | Content |
|---|---|---|
| `unit-map.md` | `02-discovery/` | unit, parent, family, module, shared components |
| `unit-spec.md` | `02-discovery/units/<unit>/spec.md` | technical spec per unit; manual gate checklist when no adapter |
| `legacy-semantics.md` | `01-research/` | rulebook of source-platform traps |
| `deviation-log.md` | `03-modules/` | `DEV-NNN`, unit, legacy behavior, target behavior, reason, approver, date, `approved`/`revoked` |
| `parity-evidence.md` | `06-evaluation/parity-evidence/<unit>-<n>.md` | environment (same user, tenant, locale on both), steps, legacy result, target result, evidence, verdict |

`03-modules/{module}/spec.md` links the unit specs and does not restate them.

## Skills

- `discover/migration.md`: inventory (adapter or manual), group units into modules, write `unit-map.md` and the context brief, then `decompose`.
- `extract` (new, per unit, between decompose and plan): `haren migrate extract`, adapter spec skill (reads `legacy-semantics.md` first) or template, `spec-draft`, `haren migrate gate` until PASS, human approval.
- `plan`: in migration mode reads unit specs and `deviation-log.md`; the reuse inventory includes every table the legacy unit writes.
- `implement`: reads `deviation-log.md` before each task; never reverts an `approved` deviation; sets `built` per unit.
- `evaluate`: runs the unit checklist; sets `verified` or `static-review-only`. Each difference closes only by a fix, a `parity-evidence` file, or an `approved` deviation row. BA sign-off sets `parity-signed`.
- `validate-artifact`: rules for unit spec, `deviation-log`, `parity-evidence`.
- `read-context` / `skill.md`: show unit counts per status for migration workspaces.

## Sample Adapter

`examples/adapters/sample/` in the haren repo:

- Fake legacy format: one `.screen.xml` per screen with fields, bindings and written tables.
- Fixture: `SCR_A001`, `SCR_A001_P1`, `SCR_B001`; tables `ORDER_TBL`, `ORDER_LOG`.
- Bun/TypeScript tools; no Python.
- Skill `sample-spec` and a fake `legacy-semantics.md` with 2-3 rules.
- Before each commit: grep the diff for client names and terms; the result must be empty.

## Testing

- Unit: unit transitions, v2 → v3 migration, module gates, adapter output schema validation, argv placeholder handling, hook block for `readOnly` repos with and without override, `track check` migration rules.
- E2E: temporary workspace + sample adapter: `inventory → extract → spec → gate FAIL → fix → gate PASS → spec-approved → module planned`.
- Agent run: `verify-with-agent` on the sample workspace.

## Scope

In:

1. Manifest, progress v3, `track unit`, readOnly hook, `track check` migration rules.
2. `haren migrate inventory|extract|gate` and the adapter contract.
3. Templates, `discover/migration.md`, `extract` skill, updates to plan, implement, evaluate, validate-artifact, read-context.
4. Sample adapter and tests.
5. README and README.vi.

Out: `haren adapter new`; real technology adapters; portal UI for units.

## External Dependencies

- None new. Bun YAML and `Bun.spawn`.
