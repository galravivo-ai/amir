import crypto from 'node:crypto';

// Google Business Profile: OAuth, locations and reviews.
// Reviews still live on the v4 "mybusiness" API; accounts and locations on
// the newer per-area APIs. All calls go through `fetchImpl` so tests can
// stand in for Google.

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ACCOUNTS_URL = 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts';
const INFO_URL = 'https://mybusinessbusinessinformation.googleapis.com/v1';
const REVIEWS_URL = 'https://mybusiness.googleapis.com/v4';
const SCOPES = ['https://www.googleapis.com/auth/business.manage', 'openid', 'email'];

export const STARS = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

export class GoogleError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

/** AES-256-GCM, keyed from the OAuth client secret, so a leaked database alone does not expose tokens. */
function sealer(secret) {
  const key = crypto.createHash('sha256').update(`gofive-google:${secret}`).digest();
  return {
    seal(text) {
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv('aes-256-gcm', key, iv);
      const data = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
      return [iv, c.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
    },
    open(sealed) {
      const [iv, tag, data] = String(sealed).split('.').map((p) => Buffer.from(p, 'base64url'));
      const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
      d.setAuthTag(tag);
      return Buffer.concat([d.update(data), d.final()]).toString('utf8');
    },
  };
}

function emailFromIdToken(idToken) {
  try {
    return JSON.parse(Buffer.from(String(idToken).split('.')[1], 'base64url').toString('utf8')).email || '';
  } catch {
    return '';
  }
}

/** Returns null when no OAuth client is configured. */
export function createGoogle({
  clientId = process.env.GOOGLE_CLIENT_ID,
  clientSecret = process.env.GOOGLE_CLIENT_SECRET,
  fetchImpl = globalThis.fetch,
} = {}) {
  // Values pasted into a hosting dashboard often carry stray spaces or quotes.
  const clean = (v) => String(v ?? '').trim().replace(/^["']|["']$/g, '').trim();
  clientId = clean(clientId);
  clientSecret = clean(clientSecret);
  if (!clientId || !clientSecret) return null;
  const { seal, open } = sealer(clientSecret);

  async function call(url, { method = 'GET', token, body, form } = {}) {
    const res = await fetchImpl(url, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: form ? new URLSearchParams(form).toString() : body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      /* not JSON */
    }
    if (!res.ok) {
      const msg = json.error?.message || json.error_description || json.error || `HTTP ${res.status}`;
      throw new GoogleError(String(msg), res.status);
    }
    return json;
  }

  return {
    seal,
    open,
    setupCheck: () => ({ clientId, secretLooksRight: clientSecret.startsWith('GOCSPX-'), secretLength: clientSecret.length }),

    authUrl({ redirectUri, state }) {
      const q = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: SCOPES.join(' '),
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
        state,
      });
      return `${AUTH_URL}?${q}`;
    },

    async exchangeCode({ code, redirectUri }) {
      const t = await call(TOKEN_URL, {
        method: 'POST',
        form: { code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' },
      });
      if (!t.refresh_token) throw new GoogleError('גוגל לא החזירה הרשאה קבועה. נסו להתחבר שוב.');
      return {
        accessToken: t.access_token,
        refreshToken: t.refresh_token,
        expiresAt: Date.now() + (Number(t.expires_in) || 3600) * 1000,
        email: emailFromIdToken(t.id_token),
      };
    },

    async refresh(refreshToken) {
      const t = await call(TOKEN_URL, {
        method: 'POST',
        form: { refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token' },
      });
      return { accessToken: t.access_token, expiresAt: Date.now() + (Number(t.expires_in) || 3600) * 1000 };
    },

    async listLocations(token) {
      const out = [];
      const accounts = (await call(ACCOUNTS_URL, { token })).accounts || [];
      for (const account of accounts) {
        let pageToken = '';
        do {
          const q = new URLSearchParams({ readMask: 'name,title,storefrontAddress,metadata', pageSize: '100' });
          if (pageToken) q.set('pageToken', pageToken);
          const page = await call(`${INFO_URL}/${account.name}/locations?${q}`, { token });
          for (const loc of page.locations || []) {
            const addr = loc.storefrontAddress;
            out.push({
              account: account.name,
              // v4 review paths need the account too: accounts/A/locations/L
              name: `${account.name}/${loc.name}`,
              title: loc.title || '',
              address: addr ? [...(addr.addressLines || []), addr.locality].filter(Boolean).join(', ') : '',
              placeId: loc.metadata?.placeId || '',
              reviewUrl: loc.metadata?.newReviewUri || '',
            });
          }
          pageToken = page.nextPageToken || '';
        } while (pageToken);
      }
      return out;
    },

    /** Newest reviews first, plus the location's overall rating. */
    async listReviews(token, locationName, { pageSize = 50 } = {}) {
      const q = new URLSearchParams({ pageSize: String(pageSize), orderBy: 'updateTime desc' });
      const r = await call(`${REVIEWS_URL}/${locationName}/reviews?${q}`, { token });
      return {
        averageRating: Number(r.averageRating) || 0,
        totalReviewCount: Number(r.totalReviewCount) || 0,
        reviews: (r.reviews || []).map((x) => ({
          name: x.name,
          reviewer: x.reviewer?.isAnonymous ? '' : x.reviewer?.displayName || '',
          photo: x.reviewer?.profilePhotoUrl || '',
          rating: STARS[x.starRating] || 0,
          comment: x.comment || '',
          createTime: x.createTime || '',
          updateTime: x.updateTime || '',
          reply: x.reviewReply?.comment || '',
          replyTime: x.reviewReply?.updateTime || '',
        })),
      };
    },

    /** Publishes a post (see posts.js for the body); returns Google's LocalPost. */
    createPost: (token, locationName, body) => call(`${REVIEWS_URL}/${locationName}/localPosts`, { method: 'POST', token, body }),

    reply: (token, reviewName, comment) => call(`${REVIEWS_URL}/${reviewName}/reply`, { method: 'PUT', token, body: { comment } }),
  };
}
