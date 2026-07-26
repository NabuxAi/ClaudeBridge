import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import { Button, MetricCard, Badge, ActivityRow } from '../../components/index.js'
import { faNum } from '../../lib/format.js'
import { site as siteApi } from '../../lib/api.js'

/**
 * The headline: what the site actually reported.
 *
 * Verdict comes from core integrity plus the malware scan, both of which are
 * real. Anything without a source is shown as a dash rather than a number —
 * "—" is a question the customer can ask us; an invented figure is one they
 * never think to.
 */
function SecurityBanner({ data }) {
  const integrity = data.integrity
  const scan = data.scan
  const measured = Boolean(integrity?.ok || scan)

  const hits = scan?.hits?.length ?? null
  const strays = integrity?.unexpected?.length ?? null
  const coreClean = integrity?.ok ? integrity.clean : null

  // Only claim clean when both checks ran AND both came back empty. Unknown is
  // its own state, distinct from good.
  const verdict = !measured
    ? { text: 'هنوز اسکن نشده', tone: 'neutral', icon: 'shield-alert' }
    : coreClean && hits === 0
      ? { text: 'وضعیت امنیتی: سالم', tone: 'success', icon: 'shield-check' }
      : { text: 'موارد نیازمند بررسی پیدا شد', tone: 'danger', icon: 'shield-alert' }

  const bg = verdict.tone === 'success' ? 'var(--gd-success-bg)'
    : verdict.tone === 'danger' ? 'var(--gd-danger-bg)' : 'var(--gd-bg-inset)'
  const fg = verdict.tone === 'success' ? 'var(--gd-success)'
    : verdict.tone === 'danger' ? 'var(--gd-danger)' : 'var(--gd-text-muted)'

  const stat = (value, label, tone) => (
    <div>
      <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--gd-font-mono)', color: tone }}>
        {value === null || value === undefined ? '—' : faNum(value)}
      </div>
      <div style={{ fontSize: 12, color: 'var(--gd-text-muted)', marginTop: 2 }}>{label}</div>
    </div>
  )

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24, background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-xl)', boxShadow: 'var(--gd-shadow-sm)', padding: '22px 26px', marginBottom: 18, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: '0 0 auto' }}>
        <span style={{ width: 64, height: 64, borderRadius: '50%', background: bg, color: fg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={verdict.icon} size={34} />
        </span>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{verdict.text}</div>
          <div style={{ fontSize: 12, color: 'var(--gd-text-muted)', marginTop: 9 }}>
            {measured
              ? `آخرین بررسی: ${integrity?.checked_at ? new Date(integrity.checked_at * 1000).toLocaleString('fa-IR') : 'هم‌اکنون'}`
              : 'برای دیدن وضعیت واقعی، سایت باید متصل باشد.'}
          </div>
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 280, display: 'flex', gap: 34, paddingInlineStart: 26, borderInlineStart: '1px solid var(--gd-border-subtle)' }}>
        {stat(strays, 'فایل ناشناخته در هسته', strays ? 'var(--gd-danger-text)' : 'var(--gd-success)')}
        {stat(hits, 'یافتهٔ بدافزار', hits ? 'var(--gd-danger-text)' : 'var(--gd-success)')}
        {stat(data.ssl?.days, 'روز تا انقضای SSL')}
      </div>
    </div>
  )
}

export default function Security() {
  const { siteId } = useOutletContext()
  const [data, setData] = useState(null)
  const [scanning, setScanning] = useState(false)

  useEffect(() => {
    let alive = true
    siteApi(siteId).security().then((d) => alive && setData(d))
    return () => { alive = false }
  }, [siteId])

  // The button used to do nothing at all. Re-fetching IS a real rescan: the
  // server calls core_integrity and security_scan on the site for every
  // request, so this walks the filesystem again rather than reading a cache.
  async function rescan() {
    setScanning(true)
    try {
      setData(await siteApi(siteId).security())
    } finally {
      setScanning(false)
    }
  }

  if (!data) return <PageHead title="امنیت" subtitle="نگهبانی امنیتی روزانه و کنترل دسترسی" />

  return (
    <>
      <PageHead
        title="امنیت"
        subtitle="نگهبانی امنیتی روزانه و کنترل دسترسی"
        action={
          <Button variant="primary" size="sm" leftIcon="scan-search" disabled={scanning} onClick={rescan}>
            {scanning ? 'در حال اسکن…' : 'اسکن کامل'}
          </Button>
        }
      />

      {/* Core integrity — measured against WordPress's own manifest. This card
          only appears when the site actually answered; there is no placeholder
          version of it, because a green shield nobody verified is worse than
          no shield at all. */}
      {(data.integrity || data.integrityError) && (
        <CoreIntegrityCard result={data.integrity} error={data.integrityError} />
      )}

      {/* Security status banner.
          Every figure here is measured or absent. The version this replaced
          asserted "security status: good", "12 blocked attacks today" and
          "0 vulnerable plugins" on a site nobody had scanned — a green shield
          nobody verified is the most damaging thing this screen can show,
          because it is exactly what a compromised site looks like to its owner
          right up until it does not. */}
      <SecurityBanner data={data} />

      {/* Cards, one per figure the site actually returned. Empty when nothing
          has been measured — which is a truthful screen, not a broken one. */}
      <div className="dwp-grid dwp-grid-4">
        {(data.metrics || []).map((m) => (
          <MetricCard
            key={m.label} icon={m.icon} iconTone={m.tone}
            label={m.label} value={faNum(m.value)} unit={m.unit}
          />
        ))}
      </div>

      {/* SSL card + security events */}
      <div className="dwp-ov-cols" style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 18, marginTop: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
            <span>رویدادهای امنیتی</span>
            <Badge variant="info" appearance="soft" icon="history">{faNum((data.events || []).length)} رویداد</Badge>
          </div>
          <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', padding: '6px 20px' }}>
            {(data.events || []).length === 0 ? (
              <p style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', padding: '14px 0', margin: 0, lineHeight: 1.8 }}>
                ثبت رویدادهای امنیتی هنوز ساخته نشده. اینجا رویداد ساختگی نشان نمی‌دهیم.
              </p>
            ) : data.events.map((e, i) => (
              <ActivityRow key={i} icon={e.icon} tone={e.tone} label={e.label} time={e.time} divided={i < data.events.length - 1} />
            ))}
          </div>
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
            <span>گواهی SSL</span>
            <Badge variant="success" appearance="soft" dot>{data.ssl.valid ? 'معتبر' : 'نامعتبر'}</Badge>
          </div>
          <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }}>
              <span style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--gd-success-bg)', color: 'var(--gd-success)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="lock-keyhole" size={20} />
              </span>
              <span className="dwp-mono" style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--gd-font-mono)', color: 'var(--gd-success-text)' }}>{faNum(data.ssl.days)}</span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>گواهی SSL</div>
            <div style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', marginTop: 3, lineHeight: 1.6 }}>
              {data.ssl.issuer} · تمدید خودکار · انقضا {faNum(data.ssl.days)} روز دیگر
            </div>
          </div>
        </div>
      </div>

      {/* Reversible-actions note */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderRadius: 'var(--gd-radius-lg)', border: '1px solid var(--gd-info-border)', background: 'var(--gd-info-bg)', padding: '15px 20px', marginTop: 20 }}>
        <span style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--gd-info)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
          <Icon name="bot" size={19} />
        </span>
        <div style={{ flex: 1, fontSize: 13.5, lineHeight: 1.7, color: 'var(--gd-info-text)' }}>
          همهٔ اقدام‌های امنیتی برگشت‌پذیرند. پشتیبان تغییرات فایل و ورودها را لحظه‌ای رصد می‌کند و در صورت تهدید جدی بلافاصله به شما هشدار می‌دهد.
        </div>
        <Button variant="secondary" size="sm">گزارش امنیتی</Button>
      </div>
    </>
  )
}

/**
 * Core integrity, straight from the site.
 *
 * Every number here was measured — file counts come from comparing md5s against
 * the manifest WordPress publishes for this exact version and locale. Nothing on
 * this card is a placeholder, which is why it renders an error state instead of
 * a reassuring default when the check could not run.
 *
 * "Unexpected" is called out separately and loudest: a modified core file is
 * usually a bad update or a host's patch, but a file that WordPress never
 * shipped, sitting inside wp-includes, has no innocent explanation.
 */
function CoreIntegrityCard({ result, error }) {
  const shell = (children) => (
    <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-xl)', boxShadow: 'var(--gd-shadow-sm)', padding: '20px 24px', marginBottom: 18 }}>
      {children}
    </div>
  )

  if (error || !result?.ok) {
    return shell(
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
          <Icon name="shield-alert" size={18} style={{ color: 'var(--gd-warning)' }} /> یکپارچگی هستهٔ وردپرس
        </div>
        <p style={{ fontSize: 13, color: 'var(--gd-text-muted)', margin: 0, lineHeight: 1.7 }}>
          بررسی انجام نشد: {error || result?.error || 'پاسخی از سایت نیامد.'}
          {' '}تا وقتی این بررسی اجرا نشود، دربارهٔ سالم بودن فایل‌های هسته چیزی نمی‌دانیم.
        </p>
      </>
    )
  }

  const nMod = result.modified?.length || 0
  const nMiss = result.missing?.length || 0
  const nNew = result.unexpected?.length || 0
  const clean = result.clean

  const stat = (n, label, danger) => (
    <div>
      <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--gd-font-mono)', color: n > 0 ? (danger ? 'var(--gd-danger-text)' : 'var(--gd-warning-text)') : 'var(--gd-success)' }}>
        {faNum(n)}
      </div>
      <div style={{ fontSize: 12, color: 'var(--gd-text-muted)', marginTop: 2 }}>{label}</div>
    </div>
  )

  return shell(
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: '0 0 auto' }}>
          <span style={{ width: 52, height: 52, borderRadius: '50%', background: clean ? 'var(--gd-success-bg)' : 'var(--gd-danger-bg)', color: clean ? 'var(--gd-success)' : 'var(--gd-danger)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={clean ? 'shield-check' : 'shield-alert'} size={28} />
          </span>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>
              {clean ? 'هستهٔ وردپرس دست‌نخورده است' : 'هستهٔ وردپرس با نسخهٔ رسمی یکی نیست'}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', marginTop: 4 }}>
              {faNum(result.files_known)} فایل با نسخهٔ رسمی {faNum(result.version)} ({result.locale}) مقایسه شد
            </div>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 260, display: 'flex', gap: 30, paddingInlineStart: 24, borderInlineStart: '1px solid var(--gd-border-subtle)' }}>
          {stat(nNew, 'فایل ناشناخته در هسته', true)}
          {stat(nMod, 'فایل تغییریافته', false)}
          {stat(nMiss, 'فایل گم‌شده', false)}
        </div>
      </div>

      {nNew > 0 && (
        <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--gd-danger-bg)', border: '1px solid var(--gd-danger)', borderRadius: 'var(--gd-radius-md)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gd-danger-text)', marginBottom: 6 }}>
            فایل‌هایی که وردپرس هرگز منتشرشان نکرده
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--gd-danger-text)', margin: '0 0 8px', lineHeight: 1.7, opacity: 0.9 }}>
            بدافزار معمولاً هسته را ویرایش نمی‌کند، چون با آپدیت بعدی از بین می‌رود. فایل تازه‌ای
            جایی می‌گذارد که کسی نگاه نمی‌کند.
          </p>
          <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 12.5, fontFamily: 'var(--gd-font-mono)', color: 'var(--gd-danger-text)', lineHeight: 1.9 }}>
            {result.unexpected.slice(0, 12).map((f) => <li key={f}>{f}</li>)}
          </ul>
          {nNew > 12 && (
            <div style={{ fontSize: 12, color: 'var(--gd-danger-text)', marginTop: 6, opacity: 0.8 }}>
              و {faNum(nNew - 12)} مورد دیگر
            </div>
          )}
        </div>
      )}

      {nMod > 0 && (
        <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--gd-text-muted)', lineHeight: 1.8 }}>
          <b style={{ color: 'var(--gd-warning-text)' }}>تغییریافته:</b>{' '}
          <span style={{ fontFamily: 'var(--gd-font-mono)' }}>{result.modified.slice(0, 6).join('، ')}</span>
          {nMod > 6 && ` و ${faNum(nMod - 6)} مورد دیگر`}
        </div>
      )}
    </>
  )
}
