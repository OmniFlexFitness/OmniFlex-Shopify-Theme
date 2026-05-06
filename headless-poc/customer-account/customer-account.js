/**
 * Shopify Customer Account API client — OAuth 2.0 + PKCE.
 *
 * Drop-in companion to omniflex-headless.js. Mounts on:
 *   [data-of-account-login]   → renders "Log in" / "Log out" + greeting
 *   [data-of-account-orders]  → renders the customer's order history
 *   [data-of-account-callback] → MUST exist on the configured redirect path
 *
 * Required <meta> tags (in addition to those for the storefront client):
 *   <meta name="of-account-shop-id"     content="123456789">  // Shopify shop ID (numeric)
 *   <meta name="of-account-client-id"   content="shp_xxxxx">  // Customer Account API client ID
 *   <meta name="of-account-redirect-uri" content="https://www.example.com/account/callback">
 *
 * Why the new Customer Account API and not the legacy Storefront customer
 * fields: Shopify deprecated unauthenticated_write_customers in favor of a
 * dedicated identity provider that issues OAuth tokens scoped to a single
 * customer. New Customer Accounts are mandatory for Shop Pay sign-in and
 * for most apps that depend on customer identity.
 *
 * Reference: https://shopify.dev/docs/api/customer
 */

const meta = (n) => document.querySelector(`meta[name="${n}"]`)?.content;

const SHOP_ID = meta('of-account-shop-id');
const CLIENT_ID = meta('of-account-client-id');
const REDIRECT_URI = meta('of-account-redirect-uri');

const AUTH_BASE = SHOP_ID ? `https://shopify.com/${SHOP_ID}/account` : null;
const AUTH_URL = AUTH_BASE ? `${AUTH_BASE}/oauth/authorize` : null;
const TOKEN_URL = AUTH_BASE ? `${AUTH_BASE}/oauth/token` : null;
const LOGOUT_URL = AUTH_BASE ? `${AUTH_BASE}/oauth/logout` : null;
const API_URL = AUTH_BASE ? `${AUTH_BASE}/customer/api/2025-01/graphql` : null;

const SCOPES = ['openid', 'email', 'customer-account-api:full'].join(' ');

// --------------------------------------------------------------------------
// PKCE
// --------------------------------------------------------------------------

function base64UrlEncode(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function randomString(len = 64) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return base64UrlEncode(arr);
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return base64UrlEncode(new Uint8Array(buf));
}

// --------------------------------------------------------------------------
// Token storage
// --------------------------------------------------------------------------

const TOKEN_KEY = 'of-customer-token';
const PKCE_KEY = 'of-pkce-verifier';
const STATE_KEY = 'of-oauth-state';

function readToken() {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getToken() {
  const tok = readToken();
  if (!tok) return null;
  if (tok.expires_at && Date.now() > tok.expires_at - 30_000) return null;
  return tok;
}

let refreshInFlight = null;

async function refreshToken() {
  // Coalesce parallel callers so we only hit the token endpoint once.
  if (refreshInFlight) return refreshInFlight;
  const tok = readToken();
  if (!tok?.refresh_token) return null;
  refreshInFlight = (async () => {
    try {
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: CLIENT_ID,
        refresh_token: tok.refresh_token,
      });
      const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      if (!res.ok) {
        // Refresh tokens can be revoked or expired — clear and force re-login.
        setToken(null);
        return null;
      }
      const fresh = await res.json();
      // Shopify rotates refresh tokens on every refresh; preserve any field
      // (id_token, scope) the new response doesn't repeat.
      const merged = { ...tok, ...fresh };
      setToken(merged);
      return readToken();
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function getValidToken() {
  const tok = getToken();
  if (tok) return tok;
  return refreshToken();
}

function setToken(tok) {
  if (!tok) {
    localStorage.removeItem(TOKEN_KEY);
    return;
  }
  // Tokens are bearer tokens — localStorage is acceptable for a CMS-only
  // frontend, but a server-rendered architecture should keep them in
  // httpOnly cookies. Document this trade-off in the README.
  const expires_at = Date.now() + (tok.expires_in ?? 3600) * 1000;
  localStorage.setItem(TOKEN_KEY, JSON.stringify({ ...tok, expires_at }));
}

// --------------------------------------------------------------------------
// OAuth flow
// --------------------------------------------------------------------------

async function login() {
  if (!CLIENT_ID || !REDIRECT_URI || !AUTH_URL) {
    console.error('[omniflex/account] missing config');
    return;
  }
  const verifier = randomString(64);
  const challenge = await sha256(verifier);
  const state = randomString(32);
  sessionStorage.setItem(PKCE_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    scope: SCOPES,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  location.href = `${AUTH_URL}?${params.toString()}`;
}

async function exchangeCode() {
  const url = new URL(location.href);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code) return null;
  const expected = sessionStorage.getItem(STATE_KEY);
  if (!state || state !== expected) {
    console.error('[omniflex/account] state mismatch');
    return null;
  }
  const verifier = sessionStorage.getItem(PKCE_KEY);
  sessionStorage.removeItem(PKCE_KEY);
  sessionStorage.removeItem(STATE_KEY);
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    code,
    code_verifier: verifier,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    console.error('[omniflex/account] token exchange failed', await res.text());
    return null;
  }
  const tok = await res.json();
  setToken(tok);
  // Strip the ?code= from the URL so a refresh doesn't re-trigger exchange.
  url.searchParams.delete('code');
  url.searchParams.delete('state');
  history.replaceState(null, '', url.toString());
  return tok;
}

function logout() {
  const tok = getToken();
  setToken(null);
  if (tok && LOGOUT_URL) {
    const params = new URLSearchParams({
      id_token_hint: tok.id_token ?? '',
      post_logout_redirect_uri: location.origin,
    });
    location.href = `${LOGOUT_URL}?${params.toString()}`;
  } else {
    location.reload();
  }
}

// --------------------------------------------------------------------------
// Customer Account GraphQL
// --------------------------------------------------------------------------

async function customerGql(query, variables = {}) {
  let tok = await getValidToken();
  if (!tok) throw new Error('not authenticated');
  let res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: tok.access_token,
    },
    body: JSON.stringify({ query, variables }),
  });
  // If the server still rejects the bearer (token revoked between expiry
  // check and request, clock skew, etc.) try one refresh + retry.
  if (res.status === 401) {
    const fresh = await refreshToken();
    if (fresh) {
      res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: fresh.access_token,
        },
        body: JSON.stringify({ query, variables }),
      });
    }
  }
  if (!res.ok) throw new Error(`customer api ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

const Q_VIEWER = `query { customer { firstName lastName emailAddress { emailAddress } } }`;

const Q_ORDERS = `query Orders($first: Int!) {
  customer {
    orders(first: $first, sortKey: PROCESSED_AT, reverse: true) {
      nodes {
        id
        name
        processedAt
        financialStatus
        fulfillmentStatus
        totalPrice { amount currencyCode }
        lineItems(first: 10) {
          nodes {
            title
            quantity
            image { url altText }
          }
        }
      }
    }
  }
}`;

// --------------------------------------------------------------------------
// Render
// --------------------------------------------------------------------------

function money(m) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: m.currencyCode })
    .format(parseFloat(m.amount));
}

async function renderLogin(host) {
  host.innerHTML = '';
  const tok = getToken();
  if (!tok) {
    host.innerHTML = '<button data-of-account-login-btn>Log in</button>';
    host.querySelector('[data-of-account-login-btn]')
      .addEventListener('click', () => login());
    return;
  }
  try {
    const { customer } = await customerGql(Q_VIEWER);
    host.innerHTML = `
      <span>Hi ${customer.firstName ?? customer.emailAddress.emailAddress}</span>
      <button data-of-account-logout-btn>Log out</button>
    `;
    host.querySelector('[data-of-account-logout-btn]')
      .addEventListener('click', () => logout());
  } catch (e) {
    console.error(e);
    setToken(null);
    host.innerHTML = '<button data-of-account-login-btn>Log in</button>';
    host.querySelector('[data-of-account-login-btn]')
      .addEventListener('click', () => login());
  }
}

async function renderOrders(host) {
  if (!getToken()) {
    host.innerHTML = '<p>Please <a href="#" data-of-account-login-btn>log in</a> to view your orders.</p>';
    host.querySelector('[data-of-account-login-btn]')
      .addEventListener('click', (e) => { e.preventDefault(); login(); });
    return;
  }
  try {
    const data = await customerGql(Q_ORDERS, { first: 25 });
    const orders = data.customer.orders.nodes;
    if (orders.length === 0) {
      host.innerHTML = '<p>No orders yet.</p>';
      return;
    }
    host.innerHTML = `
      <ul class="of-orders">
        ${orders.map((o) => `
          <li class="of-orders__item">
            <header>
              <strong>${o.name}</strong>
              <time>${new Date(o.processedAt).toLocaleDateString()}</time>
              <span>${money(o.totalPrice)}</span>
              <span class="of-orders__status">${o.fulfillmentStatus ?? o.financialStatus ?? ''}</span>
            </header>
            <ul class="of-orders__lines">
              ${o.lineItems.nodes.map((l) => `
                <li>
                  <img src="${l.image?.url ?? ''}" alt="${l.image?.altText ?? ''}" width="48" height="48">
                  ${l.title} × ${l.quantity}
                </li>`).join('')}
            </ul>
          </li>`).join('')}
      </ul>`;
  } catch (e) {
    console.error(e);
    host.innerHTML = '<p>Could not load orders.</p>';
  }
}

// --------------------------------------------------------------------------
// Mount
// --------------------------------------------------------------------------

async function mount() {
  // If we're on the configured callback path, exchange code first.
  if (document.querySelector('[data-of-account-callback]')) {
    await exchangeCode();
  }
  for (const host of document.querySelectorAll('[data-of-account-login]')) {
    renderLogin(host);
  }
  for (const host of document.querySelectorAll('[data-of-account-orders]')) {
    renderOrders(host);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}

window.OmniFlexAccount = { login, logout, getToken, customerGql };
