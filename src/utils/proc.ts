import { spawn } from "node:child_process";

export function run(
	cmd: string,
	args: string[],
	cwd: string | null = null,
	quiet = false,
) {
	return new Promise<{ code: number; out: string; err: string }>(
		(resolve, reject) => {
			const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], cwd });
			let out = "",
				err = "";
			p.stdout.on("data", (d) => {
				const s = d.toString();
				out += s;
				if (!quiet) process.stdout.write(s);
			});
			p.stderr.on("data", (d) => {
				const s = d.toString();
				err += s;
				if (!quiet) process.stderr.write(s);
			});
			p.on("error", reject);
			p.on("close", (code) => resolve({ code: code ?? 0, out, err }));
		},
	);
}
