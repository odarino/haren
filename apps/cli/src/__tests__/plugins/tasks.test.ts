import { describe, expect, it } from "bun:test";
import { alignTaskKeys, parseTasksFile, slugify } from "../../plugins/tasks";

const text = `---
module: checkout
---

# Tasks: checkout

## Task 1: Add cart API

**Story:** STORY-001
**Description:** Create the cart endpoints
**Dependencies:** none

---

## Task 2: Cart UI & totals

**Description:** Render the cart
**Dependencies:** Task 1
`;

describe("parseTasksFile", () => {
  it("slugifies titles", () => {
    expect(slugify("Cart UI & totals")).toBe("cart-ui-totals");
  });
  it("extracts tasks with keys and dependencies", () => {
    expect(parseTasksFile(text)).toEqual([
      {
        key: "task-1-add-cart-api",
        number: 1,
        title: "Add cart API",
        description: "Create the cart endpoints",
        dependencies: [],
      },
      {
        key: "task-2-cart-ui-totals",
        number: 2,
        title: "Cart UI & totals",
        description: "Render the cart",
        dependencies: ["task-1-add-cart-api"],
      },
    ]);
  });
});

describe("alignTaskKeys", () => {
  const tasks = parseTasksFile(text);
  it("keeps computed keys when nothing exists", () => {
    expect(alignTaskKeys(tasks, [])).toEqual(tasks);
  });
  it("uses the existing key with the same task number and fixes dependencies", () => {
    const out = alignTaskKeys(tasks, ["task-1-add-the-cart-api", "task-2-cart-ui-and-totals"]);
    expect(out.map((t) => t.key)).toEqual(["task-1-add-the-cart-api", "task-2-cart-ui-and-totals"]);
    expect(out[1]!.dependencies).toEqual(["task-1-add-the-cart-api"]);
  });
  it("does not match task-1 against task-10", () => {
    expect(alignTaskKeys(tasks, ["task-10-other"]).map((t) => t.key)).toEqual([
      "task-1-add-cart-api",
      "task-2-cart-ui-totals",
    ]);
  });
  it("does not mutate the input", () => {
    const copy = structuredClone(tasks);
    alignTaskKeys(tasks, ["task-2-x"]);
    expect(tasks).toEqual(copy);
  });
  it("picks the first existing key when several share a task number", () => {
    const out = alignTaskKeys(tasks, ["task-2-first", "task-2-second"]);
    expect(out[1]!.key).toBe("task-2-first");
  });
});
