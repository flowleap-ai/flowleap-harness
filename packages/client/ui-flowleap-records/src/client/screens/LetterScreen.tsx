/**
 * One letter of intake as its own page (mockup `2-file-letter`), as My work opens a File this letter task: the open
 * letter of Intake with its docked decision bar, and no list beside it. After the decision the page shows the
 * letter's next state, such as the office event that waits for a person.
 */

import { LoadView, PageSpinner } from '../parts/States.tsx'
import type { ScreenProps } from './context.ts'
import { IntakeLetter } from './IntakeLetter.tsx'
import { LoadError } from './shared.tsx'
import css from './Intake.module.css'

/**
 * Render the letter page.
 * @param props.screen - the letter route with its load.
 * @param props.ctx - the screen context.
 * @returns the page.
 */
export function LetterScreen({ screen, ctx }: ScreenProps<'letter'>) {
  return (
    <div className={css.solo}>
      <LoadView
        load={screen.item}
        render={{
          loading: () => <PageSpinner label={ctx.t('loading')} />,
          failed: (at, error) => <LoadError ctx={ctx} at={at} error={error} />,
          ready: letter => <IntakeLetter key={letter.document} ctx={ctx} list="waiting" letter={letter} step={undefined} onDecided={ctx.refresh} />,
        }}
      />
    </div>
  )
}
