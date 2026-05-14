---
name: add-workflow
description: workflows/ に新しい GitHub Actions テンプレートを追加するときの定型手順。rebuild-working-branch によるコピー前提、必要シークレット、管理者ガードの組み込み方をカバーします。
---

# 新しいワークフローテンプレートを追加する

## 適用タイミング

`workflows/` に新しい `.yml` を追加する場合に使います。`.github/workflows/` 直接編集はしません（`workflows/` から `rebuild-working-branch` 経由でコピーされる前提です）。

## 手順

1. テンプレート配置: `workflows/<name>.yml` として新規作成します。命名は対象スクリプト名と一致させます（例: `bundle-topics` を呼ぶワークフローなら `build-bundles.yml`）。
2. トリガ: `workflow_dispatch` を基本とし、必要に応じて `schedule` を追加します（`sync-upstream` は JST 03:00 = UTC 18:00 にスケジュール実行する例があります）。
3. 管理者ガード: 既存ワークフローと同じ `Ensure admin actor` ステップを冒頭に置き、リポジトリ管理者以外の実行を拒否します。
4. GitHub App トークン: 通常の `GITHUB_TOKEN` ではワークフロー更新ができないため、`actions/create-github-app-token@v1` で `WORKFLOW_APP_ID` / `WORKFLOW_APP_KEY` から App トークンを発行し、以降の `checkout` と `push` で利用します。
5. Checkout: `actions/checkout@v4` で `ref: develop-working` を指定し、`fetch-depth: 0` で履歴をフルに取得します。`token` には先ほどの App トークンを渡します。
6. ランタイム: `pnpm/action-setup@v4.2.0` と `actions/setup-node@v4`（`node-version: 24`、`cache: pnpm`）を続け、`working-directory: .tiramiss` で `pnpm install --frozen-lockfile` を実行します。
7. git 識別子: `git config user.name "github-actions[bot]"` と `git config user.email "github-actions[bot]@users.noreply.github.com"` を設定します。
8. 実行ステップ: `working-directory: .tiramiss` で目的のスクリプトを呼びます。`env: CI: true` を渡し、必要なオプションは `inputs.*` から流し込みます。
9. コピー伝播の前提: 新しいワークフローは `rebuild-working-branch` の `Copy workflows to .github/workflows` ステップで対象側 `.github/workflows/` へ配布されます。差分があれば次回の rebuild で自動的に反映されます。
10. 検証: YAML スキーマ検証は `.vscode/settings.json` の `yaml.schemas` に追加すると VS Code でリアルタイムチェックできます。CI 上のドライランは `workflow_dispatch` から手動で 1 回叩いて、管理者ガードと App トークン取得まで通ることを確認します。

## 注意

- 新規ワークフローには必ず管理者ガードを入れ、運用上の事故（フォーカーによる悪意ある実行）を防ぎます。
- 詳細な構成意図と既存ワークフローの責務分担は [.claude/docs/github-actions.md](../../docs/github-actions.md) を参照してください。
