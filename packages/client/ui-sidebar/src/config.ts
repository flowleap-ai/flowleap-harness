/**
 * FlowLeap fork modification: the labelled panel groups and the foot panels a deployment names for the sidebar. The
 * Host validates them at load and embeds them in browser pages; with no groups the panel list keeps its upstream form.
 */
import z from '@deepseek-ai/schemastery'

/** Page global that carries the validated configuration to the browser. */
export const SIDEBAR_PAGE_GLOBAL = '__DSH_SIDEBAR_PAGE_CONFIG__'

/** Group label text per lowercase locale key; English is required and is the fallback. */
export interface SidebarGroupLabel {
  /** English label; required, and shown in each language that has no entry. */
  readonly en: string
  readonly [locale: string]: string
}

/** One labelled group of panel rows. */
export interface SidebarGroupConfig {
  /** Stable group id; unique in `groups`. */
  id: string
  /** Visible group label and the accessible name of its list. */
  label: SidebarGroupLabel
  /** Panel ids (`sidebar.panellist` registration ids) in display order. */
  panels: string[]
}

/** Sidebar layout a deployment selects. */
export interface Config {
  /** Groups in display order. Registered panels in no group and not in `footPanels` follow the groups unlabelled. */
  groups: SidebarGroupConfig[]
  /** Panel ids drawn at the sidebar foot above Settings instead of in the panel list. */
  footPanels: string[]
}

const Group: z<SidebarGroupConfig> = z.object({
  id: z.string().required(),
  label: z.transform(z.dict(z.string()), (label) => {
    if (typeof label.en !== 'string' || label.en === '') throw new Error('ui-sidebar: a group label needs English text (en)')
    return label as SidebarGroupLabel
  }),
  panels: z.array(z.string()).default([]),
})

const Layout: z<Partial<Config>, Config> = z.object({
  groups: z.array(Group).default([]),
  footPanels: z.array(z.string()).default([]),
})

/** Validated sidebar layout; a repeated group id or a panel named twice fails the load. */
export const Config: z<Partial<Config>, Config> = z.transform(Layout, (input) => {
  const config = Layout(input)
  const groupIds = new Set<string>()
  const panelIds = new Set<string>()
  for (const group of config.groups) {
    if (groupIds.has(group.id)) throw new Error(`ui-sidebar: group id "${group.id}" is repeated`)
    groupIds.add(group.id)
  }
  for (const id of [...config.groups.flatMap(group => group.panels), ...config.footPanels]) {
    if (panelIds.has(id)) throw new Error(`ui-sidebar: panel "${id}" is named twice in groups and footPanels`)
    panelIds.add(id)
  }
  return config
})
