---
description: "The Firm admin row in the FlowLeap sidebar: shown only for a request with an X-Flowleap-Admin header that the flowleap-os starter signed with Ed25519; it opens the firm admin console."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-flowleap-admin-link

## Summary

A firm administrator sees a **Firm admin** row in the sidebar of `flowleap-web`; it opens the firm admin console of flowleap-os in the same tab. An attorney without the administrator role does not see it. The flowleap-os starter, the proxy in front of each attorney runtime, adds a signed `X-Flowleap-Admin` header to each request of an administrator. This package holds only the starter's public key, so the runtime and its tools can check the header but never make one.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the row with both fields; the [`dsh-flowleap-web`](../../bundle/flowleap-web/README.md) bundle does this under the id `flowleap-admin-link`:

```yaml
- id: flowleap-admin-link
  name: '@deepseek-ai/dsh-client-ui-flowleap-admin-link'
  config:
    publicKeyFile: ''        # the firm patch of flowleap-os sets /run/flowleap/host/admin-link.pub
    consoleHref: admin/
```

`publicKeyFile` is the absolute path of the starter's Ed25519 public key as an SPKI PEM file (`openssl pkey -pubout` output), or `''`, which means that no request shows the link. `consoleHref` is the console as a path relative to the document, such as `admin/`; a value with a scheme, a host, a leading slash, a query or a fragment fails the row at load, so the link cannot leave the origin of the Web app. A relative `publicKeyFile` also fails the row at load.

The browser asks `GET api/flowleap/admin-link` once at start. When the answer is `{ "href": "admin/" }`, the **Firm admin** row (`sidebar.actions`, order 90, a shield glyph, a tooltip on the rail) is a plain link to that path. For `{ "href": null }`, an error status, a failed request, or an answer that it cannot read, the sidebar shows no row and no error. The copy is in the `flowleapAdminLink` locale namespace in the eight shipped UI languages (en, zh, ja, es, fr, de, ru, pt).

### The header

`X-Flowleap-Admin: v1.<expiry>.<signature>`. `<expiry>` is Unix seconds as decimal digits; the starter sets now + 60. `<signature>` is the base64url Ed25519 signature, without padding, of the ASCII text `flowleap-admin-link.v1.<expiry>`. The route shows the link only for exactly one value of this form (Node joins a repeated header with `, `, which does not match) whose expiry is later than now and not later than now + 300 seconds, with a valid signature of the configured key.

The threat that the header stops: an attorney, or a page or tool in the attorney's runtime, that tries to show the console link to a user without the role. The starter drops each `X-Flowleap-Admin` header that a browser sends and adds its own only for an administrator. The runtime cannot sign, because it never holds the private key: a private key file at `publicKeyFile` is refused. The 300-second bound means a captured header cannot stay valid. The link only shows the way; the starter itself guards the console at `/admin/`.

### Failure behavior

A missing key file (`ENOENT`) means that this firm has no administrator sign-in: no link, no log. A key file that cannot be read, or that is not one SPKI PEM Ed25519 public key, is an `AdminLinkKeyError` (`problem: 'unreadable' | 'malformed'`), logged as an error at each request until an operator replaces the file; the answer is `{ "href": null }`. A header that is present but refused is logged as a warning with its reason (`malformed`, `expired`, `lifetime`, `signature`); a missing header is not logged. The route reads the key file at each request, so a key rotation needs no restart. Each answer carries `Cache-Control: no-store`.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`verifyAdminHeader(value, publicKey, nowSeconds)` is a pure check that returns `{ admin: true }` or `{ admin: false, reason }`. `readAdminKey(path)` is the only file read. `answerAdminLink` joins them for one request. The route is an exact Fetch route of `ctx.connection.fetch`, so the connection authenticates the request first and only the owner Peer reaches it. The browser half registers the row after the answer and aborts the request when it is disposed first.

| File | Role |
|---|---|
| [`src/admin-header.ts`](src/admin-header.ts) | the header check and the key read |
| [`src/route.ts`](src/route.ts) | the route path and its JSON answer, shared by both halves |
| [`src/index.ts`](src/index.ts) | Host half: the config check and the route |
| [`src/client/index.ts`](src/client/index.ts) | Browser half: the request, the dictionaries and the registration |
| [`src/client/AdminLink.tsx`](src/client/AdminLink.tsx) | the Firm admin row |
| [`tests/`](tests/) | each header rule, the key read, the route answers, and the row with its disposal |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [ui-sidebar](../ui-sidebar/README.md) — the `sidebar.actions` slot.
- [dsh-flowleap-web](../../bundle/flowleap-web/README.md) — the bundle row.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package is a sidebar link and an authenticated route that register no model-facing tools or messages.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **One read at start** — the browser asks once when the page loads, so a role change shows after the next page load.
- **Not a locked row** — `dsh.bundle.lockedRows` of the bundle does not name this row, so a user patch on the runtime can change it. Such a change can show the link at most; the starter still guards the console.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
