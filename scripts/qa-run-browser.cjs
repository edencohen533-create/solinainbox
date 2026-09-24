/* eslint-disable @typescript-eslint/no-require-imports */
require('./qa-environment.cjs');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const output = fs.openSync('/tmp/solina-qa-server.log', 'a');
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', '3101'], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
let ready = false;
let startupOutput = '';
server.stdout.on('data', (chunk) => {
  fs.writeSync(output, chunk); startupOutput = (startupOutput + chunk.toString()).slice(-2000);
  ready ||= startupOutput.includes('Ready in');
});
server.stderr.on('data', (chunk) => fs.writeSync(output, chunk));
const run = (args, env = process.env) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, args, { env, stdio: 'inherit' });
  child.on('error', reject); child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`QA command exited ${code}`)));
});
(async () => {
  for (let i = 0; ; i++) {
    if (server.exitCode !== null || server.signalCode !== null) throw new Error('QA server exited; inspect /tmp/solina-qa-server.log');
    try {
      if (!ready) throw new Error('Waiting for our own server, not an existing listener');
      const response = await fetch('http://localhost:3101/login', { signal: AbortSignal.timeout(1000) });
      await response.body?.cancel();
      if (response.ok) break;
    } catch { /* wait until ready */ }
    if (i > 60) throw new Error('QA server did not start');
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!process.argv.includes('--browser-only')) await run(['scripts/smoke-deployment.cjs', 'http://localhost:3101'], { ...process.env, SMOKE_TEST_EMAIL: 'qa-admin@example.test', SMOKE_TEST_PASSWORD: 'QA-only-Password-2026!' });
  if (!process.argv.includes('--smoke-only')) await run([process.argv.includes('--crm-only') ? 'scripts/qa-crm-browser.cjs' : process.argv.includes('--automation-only') ? 'scripts/qa-automation-browser.cjs' : 'scripts/qa-browser.cjs', ...process.argv.slice(2)]);
})().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => { server.kill('SIGTERM'); });
server.on('close', () => fs.closeSync(output));
process.on('SIGTERM', () => { server.kill('SIGTERM'); process.exit(143); });
