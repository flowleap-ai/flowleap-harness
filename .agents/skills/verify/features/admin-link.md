# Firm admin link

A firm administrator sees the row `Firm admin` in the sidebar, under `Search`; it opens the firm admin console at `admin/` in the same tab. Other attorneys do not see it. The runtime shows the row only when the page's request carries the header `X-Flowleap-Admin` that the flowleap-os starter signs for an administrator; the runtime has only the starter's public key. On a firm the console is a flowleap-os service, so a local instance proves the row and its target, not the console.

## Sub-features

- `admin-link-hidden` shows no row when the request has no signed header.
- `admin-link-shown` shows the row, with the target `admin/`, when the request has a header that the starter's key signed.
- `admin-link-forged` shows no row for a header that the browser sends, or that another key signed, or for a request that does not pass through the starter.

## How to get to it (user POV)

Sign in at the firm address as an administrator and look at the sidebar under `Search`. The browser asks `api/flowleap/admin-link` once when the page loads, so a role change shows after the next page load.

## Driving it with the browser tool

Preconditions:

- The baseline in [README.md](./README.md).
- Start the instance with `DSH_VERIFY_PATCH=.claude/skills/verify/features/admin-link.patch.yml` and `DSH_VERIFY_ADMIN_LINK_KEY="$RUN/admin-link.pub"`. The overlay points the row at that file.
- Start the starter double [`scripts/admin-signer.mjs`](../scripts/admin-signer.mjs) in the background: `node .claude/skills/verify/scripts/admin-signer.mjs 3181 http://127.0.0.1:3180 "$RUN"`. It writes `$RUN/admin-link.pub` and forwards port 3181 to the instance. Open the `ready:` link with port 3181 in place of 3180.

- **Hidden.** With no `$RUN/admin` file, the sidebar has no `Firm admin` link, and `fetch('api/flowleap/admin-link')` in `javascript_tool` answers `{"href":null}`.
- **Shown.** `touch "$RUN/admin"` and load the page again. The link `Firm admin` shows under `Search`, its `href` is `admin/`, and the route answers `{"href":"admin/"}`.
- **Forged.** `rm "$RUN/admin"`, then send the route request with a header `x-flowleap-admin: v1.<now + 30>.<64 random bytes in base64url>` from `javascript_tool`: the double removes it, and the route answers `{"href":null}`. To skip the double, call port 3180 with `curl`, the instance cookie, and a header that another Ed25519 key signed: `{"href":null}`. Without the cookie the route answers 401.
- On a firm, the flowleap-os verify skill proves the same through the real starter (`acceptance/console.mjs --app-link shown|hidden`).

## Gotchas

- The overlay is a `--patch` file, so it applies although the bundle locks the row against user patches.
- The route reads the key file on each request; the double writes a new key pair at each start, so start the double before you load the page.
- The row registers after the route answers, so wait for the link (or for the route answer) before you decide that it is hidden.
