// The DigiWP mascot as a custom element: <ani-doodle piece="digi-form" state="…">.
// Built into src/vendor/digi-mascot.js by scripts/build-mascot.sh; the panel loads it lazily.
import { define } from "./engine/interactive";
import { digiForm } from "./digiForm";

// One pause button pauses Digi on every visit; remembered on this device only.
const KEY = "digiwp.mascot.paused";
document.addEventListener("click", (e) => {
  const btn = (e.target as Element | null)?.closest?.(".ani-doodle-pause");
  if (!btn) return;
  setTimeout(() => {
    const own = (window.__anidoodle ?? []).find((c) => c.el.contains(btn));
    if (!own) return;
    try { localStorage.setItem(KEY, own.paused ? "1" : "0"); } catch { /* private mode: not remembered */ }
  }, 0);
}, true);

export const startPaused = (): boolean => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };

define({ "digi-form": digiForm });
