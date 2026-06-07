# haren

Minimal, skill-based agentic SDLC framework. `haren` scaffolds a structured
workspace (agents, skills, templates) that drives an AI coding agent through a
phased software-development lifecycle: research → discover → decompose → plan →
implement → evaluate.

## Requirements

- **[Bun](https://bun.com) ≥ 1.2** must be installed and on your `PATH`.
  haren runs on the Bun runtime; Node.js alone is not sufficient.

## Install

```bash
npm install -g haren
# or run without installing:
npx haren init
```

## Usage

```bash
haren init       # scaffold a haren workspace in ./haren
haren upgrade    # update an existing workspace to the latest content
haren agent      # run the agent bridge for the workspace
```

Run `haren` with no arguments for help.

## License

MIT — see [LICENSE](./LICENSE).
