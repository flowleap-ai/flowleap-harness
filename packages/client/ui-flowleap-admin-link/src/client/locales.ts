/**
 * `flowleapAdminLink` namespace dictionaries: the Firm admin row. English is the key-set source of truth.
 */

/** Dictionary namespace owned by this plugin. */
export const NS = 'flowleapAdminLink'

/** English dictionary (the key-set source of truth). */
export const en = {
  'link': 'Firm admin',
} as const

/** Key domain of the namespace. */
export type FlowleapAdminLinkKey = keyof typeof en

/** Simplified Chinese dictionary, checked against the English keys. */
export const zh = {
  'link': '事务所管理',
} satisfies Record<FlowleapAdminLinkKey, string>

/** Japanese dictionary, checked against the English keys. */
export const ja = {
  'link': '事務所の管理',
} satisfies Record<FlowleapAdminLinkKey, string>

/** Spanish dictionary, checked against the English keys. */
export const es = {
  'link': 'Administración del despacho',
} satisfies Record<FlowleapAdminLinkKey, string>

/** French dictionary, checked against the English keys. */
export const fr = {
  'link': 'Administration du cabinet',
} satisfies Record<FlowleapAdminLinkKey, string>

/** German dictionary, checked against the English keys. */
export const de = {
  'link': 'Kanzleiverwaltung',
} satisfies Record<FlowleapAdminLinkKey, string>

/** Russian dictionary, checked against the English keys. */
export const ru = {
  'link': 'Администрирование фирмы',
} satisfies Record<FlowleapAdminLinkKey, string>

/** Portuguese dictionary, checked against the English keys. */
export const pt = {
  'link': 'Administração do escritório',
} satisfies Record<FlowleapAdminLinkKey, string>
