/** @implements FR-001 — Request-context helper factory for the default HTTP handler. */
export function createDefaultHandlerRequestContext(deps, request, env, helpers) {
	const platform = deps.platform;
	const authState = deps.authState;
	const url = new platform.urlCtor(request.url);
	const cookies = helpers.parseCookies(request.headers.get("cookie"));
	const setCookieHeaders = [];
	let cspNonce = "";
	const envRec = env && typeof env === "object" ? env : {};
	const kv = envRec.OAUTH_KV;
	const cspFormActionSources =
		"'self' https://chatgpt.com https://claude.ai http://localhost:* http://127.0.0.1:* http://[::1]:*";

	const withResponseHeaders = (response) => {
		const headers = new platform.headersCtor(response.headers);
		for (let i = 0; i < setCookieHeaders.length; i++) {
			headers.append("set-cookie", setCookieHeaders[i]);
		}
		if (cspNonce.length > 0) {
			headers.set(
				"content-security-policy",
				`default-src 'none'; script-src 'nonce-${cspNonce}'; style-src 'unsafe-inline'; img-src 'self' data:; form-action ${cspFormActionSources}; base-uri 'none'; frame-ancestors 'none'`,
			);
		}
		return new platform.responseCtor(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers,
		});
	};

	const htmlResponse = (html) => {
		const headers = new platform.headersCtor({
			"content-type": "text/html; charset=utf-8",
			"cache-control": "no-store",
		});
		return withResponseHeaders(new platform.responseCtor(html, { status: 200, headers }));
	};

	const textResponse = (text, status) => {
		const headers = new platform.headersCtor({
			"content-type": "text/plain; charset=utf-8",
			"cache-control": "no-store",
		});
		return withResponseHeaders(new platform.responseCtor(text, { status, headers }));
	};

	const redirectResponse = (targetUrl) => {
		const headers = new platform.headersCtor({
			location: targetUrl,
			"cache-control": "no-store",
		});
		return withResponseHeaders(new platform.responseCtor(null, { status: 302, headers }));
	};

	const getCookie = (name) => cookies.get(name) || "";
	const setCookie = (name, value) => {
		setCookieHeaders.push(
			`${name}=${platform.encodeUriComponent(value)}; Path=/; HttpOnly; SameSite=Lax`,
		);
	};
	const deleteCookie = (name) => {
		setCookieHeaders.push(`${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
	};

	const parseBody = async () => {
		const contentType = request.headers.get("content-type") || "";
		if (contentType.indexOf("application/json") >= 0) {
			try {
				const parsed = await request.json();
				return parsed && typeof parsed === "object" ? parsed : {};
			} catch {
				return {};
			}
		}
		const raw = await request.text();
		const params = new URLSearchParams(raw);
		const out = {};
		for (const [key, value] of params.entries()) {
			out[key] = value;
		}
		return out;
	};

	const queryParam = (name) => url.searchParams.get(name) || "";
	const getRequestUrl = () => request.url;
	const parseUrl = (value) => new platform.urlCtor(value);
	const getClientIp = () => request.headers.get("CF-Connecting-IP") || "unknown";
	const isIpLocked = async () => {
		const locked = await authState.kvGet(kv, authState.lockKey(getClientIp()));
		return locked !== null;
	};
	const registerAuthFailure = async () => {
		const ip = getClientIp();
		const count = authState.nextFailCount(await authState.kvGet(kv, authState.failKey(ip)));
		await authState.kvPutTtl(
			kv,
			authState.failKey(ip),
			`${count}`,
			authState.failWindowTtlSeconds,
		);
		if (authState.isLockoutReached(count)) {
			await authState.kvPutTtl(kv, authState.lockKey(ip), "1", authState.lockoutTtlSeconds);
		}
	};
	const clearAuthFailures = async () => {
		const ip = getClientIp();
		await authState.kvDelete(kv, authState.failKey(ip));
		await authState.kvDelete(kv, authState.lockKey(ip));
	};

	return {
		url,
		envRec,
		htmlResponse,
		textResponse,
		redirectResponse,
		getCookie,
		setCookie,
		deleteCookie,
		parseBody,
		queryParam,
		getRequestUrl,
		parseUrl,
		getClientIp,
		isIpLocked,
		registerAuthFailure,
		clearAuthFailures,
		setCspNonce: (nonce) => {
			cspNonce = nonce;
		},
	};
}
