// Persian formatting helpers. The design renders all numerals in
// Persian digits and uses JetBrains Mono (tabular) for technical atoms.
const FA = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']

/** Convert Latin digits in a string/number to Persian digits. */
export const faNum = (v) => String(v ?? '').replace(/[0-9]/g, (d) => FA[+d])

/** Group thousands then Persian-ise: 490000 → «۴۹۰٬۰۰۰». */
export const faMoney = (v) => faNum(Number(v || 0).toLocaleString('en-US').replace(/,/g, '٬'))

/** Percent with Persian digits: 82 → «۸۲٪». */
export const faPct = (v) => `${faNum(Math.round(v))}٪`

/** Simple relative time in Persian for demo timestamps (minutes/hours ago). */
export const faAgo = (mins) => {
  if (mins < 1) return 'همین حالا'
  if (mins < 60) return `${faNum(mins)} دقیقه پیش`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${faNum(h)} ساعت پیش`
  return `${faNum(Math.floor(h / 24))} روز پیش`
}
