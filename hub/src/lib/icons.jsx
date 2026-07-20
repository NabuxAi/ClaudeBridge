// Icon — a thin wrapper over lucide-react so components can take a
// kebab-case icon name (matching the design system's <Icon name="…"/>).
import * as Lucide from 'lucide-react'

const pascal = (n) =>
  String(n || '')
    .split(/[-_]/)
    .map((s) => (s ? s[0].toUpperCase() + s.slice(1) : s))
    .join('')

export default function Icon({ name, size = 18, strokeWidth = 2, className, style, ...rest }) {
  const Cmp = Lucide[pascal(name)] || Lucide.Circle
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
