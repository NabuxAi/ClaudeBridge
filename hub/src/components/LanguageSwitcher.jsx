import { LANGS } from '../lib/i18n.js'
import { t } from '../lib/i18n.js'
import { useI18n } from '../lib/I18nProvider.jsx'
import Icon from '../lib/icons.jsx'

/** Compact language picker — a native <select>, so it is keyboard- and screen-reader-friendly. */
export default function LanguageSwitcher({ className = '' }) {
  const { lang, setLang } = useI18n()
  return (
    <label className={['dwp-lang', className].filter(Boolean).join(' ')} title={t('common.language')}>
      <Icon name="languages" size={15} />
      <span className="dwp-sr-only">{t('common.language')}</span>
      <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label={t('common.language')}>
        {LANGS.map((l) => <option key={l.code} value={l.code} lang={l.code}>{l.name}</option>)}
      </select>
    </label>
  )
}
