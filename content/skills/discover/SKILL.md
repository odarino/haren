---
name: discover
description: Produce a context brief from project sources — strategy varies by mode
type: sequential
agent: researcher
delegates:
  - ideate
---

# Discover

Analyze project sources and produce a standardized context brief that feeds into the Decompose phase.

## Intent Routing

Before starting discovery, determine the intent:

0. **User provides a raw idea** (no baseline docs in `manifest.yaml` sources, no repos to inherit, and input is a statement of intent) → route to `ideate` skill. Ideate produces a concept brief, adds it to `manifest.yaml` sources, and sets mode to `blueprint`. Discovery then proceeds in blueprint mode with the concept brief as a baseline document.
1. **No prior context + unclear task** → ask the user: "Is this research, or a new feature to design?"
   - Research → route to `research` skill
   - New feature → route to `ideate` skill (ideate now handles the research + design flow)
2. **Module already exists + needs clarification** → invoke brainstorming, output to `artifacts/04-plans/{module}/`
3. **Module already planned** → skip brainstorming, proceed to implement

**Disambiguation between 0 and 1:** Priority 0 triggers when the user provides an idea statement (even vague — "I want to build X"). Priority 1 triggers when there is genuinely no input and the task is unclear. The key distinction: Priority 0 has *something* to work with; Priority 1 has nothing.

**Mode-specific behavior:**
- **explore** mode: routes through brainstorming for collaborative design (preserved for users who explicitly set `mode: explore` in manifest.yaml — the default path for new ideas is now through `ideate`)
- **blueprint** mode: if baseline docs exist in `artifacts/00-baseline/`, the existing blueprint strategy processes them first. Brainstorming triggers only for new features not covered by baseline docs.
- **inherit** mode: existing codebase analysis runs first. Brainstorming triggers for new features on top of the existing code.
- **undecided** mode: brainstorming helps determine the mode as part of the discovery process

## Process

1. Read `manifest.yaml` to determine mode and sources
2. Load the mode-specific strategy:
   - `blueprint` → read `skills/discover/blueprint.md`
   - `explore` → read `skills/discover/explore.md`
   - `inherit` → read `skills/discover/inherit.md`
3. Follow the strategy to produce a context brief
4. Write output using create-artifact skill: `artifacts/02-discovery/context-brief.md`
5. Validate output with validate-artifact skill
6. Update progress.json — project moves past discovery

## Output

A single `context-brief.md` that contains:
- Project overview and goals
- Key requirements (functional and non-functional)
- Constraints and assumptions
- Identified risks
- Suggested module boundaries (high-level, refined in Decompose)

All three modes produce the same output format — the strategy only changes how the information is gathered.
