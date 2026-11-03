---
name: migration
description: Discovery strategy for a rewrite of a legacy system with parity as the bar
---

# Migration Mode

A rewrite of a legacy system. The bar is parity with the legacy system, plus approved deviations.

The legacy repo is read-only. Do not write to it.

## Process

1. Read `manifest.yaml`. Find the `migration` block and the legacy repo.
2. Make the unit inventory:
   - With an adapter (`migration.adapter` is set): run `haren migrate inventory`. It writes `artifacts/02-discovery/unit-map.md`. No module exists yet, so it registers no unit status. The decompose phase does that.
   - Without an adapter: list the units from the legacy source. Write `unit-map.md` from the `unit-map.md` template. Do not run `haren track unit` yet: the modules do not exist before the decompose phase.
3. Group the units into modules:
   - Put units of the same family in the same module.
   - Put units that write the same tables in the same module.
   - A parent unit travels with its popups. Never split a popup from its parent.
4. Write the module of each unit into the Module column of `unit-map.md`. Do not run `haren migrate inventory` again here. The decompose phase creates the modules and registers the units.
5. Record the shared components (tables and routines that units in more than one module use).
6. Make sure that the semantics rulebook exists:
   - If `artifacts/01-research/legacy-semantics.md` is missing, copy the semantics file of the adapter plugin. Find its path in the plugin's `haren-plugin.json`, key `adapter.semantics`, inside the installed plugin folder.
   - If there is no adapter, start from the `legacy-semantics.md` template.
   - Get the next artifact ID with the `resolve-next-id` skill. Register it: `haren track artifact <id> --type legacy-semantics --path artifacts/01-research/legacy-semantics.md`.
7. Write the context brief. Include the legacy stack, the unit counts per family, the shared components, and the suggested modules.
   - Register it: get the next artifact ID with the `resolve-next-id` skill. Run `haren track artifact <id> --type context-brief --path artifacts/02-discovery/context-brief.md`.
8. Run `haren track check`. Then go to the `decompose` phase.

## Output

- `artifacts/02-discovery/unit-map.md`
- `artifacts/02-discovery/context-brief.md`
- `artifacts/01-research/legacy-semantics.md`
