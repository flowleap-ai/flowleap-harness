/**
 * `flowleapBudget` namespace dictionaries: the Budget this month panel and the Budget used card. English is the
 * key-set source of truth.
 */

/** Dictionary namespace owned by this plugin. */
export const NS = 'flowleapBudget'

/** English dictionary (the key-set source of truth). */
export const en = {
  'time.locale': 'en-US',
  'widget': 'Budget this month',
  'metric': 'Budget used',
  'loading': 'Reading the budget…',
  'unknown': 'Unknown',
  'used': '{used} used',
  'limit': 'Budget {limit}',
  'noLimit': 'The firm sets no monthly budget for you.',
  'month': '{month}, UTC',
  'metric.caption': '{used} of {limit} this month',
  'metric.noLimit': '{used} this month, no budget set',
  'reason.not_configured': 'No model gateway is connected to this app, so the spend is not known.',
  'reason.no_key': 'The key for the model gateway is not set, so the spend is not known.',
  'reason.refused': 'The model gateway refused the request, so the spend is not known.',
  'reason.unreachable': 'The model gateway did not answer, so the spend is not known.',
  'reason.invalid_answer': 'The model gateway sent an answer that this app cannot read, so the spend is not known.',
} as const

/** Key domain of the namespace. */
export type FlowleapBudgetKey = keyof typeof en

/** Simplified Chinese dictionary, checked against the English keys. */
export const zh = {
  'time.locale': 'zh-CN',
  'widget': '本月预算',
  'metric': '已用预算',
  'loading': '正在读取预算…',
  'unknown': '未知',
  'used': '已用 {used}',
  'limit': '预算 {limit}',
  'noLimit': '事务所没有为您设置月度预算。',
  'month': '{month}，UTC',
  'metric.caption': '本月已用 {used}，共 {limit}',
  'metric.noLimit': '本月已用 {used}，未设置预算',
  'reason.not_configured': '此应用未连接模型网关，因此无法知道支出。',
  'reason.no_key': '未设置模型网关的密钥，因此无法知道支出。',
  'reason.refused': '模型网关拒绝了请求，因此无法知道支出。',
  'reason.unreachable': '模型网关没有应答，因此无法知道支出。',
  'reason.invalid_answer': '模型网关发送了此应用无法读取的应答，因此无法知道支出。',
} satisfies Record<FlowleapBudgetKey, string>

/** Japanese dictionary, checked against the English keys. */
export const ja = {
  'time.locale': 'ja-JP',
  'widget': '今月の予算',
  'metric': '予算の使用率',
  'loading': '予算を読み込んでいます…',
  'unknown': '不明',
  'used': '{used} 使用',
  'limit': '予算 {limit}',
  'noLimit': '事務所はあなたの月間予算を設定していません。',
  'month': '{month}、UTC',
  'metric.caption': '今月 {limit} のうち {used}',
  'metric.noLimit': '今月 {used}、予算の設定なし',
  'reason.not_configured': 'このアプリにはモデルゲートウェイが接続されていないため、支出は不明です。',
  'reason.no_key': 'モデルゲートウェイのキーが設定されていないため、支出は不明です。',
  'reason.refused': 'モデルゲートウェイが要求を拒否したため、支出は不明です。',
  'reason.unreachable': 'モデルゲートウェイが応答しなかったため、支出は不明です。',
  'reason.invalid_answer': 'モデルゲートウェイがこのアプリで読み取れない応答を送ったため、支出は不明です。',
} satisfies Record<FlowleapBudgetKey, string>

/** Spanish dictionary, checked against the English keys. */
export const es = {
  'time.locale': 'es-ES',
  'widget': 'Presupuesto de este mes',
  'metric': 'Presupuesto usado',
  'loading': 'Leyendo el presupuesto…',
  'unknown': 'Desconocido',
  'used': '{used} usados',
  'limit': 'Presupuesto {limit}',
  'noLimit': 'El despacho no le asigna un presupuesto mensual.',
  'month': '{month}, UTC',
  'metric.caption': '{used} de {limit} este mes',
  'metric.noLimit': '{used} este mes, sin presupuesto',
  'reason.not_configured': 'Esta aplicación no tiene conectada ninguna pasarela de modelos, por lo que se desconoce el gasto.',
  'reason.no_key': 'La clave de la pasarela de modelos no está configurada, por lo que se desconoce el gasto.',
  'reason.refused': 'La pasarela de modelos rechazó la solicitud, por lo que se desconoce el gasto.',
  'reason.unreachable': 'La pasarela de modelos no respondió, por lo que se desconoce el gasto.',
  'reason.invalid_answer': 'La pasarela de modelos envió una respuesta que esta aplicación no puede leer, por lo que se desconoce el gasto.',
} satisfies Record<FlowleapBudgetKey, string>

/** French dictionary, checked against the English keys. */
export const fr = {
  'time.locale': 'fr-FR',
  'widget': 'Budget de ce mois',
  'metric': 'Budget utilisé',
  'loading': 'Lecture du budget…',
  'unknown': 'Inconnu',
  'used': '{used} utilisés',
  'limit': 'Budget {limit}',
  'noLimit': 'Le cabinet ne vous fixe pas de budget mensuel.',
  'month': '{month}, UTC',
  'metric.caption': '{used} sur {limit} ce mois-ci',
  'metric.noLimit': '{used} ce mois-ci, aucun budget fixé',
  'reason.not_configured': "Aucune passerelle de modèles n'est connectée à cette application : la dépense est inconnue.",
  'reason.no_key': "La clé de la passerelle de modèles n'est pas définie : la dépense est inconnue.",
  'reason.refused': 'La passerelle de modèles a refusé la demande : la dépense est inconnue.',
  'reason.unreachable': "La passerelle de modèles n'a pas répondu : la dépense est inconnue.",
  'reason.invalid_answer': 'La passerelle de modèles a envoyé une réponse que cette application ne peut pas lire : la dépense est inconnue.',
} satisfies Record<FlowleapBudgetKey, string>

/** German dictionary, checked against the English keys. */
export const de = {
  'time.locale': 'de-DE',
  'widget': 'Budget in diesem Monat',
  'metric': 'Budget verbraucht',
  'loading': 'Budget wird gelesen…',
  'unknown': 'Unbekannt',
  'used': '{used} verbraucht',
  'limit': 'Budget {limit}',
  'noLimit': 'Die Kanzlei legt für Sie kein Monatsbudget fest.',
  'month': '{month}, UTC',
  'metric.caption': '{used} von {limit} in diesem Monat',
  'metric.noLimit': '{used} in diesem Monat, kein Budget festgelegt',
  'reason.not_configured': 'Mit dieser App ist kein Modell-Gateway verbunden, daher sind die Kosten unbekannt.',
  'reason.no_key': 'Der Schlüssel für das Modell-Gateway ist nicht gesetzt, daher sind die Kosten unbekannt.',
  'reason.refused': 'Das Modell-Gateway hat die Anfrage abgelehnt, daher sind die Kosten unbekannt.',
  'reason.unreachable': 'Das Modell-Gateway hat nicht geantwortet, daher sind die Kosten unbekannt.',
  'reason.invalid_answer': 'Das Modell-Gateway hat eine Antwort gesendet, die diese App nicht lesen kann, daher sind die Kosten unbekannt.',
} satisfies Record<FlowleapBudgetKey, string>

/** Russian dictionary, checked against the English keys. */
export const ru = {
  'time.locale': 'ru-RU',
  'widget': 'Бюджет в этом месяце',
  'metric': 'Использовано бюджета',
  'loading': 'Чтение бюджета…',
  'unknown': 'Неизвестно',
  'used': 'Использовано {used}',
  'limit': 'Бюджет {limit}',
  'noLimit': 'Фирма не задаёт вам месячный бюджет.',
  'month': '{month}, UTC',
  'metric.caption': '{used} из {limit} в этом месяце',
  'metric.noLimit': '{used} в этом месяце, бюджет не задан',
  'reason.not_configured': 'К этому приложению не подключён шлюз моделей, поэтому расходы неизвестны.',
  'reason.no_key': 'Ключ шлюза моделей не задан, поэтому расходы неизвестны.',
  'reason.refused': 'Шлюз моделей отклонил запрос, поэтому расходы неизвестны.',
  'reason.unreachable': 'Шлюз моделей не ответил, поэтому расходы неизвестны.',
  'reason.invalid_answer': 'Шлюз моделей прислал ответ, который это приложение не может прочитать, поэтому расходы неизвестны.',
} satisfies Record<FlowleapBudgetKey, string>

/** Portuguese dictionary, checked against the English keys. */
export const pt = {
  'time.locale': 'pt-BR',
  'widget': 'Orçamento deste mês',
  'metric': 'Orçamento usado',
  'loading': 'Lendo o orçamento…',
  'unknown': 'Desconhecido',
  'used': '{used} usados',
  'limit': 'Orçamento {limit}',
  'noLimit': 'O escritório não define um orçamento mensal para você.',
  'month': '{month}, UTC',
  'metric.caption': '{used} de {limit} este mês',
  'metric.noLimit': '{used} este mês, sem orçamento definido',
  'reason.not_configured': 'Nenhum gateway de modelos está conectado a este aplicativo, então o gasto é desconhecido.',
  'reason.no_key': 'A chave do gateway de modelos não está definida, então o gasto é desconhecido.',
  'reason.refused': 'O gateway de modelos recusou a solicitação, então o gasto é desconhecido.',
  'reason.unreachable': 'O gateway de modelos não respondeu, então o gasto é desconhecido.',
  'reason.invalid_answer': 'O gateway de modelos enviou uma resposta que este aplicativo não consegue ler, então o gasto é desconhecido.',
} satisfies Record<FlowleapBudgetKey, string>
