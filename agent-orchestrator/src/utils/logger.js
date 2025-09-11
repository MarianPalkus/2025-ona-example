// src/utils/logger.js
const levels = ['error', 'warn', 'info', 'debug'];
const current = process.env.LOG_LEVEL || 'info';

function allow(level) {
    return levels.indexOf(level) <= levels.indexOf(current);
}

module.exports = {
    error: (...args) => console.error('[error]', ...args),
    warn:  (...args) => allow('warn')  && console.warn('[warn]', ...args),
    info:  (...args) => allow('info')  && console.log('[info]', ...args),
    debug: (...args) => allow('debug') && console.debug('[debug]', ...args),
};
