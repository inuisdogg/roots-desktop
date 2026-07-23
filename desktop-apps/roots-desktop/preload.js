// ============================================================================
// ROOTS デスクトップ — preload (contextIsolation 下で安全に橋渡し)
//   Web 側が「デスクトップアプリ内か」を判定したり、バージョンを取れるよう最小限だけ公開する。
//   Node の生 API はレンダラに一切渡さない。
//
// 追加(2026-07-22): 画面左上に控えめな「戻る」オーバーレイボタンを注入する。
//   - Web アプリ側は殻を意識しないので、戻る導線が無い画面でも殻側で必ず戻れるようにする。
//   - 表示条件 = 履歴で戻れるとき(main プロセスの webContents.navigationHistory.canGoBack が正)。
//     canGoBack の判定は main から IPC で受け取り、ボタンの表示/非表示を切り替える。
//   - クリック = 殻側で goBack を実行(history.back() 相当だが、SPA でも確実な main 側 goBack を使う)。
// ============================================================================
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rootsDesktop', {
  isDesktopApp: true,
  platform: process.platform,        // 'darwin' | 'win32'
  version: process.versions.electron, // 参考(殻のElectronバージョン)
});

// ---- 戻るオーバーレイボタンの注入 -----------------------------------------
// preload は isolated world で走るが DOM への参照は本物なので、直接 body に挿す。
// スタイルは Web アプリの CSS と衝突しないよう固有 id + 直接指定で閉じる。
const BTN_ID = '__roots-desktop-back-btn';

function injectBackButton() {
  if (!document.body) return;
  if (document.getElementById(BTN_ID)) return;

  const btn = document.createElement('button');
  btn.id = BTN_ID;
  btn.type = 'button';
  btn.setAttribute('aria-label', '戻る');
  btn.title = '戻る';
  // ◀(控えめな三角)。SVG で描いて字体差を無くす。
  btn.innerHTML =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
    '<path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2.2" ' +
    'stroke-linecap="round" stroke-linejoin="round"/></svg>';

  Object.assign(btn.style, {
    position: 'fixed',
    // アプリ自身のヘッダー操作に被らないよう、左端・上端から少し下げる。
    // env(safe-area-inset-*) でノッチ/丸角にも配慮(mac の信号機ボタンとは左右で分離)。
    top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
    left: 'calc(env(safe-area-inset-left, 0px) + 12px)',
    width: '36px',
    height: '36px',
    display: 'none',                 // 既定は非表示。canGoBack=true で表示。
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0',
    margin: '0',
    border: '1px solid rgba(26,43,51,0.10)',
    borderRadius: '18px',            // pill(丸)
    background: 'rgba(255,255,255,0.72)',
    color: '#1A2B33',
    boxShadow: '0 1px 4px rgba(0,0,0,0.10)',
    cursor: 'pointer',
    zIndex: '2147483646',            // ほぼ最前面(最大 z-index の一つ下)
    opacity: '0.62',                 // 控えめ(半透明)
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    transition: 'opacity 120ms ease',
    WebkitAppRegion: 'no-drag',      // ドラッグ領域(タイトルバー)と衝突させない
    lineHeight: '0',
    fontSize: '0',
  });

  btn.addEventListener('mouseenter', () => { btn.style.opacity = '1'; });
  btn.addEventListener('mouseleave', () => { btn.style.opacity = '0.62'; });
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    // main 側の goBack を優先(SPA/リダイレクト後でも確実)。失敗時のみ history.back()。
    ipcRenderer.send('roots-nav:back');
  });

  document.body.appendChild(btn);
}

function setBackVisible(canGoBack) {
  const btn = document.getElementById(BTN_ID);
  if (!btn) return;
  btn.style.display = canGoBack ? 'flex' : 'none';
}

// main から canGoBack の変化を受け取り、表示を切り替える。
ipcRenderer.on('roots-nav:can-go-back', (_e, canGoBack) => {
  injectBackButton();             // まだ無ければ生やす(SPA 遷移で body が入れ替わっても復活)
  setBackVisible(!!canGoBack);
});

// 初期化。DOM 準備後にボタンを注入し、現在の canGoBack を main に問い合わせる。
function boot() {
  injectBackButton();
  // 現在値を main に要求(送り返しは 'roots-nav:can-go-back' で来る)。
  ipcRenderer.send('roots-nav:query-can-go-back');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
