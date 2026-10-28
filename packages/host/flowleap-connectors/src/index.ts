/**
 * In-process FlowLeap patent-data connectors (ADR 0019, slice C2). One row mounts
 * the `@flowleap/connectors` library over the dsh seams: `ctx.credentials`
 * records hold the firm's EPO OPS, USPTO ODP, Semantic Scholar and Mistral keys,
 * the library's 34 office tools (`ocr` among them, on the firm's Mistral key) register on
 * `ctx.tools` under their backend names, the native `compare_claims` tool charts a user
 * claim against patents whose claims it fetches through the same text router, the native
 * `read_pdf` tool reads a workspace file through that OCR when `fs` and `workingDirectory`
 * are mounted, and the `flowleapConnectors` Remote serves the settings cards and the
 * first-run wizard. The `flowleapRegister` service reads the register events of one EP
 * publication or US application for Host plugins, without a tool call, and the `flowleapOcr`
 * service reads the page text of one document through the same OCR.
 *
 * See packages/host/flowleap-connectors/README.md.
 * @module @deepseek-ai/dsh-flowleap-connectors
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-working-directory'
import { createConnectors, officeTools } from '@flowleap/connectors'
import { registerCompareClaimsTool } from './compare-claims.ts'
import { FlowleapConnectorsController } from './controller.ts'
import { createCredentialStore } from './credentials.ts'
import { createConnectorHost } from './host.ts'
import { registerKeyStateSection } from './key-state.ts'
import { registerReadPdfTool } from './read-pdf.ts'
import { FlowleapOcr } from './ocr.ts'
import { FlowleapRegister } from './register.ts'
import { registerOfficeTools } from './tools.ts'

export {
  COMPARE_CLAIMS_MAX_PATENTS, COMPARE_CLAIMS_NAME, COMPARE_CLAIMS_TEXT_BUDGET,
  compareClaimsTool, decomposeClaim, formatComparisonPackage, registerCompareClaimsTool, selectIndependentClaim,
} from './compare-claims.ts'
export type { ClaimElement, CompareClaimsArgs, CompareClaimsValue, FetchedClaims } from './compare-claims.ts'
export { FlowleapConnectorsController } from './controller.ts'
export type { FlowleapConnectorsControllerOptions } from './controller.ts'
export {
  CONNECTOR_LABELS, CONNECTOR_OF_PROVIDER, CREDENTIAL_SCOPE, PROVIDER_OF_CONNECTOR,
  createCredentialStore, lookupCredentials, validateConnectorFields,
} from './credentials.ts'
export type { ConnectorCredentialStore } from './credentials.ts'
export { LruCache, createConnectorHost } from './host.ts'
export type { BoundConnectorHost, ConnectorHostOptions } from './host.ts'
export {
  READ_PDF_COST_LINE, READ_PDF_EXTENSIONS, READ_PDF_MAX_BYTES, READ_PDF_MAX_PAGES, READ_PDF_NAME,
  estimatePdfPages, pagesMarkdown, readPdfTool, registerReadPdfTool, renderReadPdf,
} from './read-pdf.ts'
export type { ReadPdfArgs, ReadPdfValue } from './read-pdf.ts'
export {
  KEY_STATE_HEADING, KEY_STATE_SECTION_NAME, KEY_STATE_SECTION_ORDER, NO_KEYS, readKeyPresence, registerKeyStateSection,
  renderKeyStateSection,
} from './key-state.ts'
export type { KeyPresence } from './key-state.ts'
export { FlowleapOcr } from './ocr.ts'
export type { FlowleapOcrOptions, OcrPageText, OcrRead, OcrSource } from './ocr.ts'
export { FlowleapRegister, entriesFromOdp, entriesFromOps, parseRegisterApplication } from './register.ts'
export type { FlowleapRegisterOptions, RegisterApplication, RegisterEntry, RegisterSource } from './register.ts'
export { missingCredential, modelInputSchema, registerOfficeTools, renderText, toDshTool } from './tools.ts'
export type { MissingCredentialResult } from './tools.ts'
export * from './types.ts'

/** Cordis plugin name; also the credential record scope. */
export const name = 'flowleap-connectors'

/** The tool registry the office tools join and the credential seam the records live in. */
export const inject = ['tools', 'credentials']

/** Plugin config. */
export interface Config {
  /** Entries the in-memory result cache holds before evicting the least recently used one. */
  cacheEntries: number
  /** Office tools from the library that this host does not register, by backend name. */
  excludeTools: string[]
}

/** Runtime schema for the row. */
export const Config: z<Config> = z.object({
  cacheEntries: z.number().step(1).min(1).default(500),
  excludeTools: z.array(String).default([]),
})

/**
 * Mount the library, register the office tools, `compare_claims` and `read_pdf`, and expose the Remote.
 * @param ctx - the mounting context, carrying `tools` and `credentials`.
 * @param config - cache size and the office tools to leave out.
 */
export function apply(ctx: Context, config: Config): void {
  const store = createCredentialStore(ctx.credentials)
  const bound = createConnectorHost({ store, logger: ctx.logger, cacheEntries: config.cacheEntries })
  const connectors = createConnectors(bound.host)
  ctx.effect(() => registerOfficeTools(ctx, connectors, bound, officeTools().filter(definition => !config.excludeTools.includes(definition.name))), 'flowleap-connectors: office tools')
  // compare_claims is native, not an office tool: excludeTools does not reach it, and it needs no filesystem.
  ctx.effect(() => registerCompareClaimsTool(ctx, connectors, bound), 'flowleap-connectors: compare_claims')
  // read_pdf needs a filesystem and the session directory; a composition without them keeps the office tools alone.
  ctx.inject(['fs', 'workingDirectory'], (fileCtx) => {
    fileCtx.effect(() => registerReadPdfTool(fileCtx, connectors, bound), 'flowleap-connectors: read_pdf')
  })
  // The live key state as a prompt section: the static persona export defers to it.
  // A composition without a system prompt keeps the tools alone.
  ctx.inject(['systemPrompt'], (promptCtx) => {
    void registerKeyStateSection(promptCtx, store)
  })
  ctx.plugin(FlowleapConnectorsController, { store, connectors, bound })
  ctx.plugin(FlowleapRegister, { connectors, bound })
  ctx.plugin(FlowleapOcr, { connectors, bound })
}
