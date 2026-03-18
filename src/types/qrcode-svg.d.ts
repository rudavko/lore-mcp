/** @implements FR-011 — Type declaration for QR-code generation dependency used in auth enrollment flows. */
declare module "qrcode-svg" {
	interface QrCodeOptions {
		content: string;
		[key: string]: unknown;
	}

	export default class QrCode {
		constructor(options: QrCodeOptions);
		svg(): string;
	}
}
