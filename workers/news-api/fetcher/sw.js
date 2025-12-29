/**
 * Vibe Tech News - Service Worker
 * 混合缓存策略：
 * - App Shell (HTML/CSS/JS): Cache First
 * - API Data (/latest): Network First (离线时使用缓存)
 * - External Resources: Stale-While-Revalidate
 */

// ============================================
// 版本控制 - 更新时修改此值以清除旧缓存
// ============================================
const VERSION = 'v1.0.0';
const CACHE_PREFIX = 'vibe-news';

// ============================================
// 缓存名称定义
// ============================================
const CACHE_NAMES = {
  SHELL: `${CACHE_PREFIX}-shell-${VERSION}`,
  API: `${CACHE_PREFIX}-api-${VERSION}`,
  ASSETS: `${CACHE_PREFIX}-assets-${VERSION}`
};

// ============================================
// 缓存资源列表
// ============================================
const SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.json'
];

// ============================================
// 安装事件 - 缓存 App Shell
// ============================================
self.addEventListener('install', (event) => {
  console.log('[SW] Installing version:', VERSION);

  event.waitUntil(
    (async () => {
      const shellCache = await caches.open(CACHE_NAMES.SHELL);

      // 缓存 App Shell 资源
      const shellPromises = SHELL_URLS.map(url => {
        return shellCache.add(url).catch(err => {
          console.warn('[SW] Failed to cache shell:', url, err);
        });
      });

      await Promise.all(shellPromises);
      console.log('[SW] Shell cached successfully');

      // 立即激活新的 Service Worker
      self.skipWaiting();
    })()
  );
});

// ============================================
// 激活事件 - 清理旧缓存
// ============================================
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating version:', VERSION);

  event.waitUntil(
    (async () => {
      // 获取所有缓存
      const cacheNames = await caches.keys();

      // 删除旧版本缓存
      const deletePromises = cacheNames
        .filter(name => name.startsWith(CACHE_PREFIX) && !Object.values(CACHE_NAMES).includes(name))
        .map(name => {
          console.log('[SW] Deleting old cache:', name);
          return caches.delete(name);
        });

      await Promise.all(deletePromises);

      // 立即控制所有页面
      await self.clients.claim();
      console.log('[SW] Activation complete');
    })()
  );
});

// ============================================
// 拦截请求 - 混合缓存策略
// ============================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. 同源请求 - 根据类型选择策略
  if (url.origin === self.location.origin) {
    // HTML 文档 - Network First (确保获取最新内容)
    if (request.destination === 'document') {
      event.respondWith(networkFirstStrategy(request, CACHE_NAMES.SHELL));
      return;
    }

    // API 请求 - Network First (离线时使用缓存)
    if (url.pathname.startsWith('/latest') || url.pathname.startsWith('/stats')) {
      event.respondWith(networkFirstStrategy(request, CACHE_NAMES.API));
      return;
    }

    // 其他静态资源 - Cache First
    event.respondWith(cacheFirstStrategy(request, CACHE_NAMES.ASSETS));
    return;
  }

  // 2. 外部资源 - Stale-While-Revalidate
  event.respondWith(staleWhileRevalidateStrategy(request, CACHE_NAMES.ASSETS));
});

// ============================================
// 缓存策略实现
// ============================================

/**
 * Network First 策略
 * 优先从网络获取，失败时使用缓存
 * 适用于：API 请求、HTML 文档
 */
async function networkFirstStrategy(request, cacheName) {
  const cache = await caches.open(cacheName);

  try {
    // 尝试网络请求
    const networkResponse = await fetch(request);

    // 网络成功，更新缓存
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;

  } catch (error) {
    // 网络失败，尝试使用缓存
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      console.log('[SW] Using cached response for:', request.url);
      return cachedResponse;
    }

    // 缓存也没有，返回离线页面
    return new Response('Offline - No cached data available', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Headers({
        'Content-Type': 'text/plain'
      })
    });
  }
}

/**
 * Cache First 策略
 * 优先使用缓存，缓存不存在时才请求网络
 * 适用于：静态资源 (CSS, JS, Icons)
 */
async function cacheFirstStrategy(request, cacheName) {
  const cache = await caches.open(cacheName);

  // 先检查缓存
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    console.log('[SW] Cache hit for:', request.url);
    return cachedResponse;
  }

  // 缓存未命中，请求网络
  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;

  } catch (error) {
    console.warn('[SW] Network request failed:', request.url, error);
    throw error;
  }
}

/**
 * Stale-While-Revalidate 策略
 * 立即返回缓存（如果存在），同时在后台更新缓存
 * 适用于：外部资源 (Fonts, Images)
 */
async function staleWhileRevalidateStrategy(request, cacheName) {
  const cache = await caches.open(cacheName);

  // 立即从缓存获取
  const cachedResponse = await cache.match(request);

  // 后台更新缓存
  const fetchPromise = fetch(request).then((networkResponse) => {
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch((error) => {
    console.warn('[SW] Background update failed:', request.url, error);
  });

  // 返回缓存或等待网络响应
  return cachedResponse || fetchPromise;
}

// ============================================
// 消息处理 - 支持手动更新
// ============================================
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(name => caches.delete(name))
        );
      })
    );
  }
});
