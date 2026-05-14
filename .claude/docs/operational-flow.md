# 運用フロー詳細

本ファイルは [AGENTS.md](../../AGENTS.md) からオンデマンドで参照される詳細資料です。`README.md` を SSoT として、LLM エージェント向けに整理し直しています。CLI オプション名・既定値・環境変数は README と一致させてください。差異がある場合は README が正です。

## 全体像

5 つのスクリプトは次の順序で連携します。

1. `sync-upstream`: upstream の最新を `develop-upstream` に取り込み、タグも `refs/tags/upstream/*` に同期します。
2. `rebase-working`: `develop-working` をベース参照（既定 `origin/develop-upstream`）から作り直し、外部 ops を `TOOL_DIR` に vendoring します。
3. `issue-to-topics`: GitHub Issue から `topics.txt` と任意で `bundles.txt` を生成します。
4. `bundle-topics`: `bundles.txt` の定義に従い `bundle/*` ブランチを毎回作り直します。
5. `apply-topics`: `topics.txt` を統合ブランチ `tiramiss` に適用します（既定 `MODE=squash`）。

## 1. sync-upstream

- エントリ: `src/sync-upstream.ts`
- 役割: upstream（既定 `upstream/develop`）の最新を `develop-upstream` にマージし、上流タグを名前空間付き（既定 `refs/tags/upstream/*`）で保存します。
- 動作の要点
  - upstream remote が無ければ追加します。既存 remote の URL は上書きしません。
  - `fetch --prune --no-tags` でブランチを取得し、別途 `refs/tags/*:refs/tags/upstream/*` でタグを取得します。
  - `PUSH=true` の場合、`develop-upstream` と `refs/tags/upstream/*` を origin に push します（タグは `--force --prune`）。
  - マージコンフリクト発生時は停止します。手動解決後に再実行します。

### CLI オプションと環境変数

| オプション | 環境変数 | 既定値 |
| --- | --- | --- |
| `--upstreamUrl` | `UPSTREAM_URL` | `https://github.com/misskey-dev/misskey.git` |
| `--upstreamRemote` | `UPSTREAM_REMOTE` | `upstream` |
| `--targetBranch` | `TARGET_BRANCH` | `develop-upstream` |
| `--sourceRef` | `SOURCE_REF` | `upstream/develop` |
| `--upstreamTagNamespace` | `UPSTREAM_TAG_NAMESPACE` | `refs/tags/upstream` |
| `--push` | `PUSH` | `true` |

## 2. rebase-working

- エントリ: `src/rebase-working-branch.ts`
- 役割: 作業ブランチ `develop-working` をベース参照から再生成し、外部 repository-ops を `TOOL_DIR` に vendoring します。
- 動作の要点
  - `BASE_UPSTREAM_TAG` が指定された場合、`refs/tags/upstream/<tag>` を origin から fetch し、`BASE_REF` の履歴上にあることを検証します（先に `sync-upstream` 実行が必要）。
  - `develop-working` を `switch -C` で作り直し、`reset --hard <base>` を行います。
  - `TOOL_REPO` を一時ディレクトリへ clone し、`.git` を除去後 `TOOL_DIR` にコピーします（既存ファイルは上書き）。
  - `TOOL_DIR` で `pnpm install --frozen-lockfile` を実行します。
  - 変更があれば `ops: vendor ...` としてコミットし、`PUSH=true` なら origin に push（既存ブランチなら force push）します。

### CLI オプションと環境変数

| オプション | 環境変数 | 既定値 |
| --- | --- | --- |
| `--baseRef` | `BASE_REF` | `origin/develop-upstream` |
| `--baseUpstreamTag` | `BASE_UPSTREAM_TAG` | （未指定） |
| `--upstreamTagNamespace` | `UPSTREAM_TAG_NAMESPACE` | `refs/tags/upstream` |
| `--workingBranch` | `WORKING_BRANCH` | `develop-working` |
| `--toolRepo` | `TOOL_REPO` | `https://github.com/tiramiss-community/tiramiss-repository-ops.git` |
| `--toolRef` | `TOOL_REF` | `HEAD` |
| `--toolDir` | `TOOL_DIR` | `./` |
| `--push` | `PUSH` | `true` |

### 注意

`TOOL_DIR` の指定ミスが最大事故要因です。`.tiramiss` を `working-directory` にしている場合、`TOOL_DIR=./` のままだと `.tiramiss/` 自身を上書きします。専用サブディレクトリ（例: `vendor/<name>`）を推奨します。

## 3. issue-to-topics

- エントリ: `src/issue-to-topics.ts`
- 役割: GitHub Issue 本文の箇条書きから `topics.txt` と任意で `bundles.txt` を生成します。
- 解釈する記法
  - `- topic: <branch-name>` / `- topic: <PR-number>` / `- topic: <PR-URL>`
  - `- bundle: <bundle-branch>`（単一指定 → topics に追加）
  - `- bundle: <bundle-branch> <topic-a> <topic-b> ...`（束ね定義 → topics と bundles 両方に出力）
- 入力検証
  - `topic:` は 1 トークンのみ。
  - `bundle:` 名は `bundle/...` を推奨し、自分自身を含む / 重複は拒否します。
  - PR 番号指定には `--token` か `GITHUB_TOKEN` が必要です。`--labels`（既定 `先行実装,独自機能`）のいずれかを持つ PR のみ採用します。

### CLI オプションと環境変数

| オプション | 環境変数 | 既定値 |
| --- | --- | --- |
| `--token` / `-t` | `GITHUB_TOKEN`（コード側では未自動参照、CLI で渡す） | （未指定） |
| `--repo` / `-r` | — | `tiramiss-community/tiramiss` |
| `--issue` / `-i` | — | `47` |
| `--output` / `-o` | — | `topics.txt` |
| `--bundlesOutput` / `-b` | `BUNDLES_OUTPUT` | （未指定なら生成しない） |
| `--labels` / `-L` | — | `先行実装,独自機能` |

## 4. bundle-topics

- エントリ: `src/bundle-topics.ts`
- 役割: `bundles.txt` の定義に従い、`bundle/*` ブランチを毎回 `switch -C` で作り直して順次マージし、必要なら push します。
- 動作の要点
  - 探索順: `<TOOL_DIR>/bundles.txt` → `bundles.txt`。
  - 見つからない場合は雛形を自動生成（CI では生成せず終了）します。
  - `.tiramiss/` と `.github/workflows/` のマージコンフリクトは `ours` で自動解決します（生成物のノイズを抑える目的）。
  - 成功時は実行開始時のブランチへ戻ります。
  - 存在しないブランチの参照や、`bundle/x` の topics に `bundle/x` 自身が含まれる定義はエラーで停止します。

### CLI オプションと環境変数

| オプション | 環境変数 | 既定値 |
| --- | --- | --- |
| `--baseRef` | `BASE_REF` | `develop-working` |
| `--toolDir` | `TOOL_DIR` | `./` |
| `--bundles` | `BUNDLES_FILE` | （未指定なら自動探索） |
| `--push` | `PUSH` | `true` |

## 5. apply-topics

- エントリ: `src/apply-topics.ts`
- 役割: `topics.txt` のブランチを統合ブランチ `tiramiss` に適用します。
- 動作の要点
  - 探索順: `<TOOL_DIR>/topics.txt` → `topics.txt`（`--topics` 指定が最優先）。
  - `tiramiss` は現在の HEAD から作り直し（既存ならローカルを `reset --hard <HEAD>`）。
  - 各トピックは選択した `MODE` で適用します。
    - `merge`: `git merge --no-ff <topic>`。
    - `pick`: `merge-base(topic, BASE_REF)` から `cherry-pick -x` で個別コミットを移植します。
    - `squash`（既定）: `merge --squash --no-commit` 後、関連コミットの本文を集約し `Co-authored-by` を付与して 1 コミット化します。
  - `PUSH=true` の場合、origin に push（既存ブランチなら force push）します。

### CLI オプションと環境変数

| オプション | 環境変数 | 既定値 |
| --- | --- | --- |
| `--baseRef` | `BASE_REF` | `origin/develop-upstream` |
| `--integrateBranch` | `INTEGRATE_BRANCH` | `tiramiss` |
| `--toolDir` | `TOOL_DIR` | `./` |
| `--topics` | `TOPICS_FILE` | （未指定なら自動探索） |
| `--mode` | `MODE` | `squash` |
| `--push` | `PUSH` | `true` |

## 典型的な運用フロー

ローカル実行と CI（`.tiramiss` 配下から呼び出し）で同じ順序になります。

1. `pnpm run sync-upstream`
2. `pnpm run rebase-working`（必要なら `BASE_UPSTREAM_TAG=2025.10.0` のように指定）
3. `pnpm run issue-to-topics -- --token "$GITHUB_TOKEN" --issue <n> --bundlesOutput bundles.txt`
4. `pnpm run bundle-topics -- --baseRef HEAD`
5. `pnpm run apply-topics`（必要に応じて `--mode merge|pick` を指定）

## 依存ブランチと束ね運用

- 単純な「A に依存する B」は、`topics.txt` に B だけを記載し、B 内に A の差分を内包させた状態にします（squash 既定での安定運用）。
- ツリー状の依存（A に依存する B と C）は、束ねブランチ `bundle/<name>` を自動生成し、`topics.txt` には束ねブランチ名のみを記載します。`bundle-topics` が `bundles.txt` を読んで毎回再構築します。
- `bundle/*` は生成物ブランチであり、開発ブランチのベースには使わない運用が前提です。
