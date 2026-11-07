/**
 * The evidence of a letter that the letter page and the deadline page share: the two readings side by side with the
 * spans of the text reading, and the drawing of the letter from reader 1's fields with each read value marked.
 */

import {
  IconCheckOutlineRegular, IconRightUpOutlineRegular, IconWarningTriangleOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { DeadlineDetail, FieldValue, IntakeDocument, ReaderField } from '../api.ts'
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
 * Render the two readings side by side: each value from the text with its span, from the page image, and whether
 * they agree.
 * @param props.ctx - the screen context.
 * @param props.readers - the readings.
 * @returns the comparison table.
 */
export function Readings({ ctx, readers }: { ctx: ScreenContext; readers: DeadlineDetail['readers'] }) {
  const { t } = ctx
  const shown = (row: (typeof READ_ROWS)[number], result: Reading | null): string | null => {
    if (result === null) return null
    switch (row.value) {
      case 'code': return result.code === null ? null : ruleWords(t, result.code).short
      case 'documentDate': return result.documentDate === null ? null : formatDate(result.documentDate, ctx.locale)
      case 'applicationNumber': return result.applicationNumber === null ? null : formatApplicationNumber(result.applicationNumber)
    }
  }
  return (
    <div className={detailCss.compare} role="table" aria-label={t('deadline.read')}>
      <div role="row" className={detailCss.compareRow}>
        <span role="columnheader" className={detailCss.compareHead} />
        <span role="columnheader" className={detailCss.compareHead}>{t('deadline.fromText')}</span>
        <span role="columnheader" className={detailCss.compareHead}>{t('deadline.fromImage')}</span>
        <span role="columnheader" className={detailCss.compareHead} />
      </div>
      {READ_ROWS.map((row) => {
        const text = shown(row, readers.code?.result ?? null)
        const image = shown(row, readers.model?.result ?? null)
        const field: FieldValue | undefined = readers.code?.fields[row.field]
        const agree = text !== null && image !== null && text === image
        return (
          <div key={row.value} role="row" className={detailCss.compareRow}>
            <span role="rowheader" className={detailCss.compareKey}>{t(row.label)}</span>
            <span role="cell" className={detailCss.compareValue}>
              {text ?? t('deadline.notRead')}
              {field !== undefined && <EvidenceQuote span={field.span} labels={quoteLabels(ctx, field.span.page)} />}
            </span>
            <span role="cell" className={detailCss.compareValue}>{image ?? t('deadline.notRead')}</span>
            <span role="cell" className={detailCss.agree}>
              {text === null || image === null
                ? null
                : agree
                  ? <><IconCheckOutlineRegular size={16} />{t('deadline.agree')}</>
                  : <><IconWarningTriangleOutlineRegular size={16} />{t('deadline.differ')}</>}
            </span>
          </div>
        )
      })}
    </div>
  )
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
