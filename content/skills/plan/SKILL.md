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

### Step 5: Gather decisions BEFORE writing artifacts

<HARD-GATE>
Before writing any artifact, identify all decision points in the module and
resolve them with the user. Do NOT write spec.md or design.md with assumptions.
</HARD-GATE>

**Decision gathering process:**
1. List all technical decisions this module requires (database, framework, auth, APIs, etc.)
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
- Data model
- **Key technical decisions with rationale** (from step 5 — include what was chosen and why)
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

### Step 7: Review with user

Present each artifact section by section. Ask "does this look right?" after each.
Only proceed to the next artifact after the current one is approved.

### Step 8: Finalize

1. Validate all three artifacts with validate-artifact skill
2. Update progress.json — module status to "planned"

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
   - Each scoped tasks file must include: `Spec: artifacts/03-modules/{module}/spec.md` as a cross-reference
   - Note: iteration-scoped specs are NOT created — the spec in `03-modules/` is the single source of truth (BA-owned)

4. **Create iteration file**: Write `artifacts/07-iterations/iteration-{N}.md` using the `templates/iteration.md` template with:
   - Goal: derived from the iteration's scoped spec
   - Planned deliverables: the tasks for this iteration
   - Demo script: outline of what can be demonstrated

5. **Update progress.json**: Ensure `currentIteration` is set to 1 (should already be set by init)

## Rules

- **Never silently pick a technology** — present options, let the user choose
- **One question at a time** — don't overwhelm with multiple decisions
- The spec is the contract the evaluator checks against — be precise and testable
- Tasks should reference exact file paths in the target repo
- If a dependency module's interfaces aren't defined yet, flag as a blocker
- Include edge cases and error scenarios in the spec
- The design must document every decision with "chosen: X, alternatives: Y/Z, rationale: ..."
- If unsure about anything, ask — don't guess
