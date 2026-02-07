function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

export function buildServiceWorkerUrl(
  baseUrl: string = import.meta.env.BASE_URL,
): string {
  return `${normalizeBaseUrl(baseUrl)}sw.js`;
}

export function registerServiceWorker(
  baseUrl: string = import.meta.env.BASE_URL,
): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }
  if (!("serviceWorker" in navigator)) {
    return;
  }

  const serviceWorkerUrl = buildServiceWorkerUrl(baseUrl);
  const register = (): void => {
    void navigator.serviceWorker.register(serviceWorkerUrl).catch(() => {
      // Registration errors are non-fatal for app runtime.
    });
  };

  if (document.readyState === "complete") {
    register();
    return;
  }

  window.addEventListener("load", register, { once: true });
}
