/* Optional public-shell cache. Registration requires a user click. Photos, API calls,
 * queries and model files are never cached here. No automatic skipWaiting or claim.
 * Author: John Khan. */
"use strict";
importScripts("offline-manifest.js");
// Works at the domain root or under a sub-path such as /beljour-app/.
const BASE_PATH = new URL("./", self.location.href).pathname;
const scoped = (path) => BASE_PATH + path.slice(1);
const inventory = self.BELJOUR_OFFLINE;
const CACHE_PREFIX = "beljour-public-shell-";
if (!inventory || !/^[a-f0-9]{24}$/.test(inventory.version) || !Array.isArray(inventory.assets)) throw new Error("Invalid offline inventory");
const assets = new Map();
for (const row of inventory.assets) {
  if (!row || typeof row.path !== "string" || !/^\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+$/.test(row.path) ||
    /^\/(?:api|models|photos)(?:\/|$)/.test(row.path) || !/\.(?:js|css|html|svg|webmanifest|jpeg)$/.test(row.path) ||
    !/^[a-f0-9]{64}$/.test(row.sha256) || !Number.isInteger(row.bytes) || row.bytes < 1 || row.bytes > 4 * 1024 * 1024 ||
    assets.has(scoped(row.path))) throw new Error("Unsafe offline asset");
  assets.set(scoped(row.path), row);
}
const CACHE_NAME = CACHE_PREFIX + inventory.version;
function allowedRequest(request) {
  if (request.method !== "GET" || request.headers.has("authorization") || request.headers.has("range")) return false;
  const url = new URL(request.url);
  return url.origin === self.location.origin && !url.search && !url.hash && assets.has(url.pathname);
}
async function verifiedResponse(row) {
  const url = new URL(scoped(row.path), self.location.origin).href;
  const response = await fetch(new Request(url, { credentials: "omit", redirect: "error", cache: "reload", mode: "same-origin" }));
  if (!response.ok || response.status !== 200 || response.type === "opaque" || response.redirected ||
    response.headers.has("set-cookie") || response.headers.get("vary") === "*") throw new Error("Offline asset refused");
  const bytes = await response.clone().arrayBuffer();
  if (bytes.byteLength !== row.bytes) throw new Error("Offline asset size differs");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
  if (hex !== row.sha256) throw new Error("Offline asset hash differs");
  return response;
}
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const existed = (await caches.keys()).includes(CACHE_NAME);
    const cache = await caches.open(CACHE_NAME);
    try {
      for (const row of assets.values()) await cache.put(new URL(scoped(row.path), self.location.origin).href, await verifiedResponse(row));
    } catch (error) {
      if (!existed) await caches.delete(CACHE_NAME);
      throw error;
    }
  })());
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME) await caches.delete(name);
    // Existing editing tabs keep their current controller until navigation.
  })());
});
self.addEventListener("fetch", (event) => {
  if (!allowedRequest(event.request)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    return await cache.match(new URL(event.request.url).href) || fetch(event.request);
  })());
});
self.addEventListener("message", (event) => {
  if (event.data?.type !== "BELJOUR_ACTIVATE_AFTER_SAVE" || !event.source?.id) return;
  event.waitUntil((async () => {
    const client = await self.clients.get(event.source.id);
    if (!client || client.type !== "window") return;
    const url = new URL(client.url);
    if (url.origin === self.location.origin && assets.has(url.pathname) && url.pathname.endsWith(".html")) await self.skipWaiting();
  })());
});
