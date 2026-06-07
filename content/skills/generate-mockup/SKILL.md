---
name: generate-mockup
description: Generate ASCII wireframe mockups for screens during design phase
type: utility
---

# Generate Mockup

Generate ASCII wireframes for UI screens described in specs or designs. Output is markdown-formatted ASCII art — git-friendly, no external tools needed.

## When to Use

- During the **plan** phase when designing screens for a module
- When the user asks to visualize a UI layout
- When the spec references screens that need visual definition

## Input

- Screen name and purpose
- Key UI elements (components, fields, actions)
- Layout hints (sidebar, modal, table, form, tabs, etc.)

## ASCII Wireframe Conventions

```
┌─────────────────────────────────────────────┐  ← outer border
│ Page Title                          [Button] │  ← header bar
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

## Rules

- Keep wireframes simple — communicate layout, not pixel-perfect design
- Use placeholder text: `[Field Label]`, `[Button Text]`, `Row data`
- Show realistic column counts and proportions
- Max width: 60 characters for wireframe content
- If a screen has tabs or states, show the primary state unless asked
- **Ask the user** if the layout looks right before moving to the next screen
- Wireframes go into `design.md`, not a separate file
