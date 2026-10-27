# CLI contract: landlock-run

This file pins the launcher's externally observable behavior — the cross-repo compatibility surface between the binaries and every consumer. Consumers interact with it through the entry package (`launcherPath`/`probe`/`grantArgs`) and the launcher protocol; changing anything below requires a version bump for the whole package family and a note in the release notes.

## Invocation grammar

```text
landlock-run [--ro <path>]... [--rw <path>]... [--no-net] -- <argv>...
landlock-run --probe [--no-net]
```

- `--ro <path>`: grant read + execute beneath `<path>`.
- `--rw <path>`: grant full filesystem access beneath `<path>` (every access the negotiated kernel ABI can govern).
- Everything not granted is denied — Landlock rulesets are allow-lists.
- A grant on a non-directory keeps only its file-compatible access bits (this is how a `--rw /dev/null` grant works).
- `--no-net`: also install a seccomp filter that refuses `socket(2)` for every family except `AF_UNIX` with `EACCES`, and refuses `io_uring_setup(2)` and every syscall of a foreign ABI (x86 i386, x32) with `ENOSYS`. The command reaches no IP network, loopback included; Unix sockets keep working.
- `--`: mandatory separator; everything after it is the command argv, exec'd via `execvp` with the launcher's environment unchanged.
- `--probe`: mutually exclusive with grants and a command; it accepts `--no-net`.
- No other flags, no environment-variable inputs.

## Exit codes

- `125` (`LAUNCHER_FAILURE_EXIT`): every launcher-level failure — usage error, kernel that cannot enforce Landlock, unopenable grant root, failed `exec`. The wrapped command was NOT run.
- After a successful `exec`, every child status is passed through unchanged, including 125. Consumers therefore require both status 125 and a `landlock-run: ` fatal line to attribute launcher failure.
- `--probe`: `0` when the kernel enforces (fully or partially), `125` otherwise. With `--no-net`, `0` also requires that the filter installs and refuses an `AF_INET` socket while it allows an `AF_UNIX` socket.

## Report lines

- Probe success prints exactly one stdout line: `landlock: fully enforced` or `landlock: partially enforced (older ABI)`. The entry package's `probe()` maps these to `full`/`partial`; a non-zero probe exit maps to `unusable`.
- A confined run under a partial-ABI kernel prints one stderr line `landlock-run: partial enforcement (older Landlock ABI)` and proceeds — still confined for everything the kernel supports.
- Every fatal error prints one stderr line prefixed `landlock-run: ` before exiting `125`.

## Confinement semantics

The launcher sets `no_new_privs`, installs the ruleset on itself, and `exec`s the command; the ruleset is inherited across `execve`, so every descendant process is equally confined. The ruleset governs the filesystem accesses of the kernel's negotiated Landlock ABI (up to ABI 5); accesses newer than the running ABI are not governed and are the difference between `full` and `partial`. The `--no-net` filter is installed after the ruleset and is inherited the same way; it does not depend on the Landlock ABI, so it does not change `full` or `partial`.
