<div align="center">

# 🌉 WP Claude Bridge

### Verwandle jede WordPress-Website in einen vollwertigen, selbst gehosteten **MCP-Server** — und lass Claude ihn bedienen.

*Theme- & Plugin-Dateien bearbeiten, Plugins gerüsten, Beiträge, Seiten, WooCommerce, Einstellungen, die Datenbank steuern… über 100 Tools, eine URL, keine Zwischenhändler.*

<br>

[![Version](https://img.shields.io/badge/version-3.1.0-6c47ff?style=for-the-badge)](https://github.com/)
[![License](https://img.shields.io/badge/license-GPLv2-blue?style=for-the-badge)](LICENSE)
[![PHP](https://img.shields.io/badge/PHP-7.4%2B-777BB4?style=for-the-badge&logo=php&logoColor=white)](https://php.net)
[![WordPress](https://img.shields.io/badge/WordPress-5.6%2B-21759B?style=for-the-badge&logo=wordpress&logoColor=white)](https://wordpress.org)

[![MCP](https://img.shields.io/badge/protocol-MCP%202024--11--05-ff6b35?style=flat-square)](https://modelcontextprotocol.io)
[![WooCommerce](https://img.shields.io/badge/WooCommerce-ready-96588a?style=flat-square&logo=woocommerce&logoColor=white)](https://woocommerce.com)
[![OAuth](https://img.shields.io/badge/auth-OAuth%20PKCE%20%2B%20DCR-2ea44f?style=flat-square)](#-sicherheit)
[![Single File](https://img.shields.io/badge/install-1%20file%2C%20zero%20deps-success?style=flat-square)](#-installation)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#-mitwirken)
[![Free](https://img.shields.io/badge/free-WPVibe%20%2F%20EasyMCP%20alternative-e63946?style=flat-square)](#)

<br>

**[Installation](#-installation) · [Tools](#-100-tools) · [Sicherheit](#-sicherheit) · [Mitwirken](#-mitwirken)**

<br>

🌐 [English](README.md) · [Русский](README.ru.md) · [Türkçe](README.tr.md) · [العربية](README.ar.md) · [فارسی](README.fa.md) · [Español](README.es.md) · **Deutsch** · [Français](README.fr.md) · [中文](README.zh.md)

</div>

---

## ⚡ Was ist das?

`WP Claude Bridge` ist eine **einzelne PHP-Datei**, die du in jede beliebige WordPress-Website einfügst. Sie stellt einen vollständigen [Model Context Protocol](https://modelcontextprotocol.io)-Server bereit, sodass **Claude (oder jeder MCP-Client) deine gesamte Website bedienen kann** — Dateien lesen und schreiben, Plugins erstellen, Inhalte verwalten, WooCommerce steuern, die Datenbank abfragen, Caches leeren.

Kein SaaS. Keine monatliche Gebühr. Kein externer Proxy. **Dein Server, deine Daten, deine Regeln.** Eine kostenlose, offene Alternative zu WPVibe und EasyMCP.

```
   Claude  ──►  https://your-site.com/wp-json/claude-bridge/v1/mcp?token=•••  ──►  WordPress
              (one URL, token inside — no headers, no middleman)
```

---

## ✨ Highlights

| | |
|---|---|
| 🗂️ **Voller Dateizugriff** | Jede Datei unter `wp-content` lesen / schreiben / bearbeiten / löschen — Themes **und** Plugins. Pfad-Sandbox gegen Traversal. |
| 🔌 **Plugins erstellen & verwalten** | Ein neues Plugin gerüsten, aktivieren/deaktivieren, per wp.org-Slug oder Zip-URL installieren, löschen. |
| 🎨 **Theme-Steuerung** | Auflisten, aktivieren, installieren, löschen — plus eine **2 Stunden gültige, tokenisierte Vorschau-URL** für inaktive Themes. |
| 📝 **Vollständiges WP-CRUD** | Beiträge, Seiten, Medien, Kategorien, Schlagwörter, Kommentare, Benutzer, Menüs, Blöcke, Templates. |
| 🛒 **WooCommerce-CRUD** | Produkte, Bestellungen, Gutscheine, Kunden, Produktkategorien — list/get/create/update/delete. |
| 🧰 **Alleskönner-Proxy** | `wp_rest` ruft **jede** WP- oder WooCommerce-REST-Route mit vollen Admin-Rechten auf. |
| 🗄️ **Schreibgeschützte DB-Abfrage** | Sicherer `SELECT`-Zugriff mit `{prefix}`-Tabellenersetzung. |
| 🔐 **3 Auth-Modi** | Token-in-URL (am einfachsten), Bearer-Header oder vollständiges OAuth (PKCE + Dynamic Client Registration). |
| 📦 **Keine Abhängigkeiten** | Eine `.php`-Datei. Kein composer, kein Build-Schritt, kein npm. |

---

## 🚀 Installation

1. **Lade** `wp-claude-bridge.php` herunter (oder packe es als `wp-claude-bridge.zip`).
2. WordPress-Adminbereich → **Plugins → Installieren → Plugin hochladen** → installieren & aktivieren.
3. Gehe zu **Werkzeuge → Claude Bridge** und kopiere die **fertige URL mit Token**:
   ```
   https://your-site.com/wp-json/claude-bridge/v1/mcp?token=XXXXXXXX
   ```
4. Füge in Claude einen **Custom Connector** hinzu und füge diese URL ein. Fertig — der Token steckt in der URL, **keine Header nötig**.

> ⚠️ Halte diese URL geheim — sie gewährt Zugriff auf Admin-Ebene. Erneuere oder widerrufe den Token jederzeit über dieselbe Einstellungsseite.

---

## 🧰 Über 100 Tools

<details open>
<summary><b>Dateien, Plugins, Themes, Cache</b></summary>

`list_files` · `read_file` · `write_file` · `edit_file` · `delete_file`
`create_plugin` · `set_plugin_state` · `list_plugins` · `install_plugin` · `delete_plugin`
`list_themes` · `activate_theme` · `install_theme` · `delete_theme` · `preview_url`
`flush_cache` *(Object Cache, W3TC, WP Rocket, OPcache)*
</details>

<details>
<summary><b>WordPress-Inhalte — vollständiges CRUD (list / get / create / update / delete)</b></summary>

`posts` · `pages` · `media` · `categories` · `tags` · `comments` · `users` · `menus` · `menu_items` · `blocks` · `templates`

> Tool-Namen stehen im Plural, z. B. `create_posts`, `update_pages`, `get_users`.
</details>

<details>
<summary><b>WooCommerce — vollständiges CRUD</b></summary>

`products` · `orders` · `coupons` · `customers` · `product_categories`
</details>

<details>
<summary><b>Website, Meta, Revisionen & Power-Tools</b></summary>

`site_info` · `get_settings` · `update_settings` · `list_post_types` · `list_taxonomies` · `list_statuses`
`search` · `count_posts` · `count_terms` · `upload_media_from_url`
`get_meta` · `update_meta` · `delete_meta` · `list_revisions` · `restore_revision`
`get_option` · `update_option` · `db_query` *(schreibgeschütztes SELECT)*
`wp_rest` — **rufe jede REST-Route auf, das Alleskönner-Tool**
</details>

---

## 🔐 Sicherheit

- **Auth:** Token-in-URL, Bearer-Header oder OAuth (PKCE + DCR) mit automatischer Anmeldung + Zustimmung.
- **Sandbox-Dateisystem:** Alle Dateioperationen sind auf `wp-content` beschränkt, gehärtet gegen `../`-Pfad-Traversal.
- **Schreibgeschützte DB:** `db_query` akzeptiert ausschließlich `SELECT`.
- **Widerrufbarer Token:** Erneuere den Zugriff oder beende ihn sofort über die Einstellungsseite.
- **Selbst gehostet:** Nichts verlässt deinen Server — kein Drittanbieter-Relay.

---

## 🤝 Mitwirken

PRs, Issues und Ideen sind **sehr willkommen** — dieses Projekt ist darauf ausgelegt, mit der Community zu wachsen.

```bash
git clone https://github.com/<you>/wp-claude-bridge.git
# Drop wp-claude-bridge.php into wp-content/plugins/wp-claude-bridge/ on a local WP, activate, hack away.
```

**Gute erste Beiträge:**
- 🧩 Neue Tools (mehr WooCommerce-Berichte, CPT-Helfer, SEO-Plugins…)
- 🌍 Übersetzungen der Admin-Oberfläche & Dokumentation
- 🐛 Fehlerberichte mit Reproduktionsschritten
- 📖 Dokumentation, Beispiele, Tutorial-Videos
- 🔒 Sicherheitsüberprüfung der Auth- & Sandbox-Schichten

> Eröffne bei großen Features zuerst ein Issue, damit wir uns abstimmen können. Halte dich an den bestehenden Code-Stil (`cb_`-präfixierte Funktionen, keine externen Abhängigkeiten). Sei freundlich. 🙌

---

## 📜 Lizenz

[GPLv2 oder später](LICENSE) — frei im Sinne von Freiheit. Nutze es, forke es, veröffentliche es.

<div align="center">

<br>

**Mit ❤️ für die WordPress-Community erstellt**

⭐ Gib einen Stern, wenn es dir geholfen hat!

</div>
