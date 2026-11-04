/**
 * The layouts of the IPMS views: the queue split view (R20), the detail page with its properties panel, and the work
 * column whose content scrolls above a docked decision bar (R13). Widths come from CSS media features, so a width
 * change keeps the view, its state and its focus.
 */

import type { ReactNode } from 'react'
import css from './Layout.module.css'

/**
 * Render a queue: the list, and the open item beside it from 1366px (the list takes 44%, at least 480px). Below
 * 1366px an open item fills the view as the item page and the list waits behind it.
 * @param props.list - the list pane.
 * @param props.item - the open item's pane, or null when no item is open (the list fills the view).
 * @returns the split view.
 */
export function QueueSplit({ list, item }: { list: ReactNode; item: ReactNode | null }) {
  return (
    <div className={css.split} data-open={item !== null || undefined}>
      <div className={css.listPane}>{list}</div>
      {item !== null && <div className={css.itemPane}>{item}</div>}
    </div>
  )
}

/**
 * Render a detail page: the content and the 376px properties panel at the right. At 390px the panel stacks under
 * the content, or hides on a decision page, whose decision bar carries the decision.
 * @param props.children - the content, usually a `WorkColumn` or a scrolling `DetailContent`.
 * @param props.properties - the properties panel.
 * @param props.decision - the page is a decision page: the panel hides at 390px.
 * @returns the page.
 */
export function DetailLayout({ children, properties, decision = false }: {
  children: ReactNode
  properties: ReactNode
  decision?: boolean
}) {
  return (
    <div className={css.detail} data-decision={decision || undefined}>
      {children}
      {properties}
    </div>
  )
}

/**
 * Render a column whose content scrolls and whose decision bar stays docked at its bottom (R13).
 * @param props.children - the scrolling content: eyebrow, title, evidence, Activity.
 * @param props.decision - the decision bar, or null on a page with no decision.
 * @returns the column.
 */
export function WorkColumn({ children, decision }: { children: ReactNode; decision: ReactNode | null }) {
  return (
    <div className={css.work}>
      <div className={css.workScroll}>{children}</div>
      {decision !== null && <div className={css.dock}>{decision}</div>}
    </div>
  )
}

/**
 * Render a detail header: the eyebrow (the status pill and a fact), the 20px title and the lede.
 * @param props.eyebrow - the status pill and the facts before the title.
 * @param props.title - the title, the largest text unless the page has a key fact.
 * @param props.lede - one or two sentences in the 14px lede role.
 * @returns the header.
 */
export function DetailHeader({ eyebrow, title, lede }: { eyebrow: ReactNode; title: ReactNode; lede?: ReactNode }) {
  return (
    <header className={css.header}>
      <div className={css.eyebrow}>{eyebrow}</div>
      <h1 className={css.title}>{title}</h1>
      {lede !== undefined && <p className={css.lede}>{lede}</p>}
    </header>
  )
}

/**
 * Render the one key fact of a screen (R4), such as a deadline's due date: the largest text, at 24px and weight 500.
 * @param props.value - the key fact.
 * @param props.detail - what follows it, such as the days left.
 * @returns the key fact.
 */
export function KeyFact({ value, detail }: { value: string; detail?: ReactNode }) {
  return (
    <div className={css.keyFact}>
      <span className={css.keyFactValue}>{value}</span>
      {detail !== undefined && <span className={css.keyFactDetail}>{detail}</span>}
    </div>
  )
}

/**
 * Render a section of a detail page: a 13px heading with its count and its actions, then the content.
 * @param props.heading - the heading.
 * @param props.count - the number of items, when the section lists items.
 * @param props.actions - controls at the right of the heading.
 * @param props.children - the content.
 * @returns the section.
 */
export function Section({ heading, count, actions, children }: {
  heading: string
  count?: number
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className={css.section}>
      <div className={css.sectionHeader}>
        <h2 className={css.sectionTitle}>{heading}</h2>
        {count !== undefined && <span className={css.count}>{count}</span>}
        {actions !== undefined && <div className={css.sectionActions}>{actions}</div>}
      </div>
      {children}
    </section>
  )
}

/** One label and value of a properties panel. */
export interface Property {
  readonly label: string
  readonly value: ReactNode
  /** The full value on hover when the value may truncate; a key fact is shortened instead. */
  readonly title?: string | undefined
}

/** A group of a properties panel. */
export interface PropertyGroup {
  readonly heading: string
  readonly rows: readonly Property[]
}

/**
 * Render the properties panel: groups with a 12px heading and 32px rows of a 96px label and the value. It does not
 * repeat the status, which the eyebrow shows.
 * @param props.label - the panel's accessible name.
 * @param props.groups - the groups.
 * @returns the panel.
 */
export function PropertiesPanel({ label, groups }: { label: string; groups: readonly PropertyGroup[] }) {
  return (
    <aside className={css.props} aria-label={label}>
      {groups.map(group => (
        <section key={group.heading} className={css.propGroup}>
          <h3 className={css.propHeading}>{group.heading}</h3>
          <dl className={css.propList}>
            {group.rows.map(row => (
              <div key={row.label} className={css.prop}>
                <dt className={css.propLabel}>{row.label}</dt>
                <dd className={css.propValue} title={row.title}>{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </aside>
  )
}

/**
 * Render the three key properties of a queue's item pane, which has no properties panel (R20).
 * @param props.rows - the properties, three at most.
 * @returns the properties.
 */
export function KeyProperties({ rows }: { rows: readonly Property[] }) {
  return (
    <dl className={css.keyProps}>
      {rows.map(row => (
        <div key={row.label} className={css.keyProp}>
          <dt className={css.propLabel}>{row.label}</dt>
          <dd className={css.keyValue}>{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}
