# DigiWP Ai Support — Hub (پنل)

The **hub** is the front-end of *DigiWP Ai Support* — a Persian, RTL SaaS that
watches and manages many WordPress sites. It's the "**واسط**" (the interface,
*your* site) that sits between you and every managed site. This is a faithful
React implementation of the **`DigiWP - Panels & Pages`** design.

```
شما ──► DigiWP Hub (this app, "سایت من") ──► سرور شما (your API) ──► WP Claude Bridge connector ──► the managed WordPress site
```

The hub **never touches a managed WordPress site directly**. Every action goes
through *your* server, which relays HMAC-signed commands to the [WP Claude
Bridge](../wp-claude-bridge.php) connector running on each site (see the plugin's
**Hub Connector Mode**). No managed-site URLs or tokens ever live in the browser.

## Stack

- **React 18 + Vite** (plain JSX), **React Router** for the panels.
- A faithful port of the *WP Guardian* design system — tokens + 20 components in
  [`src/styles/digiwp.css`](src/styles/digiwp.css) and [`src/components/`](src/components).
- **lucide-react** icons, **Vazirmatn** + **JetBrains Mono** (Google Fonts).

## Run

```bash
cd hub
npm install
cp .env.example .env      # optional; defaults to offline mock data
npm run dev               # http://localhost:5173
npm run build             # production build to dist/
```

By default (`VITE_USE_MOCK=1`) the hub runs against built-in demo data
([`src/data/mock.js`](src/data/mock.js)) so you can click through **every**
screen with no server. Point `VITE_API_BASE_URL` at your server and set
`VITE_USE_MOCK=0` to go live — the call-sites don't change (see
[`src/lib/api.js`](src/lib/api.js)).

## Screens (from the design)

| Group | Screens |
|---|---|
| **A · بازاریابی** | Landing (`/`) |
| **B · احراز هویت** | Login `/login` · Reset `/reset-password` · Register `/register` · Onboarding `/onboarding` |
| **C · پنل حساب** | Dashboard `/app` · Sites `/app/sites` · Billing `/app/billing` · Team `/app/team` · Notifications `/app/notifications` · Profile `/app/profile` |
| **D · پنل مدیریت سایت** | Overview `/site/:id` · Incidents · Updates · Security · Backups · Assistant · Settings |
| **E · پرداخت** | Pricing `/pricing` · Checkout `/checkout` · Invoice `/invoice/:id` |
| **F · موبایل** | folded into the responsive breakpoints of the pages above |

All desktop layouts fold down to the design's mobile variants at ≤860px.

## The signature concept — three authority levels

Every managed site runs at one of three autonomy levels, surfaced everywhere via
the `AuthorityBadge`:

| Level | فارسی | Behaviour |
|---|---|---|
| `report` | فقط گزارش | observe + suggest, change nothing |
| `confirm` | با تأیید | prepare a fix, wait for your approval, then execute + test |
| `auto` | خودکار | do low-risk work itself; sensitive actions still need approval |

Sensitive actions (delete a plugin, switch theme, edit PHP, change the payment
gateway, change DNS, delete DB data) **always** require approval, at any level.

## Wiring to your server

`src/lib/api.js` is the single boundary. Each method maps to an endpoint on
*your* server; per-site methods carry the `siteId` so your server knows which
connector to relay to. To connect a site, pair the plugin (Tools → Claude Bridge
→ **Hub Connector Mode**) with your server's URL + a shared secret; your server
then signs every command it relays. The hub only ever calls your server.
