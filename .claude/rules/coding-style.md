# コーディングスタイルルール

## ルール

- CLI オプションは `yargs(hideBin(process.argv)).option(...)` で宣言し、各オプションに `default: process.env.<NAME> ?? "<fallback>"` を設定して環境変数で上書き可能にします。
- git および外部プロセスの呼び出しは `src/utils/git.ts` の `git()` / `gitOk()` / `ensureClean()` / `rev()` / `mergeBase()` / `listCommits()` / `localBranchExists()` / `remoteBranchExists()` か、`src/utils/proc.ts` の `run()` を必ず通します。`child_process.spawn` を直接呼ぶ実装は追加しません。
- 非同期処理は async / await で統一し、生の Promise チェーン（`.then().catch()`）は使いません。
- ログは既存の `console.log` プレフィックス記法（`▶ `, `  • `, `ℹ `, `✔ `, `✖ `）を踏襲し、CI ログから手順を追跡できる粒度を保ちます。
- Biome（ダブルクオート、2 スペースインデント）に従い、コミット前に `pnpm run format:fix` でフォーマット差分を解消します。
- 型は TypeScript の strict 設定（`tsconfig.json` の `strict: true`）に従い、`pnpm run typecheck` で `tsc --noEmit` がエラーなく通る状態を維持します。

## 理由

既存ラッパー経由でログ・エラー処理を一貫させることで、CI ログ上で操作の意図が常に追跡可能になります。yargs と環境変数の二重インタフェースは、ローカル実行と Actions 実行の両立に必要な前提です。

## 適用範囲

- 新規スクリプトを `src/` に追加する場合や、既存スクリプトに CLI オプションを追加する場合に適用します。
- ライブラリ API の詳細と使用例は [.claude/docs/code-conventions.md](../docs/code-conventions.md) を参照します。
