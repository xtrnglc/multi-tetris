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

test('either player can switch to Sprint 40L and the run shows lines left and a timer', async ({
  browser,
}) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();

  await a.goto('/');
  await a.getByRole('button', { name: 'Create room' }).click();
  const code = (await a.getByTestId('room-code').textContent())!.trim();
  await b.goto(`/r/${code}`);
  await expect(a.getByTestId('slot-1')).toContainText('Partner');

  await a.getByRole('button', { name: 'Ready', exact: true }).click();
  await expect(b.getByTestId('slot-0')).toContainText('READY');
  await b.getByRole('button', { name: 'Sprint 40L' }).click();
  await expect(a.getByRole('button', { name: 'Sprint 40L' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(b.getByTestId('slot-0')).not.toContainText('READY');

  await a.getByRole('button', { name: 'Ready', exact: true }).click();
  await b.getByRole('button', { name: 'Ready', exact: true }).click();
  await expect(a.getByTestId('game')).toHaveAttribute('data-phase', 'playing', {
    timeout: 10_000,
  });

  const bar = a.getByTestId('score-bar');
  await expect(bar).toContainText('LEFT 40');
  await expect(bar).toContainText('40L');
  await expect(bar).toContainText(/\d+:\d\d\.\d\d/);
});
