import { Page, expect } from '@playwright/test'

/**
 * Credenziali test per i diversi ruoli
 */
export const TEST_CREDENTIALS = {
  admin: {
    email: 'admin@weisscafe.it',
    password: 'admin123',
  },
  manager: {
    email: 'manager@weisscafe.it',
    password: 'manager123',
  },
  staff: {
    email: 'staff@weisscafe.it',
    password: 'staff123',
  },
}

/**
 * Login generico con email e password
 */
export async function login(
  page: Page,
  email: string,
  password: string,
  expectedUrl?: string | RegExp
) {
  await page.goto('/login')
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill(password)
  await page.getByRole('button', { name: /accedi/i }).click()

  if (expectedUrl) {
    await expect(page).toHaveURL(expectedUrl, { timeout: 15000 })
  } else {
    // Aspetta che non sia più sulla pagina login
    await page.waitForURL((url) => !url.pathname.includes('/login'), {
      timeout: 15000,
    })
  }
}

/**
 * Login come Admin - reindirizza a dashboard
 */
export async function loginAsAdmin(page: Page) {
  await login(
    page,
    TEST_CREDENTIALS.admin.email,
    TEST_CREDENTIALS.admin.password,
    '/'
  )
}

/**
 * Login come Manager - reindirizza a dashboard
 */
export async function loginAsManager(page: Page) {
  await login(
    page,
    TEST_CREDENTIALS.manager.email,
    TEST_CREDENTIALS.manager.password,
    '/'
  )
}

/**
 * Login come Staff - reindirizza al portale dipendente
 */
export async function loginAsStaff(page: Page) {
  await login(
    page,
    TEST_CREDENTIALS.staff.email,
    TEST_CREDENTIALS.staff.password,
    '/portale'
  )
}

/**
 * Logout dall'applicazione
 */
export async function logout(page: Page) {
  // Cerca il menu utente o pulsante logout
  const userMenu = page.getByRole('button', { name: /profilo|utente|menu/i })
  if (await userMenu.isVisible()) {
    await userMenu.click()
    await page.getByRole('menuitem', { name: /esci|logout/i }).click()
  } else {
    // Fallback: vai direttamente all'API di logout
    await page.goto('/api/auth/signout')
    const confirmButton = page.getByRole('button', { name: /sign out|esci/i })
    if (await confirmButton.isVisible()) {
      await confirmButton.click()
    }
  }

  await expect(page).toHaveURL(/\/login/, { timeout: 10000 })
}

/**
 * Verifica che l'utente sia autenticato controllando elementi comuni
 */
export async function expectAuthenticated(page: Page) {
  // Verifica che non sia sulla pagina login
  await expect(page).not.toHaveURL(/\/login/)
}

/**
 * Verifica che l'utente NON sia autenticato
 */
export async function expectNotAuthenticated(page: Page) {
  await expect(page).toHaveURL(/\/login/)
}
