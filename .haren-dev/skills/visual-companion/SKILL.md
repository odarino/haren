---
name: visual-companion
description: Show mockups, layout options and diagrams in a browser tab and read the user's clicks
type: utility
---

# Visual Companion

The visual companion is a local browser tab. It shows mockups, layout options and diagrams. The user clicks an option, and you read the click on your next turn.

## When to Use

Decide for each question, not for each session. The test: **does the user understand this better when they see it?**

**Use the browser** when the content is visual:

- **UI mockups**: wireframes, layouts, navigation structures, component designs
- **Layout comparisons**: two layouts, two color schemes, two design directions
- **Diagrams**: system components, data flow, state machines, flowcharts
- **Side-by-side views**: a mockup next to a screenshot, before and after
- **Design polish**: look and feel, spacing, visual hierarchy

**Use the terminal** when the content is text or a table:

- **Requirements and scope questions**: "what does X mean?", "which features are in scope?"
- **Conceptual A/B/C choices**: approaches that you describe in words
- **Tradeoffs**: pros and cons, comparison tables
- **Technical decisions**: API design, data model, architecture
- **Clarifying questions**: the answer is words, not a visual preference

A question about a UI topic is not automatically a visual question. "What kind of wizard do you want?" is conceptual. Use the terminal. "Which of these wizard layouts is better?" is visual. Use the browser.

## Mode

Read `ui.mockups` in `manifest.yaml`.

- `ascii`: never use the browser. Use ASCII wireframes (see generate-mockup/).
- `browser`: use the browser for visual questions. Do not ask first.
- `ask`: at the first visual question in a session, send the offer as its own message, with nothing else:

  > This next part is easier to show than to describe. I can open a browser tab with mockups and options. Choose: (1) this time, (2) always, (3) no, use ASCII.

  - On (1): use the browser for this session.
  - On (2): run `haren track ui-mode browser`, then use the browser.
  - On (3): ask "Always use ASCII?". If yes, run `haren track ui-mode ascii`. Use ASCII.

## How It Works

The companion server watches a folder for HTML files. It shows the newest file in the browser. You write HTML into `screen_dir`. The user sees it and clicks to select options. The server writes the clicks to `state_dir/events`. You read that file on your next turn.

**Content fragments vs full documents:** If your file starts with `<!DOCTYPE` or `<html`, the server sends it as it is (it only adds the helper script). Otherwise, the server puts your content in the frame template: header, theme CSS, connection status and click handling. **Write content fragments by default.** Write a full document only when you need full control of the page.

## Start

```bash
haren companion start --open

# Prints: {"type":"server-started","port":52341,
#          "url":"http://localhost:52341/?key=ab12...",
#          "screen_dir":"<haren>/.companion/12345-1706000000/content",
#          "state_dir":"<haren>/.companion/12345-1706000000/state"}
```

1. Save `screen_dir` and `state_dir` from the output.
2. Give the user the full URL from the `url` field. With `--open`, the browser opens itself, but headless or remote setups need the URL.

**Caution:** the URL contains a session key (`?key=...`). The server rejects requests without the key. Always give the complete URL. Never strip the query string. Never give a bare `http://host:port`.

If the companion runs already, `haren companion start` uses the same session again. It ignores extra flags (for example `--port`) and prints a warning. To find the connection data later, run `haren companion status`, or read `state_dir/server-info`.

**Windows, and hosts that stop background processes:** run `haren companion start --open --foreground` in a background shell (for example `run_in_background: true` on the Bash tool). The process must stay alive across turns.

If the browser cannot reach the URL (remote or container setups), bind a different host:

```bash
haren companion start --open --host 0.0.0.0 --url-host localhost
```

Other options: `--port <n>`, `--idle-timeout-minutes <n>`.

The server stops when the agent process that started it exits. If the owner check is wrong (the server stops right after the start command), or the server must outlive the agent, add `--no-owner-watch`. Then only the idle timeout and `haren companion stop` stop it.

## The Loop

1. **Check the server**: run `haren companion status` before every push. Exit 0 means it runs. If it stopped, run `haren companion start --open`. It restarts the same session with the same URL, key, port, `screen_dir` and `state_dir`. The open tab connects again, and you do not need to send a new URL. If the CLI prints "port changed, give the user the new URL", the old port was busy. Then give the user the new URL.
2. **Write the screen**: write a new HTML file in `screen_dir` with your file tool. Do not use cat or a heredoc.
   - Use a semantic name: `layout.html`, `visual-style.html`, `navigation.html`.
   - Never use a file name again. For a new version, write `layout-v2.html`, `layout-v3.html`.
3. **Tell the user and end the turn**:
   - Give the URL again (at every step).
   - Give a short summary of the screen, for example "Showing 3 layout options for the dashboard".
   - Ask the user to answer in the terminal: "Look at the options and tell me what you think. Click an option to select it."
   - End your turn.
4. **On the next turn**: read `state_dir/events` if it exists. It is JSONL. The last click is usually the choice. If the file does not exist, the user did not click. Merge the clicks with the terminal message. The terminal message is the primary feedback.
5. **Iterate or advance**: if the feedback changes the screen, write a new version file. Go to the next question only when the user accepts the current step.
6. **Go back to the terminal**: when the next step is text, push `waiting.html` (or `waiting-2.html`) to remove the old content:

   ```html
   <div style="display:flex;align-items:center;justify-content:center;min-height:60vh"><p class="subtitle">Continuing in terminal...</p></div>
   ```

## Durable Record

The browser screens are temporary. Always write the chosen option as an ASCII wireframe into the artifact too (`design.md` in plan, the review file in evaluate). Record the choice and the reason. The artifact is the record, not the screen.

## Minimal Example

```html
<h2>Which layout works better?</h2>
<p class="subtitle">Think about readability and visual hierarchy</p>

<div class="options">
  <div class="option" data-choice="a" onclick="toggleSelect(this)">
    <div class="letter">A</div>
    <div class="content">
      <h3>Single column</h3>
      <p>One focused column of content</p>
    </div>
  </div>
  <div class="option" data-choice="b" onclick="toggleSelect(this)">
    <div class="letter">B</div>
    <div class="content">
      <h3>Two columns</h3>
      <p>Sidebar navigation with main content</p>
    </div>
  </div>
</div>
```

You do not need `<html>`, CSS or `<script>` tags. The server adds them.

## CSS Classes

The frame template gives these classes.

### Options (A/B/C choices)

```html
<div class="options">
  <div class="option" data-choice="a" onclick="toggleSelect(this)">
    <div class="letter">A</div>
    <div class="content"><h3>Title</h3><p>Description</p></div>
  </div>
</div>
```

**Multi-select:** add `data-multiselect` to the container. Each click then toggles one item.

```html
<div class="options" data-multiselect>
  <!-- same option markup -->
</div>
```

### Cards (visual designs)

```html
<div class="cards">
  <div class="card" data-choice="design1" onclick="toggleSelect(this)">
    <div class="card-image"><!-- mockup content --></div>
    <div class="card-body"><h3>Name</h3><p>Description</p></div>
  </div>
</div>
```

### Mockup container

```html
<div class="mockup">
  <div class="mockup-header">Preview: Dashboard layout</div>
  <div class="mockup-body"><!-- mockup HTML --></div>
</div>
```

### Split view (side by side)

```html
<div class="split">
  <div class="mockup"><!-- left --></div>
  <div class="mockup"><!-- right --></div>
</div>
```

### Pros and cons

```html
<div class="pros-cons">
  <div class="pros"><h4>Pros</h4><ul><li>Benefit</li></ul></div>
  <div class="cons"><h4>Cons</h4><ul><li>Drawback</li></ul></div>
</div>
```

### Mock elements (wireframe parts)

```html
<div class="mock-nav">Logo | Home | Orders | Settings</div>
<div style="display: flex;">
  <div class="mock-sidebar">Navigation</div>
  <div class="mock-content">Main content area</div>
</div>
<button class="mock-button">Action</button>
<input class="mock-input" placeholder="Input field">
<div class="placeholder">Placeholder area</div>
```

### Compare (mockup next to screenshot, with a verdict)

Use this in evaluate to compare the approved mockup with a screenshot of the built screen.

```html
<h2>Does the built screen match the mockup?</h2>
<div class="compare">
  <div class="pane"><div class="label">Mockup</div><!-- mockup HTML --></div>
  <div class="pane"><div class="label">Screenshot</div><img src="/files/orders-list.png" alt="Built orders list"></div>
</div>
<div class="verdict">
  <button class="pass" data-choice="pass" onclick="toggleSelect(this)">Pass</button>
  <button class="fail" data-choice="fail" onclick="toggleSelect(this)">Fail</button>
</div>
```

### Findings (review results by severity)

Use this to show ui-review/ results.

```html
<h2>UI review: Orders list</h2>
<ul class="findings">
  <li class="blocker"><strong>UR-1 blocker</strong>: no error state when the load fails</li>
  <li class="major"><strong>UR-2 major</strong>: the filter input has no label</li>
  <li class="minor"><strong>UR-3 minor</strong>: the page title and menu item use different words</li>
</ul>
```

### Text and sections

- `h2`: page title
- `h3`: section heading
- `.subtitle`: secondary text below the title
- `.section`: content block with a bottom margin
- `.label`: small uppercase label

## Events Format

The server writes the user's clicks to `state_dir/events`, one JSON object for each line. The server clears the file when a new screen appears.

```jsonl
{"type":"click","choice":"a","text":"Option A - Single column","timestamp":1706000101}
{"type":"click","choice":"b","text":"Option B - Two columns","timestamp":1706000115}
```

`timestamp` is in unix seconds. The full list shows the path of the user. The last click is usually the final choice. Many clicks between options can show doubt. Ask about it.

## Design Tips

- **Show 2-4 options** on each screen.
- **Match the fidelity to the question**: wireframes for layout, more detail for polish questions.
- **Explain the question on each page**: write "Which layout is easier to scan?", not only "Pick one".
- **Use real content when it matters**: placeholder text can hide design problems.
- **Iterate before you advance**: if the feedback changes the screen, write a new version.

## File Naming

- Use semantic names: `layout.html`, `visual-style.html`.
- Never use a file name again. Each screen is a new file.
- For versions, add a suffix: `layout-v2.html`, `layout-v3.html`.
- The server shows the newest file by modification time.

## Cleanup

```bash
haren companion stop
```

The screen files stay in `<haren>/.companion/` for reference.

Adapted from the superpowers visual companion (MIT).
