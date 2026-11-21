# Changelog

Each section lists what changed in one release. `haren upgrade` prints the sections between your old version and the new one.

## 1.7.0

### New
- **Component catalog** (`collect-components` skill): one file, `artifacts/03-modules/component-catalog.md`, lists the common UI components (with a short ASCII sketch), shared services and shared functions of your repos. The plan reads it before it designs new code. Implement updates it after each task.
- **Implementation checklist**: the plan writes `checklist.md` next to `tasks.md`, with concrete checks per task (tests, reuse, files, contract, edge cases). Implement ticks only what it verified. A difference from the plan is written as `— changed: {what and why}`, and a skip as `— skipped: {reason}`. Evaluate checks each tick.
- **Choose the mockup format**: with `ui.mockups: ask`, `generate-mockup` asks before the first mockup: ASCII, Claude Artifact or a local browser tab.
- **`artifact` UI mode**: `haren track ui-mode artifact` shows mockup options as a private Claude Artifact page (Claude Code with claude.ai only).
- **`haren track commit <module> <repoKey> --remove`** removes a stale repo key from `progress.json`.
- **What's new**: `haren upgrade` prints this changelog for the versions you skipped.

### Fixed
- `haren track status` no longer crashes on a module status from an old `progress.json` (for example `specified`). Such a module can move to `decomposed` or `planned`.
- `track status --repos`, `track commit` and `track check` use the same repo key rule. When `manifest.yaml` has no `repos`, the key is `default`.
- The brainstorm gate no longer blocks writes to files outside the workspace.
