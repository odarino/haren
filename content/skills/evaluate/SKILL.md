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
3. **Correctness**: Do tests pass?
   - Run the test suite
   - Check test coverage for the feature
4. **Integration**: Does it work with module interfaces?
   - Verify exposed interfaces match the spec's interface contracts

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

## Issues
{If fail — numbered list with file:line, description, suggested fix}

## Test Report
{Test execution summary and coverage}
```

### Test Report

The `task-{N}-{slug}-test-report.md` captures test execution output and coverage data.

## After Review

- **Pass**: Update feature status to "passing" via update-tracking skill
- **Fail (attempt < 3)**: Update feature status to "fixing", developer reads review.md and fixes
- **Fail (attempt 3)**: Update feature status to "blocked", emit "escalate-human" event

## Rules

- Check against the SPEC, not the design or tasks — you are independent
- Run all tests before writing the review
- Be specific in failure reports — file paths, line numbers, expected vs actual
- Do not rubber-stamp — your independence is the framework's quality guarantee
- Delegate to superpowers:requesting-code-review for structured review process
