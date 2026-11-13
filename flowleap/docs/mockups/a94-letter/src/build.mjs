// Builds the walkthrough of process sheet 9 (an Art. 94(3) letter arrives).
// Writes src/a94-letter.html (links the skill's records.css, for the design checks) and
// ../a94-letter-walkthrough.html (the same page with the client theme, the CSS and the scripts inline: one file that
// opens with no server). Edit this file, data.mjs, a94-letter.css or walk.js, then run: node build.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { claimHits, docs, items, matter, people } from './data.mjs'
import pages from './letter-pages.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../../../../..')
const skill = join(root, '.agents/skills/flowleap-design-language/references/mockups')
const esc = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

// ---------- parts ----------
const st = (machine, state, shape, word) => `<span class="status" data-atlas="${machine}.${state}"><span class="st" data-s="${shape}"></span>${word}</span>`
const pill = (machine, state, shape, word) => `<span class="pill ${shape}" data-atlas="${machine}.${state}"><span class="st" data-s="${shape}"></span>${word}</span>`
const btn = (cls, label, { i = '', walk = '', kbd = '', off = false, act = '' } = {}) =>
  `<span class="btn ${cls}"${i ? ` data-i="${i}"` : ''}${act ? ` data-act="${act}"` : ''}${walk ? ` data-walk="${walk}"` : ''} role="button"${off ? ' aria-disabled="true"' : ''}>${label}${kbd ? ` <span class="kbd">${kbd}</span>` : ''}</span>`
const kbds = keys => `<span class="kbds">${keys.map(k => `<span class="kbd">${k}</span>`).join('')}</span>`
const av = p => `<span class="av">${people[p].av}</span>`
const ref = (page, quote, walk = '') => `<span class="pref"${walk ? ` data-walk="${walk}"` : ''} role="button" title="${esc(quote)}"><span class="q" data-verbatim>${esc(quote.split(' ').slice(0, 2).join(' '))}</span><span class="pg">p. ${page}</span></span>`

function sidebar(who, active) {
  const p = people[who]
  const item = (k, icon, label) => `<div class="sb-item${active === k ? ' is-active' : ''}" data-i="${icon}"><span>${label}</span></div>`
  return `<nav class="sidebar" data-nav="${active}">
    <div class="sb-brand"><span data-logo></span><span>FlowLeap Patent AI</span></div>
    <div class="sb-me">${av(who)}<span><span class="nm">${p.name}</span><span class="rl">${p.role}</span></span></div>
    <div class="sb-label">Work</div>
    ${item('mywork', 'mywork', 'My work')}${item('office', 'office', 'Office actions')}${item('matters', 'matters', 'Matters')}
    <div class="sb-label">Firm</div>
    ${item('clients', 'folder', 'Clients')}
    <div class="sb-label">Agent</div>
    ${item('chats', 'chats', 'Chats')}
  </nav>`
}

function letterPane(page, quote, label = 'Letter') {
  const body = pages.map((paras, i) => {
    const n = i + 1
    const html = paras.map(t => {
      let s = esc(t)
      if (n === page && quote && t.includes(quote)) s = s.replace(esc(quote), `<mark class="hl" data-mark>${esc(quote)}</mark>`)
      return `<p>${s}</p>`
    }).join('')
    return `<div class="lpage"><div class="paper-cap"><span>Page ${n} of 11</span><span>${n <= 2 ? 'Communication' : 'Annex, reasons'}</span></div><div class="letter" data-verbatim>${html}</div></div>`
  }).join('')
  return `<aside class="lpane" aria-label="${label}"><div class="lpane-h"><span class="strong">${label}</span><span class="muted">11 pages · German · from MyEPO</span><span class="spacer"></span><span class="btn btn-ghost" data-i="expand" data-act="open-letter" role="button">Open the letter <span class="kbd">O</span></span></div><div class="lpane-s">${body}</div></aside>`
}

function scanPane() {
  const body = pages.slice(0, 3).map((paras, i) => `<div class="lpage"><div class="paper-cap"><span>Page image ${i + 1} of 11</span><span>Scan, no text</span></div><div class="letter scan" data-verbatim>${paras.map(t => `<p>${esc(t)}</p>`).join('')}</div></div>`).join('')
  return `<aside class="lpane" aria-label="Letter"><div class="lpane-h"><span class="strong">Letter</span><span class="muted">11 page images · from scan-to-email</span></div><div class="lpane-s">${body}</div></aside>`
}

function topbar(crumb, right = '') {
  return `<header class="topbar"><div class="crumbs"><span class="ico hide-sm" data-i="matters"></span><span class="hide-sm">Matters</span><span class="sep hide-sm">›</span><span class="key hide-sm">${matter.key}</span><span class="sep hide-sm">›</span><span class="here">${crumb}</span></div><div class="bar-right">${right}<span class="btn btn-secondary only-narrow" data-i="doc" data-act="open-letter" role="button">Show letter <span class="kbd">O</span></span><span class="iconbtn" data-i="dots" aria-label="More"></span></div></header>`
}

function header(status, lede) {
  return `<div class="eyebrow">${status}</div>
  <h1 class="title">${matter.letter}</h1>
  <p class="lede">${lede}</p>
  <div class="people"><span class="pk">Matter</span><span>${matter.key} · ${matter.client}</span><span class="pk">Application</span><span class="num">${matter.app}</span><span class="pk">Responsible</span><span class="who">${av('jonas')}Jonas Weber</span><span class="pk">Formalities</span><span class="who">${av('sabine')}Sabine Wolf</span></div>`
}

const keyfact = (state, line) => `<div class="kf"><div class="kf-l">Deadline to reply</div><div class="kf-d num">18 Jan 2027</div><div class="kf-s">${state}<span class="muted">${line}</span></div></div>`

function reviews(rows) {
  return `<div class="section"><div class="section-h"><h2>Reviews</h2></div><div class="revs">${rows.map(([what, status, who, note]) => `<div class="rev"><span class="w">${what}</span>${status}<span class="who">${who ? `${av(who)}${people[who].name}` : ''}</span><span class="muted n">${note}</span></div>`).join('')}</div></div>`
}

const laterPlaces = () => `<div class="section later"><div class="section-h"><h2>Other offices</h2><span class="tag">Later</span></div><p class="muted">What other offices said about this family, for EP and US. This place is kept; it is not designed yet.</p></div>
<div class="section later"><div class="section-h"><h2>Reply</h2><span class="tag">Later</span></div><p class="muted">The reply draft and the client report. This place is kept; it is not designed yet.</p></div>`

function activity(lines) {
  return `<div class="activity"><div class="section-h"><h2>Activity</h2><div class="right"><span class="btn btn-ghost" data-i="doc" role="button">Record log</span></div></div>${lines.map(([who, text, t]) => {
    const sys = !people[who]
    return `<div class="ev${sys ? '' : ' person'}"><span class="ico">${sys ? `<span class="av sys" data-i="${who}"></span>` : `<span class="av av-lg">${people[who].av}</span>`}</span><div class="txt"><b>${sys ? 'FlowLeap' : people[who].name}</b> ${text}<span class="t">${t}</span></div></div>`
  }).join('')}</div>`
}

const ACT_BASE = [
  ['inbox', 'filed the letter from MyEPO on this matter by its application number', '07:02'],
  ['sparkle', 'read the period of 4 months on page 1', '07:02'],
  ['calendar', 'proposed the deadline 18 Jan 2027 and gave it to Sabine Wolf to confirm', '07:02'],
  ['bot', 'read the letter for Jonas Weber: 5 objections, 5 cited documents', '07:05'],
]

// ---------- the deadline section ----------
function deadlineSection({ mode }) {
  // mode: confirm (Sabine's form), active (confirmed), scanConfirm (Tobias's form), summary (one line in Jonas's view)
  const scan = mode === 'scanConfirm'
  const facts = scan
    ? [['Rule', 'Art. 94(3) EPC, period from the letter (Rule 132 EPC)'], ['Letter type and date', 'Entered by Sabine Wolf from the page image: 18 Sep 2026'],
      ['Period', 'Entered by Sabine Wolf from page 1: 4 months'], ['Computed', '18 Sep 2026 + 4 months = Monday, 18 Jan 2027'], ['Internal date', '18 Dec 2026 (your firm sets one month)']]
    : [['Rule', 'Art. 94(3) EPC, period from the letter (Rule 132 EPC)'], ['Letter type and date', 'From the MyEPO list: Art. 94(3) communication of 18 Sep 2026'],
      ['Period', `FlowLeap read 4 months on page 1 ${ref(1, 'von 4 Monaten', 'period')}`], ['Computed', '18 Sep 2026 + 4 months = Monday, 18 Jan 2027'], ['Internal date', '18 Dec 2026 (your firm sets one month)']]
  const who = scan
    ? '<div class="notice" data-i="info"><span><span class="lead">Sabine Wolf made this deadline\'s evidence, so a colleague confirms.</span> You made none of it, so you may confirm.</span></div>'
    : mode === 'confirm' ? '<div class="notice" data-i="info"><span><span class="lead">You may confirm.</span> You made none of this deadline\'s evidence: FlowLeap read the type, the date and the period.</span></div>' : ''
  const status = mode === 'active' ? st('deadline', 'active', 'ok', 'Active') : st('deadline', 'deadline_proposed', 'wait', 'Deadline proposed')
  return `<div class="section" id="deadline"><div class="section-h"><h2>Deadline</h2>${status}${mode === 'active' ? '<span class="muted">Confirmed by Sabine Wolf at 08:14</span>' : ''}</div>
  <div class="dprops">${facts.map(([k, v]) => `<div class="dprop"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('')}</div>${who}</div>`
}

// ---------- the reading ----------
function objectionRows({ marks = {}, open = null, keysOn = null, warn = true, carried = {} }) {
  return `<div class="otbl"><div class="thead"><span>#</span><span>Objection</span><span>Passage</span><span class="end">Review</span></div>
  ${items.map(it => {
    const m = marks[it.n]
    const claims = m === 'corrected' ? `${it.fixed}` : it.claims
    const showWarn = warn && it.fixed && m !== 'corrected'
    const markCell = m === 'accepted' ? st('readingItem', 'accepted', 'ok', carried[it.n] ? 'Accepted in reading 1' : 'Accepted')
      : m === 'corrected' ? st('readingItem', 'corrected', 'ok', 'Corrected')
      : m === 'rejected' ? st('readingItem', 'rejected', 'bad', 'Rejected')
      : m === 'dim' ? '<span class="muted">Kept in the record</span>'
      : `<span class="seg" role="group" aria-label="Review item ${it.n}"><span data-walk="accept-${it.n}"${keysOn === it.n ? ' data-act="accept"' : ''} role="button">Accept${keysOn === it.n ? ' <span class="kbd">1</span>' : ''}</span><span data-walk="correct-${it.n}" role="button">Correct</span><span data-walk="reject-${it.n}"${keysOn === it.n ? ' data-act="reject"' : ''} role="button">Reject${keysOn === it.n ? ' <span class="kbd">2</span>' : ''}</span></span>`
    const row = `<div class="orow${open === it.n ? ' is-open' : ''}${showWarn ? ' has-warn' : ''}"><span class="num">${it.n}</span><span><span class="g">${it.ground}</span><span class="sub">Claims <span class="num${m === 'corrected' ? ' changed' : ''}">${claims}</span> · ${it.docs === 'none' ? 'no document' : it.docs}</span></span><span>${ref(it.page, it.quote, `quote-${it.n}`)}</span><span class="end">${markCell}</span></div>`
    const warnLine = showWarn ? `<div class="owarn" data-i="warn">Claims ${it.claims} differ from the passage: <q data-verbatim>Ansprüche 2-15</q>. Correct the claims, or accept with a reason.</div>` : ''
    const detail = open === it.n ? correctForm(it) : ''
    return row + warnLine + detail
  }).join('')}</div>`
}

function correctForm(it) {
  return `<div class="ocorrect"><p class="muted">${it.reasoning}</p>
  <div class="excerpt"><div class="cap"><span>Letter, page ${it.page}</span><span>Exact passage</span></div><div class="page" data-verbatim><mark class="hl">${esc(it.quote)}</mark> scheinen keine zusätzlichen Merkmale zu enthalten …</div></div>
  <div class="cform"><label><span class="k">Field</span><input class="fld" readonly value="Claims"></label><label><span class="k">FlowLeap read</span><input class="fld ro num" readonly value="${it.claims}"></label><label><span class="k">Correct value</span><input class="fld num on" readonly value="${it.fixed}"></label><label class="wide"><span class="k">Reason</span><input class="fld on" readonly value="The passage says “Ansprüche 2-15”; claim 15 is part of this objection."></label></div>
  <div class="cacts">${btn('btn-ghost', 'Cancel')}${btn('btn-primary', 'Save correction', { walk: 'save' })}</div></div>`
}

function docsTable() {
  return `<div class="dtbl"><div class="thead"><span>Label</span><span>Publication</span><span>Date</span><span>Cited on</span><span>Used by objections</span></div>
  ${docs.map(d => `<div class="drow"><span class="strong">${d.d}</span><span class="num">${d.pub}${d.note ? ` <span class="tag">${d.note}</span>` : ''}</span><span class="num">${d.date}</span><span>${ref(d.page, d.quote)}</span><span class="num">${d.used}</span></div>`).join('')}</div>
  <div class="section-h sub"><h2>Claims</h2><span class="count">15</span></div>
  <div class="claims">${claimHits.map(h => `<span class="cl" title="Objections ${h.by}"><span class="c num">${h.c}</span><span class="b num">${h.by}</span></span>`).join('')}</div>
  <p class="muted">Each claim with the objections that name it. No claim is without an objection.</p>`
}

const stepsLine = n => `<div class="steps-line">${['Objections', 'Cited documents', 'Review'].map((s, i) => i + 1 < n ? `<span class="done" data-i="check">${s}</span>` : i + 1 === n ? `<span class="on">${i + 1} ${s}</span>` : `<span>${i + 1} ${s}</span>`).join('')}</div>`

function reviewStep({ checked }) {
  const rows = items.map(it => `<div class="rrow"><span class="num">${it.n}</span><span>${it.ground}</span>${it.fixed ? st('readingItem', 'corrected', 'ok', 'Corrected') : st('readingItem', 'accepted', 'ok', 'Accepted')}<span class="muted">${it.fixed ? `Claims ${it.claims} → ${it.fixed}` : ''}</span>${btn('btn-ghost btn-sm', 'Edit')}</div>`).join('')
  return `<div class="rv"><h3 class="sub-h">Your marks</h3>${rows}
  <h3 class="sub-h">Deadline</h3>
  <div class="rrow dl"><span data-i="calendar"></span><span class="num strong">18 Jan 2027</span>${st('deadline', 'active', 'ok', 'Active')}<span class="muted">Confirmed by Sabine Wolf</span></div>
  <label class="check-line${checked ? ' on' : ''}" data-walk="check"><span class="box" data-i="${checked ? 'check' : ''}"></span><span>I checked this date against the letter</span>${ref(1, 'von 4 Monaten')}</label>
  <p class="muted">Your check is recorded with your decision. It does not confirm the deadline; Sabine Wolf did that.</p>
  <h3 class="sub-h">Later</h3><p class="muted">Client report and reply: not part of this review.</p></div>`
}

function footer({ left, buttons, more = false }) {
  return `<div class="wfoot"><span class="wf-l">${left}</span><span class="wf-r">${more ? `<span class="iconbtn" data-i="dots" data-walk="more" role="button" aria-label="More review acts"></span>` : ''}${buttons}</span></div>`
}

// ---------- screens ----------
function board({ who, crumbStatus, lede, kf, revs, body, foot = '', pane, act = [] }) {
  return `${sidebar(who, 'office')}
  <main class="main"><section class="panel fixed">${topbar(matter.letter)}
  <div class="board"><div class="work"><div class="work-scroll">${header(crumbStatus, lede)}${kf}${revs}${body}${activity([...ACT_BASE, ...act])}</div>${foot}</div>${pane}</div>
  </section></main>`
}

function myWork(who, { title, lede, rows, moved = '' }) {
  return `${sidebar(who, 'mywork')}
  <main class="main"><section class="panel fixed"><header class="topbar"><div class="crumbs"><span class="ico" data-i="mywork"></span><span class="here">My work</span></div><div class="bar-right"><span class="btn btn-ghost" data-i="search" data-act="find" role="button">Find a matter <span class="kbd">/</span></span></div></header>
  <div class="list-pane"><div class="mw-head"><h1 class="title">${title}</h1><p class="lede">${lede}</p></div>
  <div class="list mwl" data-list="my-work"><div class="thead"><span>Task</span><span>Status</span><span>Matter</span><span>Client</span><span class="end">Legal date</span></div>${rows}</div>${moved}</div></section></main>`
}

const mwRow = ({ task, note, status, legal = '18 Jan 2027', walk = 'row' }) => `<div class="row" data-walk="${walk}" role="button"><span class="t"><span class="task">${task}</span><span class="muted">${note}</span></span>${status}<span class="m num">${matter.key}</span><span class="m">Wago</span><span class="r num">${legal}</span></div>`
const group = (icon, label, n) => `<div class="group"><span class="gi" data-i="${icon}"></span>${label}<span class="count">${n}</span></div>`

const S = {}
const ready = (n = 0) => st('reading', n ? 'in_review' : 'proposed', 'wait', n ? `In review · ${n} of 5` : 'Ready for review')
const dlActive = st('deadline', 'active', 'ok', 'Active')
const dlProposed = st('deadline', 'deadline_proposed', 'wait', 'Deadline proposed')
const workWaits = pill('ticket', 'proposals_ready', 'wait', 'Proposals ready')

// Main path, the formalities person.
S['sabine-mywork'] = myWork('sabine', { title: '1 letter arrived, 1 needs you', lede: 'Friday, 13 November · 1 due today',
  rows: group('today', 'Today', 1) + mwRow({ task: 'Confirm the deadline', note: 'Art. 94(3) EPC · period read on page 1', status: dlProposed }) })
const sabineBoard = (mode, extra = '') => board({
  who: 'sabine', crumbStatus: workWaits, lede: 'The examining division raises 5 objections against claims 1 to 15 and cites D1 to D5. FlowLeap read the letter and proposed the deadline.',
  kf: keyfact(mode === 'active' ? dlActive : dlProposed, mode === 'active' ? ' · confirmed by Sabine Wolf' : ' · 4 months from 18 Sep 2026'),
  revs: reviews([['Deadline', mode === 'active' ? dlActive : dlProposed, 'sabine', mode === 'active' ? 'Done' : 'Waits for you'], ['Reading', ready(), 'jonas', '5 objections · waits for Jonas Weber']]),
  body: extra + deadlineSection({ mode }) + laterPlaces(),
  foot: mode === 'confirm' ? footer({ left: 'Confirm makes the deadline active. Nothing is recorded before.', buttons: btn('btn-ghost', 'Reject…', { kbd: '2', act: 'reject' }) + btn('btn-primary btn-lg', 'Confirm deadline', { walk: 'confirm', kbd: '⇧⌘↵', act: 'record' }) }) : '',
  pane: letterPane(1, 'von 4 Monaten'),
  act: mode === 'active' ? [['sabine', 'confirmed the deadline 18 Jan 2027', '08:14']] : [],
})
S['sabine-deadline'] = sabineBoard('confirm')
S['sabine-done'] = sabineBoard('active', '<div class="notice ok" data-i="check"><span><span class="lead">Deadline confirmed.</span> Nothing else on this letter waits for you. The reading waits for Jonas Weber.</span></div>')

// Main path, the attorney.
S['jonas-mywork'] = myWork('jonas', { title: '1 letter read, 1 needs you', lede: 'Friday, 13 November · 1 due today',
  rows: group('today', 'Today', 1) + mwRow({ task: 'Review the reading', note: 'Art. 94(3) EPC · 5 objections · deadline active', status: st('reading', 'proposed', 'wait', 'Ready for review') }) })

const jonasRevs = (readingStatus, note) => reviews([['Deadline', dlActive, 'sabine', 'Confirmed at 08:14'], ['Reading', readingStatus, 'jonas', note]])
function jonasBoard({ step = 1, marks = {}, open = null, keysOn = 1, pane = [3, items[0].quote], left, next = false, more = true, body, readingStatus, note, act = [], banner = '', primary }) {
  const n = Object.keys(marks).length
  const stepBody = body ?? (step === 1 ? objectionRows({ marks, open, keysOn }) : step === 2 ? docsTable() : '')
  const nextBtn = primary ?? btn('btn-primary btn-lg', step === 3 ? 'Accept the reading' : 'Next', { walk: 'next', off: !next, kbd: step === 3 ? '⇧⌘↵' : '', act: step === 3 ? 'record' : '' })
  return board({
    who: 'jonas', crumbStatus: workWaits, lede: 'The examining division raises 5 objections against claims 1 to 15 and cites D1 to D5. Your review marks each objection; each mark is saved at once.',
    kf: keyfact(dlActive, ' · confirmed by Sabine Wolf'),
    revs: jonasRevs(readingStatus ?? ready(n), note ?? `${n} of 5 reviewed`),
    body: `<div class="section" id="reading"><div class="section-h"><h2>Reading</h2><span class="muted">By FlowLeap for Jonas Weber, 07:05 · in German, the language of the letter</span></div>${banner}${stepsLine(step)}${stepBody}</div>` + laterPlaces(),
    foot: footer({ left: left ?? `${n} of 5 reviewed · saved · not accepted yet`, more, buttons: btn('btn-ghost', 'Back', { off: step === 1 }) + btn('btn-ghost', 'Cancel review') + nextBtn }),
    pane: letterPane(...pane), act,
  })
}
const four = { 1: 'accepted', 2: 'accepted', 4: 'accepted', 5: 'accepted' }
const all = { ...four, 3: 'corrected' }
const markAct = [['jonas', 'accepted objections 1, 2, 4 and 5', '09:31']]
S['jonas-board'] = jonasBoard({})
S['jonas-quote'] = jonasBoard({ pane: [3, items[0].quote] })
S['jonas-marked'] = jonasBoard({ marks: four, keysOn: 3, pane: [8, items[2].quote], act: markAct })
S['jonas-correct'] = jonasBoard({ marks: four, open: 3, keysOn: null, pane: [8, items[2].quote], act: markAct })
S['jonas-allmarked'] = jonasBoard({ marks: all, next: true, pane: [8, items[2].quote], act: [...markAct, ['jonas', 'corrected the claims of objection 3 from 2–14 to 2–15', '09:33']] })
S['jonas-docs'] = jonasBoard({ step: 2, marks: all, next: true, pane: [3, docs[2].quote], left: '5 of 5 reviewed · saved · not accepted yet', act: [...markAct, ['jonas', 'corrected the claims of objection 3 from 2–14 to 2–15', '09:33']] })
const reviewAct = [...markAct, ['jonas', 'corrected the claims of objection 3 from 2–14 to 2–15', '09:33']]
S['jonas-review'] = jonasBoard({ step: 3, marks: all, body: reviewStep({ checked: false }), pane: [1, 'von 4 Monaten'], left: 'Check the deadline to accept', act: reviewAct })
S['jonas-review-checked'] = jonasBoard({ step: 3, marks: all, next: true, body: reviewStep({ checked: true }), pane: [1, 'von 4 Monaten'], left: 'Ready · 4 accepted, 1 corrected', act: reviewAct })
S['jonas-done'] = board({
  who: 'jonas', crumbStatus: pill('ticket', 'decided', 'ok', 'Decided'), lede: 'All decided. The deadline is active and the reading is accepted. The reply and the client report come later.',
  kf: keyfact(dlActive, ' · confirmed by Sabine Wolf · checked by Jonas Weber'),
  revs: reviews([['Deadline', dlActive, 'sabine', 'Confirmed at 08:14 · checked by Jonas Weber'], ['Reading', st('reading', 'accepted', 'ok', 'Accepted'), 'jonas', '4 accepted, 1 corrected']]),
  body: `<div class="notice ok" data-i="check"><span><span class="lead">Reading accepted.</span> Nothing on this letter waits for a person now.</span></div><div class="section"><div class="section-h"><h2>Objections</h2><span class="count">5</span></div>${objectionRows({ marks: all, warn: false })}</div>` + laterPlaces(),
  pane: letterPane(8, items[2].quote), act: [...reviewAct, ['jonas', 'accepted the reading and checked the deadline 18 Jan 2027', '09:36']],
})

// New reading path.
const rerunForm = `<div class="ask"><h3 class="sub-h">Ask for a new reading</h3><p class="muted">FlowLeap reads the letter again with your reason. Your marks stay in the record; a mark carries over to an item that is the same in the new reading.</p>
<label class="cform one"><span class="k">What is wrong?</span><textarea class="fld on tall" readonly rows="2">Objection 3 lists claims 2 to 14; the letter says 2-15. Check the claim numbers of every objection against its passage.</textarea></label>
<div class="cacts">${btn('btn-ghost', 'Cancel')}${btn('btn-primary', 'Ask for a new reading', { walk: 'ask' })}</div></div>`
S['rerun-ask'] = jonasBoard({ marks: { 1: 'accepted' }, body: rerunForm + objectionRows({ marks: { 1: 'accepted' }, keysOn: null }), pane: [8, items[2].quote], more: false, primary: btn('btn-primary btn-lg', 'Next', { off: true }) })
S['rerun-running'] = jonasBoard({ marks: { 1: 'accepted' }, readingStatus: st('reading', 'rerun_requested', 'run', 'New reading requested'), note: 'FlowLeap reads the letter again',
  body: `<div class="notice" data-i="retry"><span><span class="lead">FlowLeap reads the letter again.</span> This takes about 2 minutes. You can leave this page; My work shows the task when the new reading is ready.</span></div>` + objectionRows({ marks: { 1: 'dim', 2: 'dim', 3: 'dim', 4: 'dim', 5: 'dim' }, warn: false }),
  left: 'Waits for the new reading', more: false, primary: btn('btn-primary btn-lg', 'Next', { off: true }), act: [['jonas', 'asked for a new reading: objection 3 lists claims 2 to 14; the letter says 2-15', '09:32']] })
const r2Items = { 1: 'accepted' }
S['rerun-ready'] = jonasBoard({ marks: r2Items, keysOn: 3, readingStatus: ready(1), note: 'Reading 2 · 1 of 5 reviewed',
  banner: `<div class="notice" data-i="info"><span><span class="lead">Reading 2.</span> Reading 1 was replaced: "Objection 3 lists claims 2 to 14; the letter says 2-15." Your mark on objection 1 carried over, because the item is the same. <span class="lnk">Show reading 1</span></span></div>`,
  body: undefined, pane: [8, items[2].quote], act: [['jonas', 'asked for a new reading: objection 3 lists claims 2 to 14; the letter says 2-15', '09:32'], ['bot', 'read the letter again: 5 objections; objection 3 now names claims 2–15', '09:34']] })
// In reading 2 the agent reads claims 2–15, so objection 3 has no warning.
S['rerun-ready'] = S['rerun-ready'].replace('<span class="num">2–14</span>', '<span class="num">2–15</span>').replace(/<div class="owarn"[^]*?<\/div>/, '').replace('has-warn', '')

// Reject path.
const rejectForm = `<div class="ask"><h3 class="sub-h">Reject the reading</h3>
<div class="opts"><label class="opt"><span class="radio"></span><span><span class="strong">Ask for a new reading</span><span class="muted">FlowLeap reads the letter again with your reason. Recommended for a reading that is wrong as a whole.</span></span></label>
<label class="opt on"><span class="radio on"></span><span><span class="strong">Reject and work without a reading</span><span class="muted">The reading goes; you work on the letter by hand. The record keeps the reading and your reason.</span></span></label></div>
<label class="cform one"><span class="k">Reason</span><textarea class="fld on tall" readonly rows="2">The client asked us to handle this family by hand.</textarea></label>
<div class="cacts">${btn('btn-ghost', 'Cancel')}${btn('btn-primary', 'Reject the reading', { walk: 'reject' })}</div></div>`
S['reject-form'] = jonasBoard({ body: rejectForm, pane: [3, items[0].quote], more: false, primary: btn('btn-primary btn-lg', 'Next', { off: true }) })
S['reject-done'] = board({
  who: 'jonas', crumbStatus: pill('ticket', 'by_hand', 'idle', 'By hand'), lede: 'You rejected the reading and work on the letter by hand. The deadline stays active.',
  kf: keyfact(dlActive, ' · confirmed by Sabine Wolf'),
  revs: reviews([['Deadline', dlActive, 'sabine', 'Confirmed at 08:14'], ['Reading', st('reading', 'rejected', 'bad', 'Rejected'), 'jonas', 'The client asked us to handle this family by hand']]),
  body: '<div class="notice" data-i="info"><span><span class="lead">Reading rejected.</span> The record keeps it with your reason. Your task "Do this work by hand" is in My work, due on the internal date 18 Dec 2026.</span></div>' + laterPlaces(),
  pane: letterPane(1, 'von 4 Monaten'), act: [['jonas', 'rejected the reading: the client asked us to handle this family by hand', '09:31']],
})

// The task moved.
const movedBlock = (taken) => taken ? '' : `<div class="moved"><div class="mv-h"><span data-i="split"></span><span class="strong">Moved to others</span><span class="count">1</span><span class="muted">Your tasks since Friday that another person has now</span></div>
<div class="mvrow"><span class="t"><span class="task">Review the reading</span><span class="muted">${matter.key} · Art. 94(3) EPC</span></span><span class="who">${av('lena')}Lena Hoffmann has it since 08:00</span><span class="muted">The decide-by time passed while you were absent</span>${btn('btn-secondary', 'Take back', { walk: 'take' })}</div></div>`
S['moved-jonas'] = myWork('jonas', { title: 'Nothing needs you now', lede: 'Monday, 16 November · 1 task moved to a colleague',
  rows: '<div class="empty-row muted">Tasks that wait for you show here, by due time.</div>', moved: movedBlock(false) })
S['moved-taken'] = myWork('jonas', { title: '1 needs you', lede: 'Monday, 16 November · 1 due today',
  rows: group('today', 'Today', 1) + mwRow({ task: 'Review the reading', note: 'Art. 94(3) EPC · taken back from Lena Hoffmann', status: st('reading', 'proposed', 'wait', 'Ready for review'), walk: 'row2' }),
  moved: '<div class="notice" data-i="check"><span><span class="lead">You took the task back.</span> Lena Hoffmann sees it under Moved to others. Tasks move only in working hours, 08:00 to 18:00.</span></div>' })

// Scan path.
S['scan-mywork'] = myWork('sabine', { title: '1 letter arrived, 1 needs you', lede: 'Friday, 13 November · 1 due today',
  rows: group('today', 'Today', 1) + `<div class="row" data-walk="row" role="button"><span class="t"><span class="task">File this letter</span><span class="muted">Scan · 11 pages · from scan-to-email · 09:12</span></span>${st('intake', 'unreadable', 'wait', 'Unreadable')}<span class="m">No matter yet</span><span class="m">Not known</span><span class="r">None yet</span></div>` })
const scanForm = `<div class="section"><div class="section-h"><h2>File this letter</h2>${st('intake', 'unreadable', 'wait', 'Unreadable')}<span class="muted">A scan with no text: you enter what the page images say</span></div>
<div class="cform grid"><label><span class="k">Matter</span><input class="fld on" readonly value="${matter.key} · ${matter.app}"></label><label><span class="k">Letter type</span><input class="fld on" readonly value="Art. 94(3) communication"></label>
<label><span class="k">Date the letter bears</span><input class="fld on num" readonly value="18 Sep 2026"></label><label><span class="k">Period, as page 1 says</span><input class="fld on" readonly value="4 months"></label></div>
<p class="muted">You enter the type, the date and the period, so a colleague confirms the deadline. FlowLeap cannot quote a scan, so there is no reading.</p></div>`
S['scan-file'] = `${sidebar('sabine', 'mywork')}<main class="main"><section class="panel fixed"><header class="topbar"><div class="crumbs"><span class="ico" data-i="mywork"></span><span class="hide-sm">My work</span><span class="sep hide-sm">›</span><span class="here">Scan of 13 Nov 2026, 09:12</span></div><div class="bar-right"><span class="iconbtn" data-i="dots" aria-label="More"></span></div></header>
<div class="board"><div class="work"><div class="work-scroll"><div class="eyebrow">${pill('intake', 'unreadable', 'wait', 'Unreadable')}</div><h1 class="title">Scan of 13 Nov 2026, 09:12</h1><p class="lede">11 pages from scan-to-email. The scan has no text layer.</p>${scanForm}</div>
${footer({ left: 'Filing records the office event with your name.', buttons: btn('btn-ghost', 'Not relevant…', { kbd: '2', act: 'reject' }) + btn('btn-primary btn-lg', 'File letter', { walk: 'file', kbd: '⇧⌘↵', act: 'record' }) })}</div>${scanPane()}</div></section></main>`
S['scan-tobias'] = myWork('tobias', { title: '1 needs you', lede: 'Friday, 13 November · 1 due today',
  rows: group('today', 'Today', 1) + mwRow({ task: 'Confirm the deadline', note: 'Art. 94(3) EPC · period entered by Sabine Wolf', status: dlProposed }) })
S['scan-confirm'] = board({
  who: 'tobias', crumbStatus: pill('ticket', 'by_hand', 'idle', 'By hand'), lede: 'A scan with no text. Sabine Wolf filed it and entered the type, the date and the period.',
  kf: keyfact(dlProposed, ' · 4 months from 18 Sep 2026'),
  revs: reviews([['Deadline', dlProposed, 'tobias', 'Waits for you'], ['Reading', st('ticket', 'by_hand', 'idle', 'By hand'), 'jonas', 'No reading: a scan']]),
  body: deadlineSection({ mode: 'scanConfirm' }) + laterPlaces(),
  foot: footer({ left: 'Confirm makes the deadline active. Nothing is recorded before.', buttons: btn('btn-ghost', 'Reject…', { kbd: '2', act: 'reject' }) + btn('btn-primary btn-lg', 'Confirm deadline', { walk: 'confirm', kbd: '⇧⌘↵', act: 'record' }) }),
  pane: scanPane(), act: [['sabine', 'filed the scan and entered the Art. 94(3) communication of 18 Sep 2026 with a period of 4 months', '09:20'], ['calendar', 'proposed the deadline 18 Jan 2027 and gave it to Tobias Schmitt to confirm', '09:20']],
})
// The board's Activity starts with the MyEPO lines; the scan came another way.
S['scan-confirm'] = S['scan-confirm'].replace(/<div class="ev"><span class="ico"><span class="av sys" data-i="inbox">[^]*?read the letter for Jonas Weber[^]*?<\/div><\/div>/, '')
S['scan-jonas'] = board({
  who: 'jonas', crumbStatus: pill('ticket', 'by_hand', 'idle', 'By hand'), lede: 'A scan with no text, filed by Sabine Wolf. The deadline is active.',
  kf: keyfact(dlActive, ' · confirmed by Tobias Schmitt'),
  revs: reviews([['Deadline', dlActive, 'tobias', 'Confirmed at 09:41'], ['Reading', st('ticket', 'by_hand', 'idle', 'By hand'), 'jonas', 'No reading: a scan']]),
  body: '<div class="section"><div class="section-h"><h2>Reading</h2></div><div class="notice" data-i="info"><span><span class="lead">No reading: this letter is a scan with no text, so FlowLeap cannot quote it.</span> Read the page images beside this form and work by hand.</span></div></div>' + laterPlaces(),
  foot: footer({ left: 'Your task: do this work by hand, due on the internal date 18 Dec 2026.', buttons: btn('btn-primary btn-lg', 'Work by hand', { walk: 'byhand' }) }),
  pane: scanPane(), act: [['sabine', 'filed the scan and entered the Art. 94(3) communication of 18 Sep 2026 with a period of 4 months', '09:20'], ['tobias', 'confirmed the deadline 18 Jan 2027', '09:41']],
})
S['scan-jonas'] = S['scan-jonas'].replace(/<div class="ev"><span class="ico"><span class="av sys" data-i="inbox">[^]*?read the letter for Jonas Weber[^]*?<\/div><\/div>/, '')

// ---------- the page ----------
const states = Object.keys(S)
const rowMenu = `<div class="menu ctx-menu ctx-at" id="row-menu" data-state="context" role="menu"><div class="mi on" data-i="eye" data-act="open">Open<span class="kbds"><span class="kbd">↵</span></span></div><div class="mi" data-i="matters" data-act="go-matter">Open matter<span class="kbds"><span class="kbd">G</span><span class="kbd">M</span></span></div><div class="sep"></div><div class="mi" data-i="link">Copy link</div></div>`
const body = states.map((k, i) => `<div class="app" data-state="${i === 0 ? 'default ' : ''}${k}">${S[k]}</div>`).join('\n') + rowMenu
const head = title => `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${title}</title>\n<!-- Generated from src/build.mjs: edit that folder and run node build.mjs, never this file -->`

writeFileSync(join(here, 'a94-letter.html'), `${head('Art. 94(3) letter')}
<link rel="stylesheet" href="../../../../../.agents/skills/flowleap-design-language/references/mockups/records.css">
<link rel="stylesheet" href="a94-letter.css">
</head>
<body>
${body}
<script src="../../../../../.agents/skills/flowleap-design-language/references/mockups/frame.js"></script>
<script src="walk.js"></script>
</body>
</html>
`)

// The one-file walkthrough: the client theme files that records.css imports, records.css, our CSS and both scripts inline.
const records = readFileSync(join(skill, 'records.css'), 'utf8')
const theme = [...records.matchAll(/@import url\('([^']+)'\);/g)].map(m => readFileSync(join(skill, m[1]), 'utf8')).join('\n')
const css = `${theme}\n${records.replace(/@import url\('[^']+'\);\n/g, '')}\n${readFileSync(join(here, 'a94-letter.css'), 'utf8')}`
const js = `${readFileSync(join(skill, 'frame.js'), 'utf8')}\n${readFileSync(join(here, 'walk.js'), 'utf8')}`
writeFileSync(join(here, '..', 'a94-letter-walkthrough.html'), `${head('Art. 94(3) letter walkthrough')}
<style>
${css}
</style>
</head>
<body>
${body}
<script>
${js.replaceAll('</script', '<\\/script')}
</script>
</body>
</html>
`)
console.log(`wrote ${states.length} view states`)
