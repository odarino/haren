import { describe, expect, it } from "bun:test";
import { parseTasksFile, slugify } from "../../plugins/tasks";

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
