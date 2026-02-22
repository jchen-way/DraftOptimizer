import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'PlaywrightPass123!';

function randomSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`;
}

async function dismissNewsToasts(page: Page): Promise<void> {
  const dismissButtons = page.getByRole('button', { name: 'Dismiss' });
  while ((await dismissButtons.count()) > 0) {
    await dismissButtons.first().click();
  }
}

test('enforces main roster slot limits and unlocks taxi round with free bench picks', async ({ page }) => {
  const suffix = randomSuffix();
  const email = `pw-taxi-${suffix}@example.com`;
  const displayName = `PW Taxi ${suffix}`;
  const leagueName = `Taxi League ${suffix}`;
  const ownerOne = `Owner A ${suffix}`;
  const ownerTwo = `Owner B ${suffix}`;

  await page.goto('/register');
  await page.getByLabel('Display name').fill(displayName);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password (min 8 characters)').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByRole('heading', { name: 'Your Leagues' })).toBeVisible();
  await page.getByRole('link', { name: 'Create New League' }).click();

  await page.getByPlaceholder('My League').fill(leagueName);
  await page.locator('label:has-text("Bench Slots (Taxi Round)") + input').fill('1');
  await page.locator('label:text-is("C") + input').fill('0');
  await page.locator('label:text-is("1B") + input').fill('1');
  await page.locator('label:text-is("2B") + input').fill('0');
  await page.locator('label:text-is("3B") + input').fill('0');
  await page.locator('label:text-is("SS") + input').fill('0');
  await page.locator('label:text-is("OF") + input').fill('0');
  await page.locator('label:text-is("UTIL") + input').fill('0');
  await page.locator('label:text-is("P") + input').fill('0');
  await page.getByRole('button', { name: 'Create league' }).click();

  await expect(page).toHaveURL(/\/config\?leagueId=/);
  const leagueId = new URL(page.url()).searchParams.get('leagueId');
  expect(leagueId).toBeTruthy();

  await page.getByRole('button', { name: 'Add Team' }).click();
  let addTeamForm = page.locator('form').filter({ hasText: 'Add Team' });
  await addTeamForm.locator('label:has-text("Owner Name") + input').fill(ownerOne);
  await addTeamForm.locator('label:has-text("Team Name") + input').fill('Team A');
  await addTeamForm.locator('label:has-text("Starting Budget") + input').fill('260');
  await addTeamForm.getByRole('button', { name: 'Add Team' }).click();

  await page.getByRole('button', { name: 'Add Team' }).click();
  addTeamForm = page.locator('form').filter({ hasText: 'Add Team' });
  await addTeamForm.locator('label:has-text("Owner Name") + input').fill(ownerTwo);
  await addTeamForm.locator('label:has-text("Team Name") + input').fill('Team B');
  await addTeamForm.locator('label:has-text("Starting Budget") + input').fill('260');
  await addTeamForm.getByRole('button', { name: 'Add Team' }).click();

  await page.getByRole('button', { name: 'Load sample players' }).click();
  await expect(page.getByRole('status')).toContainText('Seeded sample players');

  await page.goto(`/draft?leagueId=${leagueId}`);
  await expect(page.getByRole('button', { name: 'Draft' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start Taxi Round' })).toHaveCount(0);

  const teamSelect = page.locator('label:has-text("Team") + select').first();
  const priceInput = page.locator('label:has-text("Price") + input').first();
  const getTeamOptionValue = async (ownerName: string) => {
    const option = teamSelect.locator('option', { hasText: ownerName }).first();
    const value = await option.getAttribute('value');
    expect(value).toBeTruthy();
    return value as string;
  };

  await page.getByLabel('Filter by position').selectOption('1B');
  const firstOneBRow = page.locator('tbody tr').first();
  await expect(firstOneBRow).toBeVisible();
  await firstOneBRow.click();
  await teamSelect.selectOption(await getTeamOptionValue(ownerOne));
  await priceInput.fill('1');
  await dismissNewsToasts(page);
  await page.getByRole('button', { name: /confirm pick/i }).dispatchEvent('click');
  await expect(page.locator('header').first()).toContainText('1 / 2');

  const secondOneBRow = page.locator('tbody tr').first();
  await expect(secondOneBRow).toBeVisible();
  await secondOneBRow.click();
  await expect(secondOneBRow).toHaveAttribute('aria-selected', 'true');
  await expect(teamSelect.locator('option', { hasText: ownerOne })).toBeDisabled();
  await expect(teamSelect.locator('option', { hasText: ownerTwo })).toBeEnabled();
  await teamSelect.selectOption(await getTeamOptionValue(ownerTwo));
  await priceInput.fill('1');
  await dismissNewsToasts(page);
  await page.getByRole('button', { name: /confirm pick/i }).dispatchEvent('click');

  const startTaxiButton = page.getByRole('button', { name: 'Start Taxi Round' });
  await expect(startTaxiButton).toBeVisible();
  await startTaxiButton.click();

  await expect(page.getByText('Taxi Round Active · Free bench picks')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Budget Tracker' })).toHaveCount(0);
  await expect(page.getByText('Select a player from the pool to add a free taxi pick.')).toBeVisible();

  await page.getByLabel('Filter by position').selectOption('');
  await page.getByLabel('Search players').fill('');
  const firstTaxiRow = page.locator('tbody tr').first();
  await expect(firstTaxiRow).toBeVisible();
  await firstTaxiRow.dispatchEvent('click');
  const addTaxiButton = page.getByRole('button', { name: /add taxi pick \(free\)/i });
  await expect(addTaxiButton).toBeVisible();
  await teamSelect.selectOption(await getTeamOptionValue(ownerOne));
  await dismissNewsToasts(page);
  await expect(addTaxiButton).toBeEnabled();
  await addTaxiButton.click({ force: true });
  await expect(page.locator('header').first()).toContainText('1 / 2');
  await expect(page.getByText(/\|\s*\$0/)).toBeVisible();

  const secondTaxiRow = page.locator('tbody tr').first();
  await expect(secondTaxiRow).toBeVisible();
  await secondTaxiRow.click();
  await teamSelect.selectOption(await getTeamOptionValue(ownerTwo));
  await dismissNewsToasts(page);
  await expect(addTaxiButton).toBeEnabled();
  await addTaxiButton.click({ force: true });

  await expect(page.locator('header').first()).toContainText('2 / 2');
  const analyzeButton = page.getByRole('link', { name: 'Analyze Post-Draft' });
  await expect(analyzeButton).toBeVisible();
  await analyzeButton.click();

  await expect(page).toHaveURL(/\/post-draft\?leagueId=/);
  await expect(page.getByRole('heading', { name: 'Post-Draft Analysis' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export My Roster + Stats' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export All Rosters + Stats' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export Draft Pick Log' })).toBeVisible();
});
