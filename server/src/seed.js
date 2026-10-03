// Demo content, matching the shapes the hub renders. Your real server would
// build these from its DB + live connector reads; here they seed a working demo.
export const demoSites = [
  { id: 'mystore', name: 'mystore.ir', title: 'My store', status: 'healthy', authority: 'auto', uptime: 99.98, checks: 9, lastCheck: 2, incidents: 0, pendingUpdates: 5 },
  { id: 'blog', name: 'blog.myco.ir', title: 'Company blog', status: 'warning', authority: 'confirm', uptime: 99.7, checks: 9, lastCheck: 4, incidents: 1, pendingUpdates: 2 },
  { id: 'landing', name: 'promo.myco.ir', title: 'Campaign landing', status: 'checking', authority: 'report', uptime: 100, checks: 9, lastCheck: 0, incidents: 0, pendingUpdates: 0 },
]

// Features listed here must be features that exist. The old list promised
// one-minute monitoring, a staging environment, automatic break-fix and team
// roles — none of which are built, and one of which (staging) is contradicted
// on the updates screen. A price list is a contract; it is the last place to
// describe intentions as capabilities.
//
// This is the server-side copy of the plan data. The hub's copies are the mock
// API list in hub/src/data/mock.js (`plans`) and the price cards in
// hub/src/pages/marketing/Landing.jsx — they live apart only because server
// and hub are separate packages, so keep prices and features identical.
// Display names and feature lines are served from the locale files by plan id
// (billing.plans.<id>.name, billing.catalog.<id>.features); the English text
// here is only the fallback for a plan id without keys.
export const plans = [
  { id: 'base', name: 'Basic', price: 190000, popular: false, features: [
    '1 site', 'Automatic core, plugin and theme updates', 'Database backup on the site itself', 'Daily security scan',
  ] },
  { id: 'pro', name: 'Professional', price: 490000, popular: true, features: [
    '5 sites', 'Everything in Basic', 'Core file integrity check', 'Plugin and theme conflict check', 'Rescue operations',
  ] },
  { id: 'agency', name: 'Agency', price: 990000, popular: false, features: [
    'Unlimited sites', 'Everything in Professional', 'Manage client sites from one panel',
  ] },
]

/**
 * Per-site payload skeletons.
 *
 * This used to hold a full invented site: 99.98% uptime, a 412ms response
 * time, "82%" host storage, nine green service checks including a payment
 * gateway, a five-line daily report of work nothing performs, a resolved
 * 500-error incident with a minute-by-minute timeline, and an update queue of
 * plugins the site may not even have installed. Every view fell back to it
 * whenever the connector was unreachable — so a site we could not read looked
 * healthier than one we could.
 *
 * What remains is empty structure. Each view now fills what it measures and
 * declares what it cannot, which is why `provenance` carries an `unavailable`
 * note rather than these numbers filling the gap.
 */
export const siteData = (id) => ({
  overview: { id, name: demoSites.find((s) => s.id === id)?.name || '', metrics: [], services: [], report: [] },
  incidents: { id, list: [], featured: null },
  updates: { id, queue: [], done: [] },
  security: { id, metrics: [] },
  backups: { id, list: [], empty: true },
  settings: {
    id,
    authority: demoSites.find((s) => s.id === id)?.authority || 'report',
    // Filled per request in routes/sites.js from authority.js's
    // SENSITIVE_TOOLS — the same set the relay refuses without approval.
    sensitive: [],
  },
})
