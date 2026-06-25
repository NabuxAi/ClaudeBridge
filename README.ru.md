<div align="center">

# 🌉 WP Claude Bridge

### Превратите любой сайт на WordPress в полноценный самостоятельно размещаемый **MCP-сервер** — и позвольте Claude управлять им.

*Редактируйте файлы тем и плагинов, создавайте плагины с нуля, управляйте записями, страницами, WooCommerce, настройками, базой данных… 100+ инструментов, один URL, без посредников.*

<br>

[![Version](https://img.shields.io/badge/version-3.1.0-6c47ff?style=for-the-badge)](https://github.com/)
[![License](https://img.shields.io/badge/license-GPLv2-blue?style=for-the-badge)](LICENSE)
[![PHP](https://img.shields.io/badge/PHP-7.4%2B-777BB4?style=for-the-badge&logo=php&logoColor=white)](https://php.net)
[![WordPress](https://img.shields.io/badge/WordPress-5.6%2B-21759B?style=for-the-badge&logo=wordpress&logoColor=white)](https://wordpress.org)

[![MCP](https://img.shields.io/badge/protocol-MCP%202024--11--05-ff6b35?style=flat-square)](https://modelcontextprotocol.io)
[![WooCommerce](https://img.shields.io/badge/WooCommerce-ready-96588a?style=flat-square&logo=woocommerce&logoColor=white)](https://woocommerce.com)
[![OAuth](https://img.shields.io/badge/auth-OAuth%20PKCE%20%2B%20DCR-2ea44f?style=flat-square)](#-безопасность)
[![Single File](https://img.shields.io/badge/install-1%20file%2C%20zero%20deps-success?style=flat-square)](#-установка)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#-участие-в-разработке)
[![Free](https://img.shields.io/badge/free-WPVibe%20%2F%20EasyMCP%20alternative-e63946?style=flat-square)](#)

<br>

**[Установка](#-установка) · [Инструменты](#-100-инструментов) · [Безопасность](#-безопасность) · [Участие в разработке](#-участие-в-разработке)**

<br>

🌐 [English](README.md) · **Русский** · [Türkçe](README.tr.md) · [العربية](README.ar.md) · [فارسی](README.fa.md) · [Español](README.es.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [中文](README.zh.md)

</div>

---

## ⚡ Что это такое?

`WP Claude Bridge` — это **один PHP-файл**, который вы помещаете на любой сайт WordPress. Он предоставляет полноценный сервер [Model Context Protocol](https://modelcontextprotocol.io), чтобы **Claude (или любой MCP-клиент) мог управлять всем вашим сайтом** — читать и записывать файлы, создавать плагины, управлять контентом, работать с WooCommerce, выполнять запросы к базе данных, очищать кэши.

Никакого SaaS. Никакой ежемесячной платы. Никакого внешнего прокси. **Ваш сервер, ваши данные, ваши правила.** Бесплатная открытая альтернатива WPVibe и EasyMCP.

```
   Claude  ──►  https://your-site.com/wp-json/claude-bridge/v1/mcp?token=•••  ──►  WordPress
              (one URL, token inside — no headers, no middleman)
```

---

## ✨ Ключевые возможности

| | |
|---|---|
| 🗂️ **Полный доступ к файлам** | Чтение / запись / редактирование / удаление любого файла внутри `wp-content` — как тем, **так и** плагинов. Защита путей в песочнице от обхода каталогов. |
| 🔌 **Создание и управление плагинами** | Создавайте новый плагин с нуля, активируйте/деактивируйте, устанавливайте по slug с wp.org или из URL zip-архива, удаляйте. |
| 🎨 **Управление темами** | Просмотр, активация, установка, удаление — плюс **URL предпросмотра с токеном на 2 часа** для неактивных тем. |
| 📝 **Полный CRUD WP** | записи, страницы, медиа, рубрики, метки, комментарии, пользователи, меню, блоки, шаблоны. |
| 🛒 **CRUD WooCommerce** | товары, заказы, купоны, клиенты, категории товаров — просмотр/получение/создание/обновление/удаление. |
| 🧰 **Прокси «сделай что угодно»** | `wp_rest` вызывает **любой** REST-маршрут WP или WooCommerce с полными правами администратора. |
| 🗄️ **Запрос к БД только для чтения** | Безопасный доступ через `SELECT` с подстановкой таблиц `{prefix}`. |
| 🔐 **3 режима авторизации** | Токен в URL (самый простой), заголовок Bearer или полноценный OAuth (PKCE + динамическая регистрация клиентов). |
| 📦 **Без зависимостей** | Один `.php`-файл. Без composer, без этапа сборки, без npm. |

---

## 🚀 Установка

1. **Скачайте** `wp-claude-bridge.php` (или упакуйте его в `wp-claude-bridge.zip`).
2. Админка WordPress → **Плагины → Добавить новый → Загрузить плагин** → установите и активируйте.
3. Перейдите в **Инструменты → Claude Bridge** и скопируйте **готовый URL с токеном**:
   ```
   https://your-site.com/wp-json/claude-bridge/v1/mcp?token=XXXXXXXX
   ```
4. В Claude добавьте **Custom Connector** и вставьте этот URL. Готово — токен находится в URL, **заголовки не нужны**.

> ⚠️ Держите этот URL в секрете — он предоставляет доступ уровня администратора. Вы можете в любой момент сменить или отозвать токен на той же странице настроек.

---

## 🧰 100+ инструментов

<details open>
<summary><b>Файлы, плагины, темы, кэш</b></summary>

`list_files` · `read_file` · `write_file` · `edit_file` · `delete_file`
`create_plugin` · `set_plugin_state` · `list_plugins` · `install_plugin` · `delete_plugin`
`list_themes` · `activate_theme` · `install_theme` · `delete_theme` · `preview_url`
`flush_cache` *(объектный кэш, W3TC, WP Rocket, OPcache)*
</details>

<details>
<summary><b>Контент WordPress — полный CRUD (list / get / create / update / delete)</b></summary>

`posts` · `pages` · `media` · `categories` · `tags` · `comments` · `users` · `menus` · `menu_items` · `blocks` · `templates`

> Имена инструментов во множественном числе, например `create_posts`, `update_pages`, `get_users`.
</details>

<details>
<summary><b>WooCommerce — полный CRUD</b></summary>

`products` · `orders` · `coupons` · `customers` · `product_categories`
</details>

<details>
<summary><b>Сайт, мета, ревизии и мощные инструменты</b></summary>

`site_info` · `get_settings` · `update_settings` · `list_post_types` · `list_taxonomies` · `list_statuses`
`search` · `count_posts` · `count_terms` · `upload_media_from_url`
`get_meta` · `update_meta` · `delete_meta` · `list_revisions` · `restore_revision`
`get_option` · `update_option` · `db_query` *(только для чтения, SELECT)*
`wp_rest` — **вызов любого REST-маршрута, инструмент «сделай что угодно»**
</details>

---

## 🔐 Безопасность

- **Авторизация:** токен в URL, заголовок Bearer или OAuth (PKCE + DCR) с автоматическим входом и подтверждением согласия.
- **Файловая система в песочнице:** все операции с файлами ограничены `wp-content`, защищены от обхода каталогов через `../`.
- **БД только для чтения:** `db_query` принимает только `SELECT`.
- **Отзываемый токен:** мгновенно меняйте или отключайте доступ со страницы настроек.
- **Самостоятельное размещение:** ничто не покидает ваш сервер — никакого стороннего ретранслятора.

---

## 🤝 Участие в разработке

PR, issues и идеи **очень приветствуются** — проект создан, чтобы расти вместе с сообществом.

```bash
git clone https://github.com/<you>/wp-claude-bridge.git
# Drop wp-claude-bridge.php into wp-content/plugins/wp-claude-bridge/ on a local WP, activate, hack away.
```

**Хорошие первые вклады:**
- 🧩 Новые инструменты (больше отчётов WooCommerce, помощники для CPT, SEO-плагины…)
- 🌍 Переводы админ-интерфейса и документации
- 🐛 Отчёты об ошибках с шагами воспроизведения
- 📖 Документация, примеры, обучающие видео
- 🔒 Аудит безопасности слоёв авторизации и песочницы

> Для крупных функций сначала откройте issue, чтобы мы могли согласовать подход. Придерживайтесь существующего стиля кода (функции с префиксом `cb_`, без внешних зависимостей). Будьте доброжелательны. 🙌

---

## 📜 Лицензия

[GPLv2 или новее](LICENSE) — свободно как свобода. Используйте, форкайте, выпускайте.

<div align="center">

<br>

**Сделано с ❤️ для сообщества WordPress**

⭐ Поставьте звезду, если это помогло вам!

</div>
