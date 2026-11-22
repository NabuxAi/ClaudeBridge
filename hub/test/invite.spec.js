import { test, expect } from '@playwright/test'

const TOKEN = 'a'.repeat(64)
const pending = (hasAccount) => ({
  state: 'pending', siteId: 'bodogame-com', site: 'bodogame.com', role: 'admin', roleLabel: 'Admin',
  email: 'invitee@example.com', hasAccount, expiresAt: Date.now() + 86400000,
})

async function setup(page, { hasAccount, signedIn = false, state = null }) {
  await page.addInitScript((signedIn) => {
    localStorage.setItem('digiwp.lang', 'en')
    if (signedIn) localStorage.setItem('digiwp.token', 'test-session')
  }, signedIn)
  const calls = []
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    calls.push(path)
    if (path === '/api/auth/me') return signedIn ? route.fulfill({ json: { id: 'u1', name: 'Invitee', email: 'invitee@example.com' } }) : route.fulfill({ status: 401, json: { message: 'no' } })
    if (path === '/api/auth/invitation') return route.fulfill({ json: state || pending(hasAccount) })
    if (path === '/api/team/invitations/accept') return route.fulfill({ status: 201, json: { siteId: 'bodogame-com', role: 'admin' } })
    if (path === '/api/auth/challenge-state') return route.fulfill({ json: { captchaRequired: false } })
    if (path === '/api/auth/captcha') return route.fulfill({ json: { id: 'c', question: '1 + 1' } })
    return route.fulfill({ status: 404, json: { message: 'Unexpected test API call' } })
  })
  return calls
}

test('an invitee who already has an account is sent to sign in, never to register', async ({ page }) => {
  await setup(page, { hasAccount: true })
  await page.goto(`/invite?token=${TOKEN}`)
  await expect(page.getByText('bodogame.com')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in to accept' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.locator('input[type=email]')).toHaveValue('invitee@example.com')
})

test('an old register link for an existing account goes to the invite page instead', async ({ page }) => {
  await setup(page, { hasAccount: true })
  await page.goto(`/register?invite=${TOKEN}&email=invitee%40example.com`)
  await expect(page).toHaveURL(new RegExp(`/invite\\?token=${TOKEN}`))
  await expect(page.getByRole('button', { name: 'Sign in to accept' })).toBeVisible()
})

test('a new invitee is sent to register with the token and address', async ({ page }) => {
  await setup(page, { hasAccount: false })
  await page.goto(`/invite?token=${TOKEN}`)
  await page.getByRole('button', { name: 'Create an account and join' }).click()
  await expect(page).toHaveURL(new RegExp(`/register\\?invite=${TOKEN}&email=invitee%40example.com`))
  await expect(page.locator('input[type=email]')).toHaveValue('invitee@example.com')
})

test('signed in, the invitation is accepted on the spot and opens the site', async ({ page }) => {
  const calls = await setup(page, { hasAccount: true, signedIn: true })
  await page.goto(`/invite?token=${TOKEN}`)
  await page.getByRole('button', { name: 'Accept invitation' }).click()
  await expect(page.getByText('You\'re now a member of bodogame.com.')).toBeVisible()
  expect(calls).toContain('/api/team/invitations/accept')
  await expect(page.getByRole('button', { name: 'Open the site' })).toBeVisible()
})

test('a spent or expired link says so plainly', async ({ page }) => {
  await setup(page, { hasAccount: false, state: { state: 'gone' } })
  await page.goto(`/invite?token=${TOKEN}`)
  await expect(page.getByText(/expired, been used, or been revoked/)).toBeVisible()
})
