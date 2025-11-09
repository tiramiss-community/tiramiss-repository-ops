import { run } from "./proc";

export async function git(args: string[], quiet = false) {
	const r = await run("git", args, null, quiet);
	if (r.code !== 0) throw new Error(`git ${args.join(" ")} failed:\n${r.err}`);
	return r.out.trim();
}

export async function gitOk(args: string[]) {
	return (await run("git", args, null, true)).code === 0;
}

export async function ensureClean() {
	const s = await git(["status", "--porcelain"], true);
	if (s.trim())
		throw new Error(
			"作業ツリーがクリーンではありません。コミット or stash してください。",
		);
}

export async function rev(ref: string) {
	return git(["rev-parse", "--verify", `${ref}^{commit}`], true);
}

export async function localBranchExists(n: string) {
	return gitOk(["show-ref", "--verify", `refs/heads/${n}`]);
}

export async function remoteBranchExists(n: string) {
	return gitOk(["show-ref", "--verify", `refs/remotes/${n}`]);
}

export async function mergeBase(a: string, b: string) {
	return git(["merge-base", a, b], true);
}

export async function listCommits(base: string, head: string) {
	const out = await git(
		["rev-list", "--reverse", "--ancestry-path", `${base}..${head}`],
		true,
	);
	return out ? out.split("\n").filter(Boolean) : [];
}
