type LogLevel = 'error' | 'warn' | 'info' | 'debug';

// Set the minimum log level based on environment
const currentLogLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 
  (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

const logLevels: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

function shouldLog(level: LogLevel): boolean {
  return logLevels[level] <= logLevels[currentLogLevel];
}

export const logger = {
  error: (message: string, ...meta: any[]) => {
    if (shouldLog('error')) {
      console.error(`ERROR: ${message}`, ...meta);
    }
  },
  
  warn: (message: string, ...meta: any[]) => {
    if (shouldLog('warn')) {
      console.warn(`WARN: ${message}`, ...meta);
    }
  },
  
  info: (message: string, ...meta: any[]) => {
    if (shouldLog('info')) {
      console.log(`INFO: ${message}`, ...meta);
    }
  },
  
  debug: (message: string, ...meta: any[]) => {
    if (shouldLog('debug')) {
      console.log(`DEBUG: ${message}`, ...meta);
    }
  },
  
  // Special method for API logging with a simplified format
  api: (req: { method: string, path: string }, statusCode?: number) => {
    if (shouldLog('info')) {
      // More concise format for API logs
      const message = statusCode 
        ? `API ${req.method} ${req.path} → ${statusCode}`
        : `API ${req.method} ${req.path}`;
      console.log(message);
    }
  }
};

// Function to redact sensitive data
function redactSensitiveData(obj: any): any {
  if (!obj) return obj;
  
  if (typeof obj !== 'object') return obj;
  
  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => redactSensitiveData(item));
  }
  
  // Handle objects
  const result = { ...obj };
  
  // List of sensitive fields to redact
  const sensitiveFields = [
    'password', 'token', 'secret', 'apiKey', 'key', 'hash', 'credential',
    'resetToken', 'resetTokenExpiry'
  ];
  
  Object.keys(result).forEach(key => {
    // Redact sensitive fields
    if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
      result[key] = '[REDACTED]';
    }
    // Recursively check nested objects
    else if (typeof result[key] === 'object' && result[key] !== null) {
      result[key] = redactSensitiveData(result[key]);
    }
  });
  
  return result;
}

// Add a safe log method that automatically redacts sensitive data
export function safeLog(level: LogLevel, message: string, data?: any) {
  if (data) {
    const safeData = redactSensitiveData(data);
    if (level === 'error') logger.error(message, safeData);
    else if (level === 'warn') logger.warn(message, safeData);
    else if (level === 'info') logger.info(message, safeData);
    else logger.debug(message, safeData);
  } else {
    if (level === 'error') logger.error(message);
    else if (level === 'warn') logger.warn(message);
    else if (level === 'info') logger.info(message);
    else logger.debug(message);
  }
} 