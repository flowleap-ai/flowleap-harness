/**
 * The server log of the ingress. The `flowleap-web` composition mounts no `ctx.logger` exporter that prints (no
 * `@deepseek-ai/cordis-plugin-logger-console` row), so a `ctx.logger` line stays in the in-memory buffer; the server log
 * is the process's standard error, and these lines go there.
 * @module
 */

/**
 * Write one warning line to the server log.
 * @param line - one line without the body, a signature, or a secret.
 */
export function serverWarn(line: string): void {
  console.warn(`flowleap-ticket: ${line}`)
}
