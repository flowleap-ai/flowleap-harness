/**
 * The example request that New task on the Automation tasks page (`ui-schedule`, namespace `schedule.manager`) puts in
 * the new chat's composer, unsent, when the deployment sets `newTaskDraft`. A patent example replaces the generic one.
 */

/** Namespace of the Automation tasks page copy. */
export const SCHEDULE_MANAGER_NS = 'schedule.manager'

/** The patent example request of each shipped UI language. */
export const NEW_TASK_DRAFT = {
  en: 'Every Monday at 9:00, check the EP Register for EP1234567 and tell me what changed.',
  zh: '每周一 9:00，查看 EP1234567 在 EP 登记簿中的状态，并告诉我有哪些变化。',
  ja: '毎週月曜日の 9:00 に EP1234567 の EP レジスターを確認し、変わった点を教えてください。',
  es: 'Cada lunes a las 9:00, consulta el Registro EP de EP1234567 y dime qué ha cambiado.',
  fr: 'Chaque lundi à 9 h 00, consulte le Registre EP pour EP1234567 et dis-moi ce qui a changé.',
  de: 'Prüfe jeden Montag um 9:00 das EP-Register für EP1234567 und sag mir, was sich geändert hat.',
  ru: 'Каждый понедельник в 9:00 проверяй Реестр EP для EP1234567 и сообщай мне, что изменилось.',
  pt: 'Toda segunda-feira às 9:00, consulte o Registro EP do EP1234567 e me diga o que mudou.',
} as const
