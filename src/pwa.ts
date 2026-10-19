export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return

  const capacitor = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  if (capacitor?.isNativePlatform?.()) return

  window.addEventListener('load', () => {
    const worker = new URL(`${import.meta.env.BASE_URL}sw.js`, window.location.href)
    const scope = new URL(import.meta.env.BASE_URL, window.location.href)
    navigator.serviceWorker.register(worker, { scope: scope.href }).catch((error: unknown) => {
      console.error('Service worker registration failed', error)
    })
  })
}
