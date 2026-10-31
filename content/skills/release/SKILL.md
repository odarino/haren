---
name: release
description: Plan the release order across completed modules and record each module as released
type: sequential
agent: architect
---

# Release

Write one release plan for the modules that are ready to ship. The plan gives the order of the steps across modules and repos, for example DB migration → backend → mobile → web. Then record each module as `released` after the user confirms the deployment.

<HARD-GATE>
Never deploy, push, tag or run a migration yourself. The user runs each deploy step. Run a deploy command only when the user asks you to run that exact step.
</HARD-GATE>

## Inputs

- `progress.json` — module status and the `dependencies` map
- `manifest.yaml` — `repos` with `path`, `default_branch` and `role`
- `artifacts/03-modules/module-map.md` and each `artifacts/03-modules/{module}/module.md`
- `artifacts/04-plans/{module}/design.md` — data model changes, migrations, external dependencies
- `artifacts/06-evaluation/{module}/` — reviews (every feature must pass)

## Process

1. Run read-context skill to orient
2. List the modules in status `completed`. Ask the user which of them go into this release
3. For each selected module, check:
   - Every feature is `passing`
   - The module branch is merged into each repo's `default_branch`, or the user tells you the merge plan
   - Each dependency (progress.json `dependencies`) is released or is in this release
   Report each failed check. Do not continue until the user decides
4. Build the release order:
   - Follow the `dependencies` map: a module comes after the modules it depends on
   - Inside that order, use this default by kind of step: DB migration → shared packages → backend → mobile → web → feature flags or config
   - A backend change that breaks old clients needs a note: old mobile versions stay in use after the release
5. For each step, fill in: module, repo key, branch or tag, preconditions, deploy command, verify command, rollback, owner. Read the deploy and verify commands from the repo (scripts, CI files, README). If you cannot find one, write `ask the user` and ask
6. Present the order to the user as a table. Ask "does this order look right?" Change it until the user approves
7. Write `artifacts/03-modules/release-plan.md` from `templates/release-plan.md` with create-artifact skill. If the file exists, add a new release section at the top. Do not remove old releases
8. Register it: `haren track artifact <id> --type release-plan --path artifacts/03-modules/release-plan.md`

## During the release

For each step, in order:

1. Tell the user the step, its preconditions and its deploy command
2. Wait for the user to run it (or to ask you to run it)
3. Ask the user to confirm the verify result
4. Record it: `haren track event release-step --module <module> --phase release --data '{"step":<n>,"repo":"<repoKey>","result":"ok"}'`
5. If a step fails, stop. Show the rollback for this step and for the steps before it that depend on it. Record `result` as `failed`. Ask the user what to do

After the user confirms that all steps of a module are deployed, run `haren track status <module> released`.

## Rules

- One release plan file for all modules: `artifacts/03-modules/release-plan.md`
- Never deploy, push, tag or migrate unless the user asks for that exact step
- Every step has a rollback. If a step has no safe rollback (for example a destructive migration), mark it and ask the user to approve it
- Set `released` only after the user confirms the deployment
- Change status and events only with `haren track` (see update-tracking skill)
- Fixtures, seed data and examples in the plan use synthetic data only
