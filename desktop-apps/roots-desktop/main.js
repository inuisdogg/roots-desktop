// ============================================================================
// ROOTS デスクトップアプリ (Windows / macOS) — メインプロセス
//
// 設計方針(2026-07-19): 既存の Web アプリ(rootshub.jp)をネイティブの「薄い殻」で包む。
//   - 画面・機能は Web をそのまま読むので、Web をデプロイした瞬間に全デスクトップが最新になる
//     (= コンテンツは常に最新。殻の再配布は不要)。
//   - 殻自体(ウィンドウ/メニュー/通知/印刷/自動更新)は electron-updater で自動アップデート
//     (配信元 = GitHub Releases)。
//
// 読み込み先:
//   - 既定 = https://rootshub.jp (本番)
//   - 環境変数 ROOTS_DESKTOP_URL で上書き(dev で http://localhost:3000 等を指す)
// ============================================================================

const { app, BrowserWindow, Menu, shell, dialog, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

// 既定は /app(業務のトップ)。未ログインは /login へ、ログイン済みはダッシュボードへ自動遷移する。
const APP_URL = process.env.ROOTS_DESKTOP_URL || 'https://rootshub.jp/app';
const APP_ORIGIN = (() => { try { return new URL(APP_URL).origin; } catch { return 'https://rootshub.jp'; } })();
const IS_DEV = !app.isPackaged;

// 単一インスタンス化(2重起動を防ぎ、既存ウィンドウを前面に)。
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }

// Windows の通知・タスクバー同一性のため AppUserModelID を設定。
app.setAppUserModelId('jp.co.inu.roots.desktop');

let mainWindow = null;

// ---- ウィンドウ位置・サイズの永続化(次回起動時に復元) --------------------
const stateFile = path.join(app.getPath('userData'), 'window-state.json');
function loadWindowState() {
  try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { return {}; }
}
function saveWindowState(win) {
  if (!win || win.isDestroyed()) return;
  try {
    const b = win.getBounds();
    fs.writeFileSync(stateFile, JSON.stringify({ ...b, maximized: win.isMaximized() }));
  } catch { /* 保存失敗は無視 */ }
}

function createWindow() {
  const st = loadWindowState();
  mainWindow = new BrowserWindow({
    width: st.width || 1280,
    height: st.height || 860,
    x: st.x,
    y: st.y,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#F4F7F8',
    title: 'ROOTS',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,      // レンダラから Node を隔離(セキュア)
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      // ログイン等を保持する永続セッション。既定パーティションでも良いが明示する。
      partition: 'persist:roots',
    },
    show: false,
  });

  if (st.maximized) mainWindow.maximize();

  // Web 側が「デスクトップアプリ」を検知できるよう UA に印を付ける(ネイティブ/個人端末判定は誘発しない)。
  const ua = mainWindow.webContents.getUserAgent() + ` RootsDesktop/${app.getVersion()}`;
  mainWindow.webContents.setUserAgent(ua);

  mainWindow.loadURL(APP_URL, { userAgent: ua });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // 外部ドメインのリンク・target=_blank は既定ブラウザで開く(アプリ内は自ドメインに限定)。
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try { if (new URL(url).origin !== APP_ORIGIN) { shell.openExternal(url); return { action: 'deny' }; } } catch { /* noop */ }
    return { action: 'allow' };
  });
  mainWindow.webContents.on('will-navigate', (e, url) => {
    try {
      if (new URL(url).origin !== APP_ORIGIN) { e.preventDefault(); shell.openExternal(url); }
    } catch { /* noop */ }
  });

  // 読み込み失敗(オフライン等)時のフォールバック表示。
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, validatedURL, isMainFrame) => {
    if (!isMainFrame || code === -3 /* ABORTED */) return;
    const html = `<!doctype html><meta charset="utf-8">
      <style>body{font-family:-apple-system,'Segoe UI',sans-serif;background:#F4F7F8;color:#1A2B33;
      display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}
      h1{font-size:18px;margin:0 0 8px} p{color:#5B6B73;font-size:13px;margin:2px} button{margin-top:16px;
      padding:10px 20px;border:0;border-radius:10px;background:#00C4CC;color:#fff;font-weight:700;font-size:14px;cursor:pointer}</style>
      <h1>接続できませんでした</h1><p>インターネット接続をご確認ください。</p><p style="font-size:11px;color:#9CA3AF">${desc}</p>
      <button onclick="location.replace('${APP_URL}')">再読み込み</button>`;
    mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  });

  const persist = () => saveWindowState(mainWindow);
  mainWindow.on('resize', persist);
  mainWindow.on('move', persist);
  mainWindow.on('close', persist);
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ---- アプリメニュー --------------------------------------------------------
function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{
      label: 'ROOTS',
      submenu: [
        { role: 'about', label: 'ROOTS について' },
        { label: '更新を確認…', click: () => checkForUpdates(true) },
        { type: 'separator' },
        { role: 'services', label: 'サービス' },
        { type: 'separator' },
        { role: 'hide', label: 'ROOTS を隠す' },
        { role: 'hideOthers', label: 'ほかを隠す' },
        { role: 'unhide', label: 'すべて表示' },
        { type: 'separator' },
        { role: 'quit', label: 'ROOTS を終了' },
      ],
    }] : []),
    {
      label: 'ファイル',
      submenu: [
        ...(isMac ? [] : [{ label: '更新を確認…', click: () => checkForUpdates(true) }, { type: 'separator' }]),
        isMac ? { role: 'close', label: 'ウィンドウを閉じる' } : { role: 'quit', label: '終了' },
      ],
    },
    {
      label: '編集',
      submenu: [
        { role: 'undo', label: '取り消す' }, { role: 'redo', label: 'やり直す' }, { type: 'separator' },
        { role: 'cut', label: '切り取り' }, { role: 'copy', label: 'コピー' }, { role: 'paste', label: '貼り付け' },
        { role: 'selectAll', label: 'すべて選択' },
      ],
    },
    {
      label: '表示',
      submenu: [
        { role: 'reload', label: '再読み込み' },
        { role: 'forceReload', label: '強制的に再読み込み' },
        { type: 'separator' },
        { role: 'resetZoom', label: '実際のサイズ' },
        { role: 'zoomIn', label: '拡大' },
        { role: 'zoomOut', label: '縮小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'フルスクリーン' },
        ...(IS_DEV ? [{ type: 'separator' }, { role: 'toggleDevTools', label: '開発者ツール' }] : []),
      ],
    },
    { label: 'ウィンドウ', submenu: [{ role: 'minimize', label: '最小化' }, { role: 'zoom', label: 'ズーム' }] },
    {
      label: 'ヘルプ',
      submenu: [
        { label: 'ROOTS を開く', click: () => shell.openExternal('https://rootshub.jp') },
        { label: 'サポート', click: () => shell.openExternal('https://rootshub.jp/contact') },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---- 自動アップデート(electron-updater / GitHub Releases) ------------------
// パッケージ版でのみ動作。dev(未パッケージ)ではスキップ。
let autoUpdater = null;
function initUpdater() {
  if (IS_DEV) return;
  try {
    ({ autoUpdater } = require('electron-updater'));
    autoUpdater.autoDownload = true;
    autoUpdater.on('update-downloaded', (info) => {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        buttons: ['再起動して更新', 'あとで'],
        defaultId: 0,
        cancelId: 1,
        title: '更新の準備ができました',
        message: `新しいバージョン ${info?.version ?? ''} をダウンロードしました。`,
        detail: '再起動すると更新が適用されます。',
      }).then((r) => { if (r.response === 0) autoUpdater.quitAndInstall(); });
    });
    autoUpdater.on('error', (err) => { console.error('[updater]', err); });
    // 起動時 + 6時間ごとに確認。
    autoUpdater.checkForUpdates();
    setInterval(() => autoUpdater.checkForUpdates(), 6 * 60 * 60 * 1000);
  } catch (e) { console.error('[updater] init failed', e); }
}
function checkForUpdates(interactive) {
  if (IS_DEV) {
    if (interactive) dialog.showMessageBox(mainWindow, { message: '開発版では更新確認は行いません。', buttons: ['OK'] });
    return;
  }
  if (!autoUpdater) return;
  autoUpdater.checkForUpdates().then((r) => {
    if (interactive && !r?.updateInfo) {
      dialog.showMessageBox(mainWindow, { message: '最新版をご利用中です。', buttons: ['OK'] });
    }
  }).catch(() => {});
}

// ---- ライフサイクル --------------------------------------------------------
app.on('second-instance', () => {
  if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
});

app.whenReady().then(() => {
  // 通知の許可等はレンダラ(Web)側の Notification API に委ねる(Chromium 既定で動作)。
  buildMenu();
  createWindow();
  initUpdater();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
