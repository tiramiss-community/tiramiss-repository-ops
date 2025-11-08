import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { EOL } from "node:os";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

type Mode = "merge" | "pick" | "squash";

// ================== コマンドライン引数の解析 ==================

const argv = yargs(hideBin(process.argv))
	.option("base-ref", {
		alias: "b",
		type: "string",
		description: "触らないベース",
		default: process.env.BASE_REF ?? "origin/develop",
	})
	.option("integrate-branch", {
		alias: "i",
		type: "string",
		description:
			"組み立て先. 都度force-pushされるので、このブランチに対して直接作業しない事",
		default: process.env.INTEGRATE_BRANCH ?? "tiramiss",
	})
	.option("topics-file", {
		alias: "t",
		type: "string",
		description: "適用順リスト",
		default: process.env.TOPICS_FILE ?? "topics.txt",
	})
	.option("mode", {
		alias: "m",
		type: "string",
		choices: ["merge", "pick", "squash"] as const,
		description: "統合モード",
		default: (process.env.MODE as Mode) ?? "merge",
	})
	.option("squash-prefix", {
		type: "string",
		description: "squash モードでのコミットメッセージプレフィックス",
		default: process.env.SQUASH_PREFIX ?? "squash",
	})
	.option("squash-list-commits", {
		type: "boolean",
		description: "squash モードでコミット一覧をメッセージに含めるか",
		default:
			process.env.SQUASH_LIST_COMMITS !== undefined
				? process.env.SQUASH_LIST_COMMITS.toLowerCase() === "true"
				: true,
	})
	.help()
	.alias("help", "h")
	.parseSync();

/** 触らないベース */
const BASE_REF = argv["base-ref"];
/** 組み立て先. 都度force-pushされるので、このブランチに対して直接作業しない事 */
const INTEGRATE_BRANCH = argv["integrate-branch"];
/** 適用順リスト */
const TOPICS_FILE = argv["topics-file"];
/** merge | pick | squash */
const MODE = argv.mode as Mode;

// squash 用メッセージ設定
const SQUASH_PREFIX = argv["squash-prefix"];
const SQUASH_LIST_COMMITS = argv["squash-list-commits"];

// ================== 子プロセスユーティリティ群 ==================

function run(
	cmd: string,
	args: string[],
	opts: { cwd?: string; quiet?: boolean } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		const child = spawn(cmd, args, {
			stdio: ["ignore", "pipe", "pipe"],
			cwd: opts.cwd,
		});
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (d) => {
			stdout += d.toString();
			if (!opts.quiet) process.stdout.write(d);
		});
		child.stderr.on("data", (d) => {
			stderr += d.toString();
			if (!opts.quiet) process.stderr.write(d);
		});
		child.on("error", reject);
		child.on("close", (code) => resolve({ code: code ?? 0, stdout, stderr }));
	});
}

async function git(args: string[], quiet = false) {
	const res = await run("git", args, { quiet });
	if (res.code !== 0) {
		const msg = `git ${args.join(" ")} failed (${res.code})\n${res.stderr}`;
		throw new Error(msg);
	}
	return res.stdout.trim();
}

async function gitOk(args: string[]) {
	const res = await run("git", args, { quiet: true });
	return res.code === 0;
}

async function ensureCleanWorkingTree() {
	const status = await git(["status", "--porcelain"], true);
	if (status.trim().length > 0) {
		throw new Error(
			"作業ツリーがクリーンではありません。コミットまたは stash してください。",
		);
	}
}

async function revParseCommit(ref: string) {
	return await git(["rev-parse", "--verify", `${ref}^{commit}`], true);
}

async function showRefLocalBranch(branch: string) {
	return await gitOk(["show-ref", "--verify", `refs/heads/${branch}`]);
}

async function resolveTopicRef(topic: string): Promise<string> {
	if (await gitOk(["rev-parse", "--verify", `${topic}^{commit}`])) return topic;
	for (const cand of [`origin/${topic}`, `upstream/${topic}`]) {
		if (await gitOk(["rev-parse", "--verify", `${cand}^{commit}`])) return cand;
	}
	throw new Error(`見つからないブランチ: ${topic}`);
}

function topicLabel(topic: string) {
	return topic.split("/").pop() ?? topic;
}

async function mergeBase(a: string, b: string) {
	return await git(["merge-base", a, b], true);
}

async function listCommits(base: string, head: string) {
	const out = await git(
		["rev-list", "--reverse", "--ancestry-path", `${base}..${head}`],
		true,
	);
	return out ? out.split("\n").filter(Boolean) : [];
}

async function readTopics(file: string): Promise<string[]> {
	if (!existsSync(file)) return [];
	const raw = readFileSync(file, "utf8");
	return raw
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter((l) => l.length > 0 && !l.startsWith("#"));
}

// ================== 適用ロジック ==================

async function applyMerge(topic: string) {
	// 既に取り込み済みか（topic が HEAD の先祖なら取り込み済み）
	if (await gitOk(["merge-base", "--is-ancestor", topic, "HEAD"])) {
		console.log(`  • skip (already merged): ${topic}`);
		return;
	}
	console.log(`  • merge --no-ff ${topic}`);
	await git(["merge", "--no-ff", topic]);
}

async function applyPick(topic: string) {
	// 既に取り込み済みならスキップ
	if (await gitOk(["merge-base", "--is-ancestor", topic, "HEAD"])) {
		console.log(`  • skip (already picked): ${topic}`);
		return;
	}
	const baseForTopic = await mergeBase(topic, BASE_REF);
	if (!baseForTopic)
		throw new Error(`merge-base 取得に失敗: ${topic} と ${BASE_REF}`);
	console.log(`  • cherry-pick commits from ${topic} (since ${baseForTopic})`);
	const commits = await listCommits(baseForTopic, topic);
	if (commits.length === 0) {
		console.log("    (no commits to pick)");
		return;
	}
	for (const c of commits) {
		const short = await git(["rev-parse", "--short", c], true);
		const subj = await git(["show", "-s", "--format=%s", c], true);
		console.log(`    - pick ${short} ${subj}`);
		try {
			await git(["cherry-pick", "-x", c]);
		} catch {
			throw new Error(
				`cherry-pick コンフリクト。解決後 'git add -A && git cherry-pick --continue' し、本スクリプトを再実行してください。`,
			);
		}
	}
}

async function applySquash(topic: string) {
	// 共通点から topic 側に差分が無ければスキップ
	const common = await mergeBase("HEAD", topic);
	try {
		await git(["diff", "--quiet", `${common}..${topic}`, "--"], true);
		console.log(`  • skip (no diff to squash): ${topic}`);
		return;
	} catch {
		// 差分あり → 続行
	}

	console.log(`  • merge --squash ${topic}`);
	const res = await run("git", ["merge", "--squash", "--no-commit", topic], {
		quiet: false,
	});
	if (res.code !== 0) {
		throw new Error(
			`squash 中にコンフリクト。解決後に 'git commit'（1コミットにまとめる）し、本スクリプトを再実行してください。`,
		);
	}

	const label = topicLabel(topic);
	const headSubject = await git(["log", "-1", "--pretty=%s", topic], true);
	const subject = `${SQUASH_PREFIX}(${label}): ${headSubject}`;

	let body = `Squashed from '${topic}'`;
	if (SQUASH_LIST_COMMITS) {
		const b = await mergeBase(topic, BASE_REF);
		const lines = await git(
			[
				"log",
				"--oneline",
				"--no-decorate",
				"--ancestry-path",
				`${b}..${topic}`,
			],
			true,
		);
		body += `${EOL}${EOL}Included commits:${EOL}${lines
			.split("\n")
			.filter(Boolean)
			.map((l) => ` - ${l}`)
			.join(EOL)}`;
	}

	await git(["commit", "-m", subject, "-m", body]);
}

// ================== メイン ==================

async function main() {
	console.log("▶ 前提チェック");
	await ensureCleanWorkingTree();

	console.log("▶ fetch --all --prune");
	await git(["fetch", "--all", "--prune"]);

	console.log(`▶ ベースを確認: ${BASE_REF}`);
	const baseCommit = await revParseCommit(BASE_REF);
	console.log(`   BASE = ${BASE_REF} @ ${baseCommit}`);

	// 統合ブランチ準備（毎回 BASE に作り直し）
	if (await showRefLocalBranch(INTEGRATE_BRANCH)) {
		await git(["switch", INTEGRATE_BRANCH]);
		await git(["reset", "--hard", baseCommit]);
	} else {
		await git(["switch", "-C", INTEGRATE_BRANCH, baseCommit]);
	}

	console.log(
		`▶ INTEG : ${INTEGRATE_BRANCH} @ ${await revParseCommit("HEAD")}`,
	);
	console.log(`▶ MODE  : ${MODE}`);

	const topics = await readTopics(TOPICS_FILE);
	if (topics.length === 0) {
		console.log(
			`ℹ ${TOPICS_FILE} が見つからないか、適用対象がありません。ベースだけ反映して終了します。`,
		);
		return;
	}

	console.log(`▶ topics from ${TOPICS_FILE}`);
	for (const raw of topics) {
		let topic = raw;
		const resolved = await resolveTopicRef(topic);
		if (resolved !== topic) {
			console.log(`  • resolve ${topic} -> ${resolved}`);
			topic = resolved;
		}

		switch (MODE) {
			case "merge":
				await applyMerge(topic);
				break;
			case "pick":
				await applyPick(topic);
				break;
			case "squash":
				await applySquash(topic);
				break;
			default:
				throw new Error(`不正な MODE: ${MODE}（merge|pick|squash）`);
		}
	}

	const headShort = await git(["rev-parse", "--short", "HEAD"], true);
	console.log(`✔ 完了: ${headShort} on ${INTEGRATE_BRANCH}`);
}

main().catch((err) => {
	console.error(
		`✖ エラー: ${err instanceof Error ? err.message : String(err)}`,
	);
	process.exit(1);
});
