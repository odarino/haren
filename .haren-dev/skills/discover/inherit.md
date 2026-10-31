---
name: inherit
description: Discovery strategy for brownfield projects with existing code
---

# Inherit Mode

Existing codebase plus documentation — understand what exists before planning what's new.

## Process

1. Read source docs from `manifest.yaml` sources
2. Analyze each repo listed in `manifest.yaml`:
   - Read README, package.json/go.mod/etc for tech stack
   - Scan directory structure for architecture patterns
   - Identify key entry points and data flows
   - Note existing tests and their coverage
3. Document the current state:
   - What's built and working
   - What's partially built
   - Known tech debt or issues
   - Architecture decisions (inferred or documented)
4. Compare current state against source docs:
   - What requirements are met?
   - What's missing?
   - What's been built but isn't in the docs?
5. Ask the user to clarify goals for the next phase of work
6. Synthesize into context-brief.md format

## Tips

- Don't judge existing code quality — document it objectively
- Pay attention to the gap between docs and reality — that's where the real requirements live
- Identify which parts of the codebase are stable vs actively changing
