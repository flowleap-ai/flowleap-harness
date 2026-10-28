---
name: verify
description: Drive the FlowLeap Patent AI Web app (the `flowleap-web` dsh profile) the way an attorney does, and capture live evidence from the browser and the Session log. Use for live proof of any product-visible change in this fork, such as the Patent Agent turn, the FlowLeap connectors, routines on the Automation tasks page, deliverables, brand, or settings, before you claim the change works or open its PR.
---

# Verify FlowLeap Patent AI

Start one isolated `flowleap-web` instance from this checkout, drive it in a browser, read its Session log, and stop it. A live model turn uses Claude Haiku 5.5 on OpenRouter. The founder's Anthropic credits are low, so do not use the Anthropic route.

Live proof does not replace tests. Keep the focused tests, the keyless snapshots (`pnpm run test:snapshot`), and [dsh-pre-push-checks](../dsh-pre-push-checks/SKILL.md). A GUI PR also needs a GIF from [record-browser-gif](../record-browser-gif/SKILL.md); its storyboard can be a recipe from [features/](features/README.md).

## Files

| File | Use |
|---|---|
| [`scripts/web.sh`](scripts/web.sh) | `start`, `doctor`, `stop` for one instance in one run directory |
| [`scripts/session-log.mjs`](scripts/session-log.mjs) | Summary of a Session log: route, user text, tool calls with result heads, turn end, token use, last answer |
| [`verify.patch.yml`](verify.patch.yml) | Overlay: OpenRouter Haiku as default model, the firm keys as a read-only credential file, plain JSONL logs, Default workspace in the run directory |
| [`features/`](features/README.md) | One recipe per FlowLeap surface |

## Launch

1. Build once per checkout: `pnpm install` and `pnpm run build:artifacts` (about 3 minutes). `web.sh start` stops with an error when `apps/web/dist` is missing.
2. Pick a run directory in your scratchpad, for example `RUN=<scratchpad>/verify-run`. Use a different port for each instance that runs at the same time.
3. Start:

```sh
.claude/skills/verify/scripts/web.sh start "$RUN" 3180
```

The command prints `ready: http://127.0.0.1:3180/?token=…` when the page loads. The token is the access key of the instance. Use it in the browser. Do not put it in a PR, a note, or a commit.

The instance runs with `--profile flowleap-web`, the overlay [`apps/web/tests/pin-browse-picker.overlay.yml`](../../../apps/web/tests/pin-browse-picker.overlay.yml) (the in-page directory picker, which a browser tool can drive), and [`verify.patch.yml`](verify.patch.yml). `DSH_HOME` is `$RUN/home`, so profiles, settings, Sessions, schedule storage, and the writable credential store are new for each run. `start` copies the `flowleap-connectors/*` records of the founder's credential file to `$RUN/firm-keys.yaml` (mode 600), and the overlay gives that copy to the credential store as `readOnlyPath`. The server log is `$RUN/server.log`.

After a Host change, stop and start again. For a client-only change, run `pnpm run dev:web --skip-build --no-serve` beside the instance: the server reloads the page when a bundle changes.

## Doctor

Run this first, and again when something looks wrong:

```sh
.claude/skills/verify/scripts/web.sh doctor "$RUN"
```

Every `PASS` line must show. A `FAIL plugins` line means a row did not activate; the `LOG` lines name the row and the error. A `WARN flowleap CLI` line means the paid `mcp__flowleap__*` tools are absent; the office tools still work.

## Drive

Use the session's browser tool (in Claude Code, the built-in browser pane). Use the Playwright copy in `apps/web/package.json` only when no browser tool is available, as [record-browser-gif](../record-browser-gif/SKILL.md) says. Find elements by role and accessible name:

| Element | Role and name |
|---|---|
| First-run dialog | dialog `Preview notice`, button `Continue`; it can show a few seconds after the page loads |
| Composer | textbox `Describe what you want to build, / commands, @ files or sessions` (new Session), textbox `Message or run a task, / commands, @ files or sessions` (open Session) |
| Send | Enter in the composer, or button `Send message` |
| Model | button `Select model, current Anthropic: Claude Haiku 5.5, …` (the OpenRouter display name) |
| Preset | button `Choose the agent preset for your new task`; the default is `Patent Agent` |
| Sidebar | buttons `New session`, `Automation tasks`, `Settings` |

Wait for text or a status, not for a fixed time. A turn is done when the answer text shows and the composer is empty again.

## Evidence

Put all proof in `$RUN/evidence/`. `web.sh stop` keeps it.

- The Session log is the main proof. It records everything the model saw and did. Run `node .claude/skills/verify/scripts/session-log.mjs "$RUN/home" > "$RUN/evidence/<feature>.session.txt"`. Add `--json` for the full summary. The log file is `$RUN/home/sessions/<project key>/session-<id>/session.v4.jsonl`, one JSON event for each line.
- Check `routes:`. It must show `openrouter/anthropic/claude-haiku-5.5`. Check `preset=patent` (or the agent id for a Session of a built agent), the tool calls you expect, and `turn N: completed`.
- Take a screenshot of the state after the action, and save it in `$RUN/evidence/`.
- For a side effect, show it from a second view. Examples: a task on the Automation tasks page, a file in `$RUN/workspace/deepseek-harness/default-workspace/`, a `Connection test passed` status.
- In the PR, give the commit, the feature IDs, the route, the token use, and the result. Do not give the URL token, key values, or full tool results with client data.

## Cost

The Patent Agent system prompt and the tool list are about 60,000 to 70,000 input tokens for each new Session. A one-line answer adds almost nothing. On Haiku 5.5 through OpenRouter a ping turn costs a few cents. To keep cost low:

- Prove a surface with one Session and few turns. Ask for a short, exact answer, such as `Reply with exactly: FLOWLEAP-VERIFY-OK`.
- Ask for one named tool call, not a research task. Each tool result goes into the next request.
- Prove settings and pages without a turn, because they use no model tokens.
- Use a stronger model only when the change is about model behavior. Change it in the composer for that Session, and write the model in the evidence.

## Cleanup

```sh
.claude/skills/verify/scripts/web.sh stop "$RUN"
```

This stops only the PID that `start` wrote, and deletes `$RUN/firm-keys.yaml`. Do not stop processes by name, because the founder's own `dsh web` can run on port 3080. When the evidence is in the PR, delete `$RUN/home` and `$RUN/workspace`. Keep `$RUN/evidence` until the PR merges.

## What needs the founder

| Need | Where it is | Without it |
|---|---|---|
| `OPENROUTER_API_KEY` | The founder's shell environment | No live turn. `web.sh start` stops |
| Firm keys: EPO OPS, USPTO ODP, Mistral (Semantic Scholar is not set) | `~/.dsh/.credentials.yaml`; set `DSH_VERIFY_CREDENTIALS` to use another file | The office tools answer `missing_credentials`; the connector cards show `Not configured` |
| `flowleap` CLI signed in | `flowleap auth login` on the founder's Mac (it opens a browser) | No `mcp__flowleap__*` tools |
| `DEEPSEEK_API_KEY` | Not available | `pnpm dsh --profile headless` and `pnpm run test:e2e` cannot run live; `test:snapshot:record` cannot record |
| New or changed keys | Only the founder enters them | Ask the founder |

A run reads the firm keys and cannot change them. The connector cards show `The credential store is read-only in this deployment.`, and `Save` and `Remove` are disabled. `Test connection` only reads. Do not mount the whole founder file as `readOnlyPath`: it also holds the `client-connection/browser-session` record, which the server must write, so startup fails.

## When this skill is wrong

Correct this skill and its feature files in the same PR as the change that showed the error. Examples: a renamed accessible name, a new required key, a changed default route.
