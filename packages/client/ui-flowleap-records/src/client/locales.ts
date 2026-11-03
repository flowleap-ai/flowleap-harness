/**
 * `flowleapRecords` namespace dictionaries: the Records launcher, the frame, and the empty state. English is the
 * key-set source of truth.
 */

/** Dictionary namespace owned by this plugin. */
export const NS = 'flowleapRecords'

/** English dictionary (the key-set source of truth). */
export const en = {
  'panel': 'Matters',
  'frame': 'Matters of the firm',
  'empty.title': 'No matters yet',
  'empty.body': 'This firm has no matters yet. When the Firm Record is installed on the firm host, the matters and their deadlines show here.',
} as const

/** Key domain of the namespace. */
export type FlowleapRecordsKey = keyof typeof en

/** Simplified Chinese dictionary, checked against the English keys. */
export const zh = {
  'panel': '案件',
  'frame': '事务所案件',
  'empty.title': '还没有案件',
  'empty.body': '本事务所还没有案件。在事务所主机上安装事务所案卷后，案件及其期限会显示在这里。',
} satisfies Record<FlowleapRecordsKey, string>

/** Japanese dictionary, checked against the English keys. */
export const ja = {
  'panel': '案件',
  'frame': '事務所の案件',
  'empty.title': 'まだ案件がありません',
  'empty.body': 'この事務所にはまだ案件がありません。事務所ホストに案件記録サービスを導入すると、案件とその期限がここに表示されます。',
} satisfies Record<FlowleapRecordsKey, string>

/** Spanish dictionary, checked against the English keys. */
export const es = {
  'panel': 'Asuntos',
  'frame': 'Asuntos del despacho',
  'empty.title': 'Aún no hay asuntos',
  'empty.body': 'Este despacho aún no tiene asuntos. Cuando el registro del despacho esté instalado en el servidor del despacho, los asuntos y sus plazos se mostrarán aquí.',
} satisfies Record<FlowleapRecordsKey, string>

/** French dictionary, checked against the English keys. */
export const fr = {
  'panel': 'Affaires',
  'frame': 'Affaires du cabinet',
  'empty.title': 'Pas encore d’affaires',
  'empty.body': 'Ce cabinet n’a pas encore d’affaires. Quand le registre du cabinet sera installé sur l’hôte du cabinet, les affaires et leurs délais s’afficheront ici.',
} satisfies Record<FlowleapRecordsKey, string>

/** German dictionary, checked against the English keys. */
export const de = {
  'panel': 'Akten',
  'frame': 'Akten der Kanzlei',
  'empty.title': 'Noch keine Akten',
  'empty.body': 'Diese Kanzlei hat noch keine Akten. Sobald die Kanzleiakte auf dem Kanzlei-Host installiert ist, erscheinen hier die Akten und ihre Fristen.',
} satisfies Record<FlowleapRecordsKey, string>

/** Russian dictionary, checked against the English keys. */
export const ru = {
  'panel': 'Дела',
  'frame': 'Дела фирмы',
  'empty.title': 'Дел пока нет',
  'empty.body': 'У этой фирмы пока нет дел. Когда реестр фирмы будет установлен на хосте фирмы, дела и их сроки появятся здесь.',
} satisfies Record<FlowleapRecordsKey, string>

/** Portuguese dictionary, checked against the English keys. */
export const pt = {
  'panel': 'Processos',
  'frame': 'Processos do escritório',
  'empty.title': 'Ainda não há processos',
  'empty.body': 'Este escritório ainda não tem processos. Quando o registo do escritório estiver instalado no servidor do escritório, os processos e os seus prazos aparecem aqui.',
} satisfies Record<FlowleapRecordsKey, string>
