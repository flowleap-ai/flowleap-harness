// The data of the MyEPO surfaces mockups. Sources: the seed firm (flowleap-seed-firm, commit cee0c11: matters,
// documents.json, users, groups), the EP Register reads of S14 (get_register_biblio, 2026-11-10), and the deadline
// engine (flowleap-deadlines with the 2027 calendar, rule "Rule 71(3) EPC" version 1). Everything else is an example and
// README.md names it.

/** The day of the mockups: the MyEPO link and the first read (the example time of the approved card), and today. */
export const LINKED = '2026-11-09', LINKED_HM = '14:05', TODAY = '2026-11-10';

/** The seed persons. Each page names its viewer; the walls decide what each viewer sees. */
export const P = {
  martin: { name: 'Dr. Martin Krüger', role: ['Partner', 'Partner'] },
  anna: { name: 'Dr. Anna Becker', role: ['Patent attorney', 'Patentanwältin'] },
  lena: { name: 'Lena Hoffmann', role: ['Patent attorney', 'Patentanwältin'] },
  jonas: { name: 'Jonas Weber', role: ['Patent attorney', 'Patentanwalt'] },
  felix: { name: 'Felix Neumann', role: ['Administrator', 'Administrator'] },
};

/** The seven seed matters: file number, application (with check digit), title, client, published applicant name, register status, responsible. */
export const M = {
  'SF-2020-0031': { app: 'EP20706232', check: '4', title: 'Labelling materials for marking electrical installations and method for producing a labelling strip', client: 'phoenix', applicant: 'PHOENIX CONTACT GmbH & Co. KG', status: 'The application is deemed to be withdrawn', resp: 'anna' },
  'SF-2021-0011': { app: 'EP21755382', check: '5', title: 'Conductor connection terminal', client: 'wago', applicant: 'Wago Verwaltungsgesellschaft mbH', status: 'No opposition filed within time limit', resp: 'jonas' },
  'SF-2026-0019': { app: 'EP21810318', check: '2', title: 'Terminal for electrical wire', client: 'phoenix', applicant: 'Phoenix Contact GmbH & Co. KG', status: 'The patent has been granted', resp: 'anna' },
  'SF-2022-0024': { app: 'EP22213933', check: '9', title: 'Control device and method for switching input/output units of a control device', client: 'wago', applicant: 'Wago Verwaltungsgesellschaft mbH', status: 'Grant of patent is intended', resp: 'lena' },
  'SF-2023-0042': { app: 'EP23755468', check: '8', title: 'Scale', client: 'renishaw', applicant: 'Renishaw plc', status: 'Examination is in progress', resp: 'lena' },
  'SF-2023-0045': { app: 'EP23771920', check: '8', title: 'Apparatus and method for position encoding', client: 'renishaw', applicant: 'Renishaw plc', status: 'Grant of patent is intended', resp: 'anna' },
  'SF-2024-0007': { app: 'EP24166597', check: '5', title: 'Contact assembly for connecting an electrical conductor and conductor connection terminal having such a contact assembly', client: 'wago', applicant: 'Wago Verwaltungsgesellschaft mbH', status: 'Examination is in progress', resp: 'jonas' },
};
/** The three seed clients, with their names as published. */
export const CLIENTS = {
  wago: { name: 'Wago Verwaltungsgesellschaft mbH', short: 'Wago', names: ['Wago Verwaltungsgesellschaft mbH'] },
  phoenix: { name: 'Phoenix Contact GmbH & Co. KG', short: 'Phoenix Contact', names: ['PHOENIX CONTACT GmbH & Co. KG', 'Phoenix Contact GmbH & Co. KG'] },
  renishaw: { name: 'Renishaw plc', short: 'Renishaw', names: ['Renishaw plc'] },
};

/**
 * The EPO letters of the seed (documents.json; an annex and the text intended for grant are files of their letter).
 * id, row, file number, kind, dispatch date (the date on the letter), letter state, opened, deadline.
 * Letter states: listed, filed, computed, confirmed, done, person (FlowLeap cannot handle it).
 * A deadline is { due, rule } from the engine, or { none: 'rule' } when the engine has no rule, or { none: 'period' }.
 */
export const LETTERS = [
  { id: 'r18', row: 18, key: 'SF-2023-0045', kind: 'r71', date: '2026-09-29', state: 'confirmed', dl: { due: '2027-01-29' }, files: 2 },
  { id: 'r6', row: 6, key: 'SF-2024-0007', kind: 'a94', date: '2026-09-18', state: 'person', dl: { none: 'rule' }, files: 2 },
  { id: 'r16', row: 16, key: 'SF-2023-0042', kind: 'a94', date: '2026-06-09', state: 'person', dl: { none: 'rule' }, files: 2 },
  { id: 'r5', row: 5, key: 'SF-2022-0024', kind: 'r71', date: '2026-04-01', state: 'computed', dl: { due: '2026-08-03' }, files: 1 },
  { id: 'r3', row: 3, key: 'SF-2021-0011', kind: 'grant', date: '2025-10-23', state: 'done', dl: { none: 'period' }, files: 1 },
  { id: 'r2', row: 2, key: 'SF-2021-0011', kind: 'r71', date: '2025-08-29', state: 'done', dl: { due: '2026-01-02' }, files: 1 },
  { id: 'r1', row: 1, key: 'SF-2021-0011', kind: 'r71', date: '2025-06-20', state: 'done', dl: { due: '2025-10-20' }, files: 1 },
  { id: 'r4', row: 4, key: 'SF-2022-0024', kind: 'a94', date: '2024-09-11', state: 'done', dl: { none: 'rule' }, files: 1 },
];
/** Example: a real kind of EPO letter of the EPO sandbox Mailbox that names no application, so FlowLeap cannot file it. */
export const EXCEPTION = { id: 'x1', key: '', kind: 'reps', date: '2026-11-09', state: 'person', dl: { none: 'period' }, files: 1, example: true };

/**
 * The engine's steps for the two Rule 71(3) deadlines that the detail screens show (flowleap-deadlines, rule version 1,
 * computed on 2026-11-10): [op, from, to, citation].
 */
export const TRACES = {
  'SF-2023-0045': { letter: '2026-09-29', due: '2027-01-29', steps: [
    ['delivery', '2026-09-29', '2026-09-29', 'Rule 126(2) EPC · Rule 127(2) EPC · OJ EPO 2023, A29'],
    ['start', '2026-09-29', '2026-09-30', 'Rule 131(2) EPC'],
    ['add', '2026-09-29', '2027-01-29', 'Rule 71(3) EPC · Rule 131(4) EPC'],
    ['open', '2027-01-29', '2027-01-29', 'Rule 134(1) EPC · OJ EPO 2026, A30'],
  ] },
  'SF-2022-0024': { letter: '2026-04-01', due: '2026-08-03', steps: [
    ['delivery', '2026-04-01', '2026-04-01', 'Rule 126(2) EPC · Rule 127(2) EPC · OJ EPO 2023, A29'],
    ['start', '2026-04-01', '2026-04-02', 'Rule 131(2) EPC'],
    ['add', '2026-04-01', '2026-08-01', 'Rule 71(3) EPC · Rule 131(4) EPC'],
    ['roll', '2026-08-01', '2026-08-03', 'Rule 134(1) EPC · OJ EPO 2025, A40'],
  ] },
};

/** The deadlines that Lena Hoffmann sees (her walls): the open ones and one closed. */
export const DEADLINES = [
  { key: 'SF-2022-0024', letter: 'r5', due: '2026-08-03', atlas: 'deadline.deadline_proposed', how: 'differ' },
  { key: 'SF-2023-0042', letter: 'r16', due: '', atlas: 'deadline.engine_refused', how: 'rule' },
  { key: 'SF-2024-0007', letter: 'r6', due: '', atlas: 'deadline.engine_refused', how: 'rule' },
  { key: 'SF-2023-0045', letter: 'r18', due: '2027-01-29', atlas: 'deadline.active', how: 'auto' },
  { key: 'SF-2021-0011', letter: 'r1', due: '2025-10-20', atlas: 'deadline.stale', how: 'superseded', closed: true },
];

/** Example: a large firm's docket for the large case of Import your EP docket (README names the source of each value). */
export const LARGE = {
  apps: 1132, names: 312, clients: 287, read: 412, minutes: 4,
  /** The first rows of the proposed clients: real applicant names; the counts at this example firm are examples. */
  rows: [
    ['Siemens Aktiengesellschaft', ['Siemens Aktiengesellschaft'], 214],
    ['Syntegon Technology GmbH', ['Syntegon Technology GmbH', 'Syntegon Packaging Systems AG'], 16],
    ['Bucher Hydraulics', ['Bucher Hydraulics AG', 'Bucher Hydraulics GmbH'], 9],
    ['Siemens Healthineers AG', ['Siemens Healthineers AG'], 7],
    ['Gerhard Schubert GmbH', ['Gerhard Schubert GmbH'], 3],
  ],
};
