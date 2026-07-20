<div align="center">

# 🌉 WP Claude Bridge

### Transformez n'importe quel site WordPress en un véritable **serveur MCP** auto-hébergé — et laissez Claude le piloter.

*Modifiez les fichiers de thèmes et d'extensions, générez des extensions, contrôlez les articles, les pages, WooCommerce, les réglages, la base de données… plus de 100 outils, une seule URL, zéro intermédiaire.*

<br>

[![Version](https://img.shields.io/badge/version-3.5.1-6c47ff?style=for-the-badge)](https://github.com/)
[![License](https://img.shields.io/badge/license-GPLv2-blue?style=for-the-badge)](LICENSE)
[![PHP](https://img.shields.io/badge/PHP-7.4%2B-777BB4?style=for-the-badge&logo=php&logoColor=white)](https://php.net)
[![WordPress](https://img.shields.io/badge/WordPress-5.6%2B-21759B?style=for-the-badge&logo=wordpress&logoColor=white)](https://wordpress.org)

[![MCP](https://img.shields.io/badge/protocol-MCP%202024--11--05-ff6b35?style=flat-square)](https://modelcontextprotocol.io)
[![WooCommerce](https://img.shields.io/badge/WooCommerce-ready-96588a?style=flat-square&logo=woocommerce&logoColor=white)](https://woocommerce.com)
[![OAuth](https://img.shields.io/badge/auth-OAuth%20PKCE%20%2B%20DCR-2ea44f?style=flat-square)](#-sécurité)
[![Single File](https://img.shields.io/badge/install-1%20file%2C%20zero%20deps-success?style=flat-square)](#-installation)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#-contribuer)
[![Free](https://img.shields.io/badge/free-WPVibe%20%2F%20EasyMCP%20alternative-e63946?style=flat-square)](#)

<br>

**[Installation](#-installation) · [Outils](#-100-outils) · [Sécurité](#-sécurité) · [Contribuer](#-contribuer)**

<br>

🌐 [English](README.md) · [Русский](README.ru.md) · [Türkçe](README.tr.md) · [العربية](README.ar.md) · [فارسی](README.fa.md) · [Español](README.es.md) · [Deutsch](README.de.md) · **Français** · [中文](README.zh.md)

</div>

---

## ⚡ Qu'est-ce que c'est ?

`WP Claude Bridge` est un **fichier PHP unique** que vous déposez dans n'importe quel site WordPress. Il expose un serveur [Model Context Protocol](https://modelcontextprotocol.io) complet pour que **Claude (ou tout client MCP) puisse piloter l'intégralité de votre site** — lire et écrire des fichiers, créer des extensions, gérer le contenu, piloter WooCommerce, interroger la base de données, vider les caches.

Pas de SaaS. Pas d'abonnement mensuel. Pas de proxy externe. **Votre serveur, vos données, vos règles.** Une alternative libre et ouverte à WPVibe et EasyMCP.

```
   Claude  ──►  https://your-site.com/wp-json/claude-bridge/v1/mcp?token=•••  ──►  WordPress
              (one URL, token inside — no headers, no middleman)
```

---

## ✨ Points forts

| | |
|---|---|
| 🗂️ **Accès complet aux fichiers** | Lire / écrire / modifier / supprimer n'importe quel fichier sous `wp-content` — thèmes **et** extensions. Chemins isolés contre la traversée de répertoires. |
| 🔌 **Créer et gérer des extensions** | Générez une nouvelle extension, activez/désactivez, installez depuis un slug wp.org ou une URL de zip, supprimez. |
| 🎨 **Contrôle des thèmes** | Lister, activer, installer, supprimer — plus une **URL d'aperçu avec jeton valable 2 heures** pour les thèmes inactifs. |
| 📝 **CRUD WP complet** | articles, pages, médias, catégories, étiquettes, commentaires, utilisateurs, menus, blocs, modèles. |
| 🛒 **CRUD WooCommerce** | produits, commandes, codes promo, clients, catégories de produits — lister/récupérer/créer/mettre à jour/supprimer. |
| 🧰 **Proxy tout-faire** | `wp_rest` appelle **n'importe quelle** route REST de WP ou WooCommerce avec tous les droits d'administration. |
| 🗄️ **Requête BDD en lecture seule** | Accès `SELECT` sécurisé avec substitution de table `{prefix}`. |
| 🔐 **3 modes d'authentification** | Jeton dans l'URL (le plus simple), en-tête Bearer, ou OAuth complet (PKCE + Dynamic Client Registration). |
| 📦 **Zéro dépendance** | Un seul fichier `.php`. Pas de composer, pas d'étape de build, pas de npm. |

---

## 🚀 Installation

1. **Téléchargez** `wp-claude-bridge.php` (ou compressez-le en `wp-claude-bridge.zip`).
2. Administration WordPress → **Extensions → Ajouter → Téléverser une extension** → installez et activez.
3. Allez dans **Outils → Claude Bridge** et copiez l'**URL prête à l'emploi avec jeton** :
   ```
   https://your-site.com/wp-json/claude-bridge/v1/mcp?token=XXXXXXXX
   ```
4. Dans Claude, ajoutez un **Custom Connector** et collez cette URL. C'est fait — le jeton est inclus dans l'URL, **aucun en-tête requis**.

> ⚠️ Gardez cette URL secrète — elle accorde un accès de niveau administrateur. Renouvelez ou révoquez le jeton à tout moment depuis la même page de réglages.

---

## 🧰 Plus de 100 outils

<details open>
<summary><b>Fichiers, extensions, thèmes, cache</b></summary>

`list_files` · `read_file` · `write_file` · `edit_file` · `delete_file`
`create_plugin` · `set_plugin_state` · `list_plugins` · `install_plugin` · `delete_plugin`
`list_themes` · `activate_theme` · `install_theme` · `delete_theme` · `preview_url`
`flush_cache` *(cache d'objets, W3TC, WP Rocket, OPcache)*
</details>

<details>
<summary><b>Contenu WordPress — CRUD complet (lister / récupérer / créer / mettre à jour / supprimer)</b></summary>

`posts` · `pages` · `media` · `categories` · `tags` · `comments` · `users` · `menus` · `menu_items` · `blocks` · `templates`

> Les noms d'outils sont au pluriel, par ex. `create_posts`, `update_pages`, `get_users`.
</details>

<details>
<summary><b>WooCommerce — CRUD complet</b></summary>

`products` · `orders` · `coupons` · `customers` · `product_categories`
</details>

<details>
<summary><b>Site, métadonnées, révisions et outils avancés</b></summary>

`site_info` · `get_settings` · `update_settings` · `list_post_types` · `list_taxonomies` · `list_statuses`
`search` · `count_posts` · `count_terms` · `upload_media_from_url`
`get_meta` · `update_meta` · `delete_meta` · `list_revisions` · `restore_revision`
`get_option` · `update_option` · `db_query` *(SELECT en lecture seule)*
`wp_rest` — **appelez n'importe quelle route REST, l'outil tout-faire**
</details>

---

## 🔐 Sécurité

- **Authentification :** jeton dans l'URL, en-tête Bearer, ou OAuth (PKCE + DCR) avec connexion automatique et consentement.
- **Système de fichiers isolé :** toutes les opérations sur les fichiers sont confinées à `wp-content`, renforcées contre la traversée de répertoires `../`.
- **BDD en lecture seule :** `db_query` n'accepte que des `SELECT`.
- **Jeton révocable :** renouvelez ou coupez l'accès instantanément depuis la page de réglages.
- **Auto-hébergé :** rien ne quitte votre serveur — aucun relais tiers.

---

## 🤝 Contribuer

Les PRs, les tickets et les idées sont **très bienvenus** — ce projet est conçu pour grandir avec la communauté.

```bash
git clone https://github.com/<you>/wp-claude-bridge.git
# Drop wp-claude-bridge.php into wp-content/plugins/wp-claude-bridge/ on a local WP, activate, hack away.
```

**Bonnes premières contributions :**
- 🧩 Nouveaux outils (davantage de rapports WooCommerce, assistants CPT, extensions SEO…)
- 🌍 Traductions de l'interface d'administration et de la documentation
- 🐛 Rapports de bugs avec les étapes de reproduction
- 📖 Documentation, exemples, tutoriels vidéo
- 🔒 Revue de sécurité des couches d'authentification et d'isolation

> Ouvrez d'abord un ticket pour les grosses fonctionnalités afin que nous puissions nous aligner. Respectez le style de code existant (fonctions préfixées par `cb_`, aucune dépendance externe). Soyez bienveillant. 🙌

---

## 📜 Licence

[GPLv2 ou ultérieure](LICENSE) — libre comme dans liberté. Utilisez-le, forkez-le, déployez-le.

<div align="center">

<br>

**Conçu avec ❤️ pour la communauté WordPress**

⭐ Mettez une étoile si cela vous a aidé !

</div>
