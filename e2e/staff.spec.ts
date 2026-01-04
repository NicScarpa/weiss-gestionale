import { test, expect } from '@playwright/test'

test.describe('Gestione Staff', () => {
  test.beforeEach(async ({ page }) => {
    // Login come admin prima di ogni test
    await page.goto('/login')
    await page.getByLabel(/email/i).fill('admin@weisscafe.it')
    await page.getByLabel(/password/i).fill('admin123')
    await page.getByRole('button', { name: /accedi/i }).click()
    await expect(page).toHaveURL('/', { timeout: 15000 })
  })

  test('naviga alla pagina staff', async ({ page }) => {
    await page.goto('/staff')
    await expect(page).toHaveURL('/staff')
    await expect(page.getByRole('heading', { name: /personale|staff|dipendenti/i })).toBeVisible({ timeout: 10000 })
  })

  test('mostra lista dipendenti', async ({ page }) => {
    await page.goto('/staff')
    // La pagina dovrebbe caricare e mostrare almeno l'admin
    await page.waitForLoadState('networkidle')
    await expect(page.locator('table, [data-testid="staff-list"]')).toBeVisible({ timeout: 10000 })
  })

  test('naviga alla pagina vincoli relazionali', async ({ page }) => {
    await page.goto('/staff/vincoli-relazionali')
    await expect(page).toHaveURL('/staff/vincoli-relazionali')
    await expect(page.getByRole('heading', { name: /vincoli|relazionali/i })).toBeVisible({ timeout: 10000 })
  })
})
