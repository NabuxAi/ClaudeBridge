// Icon — a thin wrapper over lucide-react. Uses a generated map of deep
// per-icon imports (src/lib/icon-map.js) so the bundle ships only the icons
// this app actually uses, not the whole set. Unknown names fall back to Circle.
import { ICONS, FALLBACK } from './icon-map.js'

export default function Icon({ name, size = 18, strokeWidth = 2, className, style, ...rest }) {
  const Cmp = ICONS[name] || FALLBACK
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
