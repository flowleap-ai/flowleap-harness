/**
 * The `docx` library, loaded on the first Word build. A static import would
 * load it with the plugin, and `docx` touches `localStorage` at import, which
 * Node 25+ answers with an ExperimentalWarning on stderr; `dsh <bundle> --help`
 * treats any stderr line as a failure (`verify-cli-help`). Loading it when a
 * document is built keeps the plugin's import side-effect free.
 * @module
 */

/** The `docx` module as the builders see it. */
export type DocxLibrary = typeof import('docx')

let loaded: Promise<DocxLibrary> | undefined

/**
 * Load `docx` once.
 * @returns the module.
 */
export function loadDocx(): Promise<DocxLibrary> {
  loaded ??= import('docx')
  return loaded
}
