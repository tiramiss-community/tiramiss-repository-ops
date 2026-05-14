# GitHub Actions 運用

本ファイルは [AGENTS.md](../../AGENTS.md) からオンデマンドで参照される詳細資料です。`workflows/` のテンプレート群と `.tiramiss` への vendoring 運用、必要シークレット、管理者ガードについてまとめています。

## ワークフローテンプレートの位置づけ

`workflows/` 配下の YAML はテンプレートです。本番側（`tiramiss` リポジトリ）の `.github/workflows/` には、`rebuild-working-branch` ワークフロー実行時に `.tiramiss/workflows/` から `.github/workflows/` へコピーされる形で配布されます。

つまりワークフロー更新は次の流れです。

1. このリポジトリの `workflows/<name>.yml` を編集してコミットします。
2. 本番側で `.tiramiss/` を更新（このリポジトリの最新を vendoring）します。
3. `rebuild-working-branch` を実行すると `.github/workflows/` にコピーされ、ワークフロー定義が更新されます。

このため `.github/workflows/` を直接編集する変更は本リポジトリでは扱いません。

## vendoring 運用（.tiramiss）

本リポジトリは `tiramiss` リポジトリの直下に `.tiramiss/` として clone されて使われます。

```bash
# tiramiss リポジトリのルートで
git clone <this-repo-url> .tiramiss
pnpm -C .tiramiss install --frozen-lockfile

git add .tiramiss
git commit -m "chore: vendor .tiramiss scripts"
```

GitHub Actions では `working-directory: .tiramiss` を指定して各スクリプトを呼び出します。git コマンドはサブディレクトリから実行しても親 worktree を操作できるため、`.tiramiss` 配下から `tiramiss` リポジトリ本体のブランチ・コミットを更新できます。

## ワークフロー一覧と役割

### `workflows/sync-upstream.yml`

- トリガ: `workflow_dispatch` と `schedule`（JST 03:00 = UTC 18:00 の毎日実行）。
- 処理: `develop-working` を checkout し、`.tiramiss` 配下で `pnpm run sync-upstream` を実行します。
- 結果: `develop-upstream` の更新と `refs/tags/upstream/*` の同期、origin への push。

### `workflows/rebuild-working-branch.yml`

- トリガ: `workflow_dispatch`（`base_upstream_tag` を任意で指定可能）。
- 処理:
  1. `pnpm run rebase-working`（`BASE_UPSTREAM_TAG` を渡す）。
  2. `pnpm run issue-to-topics -- --token "$GITHUB_TOKEN" --bundlesOutput bundles.txt`。
  3. `.tiramiss/workflows/` を `.github/workflows/` にコピー。
  4. `topics.txt` / `bundles.txt` / `.github/workflows` をまとめて `ci: update workflows and topics` でコミット。
  5. 差分があれば `develop-working` を origin に push。

### `workflows/build-bundles.yml`

- トリガ: `workflow_dispatch`（`base_ref` を指定。既定は `develop-working`）。
- 処理: `.tiramiss` 配下で `pnpm run bundle-topics -- --baseRef "${{ inputs.base_ref }}"` を実行します。`bundles.txt` は `develop-working` にコミット済みである前提です。

### `workflows/apply-topics.yml`

- トリガ: `workflow_dispatch`。
- 処理: `.tiramiss` 配下で `pnpm run apply-topics` を実行し、`tiramiss` ブランチを再生成して push します。

## 共通ステップ構成

すべてのワークフローは次の共通ステップを含みます。新規ワークフロー追加時もこの構成を踏襲します。

1. `Ensure admin actor`: `actions/github-script@v7` でリポジトリ管理者以外の実行を拒否します。
2. App トークン発行: `actions/create-github-app-token@v1` で `WORKFLOW_APP_ID` / `WORKFLOW_APP_KEY` から App トークンを発行します。通常の `GITHUB_TOKEN` ではワークフロー更新ができないためです。
3. `actions/checkout@v4`: `ref: develop-working`、`fetch-depth: 0`、`token: <App トークン>` で checkout します。
4. `pnpm/action-setup@v4.2.0` と `actions/setup-node@v4`（`node-version: 24`、`cache: pnpm`）。
5. `pnpm install --frozen-lockfile`（`working-directory: .tiramiss`）。
6. git 識別子設定: `github-actions[bot]` でコミットできるようにします。
7. 目的のスクリプト実行（`working-directory: .tiramiss`、`env: CI: true`）。

## 必要なシークレットと権限

- `secrets.WORKFLOW_APP_ID`: GitHub App の App ID。
- `secrets.WORKFLOW_APP_KEY`: GitHub App の Private Key（PEM 形式）。
- `permissions: contents: write` を各ジョブに付与しています。

GitHub App はワークフロー更新（`.github/workflows/`）の push を許可する権限を持つ必要があります。Repository contents（read/write）と Workflows（read/write）の権限を最低限付与します。

## 管理者制限の実装

各ワークフローの冒頭には次の構成を持つ `Ensure admin actor` ステップがあります。リポジトリの collaborator 権限を取得し、`admin` 以外であれば `core.setFailed` で停止します。

```yaml
- name: Ensure admin actor
  uses: actions/github-script@v7
  with:
    script: |
      const actor = context.actor;
      const { data } = await github.rest.repos.getCollaboratorPermissionLevel({
        owner: context.repo.owner,
        repo: context.repo.repo,
        username: actor,
      });
      if (data.permission !== "admin") {
        core.setFailed(`このワークフローはリポジトリ管理者のみ実行できます (権限: ${data.permission}).`);
      }
```

新規ワークフローを追加する場合も、上記のガードを必ず含めます。

## VS Code でのスキーマ検証

`.vscode/settings.json` の `yaml.schemas` に GitHub Workflow スキーマを紐付けています。新規ワークフローを追加した際は同ファイルにパスを追記しておくと、編集時にリアルタイムでスキーマチェックが効きます。

## 拡張時の注意

- ワークフロー数を増やす場合も `workflows/` テンプレ → `rebuild` 経由配布のフローを維持します。
- ローカル実行と CI のエントリポイントを乖離させないため、ワークフロー側に複雑なシェル処理を書かず、ロジックは `src/` 配下に集約します。
- 既存ワークフローと同様、管理者ガード・App トークン・`working-directory: .tiramiss`・`CI: true` の指定を踏襲します。
