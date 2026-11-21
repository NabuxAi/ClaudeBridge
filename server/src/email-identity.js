/**
 * One mailbox, one account.
 *
 * Several spellings of an address reach the same inbox, so they are the same
 * person and must not be able to hold separate accounts:
 *
 *   Gmail ignores dots in the local part and treats googlemail.com as
 *   gmail.com:   s.h.m379@gmail.com  ==  shm379@googlemail.com  ==  shm379@gmail.com
 *   "+tag" sub-addressing (Gmail, Outlook, iCloud, Fastmail, Proton, most
 *   self-hosted servers) delivers user+anything@ to user@:
 *                shm379+test@gmail.com  ==  shm379@gmail.com
 *
 * canonicalEmail() folds those spellings into one key. It is a uniqueness
 * key only: the address the person typed is still the one stored, shown and
 * mailed to.
 */
const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com'])

export function canonicalEmail(email) {
  const s = String(email || '').trim().toLowerCase()
  const at = s.lastIndexOf('@')
  if (at <= 0 || at === s.length - 1) return s
  let local = s.slice(0, at)
  let domain = s.slice(at + 1)
  // A leading "+" is the whole local part, not a tag: keep it.
  const plus = local.indexOf('+')
  if (plus > 0) local = local.slice(0, plus)
  if (GMAIL_DOMAINS.has(domain)) {
    domain = 'gmail.com'
    local = local.replace(/\./g, '')
  }
  return `${local}@${domain}`
}
