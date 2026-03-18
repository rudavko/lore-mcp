/** @implements NFR-001 — Shared Std factory extracted into lore-mcp so runtime globals stay dependency-injected. */

function ok(value) {
	return { ok: true, value };
}

function err(error) {
	return { ok: false, error };
}

export function createStd(g) {
	return {
		Math: {
			abs: g.Math.abs,
			acos: g.Math.acos,
			acosh: g.Math.acosh,
			asin: g.Math.asin,
			asinh: g.Math.asinh,
			atan: g.Math.atan,
			atanh: g.Math.atanh,
			atan2: g.Math.atan2,
			cbrt: g.Math.cbrt,
			ceil: g.Math.ceil,
			clz32: g.Math.clz32,
			cos: g.Math.cos,
			cosh: g.Math.cosh,
			exp: g.Math.exp,
			expm1: g.Math.expm1,
			floor: g.Math.floor,
			fround: g.Math.fround,
			hypot: g.Math.hypot,
			imul: g.Math.imul,
			log: g.Math.log,
			log1p: g.Math.log1p,
			log10: g.Math.log10,
			log2: g.Math.log2,
			max: g.Math.max,
			min: g.Math.min,
			pow: g.Math.pow,
			round: g.Math.round,
			sign: g.Math.sign,
			sin: g.Math.sin,
			sinh: g.Math.sinh,
			sqrt: g.Math.sqrt,
			tan: g.Math.tan,
			tanh: g.Math.tanh,
			trunc: g.Math.trunc,
			E: g.Math.E,
			LN2: g.Math.LN2,
			LN10: g.Math.LN10,
			LOG2E: g.Math.LOG2E,
			LOG10E: g.Math.LOG10E,
			PI: g.Math.PI,
			SQRT1_2: g.Math.SQRT1_2,
			SQRT2: g.Math.SQRT2,
		},
		Object: {
			is: g.Object.is,
			keys: g.Object.keys,
			values: g.Object.values,
			entries: g.Object.entries,
			hasOwn: g.Object.hasOwn,
			create: g.Object.create,
			fromEntries: g.Object.fromEntries,
			getPrototypeOf: g.Object.getPrototypeOf,
			getOwnPropertyNames: g.Object.getOwnPropertyNames,
			getOwnPropertyDescriptor: g.Object.getOwnPropertyDescriptor,
			getOwnPropertyDescriptors: g.Object.getOwnPropertyDescriptors,
			isExtensible: g.Object.isExtensible,
			isFrozen: g.Object.isFrozen,
			isSealed: g.Object.isSealed,
		},
		Number: g.Object.assign((v) => g.Number(v), {
			isFinite: g.Number.isFinite,
			isInteger: g.Number.isInteger,
			isNaN: g.Number.isNaN,
			isSafeInteger: g.Number.isSafeInteger,
			parseFloat: g.Number.parseFloat,
			parseInt: g.Number.parseInt,
		}),
		Array: {
			isArray: g.Array.isArray,
			from: g.Array.from.bind(g.Array),
			of: g.Array.of.bind(g.Array),
		},
		String: g.Object.assign((v) => g.String(v), {
			fromCharCode: g.String.fromCharCode,
			fromCodePoint: (...codePoints) => {
				try {
					return ok(g.String.fromCodePoint(...codePoints));
				} catch (error) {
					return err(error);
				}
			},
		}),
		Boolean: g.Boolean,
		json: {
			parse: (text) => {
				try {
					return ok(g.JSON.parse(text));
				} catch (error) {
					return err(error);
				}
			},
			stringify: (value) => {
				try {
					return ok(g.JSON.stringify(value));
				} catch (error) {
					return err(error);
				}
			},
		},
		Map: g.Map,
		Set: g.Set,
		WeakMap: g.WeakMap,
		WeakSet: g.WeakSet,
		error: {
			Error: (message, options) => new g.Error(message, options),
			TypeError: (message) => new g.TypeError(message),
			RangeError: (message) => new g.RangeError(message),
			SyntaxError: (message) => new g.SyntaxError(message),
			ReferenceError: (message) => new g.ReferenceError(message),
			URIError: (message) => new g.URIError(message),
			EvalError: (message) => new g.EvalError(message),
		},
		RegExp: {
			create: (pattern, flags) => {
				try {
					return ok(new g.RegExp(pattern, flags));
				} catch (error) {
					return err(error);
				}
			},
			escape:
				typeof g.RegExp.escape === "function"
					? g.RegExp.escape
					: (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
		},
		uri: {
			encodeURI: (s) => {
				try {
					return ok(g.encodeURI(s));
				} catch (error) {
					return err(error);
				}
			},
			encodeURIComponent: (s) => {
				try {
					return ok(g.encodeURIComponent(s));
				} catch (error) {
					return err(error);
				}
			},
			decodeURI: (s) => {
				try {
					return ok(g.decodeURI(s));
				} catch (error) {
					return err(error);
				}
			},
			decodeURIComponent: (s) => {
				try {
					return ok(g.decodeURIComponent(s));
				} catch (error) {
					return err(error);
				}
			},
		},
		Date: {
			UTC: g.Date.UTC,
		},
	};
}
