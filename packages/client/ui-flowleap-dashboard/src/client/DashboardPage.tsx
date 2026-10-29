/**
 * The dashboard page: a greeting, the ask bar with the search results of the registered search groups, the first
 * steps of a first sign-in, the metric cards and panels that apps register through `dashboard.metric` and
 * `dashboard.widget`, and the Install FlowLeap card.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type KeyboardEvent } from 'react'
import {
  Button, IconAgentPresetOutlineRegular, IconAlarmClockOutlineRegular, IconSearchOutlineRegular, IconSendOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { matchesQuery, type DashboardEntries, type DashboardSearchGroup, type DashboardSearchQuery } from './contract.ts'
import { InstallCard } from './InstallCard.tsx'
import type { FlowleapDashboardKey, NS } from './locales.ts'
import css from './Dashboard.module.css'

/** Browser storage key of the hidden first steps; a per-viewer convenience only. */
const FIRST_STEPS_HIDDEN_KEY = 'flowleap.dashboard.firstStepsHidden'

/** Most results one search group shows. */
const SEARCH_ROWS = 5

/** Injected share of the page. */
export type DashboardPageInjected = {
  readonly hooks: DashboardEntries & {
    /** The registered search groups, ordered by `order`. */
    readonly searches: ObservableSnapshot<readonly DashboardSearchGroup[]>
    /** Increments each time the Search action asks the page to focus the ask bar. */
    readonly focusRequests: ObservableSnapshot<number>
  }
  /**
   * Open a new chat with the text in its composer.
   * @param text - the question; an empty text opens an empty chat.
   */
  readonly onAsk: (text: string) => void
}

/** Full props of the page. */
export type DashboardPageProps = PropsRuntime<'main'> & PropsLocale<typeof NS>
  & PropsRenderSlots<'dashboard.metric' | 'dashboard.widget'>
  & InjectFace<DashboardPageInjected>

function greetingKey(hour: number): FlowleapDashboardKey {
  if (hour < 12) return 'greeting.morning'
  return hour < 18 ? 'greeting.afternoon' : 'greeting.evening'
}

function readHidden(): boolean {
  try {
    return window.localStorage.getItem(FIRST_STEPS_HIDDEN_KEY) === 'true'
  } catch (_error: unknown) {
    // Storage can be blocked; the first steps then show until the first chat exists.
    return false
  }
}

/** Props of the search results. */
interface SearchResultsProps {
  readonly groups: readonly DashboardSearchGroup[]
  readonly text: string
  /** Called before a result opens, so the page clears the ask bar. */
  readonly onPick: () => void
  readonly t: DashboardPageProps['t']
}

/**
 * Render the results of every group for the text, the first five of each, and read again when a group's data changes.
 * @param props - the groups, the trimmed text, the pick action, and copy.
 * @returns the results region.
 */
function SearchResults({ groups, text, onPick, t }: SearchResultsProps) {
  const revision = useRef(0)
  const subscribe = useCallback((listener: () => void) => {
    const bump = (): void => {
      revision.current++
      listener()
    }
    const stops = groups.map(group => group.subscribe(bump))
    return () => { for (const stop of stops) stop() }
  }, [groups])
  // A group's data change moves the revision, so the page renders and asks each group again.
  useSyncExternalStore(subscribe, () => revision.current)
  const query: DashboardSearchQuery = { text, matches: value => matchesQuery(value, text) }
  const sections = groups.flatMap((group) => {
    const results = group.results(query).slice(0, SEARCH_ROWS)
    return results.length === 0 ? [] : [{ group, label: group.label(), results }]
  })
  return (
    <section className={css.results} aria-label={t('search.label')} data-testid="flowleap-search-results">
      <p className={css.panelSummary}>{t('search.hint')}</p>
      {sections.map(({ group, label, results }) => (
        <section key={group.id} className={css.searchGroup} aria-label={label}>
          <h3 className={css.subheading}>{label}</h3>
          <ul className={css.rows}>
            {results.map(({ id, title, detail, icon: Icon, open }) => (
              <li key={id}>
                <Button className={css.row} onClick={() => {
                  onPick()
                  open()
                }}>
                  <Icon size={16} className={css.rowGlyph} />
                  <span className={css.rowText}>
                    <span className={css.rowTitle}>{title}</span>
                    {detail !== undefined && <span className={css.rowMeta}>{detail}</span>}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  )
}

/**
 * Render the dashboard.
 * @param props - the slot entries, the Session list, the ask action, and copy.
 * @returns the page.
 */
export function DashboardPage({
  useMetrics, useWidgets, useSearches, useFocusRequests, useSessions, onAsk, renderSlot, t,
}: DashboardPageProps) {
  const metrics = useMetrics(entries => entries)
  const widgets = useWidgets(entries => entries)
  const searches = useSearches(groups => groups)
  const focusRequests = useFocusRequests(count => count)
  const firstSignIn = useSessions(list => list.phase === 'ready' && list.ids.every(id => list.byId[id]?.blank !== false))
  const [hidden, setHidden] = useState(readHidden)
  const [text, setText] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { if (focusRequests > 0) input.current?.focus() }, [focusRequests])
  const query = text.trim()
  const clearOnEscape = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && text !== '') {
      event.preventDefault()
      setText('')
    }
  }
  const submit = (event: FormEvent): void => {
    event.preventDefault()
    onAsk(text.trim())
    setText('')
  }
  const hide = (): void => {
    setHidden(true)
    try {
      window.localStorage.setItem(FIRST_STEPS_HIDDEN_KEY, 'true')
    } catch (_error: unknown) {
      // Storage can be blocked; the first steps stay hidden for this page load only.
    }
  }
  const steps = [
    { id: 'ask', icon: <IconSearchOutlineRegular size={18} />, run: () => { input.current?.focus() } },
    { id: 'agent', icon: <IconAgentPresetOutlineRegular size={18} />, run: () => { onAsk('') } },
    { id: 'watch', icon: <IconAlarmClockOutlineRegular size={18} />, run: () => { onAsk(t('firstSteps.watch.prompt')) } },
  ] as const
  return (
    <section className={css.page} aria-label={t('title')} data-testid="flowleap-dashboard">
      <div className={css.content}>
        <header className={css.heading}>
          <h1>{t(greetingKey(new Date().getHours()))}</h1>
          <p>{t('greeting.summary')}</p>
        </header>
        <form className={css.ask} role="search" onSubmit={submit}>
          <IconSearchOutlineRegular size={18} className={css.askGlyph} aria-hidden="true" />
          <input
            ref={input}
            className={css.askInput}
            aria-label={t('ask.label')}
            placeholder={t('ask.placeholder')}
            value={text}
            onChange={(event) => { setText(event.target.value) }}
            onKeyDown={clearOnEscape}
          />
          <Button type="submit" variant="primary" size="sm" icon={<IconSendOutlineRegular size={14} />}>{t('ask.submit')}</Button>
        </form>
        {query !== '' && <SearchResults groups={searches} text={query} onPick={() => { setText('') }} t={t} />}
        {firstSignIn && !hidden && (
          <section className={css.firstSteps} aria-label={t('firstSteps.title')} data-testid="flowleap-first-steps">
            <div className={css.firstStepsHeading}>
              <div>
                <h2>{t('firstSteps.title')}</h2>
                <p>{t('firstSteps.summary')}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={hide}>{t('firstSteps.hide')}</Button>
            </div>
            <ol className={css.steps}>
              {steps.map(step => (
                <li key={step.id}>
                  <button type="button" className={css.step} onClick={step.run}>
                    <span className={css.stepGlyph} aria-hidden="true">{step.icon}</span>
                    <span className={css.stepTitle}>{t(`firstSteps.${step.id}.title`)}</span>
                    <span className={css.stepDescription}>{t(`firstSteps.${step.id}.description`)}</span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        )}
        {metrics.length > 0 && (
          <ul className={css.metrics} aria-label={t('metrics.label')}>
            {metrics.map(entry => (
              <li key={entry.id} className={css.metric}>
                <h2 className={css.metricLabel}>{entry.label}</h2>
                {renderSlot('dashboard.metric', {}, { only: entry.id })}
              </li>
            ))}
          </ul>
        )}
        <div className={css.panels} aria-label={t('panels.label')} role="list">
          {widgets.map(entry => (
            <section key={entry.id} className={css.panel} role="listitem" aria-label={entry.label}>
              <h2 className={css.panelHeading}>{entry.label}</h2>
              {renderSlot('dashboard.widget', {}, { only: entry.id })}
            </section>
          ))}
          <InstallCard t={t} />
        </div>
      </div>
    </section>
  )
}
