---
paths:
  - "src/**/*.ts"
---
# 実装ルール

- ライブラリは外部依存を持たない（ゼロ依存）
- DOM 操作は直接行い、フレームワーク固有の API は使わない
- 新しい公開 API を追加した時は `src/index.ts` の export も更新する
- スタイルは `src/styles/tilepage.css` に集約し、`src/styles/inject.ts` 経由で必要時に注入する
