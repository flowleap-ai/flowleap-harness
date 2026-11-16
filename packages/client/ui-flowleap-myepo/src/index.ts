/**
 * FlowLeap MyEPO pages, Host half: nothing to mount. The browser half (`exports["./client"]`) reads MyEPO over the
 * `flowleapConnectors` Remote of `@deepseek-ai/dsh-flowleap-connectors`.
 *
 * See packages/client/ui-flowleap-myepo/README.md.
 * @module @deepseek-ai/dsh-client-ui-flowleap-myepo
 */

/** Cordis plugin name. */
export const name = 'ui-flowleap-myepo'

/** Mount the Host half: it registers nothing. */
export function apply(): void {}
