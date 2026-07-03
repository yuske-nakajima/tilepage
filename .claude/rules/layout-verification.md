# レイアウト検証ルール

tilepage は新聞風組版ライブラリで、 視覚レイアウトの破綻が即プロダクト破綻となる。 自動テストの GREEN だけで完了判定してはならない。

## 完了判定の原則

- **e2e GREEN は必要条件であって十分条件ではない**
- レイアウト要素の視覚的整合性 (重なり、 はみ出し、 viewport 外配置) は **e2e GREEN でも見落とされる** 可能性がある
- 完了判定には **定量検証 (e2e) + 定性検証 (実機目視) + LLM がスクショを開いて確認** の 3 段必須

## E2E spec の必須観点 (DOM 存在のみは禁止)

レイアウト要素 (画像 obstacle / 見出し / 引用 等) を追加 / 変更する spec には以下を **全て** 含める。

### 1. `toBeInViewport()` で viewport 内可視性を担保

要素が viewport 内で実際に見える位置にあることを assert する。

```ts
await expect(page.locator('[data-id="main-title"]')).toBeInViewport();
```

`toBeVisible()` は DOM の `display`/`visibility`/`opacity` を見るだけで viewport 外も visible 扱いされるため不十分。 視認性を担保するなら `toBeInViewport()` を使う。

### 2. bbox 衝突 assert (全 obstacle layer 対象)

本文 text node だけでなく、 **全 `.tilepage-obstacle` 要素 + 全 `.tilepage-obstacle-float` 要素 + 対象 obstacle 自身の子 element (例: `<img>`) との衝突なし** を assert する。 同一 obstacle layer 内での重なり (見出し vs 画像) を必ず検出する。

```ts
// 対象 bbox を取得
const targetBox = await page.locator('[data-id="main-title"]').boundingBox();
// 衝突対象群の bbox を全件取得
const obstacles = await page.locator('.tilepage-obstacle, .tilepage-obstacle-float').all();
for (const o of obstacles) {
  if ((await o.getAttribute('data-id')) === 'main-title') continue;
  const box = await o.boundingBox();
  if (!box) continue;
  // 矩形交差判定 (helper を spec 内に実装)
  expect(rectsIntersect(targetBox, box)).toBe(false);
}
// 本文 text node とも判定
const flowTexts = await page.locator('.tilepage-flow-text').all();
for (const ft of flowTexts) {
  const box = await ft.boundingBox();
  if (!box) continue;
  expect(rectsIntersect(targetBox, box)).toBe(false);
}
```

### 3. visible text 包含

対象要素から期待 text が読み取れることを assert する。

```ts
await expect(page.locator('[data-id="main-title"]')).toContainText('走れメロス');
```

### 4. 拡大スクショ保存 + clip 範囲 verify

`page.screenshot({ clip, path })` で目視可能なファイルを残す。 ただし **spec 内で「clip 矩形に対象要素の bbox が完全に含まれている」 を assert** する。 clip 計算ミスで「写っていない PNG」 が保存される事故を防ぐ。

```ts
const bbox = await page.locator('[data-id="main-title"]').boundingBox();
if (!bbox) throw new Error('bbox not measured');
const padding = 40;
const clip = {
  x: Math.max(0, bbox.x - padding),
  y: Math.max(0, bbox.y - padding),
  width: bbox.width + padding * 2,
  height: bbox.height + padding * 2,
};
// clip が対象 bbox を完全に内包することを確認
expect(clip.x).toBeLessThanOrEqual(bbox.x);
expect(clip.y).toBeLessThanOrEqual(bbox.y);
expect(clip.x + clip.width).toBeGreaterThanOrEqual(bbox.x + bbox.width);
expect(clip.y + clip.height).toBeGreaterThanOrEqual(bbox.y + bbox.height);
await page.screenshot({ path: 'e2e/_screenshots/xxx.png', clip });
```

`e2e/_screenshots/` は `.gitignore` で除外 (commit せず目視用に残す)。

### 5. flaky 防止の wait

spec 冒頭で web font / 画像読み込み / reflow の完了を待つ。

```ts
await page.goto('/');
await page.evaluate(() => document.fonts.ready);
await page.waitForLoadState('networkidle');
```

## 評価者 (evaluator / レビュアー) の責務

- e2e GREEN だけで PASS 宣言しない
- スクショファイルを **実際に開いて目視確認** する
- 「衝突観測なし」 と「対象要素がスクショに写っていない」 を **明確に区別** する
- 「写っていない」 = 目視証跡として無効 = clip 計算が誤っているので spec を直すまで PASS にしない
- 機械的検証が全 GREEN でも視覚整合性が verify されていなければ **最大 PARTIAL** に留める

## 実装者の責務

- 同一 obstacle layer (画像 / 見出し / 引用 等) の `at` / `cols` / `lines` が衝突する設定を **入力時点で疑う**
- 既存 demo に新規 obstacle を追加する際は、 全 N variant で **既存 obstacle と衝突しないか** を計算する (例: N=6 で king が `{ col: 1, line: 1, cols: 3 }` に居る場合、 main title はその外側に逃がす)
- 自分が書いたコメント (「N=4 のみ省略」 等) と実コード設定 (king の `whenColumns` 等) の整合を **必ず再読して照合** してから配置を決める
- 「`element` 経路があったから乗せた」 で API を決めない。 「この要素はプロダクトの 2 層モデル (obstacle = 矩形を置く / flow = テキストを注ぐ) のどちらに属するか」 を検証してから設計する

## ユーザー目視ステップ

- 実機目視で問題なしを確認できるまで「完了」 「成功」 と書かない
- スクショを送って終わりにせず、 ユーザーが「見えた / 重なりない」 と確認した時点を完了とする

## 関連

- インシデント記録 (v0.5 6 sprint 詰め込み崩壊): `~/.claude/tmp/yuske-nakajima/tilepage/plans/2026-05-20_incident_v0.5-overengineering.md`
- インシデント記録 (v0.5.5 visible 誤解 + assert 盲点): `~/.claude/tmp/yuske-nakajima/tilepage/plans/2026-05-21_incident_v0.5.5-visible-but-invisible.md`
- E2E 配置ルール: `./e2e.md`
- demo 配置ルール: `./demo.md`
