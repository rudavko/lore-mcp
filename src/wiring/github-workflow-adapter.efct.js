/** @implements NFR-001 — Effect adapter for admin workflow install in orchestrator wiring. */
const BASE64_ALPHABET =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function encodeBase64Ascii(text) {
	let output = "";
	for (let i = 0; i < text.length; i += 3) {
		const a = text.charCodeAt(i);
		const hasB = i + 1 < text.length;
		const hasC = i + 2 < text.length;
		const b = hasB ? text.charCodeAt(i + 1) : 0;
		const c = hasC ? text.charCodeAt(i + 2) : 0;
		const triple = a * 65536 + b * 256 + c;
		const chunk0 = (triple - (triple % 262144)) / 262144;
		const rem0 = triple % 262144;
		const chunk1 = (rem0 - (rem0 % 4096)) / 4096;
		const rem1 = rem0 % 4096;
		const chunk2 = (rem1 - (rem1 % 64)) / 64;
		const chunk3 = rem1 % 64;
		output += BASE64_ALPHABET[chunk0];
		output += BASE64_ALPHABET[chunk1];
		output += hasB ? BASE64_ALPHABET[chunk2] : "=";
		output += hasC ? BASE64_ALPHABET[chunk3] : "=";
	}
	return output;
}

export function makeInstallWorkflowToRepoRuntime(deps) {
	function errorMessage(error) {
		if (error instanceof Error && typeof error.message === "string" && error.message.length > 0) {
			return error.message;
		}
		if (typeof error === "string" && error.length > 0) {
			return error;
		}
		return "Unknown GitHub adapter error";
	}
	function parseTargetRepoAdapter(target) {
		const parsed = deps.parseTargetRepo(target);
		if (parsed.error !== null) {
			return { error: parsed.error };
		}
		return { owner: parsed.owner, repo: parsed.repo };
	}
	async function githubFetch(path, githubToken, init) {
		let response;
		try {
			response = await deps.githubFetchApi("https://api.github.com" + path, {
				method: init?.method || "GET",
				headers: {
					authorization: `Bearer ${githubToken}`,
					accept: "application/vnd.github+json",
					"user-agent": "lore-mcp",
					"x-github-api-version": "2022-11-28",
					...(init?.body ? { "content-type": "application/json" } : {}),
				},
				body: init?.body,
			});
		} catch (error) {
			throw "githubFetchApi: " + errorMessage(error);
		}
		let body = null;
		try {
			const readJson =
				response && typeof response.json === "function" ? response.json.bind(response) : null;
			body = readJson ? await readJson() : null;
		} catch (error) {
			if (errorMessage(error).includes("Illegal invocation")) {
				throw "githubResponse.json: " + errorMessage(error);
			}
			body = null;
		}
		try {
			return { status: response.status, ok: response.ok, body };
		} catch (error) {
			throw "githubResponseFields: " + errorMessage(error);
		}
	}
	async function readJsonSafe(resp) {
		return resp.body;
	}
	async function callInstallWorkflowToRepo(token, targetRepo) {
		try {
			return await deps.installWorkflowToRepo(token, targetRepo, {
				parseTargetRepo: parseTargetRepoAdapter,
				renderWorkflowYaml: deps.renderWorkflowYaml,
				btoa: encodeBase64Ascii,
				githubFetch,
				readJsonSafe,
				jsonStringify: deps.jsonStringify,
			});
		} catch (error) {
			throw "installWorkflowToRepoRuntime: " + errorMessage(error);
		}
	}
	return async (token, targetRepo) => {
		const result = await callInstallWorkflowToRepo(token, targetRepo);
		return result;
	};
}
