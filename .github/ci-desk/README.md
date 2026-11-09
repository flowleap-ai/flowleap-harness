# Desk CI runner

The desk CI runner runs the `node 24 / coverage` job of the full CI lane on the Mac Studio "desk" (Apple M1 Max, 10 cores, 32 GB) instead of a free 4-CPU GitHub runner. Every other job stays on GitHub's runners. The [lanes decision](../../.agents/notes/implemented/process/2026-11-09-fork-ci-draft-and-full-lanes.md) records why.

## How it works

- **Routing.** The `lane` job in [ci.yml](../workflows/ci.yml) sends coverage to desk only when the repository variable `DSH_CI_DESK` is `on`, the code belongs to this repository (a push to `flowleap`, or a pull request whose head repository is this repository and whose author is not Dependabot), and the GitHub API reports a desk runner that is online and idle. In every other case, an API error included, coverage runs on `ubuntu-latest`. GitHub gives no secret to a fork pull request, so a fork run cannot even ask.
- **Isolation.** A LaunchDaemon runs [launcher.sh](launcher.sh) as the hidden standard macOS user `ghci`, not as the founder. The launcher keeps one colima Linux VM (arm64, 8 CPUs, 20 GB memory, 60 GB disk). The VM shares only one empty, read-only directory with the Mac; the launcher stops the VM if it can see any other host path. Each job runs in a new container from [Dockerfile](Dockerfile), and the container is deleted after the job. The container has no host mount.
- **Credentials.** The runner registration token stays in `/Users/ghci/.config/dsh-ci/runner-token` (mode 600, owner `ghci`). The launcher sends it to GitHub on standard input and receives a one-time runner configuration. The token never enters the VM or a job. The status token is the repository secret `DSH_CI_DESK_STATUS_TOKEN`, which only the `lane` job on a GitHub runner reads.
- **One job at a time.** The launcher registers one just-in-time runner, waits for one job, deletes the container, and registers the next runner.
- **Disk.** The launcher prunes containers, images, and build cache older than 7 days once a week.

## Limits

- A job that routing sent to desk waits for desk. If desk goes offline after the `lane` job picked it, the coverage job stays queued until desk returns. Cancel the run, set `DSH_CI_DESK` to `off`, and re-run it on GitHub's runners.
- Two runs that start within seconds can both see desk idle; the second coverage job then waits for the first one to finish.
- seccomp and AppArmor are unconfined in the job container so that bubblewrap works. Code in a job can reach the VM's kernel and the local network, but not the Mac's files. Only code from this repository runs there.

## Setup

1. As `neoak` on desk: `brew install colima docker docker-buildx`.
2. In GitHub, as the founder: create the fine-grained token "desk runner registration" (resource owner `flowleap-ai`, repository `flowleap-harness` only, permission Administration: Read and write, 90 days) and the token "desk status read" (same repository, Administration: Read-only, 90 days).
3. On desk, from a copy of this directory: `sudo bash setup.sh`. Paste the "desk runner registration" token at the hidden prompt.
4. On any machine with `gh`: `gh secret set DSH_CI_DESK_STATUS_TOKEN -R flowleap-ai/flowleap-harness` and paste the "desk status read" token at the hidden prompt.
5. `gh variable set DSH_CI_DESK -R flowleap-ai/flowleap-harness --body on`.

The log is `/Users/ghci/Library/Logs/dsh-ci-desk.log`. The runners appear under Settings, Actions, Runners with the label `desk`.

## Removal

1. `gh variable set DSH_CI_DESK -R flowleap-ai/flowleap-harness --body off`. Coverage returns to GitHub's runners at once.
2. On desk: `sudo bash remove.sh`. It stops the LaunchDaemon, deletes the VM and the `ghci` user, and restores the previous sleep setting.
3. `gh variable delete DSH_CI_DESK -R flowleap-ai/flowleap-harness` and `gh secret delete DSH_CI_DESK_STATUS_TOKEN -R flowleap-ai/flowleap-harness`.
4. Delete any runner with the label `desk` that is still listed under Settings, Actions, Runners.
5. Revoke both tokens in the founder's GitHub settings.
