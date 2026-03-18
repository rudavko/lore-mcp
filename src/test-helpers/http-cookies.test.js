/** @implements NFR-001 — Shared cookie-jar helpers for request/response test flows. */
export function buildCookieHeader(jar) {
	const pairs = [];
	for (const [name, value] of jar.entries()) {
		pairs.push(`${name}=${value}`);
	}
	return pairs.join("; ");
}

export function readSetCookies(headers) {
	const maybeHeaders = headers;
	if (typeof maybeHeaders.getSetCookie === "function") {
		return maybeHeaders.getSetCookie();
	}
	const raw = headers.get("set-cookie");
	if (!raw) {
		return [];
	}
	return raw.split(/,(?=[^;,]+=)/g);
}

export function applySetCookies(jar, response) {
	const nextJar = new Map(jar);
	const setCookies = readSetCookies(response.headers);
	for (let i = 0; i < setCookies.length; i++) {
		const match = setCookies[i].match(/^\s*([^=;\s]+)=([^;]*)/);
		if (!match) {
			continue;
		}
		const name = match[1];
		const value = match[2];
		if (value === "") {
			nextJar.delete(name);
		} else {
			nextJar.set(name, value);
		}
	}
	return nextJar;
}
