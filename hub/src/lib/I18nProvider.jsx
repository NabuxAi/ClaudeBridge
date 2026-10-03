// Keeps React in step with the i18n module: switching language re-renders
// the whole tree under a new key, so every `t()` in render reads the new
// dictionary. Remounting drops in-progress form state, which is acceptable
// for a deliberate language switch and far simpler than threading a
// context through every component.
import { createContext, useCallback, useContext, useState } from 'react'
import { getLang, setLang as switchLang } from './i18n.js'
import { account, getToken } from './api.js'

const I18nCtx = createContext(null)

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(getLang)
  const setLang = useCallback(async (code) => {
    await switchLang(code)
    setLangState(getLang())
    // Signed in: remember it on the account too, so emails and alerts the
    // server sends later arrive in the same language. Best effort — the
    // switch itself has already happened.
    if (getToken()) account.saveProfile({ lang: code }).catch(() => {})
  }, [])
  return (
    <I18nCtx.Provider value={{ lang, setLang }}>
      <div key={lang} style={{ display: 'contents' }}>{children}</div>
    </I18nCtx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useI18n = () => useContext(I18nCtx)
