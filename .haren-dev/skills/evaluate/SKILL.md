---
name: evaluate
description: Independently verify implementations against specs
type: sequential
agent: reviewer
delegates:
  - superpowers:requesting-code-review
  - superpowers:verification-before-completion
---

# Evaluate

Independently verify that a feature implementation meets its spec.

## Process

1. Read the spec from the **active plan path** (see skill.md Plan Paths convention). If iterations enabled, also check the **master plan path** for full module context.
2. Read the code in target repo(s) for the feature being evaluated
3. Read progress.json to confirm feature is in "evaluating" status
4. Check previous review attempts if they exist (task-{N}-{slug}-review.md)

## Evaluation

Run through each criterion:

1. **Functionality**: Does the code do what the spec says?
   - Test each user story / acceptance criterion
   - Check edge cases mentioned in the spec
2. **Completeness**: Are all spec requirements addressed?
   - Cross-reference spec checklist against implementation
   - Read the task's section in `checklist.md` (active plan path). Treat each tick as a claim, not as evidence. Check it in the code. A false tick, or an unticked item without a `skipped:` or `changed:` reason, is a finding. Check each `changed:` item against the spec: a change that breaks the spec is a finding
   - Reuse: if the code adds a UI component, service or function that duplicates an entry in `artifacts/03-modules/component-catalog.md`, that is a finding
3. **Correctness**: Do tests pass?
   - Run the test suite
   - Check test coverage for the feature
4. **Integration**: Does it work with module interfaces?
   - Verify exposed interfaces match the spec's interface contracts
5. **Screens** (only if the spec has a `## Screens` section): does each changed screen match the chosen mockup?
   - Compare layout, elements, states and labels with the chosen option in the spec
   - If the app can run, start it and take a screenshot of each changed screen. Save it under `artifacts/06-evaluation/{module}/screens/` and link it in the review
   - If the app cannot run, say so in the review and compare the code with the mockup
   - A difference from the chosen mockup is a fail unless the session log records a reason the user approved
   - Read `ui.mockups` in `manifest.yaml`. On `ask`, follow the offer in the generate-mockup skill
   - Artifact mode (`ui.mockups` is `artifact`, or the user chose a Claude Artifact): publish one private Artifact page per changed screen with the chosen mockup and the screenshot side by side (see "Artifact mode" in the generate-mockup skill). Ask the user for the pass or fail verdict in the terminal
   - Browser mode (`ui.mockups` is `browser`, or the user chose the browser): push one `.compare` screen per changed screen with the visual-companion skill (chosen mockup | screenshot). Rebuild the chosen option from the ASCII wireframe in design.md with the HTML mock elements. Read the `pass` or `fail` click from `state_dir/events`. Confirm the verdict with the user in the terminal
   - ASCII mode: compare as above in the terminal
   - No screenshot (the app cannot run): use the ASCII path. Run the `ui-review` skill on the screen derived from the code, or record in the review that the screen check was skipped and why. Do not push `.compare`.
   - Both modes: run the `ui-review` skill on each screenshot. Add the findings table to the review
   - An open blocker (no fix and not 'accepted by user') is a fail.
6. **Privacy**: fixtures, examples, seeds, test data and screenshots contain no real third-party personal data (names, emails, phone numbers, addresses, handles, photos). Synthetic data only. Real personal data is a fail

### Migration mode only

For each unit of the module:

1. Run the Parity checklist of `artifacts/02-discovery/units/<unit>/spec.md`.
2. If `migration.liveLegacy` is `true`, compare on both systems. Use the same user, tenant and locale on both.
3. Close each difference only by one of these:
   - a fix in the target code
   - a parity evidence file at `artifacts/06-evaluation/parity-evidence/<unit>-<n>.md` (template `parity-evidence.md`)
   - an `approved` row in `artifacts/03-modules/deviation-log.md`
4. When all differences are closed, run `haren track unit <module> <unit> verified`. If you did not use the live legacy system, set `static-review-only` instead.
5. After the BA signs off, run `haren track unit <module> <unit> parity-signed`.

Set the module to `completed` only after all its units are `parity-signed`.

## Output

Each task gets its own evaluation files using a per-task naming convention:

- **Review:** `artifacts/06-evaluation/{module}/task-{N}-{slug}-review.md`
- **Test report:** `artifacts/06-evaluation/{module}/task-{N}-{slug}-test-report.md`

### Naming Convention

- Format: `task-{number}-{slug}-review.md` and `task-{number}-{slug}-test-report.md`
- The slug matches the feature key in `progress.json`
- Examples: `task-1-scaffold-review.md`, `task-2-sync-skills-api-review.md`
- This allows parallel evaluation with no conflicts

### Review Content

Use the review template (`templates/review.md`) with the following structure:

If iterations are enabled (check manifest.yaml for `iterations` block), include the `iteration` field in the review frontmatter with the value of `currentIteration` from progress.json. If not enabled, omit it.

```markdown
# Review: {module} — Task {N}: {feature name}

**Verdict:** pass | fail
**Attempt:** {1|2|3}
**Date:** {date}
**Iteration:** {N} ← only if iterations enabled

## Summary
{brief assessment}

## Criteria
| Criterion | Result | Detail |
|-----------|--------|--------|
| Functionality | pass/fail | {detail} |
| Completeness | pass/fail | {detail} |
| Correctness | pass/fail | {detail} |
| Integration | pass/fail | {detail} |
| Screens | pass/fail/n.a. | {mockup option, screenshot links} |
| Privacy | pass/fail | {detail} |

## Issues
{If fail — numbered list with file:line, description, suggested fix}

## Test Report
{Test execution summary and coverage}
```

### Test Report

The `task-{N}-{slug}-test-report.md` captures test execution output and coverage data.

## After Review

- Register the review: `haren track artifact <id> --type review --path <review path> --module <module>`
- **Pass**: `haren track feature <module> <feature> passing`
- **Fail (attempt < 3)**: `haren track feature <module> <feature> fixing`. The developer reads review.md and fixes
- **Fail (attempt 3)**: `haren track feature <module> <feature> blocked`, then `haren track event escalate-human --module <module> --phase evaluate --feature <feature> --data '{"attempt":3}'`
- Never edit `progress.json` or `events/events.jsonl` by hand (see update-tracking skill)

## Rules

- Check against the SPEC, not the design or tasks — you are independent
- Run all tests before writing the review
- Be specific in failure reports — file paths, line numbers, expected vs actual
- Do not rubber-stamp — your independence is the framework's quality guarantee
- Delegate to superpowers:requesting-code-review for structured review process
