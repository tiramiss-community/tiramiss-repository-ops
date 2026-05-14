---
name: add-cli-script
description: src/ に新しい CLI スクリプトを追加するときの定型手順。yargs オプションの宣言、package.json への scripts 追加、既存ラッパーの利用、ワークフロー追加要否の判断軸をカバーします。
---

# 新しい CLI スクリプトを追加する

## 適用タイミング

`src/` 配下に新しいエントリポイントを追加する場合に使います。CLI 引数を取らない補助ツール（プライベートユーティリティ）の追加では本スキルは不要です。

## 手順

1. ファイル作成: `src/<name>.ts` を作成します。命名はケバブケース（例: `apply-topics.ts`）とし、既存スクリプトと並ぶ位置に配置します。
2. オプション宣言: yargs の `option` 群を宣言し、CLI 引数と環境変数の二重指定に対応させます。例:

   ```ts
   const argv = yargs(hideBin(process.argv))
     .usage("$0 [options]")
     .option("targetBranch", {
       type: "string",
       default: process.env.TARGET_BRANCH ?? "develop-upstream",
       describe: "対象ブランチ",
     })
     .option("push", {
       type: "boolean",
       default: (process.env.PUSH ?? "true").toLowerCase() === "true",
       describe: "origin への push を行うか",
     })
     .help()
     .parseSync();
   ```

3. 既存ラッパーの利用: git 操作は `src/utils/git.ts` の `git()` / `gitOk()` / `ensureClean()`、外部プロセスは `src/utils/proc.ts` の `run()` を使います。直接 `child_process.spawn` を呼ぶ実装は追加しません。
4. 破壊的操作の保護: 破壊的 git 操作を行うスクリプトでは、IIFE の冒頭で `await ensureClean()` を必ず呼びます。
5. ログ書式: 既存記法（`▶ ` 開始、`  • ` 詳細、`ℹ ` 情報、`✔ ` 成功、`✖ ` 失敗）を踏襲します。
6. エラーハンドリング: IIFE は `.catch((e) => { console.error(...); process.exit(1); })` の形で終端し、エラーメッセージは日本語で出力します。
7. `package.json` 登録: `scripts` に `"<name>": "vite-node ./src/<name>.ts"` を追加します。
8. ワークフロー追加要否: GitHub Actions から実行する必要がある場合のみ、`workflows/<name>.yml` をテンプレートとして追加します（追加手順は `.claude/skills/add-workflow/SKILL.md` を参照）。
9. 検証: `pnpm run typecheck` と `pnpm run format:fix` を通します。可能であれば実環境のクリーンな作業ツリーで `pnpm run <name> -- --help` を叩いてオプションが正しく表示されることを確認します。

## 注意

- 新規スクリプトでも README への CLI 説明追記が SSoT として必要です。詳細は [.claude/docs/operational-flow.md](../../docs/operational-flow.md) を参照してください。
- 利用可能な既存ラッパー API の一覧と使用例は [.claude/docs/code-conventions.md](../../docs/code-conventions.md) にあります。
