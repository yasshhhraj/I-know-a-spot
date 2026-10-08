# HackW1TouchGrass

## I Know a Spot — application workspace

Mobile-web pilot with a later Capacitor path. See [PRD.md](PRD.md), the
[36-hour build plan](BUILD_SCOPE_36H.md), and [future scope](FUTURE_SCOPE.md).

- [SETUP.md](SETUP.md): manual install/environment/run/check commands.
- [SUPABASE_SETUP.md](SUPABASE_SETUP.md): user-run migration, account enrollment,
  and live auth/RLS verification steps.
- [SPOT_SHARING_SETUP.md](SPOT_SHARING_SETUP.md): user-run spot/private-Storage
  migration, backend-only admin configuration and live audience/media checks.
- [NEXT_FEATURE_PLAN.md](NEXT_FEATURE_PLAN.md): implementation handoff for the
  Public feed, saved-radius and manual discovery-area slice.
- [PUBLIC_DISCOVERY_SETUP.md](PUBLIC_DISCOVERY_SETUP.md): new Public-feed migration,
  manual area/radius setup and user-run live boundary checks.
- [SEMANTIC_SEARCH_SETUP.md](SEMANTIC_SEARCH_SETUP.md): MiniLM search, guarded
  searchable-spot SQL fixtures/cleanup and user-run checks; no new search migration.
- [SEMANTIC_SEARCH_EVALUATION.md](SEMANTIC_SEARCH_EVALUATION.md): actual local
  MiniLM/HTTP synthetic comparison against keywords, with limits.
- [EXPLORED_SETUP.md](EXPLORED_SETUP.md): private self-reported explored state,
  new migration0004 and user-run persistence/authorization checks.
- [REPORTING_SETUP.md](REPORTING_SETUP.md): private predefined reports, new
  migration0005 and protected local operator review/removal commands and checks.
- [API_CONTRACT.md](API_CONTRACT.md): protected profile and spot/media API contract.
- [frontend/](frontend/): React/TypeScript/Vite app (port 5173).
- [backend/](backend/): Node/TypeScript/Fastify API (port 3001).
- [AGENTS.md](AGENTS.md) and [WORKBOARD.md](WORKBOARD.md): bounded agent workflow.
- `.opencode/agents/`: frontend/backend implementation agent definitions.

**Incomplete pilot, locally tested:** auth plus photo/pin/note/audience sharing,
Connections/Public feed switch and map, saved radius/manual discovery center,
protected photo retrieval, detail/directions and owner metadata edits/deletion are
implemented, along with local MiniLM semantic search, explored-state API/control,
private report submission and protected local operator CLI. Reports require user-run
migration0005; no live reporting/persistence/removal claim yet. Both apps
typecheck/build; backend 137 tests and frontend 56 tests pass. Actual local synthetic retrieval
found expected spots for 11/11 positive queries versus 7/11 for simple keywords;
these are small fixture results, not pilot-corpus or live authorization evidence.
User reports live auth/sharing, owner/connection photos, deletion and unconnected
private-denial/Public-detail access, Public loading and saved-radius exclusion/
reload persistence and listed semantic-query/radius-reduction smoke checks working.
Listed explored activation/persistence/two-account checks are also user-confirmed.
Broader direct SQL/RLS/Storage/security, revocation, reporting activation/live
checks and phone checks remain pending. Native wrapping is unimplemented. Packages
were installed by the user. Earlier DevRelay setup below is historical context,
not proof of application functionality.

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
