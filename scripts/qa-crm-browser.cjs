/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: 'http://localhost:3101', viewport: { width: 390, height: 844 } });
  const page = await context.newPage(); page.setDefaultTimeout(90000); page.setDefaultNavigationTimeout(90000);
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto('/login'); await page.getByLabel('אימייל').fill('qa-admin@example.test'); await page.getByLabel('סיסמה', { exact: true }).fill('QA-only-Password-2026!');
    await page.getByRole('button', { name: 'התחברות', exact: true }).click(); await page.waitForURL('**/inbox');
    const response = await context.request.post('/api/contacts', { data: { name: `QA service task ${Date.now()}`, phone: '+97250' + String(Date.now()).slice(-7), consentStatus: 'OPTED_OUT', tagIds: [] } });
    assert.equal(response.status(), 201); const contact = (await response.json()).contact;
    await page.goto(`/contacts/${contact.id}`);
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent.includes('פתח שיחה ושייך לנציג') && !button.disabled));
    const opened = page.waitForResponse((res) => res.url().endsWith('/api/conversations') && res.request().method() === 'POST');
    await page.getByRole('button', { name: 'פתח שיחה ושייך לנציג', exact: true }).click(); const openedResponse = await opened; assert.equal(openedResponse.status(), 201);
    const conversation = (await openedResponse.json()).conversation; await page.waitForURL(`**/inbox/${conversation.id}`);
    await page.locator('summary').filter({ hasText: /^משימות מעקב/ }).click();
    const title = `QA follow-up ${Date.now()}`; await page.getByLabel('משימה חדשה', { exact: true }).fill(title);
    await page.getByLabel('מועד יעד למשימה חדשה', { exact: true }).fill('2026-10-01T10:00');
    const created = page.waitForResponse((res) => res.url().endsWith('/api/tasks') && res.request().method() === 'POST');
    await page.getByRole('button', { name: 'צור משימת מעקב', exact: true }).click(); const createdResponse = await created; assert.equal(createdResponse.status(), 201);
    const task = (await createdResponse.json()).task;
    await page.locator('summary').filter({ hasText: title }).click();
    await page.getByLabel(`סטטוס משימה ${task.id}`, { exact: true }).selectOption('DONE');
    const updated = page.waitForResponse((res) => res.url().endsWith(`/api/tasks/${task.id}`) && res.request().method() === 'PATCH');
    await page.getByRole('button', { name: 'שמור משימה', exact: true }).click(); assert.equal((await updated).status(), 200);
    await page.goto(`/contacts/${contact.id}`); await page.locator('summary').filter({ hasText: /^משימות מעקב/ }).click();
    await page.locator('summary').filter({ hasText: title }).filter({ hasText: 'הושלמה' }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const snapshot = (await (await context.request.get(`/api/conversations/${conversation.id}`)).json()).conversation;
    assert.equal(snapshot.messages.length, 0); assert.equal(snapshot.notes.length, 0);
    fs.mkdirSync('/tmp/solina-qa-browser', { recursive: true });
    await page.locator('summary').filter({ hasText: title }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: '/tmp/solina-qa-browser/crm-tasks-mobile.png', fullPage: true });
    assert.deepEqual(errors, []); console.log('PASS opted-out service thread, task creation/completion from inbox, persistence in customer card, mobile layout, zero outbound messages');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error.name, error.message.split('Call log:')[0]); process.exitCode = 1; });
