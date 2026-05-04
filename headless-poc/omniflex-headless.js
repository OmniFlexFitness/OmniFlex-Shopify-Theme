/**
 * OmniFlex headless Webflow ↔ Shopify storefront client.
 *
 * Single-file ES module. Drop-in via <script type="module">.
 * Reads config from <meta> tags in the host page:
 *   <meta name="of-shop"        content="omniflexfitness.myshopify.com">
 *   <meta name="of-token"       content="public-storefront-api-token">
 *   <meta name="of-api-version" content="2025-01">
 *
 * Mounts on data-attributes the Webflow Designer can add to elements:
 *   [data-of-product="<handle>"]      → render PDP into this element
 *   [data-of-collection="<handle>"]   → render PLP grid into this element
 *   [data-of-add-to-cart][data-of-handle][data-of-variant-id?]
 *                                     → wire any button as add-to-cart
 *   [data-of-cart-toggle]             → open the cart drawer
 *   [data-of-cart-count]              → live line-item count badge
 *
 * No bundler. No framework. Vanilla ES2022.
 */

const cfg = (() => {
  const get = (n) => document.querySelector(`meta[name="${n}"]`)?.content;
  const shop = get('of-shop');
  const token = get('of-token');
  const apiVersion = get('of-api-version') || '2025-01';
  // Country/language for @inContext — drives presentment currency & translations.
  // Resolution order: explicit <meta>, <html lang>, browser language, fallback.
  const country =
    get('of-country')?.toUpperCase() ||
    document.documentElement.lang?.split('-')[1]?.toUpperCase() ||
    new Intl.Locale(navigator.language || 'en-US').region ||
    'US';
  const language =
    get('of-language')?.toUpperCase() ||
    document.documentElement.lang?.split('-')[0]?.toUpperCase() ||
    new Intl.Locale(navigator.language || 'en-US').language?.toUpperCase() ||
    'EN';
  if (!shop || !token) {
    console.error('[omniflex] missing <meta name="of-shop"> or <meta name="of-token">');
  }
  return {
    shop,
    token,
    country,
    language,
    endpoint: `https://${shop}/api/${apiVersion}/graphql.json`,
  };
})();

// ---------------------------------------------------------------------------
// Storefront API client
// ---------------------------------------------------------------------------

async function gql(query, variables = {}) {
  const res = await fetch(cfg.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': cfg.token,
      Accept: 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Storefront API ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

const PRODUCT_FIELDS = `
  id
  handle
  title
  description
  descriptionHtml
  featuredImage { url altText width height }
  images(first: 10) { nodes { url altText width height } }
  options { id name values }
  priceRange { minVariantPrice { amount currencyCode } }
  variants(first: 100) {
    nodes {
      id
      title
      availableForSale
      quantityAvailable
      price { amount currencyCode }
      compareAtPrice { amount currencyCode }
      selectedOptions { name value }
      image { url altText }
    }
  }
`;

// All product/collection queries take @inContext directives so prices and
// availability are returned in the visitor's presentment currency. Cart
// mutations also accept country/language and Shopify will create the cart
// with the matching buyerIdentity.countryCode automatically.
const Q_PRODUCT = `query Product($handle: String!, $country: CountryCode, $language: LanguageCode)
  @inContext(country: $country, language: $language) {
    product(handle: $handle) { ${PRODUCT_FIELDS} }
  }`;

const Q_COLLECTION = `query Collection($handle: String!, $first: Int!, $country: CountryCode, $language: LanguageCode)
  @inContext(country: $country, language: $language) {
    collection(handle: $handle) {
      id
      title
      description
      products(first: $first) {
        nodes {
          id handle title
          featuredImage { url altText }
          priceRange { minVariantPrice { amount currencyCode } }
        }
      }
    }
  }`;

const Q_PREDICTIVE_SEARCH = `query Predict($q: String!, $country: CountryCode, $language: LanguageCode)
  @inContext(country: $country, language: $language) {
    predictiveSearch(query: $q, limit: 8, types: [PRODUCT, COLLECTION, QUERY]) {
      products {
        id handle title
        featuredImage { url altText }
        priceRange { minVariantPrice { amount currencyCode } }
      }
      collections { id handle title }
      queries { text styledText }
    }
  }`;

const CART_FIELDS = `
  id
  checkoutUrl
  totalQuantity
  cost {
    subtotalAmount { amount currencyCode }
    totalAmount { amount currencyCode }
  }
  lines(first: 100) {
    nodes {
      id
      quantity
      cost { totalAmount { amount currencyCode } }
      merchandise {
        ... on ProductVariant {
          id title
          image { url altText }
          product { handle title }
          selectedOptions { name value }
        }
      }
    }
  }
`;

const M_CART_CREATE = `mutation($country: CountryCode, $language: LanguageCode)
  @inContext(country: $country, language: $language) {
    cartCreate(input: { buyerIdentity: { countryCode: $country } }) {
      cart { ${CART_FIELDS} } userErrors { message }
    }
  }`;

const M_CART_LINES_ADD = `mutation($cartId: ID!, $lines: [CartLineInput!]!) {
  cartLinesAdd(cartId: $cartId, lines: $lines) {
    cart { ${CART_FIELDS} } userErrors { message }
  }
}`;

const M_CART_LINES_UPDATE = `mutation($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
  cartLinesUpdate(cartId: $cartId, lines: $lines) {
    cart { ${CART_FIELDS} } userErrors { message }
  }
}`;

const M_CART_LINES_REMOVE = `mutation($cartId: ID!, $lineIds: [ID!]!) {
  cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
    cart { ${CART_FIELDS} } userErrors { message }
  }
}`;

const Q_CART = `query($id: ID!) { cart(id: $id) { ${CART_FIELDS} } }`;

// ---------------------------------------------------------------------------
// Cart manager (localStorage-backed)
// ---------------------------------------------------------------------------

const CART_KEY = 'of-cart-id';
const cartListeners = new Set();

let cartState = null;

function emit() {
  for (const fn of cartListeners) fn(cartState);
}

async function loadCart() {
  const id = localStorage.getItem(CART_KEY);
  if (!id) return null;
  try {
    const { cart } = await gql(Q_CART, { id });
    if (!cart) {
      localStorage.removeItem(CART_KEY);
      return null;
    }
    cartState = cart;
    emit();
    return cart;
  } catch (e) {
    console.warn('[omniflex] failed to load cart', e);
    return null;
  }
}

async function ensureCart() {
  if (cartState) return cartState;
  const existing = await loadCart();
  if (existing) return existing;
  const { cartCreate } = await gql(M_CART_CREATE, {
    country: cfg.country,
    language: cfg.language,
  });
  const cart = cartCreate.cart;
  localStorage.setItem(CART_KEY, cart.id);
  cartState = cart;
  emit();
  return cart;
}

async function addLine(variantId, quantity = 1) {
  const cart = await ensureCart();
  const { cartLinesAdd } = await gql(M_CART_LINES_ADD, {
    cartId: cart.id,
    lines: [{ merchandiseId: variantId, quantity }],
  });
  if (cartLinesAdd.userErrors.length) {
    throw new Error(cartLinesAdd.userErrors.map((e) => e.message).join('; '));
  }
  cartState = cartLinesAdd.cart;
  emit();
  return cartState;
}

async function updateLine(lineId, quantity) {
  const cart = await ensureCart();
  const { cartLinesUpdate } = await gql(M_CART_LINES_UPDATE, {
    cartId: cart.id,
    lines: [{ id: lineId, quantity }],
  });
  cartState = cartLinesUpdate.cart;
  emit();
  return cartState;
}

async function removeLine(lineId) {
  const cart = await ensureCart();
  const { cartLinesRemove } = await gql(M_CART_LINES_REMOVE, {
    cartId: cart.id,
    lineIds: [lineId],
  });
  cartState = cartLinesRemove.cart;
  emit();
  return cartState;
}

function onCartChange(fn) {
  cartListeners.add(fn);
  if (cartState) fn(cartState);
  return () => cartListeners.delete(fn);
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function money(m) {
  if (!m) return '';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: m.currencyCode,
  }).format(parseFloat(m.amount));
}

function findVariant(product, selected) {
  return product.variants.nodes.find((v) =>
    v.selectedOptions.every((o) => selected[o.name] === o.value),
  );
}

// ---------------------------------------------------------------------------
// Renderers — intentionally minimal markup so Webflow CSS can override
// ---------------------------------------------------------------------------

function renderProduct(host, product) {
  if (!product) {
    host.innerHTML = '<p class="of-empty">Product not found.</p>';
    return;
  }
  const initialSelected = Object.fromEntries(
    product.options.map((o) => [o.name, o.values[0]]),
  );
  let selected = { ...initialSelected };

  host.classList.add('of-product');
  host.innerHTML = `
    <div class="of-product__media">
      <img class="of-product__image"
        src="${product.featuredImage?.url ?? ''}"
        alt="${product.featuredImage?.altText ?? product.title}">
    </div>
    <div class="of-product__info">
      <h1 class="of-product__title">${product.title}</h1>
      <div class="of-product__price" data-of-price></div>
      <div class="of-product__options"></div>
      <div class="of-product__quantity">
        <label>Qty <input type="number" min="1" value="1" data-of-qty></label>
      </div>
      <button class="of-product__add" data-of-add disabled>Add to cart</button>
      <div class="of-product__description">${product.descriptionHtml ?? ''}</div>
    </div>
  `;

  const optionsRoot = host.querySelector('.of-product__options');
  for (const opt of product.options) {
    const wrap = document.createElement('div');
    wrap.className = 'of-product__option';
    wrap.innerHTML = `<span class="of-product__option-label">${opt.name}</span>`;
    const group = document.createElement('div');
    group.className = 'of-product__option-values';
    for (const value of opt.values) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'of-product__option-value';
      btn.textContent = value;
      btn.dataset.optionName = opt.name;
      btn.dataset.optionValue = value;
      if (selected[opt.name] === value) btn.setAttribute('aria-pressed', 'true');
      btn.addEventListener('click', () => {
        selected[opt.name] = value;
        for (const sib of group.children) {
          sib.setAttribute(
            'aria-pressed',
            sib.dataset.optionValue === value ? 'true' : 'false',
          );
        }
        updateForSelection();
      });
      group.appendChild(btn);
    }
    wrap.appendChild(group);
    optionsRoot.appendChild(wrap);
  }

  const priceEl = host.querySelector('[data-of-price]');
  const addBtn = host.querySelector('[data-of-add]');
  const qtyInput = host.querySelector('[data-of-qty]');

  function updateForSelection() {
    const variant = findVariant(product, selected);
    if (!variant) {
      priceEl.textContent = 'Unavailable';
      addBtn.disabled = true;
      addBtn.dataset.variantId = '';
      return;
    }
    priceEl.textContent = money(variant.price);
    addBtn.disabled = !variant.availableForSale;
    addBtn.dataset.variantId = variant.id;
    addBtn.textContent = variant.availableForSale ? 'Add to cart' : 'Sold out';
  }

  addBtn.addEventListener('click', async () => {
    const id = addBtn.dataset.variantId;
    if (!id) return;
    addBtn.disabled = true;
    const prev = addBtn.textContent;
    addBtn.textContent = 'Adding…';
    try {
      await addLine(id, parseInt(qtyInput.value || '1', 10));
      addBtn.textContent = 'Added ✓';
      openDrawer();
      setTimeout(() => {
        addBtn.textContent = prev;
        addBtn.disabled = false;
      }, 1200);
    } catch (e) {
      console.error(e);
      addBtn.textContent = 'Error — retry';
      addBtn.disabled = false;
    }
  });

  updateForSelection();
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function mountSearch(host) {
  host.classList.add('of-search');
  host.innerHTML = `
    <input type="search" class="of-search__input"
      placeholder="Search products…" autocomplete="off"
      aria-label="Search">
    <div class="of-search__results" hidden>
      <ul class="of-search__products"></ul>
      <ul class="of-search__queries"></ul>
    </div>
  `;
  const input = host.querySelector('.of-search__input');
  const panel = host.querySelector('.of-search__results');
  const productsUl = host.querySelector('.of-search__products');
  const queriesUl = host.querySelector('.of-search__queries');

  const run = debounce(async (q) => {
    if (!q || q.length < 2) {
      panel.hidden = true;
      return;
    }
    try {
      const { predictiveSearch } = await gql(Q_PREDICTIVE_SEARCH, {
        q,
        country: cfg.country,
        language: cfg.language,
      });
      productsUl.innerHTML = predictiveSearch.products.map((p) => `
        <li class="of-search__product">
          <a href="/product/${p.handle}">
            <img src="${p.featuredImage?.url ?? ''}" alt="${p.featuredImage?.altText ?? ''}">
            <span class="of-search__product-title">${p.title}</span>
            <span class="of-search__product-price">${money(p.priceRange.minVariantPrice)}</span>
          </a>
        </li>`).join('');
      queriesUl.innerHTML = predictiveSearch.queries.map((q) =>
        `<li class="of-search__query"><a href="/search?q=${encodeURIComponent(q.text)}">${q.styledText ?? q.text}</a></li>`
      ).join('');
      panel.hidden =
        predictiveSearch.products.length === 0 &&
        predictiveSearch.queries.length === 0;
    } catch (e) {
      console.error('[omniflex] search failed', e);
    }
  }, 200);

  input.addEventListener('input', (e) => run(e.target.value.trim()));
  input.addEventListener('focus', () => {
    if (input.value.trim().length >= 2) panel.hidden = false;
  });
  document.addEventListener('click', (e) => {
    if (!host.contains(e.target)) panel.hidden = true;
  });
}

function injectProductJsonLd(product) {
  if (!product) return;
  // Webflow does not SSR Shopify product data, so search engines will only
  // see structured data if we inject it client-side. Googlebot reliably
  // executes JS for JSON-LD; other crawlers vary. For tighter SEO, render
  // these tags from a Cloudflare Worker that proxies the Webflow PDP.
  const offers = product.variants.nodes.map((v) => ({
    '@type': 'Offer',
    sku: v.id,
    price: v.price.amount,
    priceCurrency: v.price.currencyCode,
    availability: v.availableForSale
      ? 'https://schema.org/InStock'
      : 'https://schema.org/OutOfStock',
    url: location.href,
  }));
  const ld = {
    '@context': 'https://schema.org/',
    '@type': 'Product',
    name: product.title,
    description: product.description,
    image: product.images.nodes.map((i) => i.url),
    sku: product.id,
    offers: offers.length === 1 ? offers[0] : offers,
  };
  document.querySelectorAll('script[data-of-jsonld]').forEach((n) => n.remove());
  const tag = document.createElement('script');
  tag.type = 'application/ld+json';
  tag.dataset.ofJsonld = 'product';
  tag.textContent = JSON.stringify(ld);
  document.head.appendChild(tag);
}

function renderCollection(host, collection) {
  if (!collection) {
    host.innerHTML = '<p class="of-empty">Collection not found.</p>';
    return;
  }
  host.classList.add('of-collection');
  host.innerHTML = `
    <header class="of-collection__header">
      <h1 class="of-collection__title">${collection.title}</h1>
    </header>
    <ul class="of-collection__grid">
      ${collection.products.nodes
        .map(
          (p) => `
        <li class="of-collection__card">
          <a class="of-collection__link" href="/product/${p.handle}">
            <img class="of-collection__image"
              src="${p.featuredImage?.url ?? ''}"
              alt="${p.featuredImage?.altText ?? p.title}">
            <h2 class="of-collection__name">${p.title}</h2>
            <div class="of-collection__price">${money(p.priceRange.minVariantPrice)}</div>
          </a>
        </li>`,
        )
        .join('')}
    </ul>
  `;
}

// ---------------------------------------------------------------------------
// Cart drawer (DOM injected once, site-wide)
// ---------------------------------------------------------------------------

let drawerEl;

function ensureDrawer() {
  if (drawerEl) return drawerEl;
  drawerEl = document.createElement('aside');
  drawerEl.className = 'of-drawer';
  drawerEl.setAttribute('aria-hidden', 'true');
  drawerEl.innerHTML = `
    <div class="of-drawer__scrim" data-of-drawer-close></div>
    <div class="of-drawer__panel" role="dialog" aria-label="Shopping cart">
      <header class="of-drawer__header">
        <h2>Your cart</h2>
        <button class="of-drawer__close" data-of-drawer-close aria-label="Close">×</button>
      </header>
      <ul class="of-drawer__lines" data-of-drawer-lines></ul>
      <footer class="of-drawer__footer">
        <div class="of-drawer__subtotal" data-of-drawer-subtotal></div>
        <a class="of-drawer__checkout" data-of-drawer-checkout href="#">Checkout</a>
      </footer>
    </div>
  `;
  document.body.appendChild(drawerEl);
  drawerEl.addEventListener('click', (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.matches('[data-of-drawer-close]')) closeDrawer();
    const removeBtn = t.closest('[data-of-line-remove]');
    if (removeBtn) {
      removeLine(removeBtn.dataset.lineId).catch(console.error);
    }
  });
  drawerEl.addEventListener('change', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement)) return;
    if (t.matches('[data-of-line-qty]')) {
      const q = Math.max(0, parseInt(t.value || '0', 10));
      updateLine(t.dataset.lineId, q).catch(console.error);
    }
  });
  return drawerEl;
}

function openDrawer() {
  ensureDrawer().setAttribute('aria-hidden', 'false');
}
function closeDrawer() {
  ensureDrawer().setAttribute('aria-hidden', 'true');
}

function paintDrawer(cart) {
  const root = ensureDrawer();
  const lines = root.querySelector('[data-of-drawer-lines]');
  const subtotal = root.querySelector('[data-of-drawer-subtotal]');
  const checkout = root.querySelector('[data-of-drawer-checkout]');
  if (!cart || cart.lines.nodes.length === 0) {
    lines.innerHTML = '<li class="of-drawer__empty">Your cart is empty.</li>';
    subtotal.textContent = '';
    checkout.removeAttribute('href');
    return;
  }
  lines.innerHTML = cart.lines.nodes
    .map((l) => {
      const v = l.merchandise;
      return `
      <li class="of-drawer__line">
        <img src="${v.image?.url ?? ''}" alt="${v.image?.altText ?? ''}" class="of-drawer__line-image">
        <div class="of-drawer__line-body">
          <div class="of-drawer__line-title">${v.product.title}</div>
          <div class="of-drawer__line-variant">${v.title === 'Default Title' ? '' : v.title}</div>
          <div class="of-drawer__line-controls">
            <input type="number" min="0" value="${l.quantity}"
              data-of-line-qty data-line-id="${l.id}" class="of-drawer__line-qty">
            <button data-of-line-remove data-line-id="${l.id}" class="of-drawer__line-remove">Remove</button>
          </div>
        </div>
        <div class="of-drawer__line-price">${money(l.cost.totalAmount)}</div>
      </li>`;
    })
    .join('');
  subtotal.textContent = `Subtotal: ${money(cart.cost.subtotalAmount)}`;
  checkout.setAttribute('href', cart.checkoutUrl);
}

// ---------------------------------------------------------------------------
// Auto-mount
// ---------------------------------------------------------------------------

async function mountAll() {
  // Cart count badges
  const updateCounts = (cart) => {
    const n = cart?.totalQuantity ?? 0;
    for (const el of document.querySelectorAll('[data-of-cart-count]')) {
      el.textContent = String(n);
    }
  };
  onCartChange((c) => {
    updateCounts(c);
    paintDrawer(c);
  });

  // Cart toggles
  for (const el of document.querySelectorAll('[data-of-cart-toggle]')) {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      openDrawer();
    });
  }

  // Generic add-to-cart buttons (used inside Webflow CMS-templated grids)
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest?.('[data-of-add-to-cart]');
    if (!btn) return;
    e.preventDefault();
    const variantId = btn.dataset.ofVariantId;
    if (variantId) {
      try {
        await addLine(variantId, 1);
        openDrawer();
      } catch (err) {
        console.error(err);
      }
      return;
    }
    const handle = btn.dataset.ofHandle;
    if (!handle) return;
    const { product } = await gql(Q_PRODUCT, {
      handle,
      country: cfg.country,
      language: cfg.language,
    });
    const firstAvailable = product?.variants.nodes.find((v) => v.availableForSale);
    if (firstAvailable) {
      await addLine(firstAvailable.id, 1);
      openDrawer();
    }
  });

  // PDP mounts
  for (const host of document.querySelectorAll('[data-of-product]')) {
    const handle = host.getAttribute('data-of-product');
    try {
      const { product } = await gql(Q_PRODUCT, {
        handle,
        country: cfg.country,
        language: cfg.language,
      });
      renderProduct(host, product);
      injectProductJsonLd(product);
    } catch (e) {
      console.error('[omniflex] PDP failed', handle, e);
    }
  }

  // Search mounts
  for (const host of document.querySelectorAll('[data-of-search]')) {
    mountSearch(host);
  }

  // PLP mounts
  for (const host of document.querySelectorAll('[data-of-collection]')) {
    const handle = host.getAttribute('data-of-collection');
    const limit = parseInt(host.getAttribute('data-of-limit') || '24', 10);
    try {
      const { collection } = await gql(Q_COLLECTION, {
        handle,
        first: limit,
        country: cfg.country,
        language: cfg.language,
      });
      renderCollection(host, collection);
    } catch (e) {
      console.error('[omniflex] PLP failed', handle, e);
    }
  }

  // Hydrate cart on first paint so badges reflect persisted state
  await loadCart().catch(console.warn);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountAll);
} else {
  mountAll();
}

// Public API for ad-hoc use from page-level Webflow scripts
window.OmniFlex = {
  addLine,
  updateLine,
  removeLine,
  ensureCart,
  loadCart,
  onCartChange,
  openDrawer,
  closeDrawer,
  gql,
};
