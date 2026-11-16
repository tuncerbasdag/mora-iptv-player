/**
 * Update strategy (pure decision, testable):
 * - 'auto'     : the new version is downloaded and installed inside the app (Windows; signed macOS).
 * - 'manual'   : (unused) only notify and open the download page; unsigned macOS now installs itself via installMode 'self'.
 * - 'disabled' : no update check (development run, unpackaged app).
 */
export function updatePolicy({ platform, packaged, macSigned }) {
  if (!packaged) return 'disabled';
  return 'auto';
}

/**
 * Install path: 'native' = electron-updater (Windows; signed macOS), 'self' = our own installer for unsigned macOS
 * (Squirrel.Mac does not install an unsigned package; macSelfUpdate.mjs downloads and verifies the zip, then replaces the .app when the app quits).
 */
export function installMode({ platform, macSigned }) {
  return platform === 'darwin' && !macSigned ? 'self' : 'native';
}
