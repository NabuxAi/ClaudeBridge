import { test, expect } from '@playwright/test'

const user = { id: 'u1', name: 'Ali', initials: 'A', email: 'owner@example.com', role: 'owner', lang: 'en' }
const options = { regions: [{ id: 'unknown', label: 'Unknown', note: '' }], providers: [{ id: 'other', label: 'Other', region: 'unknown' }] }
const NEW_KEY = 'b'.repeat(64)

async function setup(page, role) {
  await page.addInitScript(() => {
    localStorage.setItem('digiwp.token', 'key-test-session')
    localStorage.setItem('digiwp.lang', 'en')
  })
  const calls = []
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    calls.push(`${route.request().method()} ${path}`)
    if (path === '/api/auth/me' || path === '/api/profile') return route.fulfill({ json: user })
    if (path === '/api/sites') return route.fulfill({ json: [{ id: 'shop', name: 'shop.example.com', title: 'Shop', url: 'https://shop.example.com', status: 'healthy', authority: 'confirm', paired: true, role, hosting: {} }] })
    if (path === '/api/hosting/options') return route.fulfill({ json: options })
    if (path === '/api/sites/shop/ping') {
      return route.fulfill({ status: 502, json: { ok: false, message: 'The connection key on the site no longer matches this panel.' } })
    }
    if (path === '/api/sites/shop/connection-key') {
      const body = route.request().postDataJSON()
      if (body?.confirm !== true) return route.fulfill({ status: 400, json: { message: 'confirm' } })
      return route.fulfill({ json: { pairing: { serverUrl: 'https://wp.example/api', secret: NEW_KEY } } })
    }
    return route.fulfill({ json: {} })
  })
  await page.goto('/site/shop/hosting')
  return calls
}

test('the connection check shows the site\'s own refusal reason', async ({ page }) => {
  await setup(page, 'admin')
  await page.getByRole('button', { name: 'Check connection' }).click()
  await expect(page.getByRole('alert')).toContainText('no longer matches this panel')
  // Issuing a key is the owner's; an admin does not get the button.
  await expect(page.getByRole('button', { name: 'Issue a new key' })).toHaveCount(0)
})

test('the owner issues a new key only after confirming, and sees it once', async ({ page }) => {
  const calls = await setup(page, 'owner')
  await page.getByRole('button', { name: 'Issue a new key' }).click()
  await expect(page.getByRole('dialog')).toContainText('stops working immediately')
  await page.getByRole('button', { name: 'Cancel' }).click()
  expect(calls).not.toContain('POST /api/sites/shop/connection-key')

  await page.getByRole('button', { name: 'Issue a new key' }).click()
  await page.getByRole('button', { name: 'Issue new key' }).click()
  await expect(page.getByText(NEW_KEY)).toBeVisible()
  await expect(page.getByText('This key is shown only now.')).toBeVisible()
  expect(calls).toContain('POST /api/sites/shop/connection-key')
})

test('a viewer does not see the connection key card', async ({ page }) => {
  await setup(page, 'viewer')
  await expect(page.getByRole('heading').first()).toBeVisible()
  await expect(page.getByText('Connection key')).toHaveCount(0)
})
