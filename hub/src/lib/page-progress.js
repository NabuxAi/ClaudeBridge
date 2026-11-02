let requests = 0
let navigating = false
const listeners = new Set()
const emit = () => listeners.forEach((listener) => listener())

export const subscribeProgress = (listener) => { listeners.add(listener); return () => listeners.delete(listener) }
export const progressActive = () => requests > 0 || navigating
export function beginPending() {
  requests++; emit()
  let finished = false
  return () => { if (!finished) { finished = true; requests--; emit() } }
}
export function beginNavigation() { navigating = true; emit() }
export function finishNavigation() { navigating = false; emit() }
