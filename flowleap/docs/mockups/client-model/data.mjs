// The data of the client model mockups: EP Register reads of 2026-11-09 through the FlowLeap patent data tools.
// "Your firm" is the seed firm of the dev loop; its EP docket (one address query) has 38 applications, 16 of them
// Syntegon. LARGE is Siemens: its names and counts are real, but your firm has no Siemens matter, so its rows (real
// Siemens applications at other firms), its count at your firm and its docket size are examples (README.md).

export const CLIENT = 'Syntegon';
export const ASOF = '2026-11-09', ASOF_HM = '14:02';
/** Your firm's EP docket: rows, the queries of the firm identity, the read time, the next scheduled read. */
export const DOCKET = { rows: 38, queries: 4, hm: '07:00', next: '2026-11-16' };
/** The applicant names in the EP Register: name, matching EP applications (pa=), at your firm. pa="Syntegon": 272. */
export const NAMES = [["Syntegon Technology GmbH", 202, 16], ["Syntegon Packaging Systems AG", 41, 0], ["Syntegon Packaging Solutions B.V.", 12, 0], ["Syntegon Pouch Systems AG", 4, 0], ["Syntegon Packaging Technology GmbH", 4, 0]];
/**
 * Your firm's Syntegon applications: application, publication, title, filed, representative since, register status,
 * stage, last register event, its date, matter folder since (the demo: work started on the first), family folder name.
 */
export const MATTERS = [
  ["EP23171862", "EP4292805 A1", "Method and apparatus for producing a packaging element", "2023-05-05", "2024-07-24", "Examination is in progress", "pending", "Examination is in progress", "2024-12-13", "2026-11-09", "EP 23 171 862 Method and apparatus for producing"],
  ["EP23215725", "EP4385719 A1", "Method for sealing a stack of layers of a fibre-based packaging material", "2023-12-12", "2024-07-24", "Request for examination was made", "pending", "Request for examination was made", "2024-09-20", "", ""],
  ["EP23709335", "EP4486513 A1", "Device for coating an object with a silicone coating", "2023-03-01", "2024-12-06", "Request for examination was made", "pending", "Request for examination was made", "2024-12-06", "", ""],
  ["EP24199601", "EP4527609 A1", "Method and device for joining or forming a fibre-based packing material and packaging machine for producing a packaging", "2024-09-10", "2025-02-21", "Request for examination was made", "pending", "Request for examination was made", "2025-09-05", "", ""],
  ["EP25183540", "EP4671722 A1", "Device for the visualisation of gas flows in a room, especially in a clean room", "2025-06-18", "2025-11-28", "Examination is in progress", "pending", "Examination is in progress", "2026-09-04", "", ""],
  ["EP25210820", "EP4737335 A2", "Packaging machine with a system for detecting a packaging element", "2025-10-23", "2026-04-03", "The application has been published", "pending", "The application has been published", "2026-04-03", "", ""],
  ["EP24735552", "EP4739983 A1", "Container carrier for carrying a multiplicity of containers", "2024-06-17", "2026-04-10", "Request for examination was made", "pending", "Request for examination was made", "2026-04-10", "", ""],
  ["EP24758162", "EP4762336 A1", "Device for taking air samples in a clean room", "2024-08-12", "2026-05-22", "Request for examination was made", "pending", "Request for examination was made", "2026-05-22", "", ""],
  ["EP24768012", "EP4774489 A1", "Pinch valve for a filling device for filling containers with pharmaceutical contents, filling device and method for filling containers with pharmaceutical contents", "2024-09-03", "2026-06-12", "Request for examination was made", "pending", "Request for examination was made", "2026-06-12", "", ""],
  ["EP26153983", "EP4786383 A1", "Device for adapting a distance between containers", "2026-01-26", "2026-07-03", "The application has been published", "pending", "The application has been published", "2026-07-03", "", ""],
  ["EP24817871", "EP4820737 A1", "Apparatus for the automated processing of dishes with a lid", "2024-11-28", "2026-09-11", "Request for examination was made", "pending", "Request for examination was made", "2026-09-11", "", ""],
  ["EP24817872", "EP4820738 A1", "Air sampling device", "2024-11-28", "2026-09-11", "Request for examination was made", "pending", "Request for examination was made", "2026-09-11", "", ""],
  ["EP26173840", "EP4834776 A1", "Device for providing stoppers for closing containers", "2026-04-21", "2026-10-02", "The application has been published", "pending", "The application has been published", "2026-10-02", "", ""],
  ["EP25712875", "", "System for filling containers with contents, with fill level monitoring", "2025-03-14", "2026-10-08", "The international publication has been made", "pending", "", "", "", ""],
  ["EP25712876", "", "System for filling containers with contents, with fill level monitoring", "2025-03-14", "2026-10-08", "The international publication has been made", "pending", "", "", "", ""],
  ["EP25712877", "", "System for filling filling material into containers with fill level monitoring", "2025-03-14", "2026-10-08", "The international publication has been made", "pending", "", "", "", ""],
];
/** The group's EP applications at other firms: 272 minus 16. */
export const OTHERS = 256;
/** A search among them: pa="Syntegon" and ti=weighing, with the town of the representative. */
export const FOUND = { query: 'weighing', total: 4, rows: [
  ['EP19794879', 'Increasing the weighing accuracy when weighing nested pharmaceutical containers', 'Stuttgart'],
  ['EP20723107', 'Apparatus and method for weighing pharmaceutical containers nested in a carrier', 'Onex'],
  ['EP23180719', 'Device and method for weighing individual containers and a set comprising such a device', 'Onex'],
  ['EP15730454', 'Device for weighing a receptacle', 'Stuttgart'],
] };
export const LARGE = {
  client: 'Siemens', query: 'Siemens', example: true,
  names: [["Siemens Aktiengesellschaft", 10000, 1132], ["Siemens Healthineers AG", 1335, 0], ["Siemens Healthcare GmbH", 1752, 0], ["Siemens Energy Global GmbH & Co. KG", 2991, 0], ["Siemens Mobility GmbH", 2574, 0], ["Siemens Industry Software", 752, 0], ["Siemens Schweiz AG", 1119, 0], ["Siemens Gamesa Renewable Energy A/S", 2301, 0], ["Siemens Medical Solutions USA, Inc.", 677, 0], ["Siemens Logistics GmbH", 39, 0]],
  /** Example: the count at your firm (from one test query of the large-client sheet) and a large firm's docket. */
  atFirm: 1132, matching: 10000, others: 10000, docket: { rows: 16204, queries: 64 },
  /** Real Siemens Aktiengesellschaft applications published in October 2026, at other firms: the example rows. */
  rows: [
    ["EP25700513", "EP4829692 A1", "Method and system for automatic generation of add-in programs in engineering system", "2025-01-13", "2026-09-25", "Request for examination was made", "pending", "Change - representative", "2026-09-25", "", ""],
    ["EP25701760", "EP4829639 A1", "Controlling a machine using a learning-based control device", "2025-01-09", "2026-09-25", "Request for examination was made", "pending", "Change - representative", "2026-09-25", "", ""],
    ["EP24704947", "EP4816250 A1", "Systems and methods for test scenario generation in train operations", "2024-01-03", "2026-09-04", "Request for examination was made", "pending", "Change - representative", "2026-09-04", "", ""],
    ["EP25701757", "EP4820923 A1", "Method for determining an operations schedule, method for manufacturing or modifying a product or for calculation and quantum computer", "2025-01-08", "2026-09-11", "Request for examination was made", "pending", "Change - representative", "2026-09-11", "", ""],
    ["EP25701758", "EP4821119 A1", "Method for operating a power supply device", "2025-01-09", "2026-09-11", "Request for examination was made", "pending", "Change - representative", "2026-09-11", "", ""],
    ["EP25712012", "EP4820841 A1", "Operation of a machine for machining a workpiece", "2025-02-24", "2026-09-11", "Request for examination was made", "pending", "Change - representative", "2026-09-11", "", ""],
    ["EP25167466", "EP4819536 A1", "Method for proving authenticity of one-time signature based on symmetric cryptography", "2025-03-31", "2026-09-04", "The application has been published", "pending", "Change - representative", "2026-09-04", "", ""],
    ["EP25167469", "EP4818996 A1", "System and method for dispatch scheduling of mixed fleet comprising electric vehicles and non-electric vehicles", "2025-03-31", "2026-09-04", "The application has been published", "pending", "Change - representative", "2026-09-04", "", ""],
    ["EP25168085", "EP4819534 A1", "Method for applying at least one cryptographic operation to at least one data set stored on a device", "2025-04-02", "2026-09-04", "The application has been published", "pending", "Change - representative", "2026-09-04", "", ""],
    ["EP25168181", "EP4819541 A1", "Establishing a communication connection between a first unit and a second unit", "2025-04-03", "2026-09-04", "The application has been published", "pending", "Change - representative", "2026-09-04", "", ""],
    ["EP25169469", "EP4823225 A1", "Operating a mobile 3GPP communication network to facilitate redundant communications", "2025-04-09", "2026-09-11", "The application has been published", "pending", "Change - representative", "2026-09-11", "", ""],
    ["EP25171366", "EP4827043 A1", "Method for verification of unbalanced oil-and-vinegar signatures", "2025-04-17", "2026-09-18", "The application has been published", "pending", "Change - representative", "2026-09-18", "", ""],
  ],
};
/** A client with no EP application at your firm: Gerhard Schubert (pa="Gerhard Schubert": 57, none at your firm). */
export const EMPTY = { client: 'Gerhard Schubert', names: ['Gerhard Schubert GmbH'], others: 57 };
/** The EP Register events of the two applications that the walkthrough opens (get_register_events, 2026-11-09). */
export const EVENTS = {
  EP23171862: [['2024-12-13', 'Examination is in progress'], ['2024-03-01', 'Request for examination was made'], ['2023-11-17', 'The application has been published']],
  EP23215725: [['2024-09-20', 'Request for examination was made'], ['2024-05-17', 'The application has been published']],
};
/**
 * The clients of the seed firm before Syntegon: name, applicant names, EP applications at your firm (EP Register,
 * 2026-11-09), matter folders, added, by. The dates and the person are examples.
 */
export const CLIENTS = [
  ['Bucher Hydraulics', ['Bucher Hydraulics AG', 'Bucher Hydraulics GmbH'], 9, 0, '2026-11-08', 'Dr. Anna Becker'],
  ['Gerhard Schubert', ['Gerhard Schubert GmbH'], 0, 0, '2026-11-08', 'Dr. Anna Becker'],
];
