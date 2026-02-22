import { expect, test } from '@playwright/test';

const PASSWORD = 'PlaywrightPass123!';

function randomSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`;
}

function extractLeagueMaxBid(headerText: string): number | null {
  const match = headerText.match(/League Max Bid:\s*\$(\d+)/);
  return match ? Number.parseInt(match[1], 10) : null;
}

test('updates budget and roster position live after draft actions', async ({ page }) => {
  const suffix = randomSuffix();
  const email = `pw-${suffix}@example.com`;
  const displayName = `PW User ${suffix}`;
  const leagueName = `PW League ${suffix}`;
  const ownerName = `Owner ${suffix}`;
  const teamName = `Team ${suffix}`;

  await page.goto('/register');
  await page.getByLabel('Display name').fill(displayName);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password (min 8 characters)').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByRole('heading', { name: 'Your Leagues' })).toBeVisible();
  await page.getByRole('link', { name: 'Create New League' }).click();

  await expect(page.getByRole('heading', { name: 'League basics' })).toBeVisible();
  await page.getByPlaceholder('My League').fill(leagueName);
  await page.getByRole('button', { name: 'Create league' }).click();
  await expect(page).toHaveURL(/\/config\?leagueId=/);

  const configUrl = new URL(page.url());
  const leagueId = configUrl.searchParams.get('leagueId');
  expect(leagueId).toBeTruthy();

  await expect(page.getByRole('heading', { name: 'Team Manager' })).toBeVisible();
  await page.getByRole('button', { name: 'Add Team' }).click();
  const addTeamForm = page.locator('form').filter({ hasText: 'Add Team' });
  await addTeamForm.locator('label:has-text("Owner Name") + input').fill(ownerName);
  await addTeamForm.locator('label:has-text("Team Name") + input').fill(teamName);
  await addTeamForm.locator('label:has-text("Starting Budget") + input').fill('260');
  await addTeamForm.getByRole('button', { name: 'Add Team' }).click();

  await expect(page.getByText(teamName)).toBeVisible();
  await page.getByRole('button', { name: 'Load sample players' }).click();
  await expect(page.getByRole('button', { name: 'Load sample players' })).toBeVisible();

  await page.goto(`/draft?leagueId=${leagueId}`);
  await expect(page.getByRole('button', { name: 'Draft' })).toBeVisible();
  await expect(page.getByLabel('Search players')).toBeVisible();

  const draftHeader = page.locator('header').first();
  await expect.poll(async () => extractLeagueMaxBid(await draftHeader.innerText())).toBe(240);

  await page.getByLabel('Search players').fill('Fernando Tatis');
  const tatisPoolRow = page.locator('tbody tr', { hasText: 'Fernando Tatis Jr.' }).first();
  await expect(tatisPoolRow).toBeVisible();
  await tatisPoolRow.click();
  await expect(page.getByText(/Recommended bid:/i)).toBeVisible();
  await expect(page.getByText(/Injury risk:/i)).toBeVisible();

  await page.locator('label:has-text("Price") + input').fill('30');
  const dismissButtons = page.getByRole('button', { name: 'Dismiss' });
  while ((await dismissButtons.count()) > 0) {
    await dismissButtons.first().click();
  }
  const confirmPickButton = page.getByRole('button', { name: /confirm pick/i });
  await expect(confirmPickButton).toBeEnabled();
  await confirmPickButton.dispatchEvent('click');
  await expect.poll(async () => extractLeagueMaxBid(await draftHeader.innerText())).toBe(211);

  await page.getByRole('button', { name: 'Roster' }).click();
  const rosterRow = page.locator('tbody tr', { hasText: 'Fernando Tatis Jr.' }).first();
  await expect(rosterRow).toBeVisible();
  await expect(rosterRow.locator('td').first()).toHaveText('OF');

  await rosterRow.locator('select').selectOption('SS');
  await expect(page.getByText('Position updated to SS.')).toBeVisible();
  await expect
    .poll(async () => {
      const movedRow = page.locator('tbody tr', { hasText: 'Fernando Tatis Jr.' }).first();
      return (await movedRow.locator('td').first().innerText()).trim();
    })
    .toBe('SS');
});
