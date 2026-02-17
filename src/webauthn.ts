// WebAuthn (passkey) server-side helpers.
// Uses @simplewebauthn/server for crypto, KV for challenge & credential persistence.
//
// GEMINI-CONTEXT: This module is part of the passkey enrollment feature. Passphrase
// is the first factor; passkey/TOTP is the second. requireUserVerification is false
// because the passphrase already verified the user. verify* wrappers catch thrown
// errors from @simplewebauthn/server (the library throws on invalid responses rather
// than returning verified:false in most failure cases).
// userID in generateRegistrationOptions is optional per the d.ts — it defaults to a
// random value. This is a single-owner system so we don't need deterministic user IDs.

import {
	generateRegistrationOptions,
	verifyRegistrationResponse,
	generateAuthenticationOptions,
	verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
	AuthenticationResponseJSON,
	AuthenticatorTransportFuture,
	PublicKeyCredentialCreationOptionsJSON,
	PublicKeyCredentialRequestOptionsJSON,
	RegistrationResponseJSON,
	WebAuthnCredential,
} from "@simplewebauthn/server";
import type { AuthRequest } from "@cloudflare/workers-oauth-provider";

// ── KV key constants ───────────────────────────────────────────────
export const PASSKEY_CRED_KEY = "ks:passkey:cred";
const CHALLENGE_PREFIX = "ks:passkey:challenge:";
const CHALLENGE_TTL_SECONDS = 5 * 60;

// ── Credential KV helpers ──────────────────────────────────────────

interface StoredCredential {
	id: string;
	publicKey: string; // base64url-encoded
	counter: number;
	transports?: AuthenticatorTransportFuture[];
}

function uint8ToBase64url(buf: Uint8Array): string {
	let str = "";
	for (const b of buf) str += String.fromCharCode(b);
	return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64urlToUint8(b64: string): Uint8Array<ArrayBuffer> {
	let str = b64.replace(/-/g, "+").replace(/_/g, "/");
	while (str.length % 4) str += "=";
	const binary = atob(str);
	const ab = new ArrayBuffer(binary.length);
	const buf = new Uint8Array(ab);
	for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
	return buf;
}

export async function getCredential(kv: KVNamespace): Promise<WebAuthnCredential | null> {
	const raw = await kv.get(PASSKEY_CRED_KEY);
	if (!raw) return null;
	const stored: StoredCredential = JSON.parse(raw);
	return {
		id: stored.id,
		publicKey: base64urlToUint8(stored.publicKey),
		counter: stored.counter,
		transports: stored.transports,
	};
}

export async function storeCredential(kv: KVNamespace, cred: WebAuthnCredential): Promise<void> {
	const stored: StoredCredential = {
		id: cred.id,
		publicKey: uint8ToBase64url(cred.publicKey),
		counter: cred.counter,
		transports: cred.transports,
	};
	await kv.put(PASSKEY_CRED_KEY, JSON.stringify(stored));
}

export async function updateCredentialCounter(kv: KVNamespace, newCounter: number): Promise<void> {
	const cred = await getCredential(kv);
	if (!cred) return;
	cred.counter = newCounter;
	await storeCredential(kv, cred);
}

// ── Challenge KV helpers ───────────────────────────────────────────

interface StoredChallenge {
	challenge: string;
	oauthReq: AuthRequest;
	type: "registration" | "authentication";
}

export function challengeKey(nonce: string): string {
	return `${CHALLENGE_PREFIX}${nonce}`;
}

export async function storeChallenge(
	kv: KVNamespace,
	nonce: string,
	challenge: string,
	oauthReq: AuthRequest,
	type: "registration" | "authentication",
): Promise<void> {
	const value: StoredChallenge = { challenge, oauthReq, type };
	await kv.put(challengeKey(nonce), JSON.stringify(value), {
		expirationTtl: CHALLENGE_TTL_SECONDS,
	});
}

export async function consumeChallenge(kv: KVNamespace, nonce: string): Promise<StoredChallenge | null> {
	const key = challengeKey(nonce);
	const raw = await kv.get(key);
	await kv.delete(key);
	if (!raw) return null;
	return JSON.parse(raw) as StoredChallenge;
}

// ── Registration (enrollment) ──────────────────────────────────────

export async function createRegistrationOptions(
	rpID: string,
	rpName: string,
	existingCred: WebAuthnCredential | null,
): Promise<PublicKeyCredentialCreationOptionsJSON> {
	// userID is omitted — @simplewebauthn/server generates a random value by default.
	// This is fine for a single-owner system where we don't need deterministic user IDs.
	return generateRegistrationOptions({
		rpName,
		rpID,
		userName: "owner",
		userDisplayName: "Owner",
		attestationType: "none",
		authenticatorSelection: {
			residentKey: "preferred",
			userVerification: "preferred",
		},
		excludeCredentials: existingCred
			? [{ id: existingCred.id, transports: existingCred.transports }]
			: [],
	});
}

export async function verifyRegistration(
	response: RegistrationResponseJSON,
	expectedChallenge: string,
	expectedOrigin: string,
	expectedRPID: string,
): Promise<WebAuthnCredential | null> {
	try {
		const verification = await verifyRegistrationResponse({
			response,
			expectedChallenge,
			expectedOrigin,
			expectedRPID,
			requireUserVerification: false,
		});

		if (!verification.verified || !verification.registrationInfo) return null;
		return verification.registrationInfo.credential;
	} catch {
		return null;
	}
}

// ── Authentication ─────────────────────────────────────────────────

export async function createAuthenticationOptions(
	rpID: string,
	credential: WebAuthnCredential,
): Promise<PublicKeyCredentialRequestOptionsJSON> {
	return generateAuthenticationOptions({
		rpID,
		allowCredentials: [{ id: credential.id, transports: credential.transports }],
		userVerification: "preferred",
	});
}

export async function verifyAuthentication(
	response: AuthenticationResponseJSON,
	expectedChallenge: string,
	expectedOrigin: string,
	expectedRPID: string,
	credential: WebAuthnCredential,
): Promise<{ verified: boolean; newCounter: number }> {
	try {
		const verification = await verifyAuthenticationResponse({
			response,
			expectedChallenge,
			expectedOrigin,
			expectedRPID,
			credential,
			requireUserVerification: false,
		});

		return {
			verified: verification.verified,
			newCounter: verification.authenticationInfo.newCounter,
		};
	} catch {
		return { verified: false, newCounter: 0 };
	}
}
