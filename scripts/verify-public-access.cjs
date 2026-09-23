/* eslint-disable @typescript-eslint/no-require-imports -- Standalone verification script. */
require('@next/env').loadEnvConfig(process.cwd());
const assert = require('node:assert/strict');
(async () => {
  const tables = ['User', 'Contact', 'Message', 'ProviderCredential'];
  for (const table of tables) {
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${table}?select=id&limit=1`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` },
      signal: AbortSignal.timeout(10000),
    });
    await response.body?.cancel();
    assert.ok([401, 403].includes(response.status), `${table}: unexpected status ${response.status}`);
    console.log(`${table}: public request blocked (${response.status})`);
  }
})().catch((error) => { console.error(error.name, error.message); process.exitCode = 1; });
