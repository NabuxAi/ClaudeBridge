import { test, expect } from '@playwright/test'

async function setup(page, lang = 'en') {
  await page.addInitScript((lang) => {
    localStorage.setItem('digiwp.token', 'test-session')
    localStorage.setItem('digiwp.lang', lang)
  }, lang)
  const created = []
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/auth/me') return route.fulfill({ json: { id: 'owner', name: 'Owner', lang } })
    if (path === '/api/sites') {
      created.push(route.request().postDataJSON())
      return route.fulfill({ json: { id: 'site-test', name: 'alowp.ir/baneh', pairing: { serverUrl: 'https://hub.example.com/api', secret: 'test-secret', steps: [] } } })
    }
    if (path === '/api/sites/discover') return route.fulfill({ json: { siteUrl: 'https://alowp.ir/baneh', hostname: 'alowp.ir', path: '/baneh', subdomain: '', kind: 'subfolder', connectorDetected: true } })
    return route.fulfill({ status: 404, json: { message: 'Unexpected test API call' } })
  })
  await page.goto('/onboarding')
  return created
}

test('a subfolder must be confirmed before a normalized address is created', async ({ page }) => {
  const created = await setup(page)
  await page.getByRole('textbox', { name: /^Site address/ }).fill(' alowp.ir/baneh/wp-admin/ ')
  await page.getByRole('button', { name: 'Check WordPress address' }).click()
  await expect(page.getByText('WordPress found in a subfolder', { exact: true })).toBeVisible()
  const create = page.getByRole('button', { name: 'Create connection key' })
  await expect(create).toBeDisabled()
  expect(created).toHaveLength(0)
  await page.getByRole('checkbox').check()
  await create.click()
  await expect(page.getByRole('heading', { name: 'Pair the connector' })).toBeVisible()
  expect(created).toEqual([{ name: 'https://alowp.ir/baneh' }])
})

test('editing an address clears both the detection and its confirmation', async ({ page }) => {
  const created = await setup(page)
  const input = page.getByRole('textbox', { name: /^Site address/ })
  await input.fill('alowp.ir/baneh')
  await input.press('Tab')
  await page.getByRole('checkbox').check()
  await input.fill('different.example.com/shop')
  await expect(page.getByRole('checkbox')).toHaveCount(0)
  await expect(page.getByText('https://alowp.ir/baneh', { exact: true })).toHaveCount(0)
  expect(created).toHaveLength(0)
})

test('a failed check shows an actionable error without creating a site', async ({ page }) => {
  const created = await setup(page)
  await page.route('**/api/sites/discover', (route) => route.fulfill({ status: 422, json: { message: 'Include the WordPress installation folder and try again.' } }))
  await page.getByRole('textbox', { name: /^Site address/ }).fill('example.com')
  await page.getByRole('button', { name: 'Check WordPress address' }).click()
  await expect(page.getByRole('alert')).toContainText('installation folder')
  await expect(page.getByRole('checkbox')).toHaveCount(0)
  expect(created).toHaveLength(0)
})

test('a subdomain is shown and requires its own explicit confirmation', async ({ page }) => {
  await setup(page)
  await page.route('**/api/sites/discover', (route) => route.fulfill({ json: { siteUrl: 'https://blog.example.co.uk', hostname: 'blog.example.co.uk', path: '/', subdomain: 'blog', kind: 'subdomain', connectorDetected: false } }))
  await page.getByRole('textbox', { name: /^Site address/ }).fill('blog.example.co.uk')
  await page.getByRole('button', { name: 'Check WordPress address' }).click()
  await expect(page.getByText('WordPress found on a subdomain', { exact: true })).toBeVisible()
  await expect(page.getByText('blog.example.co.uk', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create connection key' })).toBeDisabled()
  await expect(page.getByText(/connector is not visible/)).toBeVisible()
})

test('a late response for an edited address cannot restore its old location', async ({ page }) => {
  await setup(page)
  let release
  const pending = new Promise((resolve) => { release = resolve })
  await page.route('**/api/sites/discover', async (route) => {
    if (route.request().postDataJSON().url === 'old.example.com') {
      await pending
      return route.fulfill({ json: { siteUrl: 'https://old.example.com', hostname: 'old.example.com', path: '/', kind: 'root', connectorDetected: true } }).catch(() => {})
    }
    return route.fulfill({ json: { siteUrl: 'https://new.example.com/shop', hostname: 'new.example.com', path: '/shop', kind: 'subdomain-subfolder', connectorDetected: true } })
  })
  const input = page.getByRole('textbox', { name: /^Site address/ })
  await input.fill('old.example.com')
  await input.press('Tab')
  await expect(page.getByRole('status')).toBeVisible()
  await input.fill('new.example.com/shop')
  await input.press('Tab')
  await expect(page.getByText('https://new.example.com/shop', { exact: true })).toBeVisible()
  release()
  await expect(page.getByText('https://old.example.com', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('checkbox')).not.toBeChecked()
})

for (const width of [320, 375, 768, 1280]) {
  test(`Persian confirmation stays usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 })
    await setup(page, 'fa')
    await page.getByRole('textbox', { name: /^آدرس سایت/ }).fill('https://alowp.ir/baneh')
    await page.getByRole('button', { name: 'بررسی آدرس وردپرس' }).click()
    await expect(page.getByRole('checkbox')).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.getByRole('checkbox').focus()
    await page.keyboard.press('Space')
    await expect(page.getByRole('button', { name: 'ساخت کلید اتصال' })).toBeEnabled()
  })
}
