/* eslint-disable @typescript-eslint/no-require-imports -- Deployment verification script. */
const assert = require('node:assert/strict');
const base = process.argv[2];
const target = base ? new URL(base) : null;
if (!target || !(target.protocol === 'https:' || (target.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(target.hostname)))) throw new Error('Supply an HTTPS deployment URL or local QA URL');
const cookies = new Map();
async function request(path, options = {}, authenticated = true) {
  const response = await fetch(new URL(path, base), {
    ...options, redirect: 'manual', signal: AbortSignal.timeout(30000),
    headers: { ...(authenticated ? { Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') } : {}), ...options.headers },
  });
  if (authenticated) for (const header of response.headers.getSetCookie()) {
    const pair = header.split(';', 1)[0]; const at = pair.indexOf('=');
    cookies.set(pair.slice(0, at), pair.slice(at + 1));
  }
  return response;
}
(async () => {
  for (const [path, status] of [['/login', 200], ['/api/campaigns', 403], ['/api/cron/process-campaigns', 401], ['/api/cron/process-automations', 401], ['/api/contacts/export', 403]]) {
    const response = await request(path, {}, false); await response.body?.cancel();
    assert.equal(response.status, status, `${path}: unexpected public response`); console.log(`PASS public ${path}: ${status}`);
  }
  for (const [path, status] of [['/api/automations/preview', 403], ['/api/automations/stop', 403], ['/api/campaigns/unknown/duplicate', 403], ['/api/conversations/unknown/notes', 401]]) {
    const response = await request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }, false);
    await response.body?.cancel(); assert.equal(response.status, status, `${path}: anonymous mutation allowed`);
    console.log(`PASS public POST ${path}: ${status}`);
  }
  if (!process.env.SMOKE_TEST_EMAIL || !process.env.SMOKE_TEST_PASSWORD) {
    console.log('Authenticated checks skipped: supply SMOKE_TEST_EMAIL and SMOKE_TEST_PASSWORD'); return;
  }
  const csrfResponse = await request('/api/auth/csrf');
  assert.equal(csrfResponse.status, 200);
  const { csrfToken } = await csrfResponse.json();
  const body = new URLSearchParams({ csrfToken, email: process.env.SMOKE_TEST_EMAIL, password: process.env.SMOKE_TEST_PASSWORD, callbackUrl: new URL('/inbox', base).href });
  const login = await request('/api/auth/callback/credentials', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Auth-Return-Redirect': '1' }, body });
  await login.body?.cancel();
  const sessionResponse = await request('/api/auth/session');
  const session = await sessionResponse.json();
  assert.ok(session.user?.id, 'Authenticated session was not established');
  console.log(`PASS authenticated session (${session.user.role})`);
  const preview = await request('/api/automations/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  await preview.body?.cancel(); assert.equal(preview.status, 400, 'Authenticated preview must reject missing input without writes');
  console.log('PASS authenticated dry-run rejects invalid input');
  for (const path of ['/inbox', '/campaigns', '/templates', '/contacts', '/automations', '/settings/whatsapp', '/api/campaigns', '/api/distribution-lists', '/api/templates', '/api/conversations']) {
    const response = await request(path); assert.equal(response.status, 200, `${path}: authenticated request failed`);
    const text = await response.text(); assert.ok(!text.includes('passwordHash'), `${path}: passwordHash leaked`);
    if (path === '/api/conversations') {
      const conversations = JSON.parse(text).conversations;
      if (conversations[0]) {
        const messages = await request(`/api/conversations/${conversations[0].id}/messages`);
        assert.equal(messages.status, 200); const snapshot = await messages.json(); assert.ok(Array.isArray(snapshot.messages));
        console.log('PASS authorized message snapshot');
      }
    }
    console.log(`PASS authenticated ${path}`);
  }
  const csrf = await (await request('/api/auth/csrf')).json();
  const logout = await request('/api/auth/signout', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Auth-Return-Redirect': '1' }, body: new URLSearchParams({ csrfToken: csrf.csrfToken }) });
  await logout.body?.cancel();
  console.log('PASS smoke checks complete; no messages sent or business records changed');
})().catch((error) => { console.error(error.name, error.message); process.exitCode = 1; });
