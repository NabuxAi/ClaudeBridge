import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

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

test('Alerts reviews and approves a stored MCP proposal on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 780 })
  await setup(page, { lang: 'fa' })
  const proposal = { id: 'prop_42', tool: 'edit_file', args: { path: 'plugins/shop/includes/merchant-ip.php', search: 'old', replace: 'new' } }
  let pending = [proposal]
  let approved = 0
  await page.route('**/api/sites/shop/incidents', (route) => route.fulfill({ json: {
    featured: null, list: [], canManage: true, proposals: pending,
  } }))
  await page.route('**/api/sites/shop/proposals/prop_42/approve', (route) => {
    expect(route.request().method()).toBe('POST')
    expect(route.request().postData()).toBeNull()
    approved += 1
    pending = []
    return route.fulfill({ json: { ok: true, relayed: true } })
  })
  await page.goto('/site/shop/incidents')
  await page.getByText('بررسی جزئیات تغییر', { exact: true }).click()
  await expect(page.locator('pre')).toContainText('"replace": "new"')
  await expect(page.getByRole('button', { name: 'نادیده گرفتن' })).toHaveCount(0)
  await page.getByRole('button', { name: 'تأیید و اجرا' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'روی سایت اجرا شد' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'درخواست‌های منتظر تأیید' })).toHaveCount(0)
  expect(approved).toBe(1)
})

test('Alerts keeps approval and execution separate after reload', async ({ page }) => {
  await setup(page)
  const error = 'Private temporary storage must be on the same filesystem as the file.'
  const result = (id, execution, extra = {}) => ({ id, status: 'approved', tool: 'edit_file_with_backup', execution, decidedAt: Date.now(), ...extra })
  await page.route('**/api/sites/shop/incidents', (route) => route.fulfill({ json: {
    featured: null, list: [], canManage: true, proposals: [],
    proposalDecisions: [
      result('prop_failed', 'failed', { path: 'themes/shop/style.css', error }),
      result('prop_succeeded', 'ran'),
      result('prop_waiting', 'unconfirmed'),
    ],
  } }))
  await page.goto('/site/shop/incidents')
  await page.reload()
  const failed = page.getByRole('article').filter({ hasText: 'prop_failed' })
  await expect(failed.getByText('Approved', { exact: true })).toBeVisible()
  await expect(failed.getByText('Execution failed', { exact: true })).toBeVisible()
  await expect(failed.getByText('themes/shop/style.css', { exact: true })).toBeVisible()
  await expect(failed.getByText(error, { exact: true })).toBeVisible()
  await expect(failed.getByText('Executed', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('article').filter({ hasText: 'prop_succeeded' })).toContainText('Executed')
  await expect(page.getByRole('article').filter({ hasText: 'prop_waiting' })).toContainText('Execution unconfirmed')
})

test('MCP page submits the selected site and exact paths for a direct edit token', async ({ page }) => {
  await setup(page)
  await page.route('**/api/sites', (route) => route.fulfill({ json: sites.map((site, i) => ({ ...site, role: i ? 'admin' : 'owner' })) }))
  const mcpUrl = 'https://api.example.com/v1/mcp'
  const fileEdit = { siteId: 'shop', paths: ['plugins/shop/main.php', 'themes/child/style.css'] }
  const record = { id: 'mcpt_42', name: 'Editor', createdAt: Date.now(), fileEdit }
  let tokens = []
  await page.route('**/api/account/mcp-tokens', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { tokens, mcpUrl } })
    expect(route.request().postDataJSON()).toEqual({ name: 'Editor', fileEdit })
    tokens = [record]
    return route.fulfill({ status: 201, json: { token: 'dwmcp_example', record, mcpUrl } })
  })
  await page.goto('/app/mcp')
  await page.getByRole('checkbox', { name: 'Allow file edits without per-edit approval' }).check()
  await expect(page.getByRole('option', { name: 'example.com/blog' })).toHaveCount(0)
  await page.getByRole('combobox', { name: 'Site*', exact: true }).selectOption('shop')
  await page.getByLabel('Exact paths relative to wp-content, one file per line').fill(fileEdit.paths.join('\n'))
  await page.getByRole('textbox', { name: 'Name, e.g. Claude on my laptop' }).fill('Editor')
  await page.getByRole('button', { name: 'Create token' }).click()
  await expect(page.getByText('Copy it now', { exact: false })).toBeVisible()
  await expect(page.getByText('Direct file edits on shop')).toBeVisible()
})

test('Alerts confirms only the chosen batch, keeps its order, and reports individual failures', async ({ page }) => {
  await setup(page)
  const proposal = (id, created_at) => ({
    id, created_at, tool: 'edit_file', args: { path: `plugins/shop/${id}.php` },
  })
  let pending = [proposal('newest', 4), proposal('later', 3), proposal('middle', 2), proposal('oldest', 1)]
  const calls = []
  await page.route('**/api/sites/shop/incidents', (route) => route.fulfill({
    json: { featured: null, list: [], canManage: true, proposals: pending },
  }))
  await page.route('**/api/sites/shop/proposals/*/approve', (route) => {
    const id = new URL(route.request().url()).pathname.split('/').at(-2)
    calls.push(id)
    pending = pending.filter((item) => item.id !== id)
    if (id === 'oldest') return route.fulfill({ status: 409, json: { message: 'The file changed on WordPress.' } })
    if (id === 'later') return route.fulfill({ status: 409, json: { code: 'proposal_already_settled' } })
    return route.fulfill({ json: { ok: true, relayed: true } })
  })
  await page.goto('/site/shop/incidents')
  const dialog = page.getByRole('dialog')
  const approveAll = page.getByRole('button', { name: 'Approve all requests' })
  await approveAll.click()
  await expect(dialog.getByText('Run these 4 requests?')).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  expect(calls).toEqual([])

  const selectAll = page.getByRole('checkbox', { name: 'Select all' })
  await selectAll.check()
  await expect(page.getByRole('button', { name: 'Approve selected (4)' })).toBeEnabled()
  for (const id of ['newest', 'later']) await page.getByRole('checkbox', { name: `Select request for plugins/shop/${id}.php` }).uncheck()
  await expect(selectAll).toHaveAttribute('aria-checked', 'mixed')
  await page.getByRole('button', { name: 'Approve selected (2)' }).click()
  await expect(dialog.getByRole('listitem')).toHaveText([
    'edit_file · plugins/shop/oldest.php',
    'edit_file · plugins/shop/middle.php',
  ])
  await dialog.getByRole('button', { name: 'Approve and run' }).click()
  await expect(page.getByRole('alert')).toContainText('The file changed on WordPress.')
  await expect(page.getByRole('alert')).toContainText('1 ran, 1 failed or could not be verified, 0 were already handled.')
  await expect(page.getByRole('checkbox', { name: 'Select request for plugins/shop/oldest.php' })).toHaveCount(0)
  expect(calls).toEqual(['oldest', 'middle'])

  await approveAll.click()
  await expect(dialog.getByText('Run these 2 requests?')).toBeVisible()
  await dialog.getByRole('button', { name: 'Approve and run' }).click()
  await expect(page.getByText('1 ran, 0 failed or could not be verified, 1 were already handled.')).toBeVisible()
  await expect(approveAll).toHaveCount(0)
  expect(calls).toEqual(['oldest', 'middle', 'later', 'newest'])
})

test('MCP supports both specific paths and all editable files on an existing token', async ({ page }) => {
  await setup(page)
  const record = { id: 'mcpt_existing', name: 'Editor', createdAt: Date.now() }
  const paths = ['plugins/shop/main.php', 'themes/child/style.css']
  let editWindow = null
  let changes = 0
  await page.route('**/api/sites', (route) => route.fulfill({ json: sites.map((site, i) => ({ ...site, role: i ? 'admin' : 'owner' })) }))
  await page.route('**/api/account/mcp-tokens', (route) => {
    expect(route.request().method()).toBe('GET')
    return route.fulfill({ json: { tokens: [{ ...record, editWindow }] } })
  })
  await page.route('**/api/account/mcp-tokens/mcpt_existing/edit-window', (route) => {
    changes += 1
    if (route.request().method() === 'POST') {
      const first = changes === 1
      expect(route.request().postDataJSON()).toEqual(first
        ? { siteId: 'shop', paths, hours: 12 }
        : { siteId: 'shop', allFiles: true, hours: 24 })
      editWindow = { siteId: 'shop', paths: first ? paths : null, expiresAt: Date.now() + (first ? 12 : 24) * 3600_000 }
      return route.fulfill({ json: { editWindow } })
    }
    expect(route.request().method()).toBe('DELETE')
    expect(route.request().postDataJSON()).toEqual({ expiresAt: editWindow.expiresAt })
    editWindow = null
    return route.fulfill({ json: { ok: true } })
  })
  await page.route('**/api/sites/shop/incidents', (route) => route.fulfill({ json: { featured: null, list: [], canManage: true } }))
  await page.goto('/site/shop/incidents')
  await page.getByRole('link', { name: 'Temporary MCP file edits' }).click()
  await expect(page).toHaveURL(/\/app\/mcp\?site=shop$/)
  await page.getByRole('button', { name: 'Temporary file edits', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('combobox', { name: 'Site*' })).toHaveValue('shop')
  await expect(dialog.getByRole('option', { name: 'WordPress blog' })).toHaveCount(0)
  await expect(dialog.getByRole('option', { name: / h$/ })).toHaveCount(24)
  const duration = dialog.getByRole('combobox', { name: 'Permission duration' })
  const scope = dialog.getByRole('combobox', { name: 'File scope' })
  const pathField = dialog.getByLabel('Exact paths relative to wp-content, one file per line')
  const start = dialog.getByRole('button', { name: 'Start temporary permission' })
  await expect(scope).toHaveValue('paths')
  await expect(start).toBeDisabled()
  await expect(duration).toHaveValue('3')
  await duration.selectOption('12')
  await pathField.fill(paths.join('\n'))
  await start.click()
  await expect(page.getByText('Active until', { exact: false })).toBeVisible()
  await page.reload()
  await expect(page.getByText('Active until', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'End temporary permission' }).click()
  await expect(page.getByText('Temporary edit permission ended.')).toBeVisible()
  await page.getByRole('button', { name: 'Temporary file edits', exact: true }).click()
  await scope.selectOption('all')
  await expect(pathField).toHaveCount(0)
  await duration.selectOption('24')
  await start.click()
  await expect(page.getByText('All editable files on shop')).toBeVisible()
  await page.reload()
  await expect(page.getByText('All editable files on shop')).toBeVisible()
  await page.getByRole('button', { name: 'End temporary permission' }).click()
  await expect(page.getByText('All editable files on shop')).toHaveCount(0)
  expect(changes).toBe(4)
})

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
  await expect(page.getByRole('link', { name: `Release notes — version ${version}` })).toContainText(`v${version}`)
  await expect(page.locator('.panel-frame')).toHaveAttribute('data-panel-theme', 'light')
  await expect(page.locator('.panel-frame')).toHaveClass(/is-collapsed/)
})

test('menu stays compact without search and panel links never underline on hover', async ({ page }) => {
  await setup(page)
  await expect(page.getByRole('searchbox')).toHaveCount(0)
  const link = page.getByRole('navigation').getByRole('link', { name: 'My sites', exact: true })
  await link.hover()
  await expect(link).toHaveCSS('text-decoration-line', 'none')
  const quick = page.locator('.panel-quick-link').first()
  await quick.hover()
  await expect(quick).toHaveCSS('text-decoration-line', 'none')
  const footer = page.locator('.panel-sidebar__footer')
  expect((await footer.boundingBox()).height).toBeLessThan(65)
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

test('an expired trial can be renewed from billing on the same plan', async ({ page }) => {
  const plan = { id: 'pro', name: 'Pro', price: 490000, siteLimit: 5 }
  const expired = {
    plan, status: 'trialing', trialState: 'expired', isTrialing: false,
    trialEndsAt: Date.UTC(2020, 0, 1), sitesUsed: 0,
  }
  await setup(page)
  await page.route('**/api/billing', (route) => route.fulfill({ json: { subscription: expired } }))
  await page.route('**/api/billing/plans', (route) => route.fulfill({ json: [plan] }))
  await page.route('**/api/billing/request-pilot', (route) => route.fulfill({
    json: {
      ok: true,
      subscription: { ...expired, trialState: 'trialing', isTrialing: true, daysLeftInTrial: 14 },
    },
  }))

  await page.getByRole('navigation').getByRole('link', { name: 'Subscription & billing' }).click()
  await expect(page.getByText('Your trial access has ended.')).toBeVisible()
  const request = page.waitForRequest('**/api/billing/request-pilot')
  await page.getByRole('button', { name: 'Renew trial access' }).click()
  const renewal = await request
  expect(renewal.method()).toBe('POST')
  expect(renewal.postDataJSON()).toEqual({ plan: 'pro' })

  await expect(page.getByText('Your trial access has ended.')).toHaveCount(0)
  await expect(page.getByText('14 days left in your trial access')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Your current plan' })).toBeDisabled()
})

test('the site menu retains its own routes and real authority, including unknown data', async ({ page }) => {
  await setup(page, { path: '/site/shop/settings' })
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Settings', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Backups', exact: true })).toHaveAttribute('href', '/site/shop/backups')
  await expect(page.locator('.panel-nav__caption')).toHaveText('Manage site shop.example.com')
  const help = page.getByRole('button', { name: 'About authority mode' })
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await help.hover()
  await expect(page.getByRole('tooltip')).toContainText('With approval')
  await expect(page.getByRole('tooltip')).toContainText('Changes wait for your approval.')
  await page.keyboard.press('Escape')
  await page.mouse.move(800, 400)
  await expect(page.getByRole('tooltip')).toHaveCount(0)
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
  await dialog.getByRole('link', { name: `Release notes — version ${version}` }).focus()
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

test.describe('touch authority help', () => {
  test.use({ hasTouch: true })
  test('authority help opens on touch and dismisses outside on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 850 })
    await setup(page, { path: '/site/shop/settings', lang: 'fa' })
    await page.getByRole('button', { name: 'منو', exact: true }).click()
    const help = page.getByRole('button', { name: 'راهنمای حالت اختیار' })
    await help.tap()
    await expect(help).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('tooltip')).toContainText('تغییرات پس از تأیید شما اجرا می‌شوند.')
    await help.tap()
    await expect(page.getByRole('tooltip')).toHaveCount(0)
    await help.tap()
    await page.locator('.panel-nav__caption').click()
    await expect(page.getByRole('tooltip')).toHaveCount(0)
    await help.focus()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('tooltip')).toHaveCount(0)
  })

})

test('Persian typography loads one local variable WOFF2 with its full weight range', async ({ page }) => {
  const fontRequests = []
  page.on('request', (request) => { if (request.resourceType() === 'font') fontRequests.push(request.url()) })
  await setup(page, { lang: 'fa' })
  await page.evaluate(() => document.fonts.ready)
  expect(fontRequests).toHaveLength(1)
  expect(fontRequests[0]).toMatch(/\/assets\/YekanBakhNoEnVF-[^/]+\.woff2$/)
  const face = await page.evaluate(() => [...document.fonts].find((font) => font.family.includes('Yekan Bakh'))?.weight)
  expect(face).toBe('100 950')
  await expect(page.locator('.panel-frame')).toHaveCSS('font-family', /Yekan Bakh/)
})
