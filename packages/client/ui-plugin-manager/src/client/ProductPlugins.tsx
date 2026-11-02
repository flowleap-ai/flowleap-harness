/**
 * The plugins the product itself brings: the running rows of the selected bundles the installation supplies, such as
 * a branded profile layer. The page lists them read-only, because they are part of the product.
 */
import { createContext, type ReactNode } from 'react'
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { HIDDEN_BUNDLES } from '@deepseek-ai/dsh-official-bundles'
import type { PackageRow, PackageView, PluginManagerFace } from './manager-store.ts'
import { rowText, type Translate } from './presentation.ts'
import css from './PluginManagerPage.module.css'

/** Whether the page shows package names, row ids, and install specs; false shows product names only. */
export const PackageNames = createContext(true)

/** One product plugin as a card shows it: the running rows that share one display title. */
export interface ProductPlugin {
  readonly title: string
  readonly description: string | undefined
  readonly icon: string | undefined
  /** The rows behind the card, in the order their bundles declare them. */
  readonly rows: readonly PackageRow[]
  /** The context-global tools of every row, sorted, without duplicates. */
  readonly tools: readonly string[]
  readonly hasClient: boolean
}

/**
 * The product plugins of the profile. A Host row and its browser half often carry the same display title, so rows with
 * one title form one card; its description and icon are the first row's that has one.
 * @param packages - the Host's bundles as views.
 * @param resolveText - current-locale package text resolver.
 * @param packageNames - whether a row without a display title shows its module specifier.
 * @returns the cards, ordered by title.
 */
export function productPlugins(
  packages: readonly PackageView[], resolveText: PluginManagerFace['resolveText'], packageNames: boolean,
): ProductPlugin[] {
  const byTitle = new Map<string, { description: string | undefined; icon: string | undefined; rows: PackageRow[] }>()
  const products = packages.filter(pkg => pkg.enabled && !pkg.official && !pkg.installed
    && pkg.availability === 'installation' && !HIDDEN_BUNDLES.has(pkg.name))
  for (const row of products.flatMap(pkg => pkg.rows).filter(row => row.enabled)) {
    const { title, description } = rowText(row, resolveText, packageNames)
    const card = byTitle.get(title) ?? { description: undefined, icon: undefined, rows: [] }
    card.rows.push(row)
    card.description ??= description
    card.icon ??= row.meta?.icon
    byTitle.set(title, card)
  }
  return [...byTitle].map(([title, card]) => ({
    title,
    description: card.description,
    icon: card.icon,
    rows: card.rows,
    tools: [...new Set(card.rows.flatMap(row => row.tools))].sort(),
    hasClient: card.rows.some(row => row.hasClient),
  })).sort((a, b) => a.title.localeCompare(b.title))
}

/**
 * One product plugin: its icon, its title, its one-liner, what it adds, and its state, without a control.
 * @param props - the card, the manager's translate seat, the rendered artwork, and the rendered state.
 * @returns the card.
 */
export function ProductPluginCard({ plugin, t, icon, state }: {
  readonly plugin: ProductPlugin
  readonly t: Translate
  readonly icon: ReactNode
  readonly state: ReactNode
}): ReactNode {
  const adds = [
    ...plugin.tools.length === 0 ? [] : [{ key: 'tools', text: t('addsTools', { count: String(plugin.tools.length) }), title: plugin.tools.join(', ') }],
    ...plugin.hasClient ? [{ key: 'interface', text: t('addsInterface'), title: undefined }] : [],
  ]
  return (
    <li className={css.card} data-plugin-product={plugin.title}>
      <div className={css.cardHead}>
        <span className={css.cardIcon} aria-hidden="true">{icon}</span>
        <div className={css.cardMain}>
          <div className={css.titleRow}>
            <span className={css.cardTitle}>{plugin.title}</span>
          </div>
          {plugin.description === undefined ? null : <span className={css.cardDesc}>{plugin.description}</span>}
          {adds.length === 0 ? null : (
            <ul className={css.adds} aria-label={t('addsLabel')}>
              {adds.map(item => (
                <li key={item.key} {...item.title === undefined ? {} : { title: item.title }}>
                  <Tag className={css.statusTag}>{item.text}</Tag>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className={css.cardEnd}>{state}</div>
      </div>
    </li>
  )
}
