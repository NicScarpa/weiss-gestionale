import { test, expect } from '@playwright/test'

test.describe('Portale Dipendente', () => {
  test.beforeEach(async ({ page }) => {
    // Login come admin prima di ogni test (poi simula staff)
    await page.goto('/login')
    await page.getByLabel(/email/i).fill('admin@weisscafe.it')
    await page.getByLabel(/password/i).fill('admin123')
    await page.getByRole('button', { name: /accedi/i }).click()
    await expect(page).toHaveURL('/', { timeout: 15000 })
  })

  test('naviga al portale', async ({ page }) => {
    await page.goto('/portale')
    await expect(page).toHaveURL('/portale')
    // Il portale potrebbe reindirizzare o mostrare qualcosa
  })

  test('naviga ai turni personali', async ({ page }) => {
    await page.goto('/portale/turni')
    await expect(page).toHaveURL('/portale/turni')
    await expect(page.getByRole('heading', { name: /turni|i miei/i })).toBeVisible({ timeout: 10000 })
  })

  test('naviga alle ferie', async ({ page }) => {
    await page.goto('/portale/ferie')
    await expect(page).toHaveURL('/portale/ferie')
    await expect(page.getByRole('heading', { name: /ferie|richieste/i })).toBeVisible({ timeout: 10000 })
  })

  test('naviga a nuova richiesta ferie', async ({ page }) => {
    await page.goto('/portale/ferie/nuova')
    await expect(page).toHaveURL('/portale/ferie/nuova')
    await expect(page.getByRole('heading', { name: /nuova|richiesta/i })).toBeVisible({ timeout: 10000 })
  })

  test('naviga al profilo', async ({ page }) => {
    await page.goto('/portale/profilo')
    await expect(page).toHaveURL('/portale/profilo')
    // La pagina mostra il nome utente e la sezione "Informazioni"
    await expect(page.getByText(/informazioni/i)).toBeVisible({ timeout: 10000 })
  })
})
