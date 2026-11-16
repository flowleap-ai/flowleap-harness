/**
 * FlowLeap Letters, Host half: nothing to mount. The browser half (`exports["./client"]`) reads the MyEPO Mailbox
 * over the `flowleapConnectors` Remote of `@deepseek-ai/dsh-flowleap-connectors`.
 *
 * See packages/client/ui-flowleap-letters/README.md.
 * @module @deepseek-ai/dsh-client-ui-flowleap-letters
 */

/** Cordis plugin name. */
export const name = 'ui-flowleap-letters'

/** Mount the Host half: it registers nothing. */
export function apply(): void {}
