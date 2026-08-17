export function Skeleton({
  variant = 'text',
  width,
  height,
  borderRadius,
  className = '',
  style = {},
  count = 1,
}) {
  const customStyle = {
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
    ...(borderRadius ? { borderRadius } : {}),
    ...style,
  }

  const cls = `dwp-skeleton dwp-skeleton--${variant} ${className}`.trim()

  if (count > 1) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Array.from({ length: count }).map((_, i) => (
          <span key={i} className={cls} style={customStyle} />
        ))}
      </div>
    )
  }

  return <span className={cls} style={customStyle} />
}

export function SkeletonCard({ height = 120, className = '' }) {
  return <Skeleton variant="card" height={height} className={className} />
}

export function SkeletonTable({ rows = 4, cols = 4 }) {
  return (
    <div style={{
      background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)',
      borderRadius: 'var(--gd-radius-lg)', overflow: 'hidden', padding: '16px',
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12 }}>
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} height={18} width="70%" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12, borderTop: '1px solid var(--gd-border-subtle)', paddingTop: 12 }}>
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} height={16} width={c === 0 ? '90%' : '60%'} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SkeletonStats({ count = 3 }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${count}, 1fr)`, gap: 14, marginBottom: 20 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)',
          borderRadius: 'var(--gd-radius-lg)', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 13,
        }}>
          <Skeleton variant="avatar" width={40} height={40} borderRadius={11} />
          <div style={{ flex: 1 }}>
            <Skeleton height={24} width="40%" style={{ marginBottom: 6 }} />
            <Skeleton height={14} width="70%" />
          </div>
        </div>
      ))}
    </div>
  )
}
