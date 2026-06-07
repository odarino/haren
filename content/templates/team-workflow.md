# Team Workflow Guide

How BA, Dev, and PM work together in Haren.

---

## Roles & Ownership

| Role | Owns | Folder | Rule |
|------|------|--------|------|
| BA | Requirements, user stories | `03-modules/{module}/spec.md` | Never touch `04-plans/` |
| Dev | Design, tasks, implementation | `04-plans/{module}/` | Never touch `spec.md` |
| PM | Progress tracking | Reads both folders | Doesn't write artifacts |

---

## Folder Structure

```
artifacts/
├── 03-modules/{module}/
│   ├── module.md        ← Module definition (from discover phase)
│   └── spec.md          ← BA owns this
│
├── 04-plans/{module}/
│   ├── design.md        ← Dev owns this
│   ├── iteration-1/
│   │   └── tasks.md     ← Dev owns this
│   └── iteration-2/
│       └── tasks.md
```

---

## Story ID Convention

Every user story gets a stable ID: `STORY-001`, `STORY-002`, etc.

These IDs are the **link** between what BA writes (specs) and what Dev builds (tasks). They never change once assigned, even if the story content is updated.

---

## For BA: Writing and Updating Specs

### Creating a new story

Add it to `03-modules/{module}/spec.md` with the next available ID:

```markdown
### STORY-005: User can export reports
- As an admin, I want to export reports as CSV
- Acceptance:
  - Supports date range filter
  - Max 10,000 rows per export
```

Add a changelog row:

```markdown
## Changelog

| Date       | Story     | Change              | Reason          |
|------------|-----------|---------------------|-----------------|
| 2026-05-08 | —         | Add STORY-005       | Product roadmap |
```

### Updating an existing story

Edit the story **in place** (always show the current state, not history). Add a changelog row and an `Updated` line:

```markdown
### STORY-002: User can reset password
- As a user, I want to reset my password
- Acceptance:
  - SMS + email, 24h expiry
  - Old password invalidated immediately
- Updated: 2026-05-05 — add SMS option, extend expiry to 24h
```

```markdown
| 2026-05-05 | STORY-002 | Add SMS option, extend expiry to 24h | Compliance |
```

### Rules for BA

1. **Every spec edit = one changelog row**
2. **Never edit a completed story silently** — always add the `Updated` line and changelog row
3. **Story IDs are permanent** — don't renumber or reuse them
4. **Keep stories as current state** — the changelog captures history

---

## For Dev: Reading Specs and Creating Tasks

### When a new spec arrives

1. Read `03-modules/{module}/spec.md`
2. Write `04-plans/{module}/design.md` (architecture, data model, decisions)
3. Write `04-plans/{module}/iteration-{N}/tasks.md` (task breakdown)
4. Every task references a STORY-ID:

```markdown
## Task 1: Create signup endpoint

**Story:** STORY-001
**Description:** POST /auth/signup with email validation
**Files:**
- Create: `src/routes/auth/signup.ts`
- Test: `src/routes/auth/signup.test.ts`
**Dependencies:** none
**Estimated size:** medium
```

### When BA updates a spec

Check the changelog, then follow this decision tree:

```
BA updates a story
       │
       ▼
"Is this story implemented?"
       ├── No  → update existing tasks to match new acceptance criteria
       └── Yes → "Does this change the design?"
                    ├── No  → add task(s) to current iteration
                    └── Yes → update design.md first
                                 │
                                 ▼
                         add task(s) referencing the story
                                 │
                                 ▼
                         "Does it fit this iteration's capacity?"
                              ├── Yes → add to current iteration
                              └── No  → add to next iteration
```

### New story vs. new task?

| Question | Story | Task |
|----------|-------|------|
| Is there a new "As a user, I want to..." ? | New story | — |
| Does existing acceptance criteria change? | — | Update tasks |
| Can PM demo this as a separate feature? | New story | — |
| Can you describe it without naming the original story? | New story | Task |

**Simple test:** "Add SMS to password reset" → tied to reset → **task**.
"Users can enable 2FA" → standalone → **new story**.

### Rules for Dev

1. **Every task references a STORY-ID**
2. **Never edit spec.md** — flag issues to BA instead
3. **Note why** when adding tasks from spec updates (e.g., "Added after STORY-002 update on 2026-05-05")

---

## For PM: Tracking Progress

### How to check story coverage

Look at which STORY-IDs appear in task files across iterations:

```
STORY-001  → iteration-1/tasks.md, all tasks done     ✓
STORY-002  → iteration-1/tasks.md, all tasks done     ✓
STORY-003  → iteration-2/tasks.md, in-progress
STORY-004  → not in any tasks.md                       ← unplanned
```

If a story has no tasks referencing it, it hasn't been picked up by devs yet.

### How to spot spec changes

Read the Changelog table in `03-modules/{module}/spec.md`. Any row with a date after the last iteration start means something changed that devs need to assess.

### Rules for PM

1. **Don't write artifacts** — read and track only
2. **Flag unplanned stories** — if a STORY-ID has no tasks, ask devs about it
3. **Flag stale updates** — if changelog shows a change but no new tasks appeared, follow up

---

## Quick Reference

### File locations

| What you need | Where to find it |
|---------------|------------------|
| Module requirements and stories | `artifacts/03-modules/{module}/spec.md` |
| What changed recently | Changelog table at top of `spec.md` |
| Technical design | `artifacts/04-plans/{module}/design.md` |
| Current iteration tasks | `artifacts/04-plans/{module}/iteration-{N}/tasks.md` |
| Module definition | `artifacts/03-modules/{module}/module.md` |

### Workflow summary

```
BA writes spec → Dev reads spec → Dev writes design + tasks → PM tracks coverage
       │                                      │
       ▼                                      ▼
BA updates spec → Dev checks changelog → Dev assesses impact → Dev adds tasks
```
