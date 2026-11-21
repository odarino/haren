---
name: generate-mockup
description: Generate ASCII wireframe mockups for screens, as one wireframe or as 2-3 options to compare
type: utility
---

# Generate Mockup

Generate ASCII wireframes for UI screens described in specs or designs. Output is markdown-formatted ASCII art — git-friendly, no external tools needed.

## When to Use

- During the **plan** phase, for each screen the module adds or changes (options mode)
- When the user asks to visualize a UI layout
- When the spec references screens that need visual definition

## Input

- Screen name and purpose
- Key UI elements (components, fields, actions)
- Layout hints (sidebar, modal, table, form, tabs, etc.)

## Wireframe modes

- **Single** (default): one wireframe for one screen
- **Options**: 2-3 labeled variants of one screen, for the user to compare and pick. The plan skill uses this mode

### UI mode (ui.mockups)

Read `ui.mockups` in `manifest.yaml`. If the key is missing, use `ask`.

- `ascii`: use the ASCII steps in this skill only.
- `browser`: write the ASCII wireframes into design.md as before. Also push one options screen with the visual-companion skill. Use `.options` or `.cards`, with one `.mockup` per option. Build each mockup from the HTML mock elements of the visual-companion skill. Read the click from `state_dir/events`. After the pick, write the chosen option as ASCII into design.md.
- `artifact`: write the ASCII wireframes into design.md as before. Also publish the options as a Claude Artifact page. See "Artifact mode".
- `ask`: ask the user before the first mockup of the session. See "Ask the user".

### Ask the user

<HARD-GATE>
On `ask`, do not draw the first mockup of the session before the user picks a format. Never fall back to ASCII without asking.
</HARD-GATE>

Send the offer as its own message, with nothing else. List only the formats that work here: list Claude Artifact only if you have the `Artifact` tool, and the browser tab only if `haren companion` can run.

> How do you want to see the mockups? (1) ASCII in the terminal and in design.md, (2) Claude Artifact: a private web page on claude.ai, (3) local browser tab with clickable options. Add "always" to save the choice.

- With "always": run `haren track ui-mode <ascii|artifact|browser>`. Without it: use the choice for this session only.
- If only ASCII works here, say so in one line and use ASCII. Do not ask.

### Artifact mode

Needs the `Artifact` tool (Claude Code with claude.ai). If the tool is missing, tell the user and use ASCII.

Use a plain HTML page, not an Artifact type such as Design or Slides, and skip the quickstart for a type. The page file must stay in `artifacts/04-plans/{module}/mockups/`. Give the page a `<title>` of 2-4 words (for example `Checkout Layout Options`) and the icon `layout`.

1. Draw the ASCII options first (Options mode below). They stay the source of truth in design.md.
2. Build one HTML page: one card per option, side by side on wide screens and stacked on phones. Label each card `Option A`/`B`/`C` and show its trade-off line. Mark the recommended option. Use synthetic data only.
3. Render each option as a real UI mock (HTML/CSS), not as ASCII in a `<pre>`. Follow the artifact-design skill for the page rules.
4. Write the page to `artifacts/04-plans/{module}/mockups/{screen}.html` and publish it with the `Artifact` tool. Publish again from the same path for a new round, so the URL stays the same. Do not register the page with `haren track artifact`: the `.html` files in `mockups/` are working files, and `haren track check` only checks `.md` files. design.md is the registered record
5. Give the user the link. Tell the user that the page is private until they share it. Ask for the pick in the terminal.
6. After the pick, write the chosen option as ASCII into design.md `## Screens`. Put the link under `**Chosen:**` in this format: `**Mockup page:** <url> (Claude Artifact, private)`.
7. If the pick is not the recommended option, check that it does not change a reuse verdict or a task. If it does, update `## Existing Code`, tasks.md and checklist.md, and tell the user what changed.

### Options mode

1. Make 2-3 variants of the same screen. Label them `Option A`, `Option B`, `Option C`. Each variant must differ in a real decision (layout, grouping, navigation, density), not only in style
2. Under each variant, write one line: `Trade-off: {gain} — {cost}`
3. Mark one variant as recommended and say why in one sentence
4. Show the variants side by side in one message (see Output Format). If the terminal is narrow, show them one under the other
5. Ask the user to pick one. Do not continue to the next screen before the pick
6. Use only synthetic data in mockups (for example "Alex Sample", `user@example.com`). Never copy real third-party personal data

## ASCII Wireframe Conventions

```
┌─────────────────────────────────────────────┐  ← outer border
│ Page Title                         [Button] │  ← header bar
├─────────────────────────────────────────────┤  ← divider
│ ┌──────────┐  ┌───────────────────────────┐ │  ← two-column
│ │ Sidebar  │  │ Main Content              │ │
│ │          │  │                           │ │
│ │ - Item 1 │  │  ┌─────────────────────┐  │ │  ← nested panel
│ │ - Item 2 │  │  │ Card / Panel        │  │ │
│ │          │  │  └─────────────────────┘  │ │
│ └──────────┘  └───────────────────────────┘ │
└─────────────────────────────────────────────┘
```

## Component Library

**Text input:**
```
Label:  [________________________]
```

**Dropdown:**
```
Filter: [All Types          ▼]
```

**Button:**
```
[Primary Action]   [Secondary]   [Cancel]
```

**Table:**
```
┌──────────────┬────────┬──────────┬────────┐
│ Column 1     │ Col 2  │ Col 3    │ Action │
├──────────────┼────────┼──────────┼────────┤
│ Row data     │ value  │ value    │ [Edit] │
│ Row data     │ value  │ value    │ [Edit] │
└──────────────┴────────┴──────────┴────────┘
```

**Badge / status:**
```
● Active   ○ Inactive   ◌ Unknown
```

**Progress:**
```
Loading... [████████░░░░░░░░] 52%
```

**Modal:**
```
╔═══════════════════════════════╗
║ Modal Title                 ✕ ║
╠═══════════════════════════════╣
║ Content here                  ║
║                               ║
║         [Confirm]  [Cancel]   ║
╚═══════════════════════════════╝
```

**Tabs:**
```
┌────────┐────────┐────────┐
│ Tab 1  │ Tab 2  │ Tab 3  │
└────────┴────────┴────────┘
```

**Navigation bar:**
```
┌─────────────────────────────────────────┐
│ Logo   Home   Dashboard   Settings   👤 │
└─────────────────────────────────────────┘
```

**Card grid:**
```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Card Title   │  │ Card Title   │  │ Card Title   │
│              │  │              │  │              │
│ Description  │  │ Description  │  │ Description  │
│ [Action]     │  │ [Action]     │  │ [Action]     │
└──────────────┘  └──────────────┘  └──────────────┘
```

**Toast / notification:**
```
┌──────────────────────────────────┐
│ ✓ Success message here       ✕  │
└──────────────────────────────────┘
```

## Output Format

Place wireframes in the design.md under the relevant screen:

```markdown
### Screen: {Screen Name}
**Purpose:** {one sentence}
**Key elements:** {brief list}

\```
[ASCII wireframe here]
\```
```

### Options mode output

```markdown
### Screen: {Screen Name} — options

Option A                         Option B
┌──────────────────────┐         ┌──────────────────────┐
│ ...                  │         │ ...                  │
└──────────────────────┘         └──────────────────────┘
Trade-off: {gain} — {cost}       Trade-off: {gain} — {cost}

Recommended: B, because {reason}.
```

After the pick, put the chosen wireframe and the option table in the `## Screens` section of design.md (see `templates/design.md`).

## Rules

- Keep wireframes simple — communicate layout, not pixel-perfect design
- Use placeholder text: `[Field Label]`, `[Button Text]`, `Row data`
- Show realistic column counts and proportions
- Alignment: Every row in a box has the same width as its border. Pad cells with spaces. Check the column widths before you output the wireframe. Count the characters of each row when you are not sure.
- Max width: 60 characters for wireframe content (30 characters per option when options are side by side)
- If a screen has tabs or states, show the primary state unless asked
- **Ask the user** if the layout looks right before moving to the next screen
- Wireframes go into `design.md`. Do not write separate mockup files
