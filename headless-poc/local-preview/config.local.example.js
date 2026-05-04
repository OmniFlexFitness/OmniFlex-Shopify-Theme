/*
 * Copy to config.local.js and fill in. config.local.js is gitignored.
 *
 * Sets <meta> values at runtime so the storefront token never lands in
 * committed HTML. Loads BEFORE omniflex-headless.js (see _head.html).
 */
const set = (name, content) => {
  let m = document.querySelector(`meta[name="${name}"]`);
  if (!m) {
    m = document.createElement('meta');
    m.name = name;
    document.head.appendChild(m);
  }
  m.content = content;
};

set('of-shop',  'YOUR-STORE.myshopify.com');
set('of-token', 'YOUR-PUBLIC-STOREFRONT-TOKEN');
// Optional locale override:
// set('of-country',  'US');
// set('of-language', 'EN');
