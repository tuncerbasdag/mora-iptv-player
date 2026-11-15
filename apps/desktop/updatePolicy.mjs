/**
 * Güncelleme stratejisi (saf karar, test edilebilir):
 * - 'auto'     : yeni sürüm uygulama içinde indirilip kurulur (Windows; imzalı macOS).
 * - 'manual'   : (kullanılmıyor) yalnızca bildirip indirme sayfasını açma; imzasız macOS artık installMode 'self' ile kendi kurulumunu yapar.
 * - 'disabled' : güncelleme kontrolü yok (geliştirme çalıştırması, paketlenmemiş uygulama).
 */
export function updatePolicy({ platform, packaged, macSigned }) {
  if (!packaged) return 'disabled';
  return 'auto';
}

/**
 * Kurulum yolu: 'native' = electron-updater (Windows; imzalı macOS), 'self' = imzasız macOS için kendi kurulumumuz
 * (Squirrel.Mac imzasız paketi kurmaz; macSelfUpdate.mjs zip'i indirip doğrular, uygulama kapanınca .app'i değiştirir).
 */
export function installMode({ platform, macSigned }) {
  return platform === 'darwin' && !macSigned ? 'self' : 'native';
}
