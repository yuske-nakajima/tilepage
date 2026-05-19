# E2E テストルール

- E2E テストは `e2e/` ディレクトリに配置する
- Playwright を使用 (`pnpm test:e2e`)
- CI には組み込まない (ローカル実行のみ)
- demo ページを変更した場合は `pnpm test:e2e` を実行してリグレッション確認すること
- モバイルエミュレーション (Pixel 7) とデスクトップ Chrome の 2 プロジェクトで実行
- Vite dev server は Playwright が自動起動する

## E2E 駆動用 fixture の配置

- E2E から呼び出される **テスト駆動用の汎用 demo** (URL クエリで設定可変、 検証 matrix 用 等) は `e2e/fixtures/<name>/` 配下に置く
- 配置例: `e2e/fixtures/columns-variant/`、 `e2e/fixtures/v0.4/`
- fixture は **demo/ 配下に置かない** (build:demo の出力に意図せず含まれるのを防ぐため)
- fixture が demo の text / style.css / 画像を流用する場合は相対パスまたは publicDir 経由で参照する
  - text / style.css: `../../demo/<file>` (相対)
  - 画像: `/<filename>.png` (vite の publicDir = `demo/public/` 経由で root 直下から serve)
- E2E spec からの URL: `/e2e/fixtures/<fixture-name>/` でアクセスする
- showcase 系の demo (人間目視用) は `demo/<showcase>/` に置き、 E2E から `/demo/<showcase>/` でアクセスする
