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
  readonly installBundledTitle: string
  readonly installSpecPlaceholder: string
  readonly installGuideIdExample: string
  readonly installGuideIdHint: string
  readonly updateLostDetail: string
  readonly versionsBlocked: string
  readonly versionsBlockedDetail: string
  readonly browserApplicationOrigin: string
  readonly officeUnavailable: string
  readonly running: string
  readonly runningFor: string
  readonly interrupted: string
  readonly accountSignedOut: string
  readonly accountSignInRequired: string
  readonly presetSectionIntro: string
  readonly presetCreatorDescription: string
  readonly presetCreatePlugin: string
  readonly presetCreatorGuide: string
  readonly presetCreatorExamples: string
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
    installBundledTitle: `This plugin ships with ${product}`,
    installSpecPlaceholder: 'for example @author/plugin',
    installGuideIdExample: '@author/plugin',
    installGuideIdHint: 'The plugin package name is the npm package name (like @author/plugin) in the install command of the plugin\'s README.',
    updateLostDetail: `The connection to ${product} was interrupted: {reason}. Refresh the plugin list to see the installed version.`,
    versionsBlocked: `Newer versions need a ${product} update`,
    versionsBlockedDetail: `{version} needs {peers}; this ${product} is {runtime}`,
    browserApplicationOrigin: `The embedded browser cannot open ${product} itself.`,
    officeUnavailable: `Office previews are unavailable. Enable the document preview service on the computer running ${product}.`,
    running: 'Working',
    runningFor: 'Working for {duration} ···',
    interrupted: `The ${product} process exited before this turn finished (for example, it was killed, crashed, or timed out while shutting down), so the turn was closed when ${product} restarted. Unfinished tool calls have unknown outcomes.`,
    accountSignedOut: 'Stopped because you signed out of the model provider account.',
    accountSignInRequired: 'Sign in to the model provider and ensure the request destination supports account authentication.',
    presetSectionIntro: `Choose the agent’s tools and how it works. Use Standard mode for everyday tasks, or Creator mode to add capabilities to ${product}.`,
    presetCreatorDescription: `Customize ${product} through conversation. Let the agent write plugins that add features or UI, or combine tools and prompts to create your own mode.`,
    presetCreatePlugin: `Enter Creator mode and make your own ${product} plugin`,
    presetCreatorGuide: `### What you can create\n\nCreator mode has the standard task tools, runtime inspection, and guides to write plugins and agent presets. It can write a plugin that adds a tool, a service connection, or a page, or a preset that combines tools and instructions for one type of work.\n\n### Plugins and modes\n\nA plugin adds a capability to ${product}, such as a tool, a service connection, or a sidebar entry. A mode is an agent preset: it selects the tools and sets how the agent works in a task. A custom preset can include a plugin.\n\n### How the result takes effect\n\nThe agent writes the plugin or the preset in your workspace. It cannot install it: your administrator installs it. After the installation, a plugin loads at once or after a restart, and a new preset shows in the agent picker for a new task.`,
    presetCreatorExamples: `### Add a page\n\n> Write a ${product} plugin that adds a project notes entry to the sidebar. The page lists the Markdown files in this workspace and shows a preview of the selected note. Test the plugin code.\n\nExpected output: the plugin source in your workspace, its tests, and the steps for your administrator to install it.\n\n### Add a tool\n\n> Write a plugin with a tool that reads the test report of this project and gives a summary of the failed tests. Test the tool with a sample report.\n\nExpected output: the plugin source with one tool, and a test with a sample report.\n\n### Make your own mode\n\n> Write a “Claim review” mode based on the Patent Agent. It checks that the description supports each claim, names the paragraph for each feature, and asks before it changes a file.\n\nExpected output: a preset for your administrator to install. The instructions guide the agent; the permission settings control which actions it can do.`,
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
    installBundledTitle: `插件已随 ${product} 提供`,
    installSpecPlaceholder: '例如 @作者/插件名',
    installGuideIdExample: '@作者/插件名',
    installGuideIdHint: '插件包名即 npm 包名（如 @作者/插件名），见插件 README 中的安装命令。',
    updateLostDetail: `与 ${product} 的连接中断：{reason}。刷新插件列表可查看当前版本。`,
    versionsBlocked: `新版本需要更新 ${product}`,
    versionsBlockedDetail: `{version} 需要 {peers}，当前 ${product} 为 {runtime}`,
    browserApplicationOrigin: `不能在嵌入浏览器中打开 ${product} 自身。`,
    officeUnavailable: `Office 预览不可用。请在运行 ${product} 的计算机上启用文档预览服务。`,
    running: '处理中',
    runningFor: '处理中，用时 {duration} ···',
    interrupted: `${product} 进程在本轮完成前退出（例如被强制结束、崩溃或关闭超时），因此 ${product} 重新启动时本轮已关闭。未完成的工具调用结果未知。`,
    accountSignedOut: '已停止，因为你已退出模型服务商账号。',
    accountSignInRequired: '请登录模型服务商，并确认请求目标支持账号认证。',
    presetSectionIntro: `选择 Agent 的工具和工作方式。日常任务用「标准模式」，扩展 ${product} 的能力用「创造模式」。`,
    presetCreatorDescription: `用对话定制 ${product}：让 Agent 编写插件，添加新功能或界面；也能组合工具和提示词，创建自己的模式。`,
    presetCreatePlugin: `进入创造模式，制作属于你的 ${product} 插件`,
    presetCreatorGuide: `### 可以创建什么\n\n创造模式包含标准任务工具、运行时检查，以及编写插件和 Agent 预设的指南。它可以编写一个添加工具、服务连接或页面的插件，也可以编写一个为某类工作组合工具和指令的预设。\n\n### 插件和模式\n\n插件为 ${product} 添加一项能力，例如工具、服务连接或侧边栏入口。模式是 Agent 预设：它选择工具，并规定 Agent 在任务中的工作方式。自定义预设可以包含插件。\n\n### 结果如何生效\n\nAgent 会在你的工作区中编写插件或预设，但不能安装它：由你的管理员安装。安装后，插件会立即加载或在重启后加载，新预设会在新任务的 Agent 选择器中出现。`,
    presetCreatorExamples: `### 添加页面\n\n> 编写一个 ${product} 插件，在侧边栏添加项目笔记入口。页面列出此工作区中的 Markdown 文件，并预览所选笔记。测试插件代码。\n\n预期结果：工作区中的插件源代码、它的测试，以及供管理员安装的步骤。\n\n### 添加工具\n\n> 编写一个插件，其中的工具读取本项目的测试报告并汇总失败的测试。用示例报告测试该工具。\n\n预期结果：包含一个工具的插件源代码，以及使用示例报告的测试。\n\n### 创建自己的模式\n\n> 基于 Patent Agent 编写一个“权利要求审查”模式。它检查说明书是否支持每项权利要求，为每个特征注明段落，并在修改文件前先询问。\n\n预期结果：一个供管理员安装的预设。这些指令引导 Agent；权限设置决定它可以执行哪些操作。`,
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
    installBundledTitle: `このプラグインは ${product} に同梱されています`,
    installSpecPlaceholder: '例: @author/plugin',
    installGuideIdExample: '@author/plugin',
    installGuideIdHint: 'プラグインのパッケージ名は npm パッケージ名（@author/plugin など）で、プラグインの README のインストールコマンドにあります。',
    updateLostDetail: `${product} との接続が中断されました: {reason}。プラグイン一覧を更新すると、インストール済みのバージョンを確認できます。`,
    versionsBlocked: `新しいバージョンには ${product} の更新が必要です`,
    versionsBlockedDetail: `{version} には {peers} が必要です。この ${product} は {runtime} です`,
    browserApplicationOrigin: `埋め込みブラウザは ${product} 自体を開けません。`,
    officeUnavailable: `Office のプレビューは利用できません。${product} を実行しているコンピューターでドキュメントプレビューサービスを有効にしてください。`,
    running: '処理中',
    runningFor: '処理中 {duration} ···',
    interrupted: `このターンが完了する前に ${product} のプロセスが終了したため（強制終了、クラッシュ、シャットダウン中のタイムアウトなど）、${product} の再起動時にターンを閉じました。未完了のツール呼び出しの結果は不明です。`,
    accountSignedOut: 'モデルプロバイダーのアカウントからサインアウトしたため、停止しました。',
    accountSignInRequired: 'モデルプロバイダーにサインインし、リクエスト先がアカウント認証に対応していることを確認してください。',
    presetSectionIntro: `エージェントのツールと動作を選択します。日々のタスクには標準モードを、${product} に機能を追加するにはクリエイターモードを使用してください。`,
    presetCreatorDescription: `会話を通じて ${product} をカスタマイズします。機能や UI を追加するプラグインをエージェントに書かせたり、ツールとプロンプトを組み合わせて独自のモードを作成したりできます。`,
    presetCreatePlugin: `クリエイターモードに入り、独自の ${product} プラグインを作成`,
    presetCreatorGuide: `### 作成できるもの\n\nクリエイターモードには、標準のタスクツール、ランタイムの検査、プラグインとエージェントプリセットを書くためのガイドがあります。ツール、サービス接続、ページを追加するプラグインや、特定の作業向けにツールと指示を組み合わせたプリセットを書くことができます。\n\n### プラグインとモード\n\nプラグインは、ツール、サービス接続、サイドバーのエントリなど、${product} に機能を追加します。モードはエージェントプリセットです。ツールを選び、タスクでのエージェントの動作を決めます。カスタムプリセットにはプラグインを含めることができます。\n\n### 結果を反映させる方法\n\nエージェントはプラグインやプリセットをワークスペースに書きますが、インストールはできません。インストールは管理者が行います。インストール後、プラグインはすぐに、または再起動後に読み込まれ、新しいプリセットは新しいタスクのエージェント選択に表示されます。`,
    presetCreatorExamples: `### ページを追加する\n\n> サイドバーにプロジェクトメモのエントリを追加する ${product} プラグインを書いてください。ページにはこのワークスペースの Markdown ファイルを一覧表示し、選択したメモをプレビューします。プラグインのコードをテストしてください。\n\n期待される出力: ワークスペース内のプラグインのソース、そのテスト、管理者がインストールするための手順。\n\n### ツールを追加する\n\n> このプロジェクトのテストレポートを読み、失敗したテストを要約するツールを持つプラグインを書いてください。サンプルのレポートでツールをテストしてください。\n\n期待される出力: ツールを 1 つ持つプラグインのソースと、サンプルレポートを使ったテスト。\n\n### 独自のモードを作成する\n\n> Patent Agent をベースに「クレームレビュー」モードを書いてください。明細書が各クレームを裏付けているか確認し、各特徴の段落を示し、ファイルを変更する前に確認を求めます。\n\n期待される出力: 管理者がインストールするプリセット。指示はエージェントを導くもので、実行できる操作は権限設定で決まります。`,
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
    installBundledTitle: `Este complemento se incluye con ${product}`,
    installSpecPlaceholder: 'por ejemplo @author/plugin',
    installGuideIdExample: '@author/plugin',
    installGuideIdHint: 'El nombre del paquete del complemento es el nombre del paquete npm (como @author/plugin) del comando de instalación del README del complemento.',
    updateLostDetail: `Se interrumpió la conexión con ${product}: {reason}. Actualice la lista de complementos para ver la versión instalada.`,
    versionsBlocked: `Las versiones más nuevas necesitan una actualización de ${product}`,
    versionsBlockedDetail: `{version} necesita {peers}; este ${product} es {runtime}`,
    browserApplicationOrigin: `El navegador integrado no puede abrir ${product}.`,
    officeUnavailable: `Las vistas previas de Office no están disponibles. Active el servicio de vista previa de documentos en el equipo que ejecuta ${product}.`,
    running: 'Trabajando',
    runningFor: 'Trabajando durante {duration} ···',
    interrupted: `El proceso de ${product} finalizó antes de que terminara este turno (por ejemplo, se forzó su cierre, falló o agotó el tiempo de espera al apagarse), por lo que el turno se cerró cuando ${product} se reinició. Las llamadas a herramientas sin terminar tienen un resultado desconocido.`,
    accountSignedOut: 'Se detuvo porque cerró la sesión de la cuenta del proveedor del modelo.',
    accountSignInRequired: 'Inicie sesión en el proveedor del modelo y asegúrese de que el destino de la solicitud admite la autenticación de cuenta.',
    presetSectionIntro: `Elija las herramientas del agente y cómo funciona. Utilice el modo Estándar para las tareas diarias o el modo Creador para agregar capacidades a ${product}.`,
    presetCreatorDescription: `Personaliza ${product} a través de la conversación. Deje que el agente escriba complementos que agreguen funciones o interfaz de usuario, o combine herramientas e indicaciones para crear su propio modo.`,
    presetCreatePlugin: `Ingrese al modo Creador y cree su propio complemento ${product}`,
    presetCreatorGuide: `### Qué puede crear\n\nEl modo creador tiene las herramientas estándar de tareas, la inspección del entorno de ejecución y guías para escribir complementos y preajustes de agente. Puede escribir un complemento que añade una herramienta, una conexión de servicio o una página, o un preajuste que combina herramientas e instrucciones para un tipo de trabajo.\n\n### Complementos y modos\n\nUn complemento añade una capacidad a ${product}, por ejemplo una herramienta, una conexión de servicio o una entrada de la barra lateral. Un modo es un preajuste de agente: selecciona las herramientas y define cómo trabaja el agente en una tarea. Un preajuste personalizado puede incluir un complemento.\n\n### Cómo se aplica el resultado\n\nEl agente escribe el complemento o el preajuste en su espacio de trabajo. No puede instalarlo: lo instala su administrador. Después de la instalación, un complemento se carga de inmediato o tras un reinicio, y un preajuste nuevo aparece en el selector de agente para una tarea nueva.`,
    presetCreatorExamples: `### Añadir una página\n\n> Escribe un complemento de ${product} que añade una entrada de notas del proyecto a la barra lateral. La página muestra los archivos Markdown de este espacio de trabajo y una vista previa de la nota seleccionada. Prueba el código del complemento.\n\nResultado esperado: el código fuente del complemento en su espacio de trabajo, sus pruebas y los pasos para que su administrador lo instale.\n\n### Añadir una herramienta\n\n> Escribe un complemento con una herramienta que lee el informe de pruebas de este proyecto y resume las pruebas fallidas. Prueba la herramienta con un informe de ejemplo.\n\nResultado esperado: el código fuente del complemento con una herramienta y una prueba con un informe de ejemplo.\n\n### Crear su propio modo\n\n> Escribe un modo «Revisión de reivindicaciones» basado en el Patent Agent. Comprueba que la descripción respalda cada reivindicación, indica el párrafo de cada característica y pregunta antes de cambiar un archivo.\n\nResultado esperado: un preajuste para que su administrador lo instale. Las instrucciones guían al agente; la configuración de permisos controla qué acciones puede realizar.`,
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
    installBundledTitle: `Ce plugin est livré avec ${product}`,
    installSpecPlaceholder: 'par exemple @author/plugin',
    installGuideIdExample: '@author/plugin',
    installGuideIdHint: 'Le nom du package du plugin est le nom du package npm (comme @author/plugin) de la commande d’installation du README du plugin.',
    updateLostDetail: `La connexion à ${product} a été interrompue : {reason}. Actualisez la liste des plugins pour voir la version installée.`,
    versionsBlocked: `Les versions plus récentes nécessitent une mise à jour de ${product}`,
    versionsBlockedDetail: `{version} a besoin de {peers} ; ce ${product} est {runtime}`,
    browserApplicationOrigin: `Le navigateur intégré ne peut pas ouvrir ${product} lui-même.`,
    officeUnavailable: `Les aperçus Office ne sont pas disponibles. Activez le service d'aperçu des documents sur l'ordinateur qui exécute ${product}.`,
    running: 'En cours',
    runningFor: 'En cours depuis {duration} ···',
    interrupted: `Le processus ${product} s'est arrêté avant la fin de ce tour (par exemple, il a été tué, a planté ou a dépassé le délai d'arrêt) ; le tour a donc été clôturé au redémarrage de ${product}. Le résultat des appels d'outils inachevés est inconnu.`,
    accountSignedOut: 'Arrêté parce que vous vous êtes déconnecté du compte du fournisseur de modèle.',
    accountSignInRequired: "Connectez-vous au fournisseur de modèle et vérifiez que la destination de la requête prend en charge l'authentification par compte.",
    presetSectionIntro: `Choisissez les outils de l’agent et son fonctionnement. Utilisez le mode Standard pour les tâches quotidiennes ou le mode Créateur pour ajouter des fonctionnalités à ${product}.`,
    presetCreatorDescription: `Personnalisez ${product} via la conversation. Laissez l'agent écrire des plugins qui ajoutent des fonctionnalités ou une interface utilisateur, ou combinez des outils et des invites pour créer votre propre mode.`,
    presetCreatePlugin: `Entrez en mode Créateur et créez votre propre plugin ${product}`,
    presetCreatorGuide: `### Ce que vous pouvez créer\n\nLe mode Créateur contient les outils de tâche standard, l’inspection de l’environnement d’exécution et des guides pour écrire des plugins et des préréglages d’agent. Il peut écrire un plugin qui ajoute un outil, une connexion à un service ou une page, ou un préréglage qui combine des outils et des instructions pour un type de travail.\n\n### Plugins et modes\n\nUn plugin ajoute une capacité à ${product}, par exemple un outil, une connexion à un service ou une entrée de la barre latérale. Un mode est un préréglage d’agent : il sélectionne les outils et définit comment l’agent travaille dans une tâche. Un préréglage personnalisé peut inclure un plugin.\n\n### Comment le résultat prend effet\n\nL’agent écrit le plugin ou le préréglage dans votre espace de travail. Il ne peut pas l’installer : votre administrateur l’installe. Après l’installation, un plugin se charge tout de suite ou après un redémarrage, et un nouveau préréglage apparaît dans le sélecteur d’agent pour une nouvelle tâche.`,
    presetCreatorExamples: `### Ajouter une page\n\n> Écris un plugin ${product} qui ajoute une entrée de notes de projet à la barre latérale. La page liste les fichiers Markdown de cet espace de travail et affiche un aperçu de la note sélectionnée. Teste le code du plugin.\n\nRésultat attendu : le code source du plugin dans votre espace de travail, ses tests et les étapes d’installation pour votre administrateur.\n\n### Ajouter un outil\n\n> Écris un plugin avec un outil qui lit le rapport de tests de ce projet et résume les tests en échec. Teste l’outil avec un rapport d’exemple.\n\nRésultat attendu : le code source du plugin avec un outil, et un test avec un rapport d’exemple.\n\n### Créer votre propre mode\n\n> Écris un mode « Revue des revendications » basé sur le Patent Agent. Il vérifie que la description soutient chaque revendication, indique le paragraphe de chaque caractéristique et demande avant de modifier un fichier.\n\nRésultat attendu : un préréglage que votre administrateur installe. Les instructions guident l’agent ; les paramètres d’autorisation contrôlent les actions qu’il peut effectuer.`,
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
    installBundledTitle: `Dieses Plugin wird mit ${product} geliefert`,
    installSpecPlaceholder: 'zum Beispiel @author/plugin',
    installGuideIdExample: '@author/plugin',
    installGuideIdHint: 'Der Plugin-Paketname ist der npm-Paketname (wie @author/plugin) aus dem Installationsbefehl in der README des Plugins.',
    updateLostDetail: `Die Verbindung zu ${product} wurde unterbrochen: {reason}. Aktualisieren Sie die Plugin-Liste, um die installierte Version anzuzeigen.`,
    versionsBlocked: `Neuere Versionen benötigen ein ${product}-Update`,
    versionsBlockedDetail: `{version} benötigt {peers}; dieses ${product} ist {runtime}`,
    browserApplicationOrigin: `Der eingebettete Browser kann ${product} selbst nicht öffnen.`,
    officeUnavailable: `Office-Vorschauen sind nicht verfügbar. Aktivieren Sie den Dokumentvorschaudienst auf dem Computer, auf dem ${product} läuft.`,
    running: 'In Arbeit',
    runningFor: 'In Arbeit seit {duration} ···',
    interrupted: `Der ${product}-Prozess wurde beendet, bevor dieser Durchgang abgeschlossen war (zum Beispiel wurde er beendet, ist abgestürzt oder hat beim Herunterfahren das Zeitlimit überschritten); daher wurde der Durchgang beim Neustart von ${product} geschlossen. Das Ergebnis unvollständiger Werkzeugaufrufe ist unbekannt.`,
    accountSignedOut: 'Angehalten, weil Sie sich vom Konto des Modellanbieters abgemeldet haben.',
    accountSignInRequired: 'Melden Sie sich beim Modellanbieter an und stellen Sie sicher, dass das Anfrageziel die Kontoauthentifizierung unterstützt.',
    presetSectionIntro: `Wählen Sie die Tools des Agenten und deren Funktionsweise aus. Verwenden Sie den Standardmodus für alltägliche Aufgaben oder den Creator-Modus, um ${product} Funktionen hinzuzufügen.`,
    presetCreatorDescription: `Passen Sie ${product} durch Gespräche an. Lassen Sie den Agenten Plugins schreiben, die Funktionen oder Benutzeroberflächen hinzufügen, oder kombinieren Sie Tools und Eingabeaufforderungen, um Ihren eigenen Modus zu erstellen.`,
    presetCreatePlugin: `Wechseln Sie in den Erstellermodus und erstellen Sie Ihr eigenes ${product}-Plugin`,
    presetCreatorGuide: `### Was Sie erstellen können\n\nDer Erstellermodus hat die Standard-Werkzeuge für Aufgaben, die Laufzeit-Inspektion und Anleitungen zum Schreiben von Plugins und Agenten-Voreinstellungen. Er kann ein Plugin schreiben, das ein Werkzeug, eine Dienstverbindung oder eine Seite hinzufügt, oder eine Voreinstellung, die Werkzeuge und Anweisungen für eine Art von Arbeit kombiniert.\n\n### Plugins und Modi\n\nEin Plugin fügt ${product} eine Fähigkeit hinzu, zum Beispiel ein Werkzeug, eine Dienstverbindung oder einen Eintrag in der Seitenleiste. Ein Modus ist eine Agenten-Voreinstellung: Er wählt die Werkzeuge aus und legt fest, wie der Agent in einer Aufgabe arbeitet. Eine eigene Voreinstellung kann ein Plugin enthalten.\n\n### Wie das Ergebnis wirksam wird\n\nDer Agent schreibt das Plugin oder die Voreinstellung in Ihren Arbeitsbereich. Er kann es nicht installieren: Ihr Administrator installiert es. Nach der Installation lädt ein Plugin sofort oder nach einem Neustart, und eine neue Voreinstellung erscheint in der Agentenauswahl für eine neue Aufgabe.`,
    presetCreatorExamples: `### Eine Seite hinzufügen\n\n> Schreibe ein ${product}-Plugin, das der Seitenleiste einen Eintrag für Projektnotizen hinzufügt. Die Seite listet die Markdown-Dateien dieses Arbeitsbereichs und zeigt eine Vorschau der gewählten Notiz. Teste den Plugin-Code.\n\nErwartetes Ergebnis: der Quellcode des Plugins in Ihrem Arbeitsbereich, seine Tests und die Schritte, mit denen Ihr Administrator es installiert.\n\n### Ein Werkzeug hinzufügen\n\n> Schreibe ein Plugin mit einem Werkzeug, das den Testbericht dieses Projekts liest und die fehlgeschlagenen Tests zusammenfasst. Teste das Werkzeug mit einem Beispielbericht.\n\nErwartetes Ergebnis: der Quellcode des Plugins mit einem Werkzeug und ein Test mit einem Beispielbericht.\n\n### Einen eigenen Modus erstellen\n\n> Schreibe einen Modus „Anspruchsprüfung“ auf Basis des Patent Agent. Er prüft, ob die Beschreibung jeden Anspruch stützt, nennt für jedes Merkmal den Absatz und fragt, bevor er eine Datei ändert.\n\nErwartetes Ergebnis: eine Voreinstellung, die Ihr Administrator installiert. Die Anweisungen leiten den Agenten; die Berechtigungseinstellungen bestimmen, welche Aktionen er ausführen kann.`,
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
    installBundledTitle: `Этот плагин поставляется с ${product}`,
    installSpecPlaceholder: 'например @author/plugin',
    installGuideIdExample: '@author/plugin',
    installGuideIdHint: 'Имя пакета плагина — это имя пакета npm (например, @author/plugin) из команды установки в README плагина.',
    updateLostDetail: `Соединение с ${product} было прервано: {reason}. Обновите список плагинов, чтобы увидеть установленную версию.`,
    versionsBlocked: `Для более новых версий требуется обновление ${product}`,
    versionsBlockedDetail: `{version} нужен {peers}; этот ${product} — {runtime}`,
    browserApplicationOrigin: `Встроенный браузер не может открыть сам ${product}.`,
    officeUnavailable: `Предпросмотр Office недоступен. Включите службу предпросмотра документов на компьютере, на котором работает ${product}.`,
    running: 'Выполняется',
    runningFor: 'Выполняется {duration} ···',
    interrupted: `Процесс ${product} завершился до окончания этого хода (например, был принудительно остановлен, аварийно завершился или превысил время ожидания при выключении), поэтому ход был закрыт при перезапуске ${product}. Результаты незавершённых вызовов инструментов неизвестны.`,
    accountSignedOut: 'Остановлено, так как вы вышли из аккаунта поставщика модели.',
    accountSignInRequired: 'Войдите в аккаунт поставщика модели и убедитесь, что адресат запроса поддерживает аутентификацию по аккаунту.',
    presetSectionIntro: `Выбирайте инструменты агента и то, как они работают. Используйте стандартный режим для повседневных задач или режим Creator, чтобы расширить возможности ${product}.`,
    presetCreatorDescription: `Настройте ${product} через разговор. Позвольте агенту писать плагины, которые добавляют функции или пользовательский интерфейс, или комбинируйте инструменты и подсказки для создания собственного режима.`,
    presetCreatePlugin: `Войдите в режим Creator и создайте свой собственный плагин ${product}.`,
    presetCreatorGuide: `### Что можно создать\n\nРежим автора включает стандартные инструменты задач, проверку среды выполнения и руководства по написанию плагинов и пресетов агента. Он может написать плагин, который добавляет инструмент, подключение к сервису или страницу, или пресет, который объединяет инструменты и инструкции для одного вида работы.\n\n### Плагины и режимы\n\nПлагин добавляет в ${product} новую возможность, например инструмент, подключение к сервису или пункт боковой панели. Режим — это пресет агента: он выбирает инструменты и задаёт, как агент работает в задаче. Собственный пресет может включать плагин.\n\n### Как результат вступает в силу\n\nАгент пишет плагин или пресет в вашем рабочем пространстве. Установить его агент не может: его устанавливает ваш администратор. После установки плагин загружается сразу или после перезапуска, а новый пресет появляется в выборе агента для новой задачи.`,
    presetCreatorExamples: `### Добавить страницу\n\n> Напиши плагин ${product}, который добавляет в боковую панель пункт для заметок проекта. Страница показывает список файлов Markdown в этом рабочем пространстве и предпросмотр выбранной заметки. Протестируй код плагина.\n\nОжидаемый результат: исходный код плагина в вашем рабочем пространстве, его тесты и шаги, по которым администратор его установит.\n\n### Добавить инструмент\n\n> Напиши плагин с инструментом, который читает отчёт о тестах этого проекта и кратко описывает упавшие тесты. Протестируй инструмент на примере отчёта.\n\nОжидаемый результат: исходный код плагина с одним инструментом и тест на примере отчёта.\n\n### Создать свой режим\n\n> Напиши режим «Проверка формулы» на основе Patent Agent. Он проверяет, что описание поддерживает каждый пункт формулы, указывает абзац для каждого признака и спрашивает перед изменением файла.\n\nОжидаемый результат: пресет, который установит ваш администратор. Инструкции направляют агента; настройки разрешений определяют, какие действия он может выполнять.`,
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
    installBundledTitle: `Este plugin é fornecido com o ${product}`,
    installSpecPlaceholder: 'por exemplo @author/plugin',
    installGuideIdExample: '@author/plugin',
    installGuideIdHint: 'O nome do pacote do plugin é o nome do pacote npm (como @author/plugin) do comando de instalação no README do plugin.',
    updateLostDetail: `A conexão com o ${product} foi interrompida: {reason}. Atualize a lista de plugins para ver a versão instalada.`,
    versionsBlocked: `Versões mais recentes precisam de uma atualização do ${product}`,
    versionsBlockedDetail: `{version} precisa de {peers}; este ${product} é {runtime}`,
    browserApplicationOrigin: `O navegador incorporado não pode abrir o próprio ${product}.`,
    officeUnavailable: `As pré-visualizações do Office não estão disponíveis. Ative o serviço de pré-visualização de documentos no computador que executa o ${product}.`,
    running: 'Em andamento',
    runningFor: 'Em andamento há {duration} ···',
    interrupted: `O processo do ${product} terminou antes do fim deste turno (por exemplo, foi encerrado à força, falhou ou excedeu o tempo limite ao desligar), por isso o turno foi fechado quando o ${product} reiniciou. As chamadas de ferramentas inacabadas têm resultado desconhecido.`,
    accountSignedOut: 'Interrompido porque você saiu da conta do provedor do modelo.',
    accountSignInRequired: 'Faça login no provedor do modelo e confirme que o destino da solicitação oferece suporte à autenticação de conta.',
    presetSectionIntro: `Escolha as ferramentas do agente e como funciona. Use o modo Padrão para tarefas diárias ou o modo Criador para adicionar recursos ao ${product}.`,
    presetCreatorDescription: `Personalize ${product} por meio de conversa. Deixe o agente escrever plug-ins que adicionem recursos ou UI, ou combine ferramentas e prompts para criar seu próprio modo.`,
    presetCreatePlugin: `Entre no modo Criador e crie seu próprio plug-in ${product}`,
    presetCreatorGuide: `### O que você pode criar\n\nO modo criador tem as ferramentas padrão de tarefas, a inspeção do ambiente de execução e guias para escrever plug-ins e predefinições de agente. Ele pode escrever um plug-in que adiciona uma ferramenta, uma conexão de serviço ou uma página, ou uma predefinição que combina ferramentas e instruções para um tipo de trabalho.\n\n### Plug-ins e modos\n\nUm plug-in adiciona uma capacidade ao ${product}, por exemplo uma ferramenta, uma conexão de serviço ou uma entrada da barra lateral. Um modo é uma predefinição de agente: ele seleciona as ferramentas e define como o agente trabalha em uma tarefa. Uma predefinição personalizada pode incluir um plug-in.\n\n### Como o resultado entra em vigor\n\nO agente escreve o plug-in ou a predefinição no seu espaço de trabalho. Ele não pode instalá-lo: o seu administrador o instala. Após a instalação, um plug-in carrega imediatamente ou após uma reinicialização, e uma nova predefinição aparece no seletor de agente para uma nova tarefa.`,
    presetCreatorExamples: `### Adicionar uma página\n\n> Escreva um plug-in do ${product} que adiciona uma entrada de notas do projeto à barra lateral. A página lista os arquivos Markdown deste espaço de trabalho e mostra uma prévia da nota selecionada. Teste o código do plug-in.\n\nResultado esperado: o código-fonte do plug-in no seu espaço de trabalho, os testes dele e os passos para o seu administrador instalá-lo.\n\n### Adicionar uma ferramenta\n\n> Escreva um plug-in com uma ferramenta que lê o relatório de testes deste projeto e resume os testes com falha. Teste a ferramenta com um relatório de exemplo.\n\nResultado esperado: o código-fonte do plug-in com uma ferramenta e um teste com um relatório de exemplo.\n\n### Criar seu próprio modo\n\n> Escreva um modo “Revisão de reivindicações” baseado no Patent Agent. Ele verifica se a descrição sustenta cada reivindicação, indica o parágrafo de cada característica e pergunta antes de alterar um arquivo.\n\nResultado esperado: uma predefinição para o seu administrador instalar. As instruções orientam o agente; as configurações de permissão controlam quais ações ele pode executar.`,
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
    // dsh-client-ui-plugin-manager: restart, compatibility, update, and install notices.
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
        installBundledTitle: copy.installBundledTitle,
        installSpecPlaceholder: copy.installSpecPlaceholder,
        installGuideIdExample: copy.installGuideIdExample,
        installGuideIdHint: copy.installGuideIdHint,
        updateLostDetail: copy.updateLostDetail,
        versionsBlocked: copy.versionsBlocked,
        versionsBlockedDetail: copy.versionsBlockedDetail,
      },
    },
    // dsh-client-ui-sidebar-browser: the refusal to open the application in its own embedded browser.
    { ns: 'sidebarBrowser', dict: { 'error.application-origin': copy.browserApplicationOrigin } },
    // dsh-client-ui-sidebar-documentpreview (office): the unavailable notice.
    { ns: 'sidebarOffice', dict: { unavailable: copy.officeUnavailable } },
    // dsh-client-ui-agent-preset: the Agent presets section that names the harness.
    {
      ns: 'settings.agentPreset',
      dict: {
        sectionIntro: copy.presetSectionIntro,
        presetCordisDescription: copy.presetCreatorDescription,
        createPluginDescription: copy.presetCreatePlugin,
        guideCordisExplanation: copy.presetCreatorGuide,
        guideCordisUsage: copy.presetCreatorExamples,
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
