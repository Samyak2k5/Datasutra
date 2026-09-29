export function isOriginAllowed(origin, config) {
  if (!origin) return true; // Non-browser clients still require normal authentication.
  if (Array.isArray(config.corsOrigin) && config.corsOrigin.includes(origin)) return true;
  if (!config.isDevelopment) return false;
  try {
    const url = new URL(origin);
    return url.origin === origin && ['http:', 'https:'].includes(url.protocol)
      && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch { return false; }
}
