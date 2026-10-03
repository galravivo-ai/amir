// Card payments through Cardcom (Israeli acquirer), API v11: a hosted payment
// page that charges and saves a token, then monthly / yearly token charges.
// Cardcom also issues the tax invoice-receipt and emails it to the payer.
// All calls go through `fetchImpl` so tests can stand in for Cardcom.

const API = 'https://secure.cardcom.solutions/api/v11';

export class CardcomError extends Error {}

const clean = (v) => String(v ?? '').trim().replace(/^["']|["']$/g, '');

/** Returns null when no terminal is configured. */
export function createCardcom({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const terminal = Number(clean(env.CARDCOM_TERMINAL));
  const apiName = clean(env.CARDCOM_API_NAME);
  const apiPassword = clean(env.CARDCOM_API_PASSWORD);
  // "Auto" lets Cardcom pick the document by the terminal's settings (invoice-receipt or receipt).
  const documentType = clean(env.CARDCOM_DOCUMENT_TYPE) || 'Auto';
  if (!terminal || !apiName) return null;

  async function call(path, body) {
    const res = await fetchImpl(`${API}/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ TerminalNumber: terminal, ApiName: apiName, ...body }),
      signal: AbortSignal.timeout(60e3),
    });
    const text = await res.text();
    let json = {};
    try {
      json = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    if (!res.ok) throw new CardcomError(String(json.Description || `HTTP ${res.status}`));
    return json;
  }

  const document = ({ name, email, description, amount }) => ({
    DocumentTypeToCreate: documentType,
    Name: name || email,
    Email: email,
    IsSendByEmail: true,
    Language: 'he',
    Products: [{ Description: description, Quantity: 1, UnitCost: amount }],
  });

  return {
    /** A hosted payment page that charges `amount` and keeps a token for renewals. */
    async createPage({ amount, description, returnValue, successUrl, failedUrl, webhookUrl, customer }) {
      const r = await call('LowProfile/Create', {
        Operation: 'ChargeAndCreateToken',
        Amount: amount,
        ISOCoinId: 1,
        Language: 'he',
        ProductName: description,
        ReturnValue: returnValue,
        SuccessRedirectUrl: successUrl,
        FailedRedirectUrl: failedUrl,
        WebHookUrl: webhookUrl,
        Document: document({ ...customer, description, amount }),
      });
      if (r.ResponseCode !== 0 || !r.Url) throw new CardcomError(r.Description || 'Cardcom did not open a payment page');
      return { id: r.LowProfileId, url: r.Url };
    },

    /** What happened on a payment page; trusted, unlike the webhook's body. */
    async result(lowProfileId) {
      const r = await call('LowProfile/GetLpResult', { LowProfileId: lowProfileId });
      const tx = r.TranzactionInfo || {};
      const token = r.TokenInfo || {};
      const ok = r.ResponseCode === 0 && (tx.ResponseCode ?? 0) === 0 && Boolean(r.TranzactionId || tx.TranzactionId);
      const month = token.CardMonth || tx.CardMonth;
      const year = token.CardYear || tx.CardYear;
      return {
        ok,
        error: ok ? '' : String(tx.Description || r.Description || 'התשלום לא הושלם'),
        transactionId: String(r.TranzactionId || tx.TranzactionId || ''),
        amount: Number(tx.Amount || 0),
        returnValue: String(r.ReturnValue ?? ''),
        token: token.Token || tx.Token || '',
        expiry: month && year ? `${String(month).padStart(2, '0')}${String(year).slice(-2)}` : '',
        last4: String(tx.Last4CardDigitsString || tx.Last4CardDigits || ''),
      };
    },

    /** Charges a saved card. `uniqueId` stops a retried request from charging twice. */
    async chargeToken({ amount, token, expiry, description, uniqueId, customer }) {
      const r = await call('Transactions/Transaction', {
        Amount: amount,
        Token: token,
        CardExpirationMMYY: expiry,
        ISOCoinId: 1,
        ExternalUniqTranId: uniqueId,
        ExternalUniqUniqTranIdResponse: true,
        ...(apiPassword ? { Advanced: { ApiPassword: apiPassword } } : {}),
        Document: document({ ...customer, description, amount }),
      });
      const ok = r.ResponseCode === 0;
      return { ok, transactionId: String(r.TranzactionId || ''), error: ok ? '' : String(r.Description || 'החיוב נכשל') };
    },
  };
}
