# WP Claude Bridge v3.5 — کلون کامل و رایگان WpVibe + EasyMCP

سایت وردپرسی شما را به یک **سرور MCP خودمیزبان با ۱۰۰+ ابزار** تبدیل می‌کند.
اتصال با **URL حاوی توکن** (بدون هدر)، یا **OAuth مبتنی بر Application Password نیتیوِ وردپرس** (قابل‌ابطال — جدید در v3.2).

## نصب
افزونه‌ها → افزودن → بارگذاری افزونه → `wp-claude-bridge.zip` → نصب و فعال.

## سه روش اتصال

### ۱) ساده‌ترین: توکن داخل URL (بدون هدر) — مطمئن‌ترین راه
برو **ابزارها → Claude Bridge**، **URL آماده با توکن** را کپی کن و در Claude به‌عنوان Custom Connector بچسبان:
`https://YOURSITE/wp-json/claude-bridge/v1/mcp?token=XXXXXXXX`
توکن داخل URL است؛ هیچ لاگین/کپچا/هدری لازم نیست.

### ۲) OAuth با Application Password نیتیوِ وردپرس — جدید در v3.2
در Claude همان **URL ساده** (بدون توکن) را به‌عنوان Custom Connector اضافه کن:
`https://YOURSITE/wp-json/claude-bridge/v1/mcp`
Claude تو را به صفحه‌ی رسمی **Authorize Application** خودِ وردپرس می‌فرستد — **همان ساختاری که WpVibe استفاده می‌کند** (`wp-admin/authorize-application.php`). با یک کلیک تأیید کن.
- دسترسی به‌صورت یک **Application Password استاندارد** ذخیره می‌شود و پیش از صدور توکن **راستی‌آزمایی** می‌شود.
- هر وقت خواستی، از **کاربران → پروفایل → Application Passwords** آن را پاک کن؛ دسترسی Claude **فوراً قطع** می‌شود.
- اگر Application Passwords در دسترس نباشد، خودکار به صفحه‌ی رضایتِ داخلی افزونه برمی‌گردد.

### ۳) هدر Bearer
`Authorization: Bearer <token>` روی همان URL ساده.

## ۱۰۰+ ابزار

**فایل (قالب و پلاگین):** `read_file`, `write_file`, `edit_file`, `delete_file`, `list_files`
**پلاگین:** `create_plugin`, `set_plugin_state`, `list_plugins`, `install_plugin`, `delete_plugin`
**قالب:** `list_themes`, `activate_theme`, `preview_url`, `install_theme`, `delete_theme`
**کش:** `flush_cache`

**محتوای وردپرس (CRUD کامل برای هرکدام: list/get/create/update/delete):**
posts, pages, media, categories, tags, comments, users, menus, menu_items, blocks, templates

**ووکامرس (CRUD کامل):**
products, orders, coupons, customers, product_categories

**ابزارهای دیگر:** `get_settings`, `update_settings`, `list_post_types`, `list_taxonomies`,
`list_statuses`, `search`, `upload_media_from_url`, `count_posts`, `count_terms`, `db_query`,
`get_meta`, `update_meta`, `delete_meta`, `list_revisions`, `restore_revision`, `site_info`

**همه‌کاره:** `wp_rest` (هر مسیر REST دیگر)، `get_option`, `update_option`

> نام ابزارها جمع است، مثل `create_products`, `update_orders`, `get_customers`.

## امنیت
- سه روش احراز: توکن (URL/هدر) یا OAuth مبتنی بر Application Password نیتیو (PKCE + DCR).
- در روش OAuth، رمز اپلیکیشن قبل از صدور توکن راستی‌آزمایی می‌شود و **قابل‌ابطال** است.
- مسیر فایل‌ها sandbox شده (محدود به wp-content، ضد path traversal).
- توکن ثابت قابل ابطال از صفحه‌ی تنظیمات.

## اگر Claude «connect» نشد (با اینکه افزونه فعال است)
معمولاً یک لایه‌ی امنیتی جلوی درخواست‌های اتصال را می‌گیرد:
- **Cloudflare:** «Bot Fight Mode» را خاموش کن و برای مسیرهای `/wp-json/*` و `/claude-bridge-oauth/*` یک قاعده‌ی allow/skip بگذار. مطمئن شو در حالت «Under Attack» نیستی.
- **Jetpack / افزونه‌ی امنیتی (Wordfence، Solid، AIOS):** موقتاً غیرفعال کن یا REST را whitelist کن.
- مطمئن شو سایت در حالت **Coming-Soon / Maintenance** نیست.

### تست سریع سلامت سرور
```bash
curl -sS -X POST "https://YOURSITE/wp-json/claude-bridge/v1/mcp?token=XXXX" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}'
```
اگر پاسخ شامل `"serverInfo":{"name":"wp-claude-bridge"...}` بود، سرور و توکن سالم‌اند و مشکل صرفاً سمت کانکتور/چتِ Claude است (کانکتور تازه فقط در یک **چت جدید** ظاهر می‌شود).

---

## تازه در نسخه ۳.۵ — اسکیل‌های وردپرس + حالت‌های اتصال چندگانه

### ۱۸ اسکیل وردپرس داخل خودِ افزونه
حالا ۱۸ اسکیل مهندسی وردپرس داخل خودِ افزونه بسته‌بندی شده‌اند (پوشه‌ی `skills/`). وقتی افزونه روی سایت نصب و به Claude وصل باشد، مدل می‌تواند این اسکیل‌ها را «بگیرد» و پیش از بازبینی یا ساختِ کد وردپرس/ووکامرس از آن‌ها استفاده کند. سه مسیر دسترسی (برای سازگاری با هر کلاینت):

- **به‌صورت Tool:** `list_wp_skills` (فهرست همه) و `get_wp_skill` با `{"name":"wp-security-review"}` — یا `{"file":"references/escaping-guide.md"}` برای یک فایل مرجعِ مشخص.
- **به‌صورت MCP Resource:** با URI مثل `cbskill://wp-security-review/SKILL.md`.
- **به‌صورت MCP Prompt:** هر اسکیل یک prompt با نام خودش.

اسکیل‌ها: `wp-security-review`، `wp-performance-review`، `wp-block-development`، `wp-theme-development`، `wp-woocommerce-dev`، `wp-rest-api-development`، `wp-acf-and-content-modeling`، `wp-headless-and-wpgraphql`، `wp-migration-upgrade-review`، `wp-accessibility-review`، `wp-test-strategy`، `wp-ci-cd-and-release-engineering`، `wp-wpcli-and-ops`، `wp-phpstan-review`، `wp-playground-development`، `wp-admin-ui-development`، `wp-plugin-development`، `wp-site-audit-and-onboarding`.

هیچ تنظیمی لازم نیست؛ لیست کامل در **ابزارها → Claude Bridge** هم نمایش داده می‌شود.

### حالت‌های اتصال با fallback خودکار
اگر از یک مسیر وصل نشد، از مسیر دیگرْ همان توکن را بده — همه یک پروتکل MCP یکسان دارند:

| مسیر | آدرس | کِی به‌کار می‌آید |
|---|---|---|
| REST (اصلی) | `/wp-json/claude-bridge/v1/mcp` | حالت عادی |
| REST alias | `/wp-json/claude-bridge/v1/sse` و `/rpc` | نام‌های جایگزینِ همان endpoint |
| admin-ajax | `/wp-admin/admin-ajax.php?action=cb_mcp` | وقتی مسیرهای REST سفارشی بسته‌اند |
| query-var | `/?cb_mcp=1` | وقتی کل REST API خاموش است |

- فرمت پاسخ پیش‌فرض **JSON** است؛ برای **SSE** به انتهای آدرس `?transport=sse` (یا `&transport=sse`) اضافه کن.
- احراز هویت هم چندحالته: `Authorization: Bearer <token>`، یا `?token=<token>` داخل URL (اگر هاست هدر Authorization را حذف می‌کند)، یا OAuth با Application Password، یا کوکیِ ادمینِ لاگین‌شده.

### تست سریع endpointهای جدید
```bash
# اسکیل‌ها را از طریق fallbackِ admin-ajax بگیر
curl -sS -X POST "https://YOURSITE/wp-admin/admin-ajax.php?action=cb_mcp&token=XXXX" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_wp_skills","arguments":{}}}'

# fallbackِ query-var (وقتی REST کاملاً خاموش است)
curl -sS -X POST "https://YOURSITE/?cb_mcp=1&token=XXXX" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"prompts/list"}'
```
