<div align="center">

# 🌉 WP Claude Bridge

### حوّل أي موقع WordPress إلى **خادم MCP** كامل مستضاف ذاتيًا — ودع Claude يديره.

*عدّل ملفات القوالب والإضافات، أنشئ هياكل الإضافات، تحكّم في المنشورات والصفحات وWooCommerce والإعدادات وقاعدة البيانات… أكثر من 100 أداة، رابط واحد، بلا وسطاء.*

<br>

[![Version](https://img.shields.io/badge/version-3.1.0-6c47ff?style=for-the-badge)](https://github.com/)
[![License](https://img.shields.io/badge/license-GPLv2-blue?style=for-the-badge)](LICENSE)
[![PHP](https://img.shields.io/badge/PHP-7.4%2B-777BB4?style=for-the-badge&logo=php&logoColor=white)](https://php.net)
[![WordPress](https://img.shields.io/badge/WordPress-5.6%2B-21759B?style=for-the-badge&logo=wordpress&logoColor=white)](https://wordpress.org)

[![MCP](https://img.shields.io/badge/protocol-MCP%202024--11--05-ff6b35?style=flat-square)](https://modelcontextprotocol.io)
[![WooCommerce](https://img.shields.io/badge/WooCommerce-ready-96588a?style=flat-square&logo=woocommerce&logoColor=white)](https://woocommerce.com)
[![OAuth](https://img.shields.io/badge/auth-OAuth%20PKCE%20%2B%20DCR-2ea44f?style=flat-square)](#-الأمان)
[![Single File](https://img.shields.io/badge/install-1%20file%2C%20zero%20deps-success?style=flat-square)](#-التثبيت)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#-المساهمة)
[![Free](https://img.shields.io/badge/free-WPVibe%20%2F%20EasyMCP%20alternative-e63946?style=flat-square)](#)

<br>

**[التثبيت](#-التثبيت) · [الأدوات](#-أكثر-من-100-أداة) · [الأمان](#-الأمان) · [المساهمة](#-المساهمة)**

<br>

🌐 [English](README.md) · [Русский](README.ru.md) · [Türkçe](README.tr.md) · **العربية** · [فارسی](README.fa.md) · [Español](README.es.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [中文](README.zh.md)

</div>

---

<div dir="rtl">

## ⚡ ما هذا؟

`WP Claude Bridge` هو **ملف PHP واحد** تُسقطه في أي موقع WordPress. يكشف خادم [Model Context Protocol](https://modelcontextprotocol.io) كاملًا بحيث **يستطيع Claude (أو أي عميل MCP) تشغيل موقعك بالكامل** — قراءة الملفات والكتابة فيها، وبناء الإضافات، وإدارة المحتوى، وقيادة WooCommerce، والاستعلام من قاعدة البيانات، وتفريغ الذاكرة المؤقتة.

لا SaaS. لا رسوم شهرية. لا وكيل خارجي. **خادمك، وبياناتك، وقواعدك.** بديل مجاني ومفتوح لـ WPVibe وEasyMCP.

```
   Claude  ──►  https://your-site.com/wp-json/claude-bridge/v1/mcp?token=•••  ──►  WordPress
              (one URL, token inside — no headers, no middleman)
```

---

## ✨ أبرز المزايا

| | |
|---|---|
| 🗂️ **وصول كامل إلى الملفات** | قراءة / كتابة / تعديل / حذف أي ملف ضمن `wp-content` — القوالب **والإضافات**. معزول المسار ضد الاجتياز. |
| 🔌 **بناء الإضافات وإدارتها** | إنشاء هيكل إضافة جديدة، تفعيل/تعطيل، تثبيت من معرّف wp.org أو رابط zip، حذف. |
| 🎨 **التحكم في القوالب** | عرض، تفعيل، تثبيت، حذف — إضافة إلى **رابط معاينة موثّق صالح لساعتين** للقوالب غير المفعّلة. |
| 📝 **عمليات CRUD كاملة لـ WP** | المنشورات، الصفحات، الوسائط، التصنيفات، الوسوم، التعليقات، المستخدمون، القوائم، الكتل، القوالب. |
| 🛒 **عمليات CRUD لـ WooCommerce** | المنتجات، الطلبات، الكوبونات، العملاء، تصنيفات المنتجات — عرض/جلب/إنشاء/تحديث/حذف. |
| 🧰 **وكيل افعل-أي-شيء** | `wp_rest` يستدعي **أي** مسار REST لـ WP أو WooCommerce بصلاحيات مدير كاملة. |
| 🗄️ **استعلام قاعدة بيانات للقراءة فقط** | وصول آمن عبر `SELECT` مع استبدال جدول `{prefix}`. |
| 🔐 **3 أوضاع للمصادقة** | الرمز في الرابط (الأبسط)، أو ترويسة Bearer، أو OAuth كامل (PKCE + التسجيل الديناميكي للعميل). |
| 📦 **بلا أي اعتماديات** | ملف `.php` واحد. لا composer، لا خطوة بناء، لا npm. |

---

## 🚀 التثبيت

1. **نزّل** `wp-claude-bridge.php` (أو اضغطه كـ `wp-claude-bridge.zip`).
2. لوحة تحكم WordPress ← **Plugins → Add New → Upload Plugin** ← ثبّت وفعّل.
3. اذهب إلى **Tools → Claude Bridge** وانسخ **الرابط الجاهز مع الرمز**:
   ```
   https://your-site.com/wp-json/claude-bridge/v1/mcp?token=XXXXXXXX
   ```
4. في Claude، أضِف **Custom Connector** والصق ذلك الرابط. انتهى — الرمز موجود داخل الرابط، **بلا حاجة إلى ترويسات**.

> ⚠️ احتفظ بهذا الرابط سرًّا — فهو يمنح وصولًا بمستوى المدير. يمكنك تدوير الرمز أو إبطاله في أي وقت من صفحة الإعدادات نفسها.

---

## 🧰 أكثر من 100 أداة

<details open>
<summary><b>الملفات والإضافات والقوالب والذاكرة المؤقتة</b></summary>

`list_files` · `read_file` · `write_file` · `edit_file` · `delete_file`
`create_plugin` · `set_plugin_state` · `list_plugins` · `install_plugin` · `delete_plugin`
`list_themes` · `activate_theme` · `install_theme` · `delete_theme` · `preview_url`
`flush_cache` *(object cache, W3TC, WP Rocket, OPcache)*
</details>

<details>
<summary><b>محتوى WordPress — عمليات CRUD كاملة (عرض / جلب / إنشاء / تحديث / حذف)</b></summary>

`posts` · `pages` · `media` · `categories` · `tags` · `comments` · `users` · `menus` · `menu_items` · `blocks` · `templates`

> أسماء الأدوات بصيغة الجمع، مثل `create_posts` و`update_pages` و`get_users`.
</details>

<details>
<summary><b>WooCommerce — عمليات CRUD كاملة</b></summary>

`products` · `orders` · `coupons` · `customers` · `product_categories`
</details>

<details>
<summary><b>الموقع والبيانات الوصفية والمراجعات والأدوات القوية</b></summary>

`site_info` · `get_settings` · `update_settings` · `list_post_types` · `list_taxonomies` · `list_statuses`
`search` · `count_posts` · `count_terms` · `upload_media_from_url`
`get_meta` · `update_meta` · `delete_meta` · `list_revisions` · `restore_revision`
`get_option` · `update_option` · `db_query` *(read-only SELECT)*
`wp_rest` — **استدعِ أي مسار REST، أداة افعل-أي-شيء**
</details>

---

## 🔐 الأمان

- **المصادقة:** الرمز في الرابط، أو ترويسة Bearer، أو OAuth (PKCE + DCR) مع تسجيل دخول وموافقة تلقائيين.
- **نظام ملفات معزول:** كل عمليات الملفات محصورة في `wp-content`، ومحصّنة ضد اجتياز المسار `../`.
- **قاعدة بيانات للقراءة فقط:** `db_query` يقبل `SELECT` فقط.
- **رمز قابل للإبطال:** دوّر الرمز أو أوقف الوصول فورًا من صفحة الإعدادات.
- **مستضاف ذاتيًا:** لا شيء يغادر خادمك — لا مُرحِّل من طرف ثالث.

---

## 🤝 المساهمة

طلبات الدمج والمشكلات والأفكار **مرحّب بها جدًّا** — هذا المشروع مبني لينمو مع المجتمع.

```bash
git clone https://github.com/<you>/wp-claude-bridge.git
# Drop wp-claude-bridge.php into wp-content/plugins/wp-claude-bridge/ on a local WP, activate, hack away.
```

**أفضل المساهمات الأولى:**
- 🧩 أدوات جديدة (مزيد من تقارير WooCommerce، مساعدات CPT، إضافات SEO…)
- 🌍 ترجمات لواجهة الإدارة والمستندات
- 🐛 بلاغات الأخطاء مع خطوات إعادة الإنتاج
- 📖 المستندات والأمثلة وفيديوهات الشرح
- 🔒 مراجعة أمنية لطبقتَي المصادقة والعزل

> افتح مشكلة أولًا للميزات الكبيرة كي نتوافق. التزم بنمط الكود الحالي (الدوال المسبوقة بـ `cb_`، بلا اعتماديات خارجية). كن لطيفًا. 🙌

---

## 📜 الترخيص

[GPLv2 أو أحدث](LICENSE) — حرّ بمعنى الحرية. استخدمه، انسخه، اشحنه.

</div>

<div align="center">

<br>

**صُنع بـ ❤️ لمجتمع WordPress**

⭐ ضع له نجمة إن ساعدك!

</div>
