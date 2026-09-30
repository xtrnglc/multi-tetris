import { expect, test } from '@playwright/test';

test('two players create, join, ready up, and both see a hard drop', async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();

  await a.goto('/');
  await a.getByRole('button', { name: 'Create room' }).click();
  const code = (await a.getByTestId('room-code').textContent())!.trim();
  expect(code).toMatch(/^[A-Z0-9]{4}$/);

  await b.goto(`/r/${code}`);
  await expect(a.getByTestId('slot-1')).toContainText('Partner');

  await a.getByRole('button', { name: 'Ready', exact: true }).click();
  await b.getByRole('button', { name: 'Ready', exact: true }).click();

  const gameA = a.getByTestId('game');
  const gameB = b.getByTestId('game');
  await expect(gameA).toHaveAttribute('data-phase', 'playing', { timeout: 10_000 });

  await a.keyboard.press('Space');
  await expect(gameA).toHaveAttribute('data-lock-count', '1');
  await expect(gameB).toHaveAttribute('data-lock-count', '1');
});
