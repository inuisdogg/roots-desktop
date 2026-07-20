# ROOTS Desktop

ROOTS（rootshub.jp）をデスクトップアプリとして使うための配布用リポジトリです。

このアプリは rootshub.jp を読み込む薄いシェル（Electron）で、業務ロジックや機密情報は含みません。
中身は常に最新（ホスト側のWeb）で、シェル自体は自動アップデートされます。

- ソース: `desktop-apps/roots-desktop/`
- リリースCI: `.github/workflows/desktop-release.yml`（タグ `desktop-v*` を push するとmac/winをビルドしReleasesへ公開）
- ダウンロード: このリポジトリの [Releases](../../releases) から Mac（.dmg）/ Windows（.exe）

配布物のダウンロードは無料です（ROOTSの利用にはアカウントが必要です）。
