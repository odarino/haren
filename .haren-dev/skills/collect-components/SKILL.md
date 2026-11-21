---
name: collect-components
description: Collect the common UI components, shared services and shared functions of the target repos into one component catalog
type: utility
---

# Collect Components

Keep one catalog of the common building blocks in the target repos. The plan skill reads it before it designs new code. The implement skill updates it after each task.

**Output:** `artifacts/03-modules/component-catalog.md` (template: `templates/component-catalog.md`).

## When to Use

- **Incremental:** the implement skill runs it after the code commit of each task. Scan only the files that the task commits changed.
- **Full scan:** the catalog does not exist yet, the user asks for it, or the plan skill starts the reuse inventory (Step 4) on a repo that has code but no catalog. Scan all target repos in manifest.yaml `repos`.

## What Is Common

Add an item when one of these is true:

1. It is in a shared location: a `shared/`, `common/`, `components/ui/`, `lib/`, `utils/`, `core/` folder, or a shared package of the monorepo.
2. Two or more modules or features import it.
3. The design marks it as a reuse target ("reuse" or "extend" verdict in `## Existing Code`).

Do not add page-level screens, one-off helpers that one file uses, tests, generated code, or vendored code.

## Kinds

| Kind | Examples | API to record |
|------|----------|---------------|
| UI component | Button, DataTable, FormField, Modal, layout shell | Props (name, type, required, default), slots/children, variants, states |
| Shared service | API client, auth, notification, mail, file storage, audit log, numbering | Public methods with signature, side effects, tables it writes |
| Shared function | date/number/currency format, validation, mapping, hooks | Signature, return value, one-line purpose |

A route guard or a wrapper that renders JSX (for example `RoleGuard`) is a UI component. A client state store (Zustand, Redux slice, Pinia) is a shared service. A hook that only computes values is a shared function.

## Process

1. Read `artifacts/03-modules/component-catalog.md`. If it does not exist, create it from `templates/component-catalog.md` and do a full scan.
2. Get the repo keys from manifest.yaml `repos`. If `repos` is empty (common in the monorepo layout), use the key `default` for the repo that holds the haren folder (see skill.md "No repos listed"). Do not make up keys. If an existing entry uses a key that breaks this rule (for example `backend` when `repos` is empty), re-key every entry in one pass, then continue
3. Get the files to scan:
   - Incremental: `git -C <repo> show --name-only --format= <sha>` for each code commit SHA of the task
   - Full scan: list the source files of each repo. Skip `node_modules`, build output, tests and generated folders
4. For each candidate, apply "What Is Common". To count importers, search all target repos for the import path or the symbol name
5. For each common item, write or update its entry (see "Entry format")
6. Remove an entry when its file or symbol no longer exists. If it moved, update the path. Search for the symbol name before you remove it
7. Update `Used by` from the import search, not from memory
8. On every run, re-sort each whole kind section A-Z, not only the new entries. Sort by the `### ` heading name, case-insensitive (Combobox before ConfirmationDialog, ResizableTable before RichTextEditor). Check the order of every section before you save
9. Update the front matter `updated:` date and the `last_scan:` line: `full`, or `incremental <repoKey>@<sha>, ...`
10. Register the catalog once: `haren track artifact component-catalog --type component-catalog --path artifacts/03-modules/component-catalog.md --status approved`. Run it again only if the row is missing

## Entry Format

Each entry is one self-contained block. Keep entries sorted by kind, then by name (A-Z). Then two developers who add different entries do not touch the same lines.

````markdown
### Button
- **Kind:** UI component
- **Path:** `frontend:src/components/ui/Button.tsx:12`
- **API:** `variant: "primary" | "secondary" | "danger" = "primary"`, `size: "sm" | "md"`, `loading?: boolean`, `onClick`
- **Use for:** every action button. Do not style a raw `<button>`
- **Used by:** checkout, profile
- **Sketch:**
  ```
  [ Save ]  [ Cancel ]  [ ⟳ Saving… ]
  primary   secondary   loading
  ```
````

- **Path** uses the repo key from manifest.yaml (`default` when `repos` is empty), then the file and the line of the declaration
- **Use for** is one rule that tells a developer when to pick this item over writing new code
- **Sketch** is for UI components only. Draw a small ASCII sketch of the variants and states, 8 lines or fewer. Follow the alignment rule of the generate-mockup skill. Omit it for a component with no visual part (a provider, a context)
- **Screenshot** (optional): only when the user asks and the app can run. Save it under `artifacts/03-modules/components/<name>.png` and link it from the entry. Never take screenshots in the incremental run

## Rules

- Do not change code in the target repos. This skill reads code and writes only the catalog
- One entry per item. If two items do the same job, keep both entries and add `**Duplicate of:** <name>` to the newer one, so the plan can merge them
- Record what the code does now, not what the plan intends
- Keep each entry short. The catalog is an index, not documentation
