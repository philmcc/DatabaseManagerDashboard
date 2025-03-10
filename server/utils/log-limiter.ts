// Simple in-memory cache for rate limiting logs
const logCache: Record<string, number> = {};

// Clear the cache every hour
setInterval(() => {
  Object.keys(logCache).forEach(key => {
    delete logCache[key];
  });
}, 60 * 60 * 1000);

/**
 * Only log if the same message hasn't been logged in the last `limitMs` milliseconds
 */
export function rateLimitLog(key: string, logFn: () => void, limitMs = 60000) {
  const now = Date.now();
  const lastLog = logCache[key] || 0;
  
  if (now - lastLog > limitMs) {
    logFn();
    logCache[key] = now;
  }
} 