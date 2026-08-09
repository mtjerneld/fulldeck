// Full Deck service worker — caches the app so it works fully offline.
// Bump the version string whenever you upload a new index.html.
const CACHE = "fulldeck-v36";   // keep in step with BUILD in index.html
const ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];
const HTML_WAIT = 4000; // how long a start waits for the network before falling back to the cache

// addAll is all or nothing: one asset that 404s or times out fails the install, the new worker
// is thrown away and the old one keeps serving the old app — for good, retried on every start
// and failing the same way. The page itself is what matters; the rest are cached one by one and
// a straggler is left to the fetch handler to pick up later.
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.add("./index.html").then(() => Promise.all(ASSETS.map((a) => c.add(a).catch(() => {})))))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});
// The whole app is one file, so a stale index.html is a stale app — and served cache first it
// stayed stale for a start or two after every upload, however diligently the version above was
// bumped. Opening the app therefore asks the network first and falls back to the cache, so a
// new version is there the next time you open it. On a gym basement connection the wait is
// capped rather than left to the browser, and offline it fails at once and the cache answers.
// Everything else — icons, the manifest — is cache first, where it belongs.
function fresh(request) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("slow network")), HTML_WAIT);
    fetch(request).then(
      (res) => { clearTimeout(timer); resolve(res); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  if (e.request.mode === "navigate") {
    e.respondWith(
      fresh(e.request).then((res) => {
        // a redirected response cannot be replayed for a later navigation, and an error page
        // is not worth keeping either
        if (res.ok && !res.redirected) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("./index.html", copy));
        }
        return res;
      }).catch(() => caches.match("./index.html").then((hit) => hit || caches.match("./")))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match("./index.html")))
  );
});
