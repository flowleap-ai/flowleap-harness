/**
 * In-process FlowLeap patent-data connectors (ADR 0019, slice C2). One row mounts
 * the `@flowleap/connectors` library over the dsh seams: `ctx.credentials`
 * records hold the firm's EPO OPS, USPTO ODP, Semantic Scholar and Mistral keys,
 * the library's 39 office tools (`ocr` among them, on the firm's Mistral key) register on
 * `ctx.tools` under their backend names, the native `compare_claims` tool charts a user
 * claim against patents whose claims it fetches through the same text router, the native
 * `read_pdf` tool reads a workspace file through that OCR when `fs` and `workingDirectory`
 * are mounted, and the `flowleapConnectors` Remote serves the settings cards and the
 * first-run wizard. The `flowleapRegister` service reads the register events of one EP
 * publication or US application for Host plugins, without a tool call, the `flowleapPatentData`
 * service reads the EP Register, families and publication text for Host plugins on the same
 * EPO key, and the `flowleapOcr` service reads the page text of one document through the same OCR.
 * The `flowleapMyEpo` service reads the firm's own MyEPO account (EP applications, Mailbox letters,
 * EPO due dates, pending fees) with the B2B credentials the MyEPO card links; it holds no write
 * operation.
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
import { createRequestGate } from './myepo-client.ts'
import { createMyEpoLink, FlowleapMyEpo } from './myepo.ts'
import { FlowleapOcr } from './ocr.ts'
import { FlowleapPatentData } from './patent-data.ts'
import { FlowleapRegister } from './register.ts'
import { registerOfficeTools } from './tools.ts'

export {
  COMPARE_CLAIMS_MAX_PATENTS, COMPARE_CLAIMS_NAME, COMPARE_CLAIMS_TEXT_BUDGET,
  compareClaimsTool, decomposeClaim, formatComparisonPackage, registerCompareClaimsTool, selectIndependentClaim,
} from './compare-claims.ts'
export type { ClaimElement, CompareClaimsArgs, CompareClaimsValue, FetchedClaims } from './compare-claims.ts'
export { readBoundedText } from './bounded-body.ts'
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
export { createMyEpoClient, createRequestGate, describeFailure, MyEpoError } from './myepo-client.ts'
export type {
  MyEpoApplicationQuery, MyEpoApplicationRef, MyEpoClientOptions, MyEpoCommunicationQuery, MyEpoCredentials, MyEpoDocument,
  MyEpoEndpoint, MyEpoFailure, MyEpoPageQuery, MyEpoReads, RequestGate,
} from './myepo-client.ts'
export { createMyEpoLink, FlowleapMyEpo, MYEPO_FIELDS, MYEPO_RECORD, validateMyEpoFields } from './myepo.ts'
export { createMyEpoLetterIntake, MyEpoIntakeError, readMyEpoLetters } from './myepo-reader.ts'
export type {
  MyEpoDeliveryAnswer, MyEpoDownloadMode, MyEpoLetterDelivery, MyEpoLetterIntake, MyEpoReadPass, MyEpoRefusal,
} from './myepo-reader.ts'
export type { FlowleapMyEpoOptions, MyEpoLink, MyEpoLinkOptions, MyEpoSource } from './myepo.ts'
export {
  parseApplications, parseBibliographicData, parseCommunications, parseDueDates, parseFees, parseFolders, parsePortfolios, parseTerms,
} from './myepo-wire.ts'
export type {
  MyEpoApplication, MyEpoApplicationNumber, MyEpoBibliographicData, MyEpoCommunication, MyEpoCommunicationId, MyEpoDueDate, MyEpoFee,
  MyEpoFolder, MyEpoFolderId, MyEpoPage, MyEpoPortfolio, MyEpoPortfolioId, MyEpoProcedure, MyEpoTerm,
} from './myepo-wire.ts'
export { FlowleapOcr } from './ocr.ts'
export type { FlowleapOcrOptions, OcrPageText, OcrRead, OcrSource } from './ocr.ts'
export {
  FlowleapPatentData, PatentDataError, normalizeName, parseEpApplication, parseEpPublication,
} from './patent-data.ts'
export type {
  ApplicantNames, EpApplicationNumber, EpPublicationNumber, FamilyRead, FlowleapPatentDataOptions, PatentData,
  PatentDataConnectors, PatentDataFailure, PublicationText, RegisterOpponent, RegisterPage, RegisterParty, RegisterRow, WoPublicationNumber,
} from './patent-data.ts'
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
  /** The longest time of one EPO OPS read, its retries included, in ms. */
  opsRequestDeadlineMs: number
  /** Where the MyEPO link calls and how fast; the defaults are the EPO's production services. */
  myepo: MyEpoConfig
}

/** The MyEPO endpoint of a deployment: production, or the EPO sandbox for a test. */
export interface MyEpoConfig {
  /** The MyEPO API base, without a trailing slash. */
  baseUrl: string
  /** The OAuth 2.0 token endpoint of the EPO login service that issues tokens for `baseUrl`. */
  tokenUrl: string
  /** The most MyEPO requests the plugin starts in one second. The EPO publishes no limit. */
  requestsPerSecond: number
  /** The deadline of one MyEPO request, in seconds. */
  timeoutSeconds: number
}

/**
 * Check one MyEPO endpoint URL: HTTPS, or HTTP to a loopback host for a local double.
 * @param field - the Config field, for the error.
 * @param value - the URL.
 * @returns the URL without a trailing slash.
 * @throws TypeError for a value that is not such a URL.
 */
export function validateMyEpoUrl(field: string, value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch (error) {
    throw new TypeError(`flowleap-connectors: myepo.${field} is not a URL: ${value}`, { cause: error })
  }
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new TypeError(`flowleap-connectors: myepo.${field} must use HTTPS: ${value}`)
  }
  return value.replace(/\/+$/, '')
}

/** Runtime schema for the row. */
export const Config: z<Config> = z.object({
  cacheEntries: z.number().step(1).min(1).default(500),
  excludeTools: z.array(String).default([]),
  opsRequestDeadlineMs: z.number().step(1).min(5_000).max(600_000).default(60_000),
  myepo: z.object({
    baseUrl: z.string().default('https://api.apps.epo.org/latest'),
    tokenUrl: z.string().default('https://login.epo.org/oauth2/aus6hh2ns9ORf2PD3417/v1/token'),
    // The EPO publishes no limit; 4 a second reads the bibliographic data of a 1,000-application docket in about 4 minutes.
    requestsPerSecond: z.number().min(0.1).max(50).default(4),
    timeoutSeconds: z.number().min(1).max(300).default(30),
  }),
})

/**
 * Mount the library, register the office tools, `compare_claims` and `read_pdf`, and expose the Remote.
 * @param ctx - the mounting context, carrying `tools` and `credentials`.
 * @param config - cache size and the office tools to leave out.
 */
export function apply(ctx: Context, config: Config): void {
  const store = createCredentialStore(ctx.credentials)
  const bound = createConnectorHost({
    store, logger: ctx.logger, cacheEntries: config.cacheEntries, opsRequestDeadlineMs: config.opsRequestDeadlineMs,
  })
  const connectors = createConnectors(bound.host)
  const myEpo = createMyEpoLink({
    credentials: ctx.credentials,
    endpoint: {
      baseUrl: validateMyEpoUrl('baseUrl', config.myepo.baseUrl),
      tokenUrl: validateMyEpoUrl('tokenUrl', config.myepo.tokenUrl),
      requestsPerSecond: config.myepo.requestsPerSecond,
      timeoutSeconds: config.myepo.timeoutSeconds,
    },
    gate: createRequestGate(config.myepo.requestsPerSecond),
    fetch: globalThis.fetch.bind(globalThis),
    now: Date.now,
  })
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
  ctx.plugin(FlowleapConnectorsController, { store, connectors, bound, myEpo })
  ctx.plugin(FlowleapMyEpo, { reads: myEpo.reads })
  ctx.plugin(FlowleapRegister, { connectors, bound })
  ctx.plugin(FlowleapPatentData, { connectors, bound })
  ctx.plugin(FlowleapOcr, { connectors, bound })
}
