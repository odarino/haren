---
name: extract-stories
description: Extract user stories from baseline documents (PDF, DOCX, XLSX) into module specs
type: sequential
agent: researcher
---

# Extract Stories

Read baseline documents and produce structured user stories in `03-modules/{module}/spec.md`.

This is a **BA-owned** skill. It bridges raw input documents and actionable specs that devs can plan against.

## When to Use

- After baseline docs are dropped into `artifacts/00-baseline/`
- After discover + decompose phases (modules must exist)
- Before the plan phase (devs need stories to write tasks)

## Prerequisites

<HARD-GATE>
Before running this skill, verify:
1. `artifacts/00-baseline/` has at least one document
2. `artifacts/03-modules/module-map.md` exists (decompose was done)
3. Module folders exist in `artifacts/03-modules/{module}/`

If modules don't exist yet, tell the user to run discover → decompose first.
</HARD-GATE>

## Process

### Step 1: Inventory baseline documents

1. List all files in `artifacts/00-baseline/`
2. For any `.docx` or `.xlsx` files, convert to markdown first — most agents can't read binary formats, and even those that can will misparse tables:
   ```bash
   pandoc "artifacts/00-baseline/doc.docx" -t markdown --columns=300 -o "artifacts/00-baseline/doc.md"
   ```
   The `--columns=300` flag is critical: docx files often contain Field Description tables where pandoc's default 72-column wrapping splits cell content and bold markers across lines, causing data loss during extraction.
3. Read each document (PDF, DOCX, XLSX, markdown, images)
4. For each document, note:
   - Document type (PRD, wireframe, spreadsheet, meeting notes, etc.)
   - What modules it likely relates to
   - How detailed it is (high-level goals vs. specific requirements)

Present the inventory to the user:
> "I found N documents in baseline. Here's what I see:
> - `requirements.pdf` — PRD covering auth and billing modules
> - `data-model.xlsx` — database schema for user and payments tables
> - `notes.md` — meeting notes with misc requirements
>
> I'll extract stories from these. Ready to proceed?"

### Step 2: Read the module map

1. Read `artifacts/03-modules/module-map.md` for the list of modules
2. Read each `artifacts/03-modules/{module}/module.md` for responsibilities
3. This tells you which module each requirement belongs to

### Step 3: Build a section map

Before extracting, build a mapping of baseline sections → modules. This is the critical step that prevents missed sections.

1. List every use case section in the baseline doc (headings, bold-text headings, numbered sections)
2. Count them and record the total — this is your **expected story count**
3. Map each section to a module based on module responsibilities
4. Flag any section that doesn't fit a module — ask user where it belongs
5. Flag any contradictions between documents — ask user to resolve

Present the section map to the user:
> "I found 23 use case sections in the baseline. Here's the mapping:
>
> | Section | Title | Module |
> |---------|-------|--------|
> | 1.1 | View ShareAll Listing | share-all |
> | 1.2 | Export ShareAll Data | share-all |
> | ... | ... | ... |
>
> Does this mapping look right?"

This map is your checklist — every section must produce a story. You'll verify against it in Step 6.

### Step 4: Write stories — one module at a time

<HARD-GATE>
Process ONE module at a time. Do NOT batch all modules in a single pass — long outputs cause attention degradation and dropped sections.

If subagents are available (Claude Code with Agent tool, or similar), dispatch one subagent per module in parallel. Each subagent receives:
- The skill instructions (this file)
- Only the relevant baseline sections for its module (not the full doc)
- The module.md for context
- The section map entries for its module (so it knows exactly which sections to extract)

If subagents are not available, process sequentially. Present stories to the user for review before moving to the next module.
</HARD-GATE>

For each module:

1. Group related requirements into user stories
2. Assign IDs: `STORY-001`, `STORY-002`, etc. (sequential per module)
3. Present the stories to the user for approval before writing the spec

### Step 5: Fill in the spec

<HARD-GATE>
Every story MUST follow this exact structure. No exceptions, no variations, no renaming sections, no merging sections, no skipping sections. This applies whether you are the main agent or a subagent.
</HARD-GATE>

For each approved module, write the full spec using this template:

```markdown
---
module: {module name}
date: {today}
status: draft
owner: BA
---

# Spec: {module name}

## Changelog

| Date       | Story | Change                  | Reason            |
|------------|-------|-------------------------|-------------------|
| {today}    | —     | Initial extraction from baseline | Project kickoff |

## Requirements

### Functional
{Extracted from baseline — number each requirement}

### Non-Functional
{Extracted from baseline — measurable targets}

## User Stories

### STORY-001: {title}
- As a {role}, I want to {action} so that {benefit}
- Acceptance:
  - {testable criterion}
- Source: {document name, section}

#### Primary Actors
{Copy from baseline. If not present, write "N/A"}

#### Trigger
{Copy from baseline. If not present, write "N/A"}

#### Precondition
{Copy from baseline. If not present, write "N/A"}

#### Screen Design
{Copy image reference from baseline. If not present, write "N/A"}

#### Field Description

{Copy the field table from baseline in pipe format. If not present, write "N/A"}

| Field Name | Control Type | Filter | Edit | Default Value | Description |
|------------|-------------|--------|------|---------------|-------------|
| {field} | {type} | {value} | {Y/N} | {value} | {description} |

#### Business Rules

{Copy the bullet list from baseline verbatim. If not present, write "N/A"}

- {rule 1 — copied exactly from baseline, not rephrased}
- {rule 2}

#### Postcondition
{Copy from baseline. If not present, write "N/A"}
```

### Formatting rules for subsections

These rules are non-negotiable:

1. **Use the exact `####` heading names listed above** — do NOT rename them (e.g., "Acceptance (Behavior & Business Rules)" is wrong, use "Business Rules")
2. **Every story gets ALL subsection headings** — even if the baseline doesn't have that subsection, write the heading with "N/A" under it. This ensures uniform structure across all stories and modules.
3. **Tables MUST use pipe format** (`| col | col |`). The baseline may use grid tables (`+---+---+`) from pandoc — convert them. Do NOT use grid format. Copy every row — do NOT summarize or omit fields.
4. **Business Rules are bullet lists** — copy them exactly as written in the baseline. Do NOT rephrase, merge, or fold them into Acceptance criteria. Acceptance is a concise summary; Business Rules are the verbatim source-of-truth.
5. **If the baseline has extra subsections** not listed above (e.g., "Notification Rules", "Validation Rules"), add them as additional `####` headings after Postcondition. Keep the original name from the baseline.

### STORY-002: {title}
{Same structure as above — all subsection headings present}
...

## Interface Contracts

### Exposed by this module
{Derived from module.md interfaces}

### Required from other modules
{Derived from module.md dependencies}

## Definition of Done
- [ ] All acceptance criteria met
- [ ] Tests cover each story
- [ ] API contracts match interface section
```

### Step 6: Verify completeness

<HARD-GATE>
Before moving on, verify against the section map from Step 3. This is not optional.
</HARD-GATE>

1. Count the total stories written across all specs
2. Compare against the **expected story count** from Step 3
3. For each section in the section map, confirm a matching story exists in the spec
4. If any section is missing, go back and extract it — do not skip

Present the verification:
> "Verification against section map:
> - Expected: 23 sections
> - Extracted: 23 stories
> - Missing: none (or: missing section 3.1.1 — extracting now)"

### Step 7: Handle unmapped requirements

After verification passes:
1. List any requirements that couldn't be mapped to a module
2. Ask user: create a new module, or assign to an existing one?
3. If creating a new module, flag that decompose artifacts need updating

### Step 8: Generate story index

After all modules are written, generate (or update) `artifacts/_registry/story-index.md` — a cross-module view of every story:

```markdown
# Story Index

> Auto-generated by extract-stories. Do not edit manually.

| Story ID  | Module   | Title                        | PIC | Status | Source                     |
|-----------|----------|------------------------------|-----|--------|----------------------------|
| STORY-001 | auth     | User can sign up with email  | —   | draft  | requirements.pdf p.3       |
| STORY-002 | auth     | User can reset password      | —   | draft  | requirements.pdf p.4       |
| STORY-001 | billing  | Monthly invoice generation   | —   | draft  | data-model.xlsx            |
```

Rules for the story index:
- **PIC** defaults to `—` (assigned later by BA/PM)
- **Status** defaults to `draft` (mirrors the spec status)
- **Source** comes from the story's `Source:` line
- If the index already exists, merge new stories — do not drop existing rows that may have updated PIC/Status values
- Register the file in `artifacts/_registry/artifact-index.md` if that file exists

### Step 9: Summary

Present a final summary:

```
Extraction complete:

| Module   | Stories | Source Documents         |
|----------|---------|--------------------------|
| auth     | 5       | requirements.pdf, notes.md |
| billing  | 3       | requirements.pdf, data-model.xlsx |
| reports  | 2       | notes.md                 |

Unmapped: 0 requirements
Story index: artifacts/_registry/story-index.md (N total stories)

Next step: devs can now run the plan skill on each module.
```

## Rules

- **One module at a time** — present, get approval, write, then next
- **Trace every story to its source** — include `Source:` line so BA can verify
- **Don't invent requirements** — only extract what's in the documents. If something seems implied but isn't stated, ask rather than assume
- **Flag gaps** — if a module has no stories from baseline, tell the user
- **Story IDs are per-module** — auth gets STORY-001, billing also gets STORY-001. They're namespaced by folder.
- **Acceptance criteria must be testable** — "should be fast" → "response time < 200ms"
- **Ask about ambiguity** — "the system should handle users" is not a story. Ask what specifically.
- **Update the story index** — after writing specs, always generate/update `artifacts/_registry/story-index.md`
- **Preserve all baseline subsections verbatim** — every subsection under a use case (tables, business rules, triggers, screen designs, etc.) must be copied into the story as-is. Do not summarize, paraphrase, or fold into acceptance criteria. These are the source-of-truth details.
- **Changelog on every spec edit** — when modifying an existing `spec.md` (adding stories, changing requirements), always add a new row to the Changelog table (Date, Story if applicable, Change summary, Reason)

## Tips

- Spreadsheets often contain data models — extract stories about CRUD operations on those entities
- PRDs often mix requirements with implementation details — extract the "what", ignore the "how"
- Meeting notes are messy — focus on action items and decisions, not discussions
- If a document is too vague to extract stories, flag it and ask the BA for clarification
