// ============================================================================
// ROOTS デスクトップ — preload (contextIsolation 下で安全に橋渡し)
//   Web 側が「デスクトップアプリ内か」を判定したり、バージョンを取れるよう最小限だけ公開する。
//   Node の生 API はレンダラに一切渡さない。
// ============================================================================
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('rootsDesktop', {
  isDesktopApp: true,
  platform: process.platform,        // 'darwin' | 'win32'
  version: process.versions.electron, // 参考(殻のElectronバージョン)
});
