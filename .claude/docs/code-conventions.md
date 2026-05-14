# コード規約と既存 API

本ファイルは [AGENTS.md](../../AGENTS.md) からオンデマンドで参照される詳細資料です。`src/utils/` の API リファレンスと、コーディング規約・ログ規約をまとめています。

## 環境前提

- Node.js 24、pnpm、TypeScript 5.x。
- `tsconfig.json`: `target: ES2022`、`module: NodeNext`、`moduleResolution: NodeNext`、`strict: true`、`noEmit: true`、`types: ["node"]`。
- Biome（バージョンは `package.json` の `@biomejs/biome` を参照）: ダブルクオート、2 スペースインデント、`organizeImports: on`。
- 実行は `vite-node ./src/<name>.ts`。直接 `node` で起動しません。

## `src/utils/proc.ts`

子プロセス起動の共通ラッパーです。LLM エージェントによる新規追加コードでは `child_process.spawn` を直接呼ばず、必ずここを通します。

### `run(cmd, args, cwd = null, quiet = false): Promise<RunResult>`

- 引数
  - `cmd`: 実行ファイル名（例: `"git"`）。
  - `args`: 引数配列。
  - `cwd`: 作業ディレクトリ（`null` の場合は親プロセスを継承）。
  - `quiet`: `true` で stdout / stderr のライブ出力を抑制します。
- 戻り値: `{ code, out, err }`。終了コードが 0 以外でも例外は投げません。

### `interface RunResult`

- `code: number`: 終了コード（0 が成功）。
- `out: string`: 標準出力の蓄積。
- `err: string`: 標準エラーの蓄積。

### 使用例

```ts
const result = await run("git", ["diff", "--quiet", `${a}..${b}`, "--"], null, true);
if (result.code === 0) {
  // 差分なし
}
```

## `src/utils/git.ts`

git コマンド向けの薄いラッパーです。標準出力を `trim()` した文字列で返し、終了コード 0 以外なら `Error` を投げます。

### `git(args, quiet = false): Promise<string>`

`git <args>` を実行し、標準出力（trim 済み）を返します。失敗時は `git ${args.join(" ")} failed:\n${result.err}` を含む `Error` を投げます。

### `gitOk(args): Promise<boolean>`

例外を投げず、終了コード 0 のときに `true`、それ以外で `false` を返します。`rev-parse --verify` や `show-ref --verify` などの存在チェックに使います。

### `ensureClean(): Promise<void>`

`git status --porcelain` の結果が空であることを保証します。差分があると「作業ツリーがクリーンではありません。コミット or stash してください。」というエラーで停止します。**破壊的 git 操作を行うスクリプトは冒頭で必ず呼びます。**

### `rev(ref): Promise<string>`

`git rev-parse --verify <ref>^{commit}` でコミット SHA を取得します。

### `localBranchExists(branchName): Promise<boolean>` / `remoteBranchExists(branchName): Promise<boolean>`

`refs/heads/<branchName>` / `refs/remotes/<branchName>` の存在を確認します。`remoteBranchExists` には `origin/<branch>` 形式で渡します。

### `mergeBase(a, b): Promise<string>`

`git merge-base a b` を返します。

### `listCommits(base, head): Promise<string[]>`

`git rev-list --reverse --ancestry-path <base>..<head>` を実行し、古い順のコミット SHA 配列を返します。`apply-topics` の `pick` / `squash` モードで使用します。

## `src/utils/upstream-tags.ts`

upstream タグ名前空間の組み立てを行うヘルパーです。

- `normalizeUpstreamTagNamespace(upstreamRemote, override?)`: `refs/tags/<remote>` を既定にしつつ、`override` を正規化します（`refs/` で始まらなければ `refs/tags/` を付与し、末尾スラッシュを除去）。
- `sanitizeUpstreamTagSuffix(input)`: 前後スラッシュを除去します。
- `buildUpstreamTagRef(suffix, namespace)`: 名前空間と suffix を組み合わせて完全な ref（例: `refs/tags/upstream/2025.10.0`）を作ります。空 suffix はエラーです。

## CLI 設計の規約

- yargs の `.option` で宣言します。型は `type: "string" | "boolean" | "number"`。
- `default` に `process.env.<NAME> ?? "<fallback>"` を設定して、環境変数と CLI 引数のどちらでも上書きできるようにします。
- boolean は `(process.env.PUSH ?? "true").toLowerCase() === "true"` のような変換を行います（既存スクリプトと同じ形）。
- `describe` は英語・日本語どちらでも構いませんが、既存スクリプトの粒度に合わせます。
- `parseSync()` で同期的に取得し、トップレベル定数（例: `const BASE_REF = argv.baseRef;`）に展開してから使います。

## ログとエラーの規約

- 進行ログ: `▶ <command summary>`。
- サブステップ: `  • <detail>`。
- 情報通知: `ℹ <message>`。
- 成功: `✔ <result>`。
- 失敗: `✖ <error message>`（`console.error` で出力し、最終的に `process.exit(1)`）。
- すべての IIFE は次のパターンで終端します。

```ts
(async () => {
  // ...
})().catch((e) => {
  console.error(`✖ ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
```

- `Error` を新規に投げる場合は、復旧手順（再実行コマンド等）を含む日本語メッセージにします。

## 検証フロー

- `pnpm install --frozen-lockfile` で依存を固定します。
- `pnpm run typecheck`（= `tsc --noEmit`）が通ることを確認します。
- `pnpm run format:fix`（= `biome format --fix`）でフォーマット差分を解消します。
- CLI の動作確認は、クリーンな作業ツリーで `pnpm run <task> -- --help` を叩いてオプションが意図通り表示されることを確認します。
- 破壊的操作を含むスクリプトは、専用の使い捨てリポジトリでスモークテストするのが安全です。
