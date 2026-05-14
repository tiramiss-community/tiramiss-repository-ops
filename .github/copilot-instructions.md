# Copilot Instructions

**本ファイルは要約版です。** プロジェクトの完全な指針は [AGENTS.md](../AGENTS.md) を SSoT として参照してください。詳細ルールは [.claude/rules/](../.claude/rules/)、参照資料は [.claude/docs/](../.claude/docs/) にあります。

## プロジェクト概要

Misskey フォーク `tiramiss` の運用自動化スクリプト群です。Node.js 24 + pnpm + TypeScript + vite-node + Biome + yargs + Octokit で構成され、ローカル実行と GitHub Actions（`.tiramiss/` への vendoring 経由）の双方で同じエントリポイントを利用します。

## 最低限の厳守事項

1. 応答・コード内コメント・エラーメッセージは日本語で記述してください（保守者が日本語話者のため）。
2. 破壊的 git 操作（`reset --hard` / force push / `TOOL_DIR` 配下の上書き）の前には、対象ブランチとパスを提示してユーザーに確認を取ります。
3. git と外部プロセスの呼び出しは必ず `src/utils/git.ts` および `src/utils/proc.ts` のラッパーを通します。
4. コードスタイルは Biome（ダブルクオート / 2 スペース）に従い、CLI 引数は `yargs` の `.option` で宣言して環境変数で上書き可能にします。

## さらに深い指針

各項目の根拠と具体例、`src/utils/` の API、ワークフロー運用などの詳細は次を参照してください。

- 全体指針: [AGENTS.md](../AGENTS.md)
- 厳守事項: [.claude/rules/](../.claude/rules/)
- 運用フロー詳細: [.claude/docs/operational-flow.md](../.claude/docs/operational-flow.md)
- Git 安全運用: [.claude/docs/git-safety.md](../.claude/docs/git-safety.md)
- コード規約と既存 API: [.claude/docs/code-conventions.md](../.claude/docs/code-conventions.md)
- GitHub Actions 運用: [.claude/docs/github-actions.md](../.claude/docs/github-actions.md)
