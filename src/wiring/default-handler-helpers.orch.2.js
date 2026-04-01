/** @implements FR-001 — Default-handler orchestration helper factory for HTTP/auth route handling. */
import { safeStringEqual as compareStrings } from "../lib/constant-time-equal.pure.js";

export function createDefaultHandlerHelpers(deps) {
	const platform = deps.platform;
	const otp = deps.otp;
	function parseCookies(cookieHeader) {
		const cookies = new platform.mapCtor();
		if (!cookieHeader) {
			return cookies;
		}
		const parts = cookieHeader.split(";");
		for (let i = 0; i < parts.length; i++) {
			const item = parts[i].trim();
			const eq = item.indexOf("=");
			if (eq <= 0) {
				continue;
			}
			const key = item.slice(0, eq).trim();
			const value = item.slice(eq + 1).trim();
			try {
				cookies.set(key, platform.decodeUriComponent(value));
			} catch {
				cookies.set(key, value);
			}
		}
		return cookies;
	}

	function randomTokenHex(byteLength = 16) {
		const bytes = new platform.uint8ArrayCtor(byteLength);
		platform.cryptoLike.getRandomValues(bytes);
		return platform.byteValuesToHexString(platform.arrayFrom(bytes));
	}

	function formatSecretForDisplay(secret) {
		let out = "";
		for (let i = 0; i < secret.length; i++) {
			if (i > 0 && i % 4 === 0) {
				out += " ";
			}
			out += secret[i];
		}
		return out;
	}

	async function safeStringEqual(left, right) {
		return await compareStrings(left, right, {
			textEncoderCtor: platform.textEncoderCtor,
		});
	}

	async function hmacSha1(secret, message) {
		const key = await platform.cryptoLike.subtle.importKey(
			"raw",
			new platform.uint8ArrayCtor(secret),
			{ name: "HMAC", hash: "SHA-1" },
			false,
			["sign"],
		);
		const signature = await platform.cryptoLike.subtle.sign(
			"HMAC",
			key,
			new platform.uint8ArrayCtor(message),
		);
		return platform.arrayFrom(new platform.uint8ArrayCtor(signature));
	}

	async function verifyTotp(secret, code) {
		if (!otp.validateTotpFormat(code)) {
			return false;
		}
		const decoded = otp.base32Decode(secret);
		if (!decoded.ok) {
			return false;
		}
		const nowSeconds = platform.floor(platform.nowMs() / 1000);
		const baseCounter = otp.computeTimeCounter(nowSeconds, 30);
		for (let offset = -1; offset <= 1; offset++) {
			const counter = baseCounter + offset;
			if (counter < 0) {
				continue;
			}
			const hmac = await hmacSha1(decoded.bytes, otp.counterToBytes(counter));
			const expected = otp.extractHotpCode(hmac);
			if (await safeStringEqual(expected, code)) {
				return true;
			}
		}
		return false;
	}

	function createSimpleRouter() {
		const getRoutes = new platform.mapCtor();
		const postRoutes = new platform.mapCtor();
		const middleware = [];
		return {
			get: (path, handler) => {
				getRoutes.set(path, handler);
			},
			post: (path, handler) => {
				postRoutes.set(path, handler);
			},
			use: (handler) => {
				middleware.push(handler);
			},
			handle: async (method, path) => {
				for (let i = 0; i < middleware.length; i++) {
					await middleware[i]();
				}
				if (method === "GET") {
					const handler = getRoutes.get(path);
					return handler ? await handler() : null;
				}
				if (method === "POST") {
					const handler = postRoutes.get(path);
					return handler ? await handler() : null;
				}
				return null;
			},
		};
	}

	function ensureResponse(value) {
		if (value instanceof platform.responseCtor) {
			return value;
		}
		throw new platform.typeErrorCtor(
			"Route handlers must return a Response instance",
		);
	}

	return {
		parseCookies,
		randomTokenHex,
		formatSecretForDisplay,
		safeStringEqual,
		verifyTotp,
		createSimpleRouter,
		ensureResponse,
	};
}
