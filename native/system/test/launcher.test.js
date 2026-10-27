/**
 * Behavioral tests against the REAL launcher binary on a real kernel: the
 * CLI contract (usage errors, exit codes, argv passthrough) and the
 * confinement world-proofs (denied writes stay off disk, grants land).
 *
 * Preconditions and their skip semantics:
 * - Non-Linux host: skips entirely (exit 0) — there is nothing to build here.
 * - Linux without the built binary: FAILS — run `pnpm build:native` first.
 * - Linux whose kernel does not enforce Landlock: skips the enforcement
 *   half, unless `NALR_REQUIRE_LANDLOCK=1` (set on CI, where a silent skip on
 *   the very platform that exists to prove enforcement would be a false
 *   green).
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  LAUNCHER_FAILURE_EXIT,
  grantArgs,
  launcherPath,
  probe,
} from '@deepseek-ai/node-addon-system/landlock-run';

const FATAL_PREFIX = 'landlock-run: ';
const PARTIAL_NOTICE = 'landlock-run: partial enforcement (older Landlock ABI)';
const requireLandlock = process.env.NALR_REQUIRE_LANDLOCK === '1';

if (process.platform !== 'linux') {
  console.log(`launcher.test: SKIP — the launcher only exists on linux (host: ${process.platform})`);
  process.exit(0);
}

const launcher = launcherPath();
assert.ok(
  fs.existsSync(launcher),
  `launcher.test: no built launcher at ${launcher} — run \`pnpm build:native\` (apt-get install musl-tools) first`,
);

const run = (args, options = {}) => spawnSync(launcher, args, { encoding: 'utf8', ...options });

// --- usage errors: parse failures exit LAUNCHER_FAILURE_EXIT before any restriction ---
{
  const noCommand = run([]);
  assert.equal(noCommand.status, LAUNCHER_FAILURE_EXIT);
  assert.ok(noCommand.stderr.startsWith(FATAL_PREFIX));
  assert.match(noCommand.stderr, /usage error: missing `-- <argv>\.\.\.` command/);

  const unknownFlag = run(['--bogus', '--', 'true']);
  assert.equal(unknownFlag.status, LAUNCHER_FAILURE_EXIT);
  assert.match(unknownFlag.stderr, /usage error: unknown argument: --bogus/);

  const danglingPath = run(['--ro']);
  assert.equal(danglingPath.status, LAUNCHER_FAILURE_EXIT);
  assert.match(danglingPath.stderr, /--ro requires a path/);

  for (const args of [
    ['--probe', '--ro', '/'],
    ['--probe', '--'],
    ['--probe', '--probe'],
    ['--probe', '--no-net', '--ro', '/'],
  ]) {
    const probeWithExtras = run(args);
    assert.equal(probeWithExtras.status, LAUNCHER_FAILURE_EXIT);
    assert.match(probeWithExtras.stderr, /--probe takes no other arguments/);
  }
}

// --- probe: the functional availability signal ---
const enforcement = probe(launcher);
console.log(`launcher.test: probe → ${enforcement}`);
if (enforcement === 'unusable') {
  if (requireLandlock) {
    console.error('launcher.test: NALR_REQUIRE_LANDLOCK=1 but the probe reports unusable — this kernel cannot prove enforcement');
    process.exit(1);
  }
  console.log('launcher.test: SKIP enforcement half — kernel does not enforce Landlock');
  process.exit(0);
}
const expectedNotice = enforcement === 'partial' ? `${PARTIAL_NOTICE}\n` : '';
{
  const probeRun = run(['--probe']);
  assert.equal(probeRun.status, 0);
  assert.match(probeRun.stdout, /^landlock: (fully enforced|partially enforced \(older ABI\))\n$/);
}

{
  const networkProbe = run(['--probe', '--no-net']);
  assert.equal(networkProbe.status, 0, networkProbe.stderr);
  assert.equal(probe(launcher, { network: 'deny' }), enforcement);
}

// --- confined exec: the command runs, its exit code passes through ---
{
  const echo = run([...grantArgs({ readOnly: ['/'] }), '--', '/bin/sh', '-c', 'echo confined-ok']);
  assert.equal(echo.status, 0, echo.stderr);
  assert.equal(echo.stdout, 'confined-ok\n');
  assert.equal(echo.stderr, expectedNotice);

  const exitCode = run([...grantArgs({ readOnly: ['/'] }), '--', '/bin/sh', '-c', 'exit 7']);
  assert.equal(exitCode.status, 7, 'the wrapped command exit code must pass through unchanged');

  const child125 = run([...grantArgs({ readOnly: ['/'] }), '--', '/bin/sh', '-c', `exit ${LAUNCHER_FAILURE_EXIT}`]);
  assert.equal(child125.status, LAUNCHER_FAILURE_EXIT, 'a wrapped child may itself return the launcher failure status');
  assert.equal(child125.stderr, expectedNotice);
}

// --- world-proofs: denied writes stay off disk, grants land, inheritance crosses exec ---
{
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'nalr-launcher-test-'));

  const denied = path.join(work, 'denied.txt');
  const deniedRun = run([...grantArgs({ readOnly: ['/'] }), '--', '/bin/sh', '-c', `echo x > ${denied}`]);
  assert.notEqual(deniedRun.status, 0, 'a write outside the grants must fail');
  assert.ok(!fs.existsSync(denied), 'the denied write must not land on disk');

  const granted = path.join(work, 'granted.txt');
  const grantedRun = run([...grantArgs({ readOnly: ['/'], readWrite: [work] }), '--', '/bin/sh', '-c', `echo ok > ${granted}`]);
  assert.equal(grantedRun.status, 0, grantedRun.stderr);
  assert.equal(fs.readFileSync(granted, 'utf8'), 'ok\n');

  // The ruleset is inherited across execve: a CHILD of the wrapped command
  // is confined too, not just the direct exec target.
  const nested = path.join(work, 'nested.txt');
  const nestedRun = run([...grantArgs({ readOnly: ['/'] }), '--', '/bin/sh', '-c', `/bin/sh -c 'echo x > ${nested}'; true`]);
  assert.equal(nestedRun.status, 0, nestedRun.stderr);
  assert.ok(!fs.existsSync(nested), 'a denied write from a nested child must not land either');

  fs.rmSync(work, { recursive: true, force: true });
}

// --- --no-net: no IP socket of any type, loopback included; Unix sockets still work ---
{
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'nalr-launcher-net-'));
  const node = (grants, script) => run([...grantArgs(grants), '--', process.execPath, '-e', script]);
  const tcp = `const s=require("net").createServer().listen(0,"127.0.0.1",()=>{require("net").connect(s.address().port,"127.0.0.1").on("connect",()=>{console.log("connected");process.exit(0)}).on("error",e=>{console.log(e.code);process.exit(3)})}).on("error",e=>{console.log(e.code);process.exit(3)})`;
  const udp = 'require("dgram").createSocket("udp4").on("error",e=>{console.log(e.code);process.exit(3)}).bind(0,"127.0.0.1",()=>{console.log("bound");process.exit(0)})';
  const unix = `require("net").createServer().listen(${JSON.stringify(path.join(work, 'unix.sock'))},()=>{console.log("listening");process.exit(0)}).on("error",e=>{console.log(e.code);process.exit(3)})`;

  const allowedTcp = node({ readOnly: ['/'] }, tcp);
  assert.equal(allowedTcp.stdout, 'connected\n', 'without --no-net the loopback connect succeeds');

  const deniedTcp = node({ readOnly: ['/'], network: 'deny' }, tcp);
  assert.equal(deniedTcp.status, 3, deniedTcp.stderr);
  assert.equal(deniedTcp.stdout, 'EACCES\n', 'a TCP socket is refused under --no-net');

  const deniedUdp = node({ readOnly: ['/'], network: 'deny' }, udp);
  assert.equal(deniedUdp.status, 3, deniedUdp.stderr);
  assert.equal(deniedUdp.stdout, 'EACCES\n', 'a UDP socket is refused under --no-net');

  const allowedUnix = node({ readOnly: ['/'], readWrite: [work], network: 'deny' }, unix);
  assert.equal(allowedUnix.stdout, 'listening\n', `a Unix socket still works under --no-net: ${allowedUnix.stderr}`);

  fs.rmSync(work, { recursive: true, force: true });
}

// --- fail closed: an unopenable grant root refuses to exec at all ---
{
  const marker = path.join(os.tmpdir(), `nalr-should-not-exist-${process.pid}`);
  const badGrant = run(['--ro', '/no/such/grant/root', '--', '/bin/sh', '-c', `echo x > ${marker}`]);
  assert.equal(badGrant.status, LAUNCHER_FAILURE_EXIT);
  assert.ok(badGrant.stderr.startsWith(FATAL_PREFIX));
  assert.match(badGrant.stderr, /cannot open rule path/);
  assert.ok(!fs.existsSync(marker), 'the command must never run when the launcher fails');
}

console.log('launcher.test: ok');
