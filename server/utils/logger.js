"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.safeLog = safeLog;
// Set the minimum log level based on environment
var currentLogLevel = process.env.LOG_LEVEL ||
    (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
var logLevels = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3
};
function shouldLog(level) {
    return logLevels[level] <= logLevels[currentLogLevel];
}
exports.logger = {
    error: function (message) {
        var meta = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            meta[_i - 1] = arguments[_i];
        }
        if (shouldLog('error')) {
            console.error.apply(console, __spreadArray(["ERROR: ".concat(message)], meta, false));
        }
    },
    warn: function (message) {
        var meta = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            meta[_i - 1] = arguments[_i];
        }
        if (shouldLog('warn')) {
            console.warn.apply(console, __spreadArray(["WARN: ".concat(message)], meta, false));
        }
    },
    info: function (message) {
        var meta = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            meta[_i - 1] = arguments[_i];
        }
        if (shouldLog('info')) {
            console.log.apply(console, __spreadArray(["INFO: ".concat(message)], meta, false));
        }
    },
    debug: function (message) {
        var meta = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            meta[_i - 1] = arguments[_i];
        }
        if (shouldLog('debug')) {
            console.log.apply(console, __spreadArray(["DEBUG: ".concat(message)], meta, false));
        }
    },
    // Special method for API logging with a simplified format
    api: function (req, statusCode) {
        if (shouldLog('info')) {
            // More concise format for API logs
            var message = statusCode
                ? "API ".concat(req.method, " ").concat(req.path, " \u2192 ").concat(statusCode)
                : "API ".concat(req.method, " ").concat(req.path);
            console.log(message);
        }
    }
};
// Function to redact sensitive data
function redactSensitiveData(obj) {
    if (!obj)
        return obj;
    if (typeof obj !== 'object')
        return obj;
    // Handle arrays
    if (Array.isArray(obj)) {
        return obj.map(function (item) { return redactSensitiveData(item); });
    }
    // Handle objects
    var result = __assign({}, obj);
    // List of sensitive fields to redact
    var sensitiveFields = [
        'password', 'token', 'secret', 'apiKey', 'key', 'hash', 'credential',
        'resetToken', 'resetTokenExpiry'
    ];
    Object.keys(result).forEach(function (key) {
        // Redact sensitive fields
        if (sensitiveFields.some(function (field) { return key.toLowerCase().includes(field); })) {
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
function safeLog(level, message, data) {
    if (data) {
        var safeData = redactSensitiveData(data);
        if (level === 'error')
            exports.logger.error(message, safeData);
        else if (level === 'warn')
            exports.logger.warn(message, safeData);
        else if (level === 'info')
            exports.logger.info(message, safeData);
        else
            exports.logger.debug(message, safeData);
    }
    else {
        if (level === 'error')
            exports.logger.error(message);
        else if (level === 'warn')
            exports.logger.warn(message);
        else if (level === 'info')
            exports.logger.info(message);
        else
            exports.logger.debug(message);
    }
}
