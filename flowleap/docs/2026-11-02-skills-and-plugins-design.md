# Skills, instructions and plugins: design

Status: the founder decided Q1 to Q14 on 2026-11-02 (section 3). It builds on the [roadmap](2026-10-29-roadmap.md), the [desktop plan](2026-11-01-desktop-entry-plan.md) (the native-app rule and the plugin delivery of section 5.3) and [ADR 0001](adr/0001-self-hosted-firm-os.md) decision 12 (the firm skills library). It changes the scope of #71 and #84.

**The goal.** Skills are the methods that an agent follows for one type of patent work. FlowLeap ships its methods, a firm adds its own, and attorneys make and share skills with each other. Plugins are the ecosystem: FlowLeap and other vendors publish plugins in a catalog, and a firm or a user installs them. Every user can see which skills, instructions and plugins their agent uses, and where each one comes from.

## 1. What exists (2026-11-02)

| Part | State | Where |
|---|---|---|
| Skill file | A folder `<name>/SKILL.md` or a flat file `<name>.md`. YAML frontmatter: `name` (kebab-case) and `description` are required; `whenToUse`, `metadata`, `disable-model-invocation`, `user-invocable` are optional. Subfolders such as `references/`, `scripts/`, `assets/`. | `packages/skill/skill-filesystem/README.md` |
| Faulty skill | A skill with faulty frontmatter is skipped with a warning in the log only. The user sees no error; the skill is absent. | same |
| Skill readers | Two `skill-filesystem` rows. The upstream row reads the project (`.dsh/skills`, `.agents/skills`), `~/.dsh/skills` and `~/.agents/skills`. The `flowleap` row reads only the pack folder (`FLOWLEAP_SKILLS_DIR`, else `/opt/flowleap/skills`). So the desktop shows the user's skills for other agents beside the FlowLeap pack. | `packages/bundle/flowleap-web/cordis.patch.yml` (`skill-filesystem`) |
| FlowLeap pack | Authored in flowleap-cli, synced to flowleap-plugins, and built into the image at a fixed commit. Release 2026.11.02.0919 has flowleap-plugins `ed8a8a6a0f`, which includes `recipe-office-action-response`. | `deploy/Dockerfile`, flowleap-os `release/release.sh` |
| Firm skills | `install.sh` makes an empty read-only folder `/run/flowleap/firm/skills`. With `SKILLS=none` the runtimes read only this folder; the test firm runs `SKILLS=none` because the gate requires it. | flowleap-os `install.sh`, `release/gate.sh` |
| Skills in the UI | Only the `/` list in the composer and the Instructions card in the chat. No page lists the skills or their sources. | `packages/client/ui-skill` |
| Instructions | `dsh-agent-instructions` reads `AGENTS.md` and `CLAUDE.md`: the user-global chain (`$DSH_HOME/AGENTS.md`, `<agentsHome>/AGENTS.md`) and the project chain. On the firm both chains are empty. | `packages/context/agent-instructions/README.md` |
| Plugins in the UI | The firm profile turns off the Plugins page (`ui-plugin-manager`), Settings > Built-in plugins and the plugin inventory (#84). The desktop keeps the Plugins page. | `packages/bundle/flowleap-firm`, `packages/bundle/flowleap-web/cordis.patch.yml` |
| Plugin catalog | `apps/plugin-market-generator` writes a Discover `index.json` from npm names and Git URLs; `ui-plugin-market` shows it; `plugin-manager` installs from it. `offeredBundles` and `withheldBundles` limit what a profile offers. No price, no entitlement, no signature. | `apps/plugin-market-generator`, `packages/client/ui-plugin-market`, `packages/boot/plugin-market` |
| Skill creation | No tool. The plugin creator is for developers and is off in the FlowLeap profiles. | `entry-customization` `createPlugin: false` |

## 2. The model

Three things give an agent its way of working:

- **Instructions** (`AGENTS.md`): standing rules for every task, such as house rules, language and review duty.
- **Skills**: methods for one type of task, loaded when the task needs them.
- **Plugins**: packages that add skills, tools, pages and instructions. They come from a catalog.

Skills come from four sources. When two skills have the same name, the higher source wins:

| Rank | Source | Who writes it | Firm OS | Desktop |
|---|---|---|---|---|
| 1 | Firm | The administrator, or a shared skill that the administrator marks as a firm standard | the firm library | none |
| 2 | Mine | The user, or a shared skill that the user added | personal skills of the attorney | `~/.agents/skills` |
| 3 | Plugin | The plugin publisher | installed plugins | installed plugins |

A personal skill cannot replace a firm skill: it shows as a second skill under another name. On the desktop the user is the firm, so a skill in `~/.agents/skills` replaces a plugin skill.

## 3. Decisions (2026-11-02)

1. **Q1. The FlowLeap methods pack is a plugin.** It is free, installed by default, listed in FlowLeap Discover with a version, and updated from the catalog. Paid plugins (FlowLeap Data, a PATSTAT plugin) sit beside it in the same catalog.
2. **Q2. One skill reader.** It reads the skills of the installed plugins and one user folder per scope: the firm library on the firm OS, `~/.agents/skills` on the desktop. The UI shows each skill with its source. Plugins do not copy skills into a folder.
3. **Q3. Attorneys on the firm see a read-only Plugins page.** Each card shows the product name, the description, what the plugin adds (skills, tools, pages) and its state, with no package path such as `@deepseek-ai/dsh-…`. The administrator installs, updates and approves plugins in the admin console. Every card in both products shows the product name.
4. **Q4. Instructions in two layers.** One firm `AGENTS.md` that the administrator writes, read-only in every runtime, and one personal `AGENTS.md` per attorney, edited in Settings. Instructions per matter come with the matters (phase D). The desktop keeps the standard chain (`~/.agents/AGENTS.md` and the project).
5. **Q5. The rank of section 2.** Firm > mine > plugin. A personal skill never replaces a firm skill.
6. **Q6. A Skills page in Settings.** Each skill with its source (plugin name, Firm, Mine, or the author of a shared skill), its description and its full text on request; a note shows which skill replaces which. Plugin and firm skills are read-only there. Turning a plugin skill off per user comes later.
7. **Q7. Admin console pages.** "Firm skills": add (upload a folder or a .zip, or write in a browser editor), change, remove and try a skill. "Firm instructions": an editor for the firm `AGENTS.md`. Each change keeps the earlier version and is in the backup. A sync from a firm Git repository comes later.
8. **Q8. Plugin updates on the firm need the administrator.** The console shows "update available" with what changed; nothing updates by itself. Each release image carries a default version of the free methods plugin, so a new firm or a firm with no internet access works on day one. A plugin can stay at a fixed version. Plugin packages are signed, as release images are (#120).
9. **Q9. "New skill" through a conversation and a structure check.** The methods plugin ships a "Write a skill" skill: the agent asks the user about the method (when to use it, the steps, the checks, examples) and writes a correct skill folder. The Skills page has a "New skill" button that opens such a chat; the agent can also start from an earlier chat. Before each save a structure check runs; it names each fault in plain words and refuses a faulty skill. A "Try it" step runs the skill on one example before it goes live.
10. **Q10. Private and shared skills.** A new skill is private. The author can share it with the firm: it then shows on a "Shared skills" page under the author's name, with its description, date and number of users, and a colleague adds it with "Add". Before a share, the agent checks the skill for client data (client names, invention details, numbers) and asks the author to remove it; the dialog says that everybody in the firm can read the skill. The administrator can hide a shared skill, and can mark one as a firm standard. On the desktop "share" means an export file, or later a plugin in Discover, because a shared page would need a FlowLeap server.
11. **Q11. "Add" links to a version.** The colleague uses a fixed version. When the author shares a new version, the colleague sees what changed and decides. "Make my own copy" is possible.
12. **Q12. Removal keeps the work.** When an author removes or un-shares a skill, or leaves the firm, each colleague keeps the version they use as their own copy, with a note. New colleagues cannot add it. The administrator can give the shared skills of a leaver to a new owner.
13. **Q13. The UI word is "Skills".** The Skills page explains it in one line: "A skill is a method that your agent follows for one type of task."
14. **Q14. Order.** Before the demo: `SKILLS=pack` on the firm, the read-only Plugins page on the firm with product names, and a read-only Skills page with sources. After the demo: the rest, in the order of section 4.

## 4. Work order

| Order | Work | Decisions | Before the demo |
|---|---|---|---|
| 1 | The firm runs `SKILLS=pack` and the gate passes with it; the pack skills use the firm's connectors, not the `flowleap` CLI | – | yes |
| 2 | Plugins page on the firm, read-only; product names on every plugin card in both products | Q3 | yes |
| 3 | Skills page in Settings, read-only, with sources and the replace note | Q6, Q13 | yes |
| 4 | One skill reader with the rank of section 2 | Q2, Q5 | no |
| 5 | Firm skills and firm instructions pages in the admin console, with versions and backup; the firm `AGENTS.md` in every runtime | Q4, Q7 (#71) | no |
| 6 | Personal `AGENTS.md` editor in Settings | Q4 | no |
| 7 | "Write a skill", the structure check and "Try it" | Q9 | no |
| 8 | Private and shared skills, "Add" with versions, removal | Q10 to Q12 | no |
| 9 | The methods pack as a Discover plugin with versions; admin approval of plugin updates; signed plugin packages | Q1, Q8 | no |

## 5. Open points

- **Paid plugins need entitlements per plugin.** The backend has one plan today; a PATSTAT plugin sold apart needs an entitlement record per firm and plugin (desktop plan T13).
- **Where the firm OS keeps personal and shared skills.** Personal skills fit the attorney's runtime store; shared skills and their versions need a firm-level store in the control plane with backup. The ticket for order 8 decides it.
- **The client-data check** needs a test set of skills with and without client data before it is trusted.
