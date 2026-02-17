declare module "qrcode-svg" {
	interface QRCodeOptions {
		content: string;
		padding?: number;
		width?: number;
		height?: number;
		color?: string;
		background?: string;
		ecl?: "L" | "M" | "Q" | "H";
		join?: boolean;
		container?: "svg" | "svg-viewbox" | "none";
	}

	class QRCode {
		constructor(options: QRCodeOptions | string);
		svg(): string;
	}

	export = QRCode;
}
