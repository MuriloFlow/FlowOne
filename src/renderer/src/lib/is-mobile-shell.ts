export function isMobileShell(): boolean {
  if (import.meta.env.VITE_FLOW_SHELL === 'mobile') return true
  return typeof document !== 'undefined' && document.documentElement.classList.contains('flow-mobile-shell')
}
