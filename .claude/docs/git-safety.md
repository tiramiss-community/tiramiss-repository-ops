# Git 操作と安全運用

本ファイルは [AGENTS.md](../../AGENTS.md) からオンデマンドで参照される詳細資料です。破壊的 git 操作の扱いと、コンフリクト時の手順をまとめています。

## 破壊的 git 操作の分類

このプロジェクトで定常的に発生する破壊的操作は次の通りです。LLM エージェントが自発的に実行する前には必ずユーザー確認を取ります。

- `git reset --hard <commit>`: 作業ブランチを指定コミットへ巻き戻します。`rebase-working` と `apply-topics` で使用します。
- `git switch -C <branch> <commit>`: 既存ブランチを破棄して同名で作り直します。`bundle-topics` と `apply-topics` の整備で使用します。
- `git push --force origin <branch>`: 既存ブランチを履歴ごと上書きします。`rebase-working`, `apply-topics`, `bundle-topics` のいずれも、対象ブランチがすでに origin に存在する場合に使用します。
- `git push --prune --force origin refs/tags/upstream/*:refs/tags/upstream/*`: 上流タグ名前空間のミラー push（`sync-upstream`）。
- `rmSync(...)` / `cpSync(...)` による `TOOL_DIR` 配下の上書き: `rebase-working` の vendoring。

## ensureClean の徹底

破壊的 git 操作を含むすべてのエントリポイントは、IIFE 冒頭で `await ensureClean()` を呼び、作業ツリーに未コミット差分がない状態でのみ進行します。新規スクリプトで破壊的操作を含めるなら、同じパターンを必ず踏襲します。

## 運用ブランチの取り扱い

- `develop-upstream`: upstream の同期先。`sync-upstream` 以外では原則変更しません。
- `develop-working`: 作業用ブランチ。`rebase-working` が `BASE_REF` から `reset --hard` で再構築します。直接 commit するのは ops 系の生成物のみが想定です。
- `tiramiss`: 統合ブランチ。`apply-topics` が `develop-working` 上でトピックを適用して生成します。
- `bundle/*`: 束ねブランチ。`bundle-topics` が `BASE_REF` から `switch -C` で毎回作り直す生成物ブランチです。開発ブランチのベースには使いません。
- 上記以外のブランチに対して破壊的操作を行う変更を入れる場合は、必ずユーザーへ提示してから進めます。

## タグ運用

- 上流タグは `refs/tags/upstream/*` の名前空間で保持します。`refs/tags/<tag>` の生タグは使いません。
- `rebase-working` で `BASE_UPSTREAM_TAG=2025.10.0` のように指定すると、`refs/tags/upstream/2025.10.0` を origin から fetch して使います。`sync-upstream` を事前に走らせていない場合は失敗します。
- タグ同期は `--force --prune` を伴い、`refs/tags/upstream/*` のミラー push です。

## コンフリクト時の手順

### sync-upstream の merge コンフリクト

スクリプトは停止します。手動で `git status` を確認し、コンフリクトを解消した上で `git merge --continue` を行います。完了後、必要なら `pnpm run sync-upstream` を再実行します。

### apply-topics の cherry-pick コンフリクト（MODE=pick）

スクリプトは「`git add -A && git cherry-pick --continue` を実行し、再実行してください」というメッセージで停止します。指示通りに解消し、再度 `pnpm run apply-topics -- --mode pick` を走らせます。

### apply-topics の squash コンフリクト（MODE=squash）

`git merge --squash --no-commit <topic>` の段階でコンフリクトが起きた場合は停止します。コンフリクト解消後、`git commit` で適切なメッセージを残し、再度 `pnpm run apply-topics` を走らせます。

### bundle-topics の merge コンフリクト

`.tiramiss/` および `.github/workflows/` 配下のコンフリクトは `ours` で自動解決されます。それ以外のコンフリクトは停止し、未解決ファイル名がエラーメッセージに含まれます。手動で解消後 `git add -A && git merge --continue` を行い、再実行します。

## TOOL_DIR の事故防止

- `rebase-working` の vendoring は `TOOL_DIR` 配下を一旦削除して書き換えます。`.tiramiss` を `working-directory` にした状態で `TOOL_DIR=./` のまま実行すると、`.tiramiss/` 自身を壊します。
- 推奨運用は `TOOL_DIR=vendor/<name>` のような専用サブディレクトリ指定です。CLI / 環境変数の両方で指定可能です。
- `TOOL_DIR` の値を変更する変更を入れる場合は、対象ディレクトリの存在と既存ファイルの上書き範囲を必ず PR 説明に書き、ユーザー確認を取ります。

## force push の判定ロジック

既存スクリプトは次のパターンを共通で使います。

```ts
if (!(await remoteBranchExists(`origin/${BRANCH}`))) {
  await git(["push", "-u", "origin", BRANCH]);
} else {
  await git(["push", "--force", "origin", BRANCH]);
}
```

新規スクリプトでも push を行う場合は、このパターンを踏襲してください。`--force-with-lease` を使わない理由は、対象が「再構築されるもの」と明示されており、共同編集を想定しない運用ブランチだからです。

## ログとエラー文言の方針

- 危険操作の直前には `▶ force push origin <branch>` のような明示ログを出します。
- 失敗時のエラーメッセージは、復旧コマンドを日本語で示します（既存スクリプトの cherry-pick / squash コンフリクト案内に準拠）。
