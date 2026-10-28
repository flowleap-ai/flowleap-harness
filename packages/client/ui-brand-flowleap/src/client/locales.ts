/**
 * Product copy this brand replaces in upstream dictionaries: every string the
 * shipped `flowleap-web` rows still render that names the harness or its
 * vendor, translated for each shipped UI language. Each entry is layered over
 * the owning namespace through `ctx.locale.override()` for its language.
 * Namespaces and keys are the owning packages' literals; a renamed key
 * upstream makes the override inert for that key, never wrong.
 * @module
 */

import { brandText, type BrandLocale, type BrandRecord } from '../brand.ts'

/** One namespace's replaced keys. */
export interface CopyOverride {
  /** Dictionary namespace the owning plugin registers. */
  readonly ns: string
  /** Replaced keys and their text. */
  readonly dict: Readonly<Record<string, string>>
}

/** The replaced texts of one language, before they are placed in their namespaces. */
interface BrandCopyText {
  readonly welcomeTitle: string
  readonly welcomeBody: string
  readonly onboardingTitle: string
  readonly onboardingDescription: string
  readonly providerAccount: string
  readonly sessionInUse: string
  readonly restartNotice: string
  readonly restartReasonPackageMoved: string
  readonly restartReasonHostModule: string
  readonly restartReasonModuleComparison: string
  readonly installGuideSafety: string
  readonly installUpgradeNotice: string
  readonly installProblemShipped: string
  readonly sourceTargetSpec: string
  readonly sourceTargetVersion: string
  readonly installDoneRestart: string
  readonly reasonIncompatibleVersion: string
  readonly reasonIncompatibleVersionUnnamed: string
  readonly reasonIncompatibleInstall: string
  readonly reasonIncompatibleInstalled: string
  readonly reasonUnsupportedPlatform: string
  readonly officeUnavailable: string
  readonly running: string
  readonly runningFor: string
  readonly interrupted: string
  readonly accountSignedOut: string
  readonly accountSignInRequired: string
  readonly presetSectionIntro: string
  readonly presetCreatorDescription: string
  readonly presetCreatePlugin: string
}

/** The copy of each shipped language for one product name. */
const COPY: Readonly<Record<BrandLocale, (product: string) => BrandCopyText>> = {
  en: product => ({
    welcomeTitle: 'Preview notice',
    welcomeBody: `${product} is in preview. It runs the Patent Agent in your browser on your own model keys and your own patent-office keys; your files stay on the computer that runs it.\n\nResults are research assistance, not legal advice. Check every citation against the office record before you rely on it, and send feedback to FlowLeap so the next release improves.`,
    onboardingTitle: 'Add a model key to get started',
    onboardingDescription: 'Add an Anthropic, OpenRouter or Mistral key, or sign in with the provider that gives you one.',
    providerAccount: 'Account',
    sessionInUse: `This session is already in use, possibly by another running ${product} instance. Quit the other instance and try again.`,
    restartNotice: `Restart ${product} to apply the change. {reason}`,
    restartReasonPackageMoved: `An installed package now resolves to another directory, or the change replaces a package the ${product} installation provides. Uninstall a package before installing it from another location.`,
    restartReasonHostModule: `The change reaches modules ${product} itself loaded.`,
    restartReasonModuleComparison: `${product} could not compare the loaded plugins with their files.`,
    installGuideSafety: `Install only plugins you trust: they run with your permissions and can damage ${product} or leak your data.`,
    installUpgradeNotice: `On-demand Official plugins offer Update when their version differs from ${product}. To update other plugins, uninstall and reinstall them.`,
    installProblemShipped: `This plugin ships with ${product}; upgrading ${product} updates it`,
    sourceTargetSpec: `Source for this ${product}`,
    sourceTargetVersion: `Version for this ${product}`,
    installDoneRestart: `Installed; restart ${product} to load it. {reason}`,
    reasonIncompatibleVersion: `{plugin} is incompatible with ${product} {runtime} (requires {requirements}); running it may cause crashes or data loss.`,
    reasonIncompatibleVersionUnnamed: `This plugin is incompatible with the running ${product} version; running it may cause crashes or data loss.`,
    reasonIncompatibleInstall: `Install a plugin version compatible with this ${product}.`,
    reasonIncompatibleInstalled: `Uninstall it and install a version compatible with this ${product}.`,
    reasonUnsupportedPlatform: `This plugin does not support the operating system running ${product}.`,
    officeUnavailable: `Office previews are unavailable. Enable the document preview service on the computer running ${product}.`,
    running: 'Working',
    runningFor: 'Working for {duration} ···',
    interrupted: `The ${product} process exited before this turn finished (for example, it was killed, crashed, or timed out while shutting down), so the turn was closed when ${product} restarted. Unfinished tool calls have unknown outcomes.`,
    accountSignedOut: 'Stopped because you signed out of the model provider account.',
    accountSignInRequired: 'Sign in to the model provider and ensure the request destination supports account authentication.',
    presetSectionIntro: `Choose the agent’s tools and how it works. Use Standard mode for everyday tasks, or Creator mode to add capabilities to ${product}.`,
    presetCreatorDescription: `Customize ${product} through conversation. Let the agent write plugins that add features or UI, or combine tools and prompts to create your own mode.`,
    presetCreatePlugin: `Enter Creator mode and make your own ${product} plugin`,
  }),
  zh: product => ({
    welcomeTitle: '预览版说明',
    welcomeBody: `${product} 目前为预览版。它在你的浏览器中运行专利智能体，使用你自己的模型密钥和专利局密钥；你的文件始终保留在运行它的计算机上。\n\n结果仅为研究辅助，不构成法律意见。依赖任何引用前，请对照专利局的官方记录逐一核实，并向 FlowLeap 反馈意见，以便改进下一个版本。`,
    onboardingTitle: '添加模型密钥以开始使用',
    onboardingDescription: '添加 Anthropic、OpenRouter 或 Mistral 密钥，或登录提供密钥的服务商。',
    providerAccount: '账号',
    sessionInUse: `当前会话已被占用，可能是另一个正在运行的 ${product} 实例导致的。请退出该实例后重试。`,
    restartNotice: `请重启 ${product} 使更改生效。{reason}`,
    restartReasonPackageMoved: `已安装的插件包解析到了另一个目录，或者更改替换了 ${product} 安装自带的包。从其他位置安装前请先卸载。`,
    restartReasonHostModule: `此更改涉及 ${product} 自身已加载的模块。`,
    restartReasonModuleComparison: `${product} 无法将已加载的插件与其文件进行比较。`,
    installGuideSafety: `请确认插件来源可信。插件以你的权限运行，来源不明的插件可能损坏 ${product}，或泄露你的数据。`,
    installUpgradeNotice: `按需安装的官方插件版本与 ${product} 不同时会提供“更新”。要更新其他插件，请卸载后重新安装。`,
    installProblemShipped: `此插件随 ${product} 一起提供；升级 ${product} 即可更新它`,
    sourceTargetSpec: `适用于此 ${product} 的来源`,
    sourceTargetVersion: `适用于此 ${product} 的版本`,
    installDoneRestart: `已安装；请重启 ${product} 以加载。{reason}`,
    reasonIncompatibleVersion: `{plugin} 与 ${product} {runtime} 不兼容（需要 {requirements}）；运行它可能导致崩溃或数据丢失。`,
    reasonIncompatibleVersionUnnamed: `此插件与正在运行的 ${product} 版本不兼容；运行它可能导致崩溃或数据丢失。`,
    reasonIncompatibleInstall: `请安装与此 ${product} 兼容的插件版本。`,
    reasonIncompatibleInstalled: `请卸载它，并安装与此 ${product} 兼容的版本。`,
    reasonUnsupportedPlatform: `此插件不支持运行 ${product} 的主机操作系统`,
    officeUnavailable: `Office 预览不可用。请在运行 ${product} 的计算机上启用文档预览服务。`,
    running: '处理中',
    runningFor: '处理中，用时 {duration} ···',
    interrupted: `${product} 进程在本轮完成前退出（例如被强制结束、崩溃或关闭超时），因此 ${product} 重新启动时本轮已关闭。未完成的工具调用结果未知。`,
    accountSignedOut: '已停止，因为你已退出模型服务商账号。',
    accountSignInRequired: '请登录模型服务商，并确认请求目标支持账号认证。',
    presetSectionIntro: `选择 Agent 的工具和工作方式。日常任务用「标准模式」，扩展 ${product} 的能力用「创造模式」。`,
    presetCreatorDescription: `用对话定制 ${product}：让 Agent 编写插件，添加新功能或界面；也能组合工具和提示词，创建自己的模式。`,
    presetCreatePlugin: `进入创造模式，制作属于你的 ${product} 插件`,
  }),
  ja: product => ({
    welcomeTitle: 'プレビューに関するお知らせ',
    welcomeBody: `${product} はプレビュー版です。ご自身のモデルキーと特許庁のキーを使い、ブラウザーで特許エージェントを実行します。ファイルは実行しているコンピューターから外に出ません。\n\n結果は調査の補助であり、法的助言ではありません。引用を利用する前に、必ず特許庁の公式記録と照合してください。次のリリースの改善のため、FlowLeap へのフィードバックをお寄せください。`,
    onboardingTitle: 'モデルキーを追加して始める',
    onboardingDescription: 'Anthropic、OpenRouter、Mistral のキーを追加するか、キーを提供するプロバイダーにサインインしてください。',
    providerAccount: 'アカウント',
    sessionInUse: `このセッションは既に使用中です。別の ${product} インスタンスが実行中の可能性があります。そのインスタンスを終了してから再試行してください。`,
    restartNotice: `変更を適用するには ${product} を再起動してください。{reason}`,
    restartReasonPackageMoved: `インストール済みパッケージの解決先が別のディレクトリになったか、変更によって ${product} のインストールが提供するパッケージが置き換えられます。別の場所からインストールする前に、パッケージをアンインストールしてください。`,
    restartReasonHostModule: `この変更は ${product} 自体が読み込んだモジュールに及びます。`,
    restartReasonModuleComparison: `${product} は読み込まれたプラグインとそのファイルを比較できませんでした。`,
    installGuideSafety: `信頼できるプラグインのみをインストールしてください。プラグインはあなたの権限で動作し、${product} を破損させたり、データを漏えいさせたりする可能性があります。`,
    installUpgradeNotice: `オンデマンドの公式プラグインは、バージョンが ${product} と異なる場合に「更新」を表示します。その他のプラグインを更新するには、アンインストールしてから再インストールしてください。`,
    installProblemShipped: `このプラグインは ${product} に同梱されています。${product} をアップグレードすると更新されます`,
    sourceTargetSpec: `この ${product} 用のソース`,
    sourceTargetVersion: `この ${product} 用のバージョン`,
    installDoneRestart: `インストールしました。読み込むには ${product} を再起動してください。{reason}`,
    reasonIncompatibleVersion: `{plugin} は ${product} {runtime} と互換性がありません（{requirements} が必要）。実行するとクラッシュやデータ損失が起きる可能性があります。`,
    reasonIncompatibleVersionUnnamed: `このプラグインは実行中の ${product} のバージョンと互換性がありません。実行するとクラッシュやデータ損失が起きる可能性があります。`,
    reasonIncompatibleInstall: `この ${product} と互換性のあるプラグインのバージョンをインストールしてください。`,
    reasonIncompatibleInstalled: `アンインストールして、この ${product} と互換性のあるバージョンをインストールしてください。`,
    reasonUnsupportedPlatform: `このプラグインは${product}を実行しているホストOSに対応していません。`,
    officeUnavailable: `Office のプレビューは利用できません。${product} を実行しているコンピューターでドキュメントプレビューサービスを有効にしてください。`,
    running: '処理中',
    runningFor: '処理中 {duration} ···',
    interrupted: `このターンが完了する前に ${product} のプロセスが終了したため（強制終了、クラッシュ、シャットダウン中のタイムアウトなど）、${product} の再起動時にターンを閉じました。未完了のツール呼び出しの結果は不明です。`,
    accountSignedOut: 'モデルプロバイダーのアカウントからサインアウトしたため、停止しました。',
    accountSignInRequired: 'モデルプロバイダーにサインインし、リクエスト先がアカウント認証に対応していることを確認してください。',
    presetSectionIntro: `エージェントのツールと動作を選択します。日々のタスクには標準モードを、${product} に機能を追加するにはクリエイターモードを使用してください。`,
    presetCreatorDescription: `会話を通じて ${product} をカスタマイズします。機能や UI を追加するプラグインをエージェントに書かせたり、ツールとプロンプトを組み合わせて独自のモードを作成したりできます。`,
    presetCreatePlugin: `クリエイターモードに入り、独自の ${product} プラグインを作成`,
  }),
  es: product => ({
    welcomeTitle: 'Aviso de versión preliminar',
    welcomeBody: `${product} está en versión preliminar. Ejecuta el agente de patentes en su navegador con sus propias claves de modelo y sus propias claves de las oficinas de patentes; sus archivos permanecen en el equipo que lo ejecuta.\n\nLos resultados son una ayuda para la investigación, no asesoramiento jurídico. Compruebe cada cita con el registro oficial de la oficina antes de confiar en ella y envíe sus comentarios a FlowLeap para mejorar la próxima versión.`,
    onboardingTitle: 'Agregue una clave de modelo para comenzar',
    onboardingDescription: 'Agregue una clave de Anthropic, OpenRouter o Mistral, o inicie sesión con el proveedor que se la facilita.',
    providerAccount: 'Cuenta',
    sessionInUse: `Esta sesión ya está en uso, posiblemente por otra instancia de ${product} en ejecución. Salga de la otra instancia y vuelva a intentarlo.`,
    restartNotice: `Reinicie ${product} para aplicar el cambio. {reason}`,
    restartReasonPackageMoved: `Un paquete instalado ahora se resuelve en otro directorio o el cambio reemplaza un paquete que proporciona la instalación de ${product}. Desinstale un paquete antes de instalarlo desde otra ubicación.`,
    restartReasonHostModule: `El cambio afecta a módulos que el propio ${product} cargó.`,
    restartReasonModuleComparison: `${product} no pudo comparar los complementos cargados con sus archivos.`,
    installGuideSafety: `Instale solo complementos en los que confíe: se ejecutan con sus permisos y pueden dañar ${product} o filtrar sus datos.`,
    installUpgradeNotice: `Los complementos oficiales bajo demanda ofrecen Actualizar cuando su versión difiere de la de ${product}. Para actualizar otros complementos, desinstálelos y vuelva a instalarlos.`,
    installProblemShipped: `Este complemento se incluye con ${product}; al actualizar ${product} se actualiza`,
    sourceTargetSpec: `Origen para este ${product}`,
    sourceTargetVersion: `Versión para este ${product}`,
    installDoneRestart: `Instalado; reinicie ${product} para cargarlo. {reason}`,
    reasonIncompatibleVersion: `{plugin} no es compatible con ${product} {runtime} (requiere {requirements}); ejecutarlo puede provocar bloqueos o pérdida de datos.`,
    reasonIncompatibleVersionUnnamed: `Este complemento no es compatible con la versión de ${product} en ejecución; ejecutarlo puede provocar bloqueos o pérdida de datos.`,
    reasonIncompatibleInstall: `Instale una versión del complemento compatible con este ${product}.`,
    reasonIncompatibleInstalled: `Desinstálelo e instale una versión compatible con este ${product}.`,
    reasonUnsupportedPlatform: `Este complemento no es compatible con el sistema operativo que ejecuta ${product}.`,
    officeUnavailable: `Las vistas previas de Office no están disponibles. Active el servicio de vista previa de documentos en el equipo que ejecuta ${product}.`,
    running: 'Trabajando',
    runningFor: 'Trabajando durante {duration} ···',
    interrupted: `El proceso de ${product} finalizó antes de que terminara este turno (por ejemplo, se forzó su cierre, falló o agotó el tiempo de espera al apagarse), por lo que el turno se cerró cuando ${product} se reinició. Las llamadas a herramientas sin terminar tienen un resultado desconocido.`,
    accountSignedOut: 'Se detuvo porque cerró la sesión de la cuenta del proveedor del modelo.',
    accountSignInRequired: 'Inicie sesión en el proveedor del modelo y asegúrese de que el destino de la solicitud admite la autenticación de cuenta.',
    presetSectionIntro: `Elija las herramientas del agente y cómo funciona. Utilice el modo Estándar para las tareas diarias o el modo Creador para agregar capacidades a ${product}.`,
    presetCreatorDescription: `Personaliza ${product} a través de la conversación. Deje que el agente escriba complementos que agreguen funciones o interfaz de usuario, o combine herramientas e indicaciones para crear su propio modo.`,
    presetCreatePlugin: `Ingrese al modo Creador y cree su propio complemento ${product}`,
  }),
  fr: product => ({
    welcomeTitle: 'Avis de version préliminaire',
    welcomeBody: `${product} est en version préliminaire. Il exécute l'agent brevets dans votre navigateur avec vos propres clés de modèle et vos propres clés d'offices de brevets ; vos fichiers restent sur l'ordinateur qui l'exécute.\n\nLes résultats sont une aide à la recherche, pas un conseil juridique. Vérifiez chaque citation dans le registre officiel de l'office avant de vous y fier, et envoyez vos commentaires à FlowLeap pour améliorer la prochaine version.`,
    onboardingTitle: 'Ajoutez une clé de modèle pour commencer',
    onboardingDescription: 'Ajoutez une clé Anthropic, OpenRouter ou Mistral, ou connectez-vous auprès du fournisseur qui vous en donne une.',
    providerAccount: 'Compte',
    sessionInUse: `Cette session est déjà utilisée, peut-être par une autre instance de ${product} en cours d'exécution. Quittez l'autre instance et réessayez.`,
    restartNotice: `Redémarrez ${product} pour appliquer la modification. {reason}`,
    restartReasonPackageMoved: `Un package installé est désormais résolu dans un autre répertoire, ou la modification remplace un package fourni par l'installation de ${product}. Désinstallez un package avant de l'installer depuis un autre emplacement.`,
    restartReasonHostModule: `La modification touche des modules que ${product} a lui-même chargés.`,
    restartReasonModuleComparison: `${product} n'a pas pu comparer les plugins chargés avec leurs fichiers.`,
    installGuideSafety: `Installez uniquement des plugins de confiance : ils s'exécutent avec vos autorisations et peuvent endommager ${product} ou divulguer vos données.`,
    installUpgradeNotice: `Les plugins officiels à la demande proposent Mettre à jour lorsque leur version diffère de celle de ${product}. Pour mettre à jour les autres plugins, désinstallez-les puis réinstallez-les.`,
    installProblemShipped: `Ce plugin est fourni avec ${product} ; la mise à niveau de ${product} le met à jour`,
    sourceTargetSpec: `Source pour ce ${product}`,
    sourceTargetVersion: `Version pour ce ${product}`,
    installDoneRestart: `Installé ; redémarrez ${product} pour le charger. {reason}`,
    reasonIncompatibleVersion: `{plugin} est incompatible avec ${product} {runtime} (nécessite {requirements}) ; son exécution peut provoquer des plantages ou des pertes de données.`,
    reasonIncompatibleVersionUnnamed: `Ce plugin est incompatible avec la version de ${product} en cours d'exécution ; son exécution peut provoquer des plantages ou des pertes de données.`,
    reasonIncompatibleInstall: `Installez une version du plugin compatible avec ce ${product}.`,
    reasonIncompatibleInstalled: `Désinstallez-le et installez une version compatible avec ce ${product}.`,
    reasonUnsupportedPlatform: `Ce plugin ne prend pas en charge le système d’exploitation sur lequel ${product} s’exécute.`,
    officeUnavailable: `Les aperçus Office ne sont pas disponibles. Activez le service d'aperçu des documents sur l'ordinateur qui exécute ${product}.`,
    running: 'En cours',
    runningFor: 'En cours depuis {duration} ···',
    interrupted: `Le processus ${product} s'est arrêté avant la fin de ce tour (par exemple, il a été tué, a planté ou a dépassé le délai d'arrêt) ; le tour a donc été clôturé au redémarrage de ${product}. Le résultat des appels d'outils inachevés est inconnu.`,
    accountSignedOut: 'Arrêté parce que vous vous êtes déconnecté du compte du fournisseur de modèle.',
    accountSignInRequired: "Connectez-vous au fournisseur de modèle et vérifiez que la destination de la requête prend en charge l'authentification par compte.",
    presetSectionIntro: `Choisissez les outils de l’agent et son fonctionnement. Utilisez le mode Standard pour les tâches quotidiennes ou le mode Créateur pour ajouter des fonctionnalités à ${product}.`,
    presetCreatorDescription: `Personnalisez ${product} via la conversation. Laissez l'agent écrire des plugins qui ajoutent des fonctionnalités ou une interface utilisateur, ou combinez des outils et des invites pour créer votre propre mode.`,
    presetCreatePlugin: `Entrez en mode Créateur et créez votre propre plugin ${product}`,
  }),
  de: product => ({
    welcomeTitle: 'Vorschauhinweis',
    welcomeBody: `${product} ist eine Vorschauversion. Es führt den Patent-Agenten in Ihrem Browser mit Ihren eigenen Modellschlüsseln und Ihren eigenen Schlüsseln der Patentämter aus; Ihre Dateien bleiben auf dem Computer, auf dem es läuft.\n\nDie Ergebnisse unterstützen die Recherche und sind keine Rechtsberatung. Prüfen Sie jedes Zitat anhand des amtlichen Registers, bevor Sie sich darauf verlassen, und senden Sie Feedback an FlowLeap, damit die nächste Version besser wird.`,
    onboardingTitle: 'Fügen Sie einen Modellschlüssel hinzu, um loszulegen',
    onboardingDescription: 'Fügen Sie einen Anthropic-, OpenRouter- oder Mistral-Schlüssel hinzu oder melden Sie sich bei dem Anbieter an, der Ihnen einen Schlüssel gibt.',
    providerAccount: 'Konto',
    sessionInUse: `Diese Sitzung wird bereits verwendet, möglicherweise von einer anderen laufenden ${product}-Instanz. Beenden Sie die andere Instanz und versuchen Sie es erneut.`,
    restartNotice: `Starten Sie ${product} neu, um die Änderung zu übernehmen. {reason}`,
    restartReasonPackageMoved: `Ein installiertes Paket wird nun in ein anderes Verzeichnis aufgelöst, oder die Änderung ersetzt ein Paket, das die ${product}-Installation bereitstellt. Deinstallieren Sie ein Paket, bevor Sie es von einem anderen Ort installieren.`,
    restartReasonHostModule: `Die Änderung betrifft Module, die ${product} selbst geladen hat.`,
    restartReasonModuleComparison: `${product} konnte die geladenen Plugins nicht mit ihren Dateien vergleichen.`,
    installGuideSafety: `Installieren Sie nur Plugins, denen Sie vertrauen: Sie werden mit Ihren Berechtigungen ausgeführt und können ${product} beschädigen oder Ihre Daten preisgeben.`,
    installUpgradeNotice: `Offizielle Plugins auf Abruf bieten „Aktualisieren“ an, wenn ihre Version von ${product} abweicht. Um andere Plugins zu aktualisieren, deinstallieren Sie sie und installieren Sie sie erneut.`,
    installProblemShipped: `Dieses Plugin wird mit ${product} ausgeliefert; ein Upgrade von ${product} aktualisiert es`,
    sourceTargetSpec: `Quelle für dieses ${product}`,
    sourceTargetVersion: `Version für dieses ${product}`,
    installDoneRestart: `Installiert; starten Sie ${product} neu, um es zu laden. {reason}`,
    reasonIncompatibleVersion: `{plugin} ist nicht mit ${product} {runtime} kompatibel (erfordert {requirements}); die Ausführung kann zu Abstürzen oder Datenverlust führen.`,
    reasonIncompatibleVersionUnnamed: `Dieses Plugin ist nicht mit der laufenden ${product}-Version kompatibel; die Ausführung kann zu Abstürzen oder Datenverlust führen.`,
    reasonIncompatibleInstall: `Installieren Sie eine Plugin-Version, die mit diesem ${product} kompatibel ist.`,
    reasonIncompatibleInstalled: `Deinstallieren Sie es und installieren Sie eine Version, die mit diesem ${product} kompatibel ist.`,
    reasonUnsupportedPlatform: `Dieses Plugin unterstützt das Betriebssystem, auf dem ${product} läuft, nicht.`,
    officeUnavailable: `Office-Vorschauen sind nicht verfügbar. Aktivieren Sie den Dokumentvorschaudienst auf dem Computer, auf dem ${product} läuft.`,
    running: 'In Arbeit',
    runningFor: 'In Arbeit seit {duration} ···',
    interrupted: `Der ${product}-Prozess wurde beendet, bevor dieser Durchgang abgeschlossen war (zum Beispiel wurde er beendet, ist abgestürzt oder hat beim Herunterfahren das Zeitlimit überschritten); daher wurde der Durchgang beim Neustart von ${product} geschlossen. Das Ergebnis unvollständiger Werkzeugaufrufe ist unbekannt.`,
    accountSignedOut: 'Angehalten, weil Sie sich vom Konto des Modellanbieters abgemeldet haben.',
    accountSignInRequired: 'Melden Sie sich beim Modellanbieter an und stellen Sie sicher, dass das Anfrageziel die Kontoauthentifizierung unterstützt.',
    presetSectionIntro: `Wählen Sie die Tools des Agenten und deren Funktionsweise aus. Verwenden Sie den Standardmodus für alltägliche Aufgaben oder den Creator-Modus, um ${product} Funktionen hinzuzufügen.`,
    presetCreatorDescription: `Passen Sie ${product} durch Gespräche an. Lassen Sie den Agenten Plugins schreiben, die Funktionen oder Benutzeroberflächen hinzufügen, oder kombinieren Sie Tools und Eingabeaufforderungen, um Ihren eigenen Modus zu erstellen.`,
    presetCreatePlugin: `Wechseln Sie in den Erstellermodus und erstellen Sie Ihr eigenes ${product}-Plugin`,
  }),
  ru: product => ({
    welcomeTitle: 'Предварительная версия',
    welcomeBody: `${product} находится на стадии предварительной версии. Он запускает патентного агента в вашем браузере с вашими собственными ключами моделей и ключами патентных ведомств; ваши файлы остаются на компьютере, на котором он работает.\n\nРезультаты служат вспомогательным материалом для исследования и не являются юридической консультацией. Перед тем как полагаться на ссылку, сверьте её с официальным реестром ведомства и отправьте отзыв в FlowLeap, чтобы улучшить следующую версию.`,
    onboardingTitle: 'Добавьте ключ модели, чтобы начать работу',
    onboardingDescription: 'Добавьте ключ Anthropic, OpenRouter или Mistral либо войдите через поставщика, который его предоставляет.',
    providerAccount: 'Аккаунт',
    sessionInUse: `Этот сеанс уже используется, возможно, другим запущенным экземпляром ${product}. Закройте другой экземпляр и повторите попытку.`,
    restartNotice: `Перезапустите ${product}, чтобы применить изменения. {reason}`,
    restartReasonPackageMoved: `Установленный пакет теперь разрешается в другой каталог, или изменение заменяет пакет, предоставляемый установкой ${product}. Удалите пакет, прежде чем устанавливать его из другого расположения.`,
    restartReasonHostModule: `Изменение затрагивает модули, которые загрузил сам ${product}.`,
    restartReasonModuleComparison: `${product} не удалось сравнить загруженные плагины с их файлами.`,
    installGuideSafety: `Устанавливайте только те плагины, которым доверяете: они работают с вашими правами и могут повредить ${product} или привести к утечке данных.`,
    installUpgradeNotice: `Официальные плагины по запросу предлагают «Обновить», если их версия отличается от версии ${product}. Чтобы обновить другие плагины, удалите и установите их заново.`,
    installProblemShipped: `Этот плагин поставляется вместе с ${product}; обновление ${product} обновляет и его`,
    sourceTargetSpec: `Источник для этого ${product}`,
    sourceTargetVersion: `Версия для этого ${product}`,
    installDoneRestart: `Установлено; перезапустите ${product}, чтобы загрузить плагин. {reason}`,
    reasonIncompatibleVersion: `{plugin} несовместим с ${product} {runtime} (требуется {requirements}); его запуск может привести к сбоям или потере данных.`,
    reasonIncompatibleVersionUnnamed: `Этот плагин несовместим с запущенной версией ${product}; его запуск может привести к сбоям или потере данных.`,
    reasonIncompatibleInstall: `Установите версию плагина, совместимую с этим ${product}.`,
    reasonIncompatibleInstalled: `Удалите его и установите версию, совместимую с этим ${product}.`,
    reasonUnsupportedPlatform: `Этот плагин не поддерживает операционную систему, в которой работает ${product}.`,
    officeUnavailable: `Предпросмотр Office недоступен. Включите службу предпросмотра документов на компьютере, на котором работает ${product}.`,
    running: 'Выполняется',
    runningFor: 'Выполняется {duration} ···',
    interrupted: `Процесс ${product} завершился до окончания этого хода (например, был принудительно остановлен, аварийно завершился или превысил время ожидания при выключении), поэтому ход был закрыт при перезапуске ${product}. Результаты незавершённых вызовов инструментов неизвестны.`,
    accountSignedOut: 'Остановлено, так как вы вышли из аккаунта поставщика модели.',
    accountSignInRequired: 'Войдите в аккаунт поставщика модели и убедитесь, что адресат запроса поддерживает аутентификацию по аккаунту.',
    presetSectionIntro: `Выбирайте инструменты агента и то, как они работают. Используйте стандартный режим для повседневных задач или режим Creator, чтобы расширить возможности ${product}.`,
    presetCreatorDescription: `Настройте ${product} через разговор. Позвольте агенту писать плагины, которые добавляют функции или пользовательский интерфейс, или комбинируйте инструменты и подсказки для создания собственного режима.`,
    presetCreatePlugin: `Войдите в режим Creator и создайте свой собственный плагин ${product}.`,
  }),
  pt: product => ({
    welcomeTitle: 'Aviso de versão de pré-visualização',
    welcomeBody: `${product} está em pré-visualização. Ele executa o agente de patentes no seu navegador com suas próprias chaves de modelo e suas próprias chaves dos escritórios de patentes; seus arquivos permanecem no computador que o executa.\n\nOs resultados são apoio à pesquisa, não aconselhamento jurídico. Verifique cada citação no registro oficial do escritório antes de confiar nela e envie comentários à FlowLeap para melhorar a próxima versão.`,
    onboardingTitle: 'Adicione uma chave de modelo para começar',
    onboardingDescription: 'Adicione uma chave da Anthropic, OpenRouter ou Mistral, ou faça login no provedor que a fornece.',
    providerAccount: 'Conta',
    sessionInUse: `Esta sessão já está em uso, possivelmente por outra instância do ${product} em execução. Saia da outra instância e tente novamente.`,
    restartNotice: `Reinicie o ${product} para aplicar a alteração. {reason}`,
    restartReasonPackageMoved: `Um pacote instalado agora é resolvido para outro diretório ou a alteração substitui um pacote fornecido pela instalação do ${product}. Desinstale um pacote antes de instalá-lo a partir de outro local.`,
    restartReasonHostModule: `A alteração atinge módulos que o próprio ${product} carregou.`,
    restartReasonModuleComparison: `O ${product} não conseguiu comparar os plug-ins carregados com seus arquivos.`,
    installGuideSafety: `Instale apenas plug-ins em que confia: eles são executados com suas permissões e podem danificar o ${product} ou expor seus dados.`,
    installUpgradeNotice: `Os plug-ins oficiais sob demanda oferecem Atualizar quando sua versão difere da do ${product}. Para atualizar outros plug-ins, desinstale-os e instale-os novamente.`,
    installProblemShipped: `Este plug-in é fornecido com o ${product}; atualizar o ${product} também o atualiza`,
    sourceTargetSpec: `Origem para este ${product}`,
    sourceTargetVersion: `Versão para este ${product}`,
    installDoneRestart: `Instalado; reinicie o ${product} para carregá-lo. {reason}`,
    reasonIncompatibleVersion: `{plugin} é incompatível com o ${product} {runtime} (requer {requirements}); executá-lo pode causar falhas ou perda de dados.`,
    reasonIncompatibleVersionUnnamed: `Este plug-in é incompatível com a versão do ${product} em execução; executá-lo pode causar falhas ou perda de dados.`,
    reasonIncompatibleInstall: `Instale uma versão do plug-in compatível com este ${product}.`,
    reasonIncompatibleInstalled: `Desinstale-o e instale uma versão compatível com este ${product}.`,
    reasonUnsupportedPlatform: `Este plugin não oferece suporte ao sistema operacional em que o ${product} está sendo executado.`,
    officeUnavailable: `As pré-visualizações do Office não estão disponíveis. Ative o serviço de pré-visualização de documentos no computador que executa o ${product}.`,
    running: 'Em andamento',
    runningFor: 'Em andamento há {duration} ···',
    interrupted: `O processo do ${product} terminou antes do fim deste turno (por exemplo, foi encerrado à força, falhou ou excedeu o tempo limite ao desligar), por isso o turno foi fechado quando o ${product} reiniciou. As chamadas de ferramentas inacabadas têm resultado desconhecido.`,
    accountSignedOut: 'Interrompido porque você saiu da conta do provedor do modelo.',
    accountSignInRequired: 'Faça login no provedor do modelo e confirme que o destino da solicitação oferece suporte à autenticação de conta.',
    presetSectionIntro: `Escolha as ferramentas do agente e como funciona. Use o modo Padrão para tarefas diárias ou o modo Criador para adicionar recursos ao ${product}.`,
    presetCreatorDescription: `Personalize ${product} por meio de conversa. Deixe o agente escrever plug-ins que adicionem recursos ou UI, ou combine ferramentas e prompts para criar seu próprio modo.`,
    presetCreatePlugin: `Entre no modo Criador e crie seu próprio plug-in ${product}`,
  }),
}

/**
 * Build the copy overrides for one brand in one UI language.
 * @param brand - the validated brand record.
 * @param locale - the UI language the overrides apply to.
 * @returns one entry per namespace, in registration order.
 */
export function brandCopy(brand: BrandRecord, locale: BrandLocale): readonly CopyOverride[] {
  const product = brand.productName
  const copy = COPY[locale](product)
  return [
    // dsh-client-locale: the sidebar label and the document title base.
    { ns: 'common', dict: { 'brand.localBuild': product } },
    // dsh-client-ui-conversation: the blank-session headline.
    ...(brand.tagline === undefined ? [] : [{ ns: 'conversation', dict: { 'hero.headline': brandText(brand.tagline, locale) } }]),
    // dsh-client-ui-settings-models: first-run notice and key onboarding.
    {
      ns: 'settings.models',
      dict: {
        welcomeTitle: copy.welcomeTitle,
        welcomeBody: copy.welcomeBody,
        onboardingTitle: copy.onboardingTitle,
        onboardingDescription: copy.onboardingDescription,
      },
    },
    // dsh-client-ui-model-selection: the account model group and the lock message.
    { ns: 'model', dict: { 'provider.account': copy.providerAccount, 'error.sessionInUse': copy.sessionInUse } },
    // dsh-client-ui-plugin-manager: restart and compatibility notices.
    {
      ns: 'pluginManager',
      dict: {
        restartNotice: copy.restartNotice,
        restartReasonPackageMoved: copy.restartReasonPackageMoved,
        restartReasonHostModule: copy.restartReasonHostModule,
        restartReasonModuleComparison: copy.restartReasonModuleComparison,
        installGuideSafety: copy.installGuideSafety,
        installUpgradeNotice: copy.installUpgradeNotice,
        installProblemShipped: copy.installProblemShipped,
        sourceTargetSpec: copy.sourceTargetSpec,
        sourceTargetVersion: copy.sourceTargetVersion,
        installDoneRestart: copy.installDoneRestart,
        reasonIncompatibleVersion: copy.reasonIncompatibleVersion,
        reasonIncompatibleVersionUnnamed: copy.reasonIncompatibleVersionUnnamed,
        reasonIncompatibleInstall: copy.reasonIncompatibleInstall,
        reasonIncompatibleInstalled: copy.reasonIncompatibleInstalled,
        reasonUnsupportedPlatform: copy.reasonUnsupportedPlatform,
      },
    },
    // dsh-client-ui-sidebar-documentpreview (office): the unavailable notice.
    { ns: 'sidebarOffice', dict: { unavailable: copy.officeUnavailable } },
    // dsh-client-ui-agent-preset: the Agent presets section that names the harness.
    {
      ns: 'settings.agentPreset',
      dict: {
        sectionIntro: copy.presetSectionIntro,
        presetCordisDescription: copy.presetCreatorDescription,
        createPluginDescription: copy.presetCreatePlugin,
      },
    },
    // dsh-client-ui-chat: the running status wording, and turn failure messages that name the process or the vendor account.
    {
      ns: 'chat',
      dict: {
        'chat.deepDiving': copy.running,
        'chat.deepDivingFor': copy.runningFor,
        'message.failure.interrupted': copy.interrupted,
        'message.failure.accountSignedOut': copy.accountSignedOut,
        'message.failure.accountSignInRequired': copy.accountSignInRequired,
      },
    },
  ]
}
