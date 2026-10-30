# Appliance experience: research and gap study

Status: the founder approved the four tickets on 2026-10-30: #116 (A), #117 (B), #118 (C), #119 (D). The decisions in section 8 use the recommended answers until the founder changes them. Work: the "easy hosting" half of phase B, beside the admin console (#34, tickets #106 to #114).

**The goal.** A firm IT person installs FlowLeap in 30 minutes with no help, and never needs SSH after that. The founder's comparison is Vercel: hosting must feel that easy, with a good dashboard to manage everything. The decision of 2026-10-30 stays: self-hosted only, no SaaS.

This study compares five self-hosted products and the Vercel dashboard on five topics: first-run setup, updates with rollback, backups in the UI, health status and notifications. Then it compares them with `flowleap-os` as it is on 2026-10-30 (commit `d18947b`), and proposes four tickets.

## 1. Sources and method

All facts in section 2 come from official documentation of each product. Each row names its page. The full notes, with one source for each sentence, are in the session notes of 2026-10-30 (`2026-10-30-appliance-experience-research.md`, outside the repository). I read four key claims again myself: the Umbrel automatic rollback, the Home Assistant pre-update backup and restore conditions, the Synology "Check backup integrity" action and the Vercel "Undo Rollback". A fact that came only from a search summary of an official page is marked "(search)".

The FlowLeap facts in section 3 come from `flowleap-os`: `README.md`, `OPERATIONS.md`, `install.sh`, `update.sh`, `backup.sh`, `deploy/firm.env.example` and `docs/restore-runbook.md`. The console facts come from the agreed design on #34 (comment of 2026-10-30) and tickets #106 to #114.

## 2. What the products do

### 2.1 First-run setup

| Product | What the user does | Sources |
|---|---|---|
| Home Assistant | Opens `http://homeassistant.local/` in a browser. The first screen asks: create a new system, or restore a backup (file upload or cloud). Then name, user name and password (the owner account), location (time zone, units, currency), analytics (off by default). No question about network, TLS or email. "Takes only a few minutes". | [onboarding](https://www.home-assistant.io/getting-started/onboarding/) |
| Synology DSM | Opens `find.synology.com` (or the DS finder phone app), selects "Install". Creates the admin account, server name and network; can bind a Synology Account and QuickConnect for remote access. The Storage Creation Wizard follows. | [DSM 7.1 user guide](https://global.download.synology.com/download/Document/Software/UserGuide/Os/DSM/7.1/enu/Syno_UsersGuide_NAServer_7.1_enu.pdf), [get started](https://kb.synology.com/en-global/DSM/help/DSM/MainMenu/get_started?version=7) |
| Umbrel | Opens `http://umbrel.local`, "Get started", name and password (search). Onboarding can restore a backup: location, backup, encryption password (search). | [umbrelOS](https://umbrel.com/umbrelos), [restore](https://umbrel.com/support/backups-and-recovery/restoring-from-a-backup) |
| Coolify | Runs one `curl … \| bash` command over SSH, then opens `http://<server-ip>:8000`. The first visitor becomes the admin, so the docs say to make the account at once. The docs say to back up `.env` (it holds `APP_KEY`). | [installation](https://coolify.io/docs/get-started/installation) |
| GitLab Omnibus | `EXTERNAL_URL=… apt install gitlab-ee`; a Let's Encrypt certificate for an `https://` URL; the root password is in a file for 24 hours. All settings in `/etc/gitlab/gitlab.rb`, applied with `gitlab-ctl reconfigure`. No browser wizard. | [install on Ubuntu](https://docs.gitlab.com/install/package/ubuntu/) |

### 2.2 Updates with rollback

| Product | Update | Backup first | Rollback | Sources |
|---|---|---|---|---|
| Home Assistant | Settings > System > Updates, "Update"; a count on the sidebar; "Join beta" | A setting "Backup preference when updating", changeable for each update ("Update all" makes none) | Restore the backup from the old version; CLI `ha core update --version X --backup`; the OS has two boot slots and boots the previous slot when a boot fails | [updating](https://www.home-assistant.io/common-tasks/general/updating/), [backups](https://www.home-assistant.io/common-tasks/general/backups/), [OS tasks](https://www.home-assistant.io/common-tasks/os/) |
| Synology DSM | Control Panel > Update & Restore; three modes: security updates automatic, all minor updates automatic, or notify only; a security update can wait up to 28 days | Recommends one | None: "updates are irreversible". Configuration Backup saves the settings after each change | [DSM update](https://kb.synology.com/en-global/DSM/help/DSM/AdminCenter/system_dsmupdate?version=7), [configuration backup](https://kb.synology.com/en-global/DSM/help/DSM/AdminCenter/system_configbackup?version=7) |
| Umbrel | A notice on the home screen; "never installed automatically" | Not documented | Automatic: a failed update goes back to the previous version, with no data loss, and shows a notification | [updating umbrelOS](https://umbrel.com/support/basics/updating-umbrelos) |
| Coolify | Settings > Updates, "Upgrade Now", or the sidebar badge; an automatic-update cron in the UI | The docs tell the admin to make one | Downgrade over SSH only, and the database state does not go back | [upgrade](https://coolify.io/docs/get-started/upgrade), [downgrade](https://coolify.io/docs/get-started/downgrade) |
| GitLab Omnibus | `apt install gitlab-ee`; a colored version status in the Admin area | The database, automatically, on by default | Manual: old package, reconfigure, restore a backup of that exact version | [update](https://docs.gitlab.com/update/package/), [downgrade](https://docs.gitlab.com/update/package/downgrade/), [version check](https://docs.gitlab.com/administration/settings/usage_statistics/) |
| Vercel | None | None | "Instant Rollback" on the production tile and in each row of the Deployments list. A verify step lists the affected domains, says the environment variables do not change, and warns about external databases and APIs. After a rollback, new pushes do not go live until "Undo Rollback". One rollback at a time; roles control who can do it | [instant rollback](https://vercel.com/docs/instant-rollback) |

### 2.3 Backups in the UI

| Product | Schedule and target | Key | Restore | Check | Sources |
|---|---|---|---|---|---|
| Home Assistant | Daily or chosen days; "Recommended" keeps 3; local, network storage, cloud, Synology, Google Drive, OneDrive | Encrypted by default; setup makes the user download an "emergency kit" with the key | Select a backup and its parts; also during onboarding. Blocked with less than 2 GB free, no internet, or an unhealthy system | None; a failed automatic backup is a Repairs issue | [backups](https://www.home-assistant.io/common-tasks/general/backups/) |
| Synology Hyper Backup | A Backup Wizard; local, USB, another NAS, rsync, S3, cloud drives; "Smart Recycle" retention with a timeline preview | AES-256; a lost password loses the data | A Restore wizard and Backup Explorer for single files | "Check backup integrity" checks that the data can be restored; a schedule is available | [backup tasks](https://kb.synology.com/en-global/DSM/help/HyperBackup/data_backup_create?version=7), [settings](https://kb.synology.com/en-global/DSM/help/HyperBackup/data_backup_settings?version=7), [restore](https://kb.synology.com/en-global/DSM/help/HyperBackup/restore?version=7) |
| Umbrel | Every hour, to another Umbrel, a NAS or USB; fixed retention (hourly 24 h, daily 1 week, weekly 1 month, monthly 1 year); "Back up now" | Encrypted with a password | "Rewind" for one file or folder; full restore at onboarding | Not documented | [backing up](https://umbrel.com/support/backups-and-recovery/backing-up-your-data) |
| Coolify | Settings > Backup, daily, optional S3; an "Executions" list with status and "Download" | `APP_KEY` in `.env` | Instance restore over SSH only | The docs say a successful backup only proves that a file exists, and tell users to test a restore (search) | [backup](https://coolify.io/docs/knowledge-base/how-to/backup-restore-coolify), [instance restore](https://coolify.io/docs/core/backup-and-recovery/instance-restore), [database backups](https://coolify.io/docs/databases/backups) |
| GitLab Omnibus | `gitlab-backup create` from a crontab line; S3 or a share set in `gitlab.rb` | Not included: `gitlab.rb` and `gitlab-secrets.json` must be backed up apart | CLI | None documented | [backup](https://docs.gitlab.com/administration/backup_restore/backup_gitlab/) |

### 2.4 Health status

- **Home Assistant.** Settings > System > Repairs lists each problem that needs the user, with a fix button or the fix steps; the Settings item shows a count of updates and repairs ([repairs](https://www.home-assistant.io/integrations/repairs/)).
- **Synology.** Green or red status lights for the hardware, and Security Advisor, which explains each recommended action ([storage overview](https://kb.synology.com/en-global/DSM/help/DSM/StorageManager/storage_overview?version=7), [Security Advisor](https://kb.synology.com/en-global/DSM/help/DSM/SecurityScan/securityscan_desc?version=7)).
- **Umbrel.** Disk health and "Live Usage" for each app ([umbrelOS](https://umbrel.com/umbrelos)).
- **Coolify and GitLab.** Data for each server, or HTTP endpoints (`/-/health`, `/-/readiness`) for monitoring tools; no page for a non-expert ([Sentinel](https://coolify.io/docs/core/observability/monitoring/sentinel) (search), [GitLab health check](https://docs.gitlab.com/administration/monitoring/health_check/)).

### 2.5 Notifications

| Product | Channels | Events | Setup | Sources |
|---|---|---|---|---|
| Synology | Email, push, webhooks (Teams and others), SMS | Update available, backup or restore failed, volume out of space, power failure | UI: Gmail or Outlook sign-in, or custom SMTP; "Send Test" for each channel; rules choose which events go to which recipient | [notifications](https://kb.synology.com/en-global/DSM/help/DSM/AdminCenter/system_notification_desc?version=7), [email](https://kb.synology.com/en-global/DSM/help/DSM/AdminCenter/system_notification_email?version=7) |
| Coolify | Email (SMTP or Resend), Slack, Discord, Telegram, Pushover, webhook | Backup success and failure, disk warning, server unreachable after two failed checks, deployments (search) | UI, "Send test" and an event list for each channel; a disk alert repeats at most once in 24 hours (search) | [notifications](https://coolify.io/docs/knowledge-base/notifications), [events](https://coolify.io/docs/core/notifications/events) |
| Vercel | Dashboard bell, email, push | Deployment failed, certificate renewal failed, domain misconfigured, usage limits | Each user chooses channels for each event; critical events cannot be turned off on all channels; no email for an item already read in the dashboard | [notifications](https://vercel.com/docs/notifications) |
| Home Assistant | Persistent notices, app push, SMTP integration (set in the UI) | Update and backup problems go to Repairs; email needs an automation | UI | [SMTP](https://www.home-assistant.io/integrations/smtp/), [notify](https://www.home-assistant.io/integrations/notify/) |
| GitLab Omnibus | SMTP for product email | No admin alert for a failed backup found | `gitlab.rb`; the test is a Rails console command | [SMTP](https://docs.gitlab.com/omnibus/settings/smtp/) |

### 2.6 Patterns

1. **The browser does the first run.** Home Assistant, Synology and Umbrel ask only a few questions in a browser wizard. Coolify needs one SSH command, then the browser. Only GitLab, which is for Linux administrators, has a configuration file and no wizard.
2. **Restore is on the first screen.** Home Assistant and Umbrel offer "restore a backup" in place of "new system". A lost machine comes back through the same wizard.
3. **Coolify's "first visitor becomes admin" is a risk to avoid.** A setup page on an open port belongs to whoever opens it first.
4. **Rollback usually means "restore the backup from before the update".** Home Assistant, GitLab and Coolify work this way; Synology has no rollback. A true rollback to a kept version exists in Umbrel (automatic after a failed update), the Home Assistant OS boot slots and Vercel. Vercel adds two things that matter: a verify step that says what does not go back, and a held state ("Undo Rollback") so that the next release does not replace the rollback at once.
5. **The user keeps the backup key, and the product makes this a step.** Home Assistant makes the user download an emergency kit during setup. Every product says that a lost key loses the data.
6. **A test of the backup is rare.** Only Synology has "Check backup integrity" in the UI. Coolify tells users to test a restore by hand.
7. **A problem list with fixes, not a log.** Home Assistant Repairs and Synology Security Advisor show each problem in plain words with the next step.
8. **Notifications are set up and tested in the UI.** Synology, Coolify and Vercel all have channels, a rule for each event and a "Send test" button. Repeat alerts are limited.
9. **Products for non-experts keep every routine task in the UI.** Home Assistant, Synology and Umbrel keep a terminal for experts only. GitLab and Coolify still need SSH to restore and to downgrade.

## 3. What FlowLeap has today

`flowleap-os` already does the hard parts that most of the five products do not. The gap is the surface: each step is a command on the host.

| Topic | What exists (2026-10-30) | Better than most products | The gap |
|---|---|---|---|
| First run | `install-remote.sh root@<host> --image stable` writes the template `firm.env` and stops (exit 3); the IT person edits 37 settings with `nano`, then runs the installer again; with Entra and Tailscale off, an SSH tunnel opens the launch link. The Tailscale auth key and the Entra secret go onto the host with `read -rsp` commands from the README. | Idempotent: a second run says "Nothing changed". No open port. | No wizard. Every setting is a hand edit, and nothing checks a key or a target before the run. |
| Updates | `update.sh` on a timer: the channel's release inside `UPDATE_WINDOW`, a `pre-update` backup first, the restart only when no turn runs, the health check, and an **automatic rollback** to the kept previous image, with a refused list. Status and history files. | A backup before every update and an automatic rollback: only Umbrel does both. | No UI. No manual rollback command. No "update now" button. Channel and window are `firm.env` edits. The control plane itself is not updated (#114). |
| Backups | restic 0.19.1, nightly, encrypted with `/etc/flowleap/backup.key`, kept `BACKUP_KEEP_DAYS` (30); SFTP or S3; `backup.sh status` and `snapshots`; `install.sh --restore` on a new host (proved: 1 min 39 s for 280 MiB, 20 min 31 s from a new VM to a passing case). | The restore of the whole host is proved. | No UI. The key is shown with `sudo cat`. An SFTP target needs `ssh-copy-id` on the host. No integrity check (`backup.sh` never runs `restic check`) and no test restore. |
| Health | `install.sh --health`: one `ok`, `WARN` or `FAIL` line for each part (runtimes, keys documents, sign-in proxy, starter, spawner, gateway, tailnet, disk, backup, updates), each `FAIL` with its fix. Disk guard every minute. | The lines already say the next step, as Repairs does. | Read over SSH only. #111 puts it on a page. |
| Notifications | None. No SMTP, webhook or push code in `flowleap-os`. Failures go to the journal and status files. | None | A failed backup, a failed rollback or a full disk is seen only when someone runs `--health`. |

### 3.1 Where the console (#34) already closes gaps

The agreed console gives the frame: a service at `https://<firm>/admin` behind the sign-in proxy, with no Docker access and no root, and a host-side **applier** that takes typed change requests, writes `firm.env` atomically and runs one narrow installer step. Keys go through a request file on tmpfs, never a log or an answer, and the applier tests a key before it saves it (#109). System status (#111) shows the update, backup, disk and health facts that the scripts record. All four tickets below use this frame and add no second path to the host.

The console design keeps "the update channel and window" out of v1. Ticket B below brings them in; that is a scope change for the founder to approve.

### 3.2 SSH steps that remain after #106 to #114

| Step | Today | After the console | Ticket here |
|---|---|---|---|
| First install and every first-run setting | SSH, `nano firm.env`, installer | Same | A |
| Entra app values and client secret | `firm.env` and `read -rsp` | Same | A |
| Rotate the Entra client secret (every 180 days) | SSH and the installer | Same | A (settings stay editable), D (warning before expiry) |
| Join the tailnet (auth key) | `read -rsp` on the host | Same | A |
| Backup target, SFTP key, backup key copy | `nano`, `ssh-copy-id`, `sudo cat` | Same | C |
| Update now, roll back, change channel or window | `update.sh run --now`; no rollback command; `nano` | Status only (#111) | B |
| See a failure without looking | `install.sh --health` | Visible when someone opens the page | D |
| Free disk space | `docker image ls` and `du` | Same | Later (see section 7) |
| Restore on a new host | `install-remote.sh --restore` with the key | Same | A (restore on the first screen) |

## 4. Design choices

### 4.1 How the browser reaches a new host

A new host has no sign-in proxy yet, and FlowLeap opens no port (the firm address is on the tailnet only). Three ways exist:

| Option | How | For | Against |
|---|---|---|---|
| 1. Tailnet first | The one install command asks for the Tailscale auth key in the terminal (it already can), joins, and prints `https://<name>.<tailnet>.ts.net/setup` and a one-time setup code. | No open port; the address is the final firm address; Entra redirect URI is known before the Entra step. | The firm needs a tailnet first. |
| 2. SSH tunnel | The install command prints `ssh -L …` and a setup code. | No tailnet needed. | A second SSH step; the redirect URI changes later. |
| 3. Open setup port | The installer opens a port for the wizard until setup ends. | Easiest. | An open port on a cloud host; the Coolify risk without the code. |

**Recommendation: option 1, with option 2 as the fallback.** The v1 scope already makes Tailscale the off-site access, so the firm needs the tailnet anyway. In both, the setup code from the terminal is the only key to the wizard (pattern 3), it expires when setup ends, and the wizard then hands over to the Entra sign-in. The one remaining terminal step is the install command itself, as in Coolify. In option 1 that command also asks for the Tailscale auth key.

### 4.2 Manual rollback and Session data

The harness gives no downgrade promise for released Session data: a predecessor version need not read what a newer version wrote (`AGENTS.md`, "Pre-stable APIs and released Session data"). The automatic rollback today runs minutes after the restart, before attorneys write much. A rollback button that the administrator presses days later is not the same. So the button offers "back to the previous version" only when the previous release reads the same Session format and SQLite schema as the installed one; the release record must carry these versions. Otherwise the console offers "restore the backup from before the update" and says how many hours of work the firm loses. This is the Home Assistant and GitLab pattern, with the Vercel verify step that says what does not go back.

### 4.3 Showing the backup key

The console design says the console never shows a stored value. The backup key is the exception that every product makes: the user must keep it, and setup makes that a step (pattern 5). **Recommendation:** a "recovery kit" (a file with the backup key, `BACKUP_REPOSITORY` and the target access) that the wizard requires the IT person to download once, before the first backup, and that the backups page can give again only after a new sign-in, with one change-log record. No other value is ever shown.

### 4.4 How email leaves the firm

Two ways: SMTP (the firm's own mail server or a relay), or Microsoft Graph `sendMail` with the firm's existing Entra app and a mailbox. Many Microsoft 365 tenants turn off SMTP AUTH, so SMTP alone can fail at an Entra firm; Graph needs the `Mail.Send` application permission and admin consent, which is a new grant. **Recommendation:** SMTP in the first ticket (the same form as Synology's custom SMTP, with "Send test"), and Graph as a later option when a pilot firm cannot use SMTP. The founder decides if Graph must come first.

## 5. What "done" looks like

The 30-minute goal becomes testable: a person who has not seen FlowLeap gets a fresh Ubuntu VM, the update key and this one page of instructions, and reaches a passing seam A case through the browser, with one terminal command. The restore proof of 2026-10-26 timed a restore in this way. The setup time today is not measured; the restore proof shows that the key hand-over by a person was the slowest part (13 of 20 minutes).

## 6. Tickets

Each ticket lives in `flowleap-ai/flowleap-harness`, with the work in `flowleap-os`, and uses the console frame of #106 (console service, applier, change log, 8 UI languages, seam B tests with a fake gateway and a temporary `firm.env`, live proof with the `flowleap-os` verify skill, each write on the test firm with the founder's typed permission).

### A. Setup wizard in the browser, #116

**What to build.** One install command (`curl … | sudo bash -s -- --update-key <key>`, or `install-remote.sh` for FlowLeap operators) installs Docker, pulls the release, starts the console in **setup mode**, and prints the setup address and a one-time setup code (section 4.1). The wizard asks, one page each, and tests each answer before the next page:

1. New firm, or **restore from a backup** (repository, recovery kit upload; then the same steps as `install.sh --restore`).
2. Firm name and the update key (tested against the registry).
3. A model key (tested as in #109) and the default model.
4. Microsoft Entra: the wizard shows the exact redirect URI and the permissions to grant, with copy buttons; the IT person enters the tenant ID, client ID, secret, the secret's end date and the sign-in domains; "Test sign-in" proves them before the page closes.
5. Backups: the target (S3 or SFTP; for SFTP the wizard shows the public key to add at the target), a connection test, then the **recovery kit download** (section 4.3), then the first backup.
6. A summary, then "Start the firm": the applier writes `firm.env` and runs the installer; the page shows each step and ends with the health check.

After setup, the code no longer works, the wizard is gone, and each value it set is a console setting (Entra secret rotation included).

**Acceptance criteria.**
- [ ] On a fresh VM, the only terminal step is the install command; the wizard reaches `Health check: PASS` and a signed-in attorney.
- [ ] Without the setup code the wizard refuses; after setup the code and the setup pages refuse.
- [ ] A wrong update key, model key, Entra value or backup target is refused on its page with the reason, and nothing is written.
- [ ] "Restore from a backup" on a fresh VM gives the same result as `install.sh --restore`.
- [ ] The Entra client secret can be replaced in the console after setup, with no SSH.
- [ ] Timed run by a person who has not installed FlowLeap: 30 minutes or less from a fresh VM to a passing seam A case.

**Blocked by:** #106, #109, #114 (the wizard is control-plane code that must reach firms).

### B. Update and rollback buttons in the console, #117

**What to build.** On the system page (#111): the installed release and its notes, the release available on the channel, the history from `history.log`, and three actions through the applier.

- **Update now:** the same run as `update.sh run --now` (backup first, wait for idle, check, automatic rollback). The page shows each step live.
- **Back to the previous version:** a new `update.sh rollback` that uses the kept previous image with the same checks, allowed only when the Session format and SQLite schema match (section 4.2); the verify step says what stays (settings, sessions) and what does not. After it, the channel is **held**: no automatic update until "Resume updates" (the Vercel "Undo Rollback").
- **Restore the backup from before the update:** when the versions differ; the page names the snapshot and the hours of work the firm loses, and asks for a typed confirmation.

Settings: the channel (`stable`, `current`, `off`) and the maintenance window, through the applier.

**Acceptance criteria.**
- [ ] "Update now" on the test firm updates, with a `pre-update` snapshot, and does not restart a runtime while a turn runs.
- [ ] "Back to the previous version" returns to the kept image, keeps every session, and holds the channel; "Resume updates" ends the hold.
- [ ] The rollback button is refused when the previous release has another Session format or schema version, and the page offers the restore.
- [ ] A failed update or a failed rollback shows on the page with its reason and time.
- [ ] Channel and window changes have the same result as a `firm.env` edit and an installer run.

**Blocked by:** #111, #114. **Scope change:** brings "the update channel and window" into #34.

### C. Backups page with a test restore, #118

**What to build.** A backups page: the target, the last result, the next run, the snapshots (time, tag, size), "Back up now", and settings (target, keep days, time) with a connection test. Two checks, on a schedule and on demand:

- **Integrity check:** `restic check` with a read of a part of the data (a weekly default as a `Config` setting).
- **Test restore:** the latest snapshot restored into a temporary folder on the host, compared with the backup manifest (every store present, the attorney volumes, a session log count for each attorney), then deleted. The applier refuses to start when free space is less than the snapshot size and a margin, as Home Assistant refuses a restore under 2 GB.

The page shows "Last tested restore: <date>, <result>", and the health check warns when no test restore passed in 30 days. The recovery kit download is here too (section 4.3).

**Acceptance criteria.**
- [ ] "Back up now" makes a snapshot with the tag `manual`, as `backup.sh run --tag manual`.
- [ ] The integrity check and the test restore run on schedule and on demand; each writes one journal line and a status file that #111 and ticket D read.
- [ ] A test restore of a damaged repository (seam B: a repository with a removed pack file) fails with the reason.
- [ ] The test restore never writes outside its temporary folder and removes it, also after a failure.
- [ ] The recovery kit needs a new sign-in and writes one change-log record.
- [ ] Changing the target to an SFTP or S3 target works with no SSH (the page shows the host's public key to add).

**Blocked by:** #106, #111.

### D. Notifications by email, #119

**What to build.** A notifications page: SMTP settings (host, port, TLS, user, password through the key request file of #109), the recipients (the administrators by default), a rule for each event, and "Send test". A host timer reads the status files that #111 already reads; no new status source.

Events, each with its fix in plain words and a link to the console page:

| Event | Source |
|---|---|
| Backup failed, or no good snapshot for 26 hours | backup status |
| Integrity check or test restore failed | ticket C status |
| Update rolled back; rollback failed (urgent) | update status |
| Health check `FAIL` | `install.sh --health` |
| Disk warning, disk low | disk guard |
| Provider key failing | the hourly key test of #109 |
| Entra client secret expires in 30 days, 7 days | the end date that the administrator enters with the secret (ticket A) |
| Firm budget at 80 % and 100 % | gateway policy |

One mail when a problem starts, at most one reminder each 24 hours, and one mail when it is solved. An urgent event cannot be turned off.

**Acceptance criteria.**
- [ ] "Send test" sends a mail through the firm's SMTP server; a wrong password shows the server's refusal.
- [ ] Seam B: each event in the table makes one mail to a fake SMTP server, a repeat within 24 hours makes none, and the solved state makes one.
- [ ] The SMTP password is never in a log, a mail or an answer.
- [ ] Live: a failed backup on the test firm (a wrong target, with the founder's permission) sends the mail.

**Blocked by:** #106, #111. **Open:** Microsoft Graph as a second way out (section 4.4).

### Order

A depends on #114 and is the largest. B, C and D each need only #106 and #111 (B also #114) and can run in parallel after them. Recommended order: D and C first (the firm learns of a failure, and trusts the backup), then B, then A. A has the largest effect on the first impression, but the pilot firm installs once and runs every day.

## 7. Not in these tickets

- **Disk clean-up in the UI** (remove old images, show what uses space). Smaller than the four; a later ticket.
- **A heartbeat at FlowLeap.** A dead host sends no mail. The registry sees each host's update check every 15 minutes, so FlowLeap support could see a silent host. This touches the self-hosted promise and needs a founder decision.
- **Webhooks, Teams and push.** The architecture already plans web push for the phone PWA (P5); Teams and webhooks wait for a pilot firm that asks.
- **Browser-only access without the Tailscale app** (`flowleap-os` `docs/browser-only-access.md`): not proved; it changes option 1 of section 4.1 when it lands.

## 8. Open decisions for the founder

1. How the browser reaches a new host (section 4.1). Recommendation: tailnet first, SSH tunnel as the fallback.
2. The recovery kit as the one exception to "never show a stored value" (section 4.3). Recommendation: yes, once at setup, again only after a new sign-in.
3. Channel and window into the console v1 (ticket B). Recommendation: yes.
4. SMTP first, Graph later (section 4.4). Recommendation: yes.
5. The order of the four tickets (section 6). Recommendation: D, C, B, A.
