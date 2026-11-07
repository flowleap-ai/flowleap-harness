/**
 * The Find a matter dialog: a 712 px menu on a scrim with the Matters chip, the query input, and the matters that
 * `GET search` finds inside the person's walls, each with its file number and title, its client and the application
 * number or person that the query matched. ↑ and ↓ move, ↵ opens the dossier, Esc and the scrim close it. It opens
 * and closes with no motion (R15).
 */

import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { MenuGroup, MenuSurface, isMobileDevice, useModalLayer } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { FileNumber, RecordsApi, SearchMatter } from './api.ts'
import { extraMatches, MAX_QUERY, useMatterSearch } from './find.ts'
import type { NS } from './locales.ts'
import css from './FindDialog.module.css'

/** Injected share of the dialog. */
export interface FindInjected {
  readonly hooks: {
    /** The dialog shows; each opening counts up, so a new opening starts with an empty query. */
    readonly opening: ObservableSnapshot<number | null>
  }
  readonly search: RecordsApi['search']
  readonly close: () => void
  /** Open a found matter's dossier. */
  readonly openMatter: (fileNumber: FileNumber) => void
}

/** Props of the dialog. */
export type FindDialogProps = InjectFace<FindInjected> & PropsLocale<typeof NS>

/**
 * Render Find a matter while it is open.
 * @param props - the opening, the search, the acts and copy.
 * @returns the dialog, or nothing.
 */
export function FindDialog({ useOpening, search, close, openMatter, t }: FindDialogProps) {
  const opening = useOpening(value => value)
  if (opening === null) return null
  return <FindBody key={opening} search={search} close={close} openMatter={openMatter} t={t} />
}

/**
 * Render one opening of the dialog.
 * @param props.search - the search read.
 * @param props.close - close the dialog.
 * @param props.openMatter - open a dossier.
 * @param props.t - the translate function.
 * @returns the dialog.
 */
function FindBody({ search, close, openMatter, t }: Pick<FindDialogProps, 'search' | 'close' | 'openMatter' | 't'>) {
  const dialog = useRef<HTMLDivElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  useModalLayer(dialog, true, close)
  const found = useMatterSearch(search, query)
  const rows: readonly SearchMatter[] = found.phase === 'ready' ? found.answer.matters : found.phase === 'searching' ? found.last?.matters ?? [] : []
  useEffect(() => {
    viewport.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active, rows])
  const open = (matter: SearchMatter | undefined) => {
    if (matter === undefined) return
    close()
    openMatter(matter.fileNumber)
  }
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.nativeEvent.isComposing) return
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && rows.length > 0) {
      event.preventDefault()
      setActive((active + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      open(rows[active])
    }
  }
  const status = (() => {
    switch (found.phase) {
      case 'idle': return t('find.hint')
      case 'failed': return t('find.failed')
      case 'searching': return rows.length === 0 ? t('loading') : null
      case 'ready': return rows.length === 0 ? t('find.none') : null
    }
  })()
  return (
    <div className={css.root} role="presentation">
      <div className={css.scrim} aria-hidden="true" onClick={close} />
      <MenuSurface ref={dialog} role="dialog" aria-modal="true" aria-label={t('find.act')} data-shortcut-modal="records-find"
        tabIndex={-1} className={css.menu} onKeyDown={onKeyDown}>
        <div className={css.chip} tabIndex={-1} {...isMobileDevice() ? { 'data-modal-autofocus': '' } : {}}>{t('find.label')}</div>
        <input
          className={css.search}
          type="text"
          maxLength={MAX_QUERY}
          aria-label={t('find.placeholder')}
          placeholder={t('find.placeholder')}
          value={query}
          {...isMobileDevice() ? {} : { 'data-modal-autofocus': '' }}
          onChange={(event) => {
            setQuery(event.currentTarget.value)
            setActive(0)
          }}
        />
        {status !== null && <div className={css.status} role="status">{status}</div>}
        {rows.length > 0 && (
          <div ref={viewport} role="listbox" aria-label={t('find.label')} className={css.viewport}>
            <MenuGroup label={t('find.label')}>
              {rows.map((matter, index) => {
                const extra = extraMatches(matter)
                return (
                  <div
                    key={matter.fileNumber}
                    role="option"
                    aria-selected={index === active}
                    className={clsx(css.row, index === active && css.rowActive)}
                    onClick={() => { open(matter) }}
                    onMouseMove={() => { if (index !== active) setActive(index) }}
                  >
                    <span className={css.key}>{matter.fileNumber}</span>
                    <span className={css.sub}>
                      <span className={css.title}>{matter.title}</span>
                      <span className={css.client}>{[matter.client, ...extra].join(' · ')}</span>
                    </span>
                  </div>
                )
              })}
            </MenuGroup>
          </div>
        )}
        <div className={css.note}>{found.phase === 'ready' && found.answer.more ? t('find.more') : t('find.group')}</div>
      </MenuSurface>
    </div>
  )
}
