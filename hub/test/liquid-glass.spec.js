import { test, expect } from '@playwright/test'

// Liquid Glass (platform 0.5.0): the material must be on, must fall back to
// solid surfaces when the viewer asks for more contrast, and must not move
// brand or status colours. Plus the public-page fixes that shipped with it.

const user = { id: 'glass-owner', name: 'Sara', initials: 'S', email: 'owner@example.com', role: 'owner', lang: 'en' }

async function panel(page, theme) {
  await page.addInitScript((theme) => {
    localStorage.setItem('digiwp.token', 'glass-test-session')
    localStorage.setItem('digiwp.lang', 'en')
    localStorage.setItem('digiwp.panel.theme', theme)
  }, theme)
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/auth/me' || path === '/api/profile') return route.fulfill({ json: user })
    if (path === '/api/sites') return route.fulfill({ json: [] })
    if (path === '/api/account/activity') return route.fulfill({ json: { events: [] } })
    return route.fulfill({ json: {} })
  })
  await page.goto('/app')
  await expect(page.locator('.panel-frame')).toBeVisible()
}

const material = (locator) => locator.evaluate((element) => {
  const style = getComputedStyle(element)
  return { filter: style.backdropFilter || style.webkitBackdropFilter, background: style.backgroundColor }
})

for (const theme of ['light', 'dark']) {
  test(`${theme} panel chrome and cards are glass, brand colour unchanged`, async ({ page }) => {
    await panel(page, theme)
    const sidebar = await material(page.locator('.panel-sidebar'))
    const topbar = await material(page.locator('.panel-topbar'))
    expect(sidebar.filter).toContain('blur(28px)')
    expect(topbar.filter).toContain('blur(28px)')
    // Translucent: the alpha channel is below 1.
    expect(sidebar.background).toMatch(/rgba?\(.*,\s*0\.\d+\)|\/ 0\.\d+\)/)
    const primary = await page.locator('.panel-frame').evaluate((element) => getComputedStyle(element).getPropertyValue('--gd-primary').trim())
    expect(primary).toBe(theme === 'dark' ? '#30d56b' : '#15803d')
    // The viewport scrollbar follows the panel theme.
    const scheme = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)
    if (theme === 'dark') expect(scheme).toBe('dark')
  })
}

test('more contrast turns the glass solid', async ({ page }) => {
  await page.emulateMedia({ contrast: 'more' })
  await panel(page, 'light')
  const sidebar = await material(page.locator('.panel-sidebar'))
  expect(sidebar.background).toBe('rgb(255, 255, 255)')
})

test('pricing stays public for a signed-out visitor', async ({ page }) => {
  const requests = []
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname
    requests.push(path)
    if (path === '/api/billing/plans') return route.fulfill({ json: [] })
    return route.fulfill({ status: 401, json: { message: 'unauthorized' } })
  })
  await page.goto('/pricing')
  await page.waitForLoadState('networkidle')
  await expect(page).toHaveURL(/\/pricing$/)
  expect(requests).not.toContain('/api/billing/trial')
})

for (const lang of ['en', 'fa']) {
  for (const width of [320, 375]) {
    test(`${lang} public pages fit ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await page.addInitScript((lang) => localStorage.setItem('digiwp.lang', lang), lang)
      await page.route('**/api/**', (route) => route.fulfill({ json: [] }))
      for (const path of ['/', '/terms', '/pricing']) {
        await page.goto(path)
        await page.waitForLoadState('networkidle')
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        expect(overflow, `${path} overflows`).toBeLessThanOrEqual(0)
        await expect(page.locator('.dwp-mkt-nav a[href="/login"]')).toBeVisible()
        await expect(page.locator('.dwp-mkt-nav a[href="/register"]')).toBeVisible()
      }
    })
  }
}
