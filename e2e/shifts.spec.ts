import { test, expect } from '@playwright/test'

test.describe('Gestione Turni', () => {
  test.beforeEach(async ({ page }) => {
    // Login come admin prima di ogni test
    await page.goto('/login')
    await page.getByLabel(/email/i).fill('admin@weisscafe.it')
    await page.getByLabel(/password/i).fill('admin123')
    await page.getByRole('button', { name: /accedi/i }).click()
    await expect(page).toHaveURL('/', { timeout: 15000 })
  })

  test('naviga alla pagina turni', async ({ page }) => {
    await page.goto('/turni')
    await expect(page).toHaveURL('/turni')
    await expect(page.getByRole('heading', { name: /turni|pianificazione/i })).toBeVisible({ timeout: 10000 })
  })

  test('mostra pulsante nuova pianificazione', async ({ page }) => {
    await page.goto('/turni')
    await expect(page.getByRole('link', { name: /nuova|crea/i })).toBeVisible({ timeout: 10000 })
  })

  test('naviga alla pagina definizioni turni', async ({ page }) => {
    await page.goto('/turni/definizioni')
    await expect(page).toHaveURL('/turni/definizioni')
    await expect(page.getByRole('heading', { name: /definizioni|tipi turno/i })).toBeVisible({ timeout: 10000 })
  })

  test('naviga alla pagina nuova pianificazione', async ({ page }) => {
    await page.goto('/turni/nuovo')
    await expect(page).toHaveURL('/turni/nuovo')
    await expect(page.getByRole('heading', { name: /nuova|crea|pianificazione/i })).toBeVisible({ timeout: 10000 })
  })
})
