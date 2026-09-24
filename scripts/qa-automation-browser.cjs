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
    await page.goto('/login'); await page.getByLabel('אימייל').fill('qa-admin@example.test');
    await page.getByLabel('סיסמה', { exact: true }).fill('QA-only-Password-2026!');
    await page.getByRole('button', { name: 'התחברות', exact: true }).click(); await page.waitForURL('**/inbox');
    await page.goto('/automations'); await page.getByRole('button', { name: 'חוק אוטומציה חדש' }).click();
    await page.getByLabel('שם חוק האוטומציה').fill(`QA inactive ${Date.now()}`);
    await page.getByLabel('פעולת האוטומציה').click(); await page.getByRole('option', { name: 'הוספת הערה פנימית', exact: true }).click();
    await page.getByLabel('תוכן ההערה האוטומטית').fill('QA preview must not write this note');
    const select = page.getByLabel('שיחה לבדיקת אוטומציה');
    const id = await select.locator('option').nth(1).getAttribute('value'); assert.ok(id); await select.selectOption(id);
    const before = (await (await context.request.get(`/api/conversations/${id}`)).json()).conversation;
    assert.equal(await page.getByRole('checkbox', { name: 'הפעל את החוק לאחר השמירה' }).isChecked(), false);
    await page.getByRole('button', { name: 'בדוק ללא ביצוע', exact: true }).click(); await page.getByText('הבדיקות המקומיות עברו', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    fs.mkdirSync('/tmp/solina-qa-browser', { recursive: true });
    await page.screenshot({ path: '/tmp/solina-qa-browser/automation-dry-run-mobile.png', fullPage: true });
    const saved = page.waitForResponse((response) => response.url().endsWith('/api/automations') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'צור חוק', exact: true }).click(); const response = await saved; assert.equal(response.status(), 201);
    assert.equal((await response.json()).rule.isActive, false);
    const after = (await (await context.request.get(`/api/conversations/${id}`)).json()).conversation;
    assert.deepEqual(after.notes, before.notes); assert.deepEqual(after.messages, before.messages);
    assert.deepEqual(errors, []);
    console.log('PASS mobile automation dry-run, inactive-by-default save, no notes/messages written, no runtime errors');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error.name, error.message.split('Call log:')[0]); process.exitCode = 1; });
