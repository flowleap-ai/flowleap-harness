/**
 * Text that the analysis wrote, such as a cited passage or a claim element. The model writes it as Markdown with patent
 * reader links, so the board renders it with the chat's Markdown renderer and a link shows as the chat shows it.
 */

import { useMemo } from 'react'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { NS } from './locales.ts'
import css from './WorkPages.module.css'

/**
 * Render analysis text as compact Markdown. The Markdown takes the color, size and line height of the wrapper, and one
 * newline in a paragraph stays a line break.
 * @param props.text - the Markdown text of the analysis.
 * @param props.className - the class of the wrapper, which sets the color, size and line height.
 * @param props.t - copy.
 * @returns the rendered text.
 */
export function AnalysisText({ text, className, t }: { text: string; className?: string | undefined; t: TranslateNS<typeof NS> }) {
  const labels = useMemo(() => ({
    code: { copyLabel: t('markdown.copy'), copiedLabel: t('markdown.copied') },
    footnotes: t('markdown.footnotes'),
  }), [t])
  return <div className={className === undefined ? css.analysis : `${css.analysis} ${className}`}><MarkdownText text={text} labels={labels} variant="compact" /></div>
}
