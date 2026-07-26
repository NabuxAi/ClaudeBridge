// ============================================================
// The speed recipe book.
//
// Every entry is a condition, a reason, and a fix. Nothing here fires on a
// hunch: a recipe only appears when the measurement it depends on came back
// and crossed its threshold, so a site never gets told to "install a cache
// plugin" because that is generic advice — it gets told which query ran
// eleven times and which plugin issued it.
//
// Three fields decide what the panel is allowed to do with a recipe:
//
//   `when`   reads the profile and returns null (not applicable) or the
//            evidence. Evidence, not a boolean — the panel shows the number
//            that triggered it, so the owner can disagree with us.
//   `risk`   'safe'    reversible, no visible change. May be offered as a
//                      one-click action.
//            'careful' reversible but changes behaviour someone may depend on.
//            'manual'  needs a decision or hosting access we do not have.
//   `action` the connector op, when one exists. Recipes with no action are
//            still worth showing — knowing the cause is most of the value —
//            but they must never render as a button.
//
// The ordering rule that matters: autoload first. It is the most common real
// slowdown on a WordPress site and the least diagnosed, because it taxes every
// single request — admin-ajax, REST, cron, and every page — rather than
// showing up on the one page someone happened to test.
// ============================================================

const KB = 1024
const MB = 1024 * KB

export const RECIPES = [
  {
    id: 'autoload-oversized',
    title: 'گزینه‌های autoload بیش از حد بزرگ‌اند',
    // Named in the "why" because this is the part people get wrong: it is not
    // one slow page, it is a tax on literally every request the site serves.
    why:
      'هر ردیف autoload در جدول options روی هر درخواست خوانده و unserialize می‌شود — نه فقط صفحات، بلکه admin-ajax، REST و کرون هم. ' +
      'یعنی این هزینه در هر بازدید، هر بار، پرداخت می‌شود.',
    risk: 'careful',
    when: (p) => {
      const a = p?.site?.autoload
      if (!a || typeof a.bytes !== 'number') return null
      if (a.bytes <= 512 * KB) return null
      return {
        bytes: a.bytes,
        count: a.count,
        severity: a.bytes > MB ? 'high' : 'medium',
        // The actionable half: which rows, and who owns them.
        offenders: (a.largest || []).filter((o) => o.bytes > 50 * KB).slice(0, 8),
      }
    },
    fix: (ev) => {
      const orphans = ev.offenders.filter((o) => !o.owner)
      const lines = [
        `مجموع ${human(ev.bytes)} در ${fa(ev.count)} ردیف autoload است.`,
        'بزرگ‌ترین‌ها را ببینید و برای هرکدام یکی از این سه کار را انجام دهید:',
        '۱) اگر مال افزونه‌ای است که دیگر نصب نیست، ردیف را حذف کنید.',
        '۲) اگر مال افزونهٔ فعالی است، معمولاً باید autoload آن را به no تغییر داد، نه حذف.',
        '۳) اگر کش است، بهتر است به transient یا آبجکت‌کش منتقل شود — این کار از خود افزونه برمی‌آید.',
      ]
      if (orphans.length) {
        lines.push(
          `${fa(orphans.length)} ردیف صاحب مشخصی ندارد؛ این‌ها معمولاً از افزونه‌های حذف‌شده باقی مانده‌اند و امن‌ترین مورد برای حذف‌اند.`
        )
      }
      return lines
    },
  },

  {
    id: 'autoload-orphans',
    title: 'ردیف‌های autoload بی‌صاحب',
    why:
      'افزونه‌ها هنگام حذف معمولاً گزینه‌هایشان را پاک نمی‌کنند. این ردیف‌ها تا ابد روی هر درخواست خوانده می‌شوند بدون اینکه هیچ کدی از آن‌ها استفاده کند.',
    risk: 'careful',
    when: (p) => {
      const large = (p?.site?.autoload?.largest || []).filter((o) => !o.owner && o.bytes > 20 * KB)
      if (!large.length) return null
      return { rows: large, bytes: large.reduce((a, o) => a + o.bytes, 0) }
    },
    fix: (ev) => [
      `${fa(ev.rows.length)} ردیف بزرگ بدون صاحب شناخته‌شده، مجموعاً ${human(ev.bytes)}.`,
      'پیش از حذف، از دیتابیس بکاپ بگیرید — همین ابزار این کار را می‌کند.',
      'اگر مطمئن نیستید ردیفی مال چیست، به‌جای حذف، autoload آن را به no تغییر دهید: اثر سرعتی یکی است و برگشت‌پذیر است.',
    ],
  },

  {
    id: 'no-object-cache',
    title: 'آبجکت‌کش خارجی ندارید',
    why:
      'بدون Redis یا Memcached، هر گزینه و هر نتیجهٔ کوئری که در حافظه کش می‌شود، در پایان همان درخواست از بین می‌رود و درخواست بعدی از صفر شروع می‌کند.',
    risk: 'manual',
    when: (p) => {
      const oc = p?.site?.object_cache
      if (!oc || oc.external) return null
      // Only worth raising when there is enough traffic-shaped work to benefit:
      // a small brochure site gains little and adds a moving part.
      const queries = p?.page?.queries || 0
      const plugins = p?.site?.plugins_active || 0
      if (queries < 80 && plugins < 20) return null
      return { queries, plugins }
    },
    fix: () => [
      'اگر هاست شما Redis دارد، افزونهٔ Redis Object Cache را نصب و فعال کنید.',
      'این کار نیازمند سرویس Redis روی هاست است — بدون آن، افزونه هیچ کاری نمی‌کند.',
      'روی هاست اشتراکی معمولاً در دسترس نیست؛ در آن صورت این مورد را نادیده بگیرید.',
    ],
  },

  {
    id: 'n-plus-one',
    title: 'یک کوئری بارها تکرار می‌شود',
    why:
      'وقتی یک شکل کوئری ده‌ها بار در یک صفحه اجرا می‌شود، تقریباً همیشه یعنی کدی داخل حلقه برای هر آیتم جداگانه به دیتابیس می‌زند. ' +
      'این همان الگویی است که صفحه را با رشد محتوا کندتر و کندتر می‌کند.',
    risk: 'manual',
    when: (p) => {
      const worst = (p?.page?.repeated || []).filter((r) => r.count >= 10)
      if (!worst.length) return null
      return { worst: worst.slice(0, 5) }
    },
    fix: (ev) => {
      const top = ev.worst[0]
      return [
        `شدیدترین مورد: ${fa(top.count)} بار اجرای یک شکل کوئری، مجموعاً ${fa(Math.round(top.ms))} میلی‌ثانیه.`,
        top.source ? `منبع: ${top.source}` : 'منبع قابل تشخیص نبود.',
        'این را خود افزونه یا قالب باید درست کند — معمولاً با یک کوئری گروهی به‌جای کوئری داخل حلقه.',
        'اگر افزونهٔ شخص ثالث است، نسخهٔ جدیدش را بررسی کنید یا موضوع را به سازنده گزارش دهید.',
      ]
    },
  },

  {
    id: 'heavy-plugin',
    title: 'یک افزونه بیشترین زمان دیتابیس را می‌گیرد',
    why: 'وقتی یک افزونه سهم غالب زمان کوئری‌های یک صفحه را دارد، جای درست شروع همان‌جاست، نه تنظیمات عمومی سرعت.',
    risk: 'manual',
    when: (p) => {
      const sources = p?.page?.by_source || []
      const total = p?.page?.query_ms || 0
      if (!sources.length || total < 100) return null
      const top = sources.find((s) => s.source.startsWith('plugin:'))
      if (!top) return null
      const share = top.ms / total
      if (share < 0.35) return null
      return { source: top.source, ms: top.ms, queries: top.queries, share: Math.round(share * 100) }
    },
    fix: (ev) => [
      `${ev.source} به‌تنهایی ${fa(ev.share)}٪ زمان کوئری این صفحه را می‌گیرد (${fa(ev.queries)} کوئری، ${fa(Math.round(ev.ms))} میلی‌ثانیه).`,
      'اول تنظیمات همان افزونه را ببینید: بسیاری از افزونه‌ها گزینه‌ای برای محدود کردن کارشان به صفحات لازم دارند.',
      'با «بررسی تداخل» می‌توانید ببینید بدون این افزونه صفحه چطور بارگذاری می‌شود.',
    ],
  },

  {
    id: 'slow-query',
    title: 'کوئری کند',
    why: 'یک کوئری که به‌تنهایی بیش از ۵۰ میلی‌ثانیه طول می‌کشد معمولاً ایندکس ندارد یا روی جدولی می‌گردد که خیلی بزرگ شده.',
    risk: 'manual',
    when: (p) => {
      const slow = p?.page?.slow || []
      if (!slow.length) return null
      return { slow: slow.slice(0, 5) }
    },
    fix: (ev) => [
      `کندترین: ${fa(Math.round(ev.slow[0].ms))} میلی‌ثانیه از ${ev.slow[0].source}.`,
      'اگر روی postmeta است، معمولاً meta_query بدون ایندکس مناسب است.',
      'پاک‌سازی متای یتیم و بازسازی جدول‌ها گاهی کافی است؛ در غیر این صورت باید کد صاحب کوئری اصلاح شود.',
    ],
  },

  {
    id: 'expired-transients',
    title: 'ترنزینت‌های منقضی جمع نشده‌اند',
    why:
      'بدون آبجکت‌کش خارجی، ترنزینت‌های منقضی در جدول options می‌مانند. جدول بزرگ‌تر یعنی خواندن autoload کندتر.',
    risk: 'safe',
    action: 'perf_clean_transients',
    when: (p) => {
      const t = p?.site?.transients
      if (!t || t.expired < 200) return null
      return { expired: t.expired, total: t.total }
    },
    fix: (ev) => [
      `${fa(ev.expired)} ترنزینت منقضی قابل حذف است.`,
      'حذفشان بی‌خطر است: منقضی شده‌اند، یعنی هیچ کدی دیگر به آن‌ها تکیه نمی‌کند و در صورت نیاز دوباره ساخته می‌شوند.',
    ],
  },

  {
    id: 'revision-bloat',
    title: 'انبوه نسخه‌های پیشین نوشته‌ها',
    why:
      'هر ویرایش یک ردیف در جدول posts می‌سازد. صدها هزار ردیف revision خود صفحات را کند نمی‌کند، ولی هر کوئری روی posts و هر بکاپ را سنگین می‌کند.',
    risk: 'careful',
    when: (p) => {
      const b = p?.site?.bloat
      if (!b || b.revisions < 5000) return null
      return { revisions: b.revisions, trash: b.trash_posts, spam: b.spam, orphanMeta: b.orphan_meta }
    },
    fix: (ev) => [
      `${fa(ev.revisions)} نسخهٔ پیشین ذخیره شده است.`,
      'برای جلوگیری از رشد دوباره، در wp-config.php مقدار WP_POST_REVISIONS را مثلاً روی ۵ بگذارید.',
      'حذف نسخه‌های قدیمی برگشت‌ناپذیر است — تاریخچهٔ ویرایش از بین می‌رود. پیش از آن بکاپ بگیرید.',
      ev.orphanMeta > 1000 ? `همچنین ${fa(ev.orphanMeta)} ردیف متای یتیم وجود دارد که به هیچ نوشته‌ای وصل نیست.` : null,
    ].filter(Boolean),
  },

  {
    id: 'cron-backlog',
    title: 'کارهای زمان‌بندی‌شده عقب افتاده‌اند',
    why:
      'وردپرس کرون را روی بازدید کاربران اجرا می‌کند. وقتی صف عقب می‌افتد، بازدیدکنندهٔ بعدی هزینهٔ آن کارها را می‌پردازد — و همان کسی است که صفحه برایش کند بالا می‌آید.',
    risk: 'manual',
    when: (p) => {
      const c = p?.site?.cron
      if (!c || c.overdue < 10) return null
      return { overdue: c.overdue, disabled: c.disabled }
    },
    fix: (ev) => [
      `${fa(ev.overdue)} کار بیش از یک ساعت است که اجرا نشده.`,
      ev.disabled
        ? 'DISABLE_WP_CRON روشن است؛ پس باید یک cron واقعی روی سرور تنظیم شده باشد. ظاهراً نشده یا کار نمی‌کند.'
        : 'بهترین کار: DISABLE_WP_CRON را روشن کنید و در هاست یک cron هر ۵ دقیقه روی wp-cron.php بگذارید.',
      'اینطور کار سنگین از دوش بازدیدکننده برداشته می‌شود.',
    ],
  },

  {
    id: 'old-php',
    title: 'نسخهٔ PHP قدیمی است',
    why: 'هر نسخهٔ اصلی PHP از ۷ به بعد سرعت اجرای همان کد را به‌طور محسوس بالا برده. این ارزان‌ترین بهبود ممکن است.',
    risk: 'manual',
    when: (p) => {
      const v = p?.site?.php?.version
      if (!v) return null
      const major = parseFloat(v)
      if (!(major < 8.1)) return null
      return { version: v }
    },
    fix: (ev) => [
      `سایت روی PHP ${ev.version} است.`,
      'ارتقا به ۸.۲ یا بالاتر از پنل هاست انجام می‌شود.',
      'پیش از ارتقا بکاپ بگیرید و بعد از آن صفحات اصلی را ببینید: افزونه‌های خیلی قدیمی ممکن است خطا بدهند.',
    ],
  },

  {
    id: 'no-opcache',
    title: 'OPcache خاموش است',
    why: 'بدون OPcache، PHP هر فایل را در هر درخواست دوباره کامپایل می‌کند. روشن کردنش هیچ تغییری در رفتار سایت نمی‌دهد.',
    risk: 'manual',
    when: (p) => (p?.site?.php && p.site.php.opcache === false ? { off: true } : null),
    fix: () => [
      'در تنظیمات PHP هاست، opcache.enable را روشن کنید.',
      'اگر دسترسی ندارید، از هاست بخواهید — این یک تنظیم استاندارد است و ریسکی ندارد.',
    ],
  },

  {
    id: 'page-served-from-cache',
    title: 'این صفحه اصلاً به PHP نرسید',
    why: 'یعنی یک لایهٔ کش صفحه را به‌صورت ایستا سرو کرده. برای بازدیدکننده این بهترین حالت ممکن است.',
    risk: 'safe',
    when: (p) => (p?.page_error && /کش/.test(p.page_error) ? { cached: true } : null),
    fix: () => [
      'چیزی برای اصلاح نیست.',
      'اگر می‌خواهید کوئری‌های واقعی این صفحه را ببینید، باید کش را موقتاً برای همان آدرس دور بزنید.',
    ],
  },
]

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'
const fa = (n) => String(n).replace(/\d/g, (d) => FA_DIGITS[d])

function human(bytes) {
  if (bytes >= MB) return `${fa((bytes / MB).toFixed(1))} مگابایت`
  return `${fa(Math.round(bytes / KB))} کیلوبایت`
}

/**
 * Match a profile against the book.
 *
 * Returns only what the measurements support, each with the evidence that
 * triggered it. Sorted by risk so the reversible things come first — the order
 * someone should actually work in.
 */
export function analyse(profile) {
  const order = { safe: 0, careful: 1, manual: 2 }
  const found = []

  for (const r of RECIPES) {
    let evidence
    try {
      evidence = r.when(profile)
    } catch {
      // A malformed profile must not take the whole analysis down; a recipe
      // that cannot read its input simply does not apply.
      continue
    }
    if (!evidence) continue
    found.push({
      id: r.id,
      title: r.title,
      why: r.why,
      risk: r.risk,
      action: r.action || null,
      evidence,
      steps: r.fix(evidence),
    })
  }

  found.sort((a, b) => order[a.risk] - order[b.risk])
  return {
    findings: found,
    // Stated so an empty result cannot be read as "your site is fast". It
    // means nothing crossed a threshold in what we measured.
    summary: found.length
      ? `${fa(found.length)} مورد قابل بهبود پیدا شد.`
      : 'هیچ‌کدام از موارد بررسی‌شده از حد عبور نکرد. این یعنی در آنچه اندازه گرفتیم مشکلی نبود، نه اینکه سایت لزوماً سریع است.',
    measured: {
      site: Boolean(profile?.site),
      page: Boolean(profile?.page),
      pageNote: profile?.page_error || null,
    },
  }
}
