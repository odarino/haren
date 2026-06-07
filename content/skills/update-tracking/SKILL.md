---
name: update-tracking
description: Update progress.json and propagate status changes
type: utility
---

# Update Tracking

Update module and feature status in progress.json with validated transitions.

## Operations

### Update Feature Status
1. Validate the transition is allowed (see state machine in spec section 10)
2. Update the feature's status in progress.json
3. If all features in a module are "passing", suggest module completion review
4. Append event to events/events.jsonl

### Update Module Status
1. Validate the transition is allowed
2. Update the module's status and currentPhase
3. Append event to events/events.jsonl

### Add Feature to Module
1. Add feature with "pending" status to the module's features map
2. Update progress.json

### Reconcile with Git
1. For each repo, compare progress.json lastCommit against git HEAD
2. If drift detected, warn user and update lastCommit
3. Flag any ambiguous state changes for human review

### Transition Iteration (only if iterations enabled)
1. Check if all tasks in the current iteration have status "passing"
2. If yes:
   - Increment `currentIteration` in progress.json
   - Update the iteration file (`07-iterations/iteration-{N}.md`) status to `complete`
   - If next iteration exists (already planned), set its status to `in-progress`
   - If no next iteration exists, suggest running the plan skill to slice the next iteration from the master plan
   - Append event to events/events.jsonl
3. Iteration transitions cannot be skipped — iteration N must complete before N+1 starts

## Valid Module Transitions

```
discovered → decomposed → planned → implementing → evaluating → completed
                                       ↑              |
                                       └── fix ───────┘
                                                      |
                                                 (3 failures)
                                                      ↓
                                                   blocked
```

## Valid Feature Transitions

```
pending → in-progress → evaluating → passing
                                   → fixing → evaluating (loop)
                                   → blocked (after 3 failures)
```

## Rules

- Always validate transitions — reject invalid ones with clear error messages
- Always update lastUpdated timestamp
- Always append an event after any status change
- Never silently change status — log everything
