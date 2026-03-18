/** @implements NFR-001 — Internal codec and signing helpers for signed auto-update setup tokens. */
function toBase64Url(base64) {
	let withoutPadding = base64;
	if (base64.endsWith("==")) {
		withoutPadding = base64.slice(0, -2);
	} else if (base64.endsWith("=")) {
		withoutPadding = base64.slice(0, -1);
	}
	return withoutPadding.replaceAll("+", "-").replaceAll("/", "_");
}
function fromBase64Url(base64Url) {
	const base64 = base64Url.replaceAll("-", "+").replaceAll("_", "/");
	const remainder = base64.length % 4;
	if (remainder === 2) {
		return base64 + "==";
	}
	if (remainder === 3) {
		return base64 + "=";
	}
	return base64;
}
function bytesToBinaryString(bytes, deps) {
	return deps
		.arrayFrom(bytes, (byte) => deps.stringFromCharCode(byte))
		.join("");
}
export function encodeTokenPayload(payloadText, deps) {
	const encoder = new deps.textEncoderCtor();
	const bytes = encoder.encode(payloadText);
	return toBase64Url(deps.btoa(bytesToBinaryString(bytes, deps)));
}
export function decodeTokenPayload(payloadBase64Url, deps) {
	const binary = deps.atob(fromBase64Url(payloadBase64Url));
	const decoder = new deps.textDecoderCtor();
	const bytes = new deps.uint8ArrayCtor(
		deps.arrayFrom(binary, (character) => character.charCodeAt(0)),
	);
	return decoder.decode(bytes);
}
function encodeBytesBase64Url(bytes, deps) {
	return toBase64Url(deps.btoa(bytesToBinaryString(bytes, deps)));
}
async function hmacSha256(secretText, messageText, deps) {
	const encoder = new deps.textEncoderCtor();
	const key = await deps.cryptoLike.subtle.importKey(
		"raw",
		encoder.encode(secretText),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await deps.cryptoLike.subtle.sign(
		"HMAC",
		key,
		encoder.encode(messageText),
	);
	return deps.arrayFrom(new deps.uint8ArrayCtor(signature));
}
export async function signPayloadBase64Url(payloadBase64Url, deps) {
	const signatureBytes = await hmacSha256(deps.accessPassphrase, payloadBase64Url, deps);
	return encodeBytesBase64Url(signatureBytes, deps);
}
