/** Tell every Digi on the page what the form is doing ("peek", "busy", "error", "success", "idle"). */
export function setMascotState(name) {
  document.querySelectorAll('ani-doodle[piece="digi-form"]').forEach((el) => el.setState?.(name || 'idle'))
}
