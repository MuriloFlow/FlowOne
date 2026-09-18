function readEnvInset(edge: 'top' | 'right' | 'bottom' | 'left'): number {
  const probe = document.createElement('div')
  probe.style.cssText = `position:fixed;visibility:hidden;pointer-events:none;padding-${edge}:env(safe-area-inset-${edge}, 0px)`
  document.documentElement.appendChild(probe)
  const value = parseFloat(getComputedStyle(probe).getPropertyValue(`padding-${edge}`)) || 0
  probe.remove()
  return value
}

function isIos(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export function applyMobileSafeArea(): void {
  const root = document.documentElement
  if (!root.classList.contains('flow-mobile-shell')) return

  const ios = isIos()
  let top = readEnvInset('top')
  let right = readEnvInset('right')
  let bottom = readEnvInset('bottom')
  let left = readEnvInset('left')

  if (ios) {
    top = Math.max(top, 20)
    bottom = Math.max(bottom, 16)
  } else {
    // Android WebView em edge-to-edge quase nunca preenche env() na barra de 3 botões.
    if (top < 20) top = 36
    if (bottom < 16) bottom = 48
  }

  root.style.setProperty('--flow-safe-top', `${Math.round(top)}px`)
  root.style.setProperty('--flow-safe-right', `${Math.round(right)}px`)
  root.style.setProperty('--flow-safe-bottom', `${Math.round(bottom)}px`)
  root.style.setProperty('--flow-safe-left', `${Math.round(left)}px`)
}

export function installMobileSafeArea(): void {
  applyMobileSafeArea()
  window.addEventListener('resize', applyMobileSafeArea)
  window.addEventListener('orientationchange', applyMobileSafeArea)
  window.visualViewport?.addEventListener('resize', applyMobileSafeArea)
}
