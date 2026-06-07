---
name: research
description: Conduct research spikes, deep-dives, and tech evaluations on demand
type: on-demand
agent: researcher
---

# Research

Conduct a research spike and document findings as a structured artifact.

## When to Use

Any time during the project lifecycle when a question needs investigation before proceeding. Examples:
- "Should we use PostgreSQL or MongoDB for this?"
- "How does the existing auth system work?"
- "What are the options for real-time notifications?"

## Process

1. **Clarify scope**: Ask the user what question needs answering and what constraints matter
2. **Resolve ID**: Use resolve-next-id skill to get next RESEARCH ID
3. **Conduct research**: Investigate using available tools (web search, code reading, docs)
4. **Document findings**: Write structured research artifact
5. **Update registry**: Use create-artifact skill to write file and update artifact-index.md

## Output Format

Write to: `artifacts/01-research/RESEARCH-{NNN}-{slug}.md`

Use the research template from `templates/research.md`:
- Title and research question
- Context and motivation
- Findings (structured by sub-topic)
- Recommendations
- Open questions
- Links to related artifacts

## Rules

- Stay focused on the research question — don't expand scope
- Present findings objectively — separate facts from recommendations
- If research reveals the need for more research, create a follow-up entry
- Link to related IDEAs, SPECs, or other RESEARCH artifacts via update-links skill
