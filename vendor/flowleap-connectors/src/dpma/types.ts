/**
 * DPMAconnectPlus (the REST interface of the German Patent and Trade Mark
 * Office to DPMAregister): the result types of the patent and utility model
 * service. The data is public register data. The service gives no letters, no
 * non-public files and no due dates.
 */

/** Why a DPMA call gave no data. */
export type DpmaFailureKind =
	/** No DPMA credential on this host. No request was sent. */
	| 'not_configured'
	/** The host holds a credential but refuses it to this caller. No request was sent. */
	| 'keys_required'
	/** The input cannot be a DPMA value (a file number, a date, a period). No request was sent. */
	| 'bad_input'
	/** The DPMA refused the user name and password. */
	| 'auth'
	/** The DPMA refused the expert query. `message` is the text of the DPMA. */
	| 'query'
	/** The DPMA has no data for this request (a file that does not exist, a period with no extract). */
	| 'not_available'
	/** The DPMA answered with an HTTP failure or did not answer. */
	| 'upstream'
	/** The answer does not have the fields of the DPMA schema. */
	| 'malformed';

export interface DpmaFailure {
	readonly kind: DpmaFailureKind;
	readonly message: string;
	/** The HTTP status of the DPMA answer, when there was one. */
	readonly status?: number;
}

export type DpmaResult<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: DpmaFailure };

/** One hit of an expert search (`PatentHitList`). */
export interface DpmaHit {
	/** The key of the file for `getRegisterInfo` (`leading-registered-number`). */
	readonly leadingRegisteredNumber: string;
	/** The file number as the DPMA prints it, for example `G 82 33 714.4`. */
	readonly registeredNumber: string;
	/** The type of right as the DPMA writes it, for example `Patent` or `Utility model`. */
	readonly type: string;
	/** The legal status as the DPMA writes it, for example `Not pending/lapsed`. */
	readonly legalStatus: string;
	readonly title: string;
	readonly applicationDate?: string;
	readonly publicationDate?: string;
	readonly registrationDate?: string;
	/** Each applicant as one line: name, town, country. */
	readonly applicants: readonly string[];
	readonly inventors: readonly string[];
	/** The representative as one line. Absent when the register names none. */
	readonly agent?: string;
}

/** The answer of an expert search. */
export interface DpmaHitList {
	/** The `HitCount` attribute. With `limited`, it is not the number of `hits`. */
	readonly hitCount: number;
	/** True when the DPMA cut the list at the hit limit of the account. Narrow the query. */
	readonly limited: boolean;
	readonly hits: readonly DpmaHit[];
}

/** One name with its address, as the register gives it. */
export interface DpmaParty {
	/** The full line: name, town, country. */
	readonly text: string;
	readonly name?: string;
	readonly country?: string;
}

/** One procedural event of a file. */
export interface DpmaRegisterEvent {
	/** `type-of-procedure`, for example `vorverfahren` or `publikationen`. */
	readonly procedure: string;
	/** `procedural-status`: the code of the DPMA, for example `R200`. */
	readonly status: string;
	/** ISO date `YYYY-MM-DD`. */
	readonly date: string;
	/** The date of the publication in the Patentblatt, when the event has one. */
	readonly publicationDate?: string;
	/** The published documents of the event, for example `DE000010027360A1`. */
	readonly publishedDocuments: readonly string[];
}

/** One register record (`getRegisterInfo`), in the DPMA extension of WIPO ST.36. */
export interface DpmaRegisterRecord {
	/** The `schema-version` attribute of the record. */
	readonly schemaVersion?: string;
	/** The file number, for example `10027360.2`. */
	readonly applicationNumber: string;
	readonly applicationDate?: string;
	readonly publications: readonly { readonly country: string; readonly number: string; readonly kind?: string }[];
	readonly title?: string;
	/** `type-of-ip-right`, for example `patent`. */
	readonly ipRightType?: string;
	/** `status`, for example `anhaengig-in-kraft` or `nicht-anhaengig-erloschen`. */
	readonly status?: string;
	readonly applicants: readonly DpmaParty[];
	readonly inventors: readonly DpmaParty[];
	/** The representatives. */
	readonly agents: readonly DpmaParty[];
	readonly priorities: readonly { readonly country: string; readonly date?: string; readonly number?: string }[];
	readonly ipc: readonly string[];
	readonly firstPublicationDate?: string;
	/** The date of the last change of the register record. */
	readonly lastRegisterUpdate?: string;
	readonly abstract?: string;
	readonly events: readonly DpmaRegisterEvent[];
}

/** The period of a register extract. */
export const DPMA_EXTRACT_PERIODS = ['daily', 'weekly', 'monthly', 'yearly'] as const;
export type DpmaExtractPeriod = (typeof DPMA_EXTRACT_PERIODS)[number];
