/**
 * The MyEPO API answers as FlowLeap reads them: one zod schema for each answer the read operations use, and the
 * mapping into the records of `flowleapMyEpo`. Every answer crosses the network boundary, so each is parsed here;
 * a field the EPO adds later is ignored, and a missing required field fails the read as `invalid-response`.
 * Field names follow the "Machine to Machine Service API" 1.0.0 and the sandbox answers of 2026-11-09.
 * @module
 */

import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import { z } from 'zod'
import type { MyEpoPortfolioType } from './types.ts'

/** The procedure of an application: the European patent (`EPC`) or the unitary patent (`UPP`). */
export type MyEpoProcedure = 'EPC' | 'UPP'

/** A MyEPO portfolio id. */
export type MyEpoPortfolioId = Branded<'MyEpoPortfolioId'>

/** A MyEPO Mailbox communication id. */
export type MyEpoCommunicationId = Branded<'MyEpoCommunicationId'>

/** A MyEPO Mailbox folder id. */
export type MyEpoFolderId = Branded<'MyEpoFolderId'>

/** An EP application number as MyEPO writes it in a path, `EP` and eight digits, for example `EP00000001`. */
export type MyEpoApplicationNumber = Branded<'MyEpoApplicationNumber'>

/** One portfolio. */
export interface MyEpoPortfolio {
  readonly id: MyEpoPortfolioId
  readonly name: string
  readonly type: MyEpoPortfolioType
  /** Whether the account may read every application of the portfolio. */
  readonly fullAccess: boolean
}

/** One application of the firm's portfolios. */
export interface MyEpoApplication {
  readonly procedure: MyEpoProcedure
  readonly number: MyEpoApplicationNumber
  /** The number with its check digit, for example `EP00000001.8`. */
  readonly numberWithCheckDigit: string
  /** ISO calendar date. */
  readonly filingDate: string
  /** The firm's own file reference, when the firm set one. */
  readonly fileReference?: string
  readonly portfolioId: MyEpoPortfolioId
  readonly portfolioName: string
}

/** One page of a list. */
export interface MyEpoPage<T> {
  readonly items: readonly T[]
  /** The 0-based page number. */
  readonly page: number
  /** The page size the EPO used. */
  readonly size: number
  /** All items of the list, over every page. */
  readonly total: number
}

/** The bibliographic data of one application, flattened to what a docket reads. */
export interface MyEpoBibliographicData {
  readonly procedure: MyEpoProcedure
  /** The number as the record writes it, without the office prefix, for example `00000001`. */
  readonly number: string
  readonly filingDate: string
  /** The title in each language the record has, by language code (`EN`, `DE`, `FR`). */
  readonly titles: Readonly<Record<string, string>>
  /** The contact text of each party, in record order. */
  readonly applicants: readonly string[]
  readonly inventors: readonly string[]
  readonly representatives: readonly string[]
  readonly publications: readonly { readonly office: string; readonly number: string; readonly kind: string; readonly date: string }[]
  readonly priorities: readonly { readonly office: string; readonly number: string; readonly filingDate: string }[]
  readonly ipc: readonly string[]
  readonly cpc: readonly string[]
}

/** One Mailbox communication. */
export interface MyEpoCommunication {
  readonly id: MyEpoCommunicationId
  /** The application number as MyEPO writes it (`EP12345678.2`, `PCT/SE2023/123456`); absent for a letter with no application. */
  readonly applicationNumber?: string
  /** The firm's reference on the letter. */
  readonly userReference?: string
  readonly applicantName?: string
  readonly recipientName?: string
  /** The EPO document code, for example `1081` or `2006A`. */
  readonly documentCode: string
  readonly title: string
  /** ISO calendar date. */
  readonly dispatchDate: string
  readonly read: boolean
  readonly handled: boolean
  readonly folderId: MyEpoFolderId
}

/** One Mailbox folder. */
export interface MyEpoFolder {
  readonly id: MyEpoFolderId
  readonly name: string
}

/** One EPO due date of an application. */
export interface MyEpoDueDate {
  /** The term, described by {@link MyEpoTerm}. */
  readonly termKey: string
  /** ISO calendar date. */
  readonly dueDate: string
  /** Who must act, as the EPO names it. */
  readonly actor: string
}

/** The descriptions of one term key. */
export interface MyEpoTerm {
  readonly termKey: string
  readonly description: { readonly en: string; readonly fr: string; readonly de: string }
}

/** One pending fee of an application. */
export interface MyEpoFee {
  readonly feeCode: string
  readonly amount: number
  /** The currency, when the EPO names one. */
  readonly currency?: string
  /** ISO calendar date. */
  readonly dueDate: string
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const procedure = z.enum(['EPC', 'UPP'])
const text = z.object({ phraseType: z.object({ $: z.string() }) })
const contactText = z.object({ contact: z.object({ contactText: text }) })

const portfoliosSchema = z.object({
  content: z.array(z.object({ id: z.string(), name: z.string(), type: z.string(), hasFullAccess: z.boolean() })),
})

const pageFields = { size: z.number().int(), number: z.number().int(), totalElements: z.number().int() }

const applicationsSchema = z.object({
  content: z.array(z.object({
    bibliographicData: z.object({
      applicationIdentification: z.object({ applicationNumber: z.string(), applicationNumberMyEpo: z.string(), filingDate: isoDate }),
    }),
    applicantFileReference: z.string().nullish(),
    portfolioId: z.string(),
    portfolioName: z.string(),
    procedure,
  })),
  ...pageFields,
})

const biblioSchema = z.object({
  application: z.object({
    bibliographicData: z.object({
      applicationIdentification: z.object({ procedure, applicationNumber: z.string(), filingDate: isoDate }),
      publicationBag: z.object({
        patentPublicationIdentification: z.array(z.object({
          ipOfficeCode: z.string(), publicationNumber: z.string(), patentDocumentKindCode: z.string(), publicationDate: isoDate,
        })),
      }).optional(),
      priorityClaimBag: z.object({
        priorityClaim: z.array(z.object({ ipOfficeCode: z.string(), applicationNumber: z.string(), filingDate: isoDate })),
      }).optional(),
    }),
    patentClassificationBag: z.object({
      ipcClassificationBag: z.object({ ipcrClassification: z.array(z.object({ patentClassificationSymbolText: z.string() })) }).optional(),
      cpcClassificationsBag: z.object({ cpcClassification: z.array(z.object({ patentClassificationSymbolText: z.string() })) }).optional(),
    }).optional(),
    inventionTitleBag: z.object({
      inventionTitle: z.array(z.object({ languageCode: z.string(), phraseType: z.object({ $: z.string() }) })),
    }).optional(),
    partyBag: z.object({
      applicantBag: z.array(z.object({ applicant: contactText })).optional(),
      inventorBag: z.array(z.object({ inventor: contactText })).optional(),
      representativeBag: z.array(contactText).optional(),
    }).optional(),
  }),
})

const communicationsSchema = z.object({
  content: z.array(z.object({
    id: z.string(),
    applicationNumber: z.string().nullish(),
    userReference: z.string().nullish(),
    applicantName: z.string().nullish(),
    recipientName: z.string().nullish(),
    documentCode: z.string(),
    title: z.string(),
    dispatchDate: isoDate,
    read: z.boolean(),
    handled: z.boolean(),
    folderId: z.string(),
  })),
  ...pageFields,
})

const foldersSchema = z.object({ folders: z.array(z.object({ folderId: z.string(), folderName: z.string() })) })

const dueDatesSchema = z.object({ dueDates: z.array(z.object({ termKey: z.string(), dueDate: isoDate, actor: z.string() })) })

const termsSchema = z.array(z.object({
  termKey: z.string(), descriptionEN: z.string(), descriptionFR: z.string(), descriptionDE: z.string(),
}))

const feesSchema = z.array(z.object({ feeCode: z.string(), amount: z.number(), currency: z.string().nullish(), dueDate: isoDate }))

/** The error body of a refused API call, for example `{ code: 'ERR_20', message: '…' }`. */
export const errorBodySchema = z.object({ code: z.string(), message: z.string() })

/** The token answer of the EPO login service. */
export const tokenSchema = z.object({ access_token: z.string().min(1), token_type: z.string(), expires_in: z.number().positive() })

const PORTFOLIO_TYPES: readonly MyEpoPortfolioType[] = ['applicant', 'representative', 'association']

/** One optional field: the field when the EPO sent a value, nothing when it sent `null` or no field. */
function optional<K extends string>(key: K, value: string | null | undefined): { [P in K]?: string } {
  return value === null || value === undefined ? {} : { [key]: value } as { [P in K]?: string }
}

/**
 * Read a `GET /portfolios` answer.
 * @param body - the parsed JSON.
 * @returns the portfolios.
 * @throws ZodError when a field is missing or has the wrong type.
 */
export function parsePortfolios(body: unknown): MyEpoPortfolio[] {
  return portfoliosSchema.parse(body).content.map(entry => ({
    id: brandString<MyEpoPortfolioId>(entry.id),
    name: entry.name,
    type: (PORTFOLIO_TYPES as readonly string[]).includes(entry.type) ? entry.type as MyEpoPortfolioType : 'other',
    fullAccess: entry.hasFullAccess,
  }))
}

/**
 * Read a `GET /applications` answer.
 * @param body - the parsed JSON.
 * @returns one page of applications.
 * @throws ZodError when a field is missing or has the wrong type.
 */
export function parseApplications(body: unknown): MyEpoPage<MyEpoApplication> {
  const page = applicationsSchema.parse(body)
  return {
    items: page.content.map((entry) => {
      const id = entry.bibliographicData.applicationIdentification
      return {
        procedure: entry.procedure,
        number: brandString<MyEpoApplicationNumber>(id.applicationNumber),
        numberWithCheckDigit: id.applicationNumberMyEpo,
        filingDate: id.filingDate,
        ...optional('fileReference', entry.applicantFileReference),
        portfolioId: brandString<MyEpoPortfolioId>(entry.portfolioId),
        portfolioName: entry.portfolioName,
      }
    }),
    page: page.number,
    size: page.size,
    total: page.totalElements,
  }
}

/**
 * Read a `GET /biblio-data/{procedure}/applications/{application}` answer.
 * @param body - the parsed JSON.
 * @returns the flattened bibliographic data.
 * @throws ZodError when a field is missing or has the wrong type.
 */
export function parseBibliographicData(body: unknown): MyEpoBibliographicData {
  const record = biblioSchema.parse(body).application
  const id = record.bibliographicData.applicationIdentification
  const parties = record.partyBag
  const classes = record.patentClassificationBag
  return {
    procedure: id.procedure,
    number: id.applicationNumber,
    filingDate: id.filingDate,
    titles: Object.fromEntries((record.inventionTitleBag?.inventionTitle ?? []).map(title => [title.languageCode, title.phraseType.$])),
    applicants: (parties?.applicantBag ?? []).map(entry => entry.applicant.contact.contactText.phraseType.$),
    inventors: (parties?.inventorBag ?? []).map(entry => entry.inventor.contact.contactText.phraseType.$),
    representatives: (parties?.representativeBag ?? []).map(entry => entry.contact.contactText.phraseType.$),
    publications: (record.bibliographicData.publicationBag?.patentPublicationIdentification ?? []).map(entry => ({
      office: entry.ipOfficeCode, number: entry.publicationNumber, kind: entry.patentDocumentKindCode, date: entry.publicationDate,
    })),
    priorities: (record.bibliographicData.priorityClaimBag?.priorityClaim ?? []).map(entry => ({
      office: entry.ipOfficeCode, number: entry.applicationNumber.trim(), filingDate: entry.filingDate,
    })),
    ipc: (classes?.ipcClassificationBag?.ipcrClassification ?? []).map(entry => entry.patentClassificationSymbolText),
    cpc: (classes?.cpcClassificationsBag?.cpcClassification ?? []).map(entry => entry.patentClassificationSymbolText),
  }
}

/**
 * Read a `GET /communications` or `GET /communications/unhandled` answer.
 * @param body - the parsed JSON.
 * @returns one page of communications.
 * @throws ZodError when a field is missing or has the wrong type.
 */
export function parseCommunications(body: unknown): MyEpoPage<MyEpoCommunication> {
  const page = communicationsSchema.parse(body)
  return {
    items: page.content.map(entry => ({
      id: brandString<MyEpoCommunicationId>(entry.id),
      ...optional('applicationNumber', entry.applicationNumber),
      ...optional('userReference', entry.userReference),
      ...optional('applicantName', entry.applicantName),
      ...optional('recipientName', entry.recipientName),
      documentCode: entry.documentCode,
      title: entry.title,
      dispatchDate: entry.dispatchDate,
      read: entry.read,
      handled: entry.handled,
      folderId: brandString<MyEpoFolderId>(entry.folderId),
    })),
    page: page.number,
    size: page.size,
    total: page.totalElements,
  }
}

/**
 * Read a `GET /communications/folders` answer.
 * @param body - the parsed JSON.
 * @returns the folders.
 * @throws ZodError when a field is missing or has the wrong type.
 */
export function parseFolders(body: unknown): MyEpoFolder[] {
  return foldersSchema.parse(body).folders.map(entry => ({ id: brandString<MyEpoFolderId>(entry.folderId), name: entry.folderName }))
}

/**
 * Read a `GET /{procedure}/applications/{application}/dueDates` answer.
 * @param body - the parsed JSON.
 * @returns the due dates.
 * @throws ZodError when a field is missing or has the wrong type.
 */
export function parseDueDates(body: unknown): MyEpoDueDate[] {
  return dueDatesSchema.parse(body).dueDates.map(entry => ({ termKey: entry.termKey, dueDate: entry.dueDate, actor: entry.actor }))
}

/**
 * Read a `GET /terms` answer.
 * @param body - the parsed JSON.
 * @returns the terms.
 * @throws ZodError when a field is missing or has the wrong type.
 */
export function parseTerms(body: unknown): MyEpoTerm[] {
  return termsSchema.parse(body).map(entry => ({
    termKey: entry.termKey, description: { en: entry.descriptionEN, fr: entry.descriptionFR, de: entry.descriptionDE },
  }))
}

/**
 * Read a `GET /{procedure}/applications/{application}/fees` answer.
 * @param body - the parsed JSON.
 * @returns the pending fees.
 * @throws ZodError when a field is missing or has the wrong type.
 */
export function parseFees(body: unknown): MyEpoFee[] {
  return feesSchema.parse(body).map(entry => ({
    feeCode: entry.feeCode, amount: entry.amount, ...optional('currency', entry.currency), dueDate: entry.dueDate,
  }))
}
