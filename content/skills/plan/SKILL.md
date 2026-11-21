---
name: plan
description: Create spec, design, and task breakdown for a module
type: sequential
agent: planner
---

# Plan

Create a complete, actionable plan for implementing a single module.

## Process

1. Read module definition: `artifacts/03-modules/{module}/module.md`
2. Read module spec (BA-owned): `artifacts/03-modules/{module}/spec.md` — this has requirements, user stories (STORY-IDs), and acceptance criteria. Check the Changelog table for recent changes.
3. Read architecture overview: `artifacts/03-modules/architecture.md` — this has system-level decisions (deployment, DB, comms patterns) that constrain your design
4. Read context brief: `artifacts/02-discovery/context-brief.md`
5. Read any relevant research: `artifacts/01-research/`
6. Check dependencies: are dependent modules' interfaces defined?
7. **Migration mode only** (`mode: migration` in manifest.yaml):
   - Read the unit specs of the module: `artifacts/02-discovery/units/<unit>/spec.md`
   - Read `artifacts/03-modules/deviation-log.md`
   - The reuse inventory (Step 4) includes every table and side effect in the Writes section of each legacy unit
   - Each task references its unit IDs (for example SCR_A001) as well as its STORY-IDs

### Step 4: Reuse inventory (before decisions and tasks)

<HARD-GATE>
Do not write design.md or tasks.md before the reuse inventory is done.
A plan that builds behavior which already exists in a target repo is a defect.
</HARD-GATE>

0. Read `artifacts/03-modules/component-catalog.md`. If it does not exist and a target repo has code, run the collect-components skill (full scan) first. Use the catalog entries as the first candidates for reuse
1. List every table the module writes and every side effect it triggers (notification, SMS, mail, file, external API, audit log, numbering)
2. For each item, search ALL target repos in manifest.yaml `repos`. Do not stop at the module's own package or at class names that match the screen name. Search by table name, by side effect (for example `send`, `notify`, `mail`), and by the shared service folders
3. Record each hit with `file:line` and one verdict: reuse, extend, supersede or duplicate. Record "none found" with the search command that you ran
4. Read the hits that are a shared service. Check its doc comment for a caller/shared split
5. List the UI components, shared services and shared functions from the catalog that the module will use. Put the result in the `## Existing Code` section of design.md. Tasks must use the verdicts: no task builds a "reuse" item again
6. If the inventory is large, also write it as a research artifact `artifacts/01-research/{module}-reuse-audit.md` and link it from the design

### Step 5: Gather decisions BEFORE writing artifacts

<HARD-GATE>
Before writing any artifact, identify all decision points in the module and
resolve them with the user. Do NOT write spec.md or design.md with assumptions.
Decision points include technical decisions (database, framework, auth, APIs)
and UI/UX decisions (screen layout, navigation, empty and error states, how
content is grouped). If the module adds or changes screens, the user picks one
mockup option per changed screen before you write the spec or the design.
</HARD-GATE>

**Decision gathering process:**
1. List all decisions this module requires:
   - Technical: database, framework, auth, APIs, etc.
   - UI/UX: one decision for each screen that the module adds or changes
2. For each decision, check if it's already resolved:
   - Specified in context-brief.md → use it, no need to ask
   - Specified in module definition → use it, no need to ask
   - Decided in a research artifact → use it, no need to ask
   - Not specified anywhere → **must ask the user**
3. For each unresolved decision, present 2-3 options:
   - Option name
   - One-line trade-off
   - Your recommendation and why
4. **One question at a time** — don't dump all decisions in one message
5. Document each decision in the design artifact with rationale

**UI decisions (only if the module adds or changes screens):**
1. Read `ui.mockups` in `manifest.yaml` (`ask` | `ascii` | `browser` | `artifact`, default `ask`). On `ask`, follow the offer in the generate-mockup skill
2. List the changed screens from the spec, the module definition and the stories
3. For each screen, use the `generate-mockup` skill in options mode. Make 2-3 labeled options (A, B, C). Give each option a one-line trade-off and mark your recommendation
4. Show the options:
   - ASCII path: show the options side by side in one message
   - Browser path: push the options screen with the visual-companion skill. Read the click from `state_dir/events`. Confirm the choice with the user in the terminal
5. ASCII path: ask the user to pick one option. Both paths: one screen at a time
6. Record the chosen option and the rejected options with the reason in the `## Screens` section of the design. Add the same to the `## Screens` section of the spec, and add a Changelog row for that spec edit
7. After the choice, run the `ui-review` skill on the chosen option. Write the findings table under `## UI Review` in the design. In the browser path, also push the `.findings` screen
8. **Caution:** a blocker stops the module. Fix each blocker in the mockup and run the `ui-review` skill again, or write "accepted by user" in the Fix column, before the module goes to `planned`

**Example flow:**
```
You: "For the auth module, I need to decide on a few things.
     First: what database should we use?
     A) PostgreSQL — battle-tested, great for relational data
     B) SQLite — simple, no server needed, good for small-medium scale
     C) MongoDB — flexible schema, good for rapid iteration
     I'd recommend A for this use case because [reason]. What do you think?"

User: "go with A"

You: "Got it, PostgreSQL. Next: for authentication strategy..."

You: "The module changes the Post detail screen. Here are 3 options:
     A) One long text — simple, but long posts are hard to scan
     B) Parts as separate cards — clear parts, more scrolling
     C) Parts joined by a connector line — shows the thread, more work
     [mockups A, B, C side by side]
     I'd recommend B because [reason]. Which one?"
```

### Step 6: Write artifacts (after all decisions are resolved)

Write three artifacts (use create-artifact skill for each):

#### Spec (what to build) — BA-owned
Location: `artifacts/03-modules/{module}/spec.md`

The spec is owned by the BA and should already exist before planning begins. If it doesn't exist yet:
- Create it using `templates/spec.md` in `artifacts/03-modules/{module}/spec.md`
- Include requirements, user stories (with STORY-IDs), acceptance criteria, interface contracts

If it already exists, **do not overwrite** — read it and base your design and tasks on it. If you find gaps or ambiguities in the spec, flag them to the user rather than filling in assumptions.

#### Design (how to build it)
Write to: `artifacts/04-plans/{module}/design.md` (master — always written here)

Using `templates/design.md`:
- Architecture overview
- **Existing code** (from the reuse inventory in Step 4)
- Data model
- **Key technical decisions with rationale** (from step 5 — include what was chosen and why)
- **Screens** (if the module adds or changes screens): the chosen mockup per screen and the rejected options with the reason
- **UI Review** (if screens): the findings table from the `ui-review` skill
- File structure plan
- External dependencies

#### Tasks (implementation order)
Write to: the active plan path (see skill.md Plan Paths). When iterations enabled, this is only written as part of iteration slicing in Step 9, not at the root level.

Using `templates/tasks.md`:
- Ordered list of implementation tasks
- Each task: title, **Story ID (STORY-XXX)**, description, files to create/modify, dependencies on other tasks
- Every task MUST reference at least one STORY-ID from the spec
- Tasks should be small enough for one implementation session
- Include test tasks alongside implementation tasks

#### Checklist (implementation checklist)
Write to: the active plan path, next to tasks.md, as `checklist.md`. When iterations are enabled, write it in Step 9 for each iteration, not at the root level.

Using `templates/checklist.md`:
- One `## Task N` section per task in tasks.md, with the same number and title
- Each item is a concrete check, not a generic one. Name the test file and cases, the catalog entries to reuse, the files, the contract and the edge cases of that task
- The Reuse item takes its entries from `## Existing Code` and the component catalog
- Add project-specific items from the design (for example i18n, audit log, migration rollback)

#### Register the drafts

Register each artifact right after you write it, before the user approves it. Then `haren track check` passes while you wait for the approval:

- `haren track artifact <id> --type design --path artifacts/04-plans/{module}/design.md --module <module> --status draft`
- `haren track artifact <id> --type tasks --path <path of tasks.md> --module <module> --status draft`
- `haren track artifact <id> --type checklist --path <path of checklist.md> --module <module> --status draft`
- If you wrote spec.md: `haren track artifact <id> --type spec --path artifacts/03-modules/{module}/spec.md --module <module> --status draft`

### Step 7: Review with user

**Small module:** the module has 3 tasks or fewer, each task changes about 30 lines or fewer, it adds no new external dependency and it has no schema migration. For a small module, show the design, the tasks and the checklist in one message and ask for one approval. Write "Size: small" in the design. The implement skill then uses its fast path.

**Other modules:** present each artifact section by section. Ask "does this look right?" after each.
Only proceed to the next artifact after the current one is approved.

The user can always ask for the full path. Then review section by section.

### Step 8: Finalize

1. Validate all plan artifacts (spec, design, tasks, checklist) with validate-artifact skill. This runs `haren track check`
2. After the user approves an artifact, run the same `haren track artifact <id> ...` command with `--status approved`. Register an artifact that has no row yet in the same way
3. Set the module status: `haren track status <module> planned`. Never edit progress.json by hand
4. If `plugins.json` exists in the haren folder, run `haren plugin run after-plan --payload '{"module":"<module>","tasksFile":"<path of tasks.md relative to the haren folder>"}'` and show its output lines. A warning does not block the plan. The CLI adds the missing features to progress.json, so do not add them yourself

### Step 9: Iteration slicing (only if iterations enabled)

<HARD-GATE>
Only perform this step if manifest.yaml has `iterations.enabled: true`.
If iterations are not enabled, skip entirely.
</HARD-GATE>

After creating the master spec and design, and after all tasks are defined:

1. **Propose iteration grouping**: Review all tasks and propose which belong to iteration 1, iteration 2, etc. Consider:
   - Task dependencies (dependent tasks should be in the same or later iteration)
   - Task size (balance work across iterations)
   - Present the grouping to the user for approval

2. **User approves or adjusts**: Wait for confirmation before proceeding.

3. **Write iteration-scoped artifacts**: For each iteration N:
   - Create `artifacts/04-plans/{module}/iteration-{N}/design.md` — filtered subset of master design containing only decisions relevant to this iteration's tasks
   - Create `artifacts/04-plans/{module}/iteration-{N}/tasks.md` — only the tasks assigned to this iteration, each referencing STORY-IDs
   - Each scoped design must include: `Master: artifacts/04-plans/{module}/design.md` as a cross-reference
   - Create `artifacts/04-plans/{module}/iteration-{N}/checklist.md` — the checklist sections of the tasks in this iteration
   - Each scoped tasks file must include: `Spec: artifacts/03-modules/{module}/spec.md` as a cross-reference
   - Note: iteration-scoped specs are NOT created — the spec in `03-modules/` is the single source of truth (BA-owned)

4. **Create iteration file**: Write `artifacts/07-iterations/iteration-{N}.md` using the `templates/iteration.md` template with:
   - Goal: derived from the iteration's scoped spec
   - Planned deliverables: the tasks for this iteration
   - Demo script: outline of what can be demonstrated

5. **Check progress.json**: Check that `currentIteration` in progress.json is 1. If it is not, tell the user. Do not edit the file by hand.

## Rules

- **Never silently pick a technology** — present options, let the user choose
- **Never silently pick a screen layout** — show 2-3 mockup options, let the user choose
- Never skip the UI review for a changed screen.
- **One question at a time** — don't overwhelm with multiple decisions
- The spec is the contract the evaluator checks against — be precise and testable
- Tasks should reference exact file paths in the target repo
- If a dependency module's interfaces aren't defined yet, flag as a blocker
- Include edge cases and error scenarios in the spec
- The design must document every decision with "chosen: X, alternatives: Y/Z, rationale: ..."
- If unsure about anything, ask — don't guess
- **Never plan new code before the reuse inventory** — search all target repos for existing writers and callers first
