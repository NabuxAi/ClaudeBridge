import { test, expect } from '@playwright/test'

const user = { id: 'panel-owner', name: 'Ali', initials: 'A', email: 'owner@example.com', role: 'owner', lang: 'en' }
const sites = [
  { id: 'shop', name: 'shop.example.com', title: 'WordPress store', url: 'https://shop.example.com', status: 'healthy', authority: 'confirm', paired: true, incidents: 0, pendingUpdates: null, uptime: null },
  { id: 'blog', name: 'example.com/blog', title: 'WordPress blog', url: 'https://example.com/blog', status: 'warning', authority: 'report', paired: true, incidents: 1, pendingUpdates: null, uptime: null },
]

async function setup(page, { lang = 'en', theme = 'dark', path = '/app' } = {}) {
  await page.addInitScript(({ lang, theme }) => {
    localStorage.setItem('digiwp.token', 'panel-test-session')
    localStorage.setItem('digiwp.lang', lang)
    if (!localStorage.getItem('digiwp.panel.theme')) localStorage.setItem('digiwp.panel.theme', theme)
  }, { lang, theme })
  const requests = []
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    requests.push(path)
    if (path === '/api/auth/me' || path === '/api/profile') return route.fulfill({ json: { ...user, lang } })
    if (path === '/api/sites') return route.fulfill({ json: sites })
    if (path === '/api/account/activity') return route.fulfill({ json: { events: [] } })
    if (path === '/api/sites/shop/settings') return route.fulfill({ status: 503, json: { message: 'No reading available in this fixture.' } })
    if (path === '/api/auth/logout') return route.fulfill({ json: { ok: true } })
    return route.fulfill({ json: {} })
  })
  await page.goto(path)
  await expect(page.locator('.panel-frame')).toBeVisible()
  return requests
}

test('theme and collapsed menu persist across page switches and reloads', async ({ page }) => {
  await setup(page)
  await page.getByRole('button', { name: 'Switch to light theme' }).click()
  await expect(page.locator('.panel-frame')).toHaveAttribute('data-panel-theme', 'light')
  await page.getByRole('button', { name: 'Collapse menu' }).click()
  await expect(page.locator('.panel-frame')).toHaveClass(/is-collapsed/)
  await page.getByRole('navigation').getByRole('link', { name: 'My sites', exact: true }).click()
  await expect(page).toHaveURL(/\/app\/sites$/)
  await expect(page.locator('.panel-frame')).toHaveClass(/is-collapsed/)
  await page.reload()
  await expect(page.getByRole('link', { name: 'Release notes — version 0.2.0' })).toContainText('v0.2.0')
  await expect(page.locator('.panel-frame')).toHaveAttribute('data-panel-theme', 'light')
  await expect(page.locator('.panel-frame')).toHaveClass(/is-collapsed/)
})

test('menu search and Ctrl+K work when the menu is collapsed', async ({ page }) => {
  await setup(page)
  await page.getByRole('button', { name: 'Collapse menu' }).click()
  await page.keyboard.press('Control+k')
  const search = page.getByRole('searchbox', { name: 'Search the menu' })
  await expect(search).toBeFocused()
  await expect(page.locator('.panel-frame')).not.toHaveClass(/is-collapsed/)
  await search.fill('security')
  await expect(page.getByRole('navigation').getByRole('link')).toHaveCount(1)
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Account security' })).toBeVisible()
  await search.fill('missing-item')
  await expect(page.getByText('No menu items match your search.')).toBeVisible()
})

test('page changes and refresh fetch data without a new document; progress follows pending data', async ({ page }) => {
  const requests = await setup(page)
  await expect(page.getByRole('heading', { name: 'Hello, Ali' })).toBeVisible()
  await expect(page.locator('.panel-progress')).toHaveAttribute('data-active', 'false')
  await page.evaluate(() => { window.panelLifetime = 'same-document' })
  let release
  const pending = new Promise((resolve) => { release = resolve })
  await page.route('**/api/sites', async (route) => { await pending; await route.fulfill({ json: sites }) })
  await page.getByRole('navigation').getByRole('link', { name: 'My sites', exact: true }).click()
  await expect(page.locator('.panel-progress')).toHaveAttribute('data-active', 'true')
  await expect(page.getByRole('navigation')).toBeVisible()
  expect(await page.evaluate(() => window.panelLifetime)).toBe('same-document')
  release()
  await expect(page.getByText('shop.example.com', { exact: true })).toBeVisible()
  await expect(page.locator('.panel-progress')).toHaveAttribute('data-active', 'false')
  await page.unroute('**/api/sites')
  const before = requests.filter((path) => path === '/api/sites').length
  await page.getByRole('button', { name: 'Refresh page data' }).click()
  await expect.poll(() => requests.filter((path) => path === '/api/sites').length).toBeGreaterThan(before)
  expect(await page.evaluate(() => window.panelLifetime)).toBe('same-document')
})

test('a lazy route keeps the shell visible while its module loads', async ({ page }) => {
  await setup(page)
  let release
  let held = false
  const pending = new Promise((resolve) => { release = resolve })
  await page.route(/\/assets\/Sites-[^/]+\.js(?:\?.*)?$/, async (route) => { held = true; await pending; await route.continue() })
  await page.getByRole('navigation').getByRole('link', { name: 'My sites', exact: true }).click()
  await expect.poll(() => held).toBe(true)
  await expect(page.locator('.panel-topbar')).toBeVisible()
  await expect(page.getByRole('navigation')).toBeVisible()
  await expect(page.locator('.panel-progress')).toHaveAttribute('data-active', 'true')
  release()
  await expect(page.getByText('shop.example.com', { exact: true })).toBeVisible()
})

test('failed AJAX data requests finish the progress indicator and keep navigation usable', async ({ page }) => {
  await setup(page)
  await expect(page.locator('.gd-metric')).toHaveCount(4)
  await page.route('**/api/sites', (route) => route.fulfill({ status: 503, json: { message: 'Site data is temporarily unavailable.' } }))
  await page.getByRole('navigation').getByRole('link', { name: 'My sites', exact: true }).click()
  await expect(page.getByText('Site data is temporarily unavailable.')).toBeVisible()
  await expect(page.locator('.panel-progress')).toHaveAttribute('data-active', 'false')
  await expect(page.getByRole('navigation')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again' })).toBeEnabled()
})

test('the site menu retains its own routes and real authority, including unknown data', async ({ page }) => {
  await setup(page, { path: '/site/shop/settings' })
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Settings', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Backups', exact: true })).toHaveAttribute('href', '/site/shop/backups')
  await expect(page.locator('.panel-authority')).toContainText('With approval')
  await expect(page.getByRole('navigation').locator('.panel-nav__badge')).toHaveCount(0)
})

test('mobile menu traps focus, closes on Escape, and can navigate without reloading', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 850 })
  await setup(page)
  const burger = page.getByRole('button', { name: 'Menu', exact: true })
  await burger.click()
  const dialog = page.getByRole('dialog', { name: 'Panel navigation' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAttribute('aria-modal', 'true')
  await dialog.getByRole('link', { name: 'Release notes — version 0.2.0' }).focus()
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(burger).toBeFocused()
  await expect(page.locator('.panel-frame')).not.toHaveClass(/is-open/)
  await burger.click()
  await dialog.getByRole('link', { name: 'My sites', exact: true }).click()
  await expect(page).toHaveURL(/\/app\/sites$/)
  await expect(page.locator('.panel-frame')).not.toHaveClass(/is-open/)
})

for (const lang of ['fa', 'en']) {
  for (const theme of ['dark', 'light']) {
    for (const width of [320, 768, 1440]) {
      test(`${lang} ${theme} dashboard fits ${width}px and preserves unmeasured metrics`, async ({ page }) => {
        await page.setViewportSize({ width, height: 1000 })
        await setup(page, { lang, theme })
        await expect(page.locator('.gd-metric')).toHaveCount(4)
        await expect(page.locator('.gd-metric').nth(3).locator('.gd-metric__value')).toContainText('—')
        await expect(page.locator('html')).toHaveAttribute('dir', lang === 'fa' ? 'rtl' : 'ltr')
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        const color = await page.locator('.panel-frame').evaluate((element) => getComputedStyle(element).getPropertyValue('--gd-primary').trim())
        expect(color).toBe(theme === 'dark' ? '#30d56b' : '#15803d')
      })
    }
  }
}
