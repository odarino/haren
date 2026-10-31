---
name: explore
description: Discovery strategy for greenfield projects starting from scratch
delegates:
  - superpowers:brainstorming
---

# Explore Mode

No existing documentation — discover what to build through conversation and research.

## Artifact Output Location

Design specs for this project go to `artifacts/02-discovery/`, NOT `docs/superpowers/specs/`.
This overrides the default brainstorming output location.

After brainstorming completes, register all output artifacts using the create-artifact skill.

## Process

1. Invoke superpowers:brainstorming to collaboratively design the feature
   - Brainstorming will ask clarifying questions, propose approaches, present design
   - All design output writes to `artifacts/02-discovery/` (context-brief.md, {topic}-design.md)
2. If the domain is unfamiliar, use the research skill to investigate first
3. After brainstorming produces the design, register artifacts via create-artifact skill
4. Validate output with validate-artifact skill
5. Synthesize into context-brief.md format if brainstorming didn't produce one directly

## Tips

- Start broad, then narrow — understand the problem before discussing solutions
- Challenge assumptions gently — "Why does it need to be real-time?" is a valid question
- Document decisions and their reasoning — future you will thank present you
