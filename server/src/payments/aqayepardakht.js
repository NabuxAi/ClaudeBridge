// ============================================================
// Aqayepardakht (آقای پرداخت) gateway client, API v2.
//
//   create: POST {BASE}/api/v2/create {pin, amount, callback, invoice_id, email?, description?}
//           → {status:'success', transid} | {status:'error', code}
//   pay:    the customer's browser opens {BASE}/startpay/{transid}
//   return: the gateway sends the browser to our callback with
//           transid, tracking_number, cardnumber, invoice_id, status
//   verify: POST {BASE}/api/v2/verify {pin, amount, transid}
//           → {status:'success', code:'1'} paid now, code '2' already verified
//           → {status:'error', code:'0'} not paid; other codes are refusals
//
// Amounts are TOMAN, more than 1,000 and less than 100,000,000. Only verify
// decides that money moved; the fields on the return trip come from the
// customer's browser and are never trusted for that.
//
// v3 (api.aqayepardakht.ir) did not answer from either DigiWP server or a
// workstation on 2026-11-23; v2 on panel.aqayepardakht.ir did, from both.
// ============================================================

const BASE = 'https://panel.aqayepardakht.ir'

let fetchImpl = (...args) => fetch(...args)
/** Test seam: the mailer/web-push pattern. Pass nothing to restore fetch. */
export function _setFetchForTests(fn) { fetchImpl = fn || ((...args) => fetch(...args)) }

export class GatewayError extends Error {
  /** `transient`: nothing is known about the transaction; retry later. */
  constructor(message, { code = null, transient = false } = {}) {
    super(message)
    this.name = 'GatewayError'
    this.code = code
    this.transient = transient
  }
}

async function post(path, body) {
  let res
  try {
    res = await fetchImpl(BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    })
  } catch (e) {
    throw new GatewayError(`aqayepardakht unreachable: ${e.message}`, { transient: true })
  }
  const text = await res.text().catch(() => '')
  try {
    return JSON.parse(text)
  } catch {
    throw new GatewayError(`aqayepardakht answered HTTP ${res.status} without JSON`, { transient: true })
  }
}

/** Open a transaction. Returns the gateway's transid. */
export async function createPayment({ pin, amount, callback, invoiceId, email, description }) {
  const data = await post('/api/v2/create', {
    pin, amount, callback, invoice_id: invoiceId,
    ...(email ? { email } : {}),
    ...(description ? { description } : {}),
  })
  if (data?.status === 'success' && typeof data.transid === 'string' && data.transid) return data.transid
  throw new GatewayError(`aqayepardakht refused create (code ${data?.code ?? '?'})`, { code: String(data?.code ?? '') })
}

/** Where the customer pays. */
export function startUrl(transid) {
  return `${BASE}/startpay/${encodeURIComponent(transid)}`
}

/**
 * Ask the gateway whether this transaction was paid, for exactly this amount.
 * `{paid:true}` only on success codes 1 (verified now) or 2 (verified before).
 * Connection problems throw a transient GatewayError: the payment may still
 * have happened, so the invoice must stay pending, never read as failed.
 */
export async function verifyPayment({ pin, amount, transid }) {
  const data = await post('/api/v2/verify', { pin, amount, transid })
  const code = String(data?.code ?? '')
  if (data?.status === 'success' && (code === '1' || code === '2')) return { paid: true, alreadyVerified: code === '2' }
  if (data?.status === 'error' || data?.status === 'success') return { paid: false, code }
  throw new GatewayError('aqayepardakht verify answered without a status', { transient: true })
}
