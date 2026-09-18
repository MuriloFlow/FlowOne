const logger = {
  info: (...args: unknown[]) => console.log('[flow-ops]', ...args),
  warn: (...args: unknown[]) => console.warn('[flow-ops]', ...args),
  error: (...args: unknown[]) => console.error('[flow-ops]', ...args),
  debug: (...args: unknown[]) => console.debug('[flow-ops]', ...args)
}

export default logger
