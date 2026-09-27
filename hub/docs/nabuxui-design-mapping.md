# نقشه نگاشت طراحی NabuxUi → DigiWP hub

استخراج‌شده از منبع واقعی NabuxUi (بازبینی 2026-09-27) و وضعیت فعلی هاب:

- `NabuXUi/packages/core/src/css/tokens.css` — توکن‌ها؛ خروجی بسته‌بندی‌شده در `packages/core/dist/nabuxui.css` با لایه‌های `@layer nx.tokens, nx.base, nx.components, nx.utilities`
- `NabuXUi/packages/core/src/css/base.css` — قواعد فارسی/RTL (`:lang(fa)` در خط 24–35)
- `NabuXUi/packages/core/src/css/blocks/glass.css` — ماده‌ی شیشه‌ی مایع
- `NabuXUi/packages/core/src/css/components/{card,button,hero,header,feedback,text}.css` و `blocks/data.css` — کامپوننت‌ها
- `NabuXUi/apps/showcase/index.html:12` (بار فونت) و `apps/showcase/src/showcase.css:199-257` (بستر شیشه)
- هاب: `hub/src/styles/digiwp.css` (814 خط)، `hub/src/styles/app.css` (112 خط)، ورود CSS در `hub/src/main.jsx:4-5`

**اصل نگاشت:** نام متغیرهای `--gd-*` ثابت می‌ماند؛ فقط مقدارشون عوض می‌شود. کلاس‌های `.gd-*` و `.dwp-*` موجود تغییر نمی‌کنند — با تعویض توکن، همه‌ی UI فعلی رنگ می‌گیرد.

**نکته‌ی لایه‌بندی:** CSS هاب لایه‌بندی‌شده نیست و بعد از هر `@layer nx.*` می‌آید (`index.css:8` ترتیب لایه‌ها را تعیین می‌کند و قانون cascade می‌گوید قاعده‌ی بیرون از لایه برنده است). پس اگر بعداً `nabuxui.css` هم بارگذاری شود، توکن‌ها و کلاس‌های هاب همچنان برنده می‌مانند. `app.css` دست‌نخورده می‌ماند.

---

## ۱) جدول نگاشت توکن‌به‌توکن

### ۱.۱ رنگ‌ها — تم روشن (`:root`)

منبع مقادیر: `tokens.css:123-192`. مقادیر فعلی: `digiwp.css:107-169`.

| توکن هاب | مقدار فعلی | مقدار پیشنهادی | دلیل |
|---|---|---|---|
| `--gd-bg-app` | `#f4f6f9` | `var(--nx-bg)` → `#fcfbf8` | کاغذ گرم clay، پس‌زمینه امضای Nabux (به‌جای خاکستری سرد) |
| `--gd-bg-surface` | `#ffffff` | `var(--nx-surface)` → `#ffffff` | یکسان |
| `--gd-bg-subtle` | `#fafbfc` | `var(--nx-bg-subtle)` → `#f7f5ef` | هم‌خانواده‌ی گرم پس‌زمینه |
| `--gd-bg-inset` | `#eaeef4` | `var(--nx-surface-2)` → `#f4f3ef` | سطح فرورفته‌ی استاندارد nx (track اسلایدر/تب) |
| `--gd-bg-hover` | `#f4f6f9` | `var(--nx-surface-2)` → `#f4f3ef` | در nx، hover دکمه/ردیف روی `surface-2` است (`button.css:61-63`، `data.css:642`) |
| `--gd-ink` | `#0b1120` | `var(--nx-ink-950)` → `#0a0c17` | مشکی سرمه‌ای nx برای اسکریم/متن معکوس |
| `--gd-border` | `#d5dde8` | `var(--nx-border)` → `#e7e4dc` | خط ظریف‌تر و هم‌دما با سطوح |
| `--gd-border-subtle` | `#e2e7ef` | `color-mix(in oklab, var(--nx-border) 60%, transparent)` | nx توکن subtle ندارد؛ الگوی خطوط کم‌رنگ (`hero.css:167`) |
| `--gd-border-strong` | `#bcc7d6` | `var(--nx-border-strong)` → `#8f93a9` | کنتراست بیشتر برای border ورودی، مطابق فرم nx |
| `--gd-text` | `#151b27` | `var(--nx-text)` → `#12141f` | مرکب اصلی nx |
| `--gd-text-secondary` | `#586579` | `var(--nx-text-muted)` → `#555a70` | متن فرعی nx |
| `--gd-text-muted` | `#75839a` | `var(--nx-text-subtle)` → `#6c7088` | متن کم‌اهمیت nx |
| `--gd-text-disabled` | `#9aa7bb` | `var(--nx-ink-400)` → `#9a9db3` | نزدیک‌ترین پله‌ی خنثی |
| `--gd-text-inverse` | `#ffffff` | `var(--nx-text-inverse)` → `#f5f6fb` | سفید مایل به آبی nx |
| `--gd-primary` | `#2f49cb` | `var(--nx-accent)` → `#5647e6` | لاجورد Nabux جایگزین آبی Guardian |
| `--gd-primary-hover` | `#2839a6` | `var(--nx-accent-hover)` → `#4739ca` | پله‌ی hover رسمی |
| `--gd-primary-active` | `#243286` | `var(--nx-lapis-800)` → `#3b31a3` | یک پله زیر hover در مقیاس lapis |
| `--gd-primary-subtle` | `#eef2fe` | `var(--nx-accent-soft)` → `color-mix(in oklab, #5647e6 12%, transparent)` | سطح نرم شفاف nx؛ روی هر پس‌زمینه‌ای می‌نشیند |
| `--gd-primary-border` | `#bccbfb` | `var(--nx-accent-border)` → `color-mix(in oklab, #5647e6 35%, transparent)` | الگوی border نرم nx |
| `--gd-on-primary` | `#ffffff` | `var(--nx-accent-contrast)` → `#ffffff` | یکسان |
| `--gd-accent` | `#0bb1c4` | `var(--nx-glow)` → `#06c7e3` | نقش «زنده / AI / در حال بررسی» دقیقاً همان glow است |
| `--gd-accent-subtle` | `#e6fafd` | `var(--nx-info-soft)` → `color-mix(in oklab, #06c7e3 14%, transparent)` | تنها توکن نرم ساخته‌شده از cyan در nx |
| `--gd-success` | `#128040` | `var(--nx-success)` → `#059669` | سبز سمنتیک nx |
| `--gd-success-text` | `#0e6633` | `var(--nx-success-text)` → `#047857` | متن سبز nx |
| `--gd-success-bg` | `#e7f8ef` | `var(--nx-success-soft)` → `color-mix(in oklab, #10b981 14%, transparent)` | پس‌زمینه‌ی نرم شفاف |
| `--gd-success-border` | `#98e2ba` | `color-mix(in oklab, var(--nx-success) 28%, transparent)` | الگوی border بج وضعیت nx (`data.css:729`) |
| `--gd-warning` | `#e2900d` | `var(--nx-warning)` → `#f59e0b` | کهربایی nx |
| `--gd-warning-text` | `#985c08` | `var(--nx-warning-text)` → `#a45207` | متن کهربایی nx |
| `--gd-warning-bg` | `#fef5e7` | `var(--nx-warning-soft)` → `color-mix(in oklab, #f59e0b 16%, transparent)` | پس‌زمینه‌ی نرم شفاف |
| `--gd-warning-border` | `#f8d38a` | `color-mix(in oklab, var(--nx-warning) 28%, transparent)` | الگوی ۲۸٪ بج nx |
| `--gd-danger` | `#c22b2b` | `var(--nx-danger)` → `#dc2626` | قرمز nx |
| `--gd-danger-text` | `#9e2020` | `var(--nx-danger-text)` → `#c02424` | متن قرمز nx |
| `--gd-danger-bg` | `#fdecec` | `var(--nx-danger-soft)` → `color-mix(in oklab, #ef4444 12%, transparent)` | پس‌زمینه‌ی نرم شفاف |
| `--gd-danger-border` | `#f4adad` | `color-mix(in oklab, var(--nx-danger) 28%, transparent)` | الگوی ۲۸٪ بج nx |
| `--gd-info` | `#2f49cb` | `var(--nx-info)` → `#0aa0bb` | info در nx فیروزه‌ای است، نه آبی — تفکیک از primary |
| `--gd-info-text` | `#2839a6` | `var(--nx-info-text)` → `#0b7288` | متن info nx |
| `--gd-info-bg` | `#eef2fe` | `var(--nx-info-soft)` → `color-mix(in oklab, #06c7e3 14%, transparent)` | پس‌زمینه‌ی نرم شفاف |
| `--gd-info-border` | `#bccbfb` | `color-mix(in oklab, var(--nx-info) 28%, transparent)` | الگوی ۲۸٪ بج nx |
| `--gd-authority-report` | `#75839a` | `var(--nx-text-subtle)` → `#6c7088` | «فقط گزارش» بی‌طرف می‌ماند |
| `--gd-authority-confirm` | `#e2900d` | `var(--nx-warning)` → `#f59e0b` | «تأیید انسانی» = کهربایی |
| `--gd-authority-auto` | `#128040` | `var(--nx-success)` → `#059669` | «خودکار مجاز» = سبز |
| `--gd-focus-ring` | `#3f60e3` | `var(--nx-ring)` → `#5647e6` | حلقه‌ی فوکوس با رنگ accent |

**بج «checking» هاب** (`digiwp.css:479-480`) از `--gd-cyan-700/--gd-cyan-200` تغذیه می‌شود؛ این دو پله‌ی خام را نگه دارید و فقط روشنایی را از `--nx-cyan-700` (#0b7288) و `--nx-cyan-300` (#7df3ff) بگیرید.

### ۱.۲ تم تیره — `[data-theme="ink"]`

مقادیر تیره‌ی nx از `tokens.css:274-343`. مقادیر فعلی: `digiwp.css:177-222`.

| توکن هاب (در ink) | مقدار فعلی | مقدار پیشنهادی |
|---|---|---|
| `--gd-bg-app` | `#0b1120` | `#070812` |
| `--gd-bg-surface` | `#111a2e` | `#0f1120` |
| `--gd-bg-subtle` | `#0e1626` | `#0b0d19` |
| `--gd-bg-inset` / `--gd-bg-hover` | `#0a101d` / `#16223a` | `#161a2c` (surface-2 تیره) |
| `--gd-border` / `--gd-border-strong` | `rgba(255,255,255,.10/.18)` | `#23273f` / `#5b6083` |
| `--gd-text` / `--gd-text-secondary` / `--gd-text-muted` | `#eef2f8 / #aab6ca / #7c89a0` | `#eef0f8 / #a4a8bf / #80859e` |
| `--gd-primary` (+hover/active) | `blue-400/300/200` | `#6259f0` / `#8482fb` / `#aeb1ff` |
| `--gd-accent` | `cyan-400` | `#2ee6fb` |
| `--gd-success-text` / `--gd-warning-text` / `--gd-danger-text` / `--gd-info-text` | پله‌های 400 | `#3ddc97` / `#fbbf24` / `#ff7a7a` / `#40e0f5` |
| `--gd-focus-ring` | `blue-300` | `#aeb1ff` |

پس‌زمینه‌های نرم وضعیت در ink → نسخه‌های تیره‌ی `--nx-*-soft` (۱۶–۱۸٪ mix؛ `tokens.css:299-309`).

### ۱.۳ شعاع

مقادیر فعلی `digiwp.css:327-334`؛ مقادیر nx از `tokens.css:90-96`. نگاشت ۱:۱ نام‌ها (یک پله درشت‌تر):

| توکن | فعلی | پیشنهادی |
|---|---|---|
| `--gd-radius-xs` | 4px | `var(--nx-radius-xs)` = 6px |
| `--gd-radius-sm` | 6px | `var(--nx-radius-sm)` = 8px |
| `--gd-radius-md` | 8px | `var(--nx-radius-md)` = 12px |
| `--gd-radius-lg` | 12px | `var(--nx-radius-lg)` = 16px |
| `--gd-radius-xl` | 16px | `var(--nx-radius-xl)` = 22px |
| `--gd-radius-2xl` | 22px | `var(--nx-radius-2xl)` = 28px |
| `--gd-radius-pill` / `--gd-radius-full` | 999/9999px | `var(--nx-radius-full)` = 999px |

احتیاط: اگر دکمه‌ها با 12px بیش‌ازحد گرد شدند، فقط `--gd-radius-md` را روی `var(--nx-radius-sm)` نگه دارید (هیچ چیز دیگری تغییر نمی‌کند).

### ۱.۴ سایه و رینگ

سایه‌های nx با مرکب `#0a0c17` ساخته شده‌اند — همان فلسفه‌ی «هرگز سیاه خالص نه» در `digiwp.css:339-343`. نگاشت مستقیم (`tokens.css:175-180`):

| توکن | پیشنهادی |
|---|---|
| `--gd-shadow-xs` … `--gd-shadow-xl` | `var(--nx-shadow-xs)` … `var(--nx-shadow-xl)` |
| `--gd-glow-accent` | `var(--nx-shadow-glow)` (حلقه ۱px + هاله‌ی accent؛ `tokens.css:180`) |
| `--gd-ring` / `--gd-ring-danger` / `--gd-ring-success` | فرمول فعلی می‌ماند؛ مقدار از توکن‌های رنگ جدید می‌آید |

الگوی مکمل nx که به همه‌ی سطح‌های بالارونده اضافه شود: `inset 0 1px 0 var(--nx-highlight)` (روشنایی ۱px لبه‌ی بالا — `card.css:28`، `button.css:103`، `data.css:578`). معادل: `--gd-highlight: rgb(255 255 255 / 0.9)` روشن / `rgb(255 255 255 / 0.07)` تیره.

### ۱.۵ فاصله‌ها

هر دو سیستم روی شبکه‌ی 4px هستند (`digiwp.css:293-311`، `tokens.css:74-84`). نگاشت با نام‌های مشترک، بقیه ثابت:

- `--gd-space-1/2/3/4/5/6/8/10/12/16/24` → `var(--nx-space-…)` (مقادیر برابرند؛ صرفاً منبع واحد می‌شود)
- `--gd-space-0, px, 0-5, 1-5, 2-5, 7, 20, 32` → بدون تغییر (معادل در nx وجود ندارد)
- اسکلت چیدمان (`--gd-sidebar-width`, `--gd-topbar-height`, `--gd-container*`, `--gd-page-gutter`) → بدون تغییر

### ۱.۶ فونت و تایپوگرافی

| توکن | فعلی | پیشنهادی | دلیل |
|---|---|---|---|
| `--gd-font-sans` | `'Vazirmatn', …` | `'Vazirmatn', 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif` | ترتیب فارسی‌اول مطابق `base.css:25`؛ Inter برای ریزمتن لاتین |
| `--gd-font-mono` | JetBrains Mono | بدون تغییر (همان استک nx) | اعداد/کد فنی |
| خانواده‌ی `--gd-font-display` (ترکیب خط 277) | Vazirmatn | `'Bricolage Grotesque', 'Vazirmatn', ui-sans-serif, sans-serif` | فونت نمایشی nx (`tokens.css:62`)؛ گلیف فارسی در Bricolage نیست و خودبه‌خود به Vazirmatn می‌افتد، حروف لاتین و ارقام Bricolage می‌شوند |
| `--gd-text-xs … --gd-text-3xl` | 12/13/14/15/17/20/24/30px | **بدون تغییر** | مقیاس هاب عمداً متراکم‌تر است؛ تراکم داشبورد حفظ شود |
| `--gd-text-4xl` | 2.375rem | `clamp(1.875rem, 1.4rem + 1.6vw, 2.5rem)` | `--nx-text-4xl` |
| `--gd-text-5xl` | 3rem | `clamp(2.25rem, 1.5rem + 3vw, 3.5rem)` | `--nx-text-5xl` |
| `--gd-text-6xl` | 3.75rem | `clamp(2.6rem, 1.4rem + 5vw, 5rem)` | `--nx-text-display` |
| وزن‌ها | 300–800 | بدون تغییر | Bricolage با `500..800` بار می‌شود (`showcase/index.html:12`)؛ وزن 900 از import حذف می‌شود چون هیچ توکنی آن را استفاده نمی‌کند |
| `--gd-tracking-*` | 0 → ±0.06em | بدون تغییر | قاعده‌ی «فقط لاتین» از قبل در `digiwp.css:230-235` ثبت است؛ برای فارسی صفر (بخش ۵) |

### ۱.۷ حرکت

| توکن | فعلی | پیشنهادی | دلیل |
|---|---|---|---|
| `--gd-duration-fast` | 120ms | `var(--nx-dur-fast)` = 150ms | |
| `--gd-duration` | 180ms | `var(--nx-dur-base)` = 220ms | |
| `--gd-duration-slow` | 280ms | `var(--nx-dur-slow)` = 380ms | |
| `--gd-ease-standard` | `cubic-bezier(0.2,0,0,1)` | `var(--nx-ease-emphasized)` | منحنی یکسان است (`tokens.css:111`) |
| `--gd-ease-emphasized` | `cubic-bezier(0.16,1,0.3,1)` | `var(--nx-ease-out)` | منحنی یکسان است (`tokens.css:108`) |
| `--gd-ease-in` / `--gd-ease-out` | منحنی‌های متریال | `var(--nx-ease-in)` / `var(--nx-ease-out)` | یکسان‌سازی با زبان حرکت nx |

تقاطع نام‌ها عمدی است: gd-standard == nx-emphasized و gd-emphasized == nx-out. فقط منبع تغییر می‌کند، رفتار فعلی حفظ می‌شود.

---

## ۲) فونت

خط 22 `digiwp.css` را با این import جایگزین کنید (ترکیب بار دقیق showcase + وزن‌های mono مورد نیاز هاب):

```css
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Vazirmatn:wght@300..800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
```

قواعد استفاده:

1. **فارسی (بدنه، فرم، جدول، تیتر پنل):** Vazirmatn از طریق `--gd-font-sans` — هیچ تغییر مسیری لازم نیست.
2. **تیترها و اعداد نمایشی (hero مارکتینگ، page-head، `--gd-font-display`، مقادیر `.gd-metric__value`):** Bricolage Grotesque اول در استک؛ ارقام لاتین و کلمات لاتین Bricolage می‌شوند و متن فارسی به Vazirmatn برمی‌گردد (fallback per-glyph).
3. **اعداد فنی (timestamps، کد خطا، لاگ، ستون‌های جدول متریک):** JetBrains Mono می‌ماند (`.gd-num`/`.gd-mono` — `digiwp.css:431`). اگر ارقام Bricolage در جدولی لرزش عرضی داشت، همان مورد mono بماند.
4. خط‌کش تیتر فارسی نمایشی: `line-height: 1.3` (`hero.css:82` — «فارسی جای ascender و نقطه می‌خواهد»).

---

## ۳) افکت شیشه‌ای، گرادیان و سایه — کد واقعی از منبع

### ۳.۱ توکن‌های شیشه (افزودنی جدید به `digiwp.css`)

از `tokens.css:161-173` (روشن) و `tokens.css:236-247` (تیره):

```css
:root {
  --gd-glass:           rgb(255 255 255 / 0.72);
  --gd-glass-border:    rgb(255 255 255 / 0.6);
  --gd-glass-tint:      rgb(255 255 255 / 0.26);
  --gd-glass-tint-hover: rgb(255 255 255 / 0.4);
  --gd-glass-rim:       rgb(255 255 255 / 0.95);
  --gd-glass-rim-soft:  rgb(255 255 255 / 0.5);
  --gd-glass-edge:      rgb(17 19 31 / 0.1);
  --gd-glass-shade:     rgb(17 19 31 / 0.16);
  --gd-glass-sheen:     rgb(255 255 255 / 0.5);
  --gd-highlight:       rgb(255 255 255 / 0.9);
}
[data-theme="ink"] {
  --gd-glass:           rgb(18 21 36 / 0.62);
  --gd-glass-border:    rgb(255 255 255 / 0.08);
  --gd-glass-tint:      rgb(255 255 255 / 0.06);
  --gd-glass-tint-hover: rgb(255 255 255 / 0.11);
  --gd-glass-rim:       rgb(255 255 255 / 0.62);
  --gd-glass-rim-soft:  rgb(255 255 255 / 0.14);
  --gd-glass-edge:      rgb(0 0 0 / 0.55);
  --gd-glass-shade:     rgb(0 0 0 / 0.5);
  --gd-glass-sheen:     rgb(255 255 255 / 0.12);
  --gd-highlight:       rgb(255 255 255 / 0.07);
}
```

### ۳.۲ شرط کارکرد شیشه

شیشه روی زمینه‌ی سفید تخت نامرئی است. نمونه‌ی رسمی showcase همیشه شیشه را روی بستر رنگی می‌گذارد (`apps/showcase/src/showcase.css:210-234` — چهار بلاب blur(28px) با رنگ‌های lapis/violet/cyan/gold؛ `blocks/glass.tsx:19-36`). برای hero هاب از بستر aurora استفاده کنید (بند ۳.۵).

### ۳.۳ ماده‌ی شیشه (کارت‌ها)

ترجمه‌ی مستقیم `.nx-glass` از `blocks/glass.css:31-65`:

```css
.gd-card--glass {
  position: relative;
  isolation: isolate;
  background-color: var(--gd-glass-tint);
  background-image: linear-gradient(180deg, var(--gd-glass-sheen), transparent 42%);
  -webkit-backdrop-filter: blur(10px) saturate(1.7);
  backdrop-filter: blur(10px) saturate(1.7);
  border-radius: var(--gd-radius-2xl);
  color: var(--gd-text);
  box-shadow:
    inset 0 0 0 1px var(--gd-glass-rim-soft),
    inset 0 1px 0 var(--gd-glass-rim),
    0 0 0 0.5px var(--gd-glass-edge),
    0 1px 2px var(--gd-glass-shade),
    0 16px 36px -16px var(--gd-glass-shade);
}
```

و لبه‌ی نوری چرخان دور پنل (`glass.css:68-93` — conic-gradient با ماسک حلقه‌ای):

```css
.gd-card--glass::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1.25px;
  background: conic-gradient(
    from 315deg,
    var(--gd-glass-rim) 0deg, transparent 58deg,
    var(--gd-glass-edge) 90deg, transparent 122deg,
    var(--gd-glass-rim-soft) 180deg, transparent 238deg,
    var(--gd-glass-edge) 270deg, transparent 302deg,
    var(--gd-glass-rim) 360deg
  );
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
  pointer-events: none;
}
```

پیش‌تنظیم‌های مواد (`glass.css:52-64`): شفاف `--_frost: 1px; tint: transparent`، برفی `blur(24px) + tint-hover`، ضخیم `blur(4px)` با rim دوتایی و سایه‌ی عمیق‌تر. حالت hover تعاملی: tint به `--gd-glass-tint-hover` می‌رود (`glass.css:133-135`).

نکته: `.gd-card--glass` را به‌عنوان کلاس مستقل استفاده کنید، نه modifier روی `.gd-card` (background مات `.gd-card` را بازنویسی می‌کند).

### ۳.۴ ناوبری (نوار بالای مارکتینگ)

الگوی رسمی header nx — «full-width که بعد از اسکرول شیشه‌ای می‌شود» (`components/header.css:47-54`):

```css
.dwp-mkt-nav.is-scrolled {
  background: var(--gd-glass);
  -webkit-backdrop-filter: blur(16px) saturate(160%);
  backdrop-filter: blur(16px) saturate(160%);
  box-shadow: 0 1px 0 var(--gd-border);
}
```

نسخه‌ی شناور قرصی‌شکل (`header.css:57-75`): `border-radius: var(--gd-radius-full)` + پس از اسکرول `background: var(--gd-glass)`؛ `blur(18px) saturate(170%)`؛ `box-shadow: var(--gd-shadow-lg), inset 0 1px 0 var(--gd-highlight)`. flag `data-scrolled` را با چند خط JS در `MarketingLayout` بگذارید.

### ۳.۵ Hero

- **eyebrow شیشه‌ای** (`hero.css:44-56`): pill با `background: var(--gd-glass)`؛ `backdrop-filter: blur(12px)`؛ `border: 1px solid var(--gd-border)`؛ `box-shadow: var(--gd-shadow-xs)`.
- **تیتر:** `font: 700 var(--gd-text-6xl)/1.3 var(--gd-font-display)` (۱.۳ برای فارسی — `hero.css:82`)؛ برای تاکید روی عبارت کلیدی از گرادیان متن بند ۳.۶.
- **بستر aurora** (`hero.css:140-161`) — سه نور شناور با mask شعاعی:

```css
.dwp-hero-backdrop {
  position: absolute;
  inset: 0;
  z-index: -1;
  overflow: clip;
  pointer-events: none;
  mask-image: radial-gradient(ellipse 80% 70% at 50% 30%, #000 30%, transparent 75%);
}
.dwp-hero-backdrop > i {
  position: absolute;
  inline-size: 55vmax;
  aspect-ratio: 1;
  border-radius: 50%;
  filter: blur(70px);
  opacity: 0.28;                       /* --nx-backdrop-intensity روشن */
  animation: dwp-drift 22s ease-in-out infinite alternate;
}
.dwp-hero-backdrop > i:nth-child(1) { inset: -30% auto auto -10%; background: radial-gradient(circle, #6a63f4, transparent 65%); }
.dwp-hero-backdrop > i:nth-child(2) { inset: -25% -15% auto auto; background: radial-gradient(circle, #8b5cf6, transparent 65%); animation-duration: 28s; animation-delay: -8s; }
.dwp-hero-backdrop > i:nth-child(3) { inset: 10% auto auto 25%; background: radial-gradient(circle, #2ee6fb, transparent 60%); opacity: 0.17; animation-duration: 34s; animation-delay: -16s; }
@keyframes dwp-drift {
  33%  { translate: 8vmax 4vmax; scale: 1.08; }
  66%  { translate: -6vmax 6vmax; scale: 0.94; }
  100% { translate: 4vmax -3vmax; scale: 1.04; }
}
@media (prefers-reduced-motion: reduce) { .dwp-hero-backdrop > i { animation: none; } }
```

نسخه‌ی تیره‌ی hero (داخل `[data-theme="ink"]`): opacity بلاب‌ها 0.45 (`--nx-backdrop-intensity` تیره) و مقادیر گرادیان از گرادیان‌های تیره‌ی tokens.css:264-267.

### ۳.۶ گرادیان‌ها

توکن‌های رسمی (`tokens.css:189-192`) — به `:root` اضافه شوند:

```css
:root {
  --gd-gradient-brand: linear-gradient(135deg, #6a63f4, #7c3aed);
  --gd-gradient-text:  linear-gradient(100deg, #4739ca, #7c3aed 45%, #0aa0bb);
  --gd-gradient-gold:  linear-gradient(100deg, #f4a93c, #d98a1c);
  --gd-gradient-aurora: conic-gradient(from 210deg, #6a63f4, #8b5cf6, #2ee6fb, #ffc462, #6a63f4);
}
[data-theme="ink"] {
  --gd-gradient-text: linear-gradient(100deg, #a3a8ff, #c4b5fd 45%, #7df3ff);
  --gd-gradient-gold: linear-gradient(100deg, #ffd68a, #f4a93c);
}
```

متن گرادیانی (`.nx-gradient-text` — `components/text.css:18-30`):

```css
.gd-gradient-text {
  background: var(--gd-gradient-text);
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
}
```

### ۳.۷ سایه — سه دستور

1. **سطح بالاآمده:** `box-shadow: var(--gd-shadow-sm), inset 0 1px 0 var(--gd-highlight);` (الگوی `card.css:28`).
2. **دکمه‌ی پر:** `inset 0 1px 0 rgb(255 255 255 / 0.22), 0 1px 2px rgb(0 0 0 / 0.12), 0 6px 16px -6px color-mix(in oklab, var(--gd-primary) 70%, transparent);` (الگوی `button.css:97`) — سایه‌ی رنگی از خودِ رنگ دکمه.
3. **لحظه‌ی زنده/AI:** `var(--gd-glow-accent)` که بعد از نگاشت به `--nx-shadow-glow` می‌رسد.

---

## ۴) کلاس‌های آماده برای افزودن به `digiwp.css`

الگوها با توکن‌های `--gd-*` نوشته می‌شوند تا بعد از اعمال بخش ۱ خودکار با پالت nx رنگ بگیرند.

### ۴.۱ دکمه‌ها — ارتقای سه واریانت موجود به سبک nx (`button.css:92-126`)

```css
.gd-btn--primary {
  background: linear-gradient(180deg, color-mix(in oklab, var(--gd-primary) 86%, #fff), var(--gd-primary));
  border-color: color-mix(in oklab, var(--gd-primary) 70%, #000);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.22), 0 1px 2px rgb(0 0 0 / 0.12),
    0 6px 16px -6px color-mix(in oklab, var(--gd-primary) 70%, transparent);
}
.gd-btn--primary:hover {
  background: linear-gradient(180deg, color-mix(in oklab, var(--gd-primary-hover) 84%, #fff), var(--gd-primary-hover));
  translate: 0 -1px;                       /* button.css:167-169 */
}
.gd-btn--secondary {
  box-shadow: var(--gd-shadow-sm), inset 0 1px 0 var(--gd-highlight);
}
.gd-btn--danger {
  background: var(--gd-danger);
  border-color: transparent;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.18),
    0 6px 16px -6px color-mix(in oklab, var(--gd-danger) 70%, transparent);
}
```

توجه: این بلوک باید **بعد از** تعریف فعلی `.gd-btn--primary` بیاید (داخل `digiwp.css` است، پس ترتیب فایل کافی است). hover فعلی danger روی `var(--gd-red-700)` است؛ یک توکن `--gd-danger-hover` (روشن `#c02424` / تیره `#ef4444` — `--nx-danger-hover`) اضافه و استفاده شود.

### ۴.۲ بج وضعیت — الگوی border تُن‌محور (`data.css:718-746`)

```css
/* بج نرم nx همیشه یک خط ۲۸٪ از رنگ خودش دارد — data.css:729 */
.gd-badge--soft.gd-badge--primary { border-color: color-mix(in oklab, var(--gd-primary) 28%, transparent); }
.gd-badge--soft.gd-badge--success { border-color: color-mix(in oklab, var(--gd-success) 28%, transparent); }
.gd-badge--soft.gd-badge--warning { border-color: color-mix(in oklab, var(--gd-warning) 28%, transparent); }
.gd-badge--soft.gd-badge--danger  { border-color: color-mix(in oklab, var(--gd-danger) 28%, transparent); }
.gd-badge--soft.gd-badge--info    { border-color: color-mix(in oklab, var(--gd-info) 28%, transparent); }
/* نقطه‌ی تپنده فقط برای داده‌ی زنده‌ی واقعی — از gd-pulse موجود (digiwp.css:384) */
.gd-badge__dot--pulse { animation: gd-pulse 1.8s var(--gd-ease-out) infinite; }
```

### ۴.۳ هدر بخش

ترکیب eyebrow شیشه‌ای hero (`hero.css:44-56`) با تیتر display:

```css
.gd-sec-head { display: flex; flex-direction: column; gap: var(--gd-space-2); margin-block-end: var(--gd-space-5); }
.gd-sec-head__eyebrow {
  display: inline-flex; align-items: center; gap: var(--gd-space-2);
  justify-self: start; align-self: flex-start;
  padding-block: 0.3rem; padding-inline: 0.35rem 0.75rem;
  border: 1px solid var(--gd-border); border-radius: var(--gd-radius-full);
  background: var(--gd-glass);
  -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);
  box-shadow: var(--gd-shadow-xs);
  color: var(--gd-text-secondary);
  font: var(--gd-font-caption);
}
.gd-sec-head__title { font: var(--gd-weight-bold) var(--gd-text-xl)/1.35 var(--gd-font-display); }
```

### ۴.۴ لیست / جدول

الگوی `.nx-data-table` (`data.css:572-645`) — با ویژگی‌های منطقی برای RTL:

```css
.gd-table {
  background: var(--gd-bg-surface);
  border: 1px solid var(--gd-border);
  border-radius: var(--gd-radius-xl);
  box-shadow: var(--gd-shadow-sm), inset 0 1px 0 var(--gd-highlight);
  overflow: auto;
  overscroll-behavior-x: contain;
}
.gd-table table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: var(--gd-text-sm); }
.gd-table th, .gd-table td { padding: 0.75rem 1rem; text-align: start; vertical-align: middle; white-space: nowrap; }
.gd-table thead th {
  position: sticky; top: 0; z-index: 1;
  background: var(--gd-bg-surface); color: var(--gd-text-secondary);
  font-size: var(--gd-text-xs); font-weight: var(--gd-weight-semibold);
  border-block-end: 1px solid var(--gd-border);
}
.gd-table td { border-block-end: 1px solid var(--gd-border); color: var(--gd-text-secondary); }
.gd-table td:first-child { color: var(--gd-text); font-weight: var(--gd-weight-medium); }
.gd-table tbody tr:last-child td { border-block-end: 0; }
.gd-table tbody tr:hover { background: var(--gd-bg-hover); }   /* «ردیف فقط با رنگ جواب می‌دهد» */
.gd-table [data-numeric] { font-variant-numeric: tabular-nums; }
```

### ۴.۵ اسکلت لودینگ

الگوی `.nx-skeleton` (`feedback.css:388-399`) با توکن‌های اختصاصی به‌جای گرادیان سه‌نقطه‌ای فعلی `app.css:89-105` (نسخه‌ی `.dwp-skeleton` بماند تا سازگاری نشکند؛ `.gd-skeleton` الگوی مرجع جدید است):

```css
:root { --gd-skeleton: #ebe9e2; --gd-skeleton-shine: rgb(255 255 255 / 0.75); }
[data-theme="ink"] { --gd-skeleton: #191c2e; --gd-skeleton-shine: rgb(255 255 255 / 0.06); }

@keyframes gd-sheen { from { background-position: 200% 0; } to { background-position: -100% 0; } }
.gd-skeleton {
  display: block;
  block-size: 1rem;
  border-radius: var(--gd-radius-sm);
  background: linear-gradient(100deg, var(--gd-skeleton) 40%, var(--gd-skeleton-shine) 50%, var(--gd-skeleton) 60%)
    var(--gd-skeleton) 0 0 / 300% 100%;
  animation: gd-sheen 1.6s linear infinite;
}
.gd-skeleton--circle { border-radius: 50%; aspect-ratio: 1; inline-size: 2.5rem; block-size: auto; }
.gd-skeleton--rect   { border-radius: var(--gd-radius-lg); block-size: 8rem; }
@media (prefers-reduced-motion: reduce) { .gd-skeleton { animation-duration: 4s; } }
```

---

## ۵) هرگز تغییر نکن

1. **نقش‌های رنگ وضعیت.** سبز = سالم/موفق، کهربایی = هشدار/نیازمند تأیید، قرمز = بحرانی/مخرب، فیروزه‌ای = در حال بررسی، خاکستری = خاموش/ناموجود. مقدارشان فقط از طریق جدول بخش ۱ عوض می‌شود — هیچ کامپوننتی حق ندارد موردی هگز بنویسد یا نقش‌ها را جابه‌جا کند. سه‌گانه‌ی اختیار (`digiwp.css:162-166`: report خاکستری، confirm کهربایی، auto سبز) امضای محصول است و همین‌طور می‌ماند.
2. **حالت‌های صادق.** «اندازه‌گیری‌نشده / ناموجود / دگرگون» هرگز صفر سبز نمی‌شود؛ `gd-status--offline` همیشه خاکستری بی‌طرف می‌ماند (`digiwp.css:483-484`)؛ نقطه‌ی تپنده فقط برای داده‌ی زنده‌ی واقعی. تفکیک «checking» فیروزه‌ای از «healthy» سبز حفظ شود. قواعد محصول در `AGENTS.md` (بخش Product truth rules ۱ و ۲ و تفکیک measured/unmeasured/unavailable/healthy/degraded) بر هر انگیزه‌ی بصری مقدم است.
3. **RTL.** فقط ویژگی‌های منطقی (`inline-start/end`, `block-start/end`) در کلاس‌های جدید؛ آیکون‌های جهت‌دار mirror شوند (`base.css:67-69`)؛ `$` کلاس‌های شیشه‌ای نباید `left/right` فیزیکی introduce کنند.
4. **خوانایی فارسی.** Vazirmatn همیشه اولین فونت واقعی هر استک؛ letter-spacing روی فارسی = صفر (قاعده‌ی `digiwp.css:230-235` و `base.css:27-32` — «به اسکریپت متصل فاصله‌ی حروف نده»)؛ line-height بدنه 1.75 و تیتر نمایشی فارسی 1.3؛ `--gd-leading-relaxed` دست نمی‌خورد.
5. **فوکوس پدیدار.** `:focus-visible { outline: 2px solid var(--gd-focus-ring); outline-offset: 2px }` روی همه‌ی تعاملی‌ها — از جمله روی سطوح شیشه‌ای (`glass.css:166-169` همین الگو را دارد).
6. **حرکت کاهش‌یافته.** بلاک `prefers-reduced-motion` در `digiwp.css:397-403` می‌ماند؛ بلاب‌های aurora و شیشه‌ی تعاملی زیر آن غیرفعال شوند (الگوی `hero.css:267-269`).
