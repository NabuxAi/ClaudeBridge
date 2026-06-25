# WP Claude Bridge v3 — کلون کامل و رایگان WpVibe + EasyMCP

سایت وردپرسی شما را به یک **سرور MCP خودمیزبان با ۱۰۰+ ابزار** تبدیل می‌کند.
اتصال فقط با **یک URL حاوی توکن** (بدون نیاز به هدر) یا OAuth.

## اتصال (ساده‌ترین راه — بدون هدر)

۱. **نصب:** افزونه‌ها → افزودن → بارگذاری افزونه → `wp-claude-bridge.zip` → نصب و فعال
۲. برو **ابزارها → Claude Bridge** و **URL آماده با توکن** را کپی کن:
   `https://account30t.com/wp-json/claude-bridge/v1/mcp?token=XXXXXXXX`
۳. در Claude یک **Custom Connector** بساز و همین URL را بچسبان. تمام — توکن داخل URL است، هیچ هدری لازم نیست.

> این URL را محرمانه نگه دار (دسترسی مدیر می‌دهد). هر زمان خواستی از همان صفحه توکن را عوض/باطل کن.

## ۱۰۰+ ابزار

**فایل (قالب و پلاگین):** `read_file`, `write_file`, `edit_file`, `delete_file`, `list_files`
**پلاگین:** `create_plugin`, `set_plugin_state`, `list_plugins`
**قالب:** `list_themes`, `activate_theme`, `preview_url`
**کش:** `flush_cache`

**محتوای وردپرس (CRUD کامل برای هرکدام: list/get/create/update/delete):**
posts, pages, media, categories, tags, comments, users, menus, menu_items, blocks, templates

**ووکامرس (CRUD کامل):**
products, orders, coupons, customers, product_categories

**ابزارهای دیگر:** `get_settings`, `update_settings`, `list_post_types`, `list_taxonomies`,
`list_statuses`, `search`, `upload_media_from_url`, `count_posts`, `count_terms`

**همه‌کاره:** `wp_rest` (هر مسیر REST دیگر)، `get_option`, `update_option`

> نام ابزارها جمع است، مثل `create_products`, `update_orders`, `get_customers`.

## امنیت
- احراز هویت: توکن در URL، یا هدر Bearer، یا OAuth (PKCE + DCR).
- مسیر فایل‌ها sandbox شده (محدود به wp-content، ضد path traversal).
- توکن قابل ابطال از صفحه‌ی تنظیمات.
