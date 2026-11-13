/**
 * The letter viewer: a person reads the whole letter inside the app, each page fitted to the width of the viewer, and sees
 * the place that a quote or a page reference names. A span is a pair of offsets into the text of its page, and a page image
 * carries no position of that text, so the viewer marks a span in the text of its page (`Text`) and shows the page images
 * (`Pages`) with no mark. A letter with no text layer shows its pages and says that no mark is possible.
 *
 * The viewer is a panel beside the page or over it, never a route: the page under it keeps its scroll position and its
 * state, and Close returns the focus to the act that opened the letter.
 */

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import {
  Button, IconCloseOutlineRegular, IconInfoOutlineRegular, IconRightUpOutlineRegular, SegmentedControl,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { DocumentId, PageImage, Span } from '../api.ts'
import type { ScreenContext } from './context.ts'
import { openDocument } from './detail.tsx'
import css from './LetterViewer.module.css'

/**
 * The place of a letter that the viewer shows: a page; a span with its stored offsets, which the viewer marks; or words that
 * the record names with their page but without their place on it, which the viewer cannot mark.
 */
export type LetterPlace =
  | { readonly kind: 'page'; readonly page: number }
  | { readonly kind: 'span'; readonly span: Pick<Span, 'page' | 'start' | 'end' | 'quote'> }
  | { readonly kind: 'words'; readonly page: number; readonly quote: string }

/** The letter that the viewer shows: its document, its name and its page images. */
export interface ShownLetter {
  readonly document: DocumentId
  readonly title: string
  readonly images: readonly PageImage[]
}

/** The letter and the place that the viewer shows now; `seq` counts the shows, so a second click on one quote scrolls to it again. */
export interface LetterShow {
  readonly letter: ShownLetter
  readonly place: LetterPlace
  readonly seq: number
}

/** The letter panel of a page: what it shows, and the acts that open and close it. */
export interface LetterPane {
  /** The place shown, or null while the panel is closed. */
  readonly shown: LetterShow | null
  /** Open the panel at a place of a letter, or move the open panel to it. */
  readonly show: (letter: ShownLetter, place: LetterPlace) => void
  /** Close the panel and return the focus to the act that opened it. */
  readonly close: () => void
}

/**
 * The letter panel of a page. The focus goes back to the element that had it when the panel opened.
 * @returns the panel's state and acts.
 */
export function useLetterPane(): LetterPane {
  const [shown, setShown] = useState<LetterShow | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  const returnFocus = useRef(false)
  useEffect(() => {
    if (shown !== null || !returnFocus.current) return
    returnFocus.current = false
    opener.current?.focus()
    opener.current = null
  }, [shown])
  return {
    shown,
    show: (letter, place) => {
      if (shown === null) opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setShown({ letter, place, seq: (shown?.seq ?? 0) + 1 })
    },
    close: () => {
      returnFocus.current = true
      setShown(null)
    },
  }
}

/** How the viewer shows the letter: its page images, or the text of its pages. */
type Mode = 'pages' | 'text'

/** The text of the letter: loading, its pages, none (a scan with no text layer), or a failed read. */
type TextLoad =
  | { readonly state: 'loading' }
  | { readonly state: 'ready'; readonly pages: readonly string[] }
  | { readonly state: 'none' }
  | { readonly state: 'failed' }

/**
 * Read the text of a letter for as long as the viewer shows it. A 404 refusal is a letter with no text: a scan.
 * @param ctx - the screen context.
 * @param document - the letter.
 * @returns the text.
 */
function useLetterText(ctx: ScreenContext, document: DocumentId): TextLoad {
  const [load, setLoad] = useState<{ readonly document: DocumentId; readonly text: TextLoad } | null>(null)
  const read = ctx.letterText
  useEffect(() => {
    const abort = new AbortController()
    void read(document, abort.signal).then((answer) => {
      if (abort.signal.aborted) return
      const text: TextLoad = answer.ok
        ? answer.value.pages.some(page => page.trim() !== '') ? { state: 'ready', pages: answer.value.pages } : { state: 'none' }
        : answer.error.kind === 'refused' && answer.error.status === 404 ? { state: 'none' } : { state: 'failed' }
      setLoad({ document, text })
    })
    return () => { abort.abort() }
  }, [read, document])
  return load?.document === document ? load.text : { state: 'loading' }
}

/** A run of white space counts as one space, as the Firm Record's quote rule counts it. */
const squash = (text: string): string => text.replace(/\s+/gu, ' ').trim()

/**
 * The page text around a span, when the text at the span's offsets is its quote.
 * @param page - the text of the span's page.
 * @param span - the span.
 * @returns the text before, at and after the span, or null when the text at the offsets is not the quote.
 */
export function markOf(page: string, span: Pick<Span, 'start' | 'end' | 'quote'>): { readonly before: string; readonly at: string; readonly after: string } | null {
  const at = page.slice(span.start, span.end)
  if (span.start < 0 || span.end > page.length || squash(at) === '' || squash(at) !== squash(span.quote)) return null
  return { before: page.slice(0, span.start), at, after: page.slice(span.end) }
}

/** The page of a place. */
const pageOf = (place: LetterPlace): number => place.kind === 'span' ? place.span.page : place.page

/**
 * Render the letter viewer.
 * @param props.ctx - the screen context.
 * @param props.shown - the letter and the place to show.
 * @param props.placement - `side`: a column beside the content from 1366px, over the page below; `over`: always over the page.
 * @param props.onClose - close the viewer.
 * @returns the viewer.
 */
export function LetterViewer({ ctx, shown, placement, onClose }: {
  ctx: ScreenContext
  shown: LetterShow
  placement: 'side' | 'over'
  onClose: () => void
}) {
  const { t } = ctx
  const { letter, place, seq } = shown
  const text = useLetterText(ctx, letter.document)
  const hasImages = letter.images.length > 0
  const hasText = text.state === 'ready'
  const preferred: Mode = place.kind === 'span' || !hasImages ? 'text' : 'pages'
  // Each show starts in the mode that shows its place; the person may then switch.
  const [chosen, setChosen] = useState<{ readonly seq: number; readonly mode: Mode } | null>(null)
  const wanted = chosen?.seq === seq ? chosen.mode : preferred
  const mode: Mode = wanted === 'text' && !hasText && hasImages ? 'pages' : wanted
  const heading = useRef<HTMLHeadingElement>(null)
  const target = useRef<HTMLElement | null>(null)
  const page = pageOf(place)
  const count = hasText ? text.pages.length : letter.images.length
  const mark = place.kind === 'span' && hasText ? markOf(text.pages[place.span.page - 1] ?? '', place.span) : null

  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [seq])
  // The viewer scrolls to the place of each show, and again when the text arrives or the mode changes.
  useLayoutEffect(() => {
    target.current?.scrollIntoView({ block: mark === null ? 'start' : 'center' })
  }, [seq, mode, text.state, mark])

  const keyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    onClose()
  }
  const notices = [
    ...(text.state === 'none' ? [t('letter.viewer.noText')] : []),
    ...(text.state === 'failed' ? [t('letter.viewer.textFailed')] : []),
    ...(place.kind === 'words' ? [t('letter.viewer.noPlace', { page, quote: place.quote })] : []),
    ...(place.kind === 'span' && hasText && mark === null ? [t('letter.viewer.moved', { page })] : []),
    ...(place.kind === 'span' && hasText && mark !== null && mode === 'pages' ? [t('letter.viewer.markInText', { page })] : []),
    ...(!hasImages && (text.state === 'none' || text.state === 'failed') ? [t('letter.viewer.noPages')] : []),
  ]
  return (
    <aside className={`${css.viewer} ${placement === 'side' ? css.side : css.over}`} data-placement={placement} aria-label={t('letter.viewer.label', { title: letter.title })} onKeyDown={keyDown}>
      <header className={css.head}>
        <h2 className={css.title} ref={heading} tabIndex={-1}>{letter.title}</h2>
        <span className={css.count}>{count > 0 && t(count === 1 ? 'intake.letter.pages.one' : 'intake.letter.pages', { count })}</span>
        <div className={css.acts}>
          {hasImages && hasText && (
            <SegmentedControl
              id="records-letter-mode"
              label={t('letter.viewer.mode')}
              value={mode}
              options={[{ value: 'pages', label: t('letter.viewer.pages') }, { value: 'text', label: t('letter.viewer.text') }]}
              onChange={(next) => { setChosen({ seq, mode: next }) }}
            />
          )}
          <Button variant="ghost" size="sm" icon={<IconRightUpOutlineRegular size={16} />} onClick={() => { openDocument(ctx, letter.document) }}>
            {t('letter.viewer.openPdf')}
          </Button>
          <Button variant="ghost" size="sm" icon={<IconCloseOutlineRegular size={16} />} aria-label={t('letter.viewer.close')} title={t('letter.viewer.close')} onClick={onClose} />
        </div>
      </header>
      {notices.length > 0 && (
        <div className={css.notices}>
          {notices.map(notice => (
            <p key={notice} className={css.notice} data-fdl-part="notice"><IconInfoOutlineRegular size={16} /><span>{notice}</span></p>
          ))}
        </div>
      )}
      <div className={css.body}>
        {mode === 'pages'
          ? letter.images.map(image => (
            <figure key={image.page} className={css.page} ref={image.page === page ? target : undefined}>
              <img
                className={css.image}
                data-fdl-part="letter"
                src={ctx.pageHref(image.href)}
                width={image.width}
                height={image.height}
                loading={Math.abs(image.page - page) <= 1 ? 'eager' : 'lazy'}
                alt={t('intake.letter.image', { page: image.page, count: letter.images.length })}
              />
              <figcaption className={css.pageCap}>{t('letter.viewer.page', { page: image.page, count: letter.images.length })}</figcaption>
            </figure>
          ))
          : hasText && text.pages.map((pageText, index) => {
            const number = index + 1
            const marked = mark !== null && number === page ? mark : null
            return (
              <section
                key={number}
                className={css.page}
                aria-label={t('letter.viewer.page', { page: number, count: text.pages.length })}
                ref={number === page && marked === null ? target : undefined}
              >
                {/* The text of the letter is the source, so the deny-list does not read it (R19). */}
                <pre className={css.text} data-fdl-part="letter" data-verbatim="">
                  {marked === null
                    ? pageText
                    : (
                      <>
                        {marked.before}
                        <mark className={css.mark} ref={target}>{marked.at}</mark>
                        {marked.after}
                      </>
                    )}
                </pre>
                <p className={css.pageCap}>{t('letter.viewer.page', { page: number, count: text.pages.length })}</p>
              </section>
            )
          })}
        {mode === 'text' && text.state === 'loading' && <p className={css.loading}>{t('letter.viewer.loading')}</p>}
      </div>
    </aside>
  )
}
