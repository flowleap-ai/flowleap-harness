import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { createFakeHost, hostCredentials, type FakeHost } from '../__tests__/fake-host.js';
import { createConnectors } from '../index.js';
import { ClientGoneError } from '../errors.js';

const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), 'utf8');

const BASE = 'https://dpmaconnect.dpma.de/dpmaws/rest-services/DPMAregisterPatService';

function linked(answer: (url: string, init?: RequestInit) => Response | Promise<Response>): { host: FakeHost; fetch: ReturnType<typeof vi.fn> } {
	const fetch = vi.fn(async (input: string | URL, init?: RequestInit) => answer(String(input), init));
	const host = createFakeHost({ fetch, credentials: { dpma: hostCredentials<'dpma'>({ username: 'testuser', password: 'testuser' }) } });
	return { host, fetch };
}

describe('the DPMA client', () => {
	it('sends no request without a credential', async () => {
		const host = createFakeHost();
		const { dpma } = createConnectors(host);
		expect(await dpma.getVersion()).toMatchObject({ ok: false, error: { kind: 'not_configured' } });
		expect(await dpma.searchRegister('TI=Elektrofahrzeug')).toMatchObject({ ok: false, error: { kind: 'not_configured' } });
		expect(host.fetch).not.toHaveBeenCalled();
	});

	it('sends no request when the host refuses its credential to the caller', async () => {
		const host = createFakeHost({ credentials: { dpma: { status: 'required' } } });
		expect(await createConnectors(host).dpma.getVersion()).toMatchObject({ ok: false, error: { kind: 'keys_required' } });
		expect(host.fetch).not.toHaveBeenCalled();
	});

	it('reads the version with HTTP Basic authentication', async () => {
		const { host, fetch } = linked(() => new Response(fixture('version.txt')));
		expect(await createConnectors(host).dpma.getVersion()).toEqual({ ok: true, data: '8.26.0-b12' });
		expect(fetch).toHaveBeenCalledTimes(1);
		const [url, init] = fetch.mock.calls[0]!;
		expect(url).toBe(`${BASE}/version`);
		// The example of the interface description: testuser:testuser.
		expect((init as RequestInit).headers).toEqual({ Authorization: 'Basic dGVzdHVzZXI6dGVzdHVzZXI=' });
		// The DPMA is not an office with a trial budget: no upstream_call is reported.
		expect(host.events).toEqual([]);
	});

	it('reports a refused login, whatever the HTTP status', async () => {
		for (const status of [200, 401]) {
			const { host } = linked(() => new Response(fixture('auth_error.xml'), { status }));
			expect(await createConnectors(host).dpma.getVersion()).toEqual({ ok: false, error: { kind: 'auth', message: 'Authentification failed', status } });
		}
		const { host } = linked(() => new Response('', { status: 401 }));
		expect(await createConnectors(host).dpma.getVersion()).toMatchObject({ ok: false, error: { kind: 'auth', status: 401 } });
	});

	it('puts the expert query in one encoded path segment', async () => {
		const { host, fetch } = linked(() => new Response(fixture('patent_search.xml')));
		const result = await createConnectors(host).dpma.searchRegister(' INH=Müller & Söhne/GmbH UND AT>=01.01.2020 ');
		expect(result.ok && result.data.hits).toHaveLength(4);
		expect(fetch.mock.calls[0]![0]).toBe(`${BASE}/search/${encodeURIComponent('INH=Müller & Söhne/GmbH UND AT>=01.01.2020')}`);
	});

	it('refuses an empty query without a request', async () => {
		const { host, fetch } = linked(() => new Response(''));
		expect(await createConnectors(host).dpma.searchRegister('  ')).toMatchObject({ ok: false, error: { kind: 'bad_input' } });
		expect(fetch).not.toHaveBeenCalled();
	});

	it('gives a cut list as data, marked limited', async () => {
		const { host } = linked(() => new Response(fixture('patent_search_limited.xml')));
		const result = await createConnectors(host).dpma.searchRegister('ST=erloschen');
		expect(result).toMatchObject({ ok: true, data: { limited: true } });
	});

	it('gives the query failure of the DPMA', async () => {
		const { host } = linked(() => new Response(fixture('patent_search_error.xml')));
		expect(await createConnectors(host).dpma.searchRegister('(')).toMatchObject({ ok: false, error: { kind: 'query', status: 200 } });
	});

	it('reads one register record by its leading file number', async () => {
		const { host, fetch } = linked(() => new Response(fixture('patent_info.xml')));
		const result = await createConnectors(host).dpma.getRegisterInfo(' 100273602 ');
		expect(result).toMatchObject({ ok: true, data: { applicationNumber: '10027360.2' } });
		expect(fetch.mock.calls[0]![0]).toBe(`${BASE}/getRegisterInfo/100273602`);
	});

	it('refuses a value that cannot be a leading file number without a request', async () => {
		const { host, fetch } = linked(() => new Response(''));
		for (const value of ['10 2019 105 526.1', '../version', '']) {
			expect(await createConnectors(host).dpma.getRegisterInfo(value)).toMatchObject({ ok: false, error: { kind: 'bad_input' } });
		}
		expect(fetch).not.toHaveBeenCalled();
	});

	it('reports a file that the DPMA does not have', async () => {
		const { host } = linked(() => new Response(fixture('data_not_available.xml')));
		expect(await createConnectors(host).dpma.getRegisterInfo('100273602')).toMatchObject({ ok: false, error: { kind: 'not_available', message: 'Data not available' } });
		const missing = linked(() => new Response('', { status: 404 }));
		expect(await createConnectors(missing.host).dpma.getRegisterInfo('100273602')).toMatchObject({ ok: false, error: { kind: 'not_available', status: 404 } });
	});

	it('reports an answer that is not a register record as malformed', async () => {
		const { host } = linked(() => new Response('<html>maintenance</html>'));
		expect(await createConnectors(host).dpma.getRegisterInfo('100273602')).toMatchObject({ ok: false, error: { kind: 'malformed', status: 200 } });
	});

	it('downloads a register extract as bytes', async () => {
		const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
		const { host, fetch } = linked(() => new Response(zip));
		const result = await createConnectors(host).dpma.getRegisterExtract('2026-11-16', 'daily');
		expect(result).toEqual({ ok: true, data: zip });
		expect(fetch.mock.calls[0]![0]).toBe(`${BASE}/getRegisterabzuege/2026-11-16/daily`);
	});

	it('reports an extract that is a failure answer, and refuses a bad date or period', async () => {
		const { host, fetch } = linked(() => new Response(fixture('data_not_available.xml')));
		const { dpma } = createConnectors(host);
		expect(await dpma.getRegisterExtract('2026-11-16', 'weekly')).toMatchObject({ ok: false, error: { kind: 'not_available' } });
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(await dpma.getRegisterExtract('16.11.2026', 'daily')).toMatchObject({ ok: false, error: { kind: 'bad_input' } });
		expect(await dpma.getRegisterExtract('2026-11-16', 'hourly' as never)).toMatchObject({ ok: false, error: { kind: 'bad_input' } });
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('reports an HTTP failure and a network failure as upstream', async () => {
		const down = linked(() => new Response('Service Unavailable', { status: 503 }));
		expect(await createConnectors(down.host).dpma.getVersion()).toEqual({ ok: false, error: { kind: 'upstream', message: 'DPMA answered HTTP 503', status: 503 } });
		const offline = linked(() => {
			throw new TypeError('fetch failed');
		});
		expect(await createConnectors(offline.host).dpma.getVersion()).toMatchObject({ ok: false, error: { kind: 'upstream' } });
	});

	it('sends nothing for a caller that is gone', async () => {
		const { host, fetch } = linked(() => new Response(fixture('version.txt')));
		host.callerSignal = AbortSignal.abort();
		await expect(createConnectors(host).dpma.getVersion()).rejects.toBeInstanceOf(ClientGoneError);
		expect(fetch).not.toHaveBeenCalled();
	});
});
