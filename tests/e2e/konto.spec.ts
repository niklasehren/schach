import { expect, test } from '@playwright/test';

test('Einstellungen ohne Konto: Anmelden/Registrieren, Datenschutzhinweis, Supabase wird nicht geladen', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.goto('/#/einstellungen');
  const card = page.getByTestId('account-card');
  await expect(card).toContainText('Ohne Konto bleibt alles nur auf diesem Gerät');
  await expect(card.getByLabel('Benutzername oder E-Mail')).toBeVisible();
  await card.getByRole('tab', { name: 'Registrieren' }).click();
  await expect(card.getByLabel('Einladungscode')).toBeVisible();
  await expect(page.getByTestId('admin-card')).toHaveCount(0);
  const privacy = page.getByTestId('privacy-card');
  await expect(privacy).toContainText('Frankfurt am Main');
  await expect(privacy).toContainText('Row Level Security');
  await expect(privacy).toContainText('„Konto löschen“');
  // Ohne Konto: weder Supabase-Code noch Anfragen an den Server
  await page.waitForTimeout(500);
  expect(requests.filter((u) => u.includes('supabase'))).toEqual([]);
  // Passwort zu kurz → Hinweis, ohne Anfrage an den Server
  await card.getByLabel('E-Mail').fill('jemand@example.com');
  await card.getByLabel('Einladungscode').fill('ABCD-EFGH');
  await card.getByLabel(/^Benutzername/).fill('jemand');
  await card.getByLabel(/^Passwort/).fill('kurz');
  await card.getByRole('button', { name: 'Konto anlegen' }).click();
  await expect(page.getByTestId('account-error')).toHaveText('Das Passwort muss mindestens 8 Zeichen haben.');
  await page.screenshot({ path: `test-results/konto-${test.info().project.name}.png`, fullPage: true });
});
