# HackW1TouchGrass

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

No application framework, provider change, global MCP configuration change,
credential file, or scheduled background job was added.

## Moving this workspace to another machine

Install the gateway using the [official DevRelay setup instructions](https://devrelay.com/#install),
then update the executable path in `opencode.json` for that machine.
Keep authentication credentials outside the project.
The configuration uses [OpenCode's local MCP format](https://opencode.ai/docs/mcp-servers/#local).
