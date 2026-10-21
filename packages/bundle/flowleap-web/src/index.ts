/**
 * @deepseek-ai/dsh-flowleap-web — the FlowLeap Patent Agent profile layer.
 * The package is its bundle patch (`cordis.patch.yml`, declared by the
 * `dsh.bundle.patch` manifest field) plus the placeholder persona file the
 * patch points the `flowleap-prompt` row at; it mounts no plugin of its own.
 * @module @deepseek-ai/dsh-flowleap-web
 */

/**
 * The bundled placeholder persona, relative to this package root. The bundle
 * patch resolves it through the dsh installation as
 * `@deepseek-ai/dsh-flowleap-web/prompt/patent-agent.md`; `FLOWLEAP_PROMPT_PATH`
 * replaces it with the agent-v2 prompt export.
 */
export const PROMPT_FILE = 'prompt/patent-agent.md'
