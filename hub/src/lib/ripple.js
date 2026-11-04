// Material ripple, as a progressive enhancement: one delegated pointerdown
// listener adds a short-lived circle under the finger on the panel's
// pressable surfaces. Nothing else depends on it — without JS, or with
// reduced motion, the surfaces still show their hover/pressed state layers.
const PRESSABLE = '.gd-btn, .gd-iconbtn, .panel-nav__link, .panel-quick-link, .panel-tool-link, .panel-user, .panel-mobile-menu'

export function installRipple(root = document) {
  if (typeof window === 'undefined' || !window.matchMedia) return
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
  root.addEventListener('pointerdown', (event) => {
    if (reduced.matches || event.button !== 0) return
    const host = event.target instanceof Element ? event.target.closest(PRESSABLE) : null
    if (!host || host.matches('[disabled], [aria-disabled="true"]')) return
    const box = host.getBoundingClientRect()
    const size = Math.hypot(box.width, box.height) * 2
    const dot = document.createElement('span')
    dot.className = 'md-ripple'
    dot.setAttribute('aria-hidden', 'true')
    dot.style.width = dot.style.height = `${size}px`
    dot.style.left = `${event.clientX - box.left - size / 2}px`
    dot.style.top = `${event.clientY - box.top - size / 2}px`
    host.appendChild(dot)
    dot.addEventListener('animationend', () => dot.remove(), { once: true })
  }, { passive: true })
}
