# ROOTS デスクトップアプリ (Windows / macOS)

既存の Web アプリ（`rootshub.jp`）を **ネイティブの薄い殻（Electron）** で包んだデスクトップ版です。
Windows と macOS の両方に対応し、**自動アップデート**に対応しています。

## なぜ「薄い殻」なのか（＝常に最新版の仕組み）

- **画面・機能は Web をそのまま読む**ので、Web をデプロイした瞬間に**全デスクトップが最新**になります（殻の再配布は不要）。
- **殻そのもの**（ウィンドウ・メニュー・通知・印刷・自動更新）だけを、まれに必要なときに自動アップデートします。
- iOS/Android の統合アプリ（WebView 方式）と同じ考え方で、保守対象を最小にしています。

## 構成

| ファイル | 役割 |
|---|---|
| `main.js` | メインプロセス。ウィンドウ生成／メニュー／外部リンク処理／オフライン表示／自動更新 |
| `preload.js` | レンダラに `window.rootsDesktop`（`isDesktopApp` 等）だけを安全に公開（contextIsolation） |
| `electron-builder.yml` | mac(dmg/zip)・win(nsis) のビルド＆GitHub Releases への publish 設定 |
| `build/icon.png` | アプリアイコン（1024px。electron-builder が各OS用に生成） |
| `build/entitlements.mac.plist` | macOS 公証／Hardened Runtime 用 |
| `../../.github/workflows/desktop-release.yml` | リリース CI（タグ push で mac/win をビルド＆配信） |

読み込み先は既定で `https://rootshub.jp`。環境変数 `ROOTS_DESKTOP_URL` で上書きできます（開発時）。

## 開発（このMacで動かす）

```bash
cd desktop-apps/roots-desktop
npm install
npm start                 # 本番(rootshub.jp)を読み込んで起動
npm run dev               # ローカル(http://localhost:3000)を読み込んで起動
```

## ビルド（インストーラ生成）

```bash
npm run dist:mac          # macOS: dist/ に .dmg / .zip（arm64 + x64）
npm run dist:win          # Windows: dist/ に .exe(NSIS)  ※Win用はWindows環境かCIで
npm run dist              # 両方（Winのクロスビルドは不安定。CI推奨）
```

> Windows インストーラの生成は Windows ランナー（CI）で行うのが確実です。macOS 上でのクロスビルドは
> 環境依存で失敗することがあります。**配布ビルドは下記 CI に任せる**のが基本です。

## リリース運用（＝管理の仕組み）

バージョンを上げてタグを push するだけで、CI が mac/win をビルドし GitHub Releases に公開、
既存インストール済みアプリが**自動更新**されます。

```bash
# 1) バージョンを上げる（例 1.0.0 → 1.0.1）
#    desktop-apps/roots-desktop/package.json の "version" を編集
# 2) タグを push
git tag desktop-v1.0.1
git push origin desktop-v1.0.1
# 3) 数分で GitHub Releases が作られ、各端末が次回起動時（＋6時間ごと）に自動更新
```

CI 定義: `.github/workflows/desktop-release.yml`（配信元 = `github.com/inuisdogg/roots` の Releases）。

## コード署名・公証（配布時の推奨・CEO作業）

未署名でも動きますが、初回起動で「開発元が未確認」警告が出て、自動更新の署名検証も限定的になります。
本配布時は以下を GitHub Secrets に登録すると CI で自動的に署名／公証されます。

- **macOS**（Apple Developer Program が必要）
  - `CSC_LINK`（Developer ID Application 証明書 `.p12` を base64 化した文字列）
  - `CSC_KEY_PASSWORD`
  - `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID`（公証用）
- **Windows**（コード署名証明書が必要。OV/EV）
  - `WIN_CSC_LINK`（`.pfx` を base64 化）
  - `WIN_CSC_KEY_PASSWORD`

## セキュリティ / 挙動メモ

- `contextIsolation: true` / `nodeIntegration: false` / `sandbox: true`。Node の生 API はレンダラに渡しません。
- ログイン状態は `persist:roots` セッションに保持（再起動しても保持）。
- 自ドメイン（rootshub.jp）外へのリンク・`target=_blank` は既定ブラウザで開きます。
- User-Agent に `RootsDesktop/<version>` を付与（Web 側で検知可能。ネイティブ／個人端末判定は誘発しません）。
- デスクトップ通知・印刷（`window.print()`）・ダウンロードは Chromium 既定の挙動で動作します。
- オフライン時は「接続できませんでした（再読み込み）」の簡易画面を表示します。

## 既知の TODO（次段）

- コード署名・公証（上記 Secrets 登録。CEO の Apple Developer / Windows 証明書が必要）。
- Web 側の任意強化: `RootsDesktop` UA を使った「デスクトップアプリでご利用中」表示や、
  共有 PC 想定の個人情報表示制御の見直し（現状はデスクトップ = 通常のデスクトップブラウザ扱い）。
- 自動起動（ログイン時起動）やトレイ常駐が必要になれば追加。
