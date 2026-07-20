<div align="center">

# 🌉 WP Claude Bridge

### Herhangi bir WordPress sitesini tam, kendi sunucunuzda barındırılan bir **MCP sunucusuna** dönüştürün — ve yönetimini Claude'a bırakın.

*Tema ve eklenti dosyalarını düzenleyin, eklentileri sıfırdan oluşturun, yazıları, sayfaları, WooCommerce'i, ayarları ve veritabanını yönetin… 100'den fazla araç, tek bir URL, hiçbir aracı yok.*

<br>

[![Version](https://img.shields.io/badge/version-3.5.1-6c47ff?style=for-the-badge)](https://github.com/)
[![License](https://img.shields.io/badge/license-GPLv2-blue?style=for-the-badge)](LICENSE)
[![PHP](https://img.shields.io/badge/PHP-7.4%2B-777BB4?style=for-the-badge&logo=php&logoColor=white)](https://php.net)
[![WordPress](https://img.shields.io/badge/WordPress-5.6%2B-21759B?style=for-the-badge&logo=wordpress&logoColor=white)](https://wordpress.org)

[![MCP](https://img.shields.io/badge/protocol-MCP%202024--11--05-ff6b35?style=flat-square)](https://modelcontextprotocol.io)
[![WooCommerce](https://img.shields.io/badge/WooCommerce-ready-96588a?style=flat-square&logo=woocommerce&logoColor=white)](https://woocommerce.com)
[![OAuth](https://img.shields.io/badge/auth-OAuth%20PKCE%20%2B%20DCR-2ea44f?style=flat-square)](#-güvenlik)
[![Single File](https://img.shields.io/badge/install-1%20file%2C%20zero%20deps-success?style=flat-square)](#-kurulum)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#-katkıda-bulunma)
[![Free](https://img.shields.io/badge/free-WPVibe%20%2F%20EasyMCP%20alternative-e63946?style=flat-square)](#)

<br>

**[Kurulum](#-kurulum) · [Araçlar](#-100-araç) · [Güvenlik](#-güvenlik) · [Katkıda Bulunma](#-katkıda-bulunma)**

<br>

🌐 [English](README.md) · [Русский](README.ru.md) · **Türkçe** · [العربية](README.ar.md) · [فارسی](README.fa.md) · [Español](README.es.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [中文](README.zh.md)

</div>

---

## ⚡ Bu nedir?

`WP Claude Bridge`, herhangi bir WordPress sitesine bırakabileceğiniz **tek bir PHP dosyasıdır**. Eksiksiz bir [Model Context Protocol](https://modelcontextprotocol.io) sunucusu sunar; böylece **Claude (veya herhangi bir MCP istemcisi) tüm sitenizi çalıştırabilir** — dosyaları okuyup yazabilir, eklentiler oluşturabilir, içerik yönetebilir, WooCommerce'i sürebilir, veritabanını sorgulayabilir, önbellekleri temizleyebilir.

SaaS yok. Aylık ücret yok. Harici bir proxy yok. **Sizin sunucunuz, sizin verileriniz, sizin kurallarınız.** WPVibe ve EasyMCP'ye ücretsiz, açık bir alternatif.

```
   Claude  ──►  https://your-site.com/wp-json/claude-bridge/v1/mcp?token=•••  ──►  WordPress
              (one URL, token inside — no headers, no middleman)
```

---

## ✨ Öne Çıkanlar

| | |
|---|---|
| 🗂️ **Tam dosya erişimi** | `wp-content` altındaki herhangi bir dosyayı okuyun / yazın / düzenleyin / silin — temalar **ve** eklentiler. Dizin atlamasına karşı yol-korumalı (path-sandboxed). |
| 🔌 **Eklenti oluşturma ve yönetme** | Yeni bir eklenti oluşturun, etkinleştirin/devre dışı bırakın, wp.org slug'ından veya zip URL'sinden kurun, silin. |
| 🎨 **Tema kontrolü** | Listeleyin, etkinleştirin, kurun, silin — ayrıca pasif temalar için **2 saatlik token'lı bir önizleme URL'si**. |
| 📝 **Tam WP CRUD** | yazılar, sayfalar, medya, kategoriler, etiketler, yorumlar, kullanıcılar, menüler, bloklar, şablonlar. |
| 🛒 **WooCommerce CRUD** | ürünler, siparişler, kuponlar, müşteriler, ürün kategorileri — listeleyin/alın/oluşturun/güncelleyin/silin. |
| 🧰 **Her şeyi yapan proxy** | `wp_rest`, tam yönetici yetkileriyle **herhangi bir** WP veya WooCommerce REST rotasını çağırır. |
| 🗄️ **Salt okunur DB sorgusu** | `{prefix}` tablo değişimiyle güvenli `SELECT` erişimi. |
| 🔐 **3 kimlik doğrulama modu** | URL içinde token (en basiti), Bearer başlığı veya tam OAuth (PKCE + Dinamik İstemci Kaydı). |
| 📦 **Sıfır bağımlılık** | Tek bir `.php` dosyası. composer yok, derleme adımı yok, npm yok. |

---

## 🚀 Kurulum

1. `wp-claude-bridge.php` dosyasını **indirin** (veya `wp-claude-bridge.zip` olarak sıkıştırın).
2. WordPress yönetim paneli → **Eklentiler → Yeni Ekle → Eklenti Yükle** → kurun ve etkinleştirin.
3. **Araçlar → Claude Bridge** bölümüne gidin ve **token'lı hazır URL'yi** kopyalayın:
   ```
   https://your-site.com/wp-json/claude-bridge/v1/mcp?token=XXXXXXXX
   ```
4. Claude'da bir **Özel Bağlayıcı (Custom Connector)** ekleyin ve o URL'yi yapıştırın. Bitti — token URL'nin içinde yaşar, **başlığa gerek yok**.

> ⚠️ Bu URL'yi gizli tutun — yönetici düzeyinde erişim sağlar. Token'ı aynı ayarlar sayfasından istediğiniz zaman değiştirebilir veya iptal edebilirsiniz.

---

## 🧰 100+ Araç

<details open>
<summary><b>Dosyalar, eklentiler, temalar, önbellek</b></summary>

`list_files` · `read_file` · `write_file` · `edit_file` · `delete_file`
`create_plugin` · `set_plugin_state` · `list_plugins` · `install_plugin` · `delete_plugin`
`list_themes` · `activate_theme` · `install_theme` · `delete_theme` · `preview_url`
`flush_cache` *(nesne önbelleği, W3TC, WP Rocket, OPcache)*
</details>

<details>
<summary><b>WordPress içeriği — tam CRUD (listele / al / oluştur / güncelle / sil)</b></summary>

`posts` · `pages` · `media` · `categories` · `tags` · `comments` · `users` · `menus` · `menu_items` · `blocks` · `templates`

> Araç adları çoğuldur, örneğin `create_posts`, `update_pages`, `get_users`.
</details>

<details>
<summary><b>WooCommerce — tam CRUD</b></summary>

`products` · `orders` · `coupons` · `customers` · `product_categories`
</details>

<details>
<summary><b>Site, meta, revizyonlar ve güçlü araçlar</b></summary>

`site_info` · `get_settings` · `update_settings` · `list_post_types` · `list_taxonomies` · `list_statuses`
`search` · `count_posts` · `count_terms` · `upload_media_from_url`
`get_meta` · `update_meta` · `delete_meta` · `list_revisions` · `restore_revision`
`get_option` · `update_option` · `db_query` *(salt okunur SELECT)*
`wp_rest` — **herhangi bir REST rotasını çağırın, her şeyi yapan araç**
</details>

---

## 🔐 Güvenlik

- **Kimlik doğrulama:** URL içinde token, Bearer başlığı veya otomatik oturum açma + onay ile OAuth (PKCE + DCR).
- **Korumalı dosya sistemi:** tüm dosya işlemleri `wp-content` ile sınırlıdır, `../` dizin atlamasına karşı sağlamlaştırılmıştır.
- **Salt okunur DB:** `db_query` yalnızca `SELECT` kabul eder.
- **İptal edilebilir token:** ayarlar sayfasından erişimi anında değiştirin veya kapatın.
- **Kendi sunucunuzda barındırılan:** hiçbir şey sunucunuzdan çıkmaz — üçüncü taraf aktarımı yok.

---

## 🤝 Katkıda Bulunma

PR'lar, sorunlar (issues) ve fikirler **çok memnuniyetle karşılanır** — bu, toplulukla birlikte büyümek üzere inşa edildi.

```bash
git clone https://github.com/<you>/wp-claude-bridge.git
# Drop wp-claude-bridge.php into wp-content/plugins/wp-claude-bridge/ on a local WP, activate, hack away.
```

**İyi ilk katkılar:**
- 🧩 Yeni araçlar (daha fazla WooCommerce raporu, CPT yardımcıları, SEO eklentileri…)
- 🌍 Yönetim arayüzünün ve dokümanların çevirileri
- 🐛 Yeniden üretme adımlarıyla birlikte hata raporları
- 📖 Dokümanlar, örnekler, eğitim videoları
- 🔒 Kimlik doğrulama ve korumalı alan (sandbox) katmanlarının güvenlik incelemesi

> Büyük özellikler için önce bir issue açın ki uyum sağlayabilelim. Mevcut kod stiline uyun (`cb_` ön ekli fonksiyonlar, harici bağımlılık yok). Nazik olun. 🙌

---

## 📜 Lisans

[GPLv2 veya üzeri](LICENSE) — özgürlük anlamında ücretsiz. Kullanın, çatallayın (fork), yayınlayın.

<div align="center">

<br>

**WordPress topluluğu için ❤️ ile yapıldı**

⭐ İşinize yaradıysa yıldız verin!

</div>
