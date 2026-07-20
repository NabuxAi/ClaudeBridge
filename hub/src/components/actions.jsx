import Icon from '../lib/icons.jsx'

const ICON_SIZE = { sm: 15, md: 17, lg: 19 }

export function Button({
  variant = 'primary', size = 'md', leftIcon, rightIcon, loading = false,
  disabled = false, fullWidth = false, as, href, className = '', children, ...rest
}) {
  const cls = [
    'gd-btn', `gd-btn--${variant}`, `gd-btn--${size}`,
    fullWidth && 'gd-btn--full', loading && 'gd-btn--loading', className,
  ].filter(Boolean).join(' ')
  const s = ICON_SIZE[size] || 17
  const inner = (
    <>
      {loading && (
        <span className="gd-btn__spin-wrap">
          <Icon name="loader-2" size={s} className="gd-btn__spinner" />
        </span>
      )}
      {leftIcon && <Icon name={leftIcon} size={s} className="gd-btn__icon" />}
      {children != null && <span className="gd-btn__label">{children}</span>}
      {rightIcon && <Icon name={rightIcon} size={s} className="gd-btn__icon" />}
    </>
  )
  const Cmp = as || (href ? 'a' : 'button')
  return (
    <Cmp
      className={cls}
      href={href}
      disabled={Cmp === 'button' ? disabled || loading : undefined}
      aria-disabled={disabled || loading || undefined}
      {...rest}
    >
      {inner}
    </Cmp>
  )
}

export function IconButton({ icon, label, variant = 'ghost', size = 'md', className = '', ...rest }) {
  const s = size === 'sm' ? 17 : size === 'lg' ? 21 : 19
  return (
    <button
      className={['gd-iconbtn', `gd-iconbtn--${variant}`, `gd-iconbtn--${size}`, className].filter(Boolean).join(' ')}
      aria-label={label}
      title={label}
      {...rest}
    >
      <Icon name={icon} size={s} />
    </button>
  )
}
