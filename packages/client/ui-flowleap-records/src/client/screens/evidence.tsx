/**
 * The evidence of a letter that the letter page and the deadline page share: the two readings side by side with the
 * spans of the text reading, and the letter's page images with each read value quoted beside them, or, for a letter
 * stored without page images, the drawing of the letter from reader 1's fields with each read value marked.
 */

import type { ReactNode } from 'react'
import {
  IconCheckOutlineRegular, IconRightUpOutlineRegular, IconWarningTriangleOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { DeadlineDetail, FieldValue, IntakeDocument, IsoDate, Mark, PageImage, ReaderField } from '../api.ts'
import { formatApplicationNumber, formatDate } from '../format.ts'
import { letterLines } from '../letter-text.ts'
import type { FlowleapRecordsKey } from '../locales.ts'
import { ActButton } from '../parts/Act.tsx'
import { EvidenceQuote } from '../parts/Evidence.tsx'
import { actOf, type ScreenContext } from './context.ts'
import { ruleWords } from './detail.tsx'
import { quoteLabels } from './shared.tsx'
import detailCss from './Detail.module.css'
import intakeCss from './Intake.module.css'

/** One reading's result: the code, the date of the letter and the application number. */
type Reading = NonNullable<NonNullable<DeadlineDetail['readers']['model']>['result']>

/**
 * The reading rows: the reader field whose span quotes the value, and the label. The office event's span is the
 * letter's title line (R14), never its form code (R19); the row's value is the rule in words.
 */
const READ_ROWS = [
  { value: 'code', field: 'title', label: 'deadline.field.code' },
  { value: 'documentDate', field: 'documentDate', label: 'deadline.field.documentDate' },
  { value: 'applicationNumber', field: 'applicationNumber', label: 'deadline.field.application' },
] as const satisfies readonly { value: string; field: ReaderField; label: FlowleapRecordsKey }[]

/**
 * Whether both readers read the letter (`outcome` agree or differ). Otherwise the record holds one reading or none (reader
 * 2 off, refused, or with no result), and the views say so in their heading and show no column of "Not read".
 * @param readers - the readings.
 * @returns true when both readings have a result.
 */
export function readTwice(readers: DeadlineDetail['readers']): boolean {
  return readers.outcome === 'agree' || readers.outcome === 'differ'
}

/**
 * Render the readings side by side: each value from the text with its span, from the page image, and whether they
 * agree. With one reading, only its column shows. A value that the text reading quotes but did not take into its
 * result (a letter with no form code) shows as read, with its quote.
 * @param props.ctx - the screen context.
 * @param props.readers - the readings.
 * @returns the comparison table.
 */
export function Readings({ ctx, readers }: { ctx: ScreenContext; readers: DeadlineDetail['readers'] }) {
  const { t } = ctx
  const twice = readTwice(readers)
  const shown = (row: (typeof READ_ROWS)[number], result: Reading | null): string | null => {
    if (result === null) return null
    switch (row.value) {
      case 'code': return result.code === null ? null : ruleWords(t, result.code).short
      case 'documentDate': return result.documentDate === null ? null : formatDate(result.documentDate, ctx.locale)
      case 'applicationNumber': return result.applicationNumber === null ? null : formatApplicationNumber(result.applicationNumber)
    }
  }
  return (
    <div className={twice ? detailCss.compare : detailCss.compareOne} role="table" aria-label={t('deadline.read')}>
      <div role="row" className={detailCss.compareRow}>
        <span role="columnheader" className={detailCss.compareHead} />
        <span role="columnheader" className={detailCss.compareHead}>{t(readers.code?.source.kind === 'ocr' ? 'deadline.fromOcr' : 'deadline.fromText')}</span>
        {twice && <span role="columnheader" className={detailCss.compareHead}>{t('deadline.fromImage')}</span>}
        {twice && <span role="columnheader" className={detailCss.compareHead} />}
      </div>
      {READ_ROWS.map((row) => {
        const result = shown(row, readers.code?.result ?? null)
        const field: FieldValue | undefined = readers.code?.fields[row.field]
        // The title line names the letter, not its office event: with no code read, it is no value of this row.
        const quoted = row.value === 'code' && result === null ? undefined : field
        const text = result ?? (row.value === 'code' || field === undefined ? null : quotedValue(ctx, row.value, field.value))
        const image = shown(row, readers.model?.result ?? null)
        const agree = text !== null && image !== null && text === image
        return (
          <div key={row.value} role="row" className={detailCss.compareRow}>
            <span role="rowheader" className={detailCss.compareKey}>{t(row.label)}</span>
            <span role="cell" className={detailCss.compareValue}>
              {text ?? t('deadline.notRead')}
              {quoted !== undefined && <EvidenceQuote span={quoted.span} labels={quoteLabels(ctx, quoted.span.page)} />}
            </span>
            {twice && <span role="cell" className={detailCss.compareValue}>{image ?? t('deadline.notRead')}</span>}
            {twice && (
              <span role="cell" className={detailCss.agree}>
                {text === null || image === null
                  ? null
                  : agree
                    ? <><IconCheckOutlineRegular size={16} />{t('deadline.agree')}</>
                    : <><IconWarningTriangleOutlineRegular size={16} />{t('deadline.differ')}</>}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * The words of a value that reader 1 quoted: a date in the UI language, an application number as the office prints it.
 * @param ctx - the screen context.
 * @param row - the reading row.
 * @param value - the quoted value.
 * @returns the words.
 */
function quotedValue(ctx: ScreenContext, row: 'documentDate' | 'applicationNumber', value: string): string {
  switch (row) {
    case 'documentDate': return /^\d{4}-\d{2}-\d{2}$/u.test(value) ? formatDate(value as IsoDate, ctx.locale) : value
    case 'applicationNumber': return formatApplicationNumber(value)
  }
}

/**
 * Render a drawing of the letter from what reader 1 read: the lines of the page that hold the read values, in the
 * letter's own words and in every UI language, with each read value marked (`letterLines`). It is a picture of the
 * source, so its text is exempt from the deny-list (`data-verbatim`); it never translates or names the letter.
 * @param props.ctx - the screen context.
 * @param props.letter - the letter.
 * @param props.onOpen - open the PDF.
 * @returns the drawing with its page caption and Open the letter.
 */
export function LetterDrawing({ ctx, letter, onOpen }: { ctx: ScreenContext; letter: Pick<IntakeDocument, 'fields' | 'pages'>; onOpen: () => void }) {
  const { t } = ctx
  const { title, formNumber, documentDate, applicationNumber, reference } = letter.fields
  const read = [title, formNumber, documentDate, reference, applicationNumber].flatMap(field => field === undefined ? [] : [field.span])
  const page = reference?.span.page ?? title?.span.page ?? formNumber?.span.page ?? 1
  return (
    <figure className={intakeCss.paper}>
      <div className={intakeCss.letter} data-fdl-part="letter" data-verbatim="" aria-label={t('intake.letter.label', { page })} role="img">
        <div className={intakeCss.logo} />
        {letterLines(read).map(line => (
          <div key={line.key} className={intakeCss.letterLine}>
            {line.cells.map((cell, index) => (
              <span key={index}>
                {cell.map((run, place) => run.read ? <mark key={place} className={intakeCss.hl}>{run.text}</mark> : run.text)}
              </span>
            ))}
          </div>
        ))}
        <div className={intakeCss.line} />
        <div className={intakeCss.line} />
      </div>
      <figcaption className={intakeCss.paperCap}>
        <span>{letter.pages === null ? t('intake.letter.pageUnknown', { page }) : t('intake.letter.page', { page, count: letter.pages })}</span>
        <ActButton act={actOf(ctx, 'openLetter', t('intake.act.openLetter'), onOpen, { icon: <IconRightUpOutlineRegular size={16} /> })} rank="tertiary" />
      </figcaption>
    </figure>
  )
}

/** The marks that the main view quotes: a form number is a form code, which shows only in Audit (R19). */
const MARK_LABELS = {
  documentDate: 'deadline.field.documentDate',
  applicationNumber: 'deadline.field.application',
} as const satisfies Partial<Record<Mark['field'], FlowleapRecordsKey>>

/**
 * Render the letter's page images, each at its own size, under the read values: each quote with its page.
 * The OCR gives no position on the page, so nothing is drawn on the image. With no page image, render the fallback.
 * @param props.ctx - the screen context.
 * @param props.images - the page images, in page order.
 * @param props.marks - the read values with their page and quote.
 * @param props.fallback - what shows for a letter with no page image: the drawing.
 * @param props.onOpen - open the PDF.
 * @returns the pages, or the fallback.
 */
export function LetterPages({ ctx, images, marks, fallback, onOpen }: {
  ctx: ScreenContext
  images: readonly PageImage[]
  marks: readonly Mark[]
  fallback: ReactNode
  onOpen: () => void
}) {
  const { t } = ctx
  if (images.length === 0) return fallback
  const quoted = marks.flatMap(mark => mark.field === 'formNumber' ? [] : [{ ...mark, label: MARK_LABELS[mark.field] }])
  return (
    <figure className={intakeCss.paper}>
      {quoted.length > 0 && (
        <dl className={intakeCss.marks} aria-label={t('intake.letter.marks')}>
          {quoted.map(mark => (
            <div key={mark.field} className={intakeCss.markRow}>
              <dt>{t(mark.label)}</dt>
              <dd><EvidenceQuote span={mark} labels={quoteLabels(ctx, mark.page)} /></dd>
            </div>
          ))}
        </dl>
      )}
      <div className={intakeCss.pages}>
        {images.map(image => (
          <img
            key={image.page}
            data-fdl-part="letter"
            className={intakeCss.pageImage}
            src={ctx.pageHref(image.href)}
            width={image.width}
            height={image.height}
            loading="lazy"
            alt={t('intake.letter.image', { page: image.page, count: images.length })}
          />
        ))}
      </div>
      <figcaption className={intakeCss.paperCap}>
        <span>{t(images.length === 1 ? 'intake.letter.pages.one' : 'intake.letter.pages', { count: images.length })}</span>
        <ActButton act={actOf(ctx, 'openLetter', t('intake.act.openLetter'), onOpen, { icon: <IconRightUpOutlineRegular size={16} /> })} rank="tertiary" />
      </figcaption>
    </figure>
  )
}
