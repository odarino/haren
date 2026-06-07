---
name: ideate
description: Transform raw ideas into research-backed concept briefs through structured research, user interviews, and synthesis
type: sequential
agent: ideator
delegates:
  - research
  - resolve-next-id
  - create-artifact
  - validate-artifact
---

# Ideate

> **Trigger:** When the user presents a raw idea, concept, or "I want to build X" statement — read and follow this skill. Also read the agent definition at `haren/agents/ideator.md`.

Take a raw idea at any maturity level and transform it into a validated, research-backed concept brief. The concept brief becomes a baseline document for the Discover phase (blueprint mode).

## When to Use

When the Discover intent router detects a raw idea input — no baseline docs, no repos, and the user provides a statement of intent. This skill is invoked automatically; users do not need to call it directly.

## Pipeline

Six stages, always in order. Intensity adapts based on idea maturity.

### Stage 1: Intake & Assessment

Accept the user's input and classify idea maturity:

- **Nascent**: One-liner, vague idea, no context beyond the core concept
- **Emerging**: Concept with some context — the user knows the problem, audience, or constraints
- **Formed**: Hypothesis to validate — the user has a clear thesis and needs research to confirm or challenge it

Maturity determines intensity for Stages 2 and 3:
- Nascent → deep research (broad), deep interview (full)
- Emerging → moderate research (targeted gaps), targeted interview (specific gaps)
- Formed → light research (validation-focused), light interview (gap-filling)

**Output**: Maturity classification with rationale, stored in working memory for later stages.

### Stage 2: Research Spikes (automatic, parallel)

Resolve all required research IDs upfront using the `resolve-next-id` skill (call it once per spike, sequentially, before launching spikes in parallel).

Launch up to 3 research spikes by delegating to the `research` skill:

| Spike | Research Question | Intensity Guide |
|-------|-------------------|-----------------|
| Market | "What is the market landscape for {idea}? Existing solutions, competitors, market size, trends, gaps." | Nascent: broad survey. Emerging: targeted gaps. Formed: validation only. |
| Technical | "What are the technical feasibility considerations for {idea}? Tech options, known pitfalls, prior art." | Nascent: broad survey. Emerging: specific tech questions. Formed: validate chosen approach. |
| Internal | "What relevant prior work, lessons, or reusable assets exist in our projects and memory for {idea}?" | All levels: search memory / knowledge base, past project repos, git history. |

Each spike produces: `artifacts/01-research/RESEARCH-{NNN}-{slug}.md`

**Research artifact format**: Each spike MUST use the research template (`templates/research.md`). Required structure:
- Frontmatter: `id`, `title`, `question`, `status`, `date`, `related`
- Sections: `## Research Question`, `## Context`, `## Findings` (with `###` sub-topics), `## Recommendations`, `## Open Questions`, `## Related Artifacts`

Do NOT improvise section names — follow the template exactly.

**Failure handling**: If a spike fails (web search unavailable, memory unavailable, no past projects), log the failure, continue with available results, and note the gap in the concept brief's Research Summary.

**Intensity adjustment**: For "formed" ideas, the market and technical spikes focus on validating the user's thesis rather than broad exploration. The internal spike always runs at full depth.

### Stage 3: User Interview

Ask structured questions to capture domain expertise that research cannot find. Questions are adaptive — informed by Stage 2 findings.

**Core questions** (adapt based on maturity and research):
- "What problem are you personally experiencing?"
- "Who is this for? How do they solve this today?"
- "What would success look like in 3 months?"
- "What constraints do you already know about?"

**Adaptive rules**:
- If market research already identified competitors → skip "how do they solve this today?" and instead ask "Research found {competitors}. How is your idea different?"
- If technical research flagged a risk → ask about it: "Research flagged {risk}. Is that a concern for you?"
- If internal search found prior art → ask: "We found {prior project}. Is this related? Can we reuse anything?"

**Intensity**:
- Nascent: ask all core questions + follow-ups
- Emerging: ask only questions not already answered by the user's initial input
- Formed: ask only gap-filling questions based on research findings

### Stage 4: Synthesis

Combine research findings and user interview responses into a draft concept:

1. **Core value proposition** — what does this do and why does it matter?
2. **Target users** — who specifically benefits?
3. **Key goals** — break the concept into measurable outcomes (use G-1, G-2, ... format with success criteria and priority: must/should/could)
4. **Known risks** — from research findings, with severity and proposed mitigations
5. **Technical direction** — high-level only (language, major frameworks, deployment model if obvious)
6. **Open questions** — what still needs investigation in Discover?

Present the synthesis to the user as a summary before proceeding.

### Stage 5: Pivot Check

Review research findings for significant problems:
- Saturated market with no clear differentiator
- Technical infeasibility or extreme complexity
- Existing near-identical solution that's well-established
- Legal, regulatory, or compliance blockers

**If problems found**:
1. Brainstorm 2-3 alternative angles, differentiators, or pivots
2. Present to user: "Research found {problem}. Here are 3 ways to approach this differently: ..."
3. User picks a direction or insists on original
4. Update synthesis with chosen direction and document the pivot rationale

**If no problems found**: Quick pass-through — confirm with user that the synthesis looks good.

### Stage 6: Concept Brief

1. Present final summary to user and get explicit confirmation
2. Write `artifacts/00-baseline/concept-brief.md` using `create-artifact` skill with `templates/concept-brief.md` (the concept-brief template, not the context-brief template)
3. Validate with `validate-artifact` skill
4. Update `manifest.yaml`:
   - Set `mode: blueprint`
   - Add concept brief to `sources` array:
     ```yaml
     sources:
       - path: artifacts/00-baseline/concept-brief.md
         type: concept-brief
         generated_by: ideate
     ```
5. Update `progress.json` with ideate phase status:
   ```json
   {
     "ideate": {
       "status": "completed",
       "maturity": "{assessed maturity}",
       "research_spikes": {number of successful spikes},
       "pivoted": {true|false},
       "concept_brief": "artifacts/00-baseline/concept-brief.md"
     }
   }
   ```

## Output

- Research artifacts: `artifacts/01-research/RESEARCH-{NNN}-{slug}.md` (1-3 per ideation)
- Concept brief: `artifacts/00-baseline/concept-brief.md`
- Updated `manifest.yaml` with mode and sources
- Updated `progress.json` with ideate status
- Updated `artifacts/_registry/artifact-index.md`

After completion, the Discover phase picks up the concept brief as a baseline doc in blueprint mode. No manual handoff required.
