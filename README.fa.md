<div align="center">

# 🌉 WP Claude Bridge

### هر سایت وردپرسی را به یک **MCP server** کامل و خودمیزبان تبدیل کن — و بگذار Claude آن را اداره کند.

*فایل‌های قالب و پلاگین را ویرایش کن، پلاگین اسکفولد کن، نوشته‌ها، برگه‌ها، WooCommerce، تنظیمات و دیتابیس را کنترل کن… بیش از ۱۰۰ ابزار، یک URL، بدون هیچ واسطه‌ای.*

<br>

[![Version](https://img.shields.io/badge/version-3.1.0-6c47ff?style=for-the-badge)](https://github.com/)
[![License](https://img.shields.io/badge/license-GPLv2-blue?style=for-the-badge)](LICENSE)
[![PHP](https://img.shields.io/badge/PHP-7.4%2B-777BB4?style=for-the-badge&logo=php&logoColor=white)](https://php.net)
[![WordPress](https://img.shields.io/badge/WordPress-5.6%2B-21759B?style=for-the-badge&logo=wordpress&logoColor=white)](https://wordpress.org)

[![MCP](https://img.shields.io/badge/protocol-MCP%202024--11--05-ff6b35?style=flat-square)](https://modelcontextprotocol.io)
[![WooCommerce](https://img.shields.io/badge/WooCommerce-ready-96588a?style=flat-square&logo=woocommerce&logoColor=white)](https://woocommerce.com)
[![OAuth](https://img.shields.io/badge/auth-OAuth%20PKCE%20%2B%20DCR-2ea44f?style=flat-square)](#-امنیت)
[![Single File](https://img.shields.io/badge/install-1%20file%2C%20zero%20deps-success?style=flat-square)](#-نصب)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#-مشارکت)
[![Free](https://img.shields.io/badge/free-WPVibe%20%2F%20EasyMCP%20alternative-e63946?style=flat-square)](#)

<br>

**[نصب](#-نصب) · [ابزارها](#-بیش-از-۱۰۰-ابزار) · [امنیت](#-امنیت) · [مشارکت](#-مشارکت)**

<br>

🌐 [English](README.md) · [Русский](README.ru.md) · [Türkçe](README.tr.md) · [العربية](README.ar.md) · **فارسی** · [Español](README.es.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [中文](README.zh.md)

</div>

---

<div dir="rtl">

## ⚡ این چیست؟

`WP Claude Bridge` یک **فایل PHP تکی** است که آن را داخل هر سایت وردپرسی می‌اندازی. این فایل یک سرور کامل [Model Context Protocol](https://modelcontextprotocol.io) را در دسترس می‌گذارد تا **Claude (یا هر کلاینت MCP) بتواند کل سایت تو را اداره کند** — خواندن و نوشتن فایل‌ها، ساختن پلاگین‌ها، مدیریت محتوا، راه‌اندازی WooCommerce، کوئری زدن به دیتابیس و پاک کردن کش.

بدون SaaS. بدون هزینهٔ ماهانه. بدون پراکسی خارجی. **سرور تو، دادهٔ تو، قوانین تو.** یک جایگزین رایگان و متن‌باز برای WPVibe و EasyMCP.

```
   Claude  ──►  https://your-site.com/wp-json/claude-bridge/v1/mcp?token=•••  ──►  WordPress
              (one URL, token inside — no headers, no middleman)
```

---

## ✨ ویژگی‌ها

| | |
|---|---|
| 🗂️ **دسترسی کامل به فایل** | خواندن/نوشتن/ویرایش/حذف هر فایل زیر `wp-content` — قالب‌ها **و** پلاگین‌ها. sandbox شده در برابر path traversal. |
| 🔌 **ساخت و مدیریت پلاگین** | اسکفولد پلاگین جدید، فعال/غیرفعال، نصب از اسلاگ wp.org یا zip URL، حذف. |
| 🎨 **کنترل قالب** | فهرست، فعال‌سازی، نصب، حذف — به‌علاوه **preview URL توکن‌دار ۲ ساعته** برای قالب‌های غیرفعال. |
| 📝 **CRUD کامل وردپرس** | posts, pages, media, categories, tags, comments, users, menus, blocks, templates. |
| 🛒 **CRUD ووکامرس** | products, orders, coupons, customers, product categories — list/get/create/update/delete. |
| 🧰 **پراکسی همه‌کاره** | `wp_rest` هر مسیر REST وردپرس یا ووکامرس را با دسترسی کامل مدیر صدا می‌زند. |
| 🗄️ **کوئری فقط‌خواندنی دیتابیس** | دسترسی امن `SELECT` با جایگزینی `{prefix}`. |
| 🔐 **۳ حالت احراز هویت** | توکن در URL (ساده‌ترین)، هدر Bearer، یا OAuth کامل (PKCE + Dynamic Client Registration). |
| 📦 **بدون وابستگی** | یک فایل `.php`. بدون composer، بدون build، بدون npm. |

---

## 🚀 نصب

1. **دانلود** `wp-claude-bridge.php` (یا آن را به‌صورت `wp-claude-bridge.zip` زیپ کن).
2. در پیشخوان وردپرس → **Plugins → Add New → Upload Plugin** → نصب و فعال‌سازی.
3. به **Tools → Claude Bridge** برو و **URL آمادهٔ توکن‌دار** را کپی کن:
   ```
   https://your-site.com/wp-json/claude-bridge/v1/mcp?token=XXXXXXXX
   ```
4. در Claude یک **Custom Connector** اضافه کن و آن URL را paste کن. تمام — توکن داخل URL است، **بدون نیاز به هیچ هدری**.

> ⚠️ این URL را محرمانه نگه دار؛ دسترسی سطح مدیر می‌دهد. توکن را هر زمان از همان صفحه تنظیمات عوض یا باطل کن.

---

## 🧰 بیش از ۱۰۰ ابزار

<details open>
<summary><b>فایل‌ها، پلاگین‌ها، قالب‌ها، کش</b></summary>

`list_files` · `read_file` · `write_file` · `edit_file` · `delete_file`
`create_plugin` · `set_plugin_state` · `list_plugins` · `install_plugin` · `delete_plugin`
`list_themes` · `activate_theme` · `install_theme` · `delete_theme` · `preview_url`
`flush_cache` *(object cache, W3TC, WP Rocket, OPcache)*
</details>

<details>
<summary><b>محتوای وردپرس — CRUD کامل (list / get / create / update / delete)</b></summary>

`posts` · `pages` · `media` · `categories` · `tags` · `comments` · `users` · `menus` · `menu_items` · `blocks` · `templates`

> نام ابزارها جمع است، مثل `create_posts`, `update_pages`, `get_users`.
</details>

<details>
<summary><b>ووکامرس — CRUD کامل</b></summary>

`products` · `orders` · `coupons` · `customers` · `product_categories`
</details>

<details>
<summary><b>سایت، متا، نسخه‌ها و ابزارهای قدرتمند</b></summary>

`site_info` · `get_settings` · `update_settings` · `list_post_types` · `list_taxonomies` · `list_statuses`
`search` · `count_posts` · `count_terms` · `upload_media_from_url`
`get_meta` · `update_meta` · `delete_meta` · `list_revisions` · `restore_revision`
`get_option` · `update_option` · `db_query` *(read-only SELECT)*
`wp_rest` — **صدا زدن هر مسیر REST، ابزار همه‌کاره**
</details>

---

## 🔐 امنیت

- **احراز هویت:** توکن در URL، هدر Bearer، یا OAuth (PKCE + DCR) با ورود خودکار و consent.
- **فایل‌سیستم sandbox شده:** همهٔ عملیات فایل محدود به `wp-content` است و در برابر path traversal با `../` مقاوم‌سازی شده.
- **دیتابیس فقط‌خواندنی:** `db_query` فقط `SELECT` می‌پذیرد.
- **توکن قابل ابطال:** دسترسی را فوری از صفحه تنظیمات عوض یا قطع کن.
- **خودمیزبان:** هیچ چیزی از سرور تو خارج نمی‌شود — بدون هیچ رله‌ای از طرف‌های ثالث.

---

## 🤝 مشارکت

PR، issue و ایده‌ها بسیار **خوش‌آمدند** — این پروژه ساخته شده تا همراه جامعه رشد کند.

```bash
git clone https://github.com/<you>/wp-claude-bridge.git
# Drop wp-claude-bridge.php into wp-content/plugins/wp-claude-bridge/ on a local WP, activate, hack away.
```

**بهترین مشارکت‌های اولیه:**
- 🧩 ابزار جدید (گزارش‌های بیشتر ووکامرس، کمک‌کننده‌های CPT، پلاگین‌های SEO…)
- 🌍 ترجمه‌های رابط مدیریت و مستندات
- 🐛 گزارش باگ همراه با مراحل بازتولید
- 📖 مستندات، نمونه‌ها و ویدیوهای آموزشی
- 🔒 بازبینی امنیتی لایه‌های احراز هویت و sandbox

> برای فیچرهای بزرگ اول issue باز کن تا هماهنگ شویم. سبک کد موجود را رعایت کن (توابع با پیشوند `cb_`، بدون وابستگی خارجی). مهربان باش. 🙌

---

## 📜 لایسنس

[GPLv2 or later](LICENSE) — آزاد به‌معنای آزادی. استفاده کن، فورک کن، منتشر کن.

</div>

<div align="center">
<br>

**ساخته‌شده با ❤️ برای جامعهٔ وردپرس**

⭐ اگر مفید بود ستاره بده!

</div>
