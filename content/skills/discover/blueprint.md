---
name: blueprint
description: Discovery strategy for projects with existing documentation
---

# Blueprint Mode

You have existing documentation to work from.

## Process

1. Read all source documents listed in `manifest.yaml` sources
2. Extract and organize:
   - Business goals and user needs
   - Functional requirements
   - Non-functional requirements (performance, security, scale)
   - Technical constraints (existing systems, APIs, compliance)
   - Glossary of domain terms
3. Identify gaps — requirements that are mentioned but not detailed
4. Ask the user to clarify gaps (one question at a time)
5. Synthesize into context-brief.md format

## Tips

- Don't assume the docs are complete or consistent — flag contradictions
- Prioritize requirements by how often they appear and how specifically they're described
- Separate "must have" from "nice to have" based on language cues
