import { useCallback, useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import { Button, MetricCard, Badge, ActivityRow, NotMeasured, SkeletonStats, SkeletonCard } from '../../components/index.js'
import { faNum } from '../../lib/format.js'
import { site as siteApi } from '../../lib/api.js'
import { useTask } from '../../lib/tasks.jsx'

/**
 * The headline: what the site actually reported.
 *
 * Verdict comes from core integrity plus the malware scan, both of which are
 * real. Anything without a source is shown as a dash rather than a number —
 * "—" is a question the customer can ask us; an invented figure is one they
 * never think to.
 */
function SecurityBanner({ data, ssl, sslTone }) {
  const integrity = data.integrity
  const scan = data.scan
  const measured = Boolean(integrity?.ok || scan)

  const hits = scan?.hits?.length ?? null
  const strays = integrity?.unexpected?.length ?? null
  const coreClean = integrity?.ok ? integrity.clean : null

  // A finding in either check is danger. "Clean" requires BOTH checks to have
  // run AND both to have come back empty. Everything else — never scanned,
  // scan still running, one check failed — is unknown, and unknown is its own
  // state, distinct from good and from danger. The old expression collapsed
  // every unknown into the red branch, so a fresh site with a clean integrity
  // read as "موارد نیازمند بررسی پیدا شد".
  const danger = coreClean === false || (hits != null && hits > 0)
  const clean = coreClean === true && hits === 0

  let verdict
  if (danger) {
    verdict = { text: 'موارد نیازمند بررسی پیدا شد', tone: 'danger', icon: 'shield-alert' }
  } else if (clean) {
    verdict = { text: 'وضعیت امنیتی: سالم', tone: 'success', icon: 'shield-check' }
  } else if (measured) {
    const missing = [coreClean == null && 'یکپارچگی هسته', hits == null && 'اسکن بدافزار'].filter(Boolean)
    verdict = {
      text: 'بررسی ناتمام است',
      tone: 'neutral',
      icon: 'shield-alert',
      note: data.scanJob
        ? 'اسکن در جریان است؛ تا پایان آن این نتیجه قطعی نیست.'
        : `${missing.join(' و ')} هنوز اندازه‌گیری نشده؛ این نتیجه قطعی نیست.`,
    }
  } else {
    verdict = { text: 'هنوز اسکن نشده', tone: 'neutral', icon: 'shield-alert', note: 'برای دیدن وضعیت واقعی، سایت باید متصل باشد.' }
  }

  // Same tone classes as the Overview health banner: success/danger/neutral.
  const icVariant = verdict.tone === 'success' ? 'ok' : verdict.tone === 'danger' ? 'down' : 'unknown'

  // Unknown (null) renders a muted dash, never the green of a measured zero —
  // gray is the colour of "not measured" (mapping §5.2), green only answers
  // for a zero the site actually reported.
  const stat = (value, label, tone) => (
    <div>
      <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--gd-font-mono)', color: value == null ? 'var(--gd-text-muted)' : tone }}>
        {value == null ? '—' : faNum(value)}
      </div>
      <div style={{ fontSize: 12, color: 'var(--gd-text-muted)', marginTop: 2 }}>{label}</div>
    </div>
  )

  return (
    <div className="psa-banner">
      <div className="psa-banner__main">
        <span className={`psa-banner__ic psa-banner__ic--${icVariant}`}>
          <Icon name={verdict.icon} size={34} />
        </span>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{verdict.text}</div>
          <div style={{ fontSize: 12, color: 'var(--gd-text-muted)', marginTop: 9 }}>
            {verdict.note || (integrity?.checked_at
              ? `آخرین بررسی: ${new Date(integrity.checked_at * 1000).toLocaleString('fa-IR')}`
              : 'آخرین بررسی: هم‌اکنون')}
          </div>
        </div>
      </div>
      <div className="psa-banner__stats">
        {stat(strays, 'فایل ناشناخته در هسته', strays ? 'var(--gd-danger-text)' : 'var(--gd-success)')}
        {stat(hits, 'یافتهٔ بدافزار', hits ? 'var(--gd-danger-text)' : 'var(--gd-success)')}
        {stat(ssl?.days ?? null, 'روز تا انقضای SSL', sslTone)}
      </div>
    </div>
  )
}

export default function Security() {
  const { siteId } = useOutletContext()
  const { startTask, activeTask } = useTask()
  const [data, setData] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [loadError, setLoadError] = useState('')
  const aliveRef = useRef(true)
  const timer = useRef(null)

  const fetchSecurity = useCallback(() => {
    setLoadError('')
    return siteApi(siteId)
      .security()
      .then((d) => { if (aliveRef.current) setData(d) })
      .catch((e) => { if (aliveRef.current) setLoadError(e?.message || 'دریافت وضعیت امنیتی ممکن نشد.') })
  }, [siteId])

  useEffect(() => {
    aliveRef.current = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSecurity()
    return () => { aliveRef.current = false; clearTimeout(timer.current) }
  }, [fetchSecurity])

  async function rescan() {
    setScanning(true)
    try {
      const res = await siteApi(siteId).startScan()
      const started = res?.job || res
      if (started?.id) {
        startTask({
          id: started.id,
          title: 'اسکن کامل بدافزار و فایل‌های هسته',
          type: 'security',
        })
      }
      poll()
    } catch (e) {
      // A failed start used to refresh unguarded and could leave the button
      // spinning forever; now the failure surfaces and the button frees up.
      if (aliveRef.current) {
        setScanning(false)
        setLoadError(e?.message || 'شروع اسکن ممکن نشد.')
      }
    }
  }

  function poll() {
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        const d = await siteApi(siteId).security()
        if (!aliveRef.current) return
        setData(d)
        if (d.scanJob) poll()
        else setScanning(false)
      } catch (e) {
        // One dropped request used to kill the polling chain and leave the
        // scan button disabled forever with no message. Stop, say so, retry.
        if (!aliveRef.current) return
        setScanning(false)
        setLoadError(e?.message || 'دریافت نتیجهٔ اسکن ممکن نشد؛ دوباره تلاش کنید.')
      }
    }, 3000)
  }

  const isRunning = scanning || activeTask?.state === 'running'

  const head = (
    <PageHead
      title="امنیت"
      subtitle="نگهبانی امنیتی روزانه و کنترل دسترسی"
      action={
        <Button
          variant="primary"
          size="sm"
          leftIcon="scan-search"
          disabled={isRunning}
          onClick={rescan}
        >
          {isRunning ? 'در حال اسکن…' : 'اسکن کامل'}
        </Button>
      }
    />
  )

  if (!data) {
    if (loadError) {
      return (
        <>
          {head}
          <NotMeasured title="وضعیت امنیتی خوانده نشد" reason={loadError} icon="alert-triangle" />
          <div style={{ textAlign: 'center', marginTop: 14 }}>
            <Button variant="secondary" size="sm" leftIcon="refresh-cw" onClick={() => fetchSecurity()}>
              تلاش دوباره
            </Button>
          </div>
        </>
      )
    }
    return (
      <>
        {head}
        <SkeletonCard height={110} />
        <div style={{ marginTop: 18 }}>
          <SkeletonStats count={4} />
        </div>
      </>
    )
  }

  // The certificate block. The server sends no validity flag — what it sends
  // is the result of a real, chain-verified TLS handshake. A certificate we
  // could read is currently valid; one we could not read is unknown, and the
  // old `data.ssl.valid` read crashed the whole page on unpaired sites.
  const ssl = data.ssl || null
  const sslTone = !ssl ? 'var(--gd-text-muted)'
    : ssl.days < 14 ? 'var(--gd-danger-text)'
      : ssl.days < 30 ? 'var(--gd-warning-text)'
        : 'var(--gd-success-text)'

  return (
    <>
      {head}

      {loadError && (
        <div className="psa-err" role="alert">
          <Icon name="alert-triangle" size={17} style={{ flex: '0 0 auto', marginTop: 2 }} />
          <div style={{ flex: 1 }}>{loadError}</div>
          <Button variant="ghost" size="sm" onClick={() => fetchSecurity()}>تلاش دوباره</Button>
        </div>
      )}

      {/* Core integrity — measured against WordPress's own manifest. This card
          only appears when the site actually answered; there is no placeholder
          version of it, because a green shield nobody verified is worse than
          no shield at all. */}
      {(data.integrity || data.integrityError) && (
        <CoreIntegrityCard result={data.integrity} error={data.integrityError} />
      )}

      {/* Known vulnerabilities in what is installed here, matched against our
          own CVE database. Same rule as the card above: it appears only when
          the site answered. */}
      {(data.vulns || data.vulnsError) && (
        <VulnCard result={data.vulns} error={data.vulnsError} />
      )}

      {/* The scan's own state. An empty result and a scan that has never run
          look identical otherwise, and one of those reads as a clean bill of
          health when it is nothing of the sort. */}
      {(data.scanJob || data.scanPending) && (
        <div className="psa-card" style={{ padding: '15px 20px', marginBottom: 18 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 5 }}>
            {data.scanJob ? 'اسکن بدافزار در حال اجراست' : 'هنوز اسکن بدافزاری اجرا نشده'}
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', margin: 0, lineHeight: 1.9 }}>
            {data.scanJob
              ? `${data.scanJob.message || 'در حال بررسی فایل‌ها'} — ${faNum(data.scanJob.progress || 0)}٪`
              : 'برای شروع، «اسکن کامل» را بزنید. تا وقتی اجرا نشده، نبود یافته به معنی سالم بودن نیست.'}
          </p>
        </div>
      )}

      {/* Security status banner.
          Every figure here is measured or absent. The version this replaced
          asserted "security status: good", "12 blocked attacks today" and
          "0 vulnerable plugins" on a site nobody had scanned — a green shield
          nobody verified is the most damaging thing this screen can show,
          because it is exactly what a compromised site looks like to its owner
          right up until it does not. */}
      <SecurityBanner data={data} ssl={ssl} sslTone={sslTone} />

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
      <div className="psa-cols">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
            <span>رویدادهای امنیتی</span>
            <Badge variant="info" appearance="soft" icon="history">{faNum((data.events || []).length)} رویداد</Badge>
          </div>
          <div className="psa-card psa-card--list">
            {(data.events || []).length === 0 ? (
              <p style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', padding: '14px 0', margin: 0, lineHeight: 1.8 }}>
هنوز رویداد امنیتی‌ای ثبت نشده. سایت هنگام اسکن یا اقدام دیده می‌شود، نه به‌صورت پیوسته.
              </p>
            ) : data.events.map((e, i) => (
              <ActivityRow key={i} icon={e.icon} tone={e.tone} label={e.label} time={e.time} divided={i < data.events.length - 1} />
            ))}
          </div>
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
            <span>گواهی SSL</span>
            {/* The server never sends `valid` — the badge read "نامعتبر" on
                every real certificate. Readable ⇒ the verified handshake
                succeeded; unreadable ⇒ unknown, in neutral gray. */}
            <Badge variant={ssl ? 'success' : 'neutral'} appearance="soft" dot>{ssl ? 'معتبر' : 'بررسی نشد'}</Badge>
          </div>
          <div className="psa-card psa-card--pad">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }}>
              <span style={{ width: 38, height: 38, borderRadius: 10, background: ssl ? 'var(--gd-success-bg)' : 'var(--gd-bg-inset)', color: ssl ? 'var(--gd-success)' : 'var(--gd-text-muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="lock-keyhole" size={20} />
              </span>
              <span className="dwp-mono" style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--gd-font-mono)', color: sslTone }}>
                {ssl ? faNum(ssl.days) : '—'}
              </span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>گواهی SSL</div>
            <div style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', marginTop: 3, lineHeight: 1.6 }}>
              {/* "تمدید خودکار" was asserted here. Whether a certificate
                  auto-renews is a property of the host's ACME setup, which we
                  cannot see — we only read the expiry from the handshake. */}
              {ssl
                ? `${ssl.issuer || 'صادرکنندهٔ نامشخص'} · انقضا ${faNum(ssl.days)} روز دیگر`
                : (data.sslError || 'گواهی خوانده نشد.')}
            </div>
          </div>
        </div>
      </div>

      {/* Reversible-actions note */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderRadius: 'var(--gd-radius-lg)', border: '1px solid var(--gd-info-border)', background: 'var(--gd-info-bg)', padding: '15px 20px', marginTop: 20 }}>
        <span style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--gd-info)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
          <Icon name="bot" size={19} />
        </span>
        {/* Was: "the guardian watches file changes and logins in real time and
            alerts you immediately". It does neither — scanning happens on this
            page and once a night, and nothing observes logins at all. The
            button beside it ("security report") had no handler. */}
        <div style={{ flex: 1, fontSize: 13.5, lineHeight: 1.7, color: 'var(--gd-info-text)' }}>
          اسکن هنگام باز کردن این صفحه و یک بار در شبانه‌روز انجام می‌شود — رصد لحظه‌ای نیست.
          یافته‌ها در «هشدارها» ثبت می‌شوند و تا وقتی اسکن بعدی نبودنشان را تأیید نکند، باز می‌مانند.
        </div>
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
function VulnCard({ result, error }) {
  if (error) {
    return (
      <div className="psa-card" style={{ padding: '16px 20px', marginBottom: 18 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 5 }}>آسیب‌پذیری‌های شناخته‌شده</div>
        <p style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', margin: 0, lineHeight: 1.9 }}>
          فهرست افزونه‌ها و قالب‌ها خوانده نشد: {error}
        </p>
      </div>
    )
  }
  if (!result) return null

  const hits = result.vulnerable || []
  const unsure = result.unknownVersion || []

  return (
    <div className="psa-card" style={{ border: hits.length ? '1px solid var(--gd-danger)' : undefined, padding: '18px 20px', marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
        <Icon name={hits.length ? 'shield-alert' : 'shield-check'} size={18} style={{ color: hits.length ? 'var(--gd-danger)' : 'var(--gd-success)' }} />
        <span style={{ fontSize: 14.5, fontWeight: 800 }}>
          {hits.length
            ? `${faNum(hits.length)} آسیب‌پذیری شناخته‌شده`
            : 'آسیب‌پذیری شناخته‌شده‌ای پیدا نشد'}
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--gd-text-muted)' }}>
          از {faNum(result.checked)} افزونه و قالب
        </span>
      </div>

      {hits.map((v) => (
        <div key={`${v.cve}-${v.slug}`} style={{ padding: '11px 0', borderTop: '1px solid var(--gd-border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700 }}>{v.name}</span>
            <Badge variant={v.severity === 'critical' ? 'danger' : v.severity === 'high' ? 'danger' : 'warning'} appearance="soft">
              {v.severity || 'نامشخص'}{v.cvss ? ` · ${faNum(v.cvss)}` : ''}
            </Badge>
            {/* Stated, because it is the most common misunderstanding: an
                inactive plugin with a known hole is still a file on disk that
                can be requested directly. */}
            {!v.active && <Badge variant="neutral" appearance="soft">غیرفعال، ولی روی دیسک</Badge>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--gd-text-muted)', lineHeight: 1.9 }}>
            <span style={{ fontFamily: 'var(--gd-font-mono)' }}>{v.cve}</span>
            {' · '}نصب‌شده <span style={{ fontFamily: 'var(--gd-font-mono)' }}>{v.installed}</span>
            {v.fixedIn && <> · اصلاح در <span style={{ fontFamily: 'var(--gd-font-mono)' }}>{v.fixedIn}</span></>}
          </div>
          {v.summary && (
            <p style={{ fontSize: 12, color: 'var(--gd-text-secondary)', margin: '5px 0 0', lineHeight: 1.8 }}>{v.summary}</p>
          )}
          <p style={{ fontSize: 12, color: 'var(--gd-text)', margin: '5px 0 0', fontWeight: 600 }}>{v.advice}</p>
        </div>
      ))}

      {/* The third category. Neither a hit nor a clean bill — the advisory
          never named a fixed version, so no comparison is possible. */}
      {unsure.length > 0 && (
        <details style={{ marginTop: 10, borderTop: '1px solid var(--gd-border-subtle)', paddingTop: 10 }}>
          <summary style={{ fontSize: 12.5, cursor: 'pointer', color: 'var(--gd-text-secondary)' }}>
            {faNum(unsure.length)} مورد که قابل مقایسه نبود
          </summary>
          <ul style={{ margin: '8px 0 0', paddingInlineStart: 18, fontSize: 12, color: 'var(--gd-text-muted)', lineHeight: 1.9 }}>
            {unsure.slice(0, 12).map((v, i) => (
              <li key={i}><span style={{ fontFamily: 'var(--gd-font-mono)' }}>{v.cve}</span> — {v.name}: {v.why}</li>
            ))}
          </ul>
        </details>
      )}

      <p style={{ fontSize: 11.5, color: 'var(--gd-text-muted)', margin: '12px 0 0', lineHeight: 1.9 }}>{result.note}</p>
    </div>
  )
}

function CoreIntegrityCard({ result, error }) {
  const shell = (children) => (
    <div className="psa-card" style={{ padding: '20px 24px', marginBottom: 18 }}>
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
