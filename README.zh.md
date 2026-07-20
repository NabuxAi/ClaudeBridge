<div align="center">

# 🌉 WP Claude Bridge

### 把任意 WordPress 站点变成一个完整的自托管 **MCP server** —— 让 Claude 来运营它。

*编辑主题与插件文件、脚手架式生成插件、管理文章、页面、WooCommerce、设置、数据库…… 100+ 工具，一个 URL，零中间商。*

<br>

[![Version](https://img.shields.io/badge/version-3.5.1-6c47ff?style=for-the-badge)](https://github.com/)
[![License](https://img.shields.io/badge/license-GPLv2-blue?style=for-the-badge)](LICENSE)
[![PHP](https://img.shields.io/badge/PHP-7.4%2B-777BB4?style=for-the-badge&logo=php&logoColor=white)](https://php.net)
[![WordPress](https://img.shields.io/badge/WordPress-5.6%2B-21759B?style=for-the-badge&logo=wordpress&logoColor=white)](https://wordpress.org)

[![MCP](https://img.shields.io/badge/protocol-MCP%202024--11--05-ff6b35?style=flat-square)](https://modelcontextprotocol.io)
[![WooCommerce](https://img.shields.io/badge/WooCommerce-ready-96588a?style=flat-square&logo=woocommerce&logoColor=white)](https://woocommerce.com)
[![OAuth](https://img.shields.io/badge/auth-OAuth%20PKCE%20%2B%20DCR-2ea44f?style=flat-square)](#-安全)
[![Single File](https://img.shields.io/badge/install-1%20file%2C%20zero%20deps-success?style=flat-square)](#-安装)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#-参与贡献)
[![Free](https://img.shields.io/badge/free-WPVibe%20%2F%20EasyMCP%20alternative-e63946?style=flat-square)](#)

<br>

**[安装](#-安装) · [工具](#-100-工具) · [安全](#-安全) · [参与贡献](#-参与贡献)**

<br>

🌐 [English](README.md) · [Русский](README.ru.md) · [Türkçe](README.tr.md) · [العربية](README.ar.md) · [فارسی](README.fa.md) · [Español](README.es.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · **中文**

</div>

---

## ⚡ 这是什么？

`WP Claude Bridge` 是一个**单文件 PHP**，你只需把它放进任意 WordPress 站点即可。它对外提供一个完整的 [Model Context Protocol](https://modelcontextprotocol.io) server，让 **Claude（或任意 MCP 客户端）能够操控你的整个站点** —— 读写文件、构建插件、管理内容、驱动 WooCommerce、查询数据库、清空缓存。

没有 SaaS。没有月费。没有外部代理。**你的服务器，你的数据，你说了算。** 一个免费、开放的 WPVibe 和 EasyMCP 替代方案。

```
   Claude  ──►  https://your-site.com/wp-json/claude-bridge/v1/mcp?token=•••  ──►  WordPress
              (one URL, token inside — no headers, no middleman)
```

---

## ✨ 亮点

| | |
|---|---|
| 🗂️ **完整文件访问** | 读取 / 写入 / 编辑 / 删除 `wp-content` 下的任意文件 —— 主题**和**插件皆可。路径沙箱化，防止目录穿越。 |
| 🔌 **构建并管理插件** | 脚手架式生成新插件、激活/停用、通过 wp.org slug 或 zip URL 安装、删除。 |
| 🎨 **主题控制** | 列出、激活、安装、删除 —— 还可为未启用的主题生成一个**带令牌、2 小时有效的预览 URL**。 |
| 📝 **完整的 WP CRUD** | 文章、页面、媒体、分类、标签、评论、用户、菜单、区块、模板。 |
| 🛒 **WooCommerce CRUD** | 商品、订单、优惠券、客户、商品分类 —— 列出/获取/创建/更新/删除。 |
| 🧰 **万能代理** | `wp_rest` 可以以完整管理员权限调用**任意** WP 或 WooCommerce REST 路由。 |
| 🗄️ **只读数据库查询** | 安全的 `SELECT` 访问，并支持 `{prefix}` 表名替换。 |
| 🔐 **3 种认证模式** | URL 内令牌（最简单）、Bearer 请求头，或完整的 OAuth（PKCE + 动态客户端注册）。 |
| 📦 **零依赖** | 一个 `.php` 文件。无需 composer、无需构建步骤、无需 npm。 |

---

## 🚀 安装

1. **下载** `wp-claude-bridge.php`（或将其打包为 `wp-claude-bridge.zip`）。
2. WordPress 后台 → **插件 → 安装插件 → 上传插件** → 安装并激活。
3. 进入 **工具 → Claude Bridge**，复制那个**已生成好、带令牌的 URL**：
   ```
   https://your-site.com/wp-json/claude-bridge/v1/mcp?token=XXXXXXXX
   ```
4. 在 Claude 中，添加一个 **Custom Connector** 并粘贴该 URL。完成 —— 令牌就在 URL 里，**无需任何请求头**。

> ⚠️ 请妥善保密这个 URL —— 它授予管理员级别的访问权限。你可以随时在同一个设置页面轮换或吊销该令牌。

---

## 🧰 100+ 工具

<details open>
<summary><b>文件、插件、主题、缓存</b></summary>

`list_files` · `read_file` · `write_file` · `edit_file` · `delete_file`
`create_plugin` · `set_plugin_state` · `list_plugins` · `install_plugin` · `delete_plugin`
`list_themes` · `activate_theme` · `install_theme` · `delete_theme` · `preview_url`
`flush_cache` *(对象缓存、W3TC、WP Rocket、OPcache)*
</details>

<details>
<summary><b>WordPress 内容 —— 完整 CRUD（列出 / 获取 / 创建 / 更新 / 删除）</b></summary>

`posts` · `pages` · `media` · `categories` · `tags` · `comments` · `users` · `menus` · `menu_items` · `blocks` · `templates`

> 工具名为复数形式，例如 `create_posts`、`update_pages`、`get_users`。
</details>

<details>
<summary><b>WooCommerce —— 完整 CRUD</b></summary>

`products` · `orders` · `coupons` · `customers` · `product_categories`
</details>

<details>
<summary><b>站点、元数据、修订版本与高级工具</b></summary>

`site_info` · `get_settings` · `update_settings` · `list_post_types` · `list_taxonomies` · `list_statuses`
`search` · `count_posts` · `count_terms` · `upload_media_from_url`
`get_meta` · `update_meta` · `delete_meta` · `list_revisions` · `restore_revision`
`get_option` · `update_option` · `db_query` *(只读 SELECT)*
`wp_rest` —— **调用任意 REST 路由的万能工具**
</details>

---

## 🔐 安全

- **认证：** URL 内令牌、Bearer 请求头，或带自动登录 + 授权同意的 OAuth（PKCE + DCR）。
- **沙箱化文件系统：** 所有文件操作都被限制在 `wp-content` 内，并对 `../` 目录穿越做了加固。
- **只读数据库：** `db_query` 仅接受 `SELECT`。
- **可吊销的令牌：** 在设置页面即可立即轮换或终止访问。
- **自托管：** 没有任何数据离开你的服务器 —— 没有第三方中转。

---

## 🤝 参与贡献

非常欢迎 PR、issue 和各种想法 —— 这个项目就是为了与社区一起成长而生的。

```bash
git clone https://github.com/<you>/wp-claude-bridge.git
# Drop wp-claude-bridge.php into wp-content/plugins/wp-claude-bridge/ on a local WP, activate, hack away.
```

**适合上手的贡献：**
- 🧩 新工具（更多 WooCommerce 报表、CPT 辅助工具、SEO 插件……）
- 🌍 后台界面与文档的翻译
- 🐛 带复现步骤的 Bug 报告
- 📖 文档、示例、教程视频
- 🔒 对认证与沙箱层的安全审查

> 对于较大的功能，请先开一个 issue，以便我们对齐方向。请遵循现有的代码风格（`cb_` 前缀的函数，无外部依赖）。请保持友善。🙌

---

## 📜 许可证

[GPLv2 或更新版本](LICENSE) —— 自由如自由软件之自由。用它、fork 它、发布它。

<div align="center">

<br>

**为 WordPress 社区用 ❤️ 打造**

⭐ 如果它帮到了你，请点个 Star！

</div>
