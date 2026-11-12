// Live: Registrieren mit Einladung, zweites Gerät per Benutzername, Abmelden, Konto löschen – über die Oberfläche.
import { execFileSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';

function sql<T = Record<string, unknown>>(query: string): T[] {
  const out = execFileSync('npx', ['supabase', 'db', 'query', '--remote', '--yes', '--output-format', 'json', query], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return (JSON.parse(out.slice(out.indexOf('{'))).rows ?? []) as T[];
}

const RUN = Date.now().toString(36);
const U = { email: `schach-test-ui-${RUN}@example.com`, username: `ui_${RUN}`, code: 'UUUU7777', password: `Ui-Passwort-${RUN}` };

/** Zählt bzw. schreibt direkt in die lokale IndexedDB der App (wie „vorhandene Daten ohne Konto“) */
const localCount = (page: Page, store: string) =>
  page.evaluate(
    (s) =>
      new Promise<number>((resolve, reject) => {
        const req = indexedDB.open('schach');
        req.onsuccess = () => {
          const r = req.result.transaction(s).objectStore(s).count();
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        };
      }),
    store,
  );

test.beforeAll(() => {
  sql(`insert into public.invites (email, code_hash) values ('${U.email}', extensions.crypt('${U.code}', extensions.gen_salt('bf')))`);
});
test.afterAll(() => {
  sql(`delete from auth.users where email like 'schach-test-%@example.com'`);
  sql(`delete from public.invites where email like 'schach-test-%@example.com'`);
});

test('Konto: Registrieren übernimmt lokale Daten, zweites Gerät bekommt sie, Abmelden leert nur das Gerät, Konto löschen', async ({ browser }) => {
  // Gerät 1: hat schon eine Einstellung lokal (ohne Konto entstanden)
  const dev1 = await (await browser.newContext()).newPage();
  await dev1.goto('./#/einstellungen');
  await expect(dev1.getByTestId('account-card')).toContainText('Anmelden');
  await dev1.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const req = indexedDB.open('schach');
        req.onsuccess = () => {
          const tx = req.result.transaction('settings', 'readwrite');
          tx.objectStore('settings').put({ key: 'ui-test', value: 'vor dem Konto' });
          tx.oncomplete = () => resolve();
        };
      }),
  );
  // Falscher Code wird abgelehnt
  await dev1.getByRole('tab', { name: 'Registrieren' }).click();
  await dev1.getByLabel('E-Mail').fill(U.email);
  await dev1.getByLabel('Einladungscode').fill('FALSCH22');
  await dev1.getByLabel(/^Benutzername/).fill(U.username);
  await dev1.getByLabel(/^Passwort/).fill(U.password);
  await dev1.getByRole('button', { name: 'Konto anlegen' }).click();
  await expect(dev1.getByTestId('account-error')).toContainText('Keine gültige Einladung');
  await dev1.getByLabel('Einladungscode').fill(U.code.toLowerCase());
  await dev1.getByRole('button', { name: 'Konto anlegen' }).click();
  await expect(dev1.getByTestId('account-user')).toHaveText(`Angemeldet als ${U.username}`);
  await expect(dev1.getByTestId('sync-status')).toContainText('Zuletzt abgeglichen', { timeout: 30_000 });
  await expect(dev1.getByTestId('admin-card')).toHaveCount(0);
  const uid = sql<{ id: string }>(`select id::text as id from auth.users where email = '${U.email}'`)[0].id;
  expect(sql(`select data->>'value' as v from public.settings where user_id = '${uid}' and id = 'ui-test'`)).toEqual([{ v: 'vor dem Konto' }]);

  // Gerät 2: Anmelden mit Benutzername → bekommt die Daten
  const dev2 = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await dev2.goto('./#/einstellungen');
  await dev2.getByLabel('Benutzername oder E-Mail').fill(U.username);
  await dev2.getByLabel('Passwort').fill(U.password);
  await dev2.getByRole('button', { name: 'Anmelden' }).click();
  await expect(dev2.getByTestId('account-user')).toHaveText(`Angemeldet als ${U.username}`);
  await expect(dev2.getByTestId('sync-status')).toContainText('Zuletzt abgeglichen', { timeout: 30_000 });
  await expect.poll(() => localCount(dev2, 'settings')).toBeGreaterThanOrEqual(1);
  await dev2.screenshot({ path: `test-results/konto-angemeldet-handy.png`, fullPage: true });

  // Nach Neuladen bleibt Gerät 2 angemeldet
  await dev2.reload();
  await expect(dev2.getByTestId('account-user')).toHaveText(`Angemeldet als ${U.username}`);

  // Abmelden auf Gerät 2: lokal leer, im Konto bleibt alles
  await dev2.getByTestId('sign-out').click();
  await dev2.getByRole('dialog').getByRole('button', { name: 'Abmelden' }).click();
  await expect(dev2.getByTestId('account-card')).toContainText('Benutzername oder E-Mail');
  await expect.poll(() => localCount(dev2, 'settings')).toBe(0);
  expect(sql(`select count(*)::int as n from public.settings where user_id = '${uid}' and not deleted`)).toEqual([{ n: 1 }]);

  // Konto löschen auf Gerät 1
  await dev1.getByTestId('delete-account').click();
  await expect(dev1.getByTestId('confirm-delete')).toBeDisabled();
  await dev1.getByLabel(/Zur Bestätigung/).fill(U.username);
  await dev1.getByTestId('confirm-delete').click();
  await expect(dev1.getByTestId('account-card')).toContainText('Benutzername oder E-Mail');
  expect(sql(`select (select count(*) from auth.users where id = '${uid}') + (select count(*) from public.settings where user_id = '${uid}') as n`)).toEqual([{ n: 0 }]);
  await expect.poll(() => localCount(dev1, 'settings')).toBe(0);
});
