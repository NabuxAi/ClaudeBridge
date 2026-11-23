// The price rule the server charges (server/src/payments.store.js priceFor):
// a year is ten months, as the price page promises; 1, 3 and 6 months carry
// no discount. Shown before paying; the invoice the server returns is final.
export const MONTH_CHOICES = [1, 3, 6, 12]
export const priceFor = (monthly, months) => (months === 12 ? monthly * 10 : monthly * months)

/** Invoice status → badge colour, shared by the invoice page and the billing list. */
export const INVOICE_BADGE = { paid: 'success', pending: 'warning', failed: 'danger' }
