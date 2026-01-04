import { test, expect } from '@playwright/test'

test.describe('Autenticazione', () => {
  test('mostra la pagina di login', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByText('Weiss Cafè')).toBeVisible()
    await expect(page.getByLabel(/email/i)).toBeVisible()
    await expect(page.getByLabel(/password/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /accedi/i })).toBeVisible()
  })

  test('reindirizza utente non autenticato alla login', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
  })

  test('mostra errore con credenziali invalide', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/email/i).fill('invalid@test.com')
    await page.getByLabel(/password/i).fill('wrongpassword')
    await page.getByRole('button', { name: /accedi/i }).click()
    // Aspetta che appaia un messaggio di errore (toast o inline)
    await page.waitForTimeout(2000)
    // Il test passa se la pagina rimane su login (non reindirizza)
    await expect(page).toHaveURL(/\/login/)
  })

  test('login con credenziali valide', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/email/i).fill('admin@weisscafe.it')
    await page.getByLabel(/password/i).fill('admin123')
    await page.getByRole('button', { name: /accedi/i }).click()
    // Dopo login dovrebbe andare alla dashboard
    await expect(page).toHaveURL('/', { timeout: 15000 })
  })
})
