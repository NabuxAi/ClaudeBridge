<div align="center">

# 🌉 WP Claude Bridge

### Turn any WordPress site into a full self-hosted **MCP server** — and let Claude run it.

*Edit theme & plugin files, scaffold plugins, control posts, pages, WooCommerce, settings, the database… 100+ tools, one URL, zero middlemen.*

<br>

[![Version](https://img.shields.io/badge/version-3.5.1-6c47ff?style=for-the-badge)](https://github.com/)
[![License](https://img.shields.io/badge/license-GPLv2-blue?style=for-the-badge)](LICENSE)
[![PHP](https://img.shields.io/badge/PHP-7.4%2B-777BB4?style=for-the-badge&logo=php&logoColor=white)](https://php.net)
[![WordPress](https://img.shields.io/badge/WordPress-5.6%2B-21759B?style=for-the-badge&logo=wordpress&logoColor=white)](https://wordpress.org)

[![MCP](https://img.shields.io/badge/protocol-MCP%202024--11--05-ff6b35?style=flat-square)](https://modelcontextprotocol.io)
[![WooCommerce](https://img.shields.io/badge/WooCommerce-ready-96588a?style=flat-square&logo=woocommerce&logoColor=white)](https://woocommerce.com)
[![OAuth](https://img.shields.io/badge/auth-OAuth%20PKCE%20%2B%20DCR-2ea44f?style=flat-square)](#-security)
[![Single File](https://img.shields.io/badge/install-1%20file%2C%20zero%20deps-success?style=flat-square)](#-install)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#-contributing)
[![Free](https://img.shields.io/badge/free-WPVibe%20%2F%20EasyMCP%20alternative-e63946?style=flat-square)](#)

<br>

**[Install](#-install) · [Tools](#-100-tools) · [Security](#-security) · [Contributing](#-contributing)**

<br>

🌐 **English** · [Русский](README.ru.md) · [Türkçe](README.tr.md) · [العربية](README.ar.md) · [فارسی](README.fa.md) · [Español](README.es.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [中文](README.zh.md)

</div>

---

## ⚡ What is this?

`WP Claude Bridge` is a **single PHP file** you drop into any WordPress site. It exposes a complete [Model Context Protocol](https://modelcontextprotocol.io) server so **Claude (or any MCP client) can operate your whole site** — read and write files, build plugins, manage content, drive WooCommerce, query the database, flush caches.

No SaaS. No monthly fee. No external proxy. **Your server, your data, your rules.** A free, open alternative to WPVibe and EasyMCP.

```
   Claude  ──►  https://your-site.com/wp-json/claude-bridge/v1/mcp?token=•••  ──►  WordPress
              (one URL, token inside — no headers, no middleman)
```

> **Managing a fleet?** This repo also ships **DigiWP Ai Support** — a full hub for
> watching and managing *many* WordPress sites *through your own server*, using the
> plugin's optional **Hub Connector Mode**. The plugin then acts as a locked-down
> bridge that only accepts HMAC-signed commands from your server (no direct access).
>
> - [`hub/`](hub) — the panel UI (React) · [`server/`](server) — the واسط server (Node) ·
>   connector mode lives in `wp-claude-bridge.php` (Tools → Claude Bridge).
> - Flow: `you → hub → your server → connector (this plugin) → managed WP site`.

---

## ✨ Highlights

| | |
|---|---|
| 🗂️ **Full file access** | Read / write / edit / delete any file under `wp-content` — themes **and** plugins. Path-sandboxed against traversal. |
| 🔌 **Build & manage plugins** | Scaffold a new plugin, activate/deactivate, install from wp.org slug or zip URL, delete. |
| 🎨 **Theme control** | List, activate, install, delete — plus a **2-hour tokened preview URL** for inactive themes. |
| 📝 **Full WP CRUD** | posts, pages, media, categories, tags, comments, users, menus, blocks, templates. |
| 🛒 **WooCommerce CRUD** | products, orders, coupons, customers, product categories — list/get/create/update/delete. |
| 🧰 **Do-anything proxy** | `wp_rest` calls **any** WP or WooCommerce REST route with full admin rights. |
| 🗄️ **Read-only DB query** | Safe `SELECT` access with `{prefix}` table substitution. |
| 🔐 **3 auth modes** | Token-in-URL (simplest), Bearer header, or OAuth via native WordPress **Application Passwords** (revocable). |
| 📡 **Streaming (SSE)** | MCP responses can stream over Server-Sent Events for long-running tools. |
| 🧠 **18 bundled WP skills** | Ships WordPress review skills (security, performance, block/theme dev…) queryable as MCP resources. |
| 📦 **Zero dependencies** | One `.php` file + skills. No composer, no build step, no npm. |

---

## 🚀 Install

1. **Download** `wp-claude-bridge.php` (or zip it as `wp-claude-bridge.zip`).
2. WordPress admin → **Plugins → Add New → Upload Plugin** → install & activate.
3. Go to **Tools → Claude Bridge** and copy the **ready-made URL with token**:
   ```
   https://your-site.com/wp-json/claude-bridge/v1/mcp?token=XXXXXXXX
   ```
4. In Claude, add a **Custom Connector** and paste that URL. Done — the token lives in the URL, **no headers needed**.

> ⚠️ Keep this URL secret — it grants admin-level access. Rotate or revoke the token anytime from the same settings page.

---

## 🧰 100+ Tools

<details open>
<summary><b>Files, plugins, themes, cache</b></summary>

`list_files` · `read_file` · `write_file` · `edit_file` · `delete_file`
`create_plugin` · `set_plugin_state` · `list_plugins` · `install_plugin` · `delete_plugin`
`list_themes` · `activate_theme` · `install_theme` · `delete_theme` · `preview_url`
`flush_cache` *(object cache, W3TC, WP Rocket, OPcache)*
</details>

<details>
<summary><b>WordPress content — full CRUD (list / get / create / update / delete)</b></summary>

`posts` · `pages` · `media` · `categories` · `tags` · `comments` · `users` · `menus` · `menu_items` · `blocks` · `templates`

> Tool names are plural, e.g. `create_posts`, `update_pages`, `get_users`.
</details>

<details>
<summary><b>WooCommerce — full CRUD</b></summary>

`products` · `orders` · `coupons` · `customers` · `product_categories`
</details>

<details>
<summary><b>Site, meta, revisions & power tools</b></summary>

`site_info` · `get_settings` · `update_settings` · `list_post_types` · `list_taxonomies` · `list_statuses`
`search` · `count_posts` · `count_terms` · `upload_media_from_url`
`get_meta` · `update_meta` · `delete_meta` · `list_revisions` · `restore_revision`
`get_option` · `update_option` · `db_query` *(read-only SELECT)*
`render_page` · `screenshot` · `conflict_scan` *(health/plugin-conflict scan)*
`list_wp_skills` · `get_wp_skill` *(18 bundled WordPress review skills)*
`wp_rest` — **call any REST route, the do-anything tool**
</details>

---

## 🔐 Security

- **Auth:** token-in-URL, Bearer header, or OAuth (PKCE + DCR) with auto login + consent.
- **Sandboxed filesystem:** all file ops confined to `wp-content`, hardened against `../` path traversal.
- **Read-only DB:** `db_query` accepts `SELECT` only.
- **Revocable token:** rotate or kill access instantly from the settings page.
- **Self-hosted:** nothing leaves your server — no third-party relay.

---

## 🤝 Contributing

PRs, issues, and ideas are **very welcome** — this is built to grow with the community.

```bash
git clone https://github.com/<you>/wp-claude-bridge.git
# Drop wp-claude-bridge.php into wp-content/plugins/wp-claude-bridge/ on a local WP, activate, hack away.
```

**Good first contributions:**
- 🧩 New tools (more WooCommerce reports, CPT helpers, SEO plugins…)
- 🌍 Translations of the admin UI & docs
- 🐛 Bug reports with repro steps
- 📖 Docs, examples, tutorial videos
- 🔒 Security review of the auth & sandbox layers

> Open an issue first for big features so we can align. Match the existing code style (`cb_` prefixed functions, no external deps). Be kind. 🙌

---

## 📜 License

[GPLv2 or later](LICENSE) — free as in freedom. Use it, fork it, ship it.

<div align="center">

<br>

**Made with ❤️ for the WordPress community**

⭐ Star it if it helped you!

</div>
