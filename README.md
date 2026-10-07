# HackW1TouchGrass

## I Know a Spot — application workspace

Mobile-web pilot with a later Capacitor path. See [PRD.md](PRD.md), the
[36-hour build plan](BUILD_SCOPE_36H.md), and [future scope](FUTURE_SCOPE.md).

- [SETUP.md](SETUP.md): manual install/environment/run/check commands.
- [frontend/](frontend/): React/TypeScript/Vite scaffold (port 5173).
- [backend/](backend/): Node/TypeScript/Fastify scaffold (port 3001).
- [AGENTS.md](AGENTS.md) and [WORKBOARD.md](WORKBOARD.md): bounded agent workflow.
- `.opencode/agents/`: frontend/backend implementation agent definitions.

**Scaffold only:** no completed auth, feeds, photos, AI, or native wrapping.
Packages are declared; the user installs them. The earlier DevRelay setup below
is preserved as historical context, not evidence that the application works.

An OmniRush.ai workspace configured for DEV community article research through
the DEV/MLH DevRelay gateway at [devrelay.com](https://devrelay.com/).
This is separate from the company-content service at devrelay.so.

## Workspace configuration

- `opencode.json` enables the local `devrelay-gateway` MCP server.
- `.opencode/skills/devrelay-navigator/SKILL.md` routes DEV searches, article reads,
  and comment lookups to the appropriate gateway tools.
- `.opencode/skills/devrelay-community-wisdom/SKILL.md` provides the official
  community-research and citation workflow.

The gateway uses the existing executable at
`/home/yashraj/.devrelay/bin/dev_mlh_mcp_server`. The binary is shared with this
machine's other clients; it was not duplicated or reinstalled inside the project.
The two skills are workspace-local copies of the corresponding official skills
already installed under `~/.agents/skills/`.

## Using it in OmniRush.ai

Select **HackW1TouchGrass** in the workspace sidebar and start a new chat there.
For example:

> Use DevRelay to search DEV for practical advice on local MCP stdio server setup.
> Read a useful article and its comments, then summarize with source links.

Relevant tools include `search_dev_to_semantic`, `get_article_content`, and
`get_comments`. The skills supply guidance; the MCP executable supplies the tools.

Public article research was tested successfully. Actions on your own DEV account,
including publishing, require the appropriate MLH sign-in and linked DEV account.
No publishing permission has been verified, and nothing was published.

## Checks performed on 2026-10-07

- The gateway's `--version` reported `devrelay 0.1.17`.
- `python3 -m json.tool opencode.json` passed.
- Both local skills were re-read and their names/descriptions validated.
- A real MCP initialize handshake and tool-list request succeeded using the
  command from this project's configuration.
- A semantic search for local MCP setup and credential security returned three
  DEV articles.
- Full article retrieval and comment retrieval both succeeded.
- An independent OmniRush workspace lookup recognized HackW1TouchGrass after
  the original registration command's response timed out.

During that earlier DevRelay-only setup, no application framework, provider change,
global MCP configuration change, credential file, or scheduled background job was added.

## Moving this workspace to another machine

Install the gateway using the [official DevRelay setup instructions](https://devrelay.com/#install),
then update the executable path in `opencode.json` for that machine.
Keep authentication credentials outside the project.
The configuration uses [OpenCode's local MCP format](https://opencode.ai/docs/mcp-servers/#local).
