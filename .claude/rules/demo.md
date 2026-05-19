---
paths:
  - "demo/**"
---
# デモページルール

- demo は `demo/` ディレクトリに配置する
- ライブラリは `../src/index.ts` から直接 import する (ビルド済み dist は使わない)
- demo の動作確認: `pnpm dev` で Vite dev server を起動
- demo 配下は **showcase 専用** (ユーザーが目視で動作を確認するための demo)
- showcase の画像 / フォント等の静的アセットは `demo/public/` に置く (vite の publicDir として認識され、 dev でも build:demo でも root 直下から serve される)
- showcase 共有の text asset (走れメロス本文など) は `demo/` 直下に置き、 各 showcase から相対 import する
- **E2E 駆動用の fixture (テストドリブンな汎用 demo、 URL クエリ可変等) は `demo/` 配下に置かず `e2e/fixtures/` 配下に置く**
- 理由: demo を hosting する際の build:demo 出力に E2E fixture が混入しないよう、 役割を物理的に分離するため
- dev での URL: `/demo/<showcase>/` で showcase、 `/e2e/fixtures/<fixture>/` で E2E fixture にアクセスする
- showcase / fixture が demo の text / style.css を参照する場合は相対パスで `../../demo/<file>` のように記述する
