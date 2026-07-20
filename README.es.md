<div align="center">

# 🌉 WP Claude Bridge

### Convierte cualquier sitio WordPress en un **servidor MCP** completo y autoalojado — y deja que Claude lo gestione.

*Edita archivos de temas y plugins, genera plugins, controla entradas, páginas, WooCommerce, ajustes, la base de datos… más de 100 herramientas, una sola URL, sin intermediarios.*

<br>

[![Version](https://img.shields.io/badge/version-3.5.1-6c47ff?style=for-the-badge)](https://github.com/)
[![License](https://img.shields.io/badge/license-GPLv2-blue?style=for-the-badge)](LICENSE)
[![PHP](https://img.shields.io/badge/PHP-7.4%2B-777BB4?style=for-the-badge&logo=php&logoColor=white)](https://php.net)
[![WordPress](https://img.shields.io/badge/WordPress-5.6%2B-21759B?style=for-the-badge&logo=wordpress&logoColor=white)](https://wordpress.org)

[![MCP](https://img.shields.io/badge/protocol-MCP%202024--11--05-ff6b35?style=flat-square)](https://modelcontextprotocol.io)
[![WooCommerce](https://img.shields.io/badge/WooCommerce-ready-96588a?style=flat-square&logo=woocommerce&logoColor=white)](https://woocommerce.com)
[![OAuth](https://img.shields.io/badge/auth-OAuth%20PKCE%20%2B%20DCR-2ea44f?style=flat-square)](#-seguridad)
[![Single File](https://img.shields.io/badge/install-1%20file%2C%20zero%20deps-success?style=flat-square)](#-instalación)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#-contribuir)
[![Free](https://img.shields.io/badge/free-WPVibe%20%2F%20EasyMCP%20alternative-e63946?style=flat-square)](#)

<br>

**[Instalación](#-instalación) · [Herramientas](#-más-de-100-herramientas) · [Seguridad](#-seguridad) · [Contribuir](#-contribuir)**

<br>

🌐 [English](README.md) · [Русский](README.ru.md) · [Türkçe](README.tr.md) · [العربية](README.ar.md) · [فارسی](README.fa.md) · **Español** · [Deutsch](README.de.md) · [Français](README.fr.md) · [中文](README.zh.md)

</div>

---

## ⚡ ¿Qué es esto?

`WP Claude Bridge` es **un único archivo PHP** que colocas en cualquier sitio WordPress. Expone un servidor completo de [Model Context Protocol](https://modelcontextprotocol.io) para que **Claude (o cualquier cliente MCP) pueda operar todo tu sitio** — leer y escribir archivos, crear plugins, gestionar contenido, controlar WooCommerce, consultar la base de datos y vaciar cachés.

Sin SaaS. Sin cuota mensual. Sin proxy externo. **Tu servidor, tus datos, tus reglas.** Una alternativa libre y abierta a WPVibe y EasyMCP.

```
   Claude  ──►  https://your-site.com/wp-json/claude-bridge/v1/mcp?token=•••  ──►  WordPress
              (one URL, token inside — no headers, no middleman)
```

---

## ✨ Aspectos destacados

| | |
|---|---|
| 🗂️ **Acceso total a archivos** | Lee / escribe / edita / elimina cualquier archivo dentro de `wp-content` — temas **y** plugins. Aislado por ruta contra el path traversal. |
| 🔌 **Crea y gestiona plugins** | Genera un nuevo plugin, actívalo/desactívalo, instálalo desde un slug de wp.org o una URL zip, elimínalo. |
| 🎨 **Control de temas** | Lista, activa, instala, elimina — además de una **URL de vista previa con token de 2 horas** para temas inactivos. |
| 📝 **CRUD completo de WP** | entradas, páginas, medios, categorías, etiquetas, comentarios, usuarios, menús, bloques, plantillas. |
| 🛒 **CRUD de WooCommerce** | productos, pedidos, cupones, clientes, categorías de productos — listar/obtener/crear/actualizar/eliminar. |
| 🧰 **Proxy para todo** | `wp_rest` invoca **cualquier** ruta REST de WP o WooCommerce con permisos completos de administrador. |
| 🗄️ **Consulta de BD de solo lectura** | Acceso `SELECT` seguro con sustitución de tabla `{prefix}`. |
| 🔐 **3 modos de autenticación** | Token en la URL (el más simple), cabecera Bearer, o OAuth completo (PKCE + Dynamic Client Registration). |
| 📦 **Cero dependencias** | Un solo archivo `.php`. Sin composer, sin paso de compilación, sin npm. |

---

## 🚀 Instalación

1. **Descarga** `wp-claude-bridge.php` (o comprímelo como `wp-claude-bridge.zip`).
2. Administración de WordPress → **Plugins → Añadir nuevo → Subir plugin** → instalar y activar.
3. Ve a **Herramientas → Claude Bridge** y copia la **URL lista para usar con token**:
   ```
   https://your-site.com/wp-json/claude-bridge/v1/mcp?token=XXXXXXXX
   ```
4. En Claude, añade un **Custom Connector** y pega esa URL. Listo — el token vive en la URL, **sin necesidad de cabeceras**.

> ⚠️ Mantén esta URL en secreto — concede acceso a nivel de administrador. Rota o revoca el token en cualquier momento desde la misma página de ajustes.

---

## 🧰 Más de 100 herramientas

<details open>
<summary><b>Archivos, plugins, temas, caché</b></summary>

`list_files` · `read_file` · `write_file` · `edit_file` · `delete_file`
`create_plugin` · `set_plugin_state` · `list_plugins` · `install_plugin` · `delete_plugin`
`list_themes` · `activate_theme` · `install_theme` · `delete_theme` · `preview_url`
`flush_cache` *(object cache, W3TC, WP Rocket, OPcache)*
</details>

<details>
<summary><b>Contenido de WordPress — CRUD completo (listar / obtener / crear / actualizar / eliminar)</b></summary>

`posts` · `pages` · `media` · `categories` · `tags` · `comments` · `users` · `menus` · `menu_items` · `blocks` · `templates`

> Los nombres de las herramientas están en plural, p. ej. `create_posts`, `update_pages`, `get_users`.
</details>

<details>
<summary><b>WooCommerce — CRUD completo</b></summary>

`products` · `orders` · `coupons` · `customers` · `product_categories`
</details>

<details>
<summary><b>Sitio, meta, revisiones y herramientas avanzadas</b></summary>

`site_info` · `get_settings` · `update_settings` · `list_post_types` · `list_taxonomies` · `list_statuses`
`search` · `count_posts` · `count_terms` · `upload_media_from_url`
`get_meta` · `update_meta` · `delete_meta` · `list_revisions` · `restore_revision`
`get_option` · `update_option` · `db_query` *(read-only SELECT)*
`wp_rest` — **invoca cualquier ruta REST, la herramienta para todo**
</details>

---

## 🔐 Seguridad

- **Autenticación:** token en la URL, cabecera Bearer, u OAuth (PKCE + DCR) con inicio de sesión automático + consentimiento.
- **Sistema de archivos aislado:** todas las operaciones de archivos confinadas a `wp-content`, reforzadas contra el path traversal con `../`.
- **BD de solo lectura:** `db_query` solo acepta `SELECT`.
- **Token revocable:** rota o cancela el acceso al instante desde la página de ajustes.
- **Autoalojado:** nada sale de tu servidor — sin relé de terceros.

---

## 🤝 Contribuir

Los PRs, las incidencias y las ideas son **muy bienvenidos** — esto está hecho para crecer con la comunidad.

```bash
git clone https://github.com/<you>/wp-claude-bridge.git
# Drop wp-claude-bridge.php into wp-content/plugins/wp-claude-bridge/ on a local WP, activate, hack away.
```

**Buenas primeras contribuciones:**
- 🧩 Nuevas herramientas (más informes de WooCommerce, ayudantes de CPT, plugins de SEO…)
- 🌍 Traducciones de la interfaz de administración y la documentación
- 🐛 Informes de errores con pasos para reproducirlos
- 📖 Documentación, ejemplos, vídeos tutoriales
- 🔒 Revisión de seguridad de las capas de autenticación y aislamiento

> Abre primero una incidencia para funcionalidades grandes, así nos alineamos. Sigue el estilo de código existente (funciones con prefijo `cb_`, sin dependencias externas). Sé amable. 🙌

---

## 📜 Licencia

[GPLv2 o posterior](LICENSE) — libre como en libertad. Úsalo, bifúrcalo, publícalo.

<div align="center">

<br>

**Hecho con ❤️ para la comunidad de WordPress**

⭐ ¡Dale una estrella si te ha sido útil!

</div>
