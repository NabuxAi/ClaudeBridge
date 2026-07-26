// Service worker — installed for one reason: emergency notifications.
//
// It deliberately does NOT cache the panel. An offline copy of a security
// dashboard is a page that shows yesterday's "everything is fine" while a site
// is being defaced, and a stale answer here is worse than an error. Every
// request goes to the network; only push and notification handling live here.

self.addEventListener('install', (event) => {
  // Take over immediately. A push subscription that belongs to a worker
  // waiting to activate delivers nothing.
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

/**
 * An incoming alert.
 *
 * The payload is JSON from our server, but a push can also arrive empty — some
 * providers strip the body — so there is a fallback that still wakes the
 * person. A silent push during a compromise is the whole failure this feature
 * exists to prevent, and `requireInteraction` keeps it on screen rather than
 * fading after a few seconds at 3am.
 */
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'هشدار امنیتی', body: event.data ? event.data.text() : '' }
  }

  const title = data.title || 'هشدار امنیتی'
  const options = {
    body: data.body || 'برای دیدن جزئیات پنل را باز کنید.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    dir: 'rtl',
    lang: 'fa',
    requireInteraction: true,
    // A tag would collapse alerts for different sites into one. Two
    // compromised sites are two things someone has to act on.
    tag: data.tag || undefined,
    data: { url: data.url || '/' },
    vibrate: [200, 100, 200],
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

/**
 * Tapping the alert.
 *
 * Focuses an already-open panel rather than opening a second copy, and
 * navigates it to the site the alert was about — otherwise someone woken at
 * 3am lands on a dashboard and has to work out which of their sites is on
 * fire.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(target)
          return client.focus()
        }
      }
      return self.clients.openWindow(target)
    })
  )
})
