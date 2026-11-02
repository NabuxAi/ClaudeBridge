import { useEffect, useId, useRef, useState } from 'react'
import { AuthorityBadge } from './domain.jsx'
import Icon from '../lib/icons.jsx'
import { t } from '../lib/i18n.js'

export default function PanelAuthority({ level }) {
  const [open, setOpen] = useState(false)
  const root = useRef(null)
  const id = useId()
  useEffect(() => {
    if (!open) return
    const dismiss = (event) => { if (!root.current?.contains(event.target)) setOpen(false) }
    const escape = (event) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false) } }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape, true)
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape, true) }
  }, [open])
  const knownLevel = ['report', 'confirm', 'auto'].includes(level) ? level : 'unknown'
  return <div ref={root} className="panel-authority" onPointerEnter={(event) => { if (event.pointerType === 'mouse') setOpen(true) }} onPointerLeave={(event) => { if (event.pointerType === 'mouse' && !root.current?.contains(document.activeElement)) setOpen(false) }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
    <span>{t('shell.site.authorityMode')}</span>
    <button type="button" className="panel-authority__help" aria-label={t('shell.site.authorityHelp')} aria-expanded={open} aria-controls={id} aria-describedby={open ? id : undefined} onClick={() => setOpen((value) => !value)} onFocus={(event) => { if (event.target.matches(':focus-visible')) setOpen(true) }}><Icon name="info" size={18} /></button>
    {open && <div id={id} role="tooltip" className="panel-authority__tooltip"><AuthorityBadge level={level} size="sm" /><p>{t(`shell.site.authorityDescriptions.${knownLevel}`)}</p></div>}
  </div>
}
