/** Running Turn clock isolated from the transcript's render cycle. */
import { memo, useEffect, useState } from 'react'
import { TextShimmer } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { ChatViewSlotProps } from '../contract/slots.ts'
import { formatRunDuration, LIVE_RUN_CLOCK_INTERVAL_MS } from './message-chrome.ts'
import a11yCss from './accessibility.module.css'
import css from './ChatView.module.css'

type RunningStatusProps = {
  readonly startTime: number | undefined
  /** Freeze the shown duration while the Client cannot observe the Session. */
  readonly paused: boolean
  readonly t: ChatViewSlotProps['t']
} & Pick<PropsRenderSlots<'conversation.chat.running.icon'>, 'renderSlot'>

/**
 * Show live elapsed time after the current Turn's content without announcing ticks.
 * @param props - Current Turn start time, pause state, localized copy, and the running icon Slot renderer.
 * @returns the blue running indicator; mount only while the Session is running.
 */
export const RunningStatus = memo(function RunningStatus({ startTime, paused, t, renderSlot }: RunningStatusProps) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (startTime === undefined || paused) return
    setNow(Date.now())
    const timer = setInterval(() => { setNow(Date.now()) }, LIVE_RUN_CLOCK_INTERVAL_MS)
    return () => { clearInterval(timer) }
  }, [startTime, paused])
  const label = startTime === undefined ? t('chat.deepDiving') : t('chat.deepDivingFor', {
    duration: formatRunDuration(Math.max(1000, now - startTime), t).map(part => part.text).join(''),
  })
  return (
    <div className={css.running} data-chat-running>
      <span className={a11yCss.visuallyHidden} role="status" aria-live="polite" aria-atomic="true">{t('chat.deepDiving')}</span>
      <span className={css.runningDivider} aria-hidden="true" />
      <span className={css.runningContent}>
        {renderSlot('conversation.chat.running.icon', { className: css.runningIcon })}
        <TextShimmer active className={css.runningText}>{label}</TextShimmer>
      </span>
    </div>
  )
})
