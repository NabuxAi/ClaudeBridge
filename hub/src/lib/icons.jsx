// Icon — a thin wrapper over lucide-react. Uses a generated map of deep
// per-icon imports (src/lib/icon-map.js) so the bundle ships only the icons
// this app actually uses, not the whole set. Unknown names fall back to Circle.
//
// Directional icons were authored for the RTL layout, where "arrow-left"
// points forward. In an LTR language the left/right pair is swapped so
// "forward" and "back" keep their meaning without touching call sites.
import { ICONS, FALLBACK } from './icon-map.js'
import { getDir } from './i18n.js'

const MIRROR = { 'arrow-left': 'arrow-right', 'arrow-right': 'arrow-left', 'chevron-left': 'chevron-right', 'chevron-right': 'chevron-left' }

export default function Icon({ name, size = 18, strokeWidth = 2, className, style, ...rest }) {
  const resolved = getDir() === 'ltr' && MIRROR[name] ? MIRROR[name] : name
  const Cmp = ICONS[resolved] || FALLBACK
  return (
    <Cmp
      width={size}
      height={size}
      strokeWidth={strokeWidth}
      className={className}
      style={{ display: 'block', flex: '0 0 auto', ...style }}
      aria-hidden="true"
      {...rest}
    />
  )
}
