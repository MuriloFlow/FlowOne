; electron-updater always passes --updated, even when the running app
; does not add /S (FLOW 1.0.1 used quitAndInstall(false, true)).
; SetSilent here skips the assisted wizard on in-place upgrades only.
; First-time install still shows the NSIS pages.
!macro customInit
  ${if} ${isUpdated}
    SetSilent silent
  ${endif}
!macroend
