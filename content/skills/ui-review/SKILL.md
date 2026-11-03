---
name: ui-review
description: Review a screen mockup or screenshot against UX heuristics and report findings by severity
type: utility
---

# UI Review

Review one screen against a fixed set of UX heuristics. Report each problem as a finding with a severity and a fix.

## When to Use

- In the **plan** phase, after the user chooses a mockup for a screen.
- In the **evaluate** phase, on a screenshot of the built screen.
- When the user asks for a UX review of a screen.

## Input

- The chosen mockup (ASCII wireframe or companion HTML) or a screenshot of the screen.
- The spec stories for the screen (acceptance criteria, roles, data).

## Checklist

Check each item. Record a finding for each problem.

1. **States**: empty, loading, error, success, no permission.
2. **Accessibility**: text contrast, focus and tab order, labels and alt text, touch target size.
3. **Navigation**: exit, back, breadcrumb or location.
4. **Consistency**: other screens, design system if any.
5. **Content**: clear labels, error messages say how to fix.
6. **Responsive**: narrow and wide.

## Severity

- `blocker`: the user cannot complete the task, or the screen fails a basic accessibility need.
- `major`: the user can complete the task, but with difficulty or a high chance of error.
- `minor`: a small problem in polish or consistency.

## Output

Write one table:

```markdown
| ID | Screen | Heuristic | Severity | Finding | Fix |
|----|--------|-----------|----------|---------|-----|
| UR-1 | Orders list | States | blocker | No error state when the load fails | Add an error message with a retry button |
| UR-2 | Orders list | Accessibility | major | The filter input has no label | Add a visible label "Filter orders" |
| UR-3 | Orders list | Consistency | minor | The title and the menu item use different words | Use "Orders" in both |
```

Severity is one of `blocker | major | minor`.

## Where It Goes

- **Plan**: add the table under `## UI Review` in `design.md` of the module.
- **Evaluate**: add the table to the review file of the module.
- **Browser mode** (`ui.mockups` is `browser`, or the user chose the browser): also push a `.findings` screen with the visual companion (see visual-companion/).

## Rule

**Caution:** a blocker stops the module. Before the module goes to `planned`, do one of these for each blocker:

1. Fix it in the mockup, and review the screen again.
2. Get the user to accept it. Write "accepted by user" in the Fix column.
