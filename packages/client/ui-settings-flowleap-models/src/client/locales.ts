/**
 * `settings.flowleapModels` namespace dictionaries: the Test and Connect OpenRouter controls on the Models page
 * cards. English is the key-set source of truth.
 */

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.flowleapModels'

/** English dictionary (the key-set source of truth). */
export const en = {
  'test': 'Test',
  'testing': 'Testing…',
  'connect': 'Connect OpenRouter',
  'connect.hint': 'Opens OpenRouter in your browser. Sign in there and approve. The app then gets a key of its own, with no copy and paste.',
  'connect.waiting': 'Waiting for OpenRouter in your browser…',
  'connect.open': 'Open the OpenRouter page again',
  'cancel': 'Cancel',
  'ok': 'The key works.',
  'connected': 'OpenRouter is connected.',
  'adopted': 'New chats use {model}.',
  'cancelled': 'The connection was cancelled.',
  'failure.no_key': 'No key is saved for this provider. Enter the key above and save it first.',
  'failure.refused': 'The provider refused the key (HTTP {status}). Check the key and save it again.',
  'failure.unreachable': 'The provider did not answer. Check the internet connection and try again.',
  'failure.provider_error': 'The provider answered with an error (HTTP {status}). Try again later.',
  'failure.denied': 'OpenRouter was not connected because the request was not approved.',
  'failure.exchange_refused': 'OpenRouter did not give a key. Try again.',
  'failure.store_refused': 'This app cannot save model keys. Ask your administrator.',
  'failure.timeout': 'OpenRouter was not connected in time. Try again.',
  'failure.not_started': 'The connection was replaced by a newer one.',
  'failure.call': 'The app could not do this: {message}',
} as const

/** Key domain of the namespace. */
export type FlowleapModelsKey = keyof typeof en

/** Simplified Chinese dictionary, checked against the English keys. */
export const zh: Record<FlowleapModelsKey, string> = {
  'test': '测试',
  'testing': '正在测试…',
  'connect': '连接 OpenRouter',
  'connect.hint': '在浏览器中打开 OpenRouter。在那里登录并批准。应用随后会获得自己的密钥，无需复制粘贴。',
  'connect.waiting': '正在等待浏览器中的 OpenRouter…',
  'connect.open': '再次打开 OpenRouter 页面',
  'cancel': '取消',
  'ok': '密钥可用。',
  'connected': 'OpenRouter 已连接。',
  'adopted': '新对话使用 {model}。',
  'cancelled': '连接已取消。',
  'failure.no_key': '此提供商没有已保存的密钥。请先在上方输入并保存密钥。',
  'failure.refused': '提供商拒绝了该密钥（HTTP {status}）。请检查密钥并重新保存。',
  'failure.unreachable': '提供商没有响应。请检查网络连接后重试。',
  'failure.provider_error': '提供商返回了错误（HTTP {status}）。请稍后重试。',
  'failure.denied': 'OpenRouter 未连接，因为请求未获批准。',
  'failure.exchange_refused': 'OpenRouter 没有提供密钥。请重试。',
  'failure.store_refused': '此应用无法保存模型密钥。请联系管理员。',
  'failure.timeout': 'OpenRouter 未能及时连接。请重试。',
  'failure.not_started': '此连接已被新的连接取代。',
  'failure.call': '应用无法完成此操作：{message}',
}

/** Japanese dictionary, checked against the English keys. */
export const ja: Record<FlowleapModelsKey, string> = {
  'test': 'テスト',
  'testing': 'テスト中…',
  'connect': 'OpenRouter に接続',
  'connect.hint': 'ブラウザーで OpenRouter を開きます。そこでサインインして承認してください。アプリはコピーや貼り付けなしで独自のキーを受け取ります。',
  'connect.waiting': 'ブラウザーで OpenRouter を待っています…',
  'connect.open': 'OpenRouter のページをもう一度開く',
  'cancel': 'キャンセル',
  'ok': 'キーは有効です。',
  'connected': 'OpenRouter に接続しました。',
  'adopted': '新しいチャットは {model} を使用します。',
  'cancelled': '接続はキャンセルされました。',
  'failure.no_key': 'このプロバイダーのキーは保存されていません。先に上でキーを入力して保存してください。',
  'failure.refused': 'プロバイダーがキーを拒否しました（HTTP {status}）。キーを確認して保存し直してください。',
  'failure.unreachable': 'プロバイダーが応答しませんでした。インターネット接続を確認して再試行してください。',
  'failure.provider_error': 'プロバイダーがエラーを返しました（HTTP {status}）。後で再試行してください。',
  'failure.denied': 'リクエストが承認されなかったため、OpenRouter に接続されませんでした。',
  'failure.exchange_refused': 'OpenRouter がキーを返しませんでした。再試行してください。',
  'failure.store_refused': 'このアプリはモデルのキーを保存できません。管理者に問い合わせてください。',
  'failure.timeout': '時間内に OpenRouter に接続されませんでした。再試行してください。',
  'failure.not_started': 'この接続は新しい接続に置き換えられました。',
  'failure.call': 'アプリはこの操作を実行できませんでした: {message}',
}

/** Spanish dictionary, checked against the English keys. */
export const es: Record<FlowleapModelsKey, string> = {
  'test': 'Probar',
  'testing': 'Probando…',
  'connect': 'Conectar OpenRouter',
  'connect.hint': 'Abre OpenRouter en el navegador. Inicie sesión allí y apruebe. La aplicación obtiene entonces su propia clave, sin copiar ni pegar.',
  'connect.waiting': 'Esperando a OpenRouter en el navegador…',
  'connect.open': 'Abrir de nuevo la página de OpenRouter',
  'cancel': 'Cancelar',
  'ok': 'La clave funciona.',
  'connected': 'OpenRouter está conectado.',
  'adopted': 'Los chats nuevos usan {model}.',
  'cancelled': 'La conexión se canceló.',
  'failure.no_key': 'No hay ninguna clave guardada para este proveedor. Introduzca la clave arriba y guárdela primero.',
  'failure.refused': 'El proveedor rechazó la clave (HTTP {status}). Compruebe la clave y guárdela de nuevo.',
  'failure.unreachable': 'El proveedor no respondió. Compruebe la conexión a internet e inténtelo de nuevo.',
  'failure.provider_error': 'El proveedor respondió con un error (HTTP {status}). Inténtelo más tarde.',
  'failure.denied': 'OpenRouter no se conectó porque la solicitud no se aprobó.',
  'failure.exchange_refused': 'OpenRouter no entregó una clave. Inténtelo de nuevo.',
  'failure.store_refused': 'Esta aplicación no puede guardar claves de modelos. Consulte al administrador.',
  'failure.timeout': 'OpenRouter no se conectó a tiempo. Inténtelo de nuevo.',
  'failure.not_started': 'Una conexión más reciente sustituyó a esta.',
  'failure.call': 'La aplicación no pudo hacerlo: {message}',
}

/** French dictionary, checked against the English keys. */
export const fr: Record<FlowleapModelsKey, string> = {
  'test': 'Tester',
  'testing': 'Test en cours…',
  'connect': 'Connecter OpenRouter',
  'connect.hint': 'Ouvre OpenRouter dans le navigateur. Connectez-vous et approuvez. L’application obtient alors sa propre clé, sans copier-coller.',
  'connect.waiting': 'En attente d’OpenRouter dans le navigateur…',
  'connect.open': 'Rouvrir la page OpenRouter',
  'cancel': 'Annuler',
  'ok': 'La clé fonctionne.',
  'connected': 'OpenRouter est connecté.',
  'adopted': 'Les nouvelles discussions utilisent {model}.',
  'cancelled': 'La connexion a été annulée.',
  'failure.no_key': 'Aucune clé n’est enregistrée pour ce fournisseur. Saisissez la clé ci-dessus et enregistrez-la d’abord.',
  'failure.refused': 'Le fournisseur a refusé la clé (HTTP {status}). Vérifiez la clé et enregistrez-la à nouveau.',
  'failure.unreachable': 'Le fournisseur n’a pas répondu. Vérifiez la connexion Internet et réessayez.',
  'failure.provider_error': 'Le fournisseur a répondu par une erreur (HTTP {status}). Réessayez plus tard.',
  'failure.denied': 'OpenRouter n’est pas connecté, car la demande n’a pas été approuvée.',
  'failure.exchange_refused': 'OpenRouter n’a pas fourni de clé. Réessayez.',
  'failure.store_refused': 'Cette application ne peut pas enregistrer de clés de modèle. Contactez l’administrateur.',
  'failure.timeout': 'OpenRouter ne s’est pas connecté à temps. Réessayez.',
  'failure.not_started': 'Une connexion plus récente a remplacé celle-ci.',
  'failure.call': 'L’application n’a pas pu le faire : {message}',
}

/** German dictionary, checked against the English keys. */
export const de: Record<FlowleapModelsKey, string> = {
  'test': 'Testen',
  'testing': 'Test läuft…',
  'connect': 'OpenRouter verbinden',
  'connect.hint': 'Öffnet OpenRouter im Browser. Melden Sie sich dort an und stimmen Sie zu. Die App erhält dann einen eigenen Schlüssel, ohne Kopieren und Einfügen.',
  'connect.waiting': 'Warten auf OpenRouter im Browser…',
  'connect.open': 'OpenRouter-Seite erneut öffnen',
  'cancel': 'Abbrechen',
  'ok': 'Der Schlüssel funktioniert.',
  'connected': 'OpenRouter ist verbunden.',
  'adopted': 'Neue Chats verwenden {model}.',
  'cancelled': 'Die Verbindung wurde abgebrochen.',
  'failure.no_key': 'Für diesen Anbieter ist kein Schlüssel gespeichert. Geben Sie den Schlüssel oben ein und speichern Sie ihn zuerst.',
  'failure.refused': 'Der Anbieter hat den Schlüssel abgelehnt (HTTP {status}). Prüfen Sie den Schlüssel und speichern Sie ihn erneut.',
  'failure.unreachable': 'Der Anbieter hat nicht geantwortet. Prüfen Sie die Internetverbindung und versuchen Sie es erneut.',
  'failure.provider_error': 'Der Anbieter hat mit einem Fehler geantwortet (HTTP {status}). Versuchen Sie es später erneut.',
  'failure.denied': 'OpenRouter wurde nicht verbunden, weil die Anfrage nicht bestätigt wurde.',
  'failure.exchange_refused': 'OpenRouter hat keinen Schlüssel geliefert. Versuchen Sie es erneut.',
  'failure.store_refused': 'Diese App kann keine Modellschlüssel speichern. Wenden Sie sich an die Administration.',
  'failure.timeout': 'OpenRouter wurde nicht rechtzeitig verbunden. Versuchen Sie es erneut.',
  'failure.not_started': 'Eine neuere Verbindung hat diese ersetzt.',
  'failure.call': 'Die App konnte dies nicht ausführen: {message}',
}

/** Russian dictionary, checked against the English keys. */
export const ru: Record<FlowleapModelsKey, string> = {
  'test': 'Проверить',
  'testing': 'Проверка…',
  'connect': 'Подключить OpenRouter',
  'connect.hint': 'Открывает OpenRouter в браузере. Войдите там и подтвердите. Приложение получит собственный ключ без копирования и вставки.',
  'connect.waiting': 'Ожидание OpenRouter в браузере…',
  'connect.open': 'Снова открыть страницу OpenRouter',
  'cancel': 'Отмена',
  'ok': 'Ключ работает.',
  'connected': 'OpenRouter подключён.',
  'adopted': 'Новые чаты используют {model}.',
  'cancelled': 'Подключение отменено.',
  'failure.no_key': 'Для этого поставщика нет сохранённого ключа. Сначала введите ключ выше и сохраните его.',
  'failure.refused': 'Поставщик отклонил ключ (HTTP {status}). Проверьте ключ и сохраните его снова.',
  'failure.unreachable': 'Поставщик не ответил. Проверьте подключение к интернету и повторите попытку.',
  'failure.provider_error': 'Поставщик ответил ошибкой (HTTP {status}). Повторите попытку позже.',
  'failure.denied': 'OpenRouter не подключён, так как запрос не был подтверждён.',
  'failure.exchange_refused': 'OpenRouter не выдал ключ. Повторите попытку.',
  'failure.store_refused': 'Это приложение не может сохранять ключи моделей. Обратитесь к администратору.',
  'failure.timeout': 'OpenRouter не подключился вовремя. Повторите попытку.',
  'failure.not_started': 'Это подключение заменено более новым.',
  'failure.call': 'Приложению не удалось выполнить действие: {message}',
}

/** Portuguese dictionary, checked against the English keys. */
export const pt: Record<FlowleapModelsKey, string> = {
  'test': 'Testar',
  'testing': 'Testando…',
  'connect': 'Conectar OpenRouter',
  'connect.hint': 'Abre o OpenRouter no navegador. Entre lá e aprove. O aplicativo então recebe uma chave própria, sem copiar e colar.',
  'connect.waiting': 'Aguardando o OpenRouter no navegador…',
  'connect.open': 'Abrir a página do OpenRouter novamente',
  'cancel': 'Cancelar',
  'ok': 'A chave funciona.',
  'connected': 'O OpenRouter está conectado.',
  'adopted': 'Os novos chats usam {model}.',
  'cancelled': 'A conexão foi cancelada.',
  'failure.no_key': 'Não há chave salva para este provedor. Digite a chave acima e salve-a primeiro.',
  'failure.refused': 'O provedor recusou a chave (HTTP {status}). Verifique a chave e salve-a novamente.',
  'failure.unreachable': 'O provedor não respondeu. Verifique a conexão com a internet e tente novamente.',
  'failure.provider_error': 'O provedor respondeu com um erro (HTTP {status}). Tente novamente mais tarde.',
  'failure.denied': 'O OpenRouter não foi conectado porque a solicitação não foi aprovada.',
  'failure.exchange_refused': 'O OpenRouter não forneceu uma chave. Tente novamente.',
  'failure.store_refused': 'Este aplicativo não pode salvar chaves de modelo. Fale com o administrador.',
  'failure.timeout': 'O OpenRouter não foi conectado a tempo. Tente novamente.',
  'failure.not_started': 'Uma conexão mais recente substituiu esta.',
  'failure.call': 'O aplicativo não conseguiu fazer isso: {message}',
}
