import { expect, test } from '@playwright/test';

const PASSWORD = 'PlaywrightPass123!';

function randomSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`;
}

test('imports players from CSV in Team Manager and exposes them in draft search', async ({ page }) => {
  const suffix = randomSuffix();
  const email = `pw-import-${suffix}@example.com`;
  const displayName = `PW Import ${suffix}`;
  const leagueName = `Import League ${suffix}`;
  const ownerName = `Owner ${suffix}`;
  const teamName = `Team ${suffix}`;

  await page.goto('/register');
  await page.getByLabel('Display name').fill(displayName);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password (min 8 characters)').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByRole('heading', { name: 'Your Leagues' })).toBeVisible();
  await page.getByRole('link', { name: 'Create New League' }).click();
  await page.getByPlaceholder('My League').fill(leagueName);
  await page.getByRole('button', { name: 'Create league' }).click();

  await expect(page).toHaveURL(/\/config\?leagueId=/);
  const configUrl = new URL(page.url());
  const leagueId = configUrl.searchParams.get('leagueId');
  expect(leagueId).toBeTruthy();

  await page.getByRole('button', { name: 'Add Team' }).click();
  const addTeamForm = page.locator('form').filter({ hasText: 'Add Team' });
  await addTeamForm.locator('label:has-text("Owner Name") + input').fill(ownerName);
  await addTeamForm.locator('label:has-text("Team Name") + input').fill(teamName);
  await addTeamForm.locator('label:has-text("Starting Budget") + input').fill('260');
  await addTeamForm.getByRole('button', { name: 'Add Team' }).click();

  const csv = [
    'name,team,positions,projectedValue,adp,HR,RBI,AVG',
    'Test Import Star,NYY,OF,31,22,35,102,.291',
    'Test Import Arm,LAD,P,24,44,,,',
  ].join('\n');

  await page.locator('input[type="file"]').setInputFiles({
    name: 'players.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf-8'),
  });

  await expect(page.getByRole('status')).toContainText('Imported 2 players');

  await page.goto(`/draft?leagueId=${leagueId}`);
  await expect(page.getByLabel('Search players')).toBeVisible();

  await page.getByLabel('Search players').fill('Test Import Star');
  await expect(page.locator('tbody tr', { hasText: 'Test Import Star' }).first()).toBeVisible();
});
