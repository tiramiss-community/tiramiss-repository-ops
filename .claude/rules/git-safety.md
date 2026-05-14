# Git 安全運用ルール

## ルール

破壊的 git 操作（`reset --hard` / force push / `TOOL_DIR` 配下の上書き / `switch -C` によるブランチ再生成）を実行する前に、対象のブランチ名・パス・ベース参照をユーザーへ提示し、明示確認を取ります。スクリプト本体で行う場合は、必ず `ensureClean()` を最初に呼び、未コミットの変更がない状態でのみ進めます。

## 理由

このプロジェクトは複数の運用ブランチ（`develop-upstream` / `develop-working` / `tiramiss` / `bundle/*`）を「再構築されうるもの」として扱い、`rebase-working` や `apply-topics` は force push と `reset --hard` を伴います。実行時のブランチや `TOOL_DIR` の取り違えは、対象リポジトリの作業ツリーへの不可逆な書き込みに直結する最大の事故要因です。

## 適用範囲

- 破壊的 git 操作を含むコード変更を新規追加する場合は、対象ブランチが既存パターンに合致するか（`develop-working`, `tiramiss`, `bundle/*` 等のみ）を確認します。
- `TOOL_DIR` を扱う変更では、デフォルト値 `./` の上書きリスクを README 同等に明文化します。
- `bundle/*` は `bundle-topics` により毎回作り直される生成物ブランチであり、開発ブランチのベースには使用しません。
- LLM エージェントが自発的に `git push --force` / `git reset --hard` / `rm -rf` 相当を実行する前には、コマンド文字列を提示し承認を得ます。
- 詳細手順とコンフリクト解消の指針は [.claude/docs/git-safety.md](../docs/git-safety.md) を参照します。
