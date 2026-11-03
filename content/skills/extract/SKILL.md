---
name: extract
description: Extract each legacy unit into a technical spec and pass the spec gate
type: sequential
agent: researcher
---

# Extract

Turn each legacy unit into an approved unit spec. Run this phase after `decompose` and before `plan`.

<HARD-GATE>
Never set `spec-approved` without user approval.
</HARD-GATE>

## Process

Do these steps for each unit of the module:

1. Get the legacy source of the unit:
   - With an adapter: run `haren migrate extract <unit>`. The files go to `artifacts/02-discovery/units/<unit>/`.
   - Without an adapter: read the legacy source. Run `haren track unit <module> <unit> extracted`.
2. Read `artifacts/01-research/legacy-semantics.md` first.
3. Write `artifacts/02-discovery/units/<unit>/spec.md`:
   - With an adapter: use the adapter skill named in the plugin's `haren-plugin.json`, key `adapter.skills.spec`.
   - Without an adapter: use the `unit-spec.md` template.
4. Run `haren track unit <module> <unit> spec-draft`. Get the next artifact ID with the `resolve-next-id` skill. Register the spec now, before approval: `haren track artifact <id> --type unit-spec --path artifacts/02-discovery/units/<unit>/spec.md --module <module>`. Then `haren track check` passes while the unit waits for approval.
5. Run `haren migrate gate <unit>`. Fix the spec for each finding. Run the gate again until it shows PASS. Exit code 3 means the gate passed but the user did not approve yet. Go to step 6. Do not treat it as a failure.
6. Show the spec and the gate result to the user. Wait for approval.
7. Only after the user approves:
   - With an adapter: run `haren migrate gate <unit> --approve`.
   - Without an adapter: tick the Manual gate section of the spec. Then run `haren track unit <module> <unit> spec-approved`.
8. Update the artifact row: run the same `haren track artifact <id> ...` command with `--status approved`.

## Rules

- A unit in `blocked` status skips the `gate.json` check in `haren track check`. Before approval work, move the unit back to its previous status with `haren track unit <module> <unit> <status>`.
- Never write into the legacy repo (`readOnly: true`). The gate blocks Edit and Write there. For Bash commands, the guard is best effort only, so do not use the shell to change legacy files. Keep the legacy repo read-only at the filesystem or git level where possible.
- When you find a new platform trap, add a row to `legacy-semantics.md`.
- The module spec links the unit specs. It does not restate them.
- Do not write code in this phase.
