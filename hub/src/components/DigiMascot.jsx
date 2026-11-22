import { useEffect, useState } from 'react'

/**
 * Digi, the DigiWP guardian (hub/mascot/digiForm.ts, an anidoodle interactive piece).
 *
 * He follows whatever on the page carries data-anidoodle="name|email|password|reveal|submit":
 * reads along as you type, covers his eyes for the password, grins at the submit button.
 * `state` is the form's: "busy", "error", "success" (or nothing). The engine is loaded only
 * on the pages that show him, draws nothing offscreen, honours reduced motion, and has a
 * visible pause button that is remembered on this device.
 *
 * The element scans the page for targets once, when it mounts; pass a different `scan`
 * value when the form's fields change so he looks for them again.
 */
let loading = null
const load = () => (loading ??= import('../vendor/digi-mascot.js'))

export default function DigiMascot({ state = '', scan = 0 }) {
  const [ready, setReady] = useState(false)
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    let alive = true
    load().then((m) => { if (alive) { setPaused(m.startPaused()); setReady(true) } }).catch(() => { /* no mascot is fine */ })
    return () => { alive = false }
  }, [])
  return (
    <div className="dwp-mascot" aria-hidden={ready ? undefined : 'true'}>
      {ready && (
        <ani-doodle key={scan} piece="digi-form" state={state || 'idle'} {...(paused ? { paused: '' } : {})} />
      )}
    </div>
  )
}
