(function() {

//#region node_modules/zod/v4/core/util.js
	function getEnumValues(entries) {
		const numericValues = Object.values(entries).filter((v) => typeof v === "number");
		return Object.entries(entries).filter(([k, _]) => numericValues.indexOf(+k) === -1).map(([_, v]) => v);
	}
	function joinValues(array, separator = "|") {
		return array.map((val) => stringifyPrimitive(val)).join(separator);
	}
	function jsonStringifyReplacer(_, value) {
		if (typeof value === "bigint") return value.toString();
		return value;
	}
	var Cached = class {
		constructor(getter) {
			this._getter = getter;
			this._value = void 0;
		}
		get value() {
			const getter = this._getter;
			if (getter !== void 0) {
				this._value = getter();
				this._getter = void 0;
			}
			return this._value;
		}
	};
	function cached(getter) {
		return new Cached(getter);
	}
	function nullish(input) {
		return input === null || input === void 0;
	}
	function cleanRegex(source) {
		const start = source.startsWith("^") ? 1 : 0;
		const end = source.endsWith("$") ? source.length - 1 : source.length;
		return source.slice(start, end);
	}
	function floatSafeRemainder(val, step) {
		const ratio = val / step;
		const roundedRatio = Math.round(ratio);
		const tolerance = 4 * Number.EPSILON * Math.max(Math.abs(ratio), 1);
		if (Math.abs(ratio - roundedRatio) < tolerance) return 0;
		return ratio - roundedRatio;
	}
	function assignProp(target, prop, value) {
		Object.defineProperty(target, prop, {
			value,
			writable: true,
			enumerable: true,
			configurable: true
		});
	}
	/**
	* Whichever object a def's `shape` currently answers from: the one the caller passed until the first read, the frozen copy after it.
	*
	* Its keys and descriptors read without invoking anything, which is what lets a discriminated union check its discriminator, and the cycle walk read a shape, without resolving a getter that references the schema being constructed. A def that answers `shape` from an accessor of its own has none.
	*/
	function rawShape(def) {
		const desc = Object.getOwnPropertyDescriptor(def, "shape");
		return desc?.get ? desc.get.raw : desc?.value;
	}
	function sourceShape(schema) {
		return rawShape(schema._zod.def) ?? schema._zod.def.shape;
	}
	function deferProp(target, key, getter) {
		Object.defineProperty(target, key, {
			get() {
				const value = getter();
				assignProp(this, key, value);
				return value;
			},
			enumerable: true,
			configurable: true
		});
	}
	function putProp(target, key, value) {
		if (key in target) assignProp(target, key, value);
		else target[key] = value;
	}
	/**
	* Copies `keys` of `source`'s shape onto `target`, each value passed through `wrap`.
	*
	* A key the source has resolved is copied through now, so the derived shape states it outright and nothing has to resolve it to learn what it holds. A key the source still defers stays deferred, and reads back through the source's own `shape`, so it resolves once and both shapes get that one schema.
	*/
	function mirrorShape(target, source, keys, wrap) {
		const raw = sourceShape(source);
		for (const key of keys) {
			const desc = Object.getOwnPropertyDescriptor(raw, key);
			if (!desc.enumerable) continue;
			if (desc.get) deferProp(target, key, () => {
				const value = source._zod.def.shape[key];
				return wrap ? wrap(value, key) : value;
			});
			else putProp(target, key, wrap ? wrap(desc.value, key) : desc.value);
		}
	}
	function mirrorProps(target, source) {
		for (const key of Reflect.ownKeys(source)) {
			const desc = Object.getOwnPropertyDescriptor(source, key);
			if (!desc.enumerable) continue;
			if (desc.get) deferProp(target, key, () => source[key]);
			else putProp(target, key, desc.value);
		}
	}
	function mergeDefs(...defs) {
		const mergedDescriptors = {};
		for (const def of defs) {
			const descriptors = Object.getOwnPropertyDescriptors(def);
			Object.assign(mergedDescriptors, descriptors);
		}
		return Object.defineProperties({}, mergedDescriptors);
	}
	function esc$1(str) {
		return JSON.stringify(str);
	}
	function slugify(input) {
		return input.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
	}
	const captureStackTrace = "captureStackTrace" in Error ? Error.captureStackTrace : (..._args) => {};
	function isObject(data) {
		return typeof data === "object" && data !== null && !Array.isArray(data);
	}
	const allowsEval = /* @__PURE__*/ cached(() => {
		if (globalConfig.jitless) return false;
		if (typeof navigator !== "undefined" && navigator?.userAgent?.includes("Cloudflare")) return false;
		try {
			new Function("");
			return true;
		} catch (_) {
			return false;
		}
	});
	function isPlainObject(o) {
		if (isObject(o) === false) return false;
		const ctor = o.constructor;
		if (ctor === void 0) return true;
		if (typeof ctor !== "function") return true;
		const prot = ctor.prototype;
		if (isObject(prot) === false) return false;
		if (Object.prototype.hasOwnProperty.call(prot, "isPrototypeOf") === false) return false;
		return true;
	}
	function shallowClone(o) {
		if (isPlainObject(o)) return { ...o };
		if (Array.isArray(o)) return [...o];
		if (o instanceof Map) return new Map(o);
		if (o instanceof Set) return new Set(o);
		return o;
	}
	const propertyKeyTypes = /* @__PURE__*/ new Set([
		"string",
		"number",
		"symbol"
	]);
	function escapeRegex(str) {
		return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}
	function clone(inst, def, params) {
		const cl = new inst._zod.constr(def ?? inst._zod.def);
		if (!def || params?.parent) cl._zod.parent = inst;
		return cl;
	}
	function normalizeParams(_params) {
		const params = _params;
		if (!params) return {};
		if (typeof params === "string") return { error: () => params };
		if (params?.message !== void 0) {
			if (params?.error !== void 0) throw new Error("Cannot specify both `message` and `error` params");
			params.error = params.message;
		}
		delete params.message;
		if (typeof params.error === "string") return {
			...params,
			error: () => params.error
		};
		return params;
	}
	function stringifyPrimitive(value) {
		if (typeof value === "bigint") return value.toString() + "n";
		if (typeof value === "string") return `"${value}"`;
		return `${value}`;
	}
	function optionalKeys(shape) {
		return Object.keys(shape).filter((k) => {
			return shape[k]._zod.optin !== void 0 && shape[k]._zod.optout === "optional";
		});
	}
	const NUMBER_FORMAT_RANGES = /*@__PURE__*/ (() => ({
		safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
		int32: [-2147483648, 2147483647],
		uint32: [0, 4294967295],
		float32: [-34028234663852886e22, 34028234663852886e22],
		float64: [-Number.MAX_VALUE, Number.MAX_VALUE]
	}))();
	const BIGINT_FORMAT_RANGES = {
		int64: [/* @__PURE__*/ BigInt("-9223372036854775808"), /* @__PURE__*/ BigInt("9223372036854775807")],
		uint64: [/* @__PURE__*/ BigInt(0), /* @__PURE__*/ BigInt("18446744073709551615")]
	};
	function pick(schema, mask) {
		const currDef = schema._zod.def;
		const checks = currDef.checks;
		if (checks && checks.length > 0) throw new Error(".pick() cannot be used on object schemas containing refinements");
		const newShape = {};
		mirrorShape(newShape, schema, maskedKeys(schema, mask));
		return clone(schema, mergeDefs(currDef, {
			shape: newShape,
			checks: []
		}));
	}
	function maskedKeys(schema, mask) {
		const raw = sourceShape(schema);
		const keys = [];
		for (const key of Reflect.ownKeys(mask)) {
			if (!Object.getOwnPropertyDescriptor(raw, key)?.enumerable) throw new Error(`Unrecognized key: "${String(key)}"`);
			if (mask[key]) keys.push(key);
		}
		return keys;
	}
	function omit(schema, mask) {
		const currDef = schema._zod.def;
		const checks = currDef.checks;
		if (checks && checks.length > 0) throw new Error(".omit() cannot be used on object schemas containing refinements");
		const omitted = new Set(maskedKeys(schema, mask));
		const newShape = {};
		mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)).filter((key) => !omitted.has(key)));
		return clone(schema, mergeDefs(currDef, {
			shape: newShape,
			checks: []
		}));
	}
	function extend(schema, shape) {
		if (!isPlainObject(shape)) throw new Error("Invalid input to extend: expected a plain object");
		const checks = schema._zod.def.checks;
		if (checks && checks.length > 0) {
			const existingShape = sourceShape(schema);
			for (const key of Reflect.ownKeys(shape)) if (Object.getOwnPropertyDescriptor(existingShape, key) !== void 0) throw new Error("Cannot overwrite keys on object schemas containing refinements. Use `.safeExtend()` instead.");
		}
		return clone(schema, mergeDefs(schema._zod.def, { shape: extended(schema, shape) }));
	}
	function extended(schema, shape) {
		const newShape = {};
		mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)));
		mirrorProps(newShape, shape);
		return newShape;
	}
	function safeExtend(schema, shape) {
		if (!isPlainObject(shape)) throw new Error("Invalid input to safeExtend: expected a plain object");
		return clone(schema, mergeDefs(schema._zod.def, { shape: extended(schema, shape) }));
	}
	function merge(a, b) {
		if (!b?._zod?.def) throw new Error("Invalid input to merge: expected an object schema. To merge a plain shape, use `.extend()`.");
		if (a._zod.def.checks?.length) throw new Error(".merge() cannot be used on object schemas containing refinements. Use .safeExtend() instead.");
		const newShape = {};
		mirrorShape(newShape, a, Reflect.ownKeys(sourceShape(a)));
		mirrorShape(newShape, b, Reflect.ownKeys(sourceShape(b)));
		return clone(a, mergeDefs(a._zod.def, {
			shape: newShape,
			get catchall() {
				return b._zod.def.catchall;
			},
			checks: b._zod.def.checks ?? []
		}));
	}
	function partial(Class, schema, mask, name = "partial") {
		const checks = schema._zod.def.checks;
		if (checks && checks.length > 0) throw new Error(`.${name}() cannot be used on object schemas containing refinements`);
		const selected = mask ? new Set(maskedKeys(schema, mask)) : void 0;
		const newShape = {};
		mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)), Class && ((value, key) => selected && !selected.has(key) ? value : new Class({
			type: "optional",
			innerType: value
		})));
		return clone(schema, mergeDefs(schema._zod.def, {
			shape: newShape,
			checks: []
		}));
	}
	function required(Class, schema, mask) {
		const selected = mask ? new Set(maskedKeys(schema, mask)) : void 0;
		const newShape = {};
		mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)), (value, key) => selected && !selected.has(key) ? value : new Class({
			type: "nonoptional",
			innerType: value
		}));
		return clone(schema, mergeDefs(schema._zod.def, { shape: newShape }));
	}
	function aborted(x, startIndex = 0) {
		if (x.aborted === true) return true;
		for (let i = startIndex; i < x.issues.length; i++) if (x.issues[i]?.continue !== true) return true;
		return false;
	}
	function explicitlyAborted(x, startIndex = 0) {
		if (x.aborted === true) return true;
		for (let i = startIndex; i < x.issues.length; i++) if (x.issues[i]?.continue === false) return true;
		return false;
	}
	function prefixIssues(path, issues) {
		return issues.map((iss) => {
			var _a;
			(_a = iss).path ?? (_a.path = []);
			iss.path.unshift(path);
			return iss;
		});
	}
	function unwrapMessage(message) {
		return typeof message === "string" ? message : message?.message;
	}
	function attachSchema(issues, start, inst) {
		var _a;
		for (let i = start; i < issues.length; i++) (_a = issues[i]).schema ?? (_a.schema = inst);
	}
	function finalizeIssue(iss, ctx, config) {
		var _a;
		const traits = iss.inst?._zod?.traits;
		if (traits?.has("$ZodType")) {
			if (traits.has("$ZodCheck")) (_a = iss).schema ?? (_a.schema = iss.inst);
			else iss.schema = iss.inst;
		}
		const schemaError = iss.schema !== iss.inst ? iss.schema?._zod.def?.error : void 0;
		const message = iss.message ? iss.message : unwrapMessage(iss.inst?._zod.def?.error?.(iss)) ?? unwrapMessage(schemaError?.(iss)) ?? unwrapMessage(ctx?.error?.(iss)) ?? unwrapMessage(config.customError?.(iss)) ?? unwrapMessage(config.localeError?.(iss)) ?? "Invalid input";
		const full = {};
		for (const k of Object.keys(iss)) {
			if (k === "inst" || k === "schema" || k === "continue" || k === "input" || k === "__proto__") continue;
			full[k] = iss[k];
		}
		full.path ?? (full.path = []);
		full.message = message;
		if (ctx?.reportInput) full.input = iss.input;
		return full;
	}
	const highSurrogate = /[\uD800-\uDBFF]/;
	function codePointLength(str) {
		const units = str.length;
		if (!highSurrogate.test(str)) return units;
		let count = units;
		for (let i = 0; i < units - 1; i++) if ((str.charCodeAt(i) & 64512) === 55296 && (str.charCodeAt(i + 1) & 64512) === 56320) {
			count--;
			i++;
		}
		return count;
	}
	function getLengthableOrigin(input) {
		if (Array.isArray(input)) return "array";
		if (typeof input === "string") return "string";
		return "unknown";
	}
	function parsedType(data) {
		const t = typeof data;
		switch (t) {
			case "number": return Number.isNaN(data) ? "nan" : "number";
			case "object": {
				if (data === null) return "null";
				if (Array.isArray(data)) return "array";
				const obj = data;
				if (obj && Object.getPrototypeOf(obj) !== Object.prototype && "constructor" in obj && obj.constructor) return obj.constructor.name;
			}
		}
		return t;
	}
	function issue(...args) {
		const [iss, input, inst] = args;
		if (typeof iss === "string") return {
			message: iss,
			code: "custom",
			input,
			inst
		};
		return { ...iss };
	}
	/**
	* Installs a trait's members on its prototype. Each value builds that member for the instance on first read; the built value shadows the accessor as an own property, so a detached `const { parse } = schema` keeps working.
	*
	* Call this from a `proto` initializer, which runs once per prototype — never per instance.
	*/
	function members(proto, table) {
		for (const key in table) {
			const desc = Object.getOwnPropertyDescriptor(table, key);
			if (desc.get) Object.defineProperty(proto, key, {
				...desc,
				enumerable: false
			});
			else defineBound(proto, key, desc.value);
		}
	}
	/** Shadows a prototype member with an own value, so a getter that builds from the instance runs once. */
	function own(inst, key, value, enumerable = true) {
		Object.defineProperty(inst, key, {
			configurable: true,
			writable: true,
			enumerable,
			value
		});
		return value;
	}
	/** Like {@link own}, for a member that was never an own data property and has to stay out of `Object.keys`. */
	function hide(inst, key, value) {
		return own(inst, key, value, false);
	}
	/** Adds members a table derives from the instance: each builds on first read and shadows as own data, and assignment shadows the same way, as when these were own properties. */
	function derived(computes, table) {
		for (const key in computes) {
			const compute = computes[key];
			Object.defineProperty(table, key, {
				configurable: true,
				enumerable: true,
				get() {
					return own(this, key, compute(this));
				},
				set(value) {
					own(this, key, value);
				}
			});
		}
		return table;
	}
	function defineBound(proto, key, fn) {
		Object.defineProperty(proto, key, {
			configurable: true,
			get() {
				return this == null ? fn : own(this, key, fn.bind(this));
			},
			set(value) {
				own(this, key, value);
			}
		});
	}
	/** Returns the prototype to install on, or `undefined` if this group is already installed on it. */
	function claim(inst, sentinel) {
		const proto = Object.getPrototypeOf(inst);
		return sentinel in proto ? void 0 : proto;
	}
	let installing;
	let broke = false;
	const breaker = {
		configurable: true,
		get() {
			broke = true;
		}
	};
	/**
	* Installs a lazily-derived internal on the `_zod` prototype of `inst`'s
	* constructor, computed from the internals object itself and cached there on
	* first read. One accessor per constructor rather than one per instance.
	*/
	function defineLazyInternal(inst, key, compute) {
		const proto = Object.getPrototypeOf(inst._zod);
		if (key in proto && installing !== inst._zod) {
			installing = void 0;
			return;
		}
		installing = inst._zod;
		Object.defineProperty(proto, key, {
			configurable: true,
			get() {
				Object.defineProperty(this, key, breaker);
				const outer = broke;
				broke = false;
				try {
					const value = compute(this);
					if (broke) delete this[key];
					else Object.defineProperty(this, key, {
						configurable: true,
						writable: true,
						value
					});
					broke = broke || outer;
					return value;
				} catch (err) {
					delete this[key];
					broke = broke || outer;
					throw err;
				}
			},
			set(value) {
				Object.defineProperty(this, key, {
					configurable: true,
					writable: true,
					value
				});
			}
		});
	}
	/**
	* Installs `key` on `inst`'s prototype, computed by `make` on first read and cached there as an own
	* data property. One accessor per constructor rather than one per instance, because an own accessor
	* puts every instance after the first into v8 dictionary mode. The key doubles as the sentinel.
	*/
	function installLazyProp(inst, key, make, enumerable) {
		const proto = claim(inst, key);
		if (!proto) return;
		Object.defineProperty(proto, key, {
			configurable: true,
			get() {
				const desc = {
					configurable: true,
					writable: true,
					enumerable,
					value: void 0
				};
				Object.defineProperty(this, key, desc);
				desc.value = make(this);
				Object.defineProperty(this, key, desc);
				return desc.value;
			},
			set(value) {
				Object.defineProperty(this, key, {
					configurable: true,
					writable: true,
					enumerable,
					value
				});
			}
		});
	}
	/** Marks the thunk `_catch` synthesises for a constant catch value. `Function.length` cannot tell that thunk from a user callback — rest and defaulted parameters both report arity 0 — and a user callback reads `ctx.error`, whose issues only finalize correctly against the caller's per-parse error map. Provenance can say what arity cannot. A plain string key rather than `Symbol.for`, whose call at module scope no bundler can prove pure — the same shape that anchored `urlCanParse` into every build. */
	const CONSTANT_CATCH = "~constantCatch";
	/** Wraps a constant catch value in a thunk tagged with {@link CONSTANT_CATCH}. */
	function constantCatch(value) {
		const fn = () => value;
		fn[CONSTANT_CATCH] = true;
		return fn;
	}

//#endregion
//#region node_modules/zod/v4/core/core.js
	var _a$1;
	const _zodDesc = {
		value: void 0,
		enumerable: false
	};
	let _E = "captureStackTrace" in Error ? Error : null;
	function newError(Definition) {
		const E = _E;
		if (E) {
			const saved = E.stackTraceLimit;
			if (typeof saved === "number") {
				try {
					E.stackTraceLimit = 0;
				} catch {
					_E = null;
					return new Definition();
				}
				try {
					return new Definition();
				} finally {
					E.stackTraceLimit = saved;
				}
			}
		}
		return new Definition();
	}
	function $constructor(name, initializer, proto, params) {
		const zodProto = {};
		function Internals(def) {
			this.def = def;
			this.constr = _;
			this.traits = /* @__PURE__ */ new Set();
		}
		Internals.prototype = zodProto;
		const protoMembers = proto;
		const initialized = protoMembers && /* @__PURE__ */ new WeakSet();
		function init(inst, def) {
			if (!inst._zod) {
				_zodDesc.value = new Internals(def);
				try {
					Object.defineProperty(inst, "_zod", _zodDesc);
				} finally {
					_zodDesc.value = void 0;
				}
			} else if (inst._zod.traits.has(name)) return;
			inst._zod.traits.add(name);
			initializer(inst, def);
			if (initialized) {
				const own = Object.getPrototypeOf(inst);
				const ctorProto = inst._zod.constr.prototype;
				let up = own;
				while (up && up !== ctorProto) up = Object.getPrototypeOf(up);
				const target = up ?? own;
				if (!initialized.has(target)) {
					initialized.add(target);
					members(target, protoMembers);
				}
			}
			const proto = _.prototype;
			for (const k in proto) {
				if (!Object.prototype.hasOwnProperty.call(proto, k)) continue;
				if (!(k in inst)) inst[k] = proto[k].bind(inst);
			}
		}
		const Parent = params?.Parent ?? Object;
		class Definition extends Parent {}
		Object.defineProperty(Definition, "name", { value: name });
		function _(def) {
			const inst = params?.Parent ? newError(Definition) : this;
			init(inst, def);
			const deferred = inst._zod.deferred;
			if (deferred) {
				for (const fn of deferred) fn();
				inst._zod.deferred = void 0;
			}
			const pp = globalThis.__zod_globalConfig?.postProcessor;
			if (pp) pp(inst);
			return inst;
		}
		Object.defineProperty(_, "init", { value: init });
		Object.defineProperty(_, Symbol.hasInstance, { value: (inst) => {
			if (params?.Parent && inst instanceof params.Parent) return true;
			return inst?._zod?.traits?.has(name);
		} });
		Object.defineProperty(_, "name", { value: name });
		return _;
	}
	var $ZodAsyncError = class extends Error {
		constructor() {
			super(`Encountered Promise during synchronous parse. Use .parseAsync() instead.`);
		}
	};
	var $ZodEncodeError = class extends Error {
		constructor(name) {
			super(`Encountered unidirectional transform during encode: ${name}`);
			this.name = "ZodEncodeError";
		}
	};
	(_a$1 = globalThis).__zod_globalConfig ?? (_a$1.__zod_globalConfig = {});
	const globalConfig = globalThis.__zod_globalConfig;
	function config(newConfig) {
		if (newConfig) Object.assign(globalConfig, newConfig);
		return globalConfig;
	}

//#endregion
//#region node_modules/zod/v4/core/errors.js
	function _getMessage() {
		const internals = this._zod;
		internals.message ?? (internals.message = JSON.stringify(internals.def, jsonStringifyReplacer, 2));
		return internals.message;
	}
	function _setMessage(value) {
		this._zod.message = value;
	}
	const _messageDesc = {
		get: _getMessage,
		set: _setMessage,
		enumerable: true,
		configurable: true
	};
	const _issuesDesc = {
		value: void 0,
		enumerable: false
	};
	const _installedToString = /* @__PURE__ */ new WeakSet([Object.prototype, Error.prototype]);
	const initializer$1 = (inst, def) => {
		inst.name = "$ZodError";
		_issuesDesc.value = def;
		Object.defineProperty(inst, "issues", _issuesDesc);
		_issuesDesc.value = void 0;
		Object.defineProperty(inst, "message", _messageDesc);
		const proto = Object.getPrototypeOf(inst);
		if (!_installedToString.has(proto)) {
			_installedToString.add(proto);
			Object.defineProperty(proto, "toString", {
				configurable: true,
				enumerable: false,
				get() {
					const value = () => this.message;
					Object.defineProperty(this, "toString", {
						value,
						configurable: true,
						writable: true
					});
					return value;
				},
				set(value) {
					Object.defineProperty(this, "toString", {
						value,
						configurable: true,
						writable: true
					});
				}
			});
		}
	};
	const $ZodError = $constructor("$ZodError", initializer$1);
	const $ZodRealError = $constructor("$ZodError", initializer$1, void 0, { Parent: Error });
	/** Get-or-create `obj[key]` as an own data property. A path segment naming an inherited member
	* ("toString", "constructor") would otherwise read through to the prototype, and assigning
	* "__proto__" would hit the setter instead of creating a key. */
	function node(obj, key, make) {
		if (!Object.prototype.hasOwnProperty.call(obj, key)) {
			if (key === "__proto__") Object.defineProperty(obj, key, {
				value: make(),
				writable: true,
				enumerable: true,
				configurable: true
			});
			else obj[key] = make();
		}
		return obj[key];
	}
	function flattenError(error, mapper = (issue) => issue.message) {
		const fieldErrors = {};
		const formErrors = [];
		for (const sub of error.issues) if (sub.path.length > 0) node(fieldErrors, sub.path[0], () => []).push(mapper(sub));
		else formErrors.push(mapper(sub));
		return {
			formErrors,
			fieldErrors
		};
	}
	function formatError(error, mapper = (issue) => issue.message) {
		const fieldErrors = { _errors: [] };
		const processError = (error, path = []) => {
			for (const issue of error.issues) if (issue.code === "invalid_union" && issue.errors.length) issue.errors.map((issues) => processError({ issues }, [...path, ...issue.path]));
			else if (issue.code === "invalid_key") processError({ issues: issue.issues }, [...path, ...issue.path]);
			else if (issue.code === "invalid_element") processError({ issues: issue.issues }, [...path, ...issue.path]);
			else {
				const fullpath = [...path, ...issue.path];
				if (fullpath.length === 0) fieldErrors._errors.push(mapper(issue));
				else {
					let curr = fieldErrors;
					let i = 0;
					while (i < fullpath.length) {
						const el = fullpath[i];
						const terminal = i === fullpath.length - 1;
						if (el === "_errors") {
							if (terminal) curr._errors.push(mapper(issue));
							i++;
							continue;
						}
						if (!Object.prototype.hasOwnProperty.call(curr, el)) Object.defineProperty(curr, el, {
							value: { _errors: [] },
							enumerable: true,
							writable: true,
							configurable: true
						});
						const node = curr[el];
						if (terminal) node._errors.push(mapper(issue));
						curr = node;
						i++;
					}
				}
			}
		};
		processError(error);
		return fieldErrors;
	}

//#endregion
//#region node_modules/zod/v4/core/parse.js
	function finalizeParams(callee, params) {
		return {
			callee: params?.callee ?? callee,
			Err: params?.Err
		};
	}
	const _parse = (_Err) => {
		const fn = (schema, value, _ctx, _params) => {
			const ctx = _ctx ? {
				..._ctx,
				async: false
			} : { async: false };
			const result = schema._zod.run({
				value,
				issues: []
			}, ctx);
			if (result instanceof Promise) throw new $ZodAsyncError();
			if (result.issues.length) {
				const e = new ((_params?.Err) ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
				captureStackTrace(e, _params?.callee ?? fn);
				throw e;
			}
			return result.value;
		};
		return fn;
	};
	const _parseAsync = (_Err) => {
		const fn = async (schema, value, _ctx, params) => {
			const ctx = _ctx ? {
				..._ctx,
				async: true
			} : { async: true };
			let result = schema._zod.run({
				value,
				issues: []
			}, ctx);
			if (result instanceof Promise) result = await result;
			if (result.issues.length) {
				const e = new ((params?.Err) ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
				captureStackTrace(e, params?.callee ?? fn);
				throw e;
			}
			return result.value;
		};
		return fn;
	};
	const _safeParse = (_Err) => (schema, value, _ctx) => {
		const ctx = _ctx ? {
			..._ctx,
			async: false
		} : { async: false };
		const result = schema._zod.run({
			value,
			issues: []
		}, ctx);
		if (result instanceof Promise) throw new $ZodAsyncError();
		return result.issues.length ? failure(_Err, result.issues, ctx) : {
			success: true,
			data: result.value
		};
	};
	function failure(Err, issues, ctx) {
		let error;
		return {
			success: false,
			get error() {
				if (!error) {
					error = new Err(issues.map((iss) => finalizeIssue(iss, ctx, config())));
					issues = void 0;
					ctx = void 0;
				}
				return error;
			},
			set error(e) {
				error = e;
				issues = void 0;
				ctx = void 0;
			}
		};
	}
	const _safeParseAsync = (_Err) => async (schema, value, _ctx) => {
		const ctx = _ctx ? {
			..._ctx,
			async: true
		} : { async: true };
		let result = schema._zod.run({
			value,
			issues: []
		}, ctx);
		if (result instanceof Promise) result = await result;
		return result.issues.length ? failure(_Err, result.issues, ctx) : {
			success: true,
			data: result.value
		};
	};
	const COMPILE_INVALID = /* @__PURE__ */ Symbol.for("zod.compile.invalid");
	const COMPILE_FALLBACK = /* @__PURE__ */ Symbol.for("zod.compile.fallback");
	const validate = ((schema, value, _ctx) => {
		const validator = schema._zod.bag.validator;
		if (validator !== void 0) {
			if (validator(value) !== COMPILE_INVALID) return true;
			if (validator.definite === true && _ctx === void 0) return false;
		}
		return validateFallback(schema, value, _ctx);
	});
	function validateFallback(schema, value, _ctx) {
		const ctx = _ctx ? {
			..._ctx,
			async: false,
			abortEarly: true
		} : {
			async: false,
			abortEarly: true
		};
		const fallbackRun = schema._zod.bag.fallbackRun;
		let result;
		if (fallbackRun) {
			ctx[COMPILE_FALLBACK] = true;
			result = fallbackRun({
				value,
				issues: []
			}, ctx);
		} else result = schema._zod.run({
			value,
			issues: []
		}, ctx);
		if (result instanceof Promise) throw new $ZodAsyncError();
		return result.issues.length === 0;
	}
	const validateAsync$1 = async (schema, value, _ctx) => {
		const ctx = _ctx ? {
			..._ctx,
			async: true,
			abortEarly: true
		} : {
			async: true,
			abortEarly: true
		};
		let result = schema._zod.run({
			value,
			issues: []
		}, ctx);
		if (result instanceof Promise) result = await result;
		return result.issues.length === 0;
	};
	const _encode = (_Err) => {
		const parse = _parse(_Err);
		const fn = (schema, value, _ctx, _params) => {
			const ctx = _ctx ? {
				..._ctx,
				direction: "backward"
			} : { direction: "backward" };
			return parse(schema, value, ctx, finalizeParams(fn, _params));
		};
		return fn;
	};
	const _decode = (_Err) => {
		const parse = _parse(_Err);
		const fn = (schema, value, _ctx, _params) => {
			return parse(schema, value, _ctx, finalizeParams(fn, _params));
		};
		return fn;
	};
	const _encodeAsync = (_Err) => {
		const parseAsync = _parseAsync(_Err);
		const fn = async (schema, value, _ctx, _params) => {
			const ctx = _ctx ? {
				..._ctx,
				direction: "backward"
			} : { direction: "backward" };
			return await parseAsync(schema, value, ctx, finalizeParams(fn, _params));
		};
		return fn;
	};
	const _decodeAsync = (_Err) => {
		const parseAsync = _parseAsync(_Err);
		const fn = async (schema, value, _ctx, _params) => {
			return await parseAsync(schema, value, _ctx, finalizeParams(fn, _params));
		};
		return fn;
	};
	const _safeEncode = (_Err) => (schema, value, _ctx) => {
		const ctx = _ctx ? {
			..._ctx,
			direction: "backward"
		} : { direction: "backward" };
		return _safeParse(_Err)(schema, value, ctx);
	};
	const _safeDecode = (_Err) => (schema, value, _ctx) => {
		return _safeParse(_Err)(schema, value, _ctx);
	};
	const _safeEncodeAsync = (_Err) => async (schema, value, _ctx) => {
		const ctx = _ctx ? {
			..._ctx,
			direction: "backward"
		} : { direction: "backward" };
		return _safeParseAsync(_Err)(schema, value, ctx);
	};
	const _safeDecodeAsync = (_Err) => async (schema, value, _ctx) => {
		return _safeParseAsync(_Err)(schema, value, _ctx);
	};

//#endregion
//#region node_modules/zod/v4/core/regexes.js
/**
	* @deprecated CUID v1 is deprecated by its authors due to information leakage
	* (timestamps embedded in the id). Use {@link cuid2} instead.
	* See https://github.com/paralleldrive/cuid.
	*/
	const cuid = /^[cC][0-9a-z]{6,}$/;
	const cuid2 = /^[0-9a-z]+$/;
	const ulid = /^[0-7][0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{25}$/;
	const xid = /^[0-9a-vA-V]{20}$/;
	const ksuid = /^[A-Za-z0-9]{27}$/;
	const nanoid = /^[a-zA-Z0-9_-]{21}$/;
	function nanoidOfLength(length) {
		return new RegExp(`^[a-zA-Z0-9_-]{${length}}$`);
	}
	/** ISO 8601-1 duration regex. Does not support the 8601-2 extensions like negative durations or fractional/negative components. */
	const duration = /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/;
	/** A regex for any UUID-like identifier: 8-4-4-4-12 hex pattern */
	const guid = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
	/** Returns a regex for validating an RFC 9562/4122 UUID.
	*
	* @param version Optionally specify a version 1-8. If no version is specified, all versions are supported. */
	const uuid = (version) => {
		if (!version) return /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;
		return new RegExp(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${version}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`);
	};
	/** Practical email validation */
	const email = /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
	const _emoji$1 = `^(?=[\\s\\S]*[\\p{Extended_Pictographic}\\p{Regional_Indicator}\\u20E3])[\\p{Extended_Pictographic}\\p{Emoji_Component}]+$`;
	function emoji() {
		return new RegExp(_emoji$1, "u");
	}
	const ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
	const ipv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;
	const cidrv4 = /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/;
	const cidrv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
	const base64 = /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/;
	const base64url = /^(?:[A-Za-z0-9_-]{4})*(?:[A-Za-z0-9_-]{2,3})?$/;
	const httpProtocol = /^https?$/;
	const e164 = /^\+[1-9]\d{6,14}$/;
	const dateSource = `(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))`;
	/** Anchors a pattern source. The interpolation lives here rather than at the call site because
	* esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it
	* will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */
	function anchor(source) {
		return new RegExp(`^${source}$`);
	}
	const date = /*@__PURE__*/ anchor(dateSource);
	function timeSource(args) {
		const hhmm = `(?:[01]\\d|2[0-3]):[0-5]\\d`;
		return typeof args.precision === "number" ? args.precision === -1 ? `${hhmm}` : args.precision === 0 ? `${hhmm}:[0-5]\\d` : `${hhmm}:[0-5]\\d\\.\\d{${args.precision}}` : args.seconds ? `${hhmm}:[0-5]\\d(?:\\.\\d+)?` : `${hhmm}(?::[0-5]\\d(?:\\.\\d+)?)?`;
	}
	function time(args) {
		return new RegExp(`^${timeSource(args)}$`);
	}
	function datetime(args) {
		const opts = ["Z"];
		if (args.offset) opts.push(`([+-](?:[01]\\d|2[0-3]):[0-5]\\d)`);
		const qualified = `${timeSource({
			precision: args.precision,
			seconds: true
		})}(?:${opts.join("|")})`;
		const timeRegex = args.local ? `${qualified}|${timeSource({ precision: args.precision })}` : qualified;
		return new RegExp(`^${dateSource}T(?:${timeRegex})$`);
	}
	const anyString = /^[\s\S]{0,}$/;
	const integer = /^-?\d+$/;
	const number$1 = /^-?\d+(?:\.\d+)?$/;
	const boolean$1 = /^(?:true|false)$/i;
	const lowercase = /^[^A-Z]*$/;
	const uppercase = /^[^a-z]*$/;

//#endregion
//#region node_modules/zod/v4/core/checks.js
	const $ZodCheck = /*@__PURE__*/ $constructor("$ZodCheck", (inst, def) => {
		var _a;
		inst._zod ?? (inst._zod = {});
		inst._zod.def = def;
		(_a = inst._zod).onattach ?? (_a.onattach = []);
	});
	/** Default `when` for length-based checks: run only on non-nullish values with a `length`. */
	const _whenHasLength = (payload) => {
		const val = payload.value;
		return !nullish(val) && val.length !== void 0;
	};
	const numericOriginMap = {
		number: "number",
		bigint: "bigint",
		object: "date"
	};
	const $ZodCheckLessThan = /*@__PURE__*/ $constructor("$ZodCheckLessThan", (inst, def) => {
		$ZodCheck.init(inst, def);
		const origin = numericOriginMap[typeof def.value];
		inst._zod.check = (payload) => {
			if (def.inclusive ? payload.value <= def.value : payload.value < def.value) return;
			payload.issues.push({
				origin: numericOriginMap[typeof payload.value] ?? origin,
				code: "too_big",
				maximum: typeof def.value === "object" ? def.value.getTime() : def.value,
				input: payload.value,
				inclusive: def.inclusive,
				inst,
				continue: !def.abort
			});
		};
	});
	const $ZodCheckGreaterThan = /*@__PURE__*/ $constructor("$ZodCheckGreaterThan", (inst, def) => {
		$ZodCheck.init(inst, def);
		const origin = numericOriginMap[typeof def.value];
		inst._zod.check = (payload) => {
			if (def.inclusive ? payload.value >= def.value : payload.value > def.value) return;
			payload.issues.push({
				origin: numericOriginMap[typeof payload.value] ?? origin,
				code: "too_small",
				minimum: typeof def.value === "object" ? def.value.getTime() : def.value,
				input: payload.value,
				inclusive: def.inclusive,
				inst,
				continue: !def.abort
			});
		};
	});
	const $ZodCheckMultipleOf = /*@__PURE__*/ $constructor("$ZodCheckMultipleOf", (inst, def) => {
		$ZodCheck.init(inst, def);
		inst._zod.check = (payload) => {
			if (typeof payload.value !== typeof def.value) throw new Error("Cannot mix number and bigint in multiple_of check.");
			if (typeof payload.value === "bigint" ? def.value !== BigInt(0) && payload.value % def.value === BigInt(0) : floatSafeRemainder(payload.value, def.value) === 0) return;
			payload.issues.push({
				origin: typeof payload.value,
				code: "not_multiple_of",
				divisor: def.value,
				input: payload.value,
				inst,
				continue: !def.abort
			});
		};
	});
	const $ZodCheckNumberFormat = /*@__PURE__*/ $constructor("$ZodCheckNumberFormat", (inst, def) => {
		$ZodCheck.init(inst, def);
		def.format = def.format || "float64";
		const isInt = def.format?.includes("int");
		const origin = isInt ? "int" : "number";
		const [minimum, maximum] = NUMBER_FORMAT_RANGES[def.format];
		inst._zod.check = (payload) => {
			const input = payload.value;
			if (isInt) {
				if (!Number.isInteger(input)) {
					payload.issues.push({
						expected: origin,
						format: def.format,
						code: "invalid_type",
						continue: false,
						input,
						inst
					});
					return;
				}
				if (!Number.isSafeInteger(input)) {
					if (input > 0) payload.issues.push({
						input,
						code: "too_big",
						maximum: Number.MAX_SAFE_INTEGER,
						note: "Integers must be within the safe integer range.",
						inst,
						origin,
						inclusive: true,
						continue: !def.abort
					});
					else payload.issues.push({
						input,
						code: "too_small",
						minimum: Number.MIN_SAFE_INTEGER,
						note: "Integers must be within the safe integer range.",
						inst,
						origin,
						inclusive: true,
						continue: !def.abort
					});
					return;
				}
			}
			if (input < minimum) payload.issues.push({
				origin: "number",
				input,
				code: "too_small",
				minimum,
				inclusive: true,
				inst,
				continue: !def.abort
			});
			if (input > maximum) payload.issues.push({
				origin: "number",
				input,
				code: "too_big",
				maximum,
				inclusive: true,
				inst,
				continue: !def.abort
			});
		};
	});
	const $ZodCheckMaxLength = /*@__PURE__*/ $constructor("$ZodCheckMaxLength", (inst, def) => {
		var _a;
		$ZodCheck.init(inst, def);
		(_a = inst._zod.def).when ?? (_a.when = _whenHasLength);
		inst._zod.check = (payload) => {
			const input = payload.value;
			const units = input.length;
			if ((typeof input === "string" && units > def.maximum ? codePointLength(input) : units) <= def.maximum) return;
			const origin = getLengthableOrigin(input);
			payload.issues.push({
				origin,
				code: "too_big",
				maximum: def.maximum,
				inclusive: true,
				input,
				inst,
				continue: !def.abort
			});
		};
	});
	const $ZodCheckMinLength = /*@__PURE__*/ $constructor("$ZodCheckMinLength", (inst, def) => {
		var _a;
		$ZodCheck.init(inst, def);
		(_a = inst._zod.def).when ?? (_a.when = _whenHasLength);
		inst._zod.check = (payload) => {
			const input = payload.value;
			const units = input.length;
			if ((typeof input === "string" && units >= def.minimum && units < def.minimum * 2 ? codePointLength(input) : units) >= def.minimum) return;
			const origin = getLengthableOrigin(input);
			payload.issues.push({
				origin,
				code: "too_small",
				minimum: def.minimum,
				inclusive: true,
				input,
				inst,
				continue: !def.abort
			});
		};
	});
	const $ZodCheckLengthEquals = /*@__PURE__*/ $constructor("$ZodCheckLengthEquals", (inst, def) => {
		var _a;
		$ZodCheck.init(inst, def);
		(_a = inst._zod.def).when ?? (_a.when = _whenHasLength);
		inst._zod.check = (payload) => {
			const input = payload.value;
			const units = input.length;
			const length = typeof input === "string" && units >= def.length && units <= def.length * 2 ? codePointLength(input) : units;
			if (length === def.length) return;
			const origin = getLengthableOrigin(input);
			const tooBig = length > def.length;
			payload.issues.push({
				origin,
				...tooBig ? {
					code: "too_big",
					maximum: def.length
				} : {
					code: "too_small",
					minimum: def.length
				},
				inclusive: true,
				exact: true,
				input: payload.value,
				inst,
				continue: !def.abort
			});
		};
	});
	const $ZodCheckStringFormat = /*@__PURE__*/ $constructor("$ZodCheckStringFormat", (inst, def) => {
		var _a, _b;
		$ZodCheck.init(inst, def);
		if (def.pattern) (_a = inst._zod).check ?? (_a.check = (payload) => {
			def.pattern.lastIndex = 0;
			if (def.pattern.test(payload.value)) return;
			payload.issues.push({
				origin: "string",
				code: "invalid_format",
				format: def.format,
				input: payload.value,
				...def.pattern ? { pattern: def.pattern.toString() } : {},
				inst,
				continue: !def.abort
			});
		});
		else (_b = inst._zod).check ?? (_b.check = () => {});
	});
	const $ZodCheckRegex = /*@__PURE__*/ $constructor("$ZodCheckRegex", (inst, def) => {
		$ZodCheckStringFormat.init(inst, def);
		inst._zod.check = (payload) => {
			def.pattern.lastIndex = 0;
			if (def.pattern.test(payload.value)) return;
			payload.issues.push({
				origin: "string",
				code: "invalid_format",
				format: "regex",
				input: payload.value,
				pattern: def.pattern.toString(),
				inst,
				continue: !def.abort
			});
		};
	});
	const $ZodCheckLowerCase = /*@__PURE__*/ $constructor("$ZodCheckLowerCase", (inst, def) => {
		def.pattern ?? (def.pattern = lowercase);
		$ZodCheckStringFormat.init(inst, def);
	});
	const $ZodCheckUpperCase = /*@__PURE__*/ $constructor("$ZodCheckUpperCase", (inst, def) => {
		def.pattern ?? (def.pattern = uppercase);
		$ZodCheckStringFormat.init(inst, def);
	});
	const $ZodCheckIncludes = /*@__PURE__*/ $constructor("$ZodCheckIncludes", (inst, def) => {
		$ZodCheck.init(inst, def);
		const escapedRegex = escapeRegex(def.includes);
		def.pattern = new RegExp(typeof def.position === "number" ? `^.{${def.position},}${escapedRegex}` : escapedRegex);
		inst._zod.check = (payload) => {
			if (payload.value.includes(def.includes, def.position)) return;
			payload.issues.push({
				origin: "string",
				code: "invalid_format",
				format: "includes",
				includes: def.includes,
				input: payload.value,
				inst,
				continue: !def.abort
			});
		};
	});
	const $ZodCheckStartsWith = /*@__PURE__*/ $constructor("$ZodCheckStartsWith", (inst, def) => {
		$ZodCheck.init(inst, def);
		const pattern = new RegExp(`^${escapeRegex(def.prefix)}.*`);
		def.pattern ?? (def.pattern = pattern);
		inst._zod.check = (payload) => {
			if (payload.value.startsWith(def.prefix)) return;
			payload.issues.push({
				origin: "string",
				code: "invalid_format",
				format: "starts_with",
				prefix: def.prefix,
				input: payload.value,
				inst,
				continue: !def.abort
			});
		};
	});
	const $ZodCheckEndsWith = /*@__PURE__*/ $constructor("$ZodCheckEndsWith", (inst, def) => {
		$ZodCheck.init(inst, def);
		const pattern = new RegExp(`.*${escapeRegex(def.suffix)}$`);
		def.pattern ?? (def.pattern = pattern);
		inst._zod.check = (payload) => {
			if (payload.value.endsWith(def.suffix)) return;
			payload.issues.push({
				origin: "string",
				code: "invalid_format",
				format: "ends_with",
				suffix: def.suffix,
				input: payload.value,
				inst,
				continue: !def.abort
			});
		};
	});
	const $ZodCheckOverwrite = /*@__PURE__*/ $constructor("$ZodCheckOverwrite", (inst, def) => {
		$ZodCheck.init(inst, def);
		inst._zod.check = (payload) => {
			payload.value = def.tx(payload.value);
		};
	});

//#endregion
//#region node_modules/zod/v4/core/doc.js
	var Doc = class {
		constructor(args = [], closed = {}) {
			this.content = [];
			this.indent = 0;
			this.args = args;
			this.closed = closed;
		}
		indented(fn) {
			this.indent += 1;
			try {
				fn(this);
			} finally {
				this.indent -= 1;
			}
		}
		write(arg) {
			if (typeof arg === "function") {
				arg(this, { execution: "sync" });
				arg(this, { execution: "async" });
				return;
			}
			const lines = arg.split("\n").filter((x) => x);
			const minIndent = Math.min(...lines.map((x) => x.length - x.trimStart().length));
			const dedented = lines.map((x) => x.slice(minIndent)).map((x) => " ".repeat(this.indent * 2) + x);
			for (const line of dedented) this.content.push(line);
		}
		compile() {
			const F = Function;
			const content = this?.content ?? [``];
			return new F(...Object.keys(this.closed), `return function (${this.args.join(", ")}) {\n${content.join("\n")}\n};`)(...Object.values(this.closed));
		}
	};

//#endregion
//#region node_modules/zod/v4/core/versions.js
	const version = {
		major: 4,
		minor: 6,
		patch: 5
	};

//#endregion
//#region node_modules/zod/v4/core/schemas.js
	const $ZodType = /*@__PURE__*/ $constructor("$ZodType", (inst, def) => {
		var _a;
		inst ?? (inst = {});
		inst._zod.def = def;
		inst._zod.bag = inst._zod.bag || {};
		inst._zod.version = version;
		const defChecks = inst._zod.def.checks;
		const checks = inst._zod.traits.has("$ZodCheck") ? [inst, ...defChecks ?? []] : defChecks?.length ? [...defChecks] : [];
		for (const ch of checks) for (const fn of ch._zod.onattach) fn(inst);
		if (checks.length === 0) {
			(_a = inst._zod).deferred ?? (_a.deferred = []);
			inst._zod.deferred?.push(() => {
				inst._zod.run = inst._zod.parse;
			});
		} else {
			const runChecks = (payload, checks, ctx) => {
				if (payload.memo) return payload;
				let isAborted = aborted(payload);
				let asyncResult;
				for (const ch of checks) {
					if (ch._zod.def.when) {
						if (explicitlyAborted(payload)) continue;
						if (!ch._zod.def.when(payload)) continue;
					} else if (isAborted) continue;
					const currLen = payload.issues.length;
					const _ = ch._zod.check(payload);
					if (_ instanceof Promise && ctx?.async === false) throw new $ZodAsyncError();
					if (asyncResult || _ instanceof Promise) asyncResult = (asyncResult ?? Promise.resolve()).then(async () => {
						await _;
						if (payload.issues.length === currLen) return;
						attachSchema(payload.issues, currLen, inst);
						if (!isAborted) isAborted = aborted(payload, currLen);
					});
					else {
						if (payload.issues.length === currLen) continue;
						attachSchema(payload.issues, currLen, inst);
						if (!isAborted) isAborted = aborted(payload, currLen);
					}
				}
				if (asyncResult) return asyncResult.then(() => {
					return payload;
				});
				return payload;
			};
			const handleCanaryResult = (canary, payload, ctx) => {
				if (aborted(canary)) {
					canary.aborted = true;
					return canary;
				}
				const checkResult = runChecks(payload, checks, ctx);
				if (checkResult instanceof Promise) {
					if (ctx.async === false) throw new $ZodAsyncError();
					return checkResult.then((checkResult) => inst._zod.parse(checkResult, ctx));
				}
				return inst._zod.parse(checkResult, ctx);
			};
			inst._zod.run = (payload, ctx) => {
				if (ctx.skipChecks) return inst._zod.parse(payload, ctx);
				if (ctx.direction === "backward") {
					const canary = inst._zod.parse({
						value: payload.value,
						issues: []
					}, {
						...ctx,
						skipChecks: true
					});
					if (canary instanceof Promise) return canary.then((canary) => {
						return handleCanaryResult(canary, payload, ctx);
					});
					return handleCanaryResult(canary, payload, ctx);
				}
				const result = inst._zod.parse(payload, ctx);
				if (result instanceof Promise) {
					if (ctx.async === false) throw new $ZodAsyncError();
					return result.then((result) => runChecks(result, checks, ctx));
				}
				return runChecks(result, checks, ctx);
			};
		}
	}, {
		get "~standard"() {
			return hide(this, "~standard", standardProps(this));
		},
		set "~standard"(value) {
			own(this, "~standard", value);
		}
	});
	/** The Standard Schema surface for `inst`. Shared so wrappers can extend it without forcing it. */
	const toStandardResult = (r, ctx) => r.issues.length ? { issues: r.issues.map((iss) => finalizeIssue(iss, ctx, config())) } : { value: r.value };
	async function validateAsync(inst, value) {
		const ctx = { async: true };
		return toStandardResult(await inst._zod.run({
			value,
			issues: []
		}, ctx), ctx);
	}
	function standardProps(inst) {
		return {
			validate: (value) => {
				const ctx = { async: false };
				try {
					const r = inst._zod.run({
						value,
						issues: []
					}, ctx);
					if (!(r instanceof Promise)) return toStandardResult(r, ctx);
				} catch (_) {}
				return validateAsync(inst, value);
			},
			vendor: "zod",
			version: 1
		};
	}
	const $ZodString = /*@__PURE__*/ $constructor("$ZodString", (inst, def) => {
		$ZodType.init(inst, def);
		inst._zod.pattern = def.pattern ?? anyString;
		inst._zod.parse = (payload, _) => {
			if (def.coerce) try {
				payload.value = String(payload.value);
			} catch (_) {}
			if (typeof payload.value === "string") return payload;
			payload.issues.push({
				expected: "string",
				code: "invalid_type",
				input: payload.value,
				inst
			});
			return payload;
		};
	});
	const $ZodStringFormat = /*@__PURE__*/ $constructor("$ZodStringFormat", (inst, def) => {
		$ZodCheckStringFormat.init(inst, def);
		$ZodString.init(inst, def);
	});
	const $ZodGUID = /*@__PURE__*/ $constructor("$ZodGUID", (inst, def) => {
		def.pattern ?? (def.pattern = guid);
		$ZodStringFormat.init(inst, def);
	});
	const $ZodUUID = /*@__PURE__*/ $constructor("$ZodUUID", (inst, def) => {
		if (def.version) {
			const v = {
				v1: 1,
				v2: 2,
				v3: 3,
				v4: 4,
				v5: 5,
				v6: 6,
				v7: 7,
				v8: 8
			}[def.version];
			if (v === void 0) throw new Error(`Invalid UUID version: "${def.version}"`);
			def.pattern ?? (def.pattern = uuid(v));
		} else def.pattern ?? (def.pattern = uuid());
		$ZodStringFormat.init(inst, def);
	});
	const $ZodEmail = /*@__PURE__*/ $constructor("$ZodEmail", (inst, def) => {
		def.pattern ?? (def.pattern = email);
		$ZodStringFormat.init(inst, def);
	});
	/** The `://` guard rejected the input before the URL constructor saw it. */
	const URL_BAD_FORMAT = 1;
	/** The URL parser rejected the input. */
	const URL_UNPARSEABLE = 2;
	function canParseURL(input) {
		try {
			if (typeof URL !== "undefined" && typeof URL.canParse === "function") return URL.canParse(input);
			new URL(input);
			return true;
		} catch {
			return false;
		}
	}
	function validateURL(trimmed, def) {
		if (!("normalize" in def) && !("hostname" in def) && !("protocol" in def)) return canParseURL(trimmed) || 2;
		return parseURLObject(trimmed, def);
	}
	/** Parses a URL while preserving the non-normalizing HTTP guard. */
	function parseURLObject(trimmed, def) {
		if (!def.normalize && def.protocol?.source === httpProtocol.source && !/^https?:\/\//i.test(trimmed)) return 1;
		try {
			if (typeof URL !== "undefined") {
				const URLStatic = URL;
				if (typeof URLStatic.parse === "function") return URLStatic.parse(trimmed) ?? 2;
			}
			return new URL(trimmed);
		} catch {
			return 2;
		}
	}
	const asciiTabOrNewline = /[\t\n\r]/g;
	/** The URL parser deletes every ASCII tab, LF and CR from its input before it parses, so `new URL("https://exa\nmple.com")` reports on `example.com`. Applying the same deletion to the returned value closes the half of that divergence which can move the host; the parser's other rewrite, stripping C0 controls at the edges, cannot. */
	function stripTabAndNewline(value) {
		return value.replace(asciiTabOrNewline, "");
	}
	function urlHostnameOk(url, hostname) {
		hostname.lastIndex = 0;
		return hostname.test(url.hostname);
	}
	function urlProtocolOk(url, protocol) {
		protocol.lastIndex = 0;
		return protocol.test(url.protocol.endsWith(":") ? url.protocol.slice(0, -1) : url.protocol);
	}
	const $ZodURL = /*@__PURE__*/ $constructor("$ZodURL", (inst, def) => {
		$ZodStringFormat.init(inst, def);
		inst._zod.check = (payload) => {
			try {
				const trimmed = payload.value.trim();
				const url = validateURL(trimmed, def);
				if (url === 1) {
					payload.issues.push({
						code: "invalid_format",
						format: "url",
						note: "Invalid URL format",
						input: payload.value,
						inst,
						continue: !def.abort
					});
					return;
				}
				if (url === 2) {
					payload.issues.push({
						code: "invalid_format",
						format: "url",
						input: payload.value,
						inst,
						continue: !def.abort
					});
					return;
				}
				if (url === true) {
					payload.value = stripTabAndNewline(trimmed);
					return;
				}
				if (def.hostname && !urlHostnameOk(url, def.hostname)) payload.issues.push({
					code: "invalid_format",
					format: "url",
					note: "Invalid hostname",
					pattern: def.hostname.source,
					input: payload.value,
					inst,
					continue: !def.abort
				});
				if (def.protocol && !urlProtocolOk(url, def.protocol)) payload.issues.push({
					code: "invalid_format",
					format: "url",
					note: "Invalid protocol",
					pattern: def.protocol.source,
					input: payload.value,
					inst,
					continue: !def.abort
				});
				payload.value = def.normalize ? url.href : stripTabAndNewline(trimmed);
				return;
			} catch (_) {
				payload.issues.push({
					code: "invalid_format",
					format: "url",
					input: payload.value,
					inst,
					continue: !def.abort
				});
			}
		};
	});
	const $ZodEmoji = /*@__PURE__*/ $constructor("$ZodEmoji", (inst, def) => {
		def.pattern ?? (def.pattern = emoji());
		$ZodStringFormat.init(inst, def);
	});
	const $ZodNanoID = /*@__PURE__*/ $constructor("$ZodNanoID", (inst, def) => {
		if (def.length !== void 0 && (!Number.isInteger(def.length) || def.length < 1)) throw new Error(`Invalid nanoid length: ${def.length}`);
		def.pattern ?? (def.pattern = def.length === void 0 ? nanoid : nanoidOfLength(def.length));
		$ZodStringFormat.init(inst, def);
	});
	/**
	* @deprecated CUID v1 is deprecated by its authors due to information leakage
	* (timestamps embedded in the id). Use {@link $ZodCUID2} instead.
	* See https://github.com/paralleldrive/cuid.
	*/
	const $ZodCUID = /*@__PURE__*/ $constructor("$ZodCUID", (inst, def) => {
		def.pattern ?? (def.pattern = cuid);
		$ZodStringFormat.init(inst, def);
	});
	const $ZodCUID2 = /*@__PURE__*/ $constructor("$ZodCUID2", (inst, def) => {
		def.pattern ?? (def.pattern = cuid2);
		$ZodStringFormat.init(inst, def);
	});
	const $ZodULID = /*@__PURE__*/ $constructor("$ZodULID", (inst, def) => {
		def.pattern ?? (def.pattern = ulid);
		$ZodStringFormat.init(inst, def);
	});
	const $ZodXID = /*@__PURE__*/ $constructor("$ZodXID", (inst, def) => {
		def.pattern ?? (def.pattern = xid);
		$ZodStringFormat.init(inst, def);
	});
	const $ZodKSUID = /*@__PURE__*/ $constructor("$ZodKSUID", (inst, def) => {
		def.pattern ?? (def.pattern = ksuid);
		$ZodStringFormat.init(inst, def);
	});
	const $ZodISODateTime = /*@__PURE__*/ $constructor("$ZodISODateTime", (inst, def) => {
		def.pattern ?? (def.pattern = datetime(def));
		$ZodStringFormat.init(inst, def);
	});
	const $ZodISODate = /*@__PURE__*/ $constructor("$ZodISODate", (inst, def) => {
		def.pattern ?? (def.pattern = date);
		$ZodStringFormat.init(inst, def);
	});
	const $ZodISOTime = /*@__PURE__*/ $constructor("$ZodISOTime", (inst, def) => {
		def.pattern ?? (def.pattern = time(def));
		$ZodStringFormat.init(inst, def);
	});
	const $ZodISODuration = /*@__PURE__*/ $constructor("$ZodISODuration", (inst, def) => {
		def.pattern ?? (def.pattern = duration);
		$ZodStringFormat.init(inst, def);
	});
	const $ZodIPv4 = /*@__PURE__*/ $constructor("$ZodIPv4", (inst, def) => {
		def.pattern ?? (def.pattern = ipv4);
		$ZodStringFormat.init(inst, def);
	});
	/** An IPv6 address is written with hex digits, colons and dots, and nothing else. The guard is what makes the check below an IPv6 check: `new URL("http://[...]")` parses an authority, not an address, so `@` and `\` re-delimit it and `"::@1\\"` validates against the host `0.0.0.1`. The URL parser also deletes ASCII tab, LF and CR rather than failing, which is how `"::1\n"` validated as `::1`. */
	const ipv6Alphabet = /^[0-9a-fA-F:.]+$/;
	function isValidIPv6(value) {
		if (!ipv6Alphabet.test(value)) return false;
		return canParseURL(`http://[${value}]`);
	}
	const $ZodIPv6 = /*@__PURE__*/ $constructor("$ZodIPv6", (inst, def) => {
		def.pattern ?? (def.pattern = ipv6);
		$ZodStringFormat.init(inst, def);
		inst._zod.check = (payload) => {
			if (!isValidIPv6(payload.value)) payload.issues.push({
				code: "invalid_format",
				format: "ipv6",
				input: payload.value,
				inst,
				continue: !def.abort
			});
		};
	});
	const $ZodCIDRv4 = /*@__PURE__*/ $constructor("$ZodCIDRv4", (inst, def) => {
		def.pattern ?? (def.pattern = cidrv4);
		$ZodStringFormat.init(inst, def);
	});
	function isValidCIDRv6(value) {
		const parts = value.split("/");
		if (parts.length !== 2) return false;
		const [address, prefix] = parts;
		if (!prefix) return false;
		const prefixNum = Number(prefix);
		if (`${prefixNum}` !== prefix) return false;
		if (prefixNum < 0 || prefixNum > 128) return false;
		return isValidIPv6(address);
	}
	const $ZodCIDRv6 = /*@__PURE__*/ $constructor("$ZodCIDRv6", (inst, def) => {
		def.pattern ?? (def.pattern = cidrv6);
		$ZodStringFormat.init(inst, def);
		inst._zod.check = (payload) => {
			if (!isValidCIDRv6(payload.value)) payload.issues.push({
				code: "invalid_format",
				format: "cidrv6",
				input: payload.value,
				inst,
				continue: !def.abort
			});
		};
	});
	function isValidBase64(data) {
		if (data === "") return true;
		if (/\s/.test(data)) return false;
		if (data.length % 4 !== 0) return false;
		try {
			atob(data);
			return true;
		} catch {
			return false;
		}
	}
	const base64Charset = /^[0-9a-zA-Z+/]*={0,2}$/;
	const $ZodBase64 = /*@__PURE__*/ $constructor("$ZodBase64", (inst, def) => {
		def.pattern ?? (def.pattern = base64Charset);
		$ZodStringFormat.init(inst, def);
		inst._zod.check = (payload) => {
			if (isValidBase64(payload.value)) return;
			payload.issues.push({
				code: "invalid_format",
				format: "base64",
				input: payload.value,
				inst,
				continue: !def.abort
			});
		};
	});
	const base64urlCharset = /^[A-Za-z0-9_-]*$/;
	function isValidBase64URL(data) {
		if (!base64urlCharset.test(data)) return false;
		const base64 = data.replace(/[-_]/g, (c) => c === "-" ? "+" : "/");
		return isValidBase64(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
	}
	const $ZodBase64URL = /*@__PURE__*/ $constructor("$ZodBase64URL", (inst, def) => {
		def.pattern ?? (def.pattern = base64urlCharset);
		$ZodStringFormat.init(inst, def);
		inst._zod.check = (payload) => {
			if (isValidBase64URL(payload.value)) return;
			payload.issues.push({
				code: "invalid_format",
				format: "base64url",
				input: payload.value,
				inst,
				continue: !def.abort
			});
		};
	});
	const $ZodE164 = /*@__PURE__*/ $constructor("$ZodE164", (inst, def) => {
		def.pattern ?? (def.pattern = e164);
		$ZodStringFormat.init(inst, def);
	});
	function isValidJWT(token, algorithm = null) {
		try {
			const tokensParts = token.split(".");
			if (tokensParts.length !== 3) return false;
			const [header] = tokensParts;
			if (!header) return false;
			const parsedHeader = JSON.parse(atob(header));
			if ("typ" in parsedHeader && parsedHeader?.typ !== "JWT") return false;
			if (!parsedHeader.alg) return false;
			if (algorithm && (!("alg" in parsedHeader) || parsedHeader.alg !== algorithm)) return false;
			return true;
		} catch {
			return false;
		}
	}
	const $ZodJWT = /*@__PURE__*/ $constructor("$ZodJWT", (inst, def) => {
		$ZodStringFormat.init(inst, def);
		inst._zod.check = (payload) => {
			if (isValidJWT(payload.value, def.alg)) return;
			payload.issues.push({
				code: "invalid_format",
				format: "jwt",
				input: payload.value,
				inst,
				continue: !def.abort
			});
		};
	});
	const $ZodNumber = /*@__PURE__*/ $constructor("$ZodNumber", (inst, def) => {
		$ZodType.init(inst, def);
		inst._zod.pattern = number$1;
		inst._zod.parse = (payload, _ctx) => {
			if (def.coerce) try {
				payload.value = Number(payload.value);
			} catch (_) {}
			const input = payload.value;
			if (typeof input === "number" && !Number.isNaN(input) && Number.isFinite(input)) return payload;
			const received = typeof input === "number" ? Number.isNaN(input) ? "NaN" : !Number.isFinite(input) ? String(input) : void 0 : void 0;
			payload.issues.push({
				expected: "number",
				code: "invalid_type",
				input,
				inst,
				...received ? { received } : {}
			});
			return payload;
		};
	});
	const $ZodNumberFormat = /*@__PURE__*/ $constructor("$ZodNumberFormat", (inst, def) => {
		$ZodCheckNumberFormat.init(inst, def);
		$ZodNumber.init(inst, def);
	});
	const $ZodBoolean = /*@__PURE__*/ $constructor("$ZodBoolean", (inst, def) => {
		$ZodType.init(inst, def);
		inst._zod.pattern = boolean$1;
		inst._zod.parse = (payload, _ctx) => {
			if (def.coerce) try {
				payload.value = Boolean(payload.value);
			} catch (_) {}
			const input = payload.value;
			if (typeof input === "boolean") return payload;
			payload.issues.push({
				expected: "boolean",
				code: "invalid_type",
				input,
				inst
			});
			return payload;
		};
	});
	const $ZodUnknown = /*@__PURE__*/ $constructor("$ZodUnknown", (inst, def) => {
		$ZodType.init(inst, def);
		inst._zod.parse = (payload) => payload;
	});
	const $ZodNever = /*@__PURE__*/ $constructor("$ZodNever", (inst, def) => {
		$ZodType.init(inst, def);
		inst._zod.parse = (payload, _ctx) => {
			payload.issues.push({
				expected: "never",
				code: "invalid_type",
				input: payload.value,
				inst
			});
			return payload;
		};
	});
	function handleArrayResult(result, final, index) {
		if (result.issues.length) final.issues.push(...prefixIssues(index, result.issues));
		final.value[index] = result.value;
	}
	const $ZodArray = /*@__PURE__*/ $constructor("$ZodArray", (inst, def) => {
		$ZodType.init(inst, def);
		const memo = globalConfig.memoizer;
		memo?.attach(inst);
		inst._zod.parse = (payload, ctx) => {
			const input = payload.value;
			if (!Array.isArray(input)) {
				payload.issues.push({
					expected: "array",
					code: "invalid_type",
					input,
					inst
				});
				return payload;
			}
			payload.value = memo ? memo.alloc(inst, payload, Array(input.length), ctx) : Array(input.length);
			const proms = [];
			const abortEarly = ctx?.abortEarly;
			for (let i = 0; i < input.length; i++) {
				const item = input[i];
				const result = def.element._zod.run({
					value: item,
					issues: []
				}, ctx);
				if (result instanceof Promise) proms.push(result.then((result) => handleArrayResult(result, payload, i)));
				else {
					handleArrayResult(result, payload, i);
					if (abortEarly && result.issues.length !== 0 && aborted(result)) break;
				}
			}
			if (proms.length) return Promise.all(proms).then(() => payload);
			return payload;
		};
	});
	function handlePropertyResult(result, final, key, input, optin, optout) {
		const isPresent = key in input;
		const isOptionalOut = optout === "optional";
		if (!isPresent && isOptionalOut && optin === "optional") return;
		if (result.issues.length) {
			if (optin !== void 0 && isOptionalOut && !isPresent) return;
			final.issues.push(...prefixIssues(key, result.issues));
		}
		if (!isPresent && optin === void 0) {
			if (!result.issues.length) final.issues.push({
				code: "invalid_type",
				expected: "nonoptional",
				input: void 0,
				path: [key]
			});
			return;
		}
		if (result.value === void 0) {
			if (isPresent || optin === "defaulted" && !isOptionalOut) final.value[key] = void 0;
		} else final.value[key] = result.value;
	}
	const NO_SYMBOL_KEYS = [];
	function normalizeDef(def) {
		const keys = Object.keys(def.shape);
		const ownSymbols = Object.getOwnPropertySymbols(def.shape);
		const symbolKeys = ownSymbols.length ? ownSymbols : NO_SYMBOL_KEYS;
		const allKeys = symbolKeys.length ? [...keys, ...symbolKeys] : keys;
		for (const k of allKeys) if (!def.shape?.[k]?._zod?.traits?.has("$ZodType")) throw new Error(`Invalid element at key "${String(k)}": expected a Zod schema`);
		const okeys = optionalKeys(def.shape);
		return {
			...def,
			allKeys,
			symbolKeys,
			keySet: new Set(keys),
			numKeys: keys.length,
			optionalKeys: new Set(okeys)
		};
	}
	function handleCatchall(proms, input, payload, ctx, def, inst, abortEarly) {
		const unrecognized = [];
		const keySet = def.keySet;
		const _catchall = def.catchall._zod;
		const t = _catchall.def.type;
		const optin = _catchall.optin;
		const optout = _catchall.optout;
		let seen = 0;
		for (const key in input) {
			if (abortEarly && payload.issues.length !== seen) {
				if (aborted(payload, seen)) break;
				seen = payload.issues.length;
			}
			if (keySet.has(key)) continue;
			if (key === "__proto__") {
				if (t === "never") unrecognized.push(key);
				continue;
			}
			if (t === "never") {
				unrecognized.push(key);
				continue;
			}
			const r = _catchall.run({
				value: input[key],
				issues: []
			}, ctx);
			if (r instanceof Promise) proms.push(r.then((r) => handlePropertyResult(r, payload, key, input, optin, optout)));
			else handlePropertyResult(r, payload, key, input, optin, optout);
		}
		if (unrecognized.length) payload.issues.push({
			code: "unrecognized_keys",
			keys: unrecognized,
			input,
			inst,
			continue: true
		});
		if (!proms.length) return payload;
		return Promise.all(proms).then(() => {
			return payload;
		});
	}
	const $ZodObject = /*@__PURE__*/ $constructor("$ZodObject", (inst, def) => {
		$ZodType.init(inst, def);
		const desc = Object.getOwnPropertyDescriptor(def, "shape");
		const sh = desc?.get ? desc.get.raw : def.shape ?? {};
		if (sh) {
			const get = () => {
				const newSh = { ...sh };
				Object.defineProperty(def, "shape", { value: newSh });
				get.raw = newSh;
				return newSh;
			};
			get.raw = sh;
			Object.defineProperty(def, "shape", { get });
		}
		const _normalized = cached(() => normalizeDef(def));
		defineLazyInternal(inst, "propValues", (zod) => {
			const shape = zod.def.shape;
			const propValues = {};
			for (const key in shape) {
				const field = shape[key]._zod;
				if (field.values) {
					if (!Object.prototype.hasOwnProperty.call(propValues, key)) assignProp(propValues, key, /* @__PURE__ */ new Set());
					for (const v of field.values) propValues[key].add(v);
					if (field.optin !== void 0) propValues[key].add(void 0);
				}
			}
			return propValues;
		});
		const isObject$2 = isObject;
		const catchall = def.catchall;
		let value;
		const memo = globalConfig.memoizer;
		memo?.attach(inst);
		inst._zod.parse = (payload, ctx) => {
			value ?? (value = _normalized.value);
			const input = payload.value;
			if (!isObject$2(input)) {
				payload.issues.push({
					expected: "object",
					code: "invalid_type",
					input,
					inst
				});
				return payload;
			}
			payload.value = memo ? memo.alloc(inst, payload, {}, ctx) : {};
			const proms = [];
			const shape = value.shape;
			const abortEarly = ctx?.abortEarly;
			let seen = payload.issues.length;
			for (const key of value.allKeys) {
				if (abortEarly && payload.issues.length !== seen) {
					if (aborted(payload, seen)) break;
					seen = payload.issues.length;
				}
				if (key === "__proto__") continue;
				const el = shape[key];
				const optin = el._zod.optin;
				const optout = el._zod.optout;
				const r = el._zod.run({
					value: input[key],
					issues: []
				}, ctx);
				if (r instanceof Promise) proms.push(r.then((r) => handlePropertyResult(r, payload, key, input, optin, optout)));
				else handlePropertyResult(r, payload, key, input, optin, optout);
			}
			if (!catchall) return proms.length ? Promise.all(proms).then(() => payload) : payload;
			return handleCatchall(proms, input, payload, ctx, _normalized.value, inst, abortEarly === true);
		};
	});
	const $ZodObjectJIT = /*@__PURE__*/ $constructor("$ZodObjectJIT", (inst, def) => {
		$ZodObject.init(inst, def);
		const superParse = inst._zod.parse;
		const _normalized = cached(() => normalizeDef(def));
		const memo = globalConfig.memoizer;
		const generateFastpass = (shape) => {
			const normalized = _normalized.value;
			const syms = normalized.symbolKeys;
			const doc = new Doc(["payload", "ctx"], {
				shape,
				inst,
				memo,
				syms
			});
			const parseStr = (k) => `shape[${k}]._zod.run({ value: input[${k}], issues: [] }, ctx)`;
			const prefixStr = (id, k) => `
          let ${id}_ab = false;
          for (let i = 0; i < ${id}.issues.length; i++) {
            const iss = ${id}.issues[i];
            iss.path = iss.path ? [${k}, ...iss.path] : [${k}];
            payload.issues.push(iss);
            if (iss.continue !== true) ${id}_ab = true;
          }
          if (${id}_ab && ctx && ctx.abortEarly) {
            payload.value = newResult;
            return payload;
          }`;
			doc.write(`const input = payload.value;`);
			const ids = Object.create(null);
			let counter = 0;
			for (const key of normalized.allKeys) ids[key] = `key_${counter++}`;
			doc.write(memo ? `const newResult = memo.alloc(inst, payload, {}, ctx);` : `const newResult = {};`);
			for (const key of normalized.allKeys) {
				if (key === "__proto__") continue;
				const id = ids[key];
				const k = typeof key === "symbol" ? `syms[${syms.indexOf(key)}]` : esc$1(key);
				const isPresent = `${k} in input`;
				const schema = shape[key];
				const optin = schema?._zod?.optin;
				const isOptionalIn = optin !== void 0;
				const isOptionalOut = schema?._zod?.optout === "optional";
				doc.write(`const ${id} = ${parseStr(k)};`);
				if (isOptionalIn && isOptionalOut) {
					const assign = optin === "optional" ? `${id}_present` : `${id}.value !== undefined || ${id}_present`;
					doc.write(`
        const ${id}_present = ${isPresent};
        if (!${id}.issues.length || ${id}_present) {
          if (${id}.issues.length) {${prefixStr(id, k)}
          }

          if (${assign}) {
            newResult[${k}] = ${id}.value;
          }
        }

      `);
				} else if (!isOptionalIn) doc.write(`
        const ${id}_present = ${isPresent};
        if (${id}.issues.length) {${prefixStr(id, k)}
        }
        if (!${id}_present && !${id}.issues.length) {
          payload.issues.push({
            code: "invalid_type",
            expected: "nonoptional",
            input: undefined,
            path: [${k}]
          });
          if (ctx && ctx.abortEarly) {
            payload.value = newResult;
            return payload;
          }
        }

        if (${id}_present) {
          newResult[${k}] = ${id}.value;
        }

      `);
				else {
					doc.write(`
        if (${id}.issues.length) {${prefixStr(id, k)}
        }
      `);
					if (optin === "defaulted") doc.write(`newResult[${k}] = ${id}.value;`);
					else doc.write(`
        if (${id}.value !== undefined || ${isPresent}) {
          newResult[${k}] = ${id}.value;
        }
      `);
				}
			}
			doc.write(`payload.value = newResult;`);
			doc.write(`return payload;`);
			return doc.compile();
		};
		let fastpass;
		const isObject$1 = isObject;
		const jit = !globalConfig.jitless;
		const allowsEval$1 = allowsEval;
		const fastEnabled = jit && allowsEval$1.value;
		const catchall = def.catchall;
		let value;
		inst._zod.parse = (payload, ctx) => {
			value ?? (value = _normalized.value);
			const input = payload.value;
			if (!isObject$1(input)) {
				payload.issues.push({
					expected: "object",
					code: "invalid_type",
					input,
					inst
				});
				return payload;
			}
			if (jit && fastEnabled && ctx?.async === false && ctx.jitless !== true) {
				if (!fastpass) fastpass = generateFastpass(def.shape);
				payload = fastpass(payload, ctx);
				if (!catchall) return payload;
				return handleCatchall([], input, payload, ctx, value, inst, ctx?.abortEarly === true);
			}
			return superParse(payload, ctx);
		};
	});
	function handleUnionResults(results, final, inst, ctx) {
		for (const result of results) if (result.issues.length === 0) {
			final.value = result.value;
			return final;
		}
		const nonaborted = results.filter((r) => !aborted(r));
		if (nonaborted.length === 1) {
			final.value = nonaborted[0].value;
			return nonaborted[0];
		}
		final.issues.push({
			code: "invalid_union",
			input: final.value,
			inst,
			errors: results.map((result) => result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
		});
		return final;
	}
	const $ZodUnion = /*@__PURE__*/ $constructor("$ZodUnion", (inst, def) => {
		$ZodType.init(inst, def);
		defineLazyInternal(inst, "optin", (zod) => zod.def.options.some((o) => o._zod.optin === "defaulted") ? "defaulted" : zod.def.options.some((o) => o._zod.optin !== void 0) ? "optional" : void 0);
		defineLazyInternal(inst, "optout", (zod) => zod.def.options.some((o) => o._zod.optout === "optional") ? "optional" : void 0);
		defineLazyInternal(inst, "values", (zod) => {
			if (zod.def.options.every((o) => o._zod.values)) return new Set(zod.def.options.flatMap((option) => Array.from(option._zod.values)));
		});
		defineLazyInternal(inst, "pattern", (zod) => {
			if (zod.def.options.every((o) => o._zod.pattern)) {
				const patterns = zod.def.options.map((o) => o._zod.pattern);
				return new RegExp(`^(${patterns.map((p) => cleanRegex(p.source)).join("|")})$`);
			}
		});
		const first = def.options.length === 1 ? def.options[0]._zod.run : null;
		inst._zod.parse = (payload, ctx) => {
			if (first) return first(payload, ctx);
			let async = false;
			const results = [];
			for (const option of def.options) {
				const result = option._zod.run({
					value: payload.value,
					issues: []
				}, ctx);
				if (result instanceof Promise) {
					results.push(result);
					async = true;
				} else {
					if (result.issues.length === 0) return result;
					results.push(result);
				}
			}
			if (!async) return handleUnionResults(results, payload, inst, ctx);
			return Promise.all(results).then((results) => {
				return handleUnionResults(results, payload, inst, ctx);
			});
		};
	});
	const $ZodIntersection = /*@__PURE__*/ $constructor("$ZodIntersection", (inst, def) => {
		$ZodType.init(inst, def);
		inst._zod.parse = (payload, ctx) => {
			const input = payload.value;
			const left = def.left._zod.run({
				value: input,
				issues: []
			}, ctx);
			const right = def.right._zod.run({
				value: input,
				issues: []
			}, ctx);
			if (left instanceof Promise || right instanceof Promise) return Promise.all([left, right]).then(([left, right]) => {
				return handleIntersectionResults(payload, left, right);
			});
			return handleIntersectionResults(payload, left, right);
		};
	});
	function mergeValues(a, b) {
		if (a === b) return {
			valid: true,
			data: a
		};
		if (a instanceof Date && b instanceof Date && +a === +b) return {
			valid: true,
			data: a
		};
		if (isPlainObject(a) && isPlainObject(b)) {
			const bKeys = Object.keys(b);
			const sharedKeys = Object.keys(a).filter((key) => bKeys.indexOf(key) !== -1);
			const newObj = {
				...a,
				...b
			};
			if (Object.prototype.hasOwnProperty.call(newObj, "__proto__")) delete newObj.__proto__;
			for (const key of sharedKeys) {
				if (key === "__proto__") continue;
				const sharedValue = mergeValues(a[key], b[key]);
				if (!sharedValue.valid) return {
					valid: false,
					mergeErrorPath: [key, ...sharedValue.mergeErrorPath]
				};
				newObj[key] = sharedValue.data;
			}
			return {
				valid: true,
				data: newObj
			};
		}
		if (Array.isArray(a) && Array.isArray(b)) {
			if (a.length !== b.length) return {
				valid: false,
				mergeErrorPath: []
			};
			const newArray = [];
			for (let index = 0; index < a.length; index++) {
				const itemA = a[index];
				const itemB = b[index];
				const sharedValue = mergeValues(itemA, itemB);
				if (!sharedValue.valid) return {
					valid: false,
					mergeErrorPath: [index, ...sharedValue.mergeErrorPath]
				};
				newArray.push(sharedValue.data);
			}
			return {
				valid: true,
				data: newArray
			};
		}
		return {
			valid: false,
			mergeErrorPath: []
		};
	}
	function handleIntersectionResults(result, left, right) {
		const unrecKeys = /* @__PURE__ */ new Map();
		let unrecIssue;
		const keyIssues = /* @__PURE__ */ new Map();
		const collect = (iss, side) => {
			let keys;
			if (iss.code === "unrecognized_keys" && !iss.path?.length) {
				unrecIssue ?? (unrecIssue = iss);
				keys = iss.keys;
			} else if (iss.code === "invalid_key" && iss.origin === "record" && iss.path?.length === 1) {
				const k = String(iss.path[0]);
				if (!keyIssues.has(k)) keyIssues.set(k, iss);
				keys = [k];
			} else return false;
			for (const k of keys) {
				if (!unrecKeys.has(k)) unrecKeys.set(k, {});
				unrecKeys.get(k)[side] = true;
			}
			return true;
		};
		for (const iss of left.issues) if (!collect(iss, "l")) result.issues.push(iss);
		for (const iss of right.issues) if (!collect(iss, "r")) result.issues.push(iss);
		const bothKeys = [...unrecKeys].filter(([, f]) => f.l && f.r).map(([k]) => k);
		if (bothKeys.length) {
			const aggregated = unrecIssue ? bothKeys.filter((k) => unrecIssue.keys.includes(k)) : [];
			if (aggregated.length) result.issues.push({
				...unrecIssue,
				keys: aggregated
			});
			for (const k of bothKeys) if (!aggregated.includes(k) && keyIssues.has(k)) result.issues.push(keyIssues.get(k));
		}
		const merged = mergeValues(left.value, right.value);
		if (!merged.valid) {
			if (aborted(result)) return result;
			throw new Error(`Unmergable intersection. Error path: ${JSON.stringify(merged.mergeErrorPath)}`);
		}
		result.value = merged.data;
		return result;
	}
	const $ZodRecord = /*@__PURE__*/ $constructor("$ZodRecord", (inst, def) => {
		$ZodType.init(inst, def);
		const memo = globalConfig.memoizer;
		memo?.attach(inst);
		inst._zod.parse = (payload, ctx) => {
			const input = payload.value;
			if (!isPlainObject(input)) {
				payload.issues.push({
					expected: "record",
					code: "invalid_type",
					input,
					inst
				});
				return payload;
			}
			const proms = [];
			const values = def.keyType._zod.values;
			if (values && !def.partial) {
				payload.value = memo ? memo.alloc(inst, payload, {}, ctx) : {};
				const recordKeys = /* @__PURE__ */ new Set();
				for (const key of values) if (typeof key === "string" || typeof key === "number" || typeof key === "symbol") {
					recordKeys.add(typeof key === "number" ? key.toString() : key);
					if (key === "__proto__") continue;
					const keyResult = def.keyType._zod.run({
						value: key,
						issues: []
					}, ctx);
					if (keyResult instanceof Promise) throw new Error("Async schemas not supported in object keys currently");
					if (keyResult.issues.length) {
						payload.issues.push({
							code: "invalid_key",
							origin: "record",
							issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
							input: key,
							path: [key],
							inst
						});
						continue;
					}
					const outKey = keyResult.value;
					if (outKey === "__proto__") continue;
					const result = def.valueType._zod.run({
						value: input[key],
						issues: []
					}, ctx);
					if (result instanceof Promise) proms.push(result.then((result) => {
						if (result.issues.length) payload.issues.push(...prefixIssues(key, result.issues));
						payload.value[outKey] = result.value;
					}));
					else {
						if (result.issues.length) payload.issues.push(...prefixIssues(key, result.issues));
						payload.value[outKey] = result.value;
					}
				}
				let unrecognized;
				for (const key in input) if (!recordKeys.has(key)) {
					if (def.mode === "loose") {
						if (key === "__proto__") continue;
						payload.value[key] = input[key];
					} else {
						unrecognized = unrecognized ?? [];
						unrecognized.push(key);
					}
				}
				if (unrecognized && unrecognized.length > 0) payload.issues.push({
					code: "unrecognized_keys",
					input,
					inst,
					keys: unrecognized,
					continue: true
				});
			} else {
				payload.value = memo ? memo.alloc(inst, payload, {}, ctx) : {};
				let unrecognized;
				for (const key of Reflect.ownKeys(input)) {
					if (key === "__proto__") continue;
					if (!Object.prototype.propertyIsEnumerable.call(input, key)) continue;
					let keyResult = def.keyType._zod.run({
						value: key,
						issues: []
					}, ctx);
					if (keyResult instanceof Promise) throw new Error("Async schemas not supported in object keys currently");
					if (typeof key === "string" && number$1.test(key) && keyResult.issues.length) {
						const retryResult = def.keyType._zod.run({
							value: Number(key),
							issues: []
						}, ctx);
						if (retryResult instanceof Promise) throw new Error("Async schemas not supported in object keys currently");
						if (retryResult.issues.length === 0) keyResult = retryResult;
					}
					if (keyResult.issues.length) {
						if (def.mode === "loose") payload.value[key] = input[key];
						else if (values) {
							unrecognized = unrecognized ?? [];
							unrecognized.push(key);
						} else payload.issues.push({
							code: "invalid_key",
							origin: "record",
							issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
							input: key,
							path: [key],
							inst
						});
						continue;
					}
					const outKey = keyResult.value;
					if (outKey === "__proto__") continue;
					const result = def.valueType._zod.run({
						value: input[key],
						issues: []
					}, ctx);
					if (result instanceof Promise) proms.push(result.then((result) => {
						if (result.issues.length) payload.issues.push(...prefixIssues(key, result.issues));
						payload.value[outKey] = result.value;
					}));
					else {
						if (result.issues.length) payload.issues.push(...prefixIssues(key, result.issues));
						payload.value[outKey] = result.value;
					}
				}
				if (unrecognized && unrecognized.length > 0) payload.issues.push({
					code: "unrecognized_keys",
					input,
					inst,
					keys: unrecognized,
					continue: true
				});
			}
			if (proms.length) return Promise.all(proms).then(() => payload);
			return payload;
		};
	});
	const $ZodEnum = /*@__PURE__*/ $constructor("$ZodEnum", (inst, def) => {
		$ZodType.init(inst, def);
		const values = getEnumValues(def.entries);
		const valuesSet = new Set(values);
		inst._zod.values = valuesSet;
		defineLazyInternal(inst, "pattern", (zod) => {
			const patternValues = getEnumValues(zod.def.entries).filter((k) => propertyKeyTypes.has(typeof k));
			return new RegExp(patternValues.length ? `^(${patternValues.map((o) => escapeRegex(o.toString())).join("|")})$` : "^[^\\s\\S]$");
		});
		inst._zod.parse = (payload, _ctx) => {
			const input = payload.value;
			if (valuesSet.has(input)) return payload;
			payload.issues.push({
				code: "invalid_value",
				values,
				input,
				inst
			});
			return payload;
		};
	});
	const $ZodTransform = /*@__PURE__*/ $constructor("$ZodTransform", (inst, def) => {
		$ZodType.init(inst, def);
		inst._zod.optin = "optional";
		globalConfig.memoizer?.guard(inst);
		inst._zod.parse = (payload, ctx) => {
			if (ctx.direction === "backward") throw new $ZodEncodeError(inst.constructor.name);
			const _out = def.transform(payload.value, payload);
			if (ctx.async) return (_out instanceof Promise ? _out : Promise.resolve(_out)).then((output) => {
				payload.value = output;
				return payload;
			});
			if (_out instanceof Promise) throw new $ZodAsyncError();
			payload.value = _out;
			return payload;
		};
	});
	function handleOptionalResult(payload, result) {
		payload.value = result.issues.length ? void 0 : result.value;
		return payload;
	}
	const $ZodOptional = /*@__PURE__*/ $constructor("$ZodOptional", (inst, def) => {
		$ZodType.init(inst, def);
		defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin === "defaulted" ? "defaulted" : "optional");
		inst._zod.optout = "optional";
		defineLazyInternal(inst, "values", (zod) => {
			const values = zod.def.innerType._zod.values;
			return values ? /* @__PURE__ */ new Set([...values, void 0]) : void 0;
		});
		defineLazyInternal(inst, "pattern", (zod) => {
			const pattern = zod.def.innerType._zod.pattern;
			return pattern ? new RegExp(`^(${cleanRegex(pattern.source)})?$`) : void 0;
		});
		inst._zod.parse = (payload, ctx) => {
			if (payload.value === void 0) {
				if (def.innerType._zod.optin !== "defaulted") return payload;
				const result = def.innerType._zod.run({
					value: payload.value,
					issues: []
				}, ctx);
				if (result instanceof Promise) return result.then((result) => handleOptionalResult(payload, result));
				return handleOptionalResult(payload, result);
			}
			return def.innerType._zod.run(payload, ctx);
		};
	});
	const $ZodExactOptional = /*@__PURE__*/ $constructor("$ZodExactOptional", (inst, def) => {
		$ZodOptional.init(inst, def);
		defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
		defineLazyInternal(inst, "pattern", (zod) => zod.def.innerType._zod.pattern);
		inst._zod.parse = (payload, ctx) => {
			return def.innerType._zod.run(payload, ctx);
		};
	});
	const $ZodNullable = /*@__PURE__*/ $constructor("$ZodNullable", (inst, def) => {
		$ZodType.init(inst, def);
		defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin);
		defineLazyInternal(inst, "optout", (zod) => zod.def.innerType._zod.optout);
		defineLazyInternal(inst, "pattern", (zod) => {
			const pattern = zod.def.innerType._zod.pattern;
			return pattern ? new RegExp(`^(${cleanRegex(pattern.source)}|null)$`) : void 0;
		});
		defineLazyInternal(inst, "values", (zod) => {
			return zod.def.innerType._zod.values ? /* @__PURE__ */ new Set([...zod.def.innerType._zod.values, null]) : void 0;
		});
		inst._zod.parse = (payload, ctx) => {
			if (payload.value === null) return payload;
			return def.innerType._zod.run(payload, ctx);
		};
	});
	const $ZodDefault = /*@__PURE__*/ $constructor("$ZodDefault", (inst, def) => {
		$ZodType.init(inst, def);
		inst._zod.optin = "defaulted";
		defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
		inst._zod.parse = (payload, ctx) => {
			if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
			if (payload.value === void 0) {
				payload.value = def.defaultValue;
				/**
				* $ZodDefault returns the default value immediately in forward direction.
				* It doesn't pass the default value into the validator ("prefault"). There's no reason to pass the default value through validation. The validity of the default is enforced by TypeScript statically. Otherwise, it's the responsibility of the user to ensure the default is valid. In the case of pipes with divergent in/out types, you can specify the default on the `in` schema of your ZodPipe to set a "prefault" for the pipe.   */
				return payload;
			}
			const result = def.innerType._zod.run(payload, ctx);
			if (result instanceof Promise) return result.then((result) => handleDefaultResult(result, def));
			return handleDefaultResult(result, def);
		};
	});
	function handleDefaultResult(payload, def) {
		if (payload.value === void 0) payload.value = def.defaultValue;
		return payload;
	}
	const $ZodPrefault = /*@__PURE__*/ $constructor("$ZodPrefault", (inst, def) => {
		$ZodType.init(inst, def);
		inst._zod.optin = "defaulted";
		defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
		inst._zod.parse = (payload, ctx) => {
			if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
			if (payload.value === void 0) payload.value = def.defaultValue;
			return def.innerType._zod.run(payload, ctx);
		};
	});
	const $ZodNonOptional = /*@__PURE__*/ $constructor("$ZodNonOptional", (inst, def) => {
		$ZodType.init(inst, def);
		defineLazyInternal(inst, "values", (zod) => {
			const v = zod.def.innerType._zod.values;
			return v ? new Set([...v].filter((x) => x !== void 0)) : void 0;
		});
		inst._zod.parse = (payload, ctx) => {
			const result = def.innerType._zod.run(payload, ctx);
			if (result instanceof Promise) return result.then((result) => handleNonOptionalResult(result, inst));
			return handleNonOptionalResult(result, inst);
		};
	});
	function handleNonOptionalResult(payload, inst) {
		if (!payload.issues.length && payload.value === void 0) payload.issues.push({
			code: "invalid_type",
			expected: "nonoptional",
			input: payload.value,
			inst
		});
		return payload;
	}
	function handleCatchResult(payload, result, def, ctx) {
		if (!result.issues.length) {
			payload.value = result.value;
			if (result.memo) payload.memo = true;
			return payload;
		}
		payload.value = def.catchValue({
			...result,
			value: payload.value,
			error: { issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config())) },
			input: payload.value
		});
		return payload;
	}
	const $ZodCatch = /*@__PURE__*/ $constructor("$ZodCatch", (inst, def) => {
		$ZodType.init(inst, def);
		defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin === "defaulted" ? "defaulted" : "optional");
		defineLazyInternal(inst, "optout", (zod) => zod.def.innerType._zod.optout);
		defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
		inst._zod.parse = (payload, ctx) => {
			if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
			const result = def.innerType._zod.run({
				value: payload.value,
				issues: []
			}, ctx);
			if (result instanceof Promise) return result.then((result) => handleCatchResult(payload, result, def, ctx));
			return handleCatchResult(payload, result, def, ctx);
		};
	});
	const $ZodPipe = /*@__PURE__*/ $constructor("$ZodPipe", (inst, def) => {
		$ZodType.init(inst, def);
		defineLazyInternal(inst, "values", (zod) => zod.def.in._zod.values);
		defineLazyInternal(inst, "optin", (zod) => zod.def.in._zod.optin);
		defineLazyInternal(inst, "optout", (zod) => zod.def.out._zod.optout);
		defineLazyInternal(inst, "propValues", (zod) => zod.def.in._zod.propValues);
		inst._zod.parse = (payload, ctx) => {
			if (ctx.direction === "backward") {
				const right = def.out._zod.run(payload, ctx);
				if (right instanceof Promise) return right.then((right) => handlePipeResult(right, def.in, ctx));
				return handlePipeResult(right, def.in, ctx);
			}
			const left = def.in._zod.run(payload, ctx);
			if (left instanceof Promise) return left.then((left) => handlePipeResult(left, def.out, ctx));
			return handlePipeResult(left, def.out, ctx);
		};
	});
	function handlePipeResult(left, next, ctx) {
		if (left.issues.some((iss) => iss.code !== "unrecognized_keys")) {
			left.aborted = true;
			return left;
		}
		return next._zod.run({
			value: left.value,
			issues: left.issues
		}, ctx);
	}
	const $ZodReadonly = /*@__PURE__*/ $constructor("$ZodReadonly", (inst, def) => {
		$ZodType.init(inst, def);
		defineLazyInternal(inst, "propValues", (zod) => zod.def.innerType._zod.propValues);
		defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
		defineLazyInternal(inst, "optin", (zod) => zod.def.innerType?._zod?.optin);
		defineLazyInternal(inst, "optout", (zod) => zod.def.innerType?._zod?.optout);
		inst._zod.parse = (payload, ctx) => {
			if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
			const result = def.innerType._zod.run(payload, ctx);
			if (result instanceof Promise) return result.then(handleReadonlyResult);
			return handleReadonlyResult(result);
		};
	});
	function handleReadonlyResult(payload) {
		if (!payload.memo) payload.value = Object.freeze(payload.value);
		return payload;
	}
	const $ZodCustom = /*@__PURE__*/ $constructor("$ZodCustom", (inst, def) => {
		$ZodCheck.init(inst, def);
		$ZodType.init(inst, def);
		inst._zod.parse = (payload, _) => {
			return payload;
		};
		inst._zod.check = (payload) => {
			const input = payload.value;
			const r = def.fn(input);
			if (r instanceof Promise) return r.then((r) => handleRefineResult(r, payload, input, inst));
			handleRefineResult(r, payload, input, inst);
		};
	});
	function handleRefineResult(result, payload, input, inst) {
		if (!result) {
			const _iss = {
				code: "custom",
				input,
				inst,
				path: [...inst._zod.def.path ?? []],
				continue: !inst._zod.def.abort
			};
			if (inst._zod.def.params) _iss.params = inst._zod.def.params;
			payload.issues.push(issue(_iss));
		}
	}

//#endregion
//#region node_modules/zod/v4/core/memoizer.js
	var $ZodCyclicError = class extends Error {
		constructor() {
			super(`Cannot parse a reference cycle that closes through a transform`);
			this.name = "ZodCyclicError";
		}
	};
	/** Keyed off the context object every schema in one parse call already shares. */
	const STATE = "~memo";
	const NO_ISSUES = [];
	function isRef(value) {
		return value !== null && typeof value === "object";
	}
	function cloneIssues(issues) {
		return issues.map((iss) => iss.path ? {
			...iss,
			path: iss.path.slice()
		} : { ...iss });
	}
	const recursive = /*@__PURE__*/ new WeakMap();
	/** What the walk established, in order of certainty: ordered so the strongest answer among children wins. */
	const NONE = 0;
	const ASSUMED = 1;
	const PROVEN = 2;
	/** Whether this schema's subtree contains a cycle, so one parse can re-enter it. */
	function isRecursive(inst, stack, resolve) {
		const cached = recursive.get(inst);
		if (cached !== void 0) return cached ? PROVEN : NONE;
		if (stack.has(inst)) return PROVEN;
		stack.add(inst);
		let result = NONE;
		const check = (child) => {
			if (result !== PROVEN && child?._zod) {
				const answer = isRecursive(child, stack, resolve);
				if (answer > result) result = answer;
			}
		};
		const shape = (sh, spread) => {
			let answer = NONE;
			for (const key of Reflect.ownKeys(sh)) {
				const desc = Object.getOwnPropertyDescriptor(sh, key);
				if (spread && !desc.enumerable) continue;
				const child = desc.get ? ASSUMED : desc.value?._zod ? isRecursive(desc.value, stack, resolve) : NONE;
				if (child > answer) answer = child;
			}
			return answer;
		};
		const merge = (answer) => {
			if (answer > result) result = answer;
		};
		const def = inst._zod.def;
		switch (def.type) {
			case "object": {
				const raw = rawShape(def);
				merge(raw ? shape(raw, true) : ASSUMED);
				check(def.catchall);
				break;
			}
			case "array":
				check(def.element);
				break;
			case "tuple":
				for (const el of def.items) check(el);
				check(def.rest);
				break;
			case "record":
			case "map":
				check(def.keyType);
				check(def.valueType);
				break;
			case "set":
				check(def.valueType);
				break;
			case "union":
				for (const el of def.options) check(el);
				break;
			case "intersection":
				check(def.left);
				check(def.right);
				break;
			case "optional":
			case "nullable":
			case "default":
			case "prefault":
			case "catch":
			case "readonly":
			case "nonoptional":
			case "promise":
			case "success":
				check(def.innerType);
				break;
			case "pipe":
				check(def.in);
				check(def.out);
				break;
			case "function":
				check(def.input);
				check(def.output);
				break;
			case "lazy": {
				const inner = def._cachedInner ?? (resolve ? inst._zod.innerType : void 0);
				merge(inner ? isRecursive(inner, stack, false) : ASSUMED);
				break;
			}
			case "template_literal":
			case "string":
			case "number":
			case "int":
			case "boolean":
			case "bigint":
			case "symbol":
			case "undefined":
			case "null":
			case "void":
			case "never":
			case "any":
			case "unknown":
			case "date":
			case "nan":
			case "enum":
			case "literal":
			case "file":
			case "transform":
			case "custom": break;
			default: for (const key in def) {
				const desc = Object.getOwnPropertyDescriptor(def, key);
				if (!desc || desc.get) continue;
				const value = desc.value;
				if (!value || typeof value !== "object") continue;
				if (value._zod) check(value);
				else if (Array.isArray(value)) for (const el of value) check(el);
			}
		}
		stack.delete(inst);
		return settle(inst, result);
	}
	/** An assumed answer must not outlive the resolution that settles it, so only a certain one is cached. */
	function settle(inst, answer) {
		if (answer !== ASSUMED) recursive.set(inst, answer === PROVEN);
		return answer;
	}
	function bucketFor(state, inst) {
		let bucket = state.buckets.get(inst);
		if (!bucket) {
			bucket = /* @__PURE__ */ new WeakMap();
			state.buckets.set(inst, bucket);
		}
		return bucket;
	}
	let handoff;
	const open = [];
	const memo = {
		alloc(_inst, payload, empty) {
			const bucket = handoff;
			if (!bucket) return empty;
			handoff = void 0;
			const entry = {
				value: empty,
				issues: null
			};
			bucket.set(payload.value, entry);
			open.push(entry);
			return empty;
		},
		guard(inst) {
			var _a;
			(_a = inst._zod).deferred ?? (_a.deferred = []);
			inst._zod.deferred.push(() => {
				const base = inst._zod.parse;
				const wrapped = (payload, ctx) => {
					if (ctx.direction !== "backward" && isBackEdge(ctx, payload.value)) throw new $ZodCyclicError();
					return base(payload, ctx);
				};
				inst._zod.parse = wrapped;
				if (inst._zod.run === base) inst._zod.run = wrapped;
			});
		},
		attach(inst) {
			var _a;
			let isRecursiveInst;
			let rechecked = false;
			let lastCtx;
			let lastBucket;
			(_a = inst._zod).deferred ?? (_a.deferred = []);
			inst._zod.deferred.push(() => {
				const base = inst._zod.parse;
				const wrapped = (payload, ctx) => {
					if (isRecursiveInst === void 0) {
						const walked = isRecursive(inst, /* @__PURE__ */ new Set(), false);
						if (walked === NONE) {
							inst._zod.parse = base;
							if (inst._zod.run === wrapped) inst._zod.run = base;
							return base(payload, ctx);
						}
						if (walked === PROVEN || rechecked) isRecursiveInst = true;
						else rechecked = true;
					}
					const input = payload.value;
					if (!isRef(input)) return base(payload, ctx);
					let state = ctx[STATE];
					if (!state) {
						state = {
							buckets: /* @__PURE__ */ new WeakMap(),
							backEdges: void 0
						};
						ctx[STATE] = state;
					}
					let bucket;
					if (lastCtx === ctx) bucket = lastBucket;
					else {
						bucket = bucketFor(state, inst);
						lastCtx = ctx;
						lastBucket = bucket;
					}
					const hit = bucket.get(input);
					if (hit) {
						payload.value = hit.value;
						if (hit.issues) {
							if (hit.issues.length) payload.issues.push(...cloneIssues(hit.issues));
						} else {
							payload.memo = true;
							state.backEdges ?? (state.backEdges = /* @__PURE__ */ new WeakSet());
							state.backEdges.add(hit.value);
						}
						return payload;
					}
					handoff = bucket;
					const depth = open.length;
					const result = base(payload, ctx);
					handoff = void 0;
					const entry = open.length > depth ? open.pop() : void 0;
					if (result instanceof Promise) return result.then((r) => {
						if (entry) entry.issues = r.issues.length ? cloneIssues(r.issues) : NO_ISSUES;
						return r;
					});
					if (entry) entry.issues = result.issues.length ? cloneIssues(result.issues) : NO_ISSUES;
					return result;
				};
				inst._zod.parse = wrapped;
				if (inst._zod.run === base) inst._zod.run = wrapped;
			});
		}
	};
	/** The memoizer that gives containers cycle support. `zod` installs it by default; `zod/mini` opts in with `config({ memoizer: memoizer() })`. */
	function memoizer() {
		return memo;
	}
	/** Whether this value is a node a back-edge resolved to before it finished. */
	function isBackEdge(ctx, value) {
		const backEdges = ctx[STATE]?.backEdges;
		return backEdges !== void 0 && isRef(value) && backEdges.has(value);
	}

//#endregion
//#region node_modules/zod/v4/locales/en.js
	const error = () => {
		const Sizable = {
			string: {
				unit: "characters",
				verb: "to have"
			},
			file: {
				unit: "bytes",
				verb: "to have"
			},
			array: {
				unit: "items",
				verb: "to have"
			},
			set: {
				unit: "items",
				verb: "to have"
			},
			map: {
				unit: "entries",
				verb: "to have"
			}
		};
		function getSizing(origin) {
			return Sizable[origin] ?? null;
		}
		const FormatDictionary = {
			regex: "input",
			email: "email address",
			url: "URL",
			emoji: "emoji",
			uuid: "UUID",
			uuidv4: "UUIDv4",
			uuidv6: "UUIDv6",
			nanoid: "nanoid",
			guid: "GUID",
			cuid: "cuid",
			cuid2: "cuid2",
			ulid: "ULID",
			xid: "XID",
			ksuid: "KSUID",
			datetime: "ISO datetime",
			date: "ISO date",
			time: "ISO time",
			duration: "ISO duration",
			ipv4: "IPv4 address",
			ipv6: "IPv6 address",
			mac: "MAC address",
			cidrv4: "IPv4 range",
			cidrv6: "IPv6 range",
			base64: "base64-encoded string",
			base64url: "base64url-encoded string",
			json_string: "JSON string",
			e164: "E.164 number",
			currency_code: "currency code",
			credit_card: "credit card number",
			iban: "IBAN",
			jwt: "JWT",
			template_literal: "input"
		};
		const TypeDictionary = { nan: "NaN" };
		function getTypeName(type, input) {
			if (type === "number" && typeof input === "number" && !Number.isFinite(input)) return String(input);
			return TypeDictionary[type] ?? type;
		}
		return (issue) => {
			switch (issue.code) {
				case "invalid_type": return `Invalid input: expected ${getTypeName(issue.expected)}, received ${getTypeName(parsedType(issue.input), issue.input)}`;
				case "invalid_value":
					if (issue.values.length === 1) return `Invalid input: expected ${stringifyPrimitive(issue.values[0])}`;
					return `Invalid option: expected one of ${joinValues(issue.values, "|")}`;
				case "too_big": {
					const adj = issue.exact ? "exactly " : issue.inclusive ? "<=" : "<";
					const sizing = getSizing(issue.origin);
					if (sizing) return `Too big: expected ${issue.origin ?? "value"} to have ${adj}${issue.maximum.toString()} ${sizing.unit ?? "elements"}`;
					return `Too big: expected ${issue.origin ?? "value"} to be ${adj}${issue.maximum.toString()}`;
				}
				case "too_small": {
					const adj = issue.exact ? "exactly " : issue.inclusive ? ">=" : ">";
					const sizing = getSizing(issue.origin);
					if (sizing) return `Too small: expected ${issue.origin} to have ${adj}${issue.minimum.toString()} ${sizing.unit}`;
					return `Too small: expected ${issue.origin} to be ${adj}${issue.minimum.toString()}`;
				}
				case "invalid_format": {
					const _issue = issue;
					if (_issue.format === "starts_with") return `Invalid string: must start with "${_issue.prefix}"`;
					if (_issue.format === "ends_with") return `Invalid string: must end with "${_issue.suffix}"`;
					if (_issue.format === "includes") return `Invalid string: must include "${_issue.includes}"`;
					if (_issue.format === "regex") return `Invalid string: must match pattern ${_issue.pattern}`;
					return `Invalid ${FormatDictionary[_issue.format] ?? issue.format}`;
				}
				case "not_multiple_of": return `Invalid number: must be a multiple of ${issue.divisor}`;
				case "unrecognized_keys": return `Unrecognized key${issue.keys.length > 1 ? "s" : ""}: ${joinValues(issue.keys, ", ")}`;
				case "invalid_key": return `Invalid key in ${issue.origin}`;
				case "invalid_union":
					if (issue.options && Array.isArray(issue.options) && issue.options.length > 0) return `Invalid discriminator value. Expected ${issue.options.map((o) => `'${o}'`).join(" | ")}`;
					if (issue.inclusive === false) return "Invalid input: more than one option matched";
					return "Invalid input";
				case "invalid_element": return `Invalid value in ${issue.origin}`;
				default: return `Invalid input`;
			}
		};
	};
	function en_default() {
		return { localeError: error() };
	}

//#endregion
//#region node_modules/zod/v4/core/registries.js
	var _a;
	var $ZodRegistry = class {
		constructor() {
			this._map = /* @__PURE__ */ new WeakMap();
			this._idmap = /* @__PURE__ */ new Map();
		}
		add(schema, ..._meta) {
			const meta = _meta[0];
			this._map.set(schema, meta);
			if (meta && typeof meta === "object" && "id" in meta) this._idmap.set(meta.id, schema);
			return this;
		}
		clear() {
			this._map = /* @__PURE__ */ new WeakMap();
			this._idmap = /* @__PURE__ */ new Map();
			return this;
		}
		remove(schema) {
			const meta = this._map.get(schema);
			if (meta && typeof meta === "object" && "id" in meta) this._idmap.delete(meta.id);
			this._map.delete(schema);
			return this;
		}
		get(schema) {
			const p = schema._zod.parent;
			if (p) {
				const pm = { ...this.get(p) ?? {} };
				delete pm.id;
				const f = {
					...pm,
					...this._map.get(schema)
				};
				return Object.keys(f).length ? f : void 0;
			}
			return this._map.get(schema);
		}
		has(schema) {
			return this._map.has(schema);
		}
	};
	function registry() {
		return new $ZodRegistry();
	}
	(_a = globalThis).__zod_globalRegistry ?? (_a.__zod_globalRegistry = registry());
	const globalRegistry = globalThis.__zod_globalRegistry;

//#endregion
//#region node_modules/zod/v4/core/api.js
	function snapshotChecks(def) {
		if (def.checks) def.checks = [...def.checks];
		return def;
	}
	// @__NO_SIDE_EFFECTS__
	function _string(Class, params) {
		return new Class(snapshotChecks({
			type: "string",
			...normalizeParams(params)
		}));
	}
	// @__NO_SIDE_EFFECTS__
	function _email(Class, params) {
		return new Class({
			type: "string",
			format: "email",
			check: "string_format",
			abort: false,
			...normalizeParams(params)
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _guid(Class, params) {
		return new Class({
			type: "string",
			format: "guid",
			check: "string_format",
			abort: false,
			...normalizeParams(params)
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _uuid(Class, params) {
		return new Class({
			type: "string",
			format: "uuid",
			check: "string_format",
			abort: false,
			...normalizeParams(params)
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _uuidv4(Class, params) {
		return new Class({
			type: "string",
			format: "uuid",
			check: "string_format",
			abort: false,
			version: "v4",
			...normalizeParams(params)
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _uuidv6(Class, params) {
		return new Class({
			type: "string",
			format: "uuid",
			check: "string_format",
			abort: false,
			version: "v6",
			...normalizeParams(params)
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _uuidv7(Class, params) {
		return new Class({
			type: "string",
			format: "uuid",
			check: "string_format",
			abort: false,
			version: "v7",
			...normalizeParams(params)
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _url(Class, params) {
		return new Class({
			type: "string",
			format: "url",
			check: "string_format",
			abort: false,
			...normalizeParams(params)
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _emoji(Class, params) {
		return new Class({
			type: "string",
			format: "emoji",
			check: "string_format",
			abort: false,
			...normalizeParams(params)
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _nanoid(Class, params) {
		return new Class({
			type: "string",
			format: "nanoid",
			check: "string_format",
			abort: false,
			...normalizeParams(params)
		});
	}
	/**
	* @deprecated CUID v1 is deprecated by its authors due to information leakage
	* (timestamps embedded in the id). Use {@link _cuid2} instead.
	* See https://github.com/paralleldrive/cuid.
	*/
	// @__NO_SIDE_EFFECTS__
	function _cuid(Class, params) {
		return new Class({
			type: "string",
			format: "cuid",
			check: "string_format",
			abort: false,
			...normalizeParams(params)
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _cuid2(Class, params) {
		return new Class({
			type: "string",
			format: "cuid2",
			check: "string_format",
			abort: false,
			...normalizeParams(params)
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _ulid(Class, params) {
		return new Class({
			type: "string",
			format: "ulid",
			check: "string_format",
			abort: false,
			...normalizeParams(params)
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _xid(Class, params) {
		return new Class({
			type: "string",
			format: "xid",
			check: "string_format",
			abort: false,
			...normalizeParams(params)
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _ksuid(Class, params) {
		return new Class({
			type: "string",
			format: "ksuid",
			check: "string_format",
			abort: false,
			...normalizeParams(params)
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _ipv4(Class, params) {
		return new Class({
			type: "string",
			format: "ipv4",
			check: "string_format",
			abort: false,
			...normalizeParams(params)
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _ipv6(Class, params) {
		return new Class({
			type: "string",
			format: "ipv6",
			check: "string_format",
			abort: false,
			...normalizeParams(params)
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _cidrv4(Class, params) {
		return new Class({
			type: "string",
			format: "cidrv4",
			check: "string_format",
			abort: false,
			...normalizeParams(params)
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _cidrv6(Class, params) {
		return new Class({
			type: "string",
			format: "cidrv6",
			check: "string_format",
			abort: false,
			...normalizeParams(params)
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _base64(Class, params) {
		return new Class({
			type: "string",
			format: "base64",
			check: "string_format",
			abort: false,
			...normalizeParams(params)
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _base64url(Class, params) {
		return new Class({
			type: "string",
			format: "base64url",
			check: "string_format",
			abort: false,
			...normalizeParams(params)
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _e164(Class, params) {
		return new Class({
			type: "string",
			format: "e164",
			check: "string_format",
			abort: false,
			...normalizeParams(params)
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _jwt(Class, params) {
		return new Class({
			type: "string",
			format: "jwt",
			check: "string_format",
			abort: false,
			...normalizeParams(params)
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _isoDateTime(Class, params) {
		return new Class({
			type: "string",
			format: "datetime",
			check: "string_format",
			offset: false,
			local: false,
			precision: null,
			...normalizeParams(params)
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _isoDate(Class, params) {
		return new Class({
			type: "string",
			format: "date",
			check: "string_format",
			...normalizeParams(params)
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _isoTime(Class, params) {
		return new Class({
			type: "string",
			format: "time",
			check: "string_format",
			precision: null,
			...normalizeParams(params)
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _isoDuration(Class, params) {
		return new Class({
			type: "string",
			format: "duration",
			check: "string_format",
			...normalizeParams(params)
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _number(Class, params) {
		return new Class(snapshotChecks({
			type: "number",
			checks: [],
			...normalizeParams(params)
		}));
	}
	// @__NO_SIDE_EFFECTS__
	function _int(Class, params) {
		return new Class({
			type: "number",
			check: "number_format",
			abort: false,
			format: "safeint",
			...normalizeParams(params)
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _boolean(Class, params) {
		return new Class({
			type: "boolean",
			...normalizeParams(params)
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _unknown(Class) {
		return new Class({ type: "unknown" });
	}
	// @__NO_SIDE_EFFECTS__
	function _never(Class, params) {
		return new Class({
			type: "never",
			...normalizeParams(params)
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _lt(value, params) {
		return new $ZodCheckLessThan({
			check: "less_than",
			...normalizeParams(params),
			value,
			inclusive: false
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _lte(value, params) {
		return new $ZodCheckLessThan({
			check: "less_than",
			...normalizeParams(params),
			value,
			inclusive: true
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _gt(value, params) {
		return new $ZodCheckGreaterThan({
			check: "greater_than",
			...normalizeParams(params),
			value,
			inclusive: false
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _gte(value, params) {
		return new $ZodCheckGreaterThan({
			check: "greater_than",
			...normalizeParams(params),
			value,
			inclusive: true
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _multipleOf(value, params) {
		return new $ZodCheckMultipleOf({
			check: "multiple_of",
			...normalizeParams(params),
			value
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _maxLength(maximum, params) {
		return new $ZodCheckMaxLength({
			check: "max_length",
			...normalizeParams(params),
			maximum
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _minLength(minimum, params) {
		return new $ZodCheckMinLength({
			check: "min_length",
			...normalizeParams(params),
			minimum
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _length(length, params) {
		return new $ZodCheckLengthEquals({
			check: "length_equals",
			...normalizeParams(params),
			length
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _regex(pattern, params) {
		return new $ZodCheckRegex({
			check: "string_format",
			format: "regex",
			...normalizeParams(params),
			pattern
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _lowercase(params) {
		return new $ZodCheckLowerCase({
			check: "string_format",
			format: "lowercase",
			...normalizeParams(params)
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _uppercase(params) {
		return new $ZodCheckUpperCase({
			check: "string_format",
			format: "uppercase",
			...normalizeParams(params)
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _includes(includes, params) {
		return new $ZodCheckIncludes({
			check: "string_format",
			format: "includes",
			...normalizeParams(params),
			includes
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _startsWith(prefix, params) {
		return new $ZodCheckStartsWith({
			check: "string_format",
			format: "starts_with",
			...normalizeParams(params),
			prefix
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _endsWith(suffix, params) {
		return new $ZodCheckEndsWith({
			check: "string_format",
			format: "ends_with",
			...normalizeParams(params),
			suffix
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _overwrite(tx) {
		return new $ZodCheckOverwrite({
			check: "overwrite",
			tx
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _normalize(form) {
		return /* @__PURE__ */ _overwrite((input) => input.normalize(form));
	}
	// @__NO_SIDE_EFFECTS__
	function _trim() {
		return /* @__PURE__ */ _overwrite((input) => input.trim());
	}
	// @__NO_SIDE_EFFECTS__
	function _toLowerCase() {
		return /* @__PURE__ */ _overwrite((input) => input.toLowerCase());
	}
	// @__NO_SIDE_EFFECTS__
	function _toUpperCase() {
		return /* @__PURE__ */ _overwrite((input) => input.toUpperCase());
	}
	// @__NO_SIDE_EFFECTS__
	function _slugify() {
		return /* @__PURE__ */ _overwrite((input) => slugify(input));
	}
	// @__NO_SIDE_EFFECTS__
	function _array(Class, element, params) {
		return new Class({
			type: "array",
			element,
			...normalizeParams(params)
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _refine(Class, fn, _params) {
		return new Class({
			type: "custom",
			check: "custom",
			fn,
			...normalizeParams(_params)
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _superRefine(fn, params) {
		const ch = /* @__PURE__ */ _check((payload) => {
			payload.addIssue = (issue$2) => {
				if (typeof issue$2 === "string") payload.issues.push(issue(issue$2, payload.value, ch._zod.def));
				else {
					const _issue = issue$2;
					if (_issue.fatal) _issue.continue = false;
					_issue.code ?? (_issue.code = "custom");
					if (!("input" in _issue)) _issue.input = payload.value;
					_issue.inst ?? (_issue.inst = ch);
					_issue.continue ?? (_issue.continue = !ch._zod.def.abort);
					payload.issues.push(issue(_issue));
				}
			};
			return fn(payload.value, payload);
		}, params);
		return ch;
	}
	// @__NO_SIDE_EFFECTS__
	function _check(fn, params) {
		const ch = new $ZodCheck({
			check: "custom",
			...normalizeParams(params)
		});
		ch._zod.check = fn;
		return ch;
	}

//#endregion
//#region node_modules/zod/v4/core/to-json-schema.js
	function assignProps(target, ...sources) {
		for (const source of sources) for (const key of Reflect.ownKeys(source)) if (Object.prototype.propertyIsEnumerable.call(source, key)) assignProp(target, key, source[key]);
		return target;
	}
	function initializeContext(params) {
		let target = params?.target ?? "draft-2020-12";
		if (target === "draft-4") target = "draft-04";
		if (target === "draft-7") target = "draft-07";
		return {
			processors: params.processors ?? {},
			metadataRegistry: params?.metadata ?? globalRegistry,
			target,
			unrepresentable: params?.unrepresentable ?? "throw",
			override: params?.override ?? (() => {}),
			io: params?.io ?? "output",
			counter: 0,
			seen: /* @__PURE__ */ new Map(),
			sharedDefsExtractedFor: void 0,
			sharedEmitDoneFor: void 0,
			cycles: params?.cycles ?? "ref",
			reused: params?.reused ?? "inline",
			intersections: [],
			deferred: [],
			external: params?.external ?? void 0
		};
	}
	/**
	* Applies the `unrepresentable` setting at a site that has no JSON Schema equivalent. Throws
	* `message` unless the setting (or the handler's return value) says otherwise. Returns `true` if a
	* custom JSON Schema was written into `json`, in which case the caller must not write its own.
	*/
	function handleUnrepresentable(schema, ctx, json, params, message) {
		const result = typeof ctx.unrepresentable === "function" ? ctx.unrepresentable({
			zodSchema: schema,
			path: params.path,
			message
		}) : ctx.unrepresentable;
		if (result === "any") return false;
		if (result === void 0 || result === "throw") throw new Error(message);
		Object.assign(json, result);
		return true;
	}
	function processSchema(schema, ctx, _params = {
		path: [],
		schemaPath: []
	}) {
		var _a;
		const def = schema._zod.def;
		const seen = ctx.seen.get(schema);
		if (seen) {
			seen.count++;
			if (_params.schemaPath.includes(schema)) seen.cycle = _params.path;
			return seen.schema;
		}
		const result = {
			schema: {},
			count: 1,
			cycle: void 0,
			path: _params.path
		};
		ctx.seen.set(schema, result);
		ctx.sharedDefsExtractedFor = void 0;
		ctx.sharedEmitDoneFor = void 0;
		const overrideSchema = schema._zod.toJSONSchema?.();
		if (overrideSchema) result.schema = overrideSchema;
		else {
			const params = {
				..._params,
				schemaPath: [..._params.schemaPath, schema],
				path: _params.path
			};
			if (schema._zod.processJSONSchema) schema._zod.processJSONSchema(ctx, result.schema, params);
			else {
				const _json = result.schema;
				const processor = ctx.processors[def.type];
				if (!processor) throw new Error(`[toJSONSchema]: Non-representable type encountered: ${def.type}`);
				processor(schema, ctx, _json, params);
			}
			const parent = schema._zod.parent;
			if (parent) {
				if (!result.ref) result.ref = parent;
				processSchema(parent, ctx, params);
				ctx.seen.get(parent).isParent = true;
			}
		}
		const meta = ctx.metadataRegistry.get(schema);
		if (meta) assignProps(result.schema, meta);
		if (ctx.io === "input" && isTransforming(schema)) {
			delete result.schema.examples;
			delete result.schema.default;
		}
		if (ctx.io === "input" && "_prefault" in result.schema) (_a = result.schema).default ?? (_a.default = result.schema._prefault);
		delete result.schema._prefault;
		return ctx.seen.get(schema).schema;
	}
	function encodeJSONPointerSegment(segment) {
		return segment.replace(/~/g, "~0").replace(/\//g, "~1");
	}
	function extractDefs(ctx, schema) {
		const root = ctx.seen.get(schema);
		if (!root) throw new Error("Unprocessed schema. This is a bug in Zod.");
		if (ctx.external && ctx.sharedDefsExtractedFor === ctx.external) return;
		const idToSchema = /* @__PURE__ */ new Map();
		for (const entry of ctx.seen.entries()) {
			const id = ctx.metadataRegistry.get(entry[0])?.id;
			if (id) {
				const existing = idToSchema.get(id);
				if (existing && existing !== entry[0]) throw new Error(`Duplicate schema id "${id}" detected during JSON Schema conversion. Two different schemas cannot share the same id when converted together.`);
				idToSchema.set(id, entry[0]);
			}
		}
		const makeURI = (entry) => {
			const defsSegment = ctx.target === "draft-2020-12" ? "$defs" : "definitions";
			if (ctx.external) {
				const externalId = ctx.external.registry.get(entry[0])?.id;
				const uriGenerator = ctx.external.uri ?? ((id) => id);
				if (externalId) return { ref: uriGenerator(externalId) };
				const id = entry[1].defId ?? entry[1].schema.id ?? `schema${ctx.counter++}`;
				entry[1].defId = id;
				return {
					defId: id,
					ref: `${uriGenerator("__shared")}#/${defsSegment}/${encodeJSONPointerSegment(id)}`
				};
			}
			const uriPrefix = `#`;
			const defUriPrefix = `${uriPrefix}/${defsSegment}/`;
			if (entry[1] === root && !entry[1].schema.id) return { ref: uriPrefix };
			const defId = entry[1].schema.id ?? `__schema${ctx.counter++}`;
			return {
				defId,
				ref: defUriPrefix + encodeJSONPointerSegment(defId)
			};
		};
		const extractToDef = (entry) => {
			if (entry[1].schema.$ref) return;
			const seen = entry[1];
			const { ref, defId } = makeURI(entry);
			seen.def = { ...seen.schema };
			if (defId) seen.defId = defId;
			const schema = seen.schema;
			for (const key in schema) delete schema[key];
			schema.$ref = ref;
		};
		if (ctx.cycles === "throw") for (const entry of ctx.seen.entries()) {
			const seen = entry[1];
			if (seen.cycle) throw new Error(`Cycle detected: #/${seen.cycle?.join("/")}/<root>

Set the \`cycles\` parameter to \`"ref"\` to resolve cyclical schemas with defs.`);
		}
		for (const entry of ctx.seen.entries()) {
			const seen = entry[1];
			if (schema === entry[0]) {
				extractToDef(entry);
				continue;
			}
			if (ctx.external) {
				const ext = ctx.external.registry.get(entry[0])?.id;
				if (schema !== entry[0] && ext) {
					extractToDef(entry);
					continue;
				}
			}
			if (ctx.metadataRegistry.get(entry[0])?.id) {
				extractToDef(entry);
				continue;
			}
			if (seen.cycle) {
				extractToDef(entry);
				continue;
			}
			if (seen.count > 1) {
				if (ctx.reused === "ref") extractToDef(entry);
			}
		}
		if (ctx.external) ctx.sharedDefsExtractedFor = ctx.external;
	}
	/** Rewrites `anyOf: [{type: "a"}, {type: "b"}]` to `type: ["a", "b"]`, which every JSON Schema draft treats as equivalent and most consumers render far better for the nullable case. Only branches that are a bare type assertion qualify — anything carrying a constraint, `$ref`, `const` or metadata is left alone. Runs after `flattenRef`, so a branch an override decorated or `$defs` extraction turned into a `$ref` is no longer bare and correctly stays in `anyOf`. `oneOf` is excluded: `integer` and `number` overlap, so "exactly one" and "at least one" are not the same there. OpenAPI 3.0 is excluded: its `type` must be a single string. */
	function compactTypeUnion(schema) {
		const options = schema.anyOf;
		if (!Array.isArray(options) || options.length === 0 || schema.type !== void 0) return;
		const types = [];
		for (const option of options) {
			if (!option || typeof option !== "object") return;
			compactTypeUnion(option);
			const keys = Object.keys(option);
			if (keys.length !== 1 || keys[0] !== "type") return;
			const type = option.type;
			for (const member of Array.isArray(type) ? type : [type]) {
				if (typeof member !== "string") return;
				if (!types.includes(member)) types.push(member);
			}
		}
		delete schema.anyOf;
		schema.type = types.length === 1 ? types[0] : types;
	}
	/** Keywords `foldIntersection` knows how to combine. Anything else — `$ref`, `patternProperties`,
	* an annotation like `description` — makes a member unfoldable, so a constraint this does not
	* understand leaves the `allOf` alone instead of being silently dropped or misattributed. */
	const FOLDABLE_KEYS = /* @__PURE__ */ new Set([
		"type",
		"properties",
		"required",
		"additionalProperties"
	]);
	const UNION_KEYS = ["oneOf", "anyOf"];
	/** A member's constraint on a key it does not declare itself. A `catchall` states one; `false`, an absent `additionalProperties`, and the empty schema a loose object emits state nothing. */
	function undeclaredConstraint(member) {
		const extra = member.additionalProperties;
		if (extra === void 0 || extra === false || typeof extra !== "object" || extra === null) return null;
		return Object.keys(extra).length ? extra : null;
	}
	/** Combines object members into the single object they describe together, or returns `null` if any of them carries a keyword outside {@link FOLDABLE_KEYS}. */
	function foldObjects(members) {
		const objects = [];
		for (const member of members) {
			if (typeof member !== "object" || member.type !== "object") return null;
			for (const key in member) if (!FOLDABLE_KEYS.has(key)) return null;
			objects.push(member);
		}
		const properties = {};
		const required = /* @__PURE__ */ new Set();
		for (const object of objects) {
			for (const key in object.properties) {
				if (Object.prototype.hasOwnProperty.call(properties, key)) continue;
				const parts = [];
				for (const other of objects) {
					const part = other.properties?.[key] ?? undeclaredConstraint(other);
					if (part === null || part === void 0) continue;
					if (!parts.some((seen) => JSON.stringify(seen) === JSON.stringify(part))) parts.push(part);
				}
				const merged = parts.length === 1 ? parts[0] : foldObjects(parts) ?? { allOf: parts };
				assignProp(properties, key, merged);
			}
			for (const key of object.required ?? []) required.add(key);
		}
		const folded = {
			type: "object",
			properties
		};
		if (required.size) folded.required = [...required];
		if (objects.every((object) => object.additionalProperties === false)) folded.additionalProperties = false;
		else {
			const constraints = [];
			for (const object of objects) {
				const constraint = undeclaredConstraint(object);
				if (constraint && !constraints.some((seen) => JSON.stringify(seen) === JSON.stringify(constraint))) constraints.push(constraint);
			}
			if (constraints.length === 1) folded.additionalProperties = constraints[0];
			else if (constraints.length > 1) folded.additionalProperties = { allOf: constraints };
		}
		return folded;
	}
	/** `additionalProperties` in an `allOf` member sees only that member's own `properties`, so two
	* closed object members reject each other's keys and the schema validates nothing. Zod's parser
	* pools the key sets instead — `handleIntersectionResults` reports a key as unrecognized only when
	* *every* side rejects it — so the emitted schema has to pool them too, and folding the members
	* into one object is the encoding that says so on every target.
	*
	* This runs from `finalize`, after `extractDefs`, which is what keeps it clear of the `$ref`
	* machinery: a member extracted into `$defs` is already a `$ref` by now and declines to fold, so it
	* keeps its reference and its own closedness rather than being inlined as a stale copy. */
	function foldIntersection(json) {
		const allOf = json.allOf;
		if (!Array.isArray(allOf) || allOf.length < 2) return;
		for (const key of FOLDABLE_KEYS) if (key in json) return;
		const unions = allOf.filter((m) => UNION_KEYS.some((k) => Array.isArray(m[k])));
		let folded = null;
		if (!unions.length) folded = foldObjects(allOf);
		else {
			const union = unions[0];
			const keyword = UNION_KEYS.find((k) => Array.isArray(union[k]));
			if (Object.keys(union).length !== 1) return;
			const rest = allOf.filter((m) => m !== union);
			const branches = union[keyword].map((branch) => foldObjects([...rest, branch]));
			if (branches.some((b) => !b)) return;
			folded = { [keyword]: branches };
		}
		if (!folded) return;
		delete json.allOf;
		assignProps(json, folded);
	}
	function finalize(ctx, schema) {
		const root = ctx.seen.get(schema);
		if (!root) throw new Error("Unprocessed schema. This is a bug in Zod.");
		const flattenRef = (zodSchema) => {
			const seen = ctx.seen.get(zodSchema);
			if (seen.ref === null) return;
			const schema = seen.def ?? seen.schema;
			const _cached = { ...schema };
			const ref = seen.ref;
			seen.ref = null;
			if (ref) {
				flattenRef(ref);
				const refSeen = ctx.seen.get(ref);
				const refSchema = refSeen.schema;
				if (refSchema.$ref && (ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0")) {
					schema.allOf = schema.allOf ?? [];
					schema.allOf.push(refSchema);
				} else assignProps(schema, refSchema);
				assignProps(schema, _cached);
				if (zodSchema._zod.parent === ref) for (const key in schema) {
					if (key === "$ref" || key === "allOf") continue;
					if (!(key in _cached)) delete schema[key];
				}
				if (refSchema.$ref && refSeen.def) for (const key in schema) {
					if (key === "$ref" || key === "allOf") continue;
					if (key in refSeen.def && JSON.stringify(schema[key]) === JSON.stringify(refSeen.def[key])) delete schema[key];
				}
			}
			const parent = zodSchema._zod.parent;
			if (parent && parent !== ref) {
				flattenRef(parent);
				const parentSeen = ctx.seen.get(parent);
				if (parentSeen?.schema.$ref) {
					schema.$ref = parentSeen.schema.$ref;
					if (parentSeen.def) for (const key in schema) {
						if (key === "$ref" || key === "allOf") continue;
						if (key in parentSeen.def && JSON.stringify(schema[key]) === JSON.stringify(parentSeen.def[key])) delete schema[key];
					}
				}
			}
			ctx.override({
				zodSchema,
				jsonSchema: schema,
				path: seen.path ?? []
			});
		};
		if (!ctx.external || ctx.sharedEmitDoneFor !== ctx.external) {
			for (const entry of [...ctx.seen.entries()].reverse()) flattenRef(entry[0]);
			if (ctx.target !== "openapi-3.0") for (const entry of ctx.seen.entries()) compactTypeUnion(entry[1].def ?? entry[1].schema);
			for (const rewrite of ctx.deferred) rewrite();
			if (ctx.intersections.length) {
				const carriers = /* @__PURE__ */ new Map();
				for (const seen of ctx.seen.values()) for (const json of [seen.schema, seen.def]) {
					const allOf = json?.allOf;
					if (!Array.isArray(allOf)) continue;
					const existing = carriers.get(allOf);
					if (existing) existing.push(json);
					else carriers.set(allOf, [json]);
				}
				for (const allOf of ctx.intersections) for (const json of carriers.get(allOf) ?? []) foldIntersection(json);
			}
		}
		const result = {};
		if (ctx.target === "draft-2020-12") result.$schema = "https://json-schema.org/draft/2020-12/schema";
		else if (ctx.target === "draft-07") result.$schema = "http://json-schema.org/draft-07/schema#";
		else if (ctx.target === "draft-04") result.$schema = "http://json-schema.org/draft-04/schema#";
		else if (ctx.target === "openapi-3.0") {}
		if (ctx.external?.uri) {
			const id = ctx.external.registry.get(schema)?.id;
			if (!id) throw new Error("Schema is missing an `id` property");
			result.$id = ctx.external.uri(id);
		}
		assignProps(result, root.defId ? root.schema : root.def ?? root.schema);
		const rootMetaId = ctx.metadataRegistry.get(schema)?.id;
		if (rootMetaId !== void 0 && result.id === rootMetaId) delete result.id;
		const defs = ctx.external?.defs ?? {};
		if (!ctx.external || ctx.sharedEmitDoneFor !== ctx.external) for (const entry of ctx.seen.entries()) {
			const seen = entry[1];
			if (seen.def && seen.defId) {
				if (seen.def.id === seen.defId) delete seen.def.id;
				assignProp(defs, seen.defId, seen.def);
			}
		}
		if (ctx.external) ctx.sharedEmitDoneFor = ctx.external;
		if (ctx.external) {} else if (Object.keys(defs).length > 0) {
			if (ctx.target === "draft-2020-12") result.$defs = defs;
			else result.definitions = defs;
		}
		try {
			const finalized = JSON.parse(JSON.stringify(result));
			Object.defineProperty(finalized, "~standard", {
				value: {
					...schema["~standard"],
					jsonSchema: {
						input: createStandardJSONSchemaMethod(schema, "input", ctx.processors),
						output: createStandardJSONSchemaMethod(schema, "output", ctx.processors)
					}
				},
				enumerable: false,
				writable: false
			});
			return finalized;
		} catch (_err) {
			throw new Error("Error converting schema to JSON.");
		}
	}
	function isTransforming(_schema, _ctx) {
		const ctx = _ctx ?? { seen: /* @__PURE__ */ new Set() };
		if (ctx.seen.has(_schema)) return false;
		ctx.seen.add(_schema);
		const def = _schema._zod.def;
		if (def.type === "transform") return true;
		if (def.type === "array") return isTransforming(def.element, ctx);
		if (def.type === "set") return isTransforming(def.valueType, ctx);
		if (def.type === "lazy") return isTransforming(def.getter(), ctx);
		if (def.type === "promise" || def.type === "optional" || def.type === "nonoptional" || def.type === "nullable" || def.type === "readonly" || def.type === "default" || def.type === "prefault" || def.type === "catch") return isTransforming(def.innerType, ctx);
		if (def.type === "intersection") return isTransforming(def.left, ctx) || isTransforming(def.right, ctx);
		if (def.type === "record" || def.type === "map") return isTransforming(def.keyType, ctx) || isTransforming(def.valueType, ctx);
		if (def.type === "pipe") {
			if (_schema._zod.traits.has("$ZodCodec")) return true;
			return isTransforming(def.in, ctx) || isTransforming(def.out, ctx);
		}
		if (def.type === "object") {
			for (const key in def.shape) if (isTransforming(def.shape[key], ctx)) return true;
			return false;
		}
		if (def.type === "union") {
			for (const option of def.options) if (isTransforming(option, ctx)) return true;
			return false;
		}
		if (def.type === "tuple") {
			for (const item of def.items) if (isTransforming(item, ctx)) return true;
			if (def.rest && isTransforming(def.rest, ctx)) return true;
			return false;
		}
		return false;
	}
	/**
	* Creates a toJSONSchema method for a schema instance.
	* This encapsulates the logic of initializing context, processing, extracting defs, and finalizing.
	*/
	const createToJSONSchemaMethod = (schema, processors = {}) => (params) => {
		const ctx = initializeContext({
			...params,
			processors
		});
		processSchema(schema, ctx);
		extractDefs(ctx, schema);
		return finalize(ctx, schema);
	};
	const createStandardJSONSchemaMethod = (schema, io, processors = {}) => (params) => {
		const { libraryOptions, target } = params ?? {};
		const ctx = initializeContext({
			...libraryOptions ?? {},
			target,
			io,
			processors
		});
		processSchema(schema, ctx);
		extractDefs(ctx, schema);
		return finalize(ctx, schema);
	};

//#endregion
//#region node_modules/zod/v4/core/json-schema-processors.js
	const narrowMin = (agg, key, value) => {
		if (agg[key] === void 0 || value > agg[key]) agg[key] = value;
	};
	const narrowMax = (agg, key, value) => {
		if (agg[key] === void 0 || value < agg[key]) agg[key] = value;
	};
	const narrowBoth = (agg, value) => {
		narrowMin(agg, "minimum", value);
		narrowMax(agg, "maximum", value);
	};
	const addDivisor = (agg, value) => {
		agg.multipleOf ?? (agg.multipleOf = []);
		if (!agg.multipleOf.includes(value)) agg.multipleOf.push(value);
	};
	const addPattern = (agg, pattern) => {
		agg.patterns ?? (agg.patterns = /* @__PURE__ */ new Set());
		agg.patterns.add(pattern);
	};
	const intersectMime = (agg, mime) => {
		agg.mime = agg.mime ? agg.mime.filter((m) => mime.includes(m)) : [...mime];
	};
	const setFormat = (agg, format) => {
		agg.format = format;
		if (format.includes("int")) agg.isInt = true;
	};
	const minContributor = (agg, def) => narrowMin(agg, "minimum", def.minimum);
	const maxContributor = (agg, def) => narrowMax(agg, "maximum", def.maximum);
	const formatContributor = (ranges) => (agg, def) => {
		setFormat(agg, def.format);
		const [minimum, maximum] = ranges[def.format];
		narrowMin(agg, "minimum", minimum);
		narrowMax(agg, "maximum", maximum);
	};
	const contributors = {
		greater_than: (agg, def) => narrowMin(agg, def.inclusive ? "minimum" : "exclusiveMinimum", def.value),
		less_than: (agg, def) => narrowMax(agg, def.inclusive ? "maximum" : "exclusiveMaximum", def.value),
		multiple_of: (agg, def) => addDivisor(agg, def.value),
		number_format: formatContributor(NUMBER_FORMAT_RANGES),
		bigint_format: formatContributor(BIGINT_FORMAT_RANGES),
		min_length: minContributor,
		max_length: maxContributor,
		length_equals: (agg, def) => narrowBoth(agg, def.length),
		min_size: minContributor,
		max_size: maxContributor,
		size_equals: (agg, def) => narrowBoth(agg, def.size),
		string_format: (agg, def) => {
			setFormat(agg, def.format);
			if (def.pattern) addPattern(agg, def.pattern);
			if (def.format === "base64" || def.format === "base64url") agg.contentEncoding = def.format;
			if (def.local || def.precision === -1) agg.laxFormat = true;
		},
		mime_type: (agg, def) => intersectMime(agg, def.mime)
	};
	function aggregateChecks(schema) {
		const agg = {};
		const def = schema._zod.def;
		const list = schema._zod.traits.has("$ZodCheck") ? [schema, ...def.checks ?? []] : def.checks ?? [];
		for (const ch of list) contributors[ch._zod.def.check]?.(agg, ch._zod.def);
		const bag = schema._zod.bag;
		if (bag.minimum !== void 0) narrowMin(agg, "minimum", bag.minimum);
		if (bag.exclusiveMinimum !== void 0) narrowMin(agg, "exclusiveMinimum", bag.exclusiveMinimum);
		if (bag.maximum !== void 0) narrowMax(agg, "maximum", bag.maximum);
		if (bag.exclusiveMaximum !== void 0) narrowMax(agg, "exclusiveMaximum", bag.exclusiveMaximum);
		if (bag.multipleOf !== void 0) addDivisor(agg, bag.multipleOf);
		if (bag.format !== void 0) {
			agg.format ?? (agg.format = bag.format);
			if (bag.format.includes("int")) agg.isInt = true;
		}
		if (bag.mime) intersectMime(agg, bag.mime);
		for (const pattern of bag.patterns ?? []) addPattern(agg, pattern);
		return agg;
	}
	const formatMap = {
		guid: "uuid",
		url: "uri",
		datetime: "date-time",
		json_string: "json-string",
		regex: ""
	};
	const exactPatterns = /* @__PURE__ */ new Map([[base64Charset, base64], [base64urlCharset, base64url]]);
	const exactPattern = (p) => exactPatterns.get(p) ?? p;
	const stringProcessor = (schema, ctx, _json, _params) => {
		const json = _json;
		json.type = "string";
		const { minimum, maximum, format, patterns, contentEncoding, laxFormat } = aggregateChecks(schema);
		if (typeof minimum === "number") json.minLength = minimum;
		if (typeof maximum === "number") json.maxLength = maximum;
		if (format) {
			json.format = formatMap[format] ?? format;
			if (json.format === "") delete json.format;
			if (format === "time" || laxFormat) delete json.format;
		}
		if (contentEncoding) json.contentEncoding = contentEncoding;
		if (patterns && patterns.size > 0) {
			const patternList = [...patterns].map(exactPattern);
			if (patternList.length === 1) json.pattern = patternList[0].source;
			else if (patternList.length > 1) json.allOf = [...patternList.map((regex) => ({
				...ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0" ? { type: "string" } : {},
				pattern: regex.source
			}))];
		}
	};
	const numberProcessor = (schema, ctx, _json, params) => {
		const json = _json;
		const { minimum, maximum, multipleOf, exclusiveMaximum, exclusiveMinimum, isInt } = aggregateChecks(schema);
		json.type = isInt ? "integer" : "number";
		const exMin = typeof exclusiveMinimum === "number" && exclusiveMinimum >= (minimum ?? Number.NEGATIVE_INFINITY);
		const exMax = typeof exclusiveMaximum === "number" && exclusiveMaximum <= (maximum ?? Number.POSITIVE_INFINITY);
		const legacy = ctx.target === "draft-04" || ctx.target === "openapi-3.0";
		if (exMin) {
			if (legacy) {
				json.minimum = exclusiveMinimum;
				json.exclusiveMinimum = true;
			} else json.exclusiveMinimum = exclusiveMinimum;
		} else if (typeof minimum === "number") json.minimum = minimum;
		if (exMax) {
			if (legacy) {
				json.maximum = exclusiveMaximum;
				json.exclusiveMaximum = true;
			} else json.exclusiveMaximum = exclusiveMaximum;
		} else if (typeof maximum === "number") json.maximum = maximum;
		if (multipleOf) {
			const divisors = /* @__PURE__ */ new Set();
			for (const divisor of multipleOf) if (Number.isFinite(divisor) && divisor !== 0) divisors.add(Math.abs(divisor));
			else handleUnrepresentable(schema, ctx, json, params, `A multipleOf divisor of ${divisor} cannot be represented in JSON Schema`);
			const [first, ...rest] = divisors;
			if (first !== void 0) json.multipleOf = first;
			if (rest.length) json.allOf = [...json.allOf ?? [], ...rest.map((m) => ({ multipleOf: m }))];
		}
	};
	const booleanProcessor = (_schema, _ctx, json, _params) => {
		json.type = "boolean";
	};
	const neverProcessor = (_schema, _ctx, json, _params) => {
		json.not = {};
	};
	const unknownProcessor = (_schema, _ctx, _json, _params) => {};
	const enumProcessor = (schema, _ctx, json, _params) => {
		const def = schema._zod.def;
		const values = getEnumValues(def.entries);
		if (values.length === 0) {
			json.not = {};
			return;
		}
		if (values.every((v) => typeof v === "number")) json.type = "number";
		if (values.every((v) => typeof v === "string")) json.type = "string";
		json.enum = values;
	};
	const customProcessor = (schema, ctx, json, params) => {
		handleUnrepresentable(schema, ctx, json, params, "Custom types cannot be represented in JSON Schema");
	};
	const transformProcessor = (schema, ctx, json, params) => {
		handleUnrepresentable(schema, ctx, json, params, "Transforms cannot be represented in JSON Schema");
	};
	const arrayProcessor = (schema, ctx, _json, params) => {
		const json = _json;
		const def = schema._zod.def;
		const { minimum, maximum } = aggregateChecks(schema);
		if (typeof minimum === "number") json.minItems = minimum;
		if (typeof maximum === "number") json.maxItems = maximum;
		json.type = "array";
		json.items = processSchema(def.element, ctx, {
			...params,
			path: [...params.path, "items"]
		});
	};
	function inputOptin(schema) {
		const def = schema._zod.def;
		if (def.type === "pipe" && def.in._zod.traits.has("$ZodTransform")) return inputOptin(def.out);
		if (def.type === "catch") return inputOptin(def.innerType);
		return schema._zod.optin;
	}
	const objectProcessor = (schema, ctx, _json, params) => {
		const json = _json;
		const def = schema._zod.def;
		const shape = def.shape;
		if (Object.getOwnPropertySymbols(shape).length && handleUnrepresentable(schema, ctx, json, params, "Symbol keys cannot be represented in JSON Schema")) return;
		json.type = "object";
		json.properties = {};
		for (const key in shape) assignProp(json.properties, key, processSchema(shape[key], ctx, {
			...params,
			path: [
				...params.path,
				"properties",
				key
			]
		}));
		const requiredKeys = [];
		for (const key of Object.keys(shape)) {
			const field = def.shape[key];
			if (ctx.io === "input" ? inputOptin(field) === void 0 : field._zod.optout === void 0) requiredKeys.push(key);
		}
		if (requiredKeys.length > 0) json.required = requiredKeys;
		if (def.catchall?._zod.def.type === "never") json.additionalProperties = false;
		else if (!def.catchall) {
			if (ctx.io === "output") json.additionalProperties = false;
		} else if (def.catchall) json.additionalProperties = processSchema(def.catchall, ctx, {
			...params,
			path: [...params.path, "additionalProperties"]
		});
	};
	const unionProcessor = (schema, ctx, json, params) => {
		const def = schema._zod.def;
		const isExclusive = def.inclusive === false;
		const options = def.options.map((x, i) => processSchema(x, ctx, {
			...params,
			path: [
				...params.path,
				isExclusive ? "oneOf" : "anyOf",
				i
			]
		}));
		if (isExclusive) json.oneOf = options;
		else json.anyOf = options;
	};
	const intersectionProcessor = (schema, ctx, json, params) => {
		const def = schema._zod.def;
		const a = processSchema(def.left, ctx, {
			...params,
			path: [
				...params.path,
				"allOf",
				0
			]
		});
		const b = processSchema(def.right, ctx, {
			...params,
			path: [
				...params.path,
				"allOf",
				1
			]
		});
		const isSimpleIntersection = (val) => "allOf" in val && Object.keys(val).length === 1;
		const allOf = [...isSimpleIntersection(a) ? a.allOf : [a], ...isSimpleIntersection(b) ? b.allOf : [b]];
		json.allOf = allOf;
		ctx.intersections.push(allOf);
	};
	/** JSON object keys are always strings, so a numeric record key schema is re-expressed over the
	* numeric-string form the record parser matches. Deferred to `finalize`, after the flatten: a key
	* behind a wrapper only carries its own `type` before then, and a union key only has its branches.
	*
	* A numeric bound cannot apply to a property name, so `minimum` and its siblings are dropped rather
	* than carried over: keeping them beside `type: "string"` reproduces the match-nothing schema this
	* exists to fix. A key that carries one therefore emits wider than the record parses — `z.record(z.number().min(5), V)`
	* accepts `"3"` — which is the deliberate trade, since throwing on it would reject an ordinary schema
	* outright. */
	function stringifyKeyNames(bySchema, json, visited) {
		if (json.$ref) {
			if (visited.has(json)) return json;
			visited.add(json);
			const def = bySchema.get(json)?.def;
			if (!def) return json;
			const inlined = stringifyKeyNames(bySchema, def, visited);
			return inlined === def ? json : inlined;
		}
		for (const keyword of ["anyOf", "oneOf"]) {
			const branches = json[keyword];
			if (!Array.isArray(branches)) continue;
			const mapped = branches.map((branch) => stringifyKeyNames(bySchema, branch, visited));
			if (mapped.some((branch, i) => branch !== branches[i])) json = {
				...json,
				[keyword]: mapped
			};
		}
		const types = Array.isArray(json.type) ? json.type : [json.type];
		const numericType = !types.includes("string") && types.some((t) => t === "number" || t === "integer");
		const values = json.enum ?? (json.const !== void 0 ? [json.const] : void 0);
		if (!numericType && !values?.some((v) => typeof v === "number")) return json;
		const { minimum, maximum, exclusiveMinimum, exclusiveMaximum, multipleOf, format, id, ...rest } = json;
		if (rest.enum) rest.enum = rest.enum.map((v) => typeof v === "number" ? String(v) : v);
		else if (typeof rest.const === "number") rest.const = String(rest.const);
		if (!numericType) return rest;
		rest.type = "string";
		if (!values) rest.pattern = (types.includes("number") ? number$1 : integer).source;
		return rest;
	}
	/** Every record of one conversion, so the carriers are found in a single pass rather than once per record. */
	const pendingRecords = /* @__PURE__ */ new WeakMap();
	function rewriteKeyNames(ctx) {
		const bySchema = /* @__PURE__ */ new Map();
		for (const entry of ctx.seen.values()) if (entry.def && !bySchema.has(entry.schema)) bySchema.set(entry.schema, entry);
		const rewrites = /* @__PURE__ */ new Map();
		for (const record of pendingRecords.get(ctx) ?? []) {
			const seen = ctx.seen.get(record);
			const names = (seen?.def ?? seen?.schema)?.propertyNames;
			if (!names || names === true || rewrites.has(names)) continue;
			const rewritten = stringifyKeyNames(bySchema, names, /* @__PURE__ */ new Set());
			if (rewritten !== names) rewrites.set(names, rewritten);
		}
		if (!rewrites.size) return;
		for (const entry of ctx.seen.values()) for (const carrier of [entry.schema, entry.def]) {
			const rewritten = carrier && rewrites.get(carrier.propertyNames);
			if (rewritten) carrier.propertyNames = rewritten;
		}
	}
	const recordProcessor = (schema, ctx, _json, params) => {
		const json = _json;
		const def = schema._zod.def;
		json.type = "object";
		const keyType = def.keyType;
		const patterns = aggregateChecks(keyType).patterns;
		if (def.mode === "loose" && patterns && patterns.size > 0) {
			const valueSchema = processSchema(def.valueType, ctx, {
				...params,
				path: [
					...params.path,
					"patternProperties",
					"*"
				]
			});
			json.patternProperties = {};
			for (const pattern of patterns) assignProp(json.patternProperties, exactPattern(pattern).source, valueSchema);
		} else {
			if (ctx.target === "draft-07" || ctx.target === "draft-2020-12") {
				json.propertyNames = processSchema(def.keyType, ctx, {
					...params,
					path: [...params.path, "propertyNames"]
				});
				let pending = pendingRecords.get(ctx);
				if (!pending) {
					pending = [];
					pendingRecords.set(ctx, pending);
					ctx.deferred.push(() => rewriteKeyNames(ctx));
				}
				pending.push(schema);
			}
			json.additionalProperties = processSchema(def.valueType, ctx, {
				...params,
				path: [...params.path, "additionalProperties"]
			});
		}
		const keyValues = keyType._zod.values;
		const omittableOnInput = ctx.io === "input" && inputOptin(def.valueType) !== void 0;
		if (keyValues && !def.partial && !omittableOnInput) {
			const validKeyValues = [...keyValues].filter((v) => typeof v === "string" || typeof v === "number");
			if (validKeyValues.length > 0) json.required = validKeyValues.map(String);
		}
	};
	const nullableProcessor = (schema, ctx, json, params) => {
		const def = schema._zod.def;
		const inner = processSchema(def.innerType, ctx, params);
		const seen = ctx.seen.get(schema);
		if (ctx.target === "openapi-3.0") {
			seen.ref = def.innerType;
			json.nullable = true;
		} else json.anyOf = [inner, { type: "null" }];
	};
	const nonoptionalProcessor = (schema, ctx, _json, params) => {
		const def = schema._zod.def;
		processSchema(def.innerType, ctx, params);
		const seen = ctx.seen.get(schema);
		seen.ref = def.innerType;
	};
	/** Round-trips a default value through JSON so the emitted schema is guaranteed to be valid JSON.
	* A BigInt has no reliable encoding, so it goes through `unrepresentable` like any other
	* unrepresentable value. Returns a sentinel when the caller must not write a default of its own. */
	const UNREPRESENTABLE_DEFAULT = Symbol();
	function serializeDefaultValue(value, schema, ctx, json, params) {
		let unrepresentable = false;
		const serialized = JSON.stringify(value, (_, val) => {
			if (typeof val !== "bigint") return val;
			unrepresentable = true;
			return null;
		});
		if (!unrepresentable) return JSON.parse(serialized);
		handleUnrepresentable(schema, ctx, json, params, "BigInt defaults cannot be represented in JSON Schema");
		return UNREPRESENTABLE_DEFAULT;
	}
	const defaultProcessor = (schema, ctx, json, params) => {
		const def = schema._zod.def;
		processSchema(def.innerType, ctx, params);
		const seen = ctx.seen.get(schema);
		seen.ref = def.innerType;
		const value = serializeDefaultValue(def.defaultValue, schema, ctx, json, params);
		if (value !== UNREPRESENTABLE_DEFAULT) json.default = value;
	};
	const prefaultProcessor = (schema, ctx, json, params) => {
		const def = schema._zod.def;
		processSchema(def.innerType, ctx, params);
		const seen = ctx.seen.get(schema);
		seen.ref = def.innerType;
		if (ctx.io !== "input") return;
		const value = serializeDefaultValue(def.defaultValue, schema, ctx, json, params);
		if (value !== UNREPRESENTABLE_DEFAULT) json._prefault = value;
	};
	const catchProcessor = (schema, ctx, json, params) => {
		const def = schema._zod.def;
		processSchema(def.innerType, ctx, params);
		const seen = ctx.seen.get(schema);
		seen.ref = def.innerType;
		let catchValue;
		try {
			catchValue = def.catchValue(void 0);
		} catch {
			handleUnrepresentable(schema, ctx, json, params, "Dynamic catch values are not supported in JSON Schema");
			return;
		}
		json.default = catchValue;
	};
	const pipeProcessor = (schema, ctx, _json, params) => {
		const def = schema._zod.def;
		const inIsTransform = def.in._zod.traits.has("$ZodTransform");
		const innerType = ctx.io === "input" ? inIsTransform ? def.out : def.in : def.out;
		processSchema(innerType, ctx, params);
		const seen = ctx.seen.get(schema);
		seen.ref = innerType;
	};
	const readonlyProcessor = (schema, ctx, json, params) => {
		const def = schema._zod.def;
		processSchema(def.innerType, ctx, params);
		const seen = ctx.seen.get(schema);
		seen.ref = def.innerType;
		json.readOnly = true;
	};
	const optionalProcessor = (schema, ctx, _json, params) => {
		const def = schema._zod.def;
		processSchema(def.innerType, ctx, params);
		const seen = ctx.seen.get(schema);
		seen.ref = def.innerType;
	};

//#endregion
//#region node_modules/zod/v4/classic/errors.js
	const _installedErrorProtos = /* @__PURE__ */ new WeakSet([Object.prototype, Error.prototype]);
	function _lazyMethod(proto, key, make) {
		Object.defineProperty(proto, key, {
			configurable: true,
			enumerable: false,
			get() {
				const value = make(this);
				Object.defineProperty(this, key, {
					value,
					configurable: true,
					writable: true
				});
				return value;
			},
			set(value) {
				Object.defineProperty(this, key, {
					value,
					configurable: true,
					writable: true
				});
			}
		});
	}
	const initializer = (inst, issues) => {
		$ZodError.init(inst, issues);
		inst.name = "ZodError";
		const proto = Object.getPrototypeOf(inst);
		if (_installedErrorProtos.has(proto)) return;
		_installedErrorProtos.add(proto);
		_lazyMethod(proto, "format", (self) => (mapper) => formatError(self, mapper));
		_lazyMethod(proto, "flatten", (self) => (mapper) => flattenError(self, mapper));
		_lazyMethod(proto, "addIssue", (self) => (issue) => {
			self.issues.push(issue);
			self.message = JSON.stringify(self.issues, jsonStringifyReplacer, 2);
		});
		_lazyMethod(proto, "addIssues", (self) => (issues) => {
			self.issues.push(...issues);
			self.message = JSON.stringify(self.issues, jsonStringifyReplacer, 2);
		});
		Object.defineProperty(proto, "isEmpty", {
			configurable: true,
			enumerable: false,
			get() {
				return this.issues.length === 0;
			}
		});
	};
	const ZodRealError = /*@__PURE__*/ $constructor("ZodError", initializer, void 0, { Parent: Error });

//#endregion
//#region node_modules/zod/v4/classic/parse.js
	const parse = /* @__PURE__ */ _parse(ZodRealError);
	const parseAsync = /* @__PURE__ */ _parseAsync(ZodRealError);
	const safeParse = /* @__PURE__ */ _safeParse(ZodRealError);
	const safeParseAsync = /* @__PURE__ */ _safeParseAsync(ZodRealError);
	const encode = /* @__PURE__ */ _encode(ZodRealError);
	const decode = /* @__PURE__ */ _decode(ZodRealError);
	const encodeAsync = /* @__PURE__ */ _encodeAsync(ZodRealError);
	const decodeAsync = /* @__PURE__ */ _decodeAsync(ZodRealError);
	const safeEncode = /* @__PURE__ */ _safeEncode(ZodRealError);
	const safeDecode = /* @__PURE__ */ _safeDecode(ZodRealError);
	const safeEncodeAsync = /* @__PURE__ */ _safeEncodeAsync(ZodRealError);
	const safeDecodeAsync = /* @__PURE__ */ _safeDecodeAsync(ZodRealError);

//#endregion
//#region node_modules/zod/v4/classic/schemas.js
	function _ensureDefaultLocale() {
		if (!globalConfig.localeError) config(en_default());
	}
	function _ensureDefaultMemoizer() {
		if (!globalConfig.memoizer) config({ memoizer: memoizer() });
	}
	const ZodType = /*@__PURE__*/ $constructor("ZodType", (inst, def) => {
		_ensureDefaultLocale();
		$ZodType.init(inst, def);
		inst.def = def;
		inst.type = def.type;
		return inst;
	}, {
		check(...chks) {
			const def = this.def;
			return this.clone(mergeDefs(def, { checks: [...def.checks ?? [], ...chks.map((ch) => typeof ch === "function" ? { _zod: {
				check: ch,
				def: { check: "custom" },
				onattach: []
			} } : ch)] }), { parent: true });
		},
		with(...chks) {
			return this.check(...chks);
		},
		clone(def, params) {
			return clone(this, def, params);
		},
		brand() {
			return this;
		},
		register(reg, meta) {
			reg.add(this, meta);
			return this;
		},
		refine(check, params) {
			return this.check(refine(check, params));
		},
		superRefine(refinement, params) {
			return this.check(superRefine(refinement, params));
		},
		overwrite(fn) {
			return this.check(_overwrite(fn));
		},
		optional() {
			return optional(this);
		},
		exactOptional() {
			return exactOptional(this);
		},
		nullable() {
			return nullable(this);
		},
		nullish() {
			return optional(nullable(this));
		},
		nonoptional(params) {
			return nonoptional(this, params);
		},
		array() {
			return array(this);
		},
		or(arg) {
			return union([this, arg]);
		},
		and(arg) {
			return intersection(this, arg);
		},
		transform(tx) {
			return pipe(this, transform(tx));
		},
		default(d) {
			return _default(this, d);
		},
		prefault(d) {
			return prefault(this, d);
		},
		catch(params) {
			return _catch(this, params);
		},
		pipe(target) {
			return pipe(this, target);
		},
		readonly() {
			return readonly(this);
		},
		describe(description) {
			const cl = this.clone();
			globalRegistry.add(cl, { description });
			return cl;
		},
		meta(...args) {
			if (args.length === 0) return globalRegistry.get(this);
			const cl = this.clone();
			globalRegistry.add(cl, args[0]);
			return cl;
		},
		isOptional() {
			return this.safeParse(void 0).success;
		},
		isNullable() {
			return this.safeParse(null).success;
		},
		apply(fn, ...args) {
			return args.length === 0 ? fn(this) : fn(this, ...args);
		},
		get "~standard"() {
			return hide(this, "~standard", {
				...standardProps(this),
				jsonSchema: {
					input: createStandardJSONSchemaMethod(this, "input"),
					output: createStandardJSONSchemaMethod(this, "output")
				}
			});
		},
		set "~standard"(value) {
			own(this, "~standard", value);
		},
		parse: function _parse(data, params) {
			return parse(this, data, params, { callee: _parse });
		},
		parseAsync: async function _parseAsync(data, params) {
			return await parseAsync(this, data, params, { callee: _parseAsync });
		},
		safeParse(data, params) {
			return safeParse(this, data, params);
		},
		async safeParseAsync(data, params) {
			return safeParseAsync(this, data, params);
		},
		get spa() {
			return this?.safeParseAsync;
		},
		set spa(value) {
			own(this, "spa", value);
		},
		validate(data, params) {
			return validate(this, data, params);
		},
		validateAsync(data, params) {
			return validateAsync$1(this, data, params);
		},
		encode: function _encode(data, params) {
			return encode(this, data, params, { callee: _encode });
		},
		decode: function _decode(data, params) {
			return decode(this, data, params, { callee: _decode });
		},
		encodeAsync: async function _encodeAsync(data, params) {
			return await encodeAsync(this, data, params, { callee: _encodeAsync });
		},
		decodeAsync: async function _decodeAsync(data, params) {
			return await decodeAsync(this, data, params, { callee: _decodeAsync });
		},
		safeEncode(data, params) {
			return safeEncode(this, data, params);
		},
		safeDecode(data, params) {
			return safeDecode(this, data, params);
		},
		async safeEncodeAsync(data, params) {
			return safeEncodeAsync(this, data, params);
		},
		async safeDecodeAsync(data, params) {
			return safeDecodeAsync(this, data, params);
		},
		toJSONSchema(params) {
			return createToJSONSchemaMethod(this, {})(params);
		},
		get description() {
			return globalRegistry.get(this)?.description;
		},
		get _def() {
			return this._zod.def;
		}
	});
	/** @internal */
	const _ZodString = /*@__PURE__*/ $constructor("_ZodString", (inst, def) => {
		$ZodString.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => stringProcessor(inst, ctx, json, params);
	}, /*@__PURE__*/ derived({
		format: (inst) => aggregateChecks(inst).format ?? null,
		minLength: (inst) => aggregateChecks(inst).minimum ?? null,
		maxLength: (inst) => aggregateChecks(inst).maximum ?? null
	}, {
		regex(...args) {
			return this.check(_regex(...args));
		},
		includes(...args) {
			return this.check(_includes(...args));
		},
		startsWith(...args) {
			return this.check(_startsWith(...args));
		},
		endsWith(...args) {
			return this.check(_endsWith(...args));
		},
		min(...args) {
			return this.check(_minLength(...args));
		},
		max(...args) {
			return this.check(_maxLength(...args));
		},
		length(...args) {
			return this.check(_length(...args));
		},
		nonempty(...args) {
			return this.check(_minLength(1, ...args));
		},
		lowercase(params) {
			return this.check(_lowercase(params));
		},
		uppercase(params) {
			return this.check(_uppercase(params));
		},
		trim() {
			return this.check(_trim());
		},
		normalize(...args) {
			return this.check(_normalize(...args));
		},
		toLowerCase() {
			return this.check(_toLowerCase());
		},
		toUpperCase() {
			return this.check(_toUpperCase());
		},
		slugify() {
			return this.check(_slugify());
		}
	}));
	const ZodString = /*@__PURE__*/ $constructor("ZodString", (inst, def) => {
		$ZodString.init(inst, def);
		_ZodString.init(inst, def);
	}, {
		email(params) {
			return this.check(_email(ZodEmail, params));
		},
		url(params) {
			return this.check(_url(ZodURL, params));
		},
		jwt(params) {
			return this.check(_jwt(ZodJWT, params));
		},
		emoji(params) {
			return this.check(_emoji(ZodEmoji, params));
		},
		guid(params) {
			return this.check(_guid(ZodGUID, params));
		},
		uuid(params) {
			return this.check(_uuid(ZodUUID, params));
		},
		uuidv4(params) {
			return this.check(_uuidv4(ZodUUID, params));
		},
		uuidv6(params) {
			return this.check(_uuidv6(ZodUUID, params));
		},
		uuidv7(params) {
			return this.check(_uuidv7(ZodUUID, params));
		},
		nanoid(params) {
			return this.check(_nanoid(ZodNanoID, params));
		},
		cuid(params) {
			return this.check(_cuid(ZodCUID, params));
		},
		cuid2(params) {
			return this.check(_cuid2(ZodCUID2, params));
		},
		ulid(params) {
			return this.check(_ulid(ZodULID, params));
		},
		base64(params) {
			return this.check(_base64(ZodBase64, params));
		},
		base64url(params) {
			return this.check(_base64url(ZodBase64URL, params));
		},
		xid(params) {
			return this.check(_xid(ZodXID, params));
		},
		ksuid(params) {
			return this.check(_ksuid(ZodKSUID, params));
		},
		ipv4(params) {
			return this.check(_ipv4(ZodIPv4, params));
		},
		ipv6(params) {
			return this.check(_ipv6(ZodIPv6, params));
		},
		cidrv4(params) {
			return this.check(_cidrv4(ZodCIDRv4, params));
		},
		cidrv6(params) {
			return this.check(_cidrv6(ZodCIDRv6, params));
		},
		e164(params) {
			return this.check(_e164(ZodE164, params));
		},
		datetime(params) {
			return this.check(_isoDateTime(ZodISODateTime, params));
		},
		date(params) {
			return this.check(_isoDate(ZodISODate, params));
		},
		time(params) {
			return this.check(_isoTime(ZodISOTime, params));
		},
		duration(params) {
			return this.check(_isoDuration(ZodISODuration, params));
		}
	});
	function string(params) {
		return _string(ZodString, params);
	}
	const ZodStringFormat = /*@__PURE__*/ $constructor("ZodStringFormat", (inst, def) => {
		$ZodStringFormat.init(inst, def);
		_ZodString.init(inst, def);
	});
	const ZodISODateTime = /*@__PURE__*/ $constructor("ZodISODateTime", (inst, def) => {
		$ZodISODateTime.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	const ZodISODate = /*@__PURE__*/ $constructor("ZodISODate", (inst, def) => {
		$ZodISODate.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	const ZodISOTime = /*@__PURE__*/ $constructor("ZodISOTime", (inst, def) => {
		$ZodISOTime.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	const ZodISODuration = /*@__PURE__*/ $constructor("ZodISODuration", (inst, def) => {
		$ZodISODuration.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	const ZodEmail = /*@__PURE__*/ $constructor("ZodEmail", (inst, def) => {
		$ZodEmail.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	const ZodGUID = /*@__PURE__*/ $constructor("ZodGUID", (inst, def) => {
		$ZodGUID.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	const ZodUUID = /*@__PURE__*/ $constructor("ZodUUID", (inst, def) => {
		$ZodUUID.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	const ZodURL = /*@__PURE__*/ $constructor("ZodURL", (inst, def) => {
		$ZodURL.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	const ZodEmoji = /*@__PURE__*/ $constructor("ZodEmoji", (inst, def) => {
		$ZodEmoji.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	const ZodNanoID = /*@__PURE__*/ $constructor("ZodNanoID", (inst, def) => {
		$ZodNanoID.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	/**
	* @deprecated CUID v1 is deprecated by its authors due to information leakage
	* (timestamps embedded in the id). Use {@link ZodCUID2} instead.
	* See https://github.com/paralleldrive/cuid.
	*/
	const ZodCUID = /*@__PURE__*/ $constructor("ZodCUID", (inst, def) => {
		$ZodCUID.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	const ZodCUID2 = /*@__PURE__*/ $constructor("ZodCUID2", (inst, def) => {
		$ZodCUID2.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	const ZodULID = /*@__PURE__*/ $constructor("ZodULID", (inst, def) => {
		$ZodULID.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	const ZodXID = /*@__PURE__*/ $constructor("ZodXID", (inst, def) => {
		$ZodXID.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	const ZodKSUID = /*@__PURE__*/ $constructor("ZodKSUID", (inst, def) => {
		$ZodKSUID.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	const ZodIPv4 = /*@__PURE__*/ $constructor("ZodIPv4", (inst, def) => {
		$ZodIPv4.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	const ZodIPv6 = /*@__PURE__*/ $constructor("ZodIPv6", (inst, def) => {
		$ZodIPv6.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	const ZodCIDRv4 = /*@__PURE__*/ $constructor("ZodCIDRv4", (inst, def) => {
		$ZodCIDRv4.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	const ZodCIDRv6 = /*@__PURE__*/ $constructor("ZodCIDRv6", (inst, def) => {
		$ZodCIDRv6.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	const ZodBase64 = /*@__PURE__*/ $constructor("ZodBase64", (inst, def) => {
		$ZodBase64.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	const ZodBase64URL = /*@__PURE__*/ $constructor("ZodBase64URL", (inst, def) => {
		$ZodBase64URL.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	const ZodE164 = /*@__PURE__*/ $constructor("ZodE164", (inst, def) => {
		$ZodE164.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	const ZodJWT = /*@__PURE__*/ $constructor("ZodJWT", (inst, def) => {
		$ZodJWT.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	const ZodNumber = /*@__PURE__*/ $constructor("ZodNumber", (inst, def) => {
		$ZodNumber.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => numberProcessor(inst, ctx, json, params);
		inst.isFinite = true;
	}, /*@__PURE__*/ derived({
		minValue: (inst) => {
			const { minimum, exclusiveMinimum } = aggregateChecks(inst);
			return Math.max(minimum ?? Number.NEGATIVE_INFINITY, exclusiveMinimum ?? Number.NEGATIVE_INFINITY);
		},
		maxValue: (inst) => {
			const { maximum, exclusiveMaximum } = aggregateChecks(inst);
			return Math.min(maximum ?? Number.POSITIVE_INFINITY, exclusiveMaximum ?? Number.POSITIVE_INFINITY);
		},
		isInt: (inst) => {
			const { isInt, multipleOf } = aggregateChecks(inst);
			return !!isInt || !!multipleOf?.some(Number.isSafeInteger);
		},
		format: (inst) => aggregateChecks(inst).format ?? null
	}, {
		gt(value, params) {
			return this.check(_gt(value, params));
		},
		gte(value, params) {
			return this.check(_gte(value, params));
		},
		min(value, params) {
			return this.check(_gte(value, params));
		},
		lt(value, params) {
			return this.check(_lt(value, params));
		},
		lte(value, params) {
			return this.check(_lte(value, params));
		},
		max(value, params) {
			return this.check(_lte(value, params));
		},
		int(params) {
			return this.check(int(params));
		},
		safe(params) {
			return this.check(int(params));
		},
		positive(params) {
			return this.check(_gt(0, params));
		},
		nonnegative(params) {
			return this.check(_gte(0, params));
		},
		negative(params) {
			return this.check(_lt(0, params));
		},
		nonpositive(params) {
			return this.check(_lte(0, params));
		},
		multipleOf(value, params) {
			return this.check(_multipleOf(value, params));
		},
		step(value, params) {
			return this.check(_multipleOf(value, params));
		},
		finite() {
			return this;
		}
	}));
	function number(params) {
		return _number(ZodNumber, params);
	}
	const ZodNumberFormat = /*@__PURE__*/ $constructor("ZodNumberFormat", (inst, def) => {
		$ZodNumberFormat.init(inst, def);
		ZodNumber.init(inst, def);
	});
	function int(params) {
		return _int(ZodNumberFormat, params);
	}
	const ZodBoolean = /*@__PURE__*/ $constructor("ZodBoolean", (inst, def) => {
		$ZodBoolean.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => booleanProcessor(inst, ctx, json, params);
	});
	function boolean(params) {
		return _boolean(ZodBoolean, params);
	}
	const ZodUnknown = /*@__PURE__*/ $constructor("ZodUnknown", (inst, def) => {
		$ZodUnknown.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => unknownProcessor(inst, ctx, json, params);
	});
	function unknown() {
		return _unknown(ZodUnknown);
	}
	const ZodNever = /*@__PURE__*/ $constructor("ZodNever", (inst, def) => {
		$ZodNever.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => neverProcessor(inst, ctx, json, params);
	});
	function never(params) {
		return _never(ZodNever, params);
	}
	const ZodArray = /*@__PURE__*/ $constructor("ZodArray", (inst, def) => {
		_ensureDefaultMemoizer();
		$ZodArray.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => arrayProcessor(inst, ctx, json, params);
		inst.element = def.element;
	}, {
		min(n, params) {
			return this.check(_minLength(n, params));
		},
		nonempty(params) {
			return this.check(_minLength(1, params));
		},
		max(n, params) {
			return this.check(_maxLength(n, params));
		},
		length(n, params) {
			return this.check(_length(n, params));
		},
		unwrap() {
			return this.element;
		}
	});
	function array(element, params) {
		return _array(ZodArray, element, params);
	}
	const ZodObject = /*@__PURE__*/ $constructor("ZodObject", (inst, def) => {
		_ensureDefaultMemoizer();
		$ZodObjectJIT.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => objectProcessor(inst, ctx, json, params);
		installLazyProp(inst, "shape", (self) => self._zod.def.shape, false);
	}, {
		keyof() {
			return _enum(Object.keys(this._zod.def.shape));
		},
		catchall(catchall) {
			return this.clone(mergeDefs(this._zod.def, { catchall }));
		},
		passthrough() {
			return this.clone(mergeDefs(this._zod.def, { catchall: unknown() }));
		},
		loose() {
			return this.clone(mergeDefs(this._zod.def, { catchall: unknown() }));
		},
		strict() {
			return this.clone(mergeDefs(this._zod.def, { catchall: never() }));
		},
		strip() {
			return this.clone(mergeDefs(this._zod.def, { catchall: void 0 }));
		},
		extend(incoming) {
			return extend(this, incoming);
		},
		safeExtend(incoming) {
			return safeExtend(this, incoming);
		},
		merge(other) {
			return merge(this, other);
		},
		pick(mask) {
			return pick(this, mask);
		},
		omit(mask) {
			return omit(this, mask);
		},
		partial(...args) {
			return partial(ZodOptional, this, args[0]);
		},
		exactPartial(...args) {
			return partial(ZodExactOptional, this, args[0], "exactPartial");
		},
		required(...args) {
			return required(ZodNonOptional, this, args[0]);
		}
	});
	function object(shape, params) {
		const def = {
			type: "object",
			shape: shape ?? {},
			...normalizeParams(params)
		};
		return new ZodObject(def);
	}
	function looseObject(shape, params) {
		return new ZodObject({
			type: "object",
			shape,
			catchall: unknown(),
			...normalizeParams(params)
		});
	}
	const ZodUnion = /*@__PURE__*/ $constructor("ZodUnion", (inst, def) => {
		$ZodUnion.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => unionProcessor(inst, ctx, json, params);
		inst.options = def.options;
	});
	function union(options, params) {
		return new ZodUnion({
			type: "union",
			options,
			...normalizeParams(params)
		});
	}
	const ZodIntersection = /*@__PURE__*/ $constructor("ZodIntersection", (inst, def) => {
		$ZodIntersection.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => intersectionProcessor(inst, ctx, json, params);
	});
	function intersection(left, right) {
		return new ZodIntersection({
			type: "intersection",
			left,
			right
		});
	}
	const ZodRecord = /*@__PURE__*/ $constructor("ZodRecord", (inst, def) => {
		_ensureDefaultMemoizer();
		$ZodRecord.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => recordProcessor(inst, ctx, json, params);
		inst.keyType = def.keyType;
		inst.valueType = def.valueType;
	});
	function record(keyType, valueType, params) {
		if (!valueType || !valueType._zod) return new ZodRecord({
			type: "record",
			keyType: string(),
			valueType: keyType,
			...normalizeParams(valueType)
		});
		return new ZodRecord({
			type: "record",
			keyType,
			valueType,
			...normalizeParams(params)
		});
	}
	const ZodEnum = /*@__PURE__*/ $constructor("ZodEnum", (inst, def) => {
		$ZodEnum.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => enumProcessor(inst, ctx, json, params);
		inst.enum = def.entries;
		inst.options = [...inst._zod.values];
		const keys = new Set(Object.keys(def.entries));
		inst.extract = (values, params) => {
			const newEntries = {};
			for (const value of values) if (keys.has(value)) newEntries[value] = def.entries[value];
			else throw new Error(`Key ${value} not found in enum`);
			return new ZodEnum({
				...def,
				checks: [],
				...normalizeParams(params),
				entries: newEntries
			});
		};
		inst.exclude = (values, params) => {
			const newEntries = { ...def.entries };
			for (const value of values) if (keys.has(value)) delete newEntries[value];
			else throw new Error(`Key ${value} not found in enum`);
			return new ZodEnum({
				...def,
				checks: [],
				...normalizeParams(params),
				entries: newEntries
			});
		};
	});
	function _enum(values, params) {
		const entries = Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values;
		return new ZodEnum({
			type: "enum",
			entries,
			...normalizeParams(params)
		});
	}
	const ZodTransform = /*@__PURE__*/ $constructor("ZodTransform", (inst, def) => {
		_ensureDefaultMemoizer();
		$ZodTransform.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => transformProcessor(inst, ctx, json, params);
		inst._zod.parse = (payload, _ctx) => {
			if (_ctx.direction === "backward") throw new $ZodEncodeError(inst.constructor.name);
			payload.addIssue = (issue$1) => {
				if (typeof issue$1 === "string") payload.issues.push(issue(issue$1, payload.value, def));
				else {
					const _issue = issue$1;
					if (_issue.fatal) _issue.continue = false;
					_issue.code ?? (_issue.code = "custom");
					if (!("input" in _issue)) _issue.input = payload.value;
					_issue.inst ?? (_issue.inst = inst);
					payload.issues.push(issue(_issue));
				}
			};
			const output = def.transform(payload.value, payload);
			if (output instanceof Promise) return output.then((output) => {
				payload.value = output;
				return payload;
			});
			payload.value = output;
			return payload;
		};
	});
	function transform(fn) {
		return new ZodTransform({
			type: "transform",
			transform: fn
		});
	}
	const ZodOptional = /*@__PURE__*/ $constructor("ZodOptional", (inst, def) => {
		$ZodOptional.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
		inst.unwrap = () => inst._zod.def.innerType;
	});
	function optional(innerType) {
		return new ZodOptional({
			type: "optional",
			innerType
		});
	}
	const ZodExactOptional = /*@__PURE__*/ $constructor("ZodExactOptional", (inst, def) => {
		$ZodExactOptional.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
		inst.unwrap = () => inst._zod.def.innerType;
	});
	function exactOptional(innerType) {
		return new ZodExactOptional({
			type: "optional",
			innerType
		});
	}
	const ZodNullable = /*@__PURE__*/ $constructor("ZodNullable", (inst, def) => {
		$ZodNullable.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => nullableProcessor(inst, ctx, json, params);
		inst.unwrap = () => inst._zod.def.innerType;
	});
	function nullable(innerType) {
		return new ZodNullable({
			type: "nullable",
			innerType
		});
	}
	const ZodDefault = /*@__PURE__*/ $constructor("ZodDefault", (inst, def) => {
		$ZodDefault.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => defaultProcessor(inst, ctx, json, params);
		inst.unwrap = () => inst._zod.def.innerType;
		inst.removeDefault = inst.unwrap;
	});
	function _default(innerType, defaultValue) {
		return new ZodDefault({
			type: "default",
			innerType,
			get defaultValue() {
				return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
			}
		});
	}
	const ZodPrefault = /*@__PURE__*/ $constructor("ZodPrefault", (inst, def) => {
		$ZodPrefault.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => prefaultProcessor(inst, ctx, json, params);
		inst.unwrap = () => inst._zod.def.innerType;
	});
	function prefault(innerType, defaultValue) {
		return new ZodPrefault({
			type: "prefault",
			innerType,
			get defaultValue() {
				return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
			}
		});
	}
	const ZodNonOptional = /*@__PURE__*/ $constructor("ZodNonOptional", (inst, def) => {
		$ZodNonOptional.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => nonoptionalProcessor(inst, ctx, json, params);
		inst.unwrap = () => inst._zod.def.innerType;
	});
	function nonoptional(innerType, params) {
		return new ZodNonOptional({
			type: "nonoptional",
			innerType,
			...normalizeParams(params)
		});
	}
	const ZodCatch = /*@__PURE__*/ $constructor("ZodCatch", (inst, def) => {
		$ZodCatch.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => catchProcessor(inst, ctx, json, params);
		inst.unwrap = () => inst._zod.def.innerType;
		inst.removeCatch = inst.unwrap;
	});
	function _catch(innerType, catchValue) {
		return new ZodCatch({
			type: "catch",
			innerType,
			catchValue: typeof catchValue === "function" ? catchValue : constantCatch(catchValue)
		});
	}
	const ZodPipe = /*@__PURE__*/ $constructor("ZodPipe", (inst, def) => {
		$ZodPipe.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => pipeProcessor(inst, ctx, json, params);
		inst.in = def.in;
		inst.out = def.out;
	});
	function pipe(in_, out) {
		return new ZodPipe({
			type: "pipe",
			in: in_,
			out
		});
	}
	const ZodReadonly = /*@__PURE__*/ $constructor("ZodReadonly", (inst, def) => {
		$ZodReadonly.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => readonlyProcessor(inst, ctx, json, params);
		inst.unwrap = () => inst._zod.def.innerType;
	});
	function readonly(innerType) {
		return new ZodReadonly({
			type: "readonly",
			innerType
		});
	}
	const ZodCustom = /*@__PURE__*/ $constructor("ZodCustom", (inst, def) => {
		$ZodCustom.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => customProcessor(inst, ctx, json, params);
	});
	function refine(fn, _params = {}) {
		return _refine(ZodCustom, fn, _params);
	}
	function superRefine(fn, params) {
		return _superRefine(fn, params);
	}

//#endregion
//#region src/shared/application/commands.ts
/** Transport command, not a database row. Feature adapters own its extra fields. */
	const commandSchema = looseObject({
		action: string().min(1),
		branch: string().min(1),
		id: string().optional(),
		kind: string().optional()
	});

//#endregion
//#region src/shared/presentation/forms.ts
	function commandFromForm(form, branch, kind) {
		const fields = Object.fromEntries(new FormData(form));
		return commandSchema.parse({
			...fields,
			action: form.dataset.action,
			branch: form.dataset.branch || branch,
			id: form.dataset.id,
			kind: fields["kind"] || kind
		});
	}
	function requestId(form) {
		return form.dataset.requestId ||= crypto.randomUUID();
	}

//#endregion
//#region src/modules/cash/forms.ts
	function prepareCash({ form, command }, confirm) {
		if (["cash_movement", "cash_open"].includes(command.action)) command.requestId = requestId(form);
		if (command.action === "close" && !confirm("¿Cerrar tu caja del día? Las ventas quedarán bloqueadas hasta una nueva apertura.")) return null;
		return command;
	}

//#endregion
//#region src/modules/catalog/forms.ts
	async function prepareCatalog({ command }, ports) {
		if (command.action === "movie_save") {
			ports.notify("Comprobando imagen…");
			const poster = command["poster"];
			if (typeof poster !== "string") throw new Error("Introduce una imagen válida.");
			await ports.verifyPoster(poster);
		}
		return command;
	}

//#endregion
//#region src/modules/inventory/forms.ts
	function prepareInventory({ form, command, submitter }, confirm) {
		if (command.action !== "audit_save") return command;
		command.counts = Object.fromEntries(Array.from(form.querySelectorAll(".count"), (input) => [input.name, input.value]));
		if (submitter?.getAttribute("name") === "finish") {
			if (!confirm("¿Confirmar el conteo, reemplazar las existencias oficiales y desbloquear la operación?")) return null;
			command.action = "audit_finish";
		}
		return command;
	}

//#endregion
//#region src/modules/payroll/biometric-reader.ts
	async function encodeBiometric(file) {
		if (!file || file.size > 2e6) throw new Error("Selecciona un archivo de hasta 2 MB.");
		const bytes = new Uint8Array(await file.arrayBuffer());
		let text = "";
		for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
		return {
			file: btoa(text),
			filename: file.name
		};
	}

//#endregion
//#region src/modules/payroll/forms.ts
	async function preparePayroll({ form, command }, confirm) {
		if (command.action === "payroll_extra") {
			command.employees = new FormData(form).getAll("employees");
			command.requestId = requestId(form);
		}
		if (command.action === "payroll_delete" && !confirm("¿Borrar este registro? Dejará de aparecer en las listas. Los registros con historial asociado se conservan.")) return null;
		if (command.action === "payroll_validate" && !confirm("¿Validar esta planilla y preparar el envío individual a los empleados? Los importes quedarán bloqueados.")) return null;
		if (command.action === "payroll_import") {
			const input = form.querySelector("[name=\"biometric\"]");
			Object.assign(command, await encodeBiometric(input?.files?.[0]));
			delete command.biometric;
			command.requestId = requestId(form);
		}
		return command;
	}

//#endregion
//#region src/app/prepare-command.ts
/** Composition dispatches to feature-owned form adapters; it contains no feature rules. */
	async function prepareCommand(form, submitter, branch, kind, ports) {
		const command = commandFromForm(form, branch, kind);
		const input = {
			form,
			submitter,
			command
		};
		if (command.action.startsWith("payroll_")) return preparePayroll(input, ports.confirm);
		if (command.action.startsWith("cash_") || command.action === "close" || command.action === "close_review") return prepareCash(input, ports.confirm);
		if ([
			"movie_save",
			"trailer_save",
			"room_save",
			"schedule"
		].includes(command.action)) return prepareCatalog(input, ports);
		return prepareInventory(input, ports.confirm);
	}

//#endregion
//#region src/shared/contracts.ts
	const roleSchema = _enum([
		"manager",
		"accounting",
		"administrator",
		"ticketing",
		"candy"
	]);
	const userSchema = object({
		id: string(),
		role: roleSchema,
		branch: string().nullable()
	});
	const rowSchema = looseObject({
		id: string().optional(),
		branch: string().optional()
	});
	const stateSchema = looseObject({
		products: array(rowSchema),
		shows: array(rowSchema),
		sales: array(rowSchema),
		reports: array(rowSchema),
		audits: array(rowSchema),
		closures: array(rowSchema),
		log: array(rowSchema),
		users: array(userSchema),
		availability: record(string(), number())
	});
	const sessionSchema = object({
		user: userSchema,
		branches: array(string()),
		today: string(),
		serverTime: string(),
		state: stateSchema
	});
	function errorMessage(value) {
		const result = object({ error: string() }).safeParse(value);
		return result.success ? result.data.error : "No se pudo completar la solicitud.";
	}

//#endregion
//#region src/modules/identity/application.ts
/** Owns session generations and polling order, independently of DOM rendering. */
	var SessionClient = class {
		transport;
		onExpired;
		generation = 0;
		stateRequest = 0;
		etag = "";
		constructor(transport, onExpired) {
			this.transport = transport;
			this.onExpired = onExpired;
		}
		invalidate() {
			this.etag = "";
		}
		get stateETag() {
			return this.etag;
		}
		async request(path, data) {
			if (path === "login" || path === "logout") {
				this.generation++;
				this.invalidate();
			}
			const generation = this.generation;
			const request = path === "state" ? ++this.stateRequest : 0;
			const stale = () => path === "state" && (generation !== this.generation || request !== this.stateRequest);
			const headers = data ? { "Content-Type": "application/json" } : {};
			if (path === "state" && this.etag) headers["If-None-Match"] = this.etag;
			const response = await this.transport("/api/" + path, {
				method: data ? "POST" : "GET",
				headers,
				body: data ? JSON.stringify(data) : void 0
			});
			if (stale() || path === "state" && response.status === 304) return null;
			const body = await response.json();
			if (stale()) return null;
			if (!response.ok) {
				if (response.status === 401 && path !== "login") {
					this.generation++;
					this.invalidate();
					this.onExpired();
				}
				throw new Error(errorMessage(body));
			}
			if (path === "state") {
				const result = sessionSchema.safeParse(body);
				if (!result.success) throw new Error("El servidor devolvió datos de sesión inválidos.");
				this.etag = response.headers.get("ETag") || "";
				return result.data;
			}
			return body;
		}
	};

//#endregion
//#region src/modules/catalog/presentation.js
/** UI dependencies: $, badge, branch, deleteButton, empty, esc, field, list, model, money, scheduleWeek, table, uiDialogButton. Injected by app composition. */
	function createCatalogViews(ctx) {
		function shows() {
			const rooms = ctx.list("rooms"), movies = ctx.list("movies");
			ctx.scheduleWeek ||= ctx.model.today;
			const first = /* @__PURE__ */ new Date(ctx.scheduleWeek + "T12:00");
			const dates = Array.from({ length: 7 }, (_, i) => {
				const d = new Date(first);
				d.setDate(d.getDate() + i);
				return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
			});
			const active = ctx.list("shows").filter((s) => !s.cancelled && dates.includes(s.date));
			const roomForm = (r) => `<form data-action="room_save" ${r ? `data-id="${r.id}" data-branch="${r.branch}"` : ""} class="form-grid">${ctx.field("Nombre de sala", "name", "text", r?.name || "")}${ctx.field("Capacidad de butacas", "capacity", "number", r?.capacity || 40, "min=\"1\" max=\"2000\" step=\"1\"")}<label>Estado<select name="active"><option value="yes">Activa</option><option value="no" ${r?.active === false ? "selected" : ""}>Inactiva</option></select></label><button class="primary">Guardar sala</button></form>`;
			const scheduleForm = `<p class="muted">Repite los horarios durante uno o siete días. Se reservan 15 minutos de limpieza entre funciones.</p><form data-action="schedule" class="form-grid"><fieldset class="form-step"><legend><span>1</span> Película y sala</legend><label>Película<select name="movieId" required>${movies.map((m) => `<option value="${m.id}">${ctx.esc(m.title)} · ${m.duration} min</option>`).join("")}</select></label><label>Sala<select name="roomId" required>${rooms.filter((r) => r.active).map((r) => `<option value="${r.id}">${ctx.esc(r.name)} · ${r.capacity} butacas</option>`).join("")}</select></label></fieldset><fieldset class="form-step"><legend><span>2</span> Fechas y horarios</legend>${ctx.field("Fecha inicial", "date", "date", ctx.model.today, `min="${ctx.model.today}"`)}<label>Período<select name="days"><option value="7">7 días consecutivos</option><option value="1">Un solo día</option></select></label>${ctx.field("Horarios separados por comas", "times", "text", "14:00, 17:00, 20:00")}<button type="button" id="nextThursday">Usar jueves a miércoles</button></fieldset><fieldset class="form-step"><legend><span>3</span> Precio y revisión</legend>${ctx.field("Precio por boleto · BOB", "price", "number", 36, "min=\"0.01\" step=\"0.01\"")}<label>Formato<select name="format"><option>2D</option><option>3D</option></select></label><label>Miércoles 2×1<select name="wednesdayPromo"><option value="no">Sin promoción</option><option value="yes">Dos butacas por boleto · mismo precio</option></select></label><p class="muted small">Con 2×1, 246 butacas equivalen a 123 boletos al precio indicado.</p><div id="schedulePreview" class="schedule-preview"></div></fieldset><div class="form-actions"><button type="button" data-cash-dismiss="yes">Volver</button><button class="primary" ${!movies.length || !rooms.some((r) => r.active) ? "disabled" : ""}>Crear programación →</button></div></form>`;
			return `<section class="panel schedule-panel"><div class="panel-head"><div><p class="eyebrow">TU CARTELERA SEMANAL</p><h2>Una semana de cine</h2><small>${active.length} funciones · ${rooms.length} salas en ${ctx.esc(ctx.branch)}</small></div>${ctx.uiDialogButton("scheduleEditor", "Programar funciones", scheduleForm, "＋ Programar funciones", true)}</div>${!movies.length || !rooms.some((r) => r.active) ? "<div class=\"banner warning\">Añade una película y una sala activa para empezar a programar. <button data-page=\"trailers\">Crear película →</button></div>" : ""}<div class="schedule-toolbar"><div class="button-group"><button data-week="-1" aria-label="Semana anterior">←</button><button data-week="today">Hoy</button><button data-week="1" aria-label="Semana siguiente">→</button></div><strong>${first.toLocaleDateString("es-BO", {
				day: "numeric",
				month: "short"
			})} — ${(/* @__PURE__ */ new Date(dates[6] + "T12:00")).toLocaleDateString("es-BO", {
				day: "numeric",
				month: "short",
				year: "numeric"
			})}</strong></div><div class="calendar-scroll" tabindex="0" role="region" aria-label="Programación semanal; desplaza para ver todos los días"><table class="schedule-calendar"><thead><tr><th>Sala</th>${dates.map((d) => `<th class="${d === ctx.model.today ? "today" : ""}">${(/* @__PURE__ */ new Date(d + "T12:00")).toLocaleDateString("es-BO", {
				weekday: "short",
				day: "numeric"
			})}</th>`).join("")}</tr></thead><tbody>${rooms.map((room) => `<tr><th>${ctx.esc(room.name)}<small>${room.capacity} butacas</small></th>${dates.map((day) => `<td>${active.filter((show) => (show.roomId === room.id || show.room === room.name) && show.date === day).sort((a, b) => a.time.localeCompare(b.time)).map((show) => `<div class="calendar-show"><strong>${show.time}</strong><span>${ctx.esc(show.title)}</span><small>${show.format} · ${ctx.model.state.availability[show.id]} boletos</small></div>`).join("") || "<span class=\"calendar-free\">—</span>"}</td>`).join("")}</tr>`).join("") || "<tr><td colspan=\"8\">Crea tu primera sala para ver la programación.</td></tr>"}</tbody></table></div><p class="muted small calendar-hint">Desliza la semana horizontalmente para ver todos los días.</p></section><details class="panel secondary-panel"><summary><span>Salas y capacidades<small>Configura el aforo sin mapa de butacas</small></span><span>${rooms.length} salas · Administrar</span></summary><div class="room-cards">${rooms.map((r) => `<article><h3>${ctx.esc(r.name)}</h3><p>${r.capacity} butacas · ${r.active ? "Activa" : "Inactiva"}</p>${ctx.uiDialogButton("room-" + r.id, "Editar " + r.name, roomForm(r), "Editar sala")}${ctx.deleteButton("room", r)}</article>`).join("")}</div>${ctx.uiDialogButton("newRoom", "Crear sala", roomForm(null), "＋ Nueva sala", true)}</details><section class="panel"><div class="panel-head"><h2>Detalle de funciones</h2><label class="search-field">Buscar película o fecha<input data-filter-table="showRecords" type="search" placeholder="Película, sala, fecha…"></label></div><div id="showRecords">${ctx.table([
				"Película",
				"Sala / horario",
				"Precio",
				"Disponibles",
				"Acciones"
			], ctx.list("shows").slice().sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).map((show) => `<tr><td><strong>${ctx.esc(show.title)}</strong><small>${show.format}</small></td><td>${ctx.esc(show.room)}<small>${show.date} · ${show.time}</small></td><td>${ctx.money(show.price)}${show.wednesdayPromo && (/* @__PURE__ */ new Date(show.date + "T12:00")).getDay() === 3 ? "<small>Miércoles 2×1</small>" : ""}</td><td>${ctx.model.state.availability[show.id]} / ${show.ticketCapacity}<small>${show.capacity} butacas</small></td><td>${show.cancelled ? ctx.badge("Cancelada") : show.date >= ctx.model.today ? `<form data-action="show_cancel" data-id="${show.id}" data-branch="${show.branch}" class="row-action"><button ${ctx.model.state.availability[show.id] < show.ticketCapacity ? "disabled" : ""}>Cancelar</button></form>` : ctx.badge("Finalizada")}${ctx.deleteButton("show", show)}</td></tr>`))}</div></section>`;
		}
		function schedulePreview() {
			const f = document.querySelector("[data-action=\"schedule\"]");
			if (!f) return;
			const d = new FormData(f), start = /* @__PURE__ */ new Date(d.get("date") + "T12:00");
			if (isNaN(start)) return;
			const n = Number(d.get("days")), times = String(d.get("times")).split(",").filter((t) => t.trim());
			ctx.$("#schedulePreview").innerHTML = `<strong>${n * times.length} funciones · vista previa</strong><div class="week-preview">${Array.from({ length: n }, (_, i) => {
				const date = new Date(start);
				date.setDate(date.getDate() + i);
				const promo = date.getDay() === 3 && d.get("wednesdayPromo") === "yes";
				return `<span>${date.toLocaleDateString("es-BO", {
					weekday: "short",
					day: "numeric",
					month: "short"
				})}<b>${ctx.money(Number(d.get("price")))}</b>${promo ? "2×1 · " + Math.floor((ctx.list("rooms").find((r) => r.id === d.get("roomId"))?.capacity || 0) / 2) + " boletos" : ""}</span>`;
			}).join("")}</div>`;
		}
		async function verifyPoster(url) {
			if (!url) return;
			if (new URL(url).protocol !== "https:") throw Error("La imagen debe usar HTTPS.");
			await new Promise((resolve, reject) => {
				const img = new Image(), timer = setTimeout(() => {
					img.src = "";
					reject(Error("La imagen tardó demasiado en cargar. Comprueba el enlace."));
				}, 12e3);
				img.onload = () => {
					clearTimeout(timer);
					resolve();
				};
				img.onerror = () => {
					clearTimeout(timer);
					reject(Error("Este enlace no carga una imagen. Abre el póster y usa «Copiar dirección de imagen», no el enlace de la página."));
				};
				img.src = url;
			});
		}
		function moviesEditor() {
			const movies = ctx.list("movies").sort((a, b) => a.position - b.position);
			const form = (m) => `<form data-action="movie_save" ${m ? `data-id="${m.id}" data-branch="${m.branch}"` : ""} class="form-grid">${ctx.field("Película", "title", "text", m?.title || "", "maxlength=\"80\"")}<label>Enlace directo de la imagen (HTTPS)<input type="url" name="poster" value="${ctx.esc(m?.poster || "")}" placeholder="https://sitio.com/poster.jpg"><small>Usa «Copiar dirección de imagen».</small></label>${ctx.field("Duración · minutos", "duration", "number", m?.duration || 120, "min=\"1\" max=\"400\"")}${ctx.field("Género", "genre", "text", m?.genre || "Cine")}${ctx.field("Clasificación", "rating", "text", m?.rating || "ATP")}${ctx.field("Posición en el carrusel", "position", "number", m?.position || movies.length + 1, "min=\"1\" max=\"999\"")}<label>Visibilidad<select name="published"><option value="yes">Publicado</option><option value="no" ${m?.published === false ? "selected" : ""}>Oculto</option></select></label><button class="primary">${m ? "Guardar cambios" : "Crear película y banner"}</button></form>`;
			return `<section class="panel"><div class="panel-head"><div><p class="eyebrow">CARTELERA PÚBLICA</p><h2>Películas y banners</h2></div>${ctx.uiDialogButton("newMovie", "Nueva película y banner", form(null), "＋ Añadir película", true)}</div><p class="muted">Cada banner muestra los horarios de su película. El número indica su lugar en el carrusel.</p><div class="media-cards">${movies.map((m) => `<article class="media-card"><div class="media-art">${m.poster ? `<img src="${ctx.esc(m.poster)}" alt="Póster de ${ctx.esc(m.title)}" loading="lazy">` : "<span>Sin imagen</span>"}<span class="media-position">${m.position}</span></div><div class="media-body">${ctx.badge(m.published ? "Publicado" : "Oculto")}<h3>${ctx.esc(m.title)}</h3><p>${ctx.esc(m.genre)} · ${m.duration} min · ${ctx.esc(m.rating)}</p><small>${ctx.model.state.shows.filter((show) => show.movieId === m.id && !show.cancelled && show.date >= ctx.model.today).length} funciones vigentes enlazadas</small><div class="media-actions">${ctx.uiDialogButton("movie-" + m.id, "Editar " + m.title, form(m), "Editar banner")}${ctx.deleteButton("movie", m)}</div></div></article>`).join("") || ctx.empty("Añade tu primera película")}</div></section>`;
		}
		function trailers() {
			const rows = (ctx.model.state.trailers || []).filter((t) => t.branch === ctx.branch).sort((a, b) => a.position - b.position);
			const trailerForm = (t) => `<form data-action="trailer_save" ${t ? `data-id="${t.id}" data-branch="${t.branch}"` : ""} class="form-grid">${ctx.field("Película", "title", "text", t?.title || "", "maxlength=\"80\"")}${ctx.field("Enlace de YouTube", "url", "url", t?.url || "", "placeholder=\"https://www.youtube.com/watch?v=…\"")}${ctx.field("Posición de reproducción", "position", "number", t?.position || rows.length + 1, "min=\"1\" step=\"1\"")}<label>Visibilidad<select name="published"><option value="yes" ${t?.published === false ? "" : "selected"}>Publicado</option><option value="no" ${t?.published === false ? "selected" : ""}>Oculto / borrador</option></select></label><button class="primary">${t ? "Guardar cambios" : "Añadir tráiler"}</button></form>`;
			return `<div class="section-toolbar"><span class="muted">Contenido de ${ctx.esc(ctx.branch)}</span><a class="button" href="index.html?branch=${encodeURIComponent(ctx.branch)}#cartelera" target="_blank" rel="noopener">Ver página pública ↗</a></div>` + moviesEditor() + `<section class="panel"><div class="panel-head"><div><p class="eyebrow">PRÓXIMAS HISTORIAS</p><h2>Tráileres de la portada</h2></div>${ctx.uiDialogButton("newTrailer", "Añadir tráiler", trailerForm(null), "＋ Añadir tráiler", true)}</div><p class="muted">Se reproducen en bucle, según su posición. Los cambios aparecen en la web en hasta 30 segundos.</p><div class="trailer-cards">${rows.map((t) => `<article class="trailer-card">${t.videoId ? `<img class="trailer-thumb" src="https://i.ytimg.com/vi/${ctx.esc(t.videoId)}/mqdefault.jpg" alt="Tráiler de ${ctx.esc(t.title)}" loading="lazy">` : ""}<span class="trailer-number">${String(t.position).padStart(2, "0")}</span><div><h3>${ctx.esc(t.title)}</h3>${ctx.badge(t.published ? "Publicado" : "Oculto")}<a class="trailer-source" href="${ctx.esc(t.url)}" target="_blank" rel="noopener noreferrer">Ver en YouTube ↗</a></div><div class="media-actions">${ctx.uiDialogButton("trailer-" + t.id, "Editar " + t.title, trailerForm(t), "Editar")}${ctx.deleteButton("trailer", t)}</div></article>`).join("") || ctx.empty("Añade el primer tráiler de esta sucursal", "Usa Añadir tráiler para enlazar un video de YouTube y publicarlo en la portada.")}</div><small>El video debe permitir reproducción en sitios externos.</small></section>`;
		}
		return {
			shows,
			schedulePreview,
			verifyPoster,
			trailers
		};
	}

//#endregion
//#region src/modules/inventory/presentation.js
/** UI dependencies: $, badge, branchHint, empty, esc, field, inventoryQuery, inventoryStock, kind, kinds, list, model, money, productOptions, selectedAudit, specific, table, uiDialogButton. Injected by app composition. */
	function createInventoryViews(ctx) {
		function filterInventory() {
			const q = ctx.inventoryQuery.toLocaleLowerCase("es");
			let visible = 0;
			document.querySelectorAll("[data-inventory-row]").forEach((row) => {
				row.hidden = !row.dataset.search.includes(q) || ctx.inventoryStock === "low" && Number(row.dataset.stock) > 0;
				if (!row.hidden) visible++;
			});
			if (ctx.$("#inventoryMatch")) ctx.$("#inventoryMatch").textContent = `${visible} productos en la lista`;
			if (ctx.$("#inventoryNoMatch")) ctx.$("#inventoryNoMatch").hidden = visible > 0;
		}
		function auditFilter() {
			const pending = ctx.$("#auditPending")?.checked;
			document.querySelectorAll(".count").forEach((input) => input.closest("tr").hidden = !!pending && input.value !== "");
		}
		function inventory() {
			if (!candyAuditVisible()) return "<div class=\"banner\">El inventario solo está disponible durante un arqueo activo.</div>";
			if (ctx.model.user.role === "administrator") ctx.kind = "vault";
			if (ctx.model.user.role === "candy") ctx.kind = "candy";
			const products = ctx.list("products").filter((p) => p.kind === ctx.kind), locked = ctx.list("audits").some((a) => a.kind === ctx.kind && a.status === "En curso");
			const options = ["manager", "accounting"].includes(ctx.model.user.role) ? `<div class="tabs"><button data-kind="candy" class="${ctx.kind === "candy" ? "active" : ""}">Candy bar</button><button data-kind="vault" class="${ctx.kind === "vault" ? "active" : ""}">Bóveda de Administración</button></div>` : "";
			let actions = "";
			if (ctx.model.user.role === "accounting" && ctx.specific()) {
				actions = ctx.uiDialogButton("newProduct", "Registrar producto", `<p class="muted">El código se asigna automáticamente. Después de crear el producto registra su entrada.</p><form data-action="product" class="form-grid">${ctx.field("Producto", "name")}${ctx.field("Unidad", "unit", "text", "Unidad")}${ctx.field(ctx.kind === "candy" ? "Precio de venta · BOB" : "Costo unitario · BOB", "price", "number", "", "min=\"0.01\" step=\"0.01\"")}<button class="primary" ${locked ? "disabled" : ""}>Crear producto</button></form>`, "＋ Nuevo producto", true);
				if (ctx.kind === "candy") actions += ctx.uiDialogButton("newStock", "Registrar entrada o salida", movementForm("stock", locked), "Registrar movimiento");
			}
			if (ctx.model.user.role === "administrator") actions += ctx.uiDialogButton("newVaultReport", "Reportar entrada o salida", `<p class="muted">Contabilidad validará el movimiento antes de actualizar las existencias.</p>${movementForm("report", locked)}`, "＋ Reportar movimiento", true);
			return options + `${locked ? "<div class=\"banner warning\">Arqueo en curso · Las existencias se actualizarán al validar el conteo.</div>" : ""}<section class="panel"><div class="panel-head"><div><p class="eyebrow">EXISTENCIAS OFICIALES</p><h2>${ctx.kinds[ctx.kind]}</h2></div><div class="inline-actions">${actions}</div></div><div class="list-filters"><label>Buscar producto<input id="inventorySearch" type="search" placeholder="Nombre o código…" value="${ctx.esc(ctx.inventoryQuery)}"></label><label>Existencias<select id="inventoryStock"><option value="all">Todos los productos</option><option value="low" ${ctx.inventoryStock === "low" ? "selected" : ""}>En cero o negativas</option></select></label><small id="inventoryMatch">${products.length} productos en la lista</small></div>${ctx.table([
				"Producto",
				"Existencia",
				"Unidad",
				ctx.kind === "candy" ? "Precio de venta" : "Costo unitario"
			], products.map((product) => `<tr data-inventory-row data-search="${ctx.esc((product.name + " " + product.code).toLocaleLowerCase("es"))}" data-stock="${product.stock}"><td><strong>${ctx.esc(product.name)}</strong><small>${ctx.esc(product.code)}</small></td><td class="${product.stock <= 0 ? "negative" : "stock-number"}">${product.stock}</td><td>${ctx.esc(product.unit)}</td><td>${ctx.money(product.price)}</td></tr>`))}<p id="inventoryNoMatch" class="empty" hidden>No hay productos con esos filtros.</p></section>${ctx.kind === "vault" && ctx.model.user.role === "accounting" ? "<div class=\"banner\">Las entradas y salidas de bóveda se aprueban desde <button data-page=\"reports\">Reportes de movimientos →</button></div>" : ""}`;
		}
		function movementForm(action, locked = false) {
			return `<form data-action="${action}" class="form-grid"><label>Producto<select name="item" required>${ctx.productOptions()}</select></label><label>Movimiento<select name="direction"><option value="in">Entrada</option><option value="out">Salida</option></select></label>${ctx.field("Cantidad", "quantity", "number", 1, "min=\"1\"")}${ctx.field("Motivo / respaldo", "reason")}<button class="primary" ${locked ? "disabled" : ""}>${action === "report" ? "Enviar a validación" : "Registrar movimiento"} →</button></form>`;
		}
		function reports() {
			let form = "";
			if (ctx.model.user.role === "administrator") {
				ctx.kind = "vault";
				form = `<section class="panel"><div class="panel-head"><div><h2>Reportar movimientos</h2><small>Contabilidad valida cada entrada o salida antes de actualizar las existencias.</small></div>${ctx.uiDialogButton("reportMovement", "Reportar entrada o salida", movementForm("report", ctx.list("audits").some((a) => a.kind === "vault" && a.status === "En curso")), "＋ Nuevo reporte", true)}</div></section>`;
			}
			return ctx.candyRequests() + form + `<section class="panel"><div class="panel-head"><h2>Movimientos y validaciones</h2><label class="search-field">Buscar reporte<input type="search" data-filter-table="movementRecords" placeholder="Producto, estado o usuario…"></label></div><div id="movementRecords">${ctx.table([
				"Fecha / usuario",
				"Producto",
				"Sucursal",
				"Unidades",
				"Motivo",
				"Estado / revisión"
			], ctx.list("reports").slice().reverse().map((r) => `<tr><td>${r.at.slice(0, 16).replace("T", " ")}<small>${r.user}</small></td><td>${ctx.esc(r.name)}</td><td>${r.branch}</td><td class="${r.delta < 0 ? "negative" : "amount"}">${r.delta > 0 ? "+" : ""}${r.delta}</td><td>${ctx.esc(r.reason)}${r.note ? `<small>Revisión: ${ctx.esc(r.note)}</small>` : ""}</td><td>${ctx.badge(r.status)}${ctx.model.user.role === "accounting" && ["Pendiente", "Observado"].includes(r.status) ? `<form data-action="review" data-id="${r.id}" data-branch="${r.branch}" class="compact"><select name="status"><option>Aprobado</option><option>Observado</option><option>Rechazado</option></select><input name="note" placeholder="Motivo de revisión" required><button>Guardar revisión</button></form>` : ""}</td></tr>`))}</div></section>`;
		}
		function audits() {
			const items = ctx.list("audits"), audit = items.find((a) => a.id === ctx.selectedAudit) || items.find((a) => a.status === "En curso") || items.at(-1);
			ctx.selectedAudit = audit?.id || "";
			const can = ctx.model.user.role === "accounting";
			let body = "<div class=\"banner\">Candy se valora al precio de venta; bóveda, al costo unitario. Se incluyen existencias cero y negativas.</div>";
			if (can) body += `<section class="panel"><h2>Iniciar conteo y bloquear operación</h2>${ctx.specific() ? `<form data-action="audit_start" class="inline-form"><label>Inventario<select name="kind"><option value="candy">Candy bar · bloquear ventas</option><option value="vault">Bóveda · bloquear movimientos</option></select></label><button class="primary">Iniciar arqueo + PDF →</button></form><p class="muted small">Resuelve los reportes pendientes antes de iniciar. El PDF también estará disponible para descargar nuevamente.</p>` : ctx.branchHint()}</section>`;
			body += `<section class="panel"><div class="panel-head"><h2>Arqueos y conteos</h2><select id="auditSelect" aria-label="Seleccionar arqueo"><option value="">Seleccionar arqueo</option>${items.slice().reverse().map((a) => `<option value="${a.id}" ${a.id === ctx.selectedAudit ? "selected" : ""}>${a.branch} / ${ctx.kinds[a.kind]} / ${a.at.slice(0, 16)} / ${a.status}</option>`).join("")}</select></div>`;
			if (!audit) return body + ctx.empty("Sin arqueos registrados") + "</section>";
			const editable = can && audit.status === "En curso";
			body += `<div class="panel-head"><div>${ctx.badge(audit.status)} <span class="muted">N.º ${audit.id} · ${audit.branch} · ${ctx.kinds[audit.kind]}</span></div><a class="button" href="/api/pdf/${audit.id}">↓ Hoja de conteo PDF</a></div><div class="audit-progress"><div><strong id="auditProgressText">Preparando conteo</strong><progress id="auditProgress" value="0" max="1" aria-label="Avance del conteo"></progress></div><label class="check-label"><input type="checkbox" id="auditPending"> Solo pendientes</label></div><form data-action="audit_save" data-id="${audit.id}" data-branch="${audit.branch}">${ctx.table([
				"Producto",
				"Sistema",
				"Valor unitario",
				"Conteo físico",
				"Diferencia",
				"Sobrante / faltante BOB"
			], audit.rows.map((r) => `<tr><td><strong>${ctx.esc(r.name)}</strong><small>${ctx.esc(r.unit)}</small></td><td>${r.system}</td><td>${ctx.money(r.price)}</td><td><input class="count" name="${r.item}" data-system="${r.system}" data-price="${r.price}" type="number" min="0" step="1" value="${r.physical ?? ""}" ${editable ? "" : "disabled"} aria-label="Conteo físico de ${ctx.esc(r.name)}"></td><td class="difference"></td><td class="valuation"></td></tr>`))}<div id="auditTotals" class="audit-totals"></div>${editable ? "<div class=\"actions\"><button>Guardar avance</button><button class=\"primary\" name=\"finish\" value=\"yes\">Verificar y finalizar arqueo →</button></div><p class=\"muted small\">Finalizar reemplaza las existencias oficiales por el conteo físico y desbloquea la operación. Esta acción queda en el historial.</p>" : ""}</form></section>`;
			return body;
		}
		function candyAuditVisible() {
			return ctx.model?.user.role !== "candy" || ctx.list("audits").some((a) => a.kind === "candy" && a.status === "En curso");
		}
		function calculate() {
			let plus = 0, minus = 0, pending = 0;
			document.querySelectorAll(".count").forEach((input) => {
				const filled = input.value !== "";
				const d = filled ? Number(input.value) - Number(input.dataset.system) : 0, v = d * Number(input.dataset.price), row = input.closest("tr");
				row.querySelector(".difference").textContent = filled ? (d > 0 ? "+" : "") + d : "Pendiente";
				row.querySelector(".valuation").textContent = filled ? ctx.money(v) : "—";
				row.querySelector(".valuation").className = "valuation " + (v < 0 ? "negative" : "amount");
				if (!filled) pending++;
				plus += Math.max(0, v);
				minus += Math.max(0, -v);
			});
			const counts = document.querySelectorAll(".count");
			if (ctx.$("#auditProgress")) {
				ctx.$("#auditProgress").max = counts.length || 1;
				ctx.$("#auditProgress").value = counts.length - pending;
				ctx.$("#auditProgressText").textContent = `${counts.length - pending} de ${counts.length} productos contados`;
			}
			if (ctx.$("#auditTotals")) ctx.$("#auditTotals").innerHTML = `<span>Sobrantes <strong>${ctx.money(plus)}</strong></span><span>Faltantes <strong class="negative">${ctx.money(minus)}</strong></span><span>Pendientes <strong>${pending}</strong></span>`;
		}
		return {
			inventory,
			reports,
			audits,
			calculate,
			filterInventory,
			auditFilter,
			candyAuditVisible
		};
	}

//#endregion
//#region src/modules/cash/presentation.js
/** UI dependencies: $, badge, branch, esc, field, list, model, money, roles, table. Injected by app composition. */
	function createCashViews(ctx) {
		function currentCash() {
			return (ctx.model.state.cashOpenings || []).slice().reverse().find((o) => o.user === ctx.model.user.id && !o.closed);
		}
		function cashClosed() {
			return !currentCash() && ctx.list("closures").some((c) => c.user === ctx.model.user.id);
		}
		function openingPanel() {
			return cashClosed() ? "<div class=\"banner\">Caja cerrada. <button type=\"button\" data-open-cash=\"yes\">Abrir nueva caja</button></div>" : "";
		}
		function showOpeningDialog() {
			if (!cashClosed() || ctx.$("#openingDialog")) return;
			const d = document.createElement("dialog");
			d.id = "openingDialog";
			d.className = "cash-dialog";
			d.innerHTML = `<p class="eyebrow">COMIENZA TU JORNADA</p><h2>Apertura de caja</h2><p class="muted">Registra la apertura para habilitar las ventas. El fondo inicial es opcional.</p><form data-action="cash_open"><label>Fondo inicial · BOB (opcional)<input name="amount" type="number" min="0" max="100000" step="0.01" placeholder="0,00"></label><div class="actions"><button type="button" data-cash-dismiss="yes">Más tarde</button><button class="primary">Abrir caja →</button></div></form>`;
			ctx.$("#root").append(d);
			d.showModal();
			d.addEventListener("close", () => d.remove());
		}
		function openCashDialog(direction, id = "", scope = ctx.branch) {
			ctx.$("#cashDialog")?.remove();
			const cancel = direction === "void", title = cancel ? "Anular movimiento" : direction === "in" ? "Registrar ingreso" : "Registrar egreso";
			const dialog = document.createElement("dialog");
			dialog.id = "cashDialog";
			dialog.className = "cash-dialog";
			dialog.innerHTML = `<div class="panel-head"><div><p class="eyebrow">CONTROL DE EFECTIVO</p><h2>${title}</h2></div><button type="button" data-cash-dismiss="yes" aria-label="Cerrar ventana">✕</button></div><p class="muted small">${cancel ? "El registro se conservará como anulado y dejará de afectar el saldo. Si tiene cierre, quedará pendiente de nueva revisión." : "Completa los datos para registrar el movimiento en tu caja."}</p><form data-action="${cancel ? "cash_void" : "cash_movement"}" data-id="${ctx.esc(id)}" data-branch="${ctx.esc(scope)}"><input type="hidden" name="direction" value="${direction}">${cancel ? "" : ctx.field("Importe BOB", "amount", "number", "", "min=\"0.01\" max=\"100000\" step=\"0.01\"")}${ctx.field(cancel ? "Motivo de anulación" : "Motivo", "reason", "text", "", "maxlength=\"300\"")}${cancel ? "" : "<label>Referencia (opcional)<input name=\"reference\" maxlength=\"100\"></label>"}<div class="actions"><button type="button" data-cash-dismiss="yes">Cancelar</button><button class="primary">${cancel ? "Confirmar anulación" : "Guardar movimiento"}</button></div></form>`;
			ctx.$("#root").append(dialog);
			dialog.showModal();
			dialog.addEventListener("close", () => dialog.remove());
		}
		function cashLedger() {
			if (![
				"accounting",
				"manager",
				"administrator"
			].includes(ctx.model.user.role)) return "";
			const moves = (ctx.model.state.cashMovements || []).filter((m) => ctx.branch === "Todas" || m.branch === ctx.branch).slice().reverse();
			return `<section class="panel"><h2>Ingresos y egresos de caja</h2><p class="muted small">Movimientos de Boletería y Candy bar. Los anulados se conservan para consulta y no afectan el saldo.</p>${ctx.table([
				"Fecha / sucursal",
				"Cajero / área",
				"Movimiento",
				"Importe",
				"Estado"
			], moves.map((m) => `<tr><td>${ctx.esc(m.day)}<small>${ctx.esc(m.branch)} · ${ctx.esc(m.at.slice(11, 19))}</small></td><td>${ctx.esc(m.user)}<small>${ctx.esc(ctx.roles[m.area])}</small></td><td><strong>${m.direction === "in" ? "Ingreso" : "Egreso"}</strong><small>${ctx.esc(m.reason)}</small><small>Referencia: ${ctx.esc(m.reference) || "—"}</small></td><td>${ctx.money(m.total)}</td><td>${ctx.badge(m.voided ? "Anulado" : "Vigente")}${m.voided ? `<small>${ctx.esc(m.voidReason)}<br>${ctx.esc(m.voidBy)} · ${ctx.esc(m.voidAt)}</small>` : ctx.model.user.role === "accounting" ? `<button class="danger" data-cash-void="${ctx.esc(m.id)}" data-branch="${ctx.esc(m.branch)}">Anular</button>` : ""}</td></tr>`))}</section>`;
		}
		function cashSummary() {
			const sales = ctx.list("sales").filter((s) => s.user === ctx.model.user.id && (currentCash() ? s.cashSession === currentCash().id : !s.cashSession && s.day === ctx.model.today)), moves = (ctx.model.state.cashMovements || []).filter((m) => m.user === ctx.model.user.id && (currentCash() ? m.cashSession === currentCash().id : !m.cashSession && m.day === ctx.model.today));
			const sum = (rows) => Math.round(rows.reduce((n, r) => n + r.total, 0) * 100) / 100;
			const salesTotal = sum(sales), incomeTotal = sum(moves.filter((m) => m.direction === "in" && !m.voided)), expenseTotal = sum(moves.filter((m) => m.direction === "out" && !m.voided));
			return {
				salesTotal,
				incomeTotal,
				expenseTotal,
				expected: Math.round((salesTotal + incomeTotal - expenseTotal) * 100) / 100,
				movements: moves,
				quantity: sales.reduce((n, s) => n + s.quantity, 0)
			};
		}
		function cashPreview() {
			const input = ctx.$("[data-action=\"close\"] [name=\"physical\"]"), out = ctx.$("#cashDifference");
			if (!input || !out) return;
			const d = Math.round((Number(input.value) - cashSummary().expected) * 100) / 100;
			out.textContent = input.value === "" ? "Ingresa el efectivo contado" : ctx.money(d) + " · " + (d === 0 ? "Caja cuadrada" : d > 0 ? "Sobrante" : "Faltante");
			out.className = d !== 0 && input.value !== "" ? "negative" : "amount";
		}
		function closures() {
			const user = ctx.model.user, seller = ["candy", "ticketing"].includes(user.role), own = cashClosed() ? ctx.list("closures").slice().reverse().find((c) => c.user === user.id) : null;
			let form = "";
			if (seller) {
				const d = own?.detail || cashSummary();
				form = `<section class="panel cash-header"><div class="panel-head"><div><p class="eyebrow">CIERRE DIARIO · ${ctx.esc(ctx.roles[user.role])}</p><h2>1. Revisa tu caja</h2></div>${ctx.badge(own ? own.status : "Caja abierta")}</div><div class="cash-metrics"><article><small>Ventas del día</small><strong>${ctx.money(d.salesTotal)}</strong><span>${d.quantity} ${user.role === "ticketing" ? "boletos cobrados" : "unidades vendidas"}</span></article><article><small>Otros ingresos</small><strong>${ctx.money(d.incomeTotal)}</strong><span>Fondos y entradas adicionales</span></article><article><small>Egresos</small><strong>${ctx.money(d.expenseTotal)}</strong><span>Retiros y salidas de efectivo</span></article><article class="accent"><small>Saldo esperado</small><strong>${ctx.money(own?.expected ?? d.expected)}</strong><span>Ventas + ingresos − egresos</span></article></div>${own ? `<p class="muted">Caja cerrada. Los importes y movimientos quedaron guardados para su revisión.</p><a class="button" target="_blank" href="/api/closing/${own.id}">Imprimir reporte de cierre ↗</a>` : `<div class="cash-buttons"><button data-cash-direction="in">＋ Registrar ingreso</button><button data-cash-direction="out">− Registrar egreso</button></div><p class="muted small">Registra aquí el fondo inicial, reposiciones o retiros. Estos movimientos modifican el efectivo esperado, sin sumarse a las ventas.</p>`}</section><section class="panel"><div class="panel-head"><h2>Movimientos de efectivo</h2><small>${ctx.esc(ctx.model.today)} · ${ctx.esc(user.id)}</small></div>${d.movements.length ? ctx.table([
					"Hora",
					"Movimiento / motivo",
					"Referencia",
					"Importe"
				], d.movements.map((m) => `<tr><td>${ctx.esc(m.at.slice(11, 19))}</td><td><strong>${m.direction === "in" ? "Ingreso" : "Egreso"}</strong><small>${ctx.esc(m.reason)}${m.voided ? " · ANULADO: " + ctx.esc(m.voidReason) : ""}</small></td><td>${ctx.esc(m.reference) || "—"}</td><td class="${m.direction === "in" ? "amount" : "negative"}">${m.direction === "in" ? "+" : "−"} ${ctx.money(m.total)}</td></tr>`)) : "<p class=\"muted\">No hay ingresos ni egresos adicionales registrados hoy.</p>"}</section>`;
				if (!own) form += `<section class="panel"><p class="eyebrow">CONCILIACIÓN Y ENTREGA</p><h2>2. Cuenta el efectivo</h2><p class="muted">Cuenta el efectivo que entregarás. El sistema compara ese importe con el saldo esperado y conserva cualquier sobrante o faltante.</p><form data-action="close" class="form-grid">${ctx.field("Efectivo físico contado · BOB", "physical", "number", "", "min=\"0\" step=\"0.01\"")}<label>Observaciones<input name="note" maxlength="300" placeholder="Detalle de entrega o diferencia"></label><div class="cash-reconcile"><small>Saldo esperado</small><b>${ctx.money(cashSummary().expected)}</b><small>Diferencia = contado − esperado</small><strong id="cashDifference">Ingresa el efectivo contado</strong></div><button class="primary">3. Confirmar cierre →</button></form><p class="muted small">Al cerrar se bloquean las ventas, ingresos y egresos hasta una nueva apertura. Contabilidad verificará la entrega. Las ventas anticipadas se incluyen en el día del cobro.</p></section>`;
			}
			return (seller && !currentCash() ? openingPanel() : "") + form + cashLedger() + `<section class="panel"><div class="panel-head"><h2>Historial de cierres</h2><label class="search-field">Buscar cierre<input type="search" data-filter-table="closingRecords" placeholder="Fecha, usuario o estado…"></label></div><div id="closingRecords">${ctx.table([
				"Día / usuario",
				"Sucursal",
				"Esperado",
				"Físico",
				"Diferencia",
				"Estado / reporte"
			], ctx.list("closures").slice().reverse().map((c) => `<tr><td>${c.day}<small>${ctx.esc(c.user)}</small></td><td>${ctx.esc(c.branch)}</td><td>${ctx.money(c.expected)}</td><td>${ctx.money(c.physical)}</td><td class="${c.difference ? "negative" : "amount"}">${ctx.money(c.difference)}</td><td>${ctx.badge(c.status)}<p><a target="_blank" href="/api/closing/${c.id}">Ver / imprimir reporte ↗</a></p>${c.note ? `<small>${ctx.esc(c.note)}</small>` : ""}${user.role === "accounting" && c.status !== "Confirmado" ? `<form data-action="close_review" data-id="${c.id}" data-branch="${c.branch}" class="compact">${ctx.field("Físico verificado", "physical", "number", c.physical, "min=\"0\" step=\"0.01\"")}<input name="note" placeholder="Detalle de verificación" required><button>Verificar cierre</button></form>` : ""}</td></tr>`))}</div><p class="muted small">Contabilidad confirma únicamente si la diferencia es cero. Las diferencias quedan observadas.</p></section>`;
		}
		return {
			cashClosed,
			openingPanel,
			showOpeningDialog,
			openCashDialog,
			cashPreview,
			closures
		};
	}

//#endregion
//#region src/modules/operations/presentation.js
/** UI dependencies: badge, branch, empty, esc, list, menus, model, money, roles, table. Injected by app composition. */
	function createOperationsViews(ctx) {
		function overview() {
			const sales = ctx.list("sales").filter((s) => s.day === ctx.model.today), total = sales.reduce((n, s) => n + s.total, 0), candy = sales.filter((s) => s.area === "candy").reduce((n, s) => n + s.total, 0);
			const users = ctx.model.state.users.filter((u) => ["ticketing", "candy"].includes(u.role) && (ctx.branch === "Todas" || u.branch === ctx.branch));
			const rows = users.map((u) => {
				const own = sales.filter((s) => s.user === u.id), close = ctx.list("closures").find((c) => c.user === u.id && c.day === ctx.model.today);
				return `<tr><td><strong>${u.id}</strong><small>${ctx.roles[u.role]}</small></td><td>${u.branch}</td><td>${own.length}</td><td class="amount">${ctx.money(own.reduce((n, s) => n + s.total, 0))}</td><td>${ctx.badge(close ? close.status : "Caja abierta")}</td></tr>`;
			});
			return dashboardActions() + `<div class="metrics"><article><p>VENTAS DEL DÍA</p><strong>${ctx.money(total)}</strong><small>Ventas registradas en esta sucursal</small></article><article><p>ENTRADAS EMITIDAS</p><strong>${sales.filter((s) => s.area === "ticketing").reduce((n, s) => n + s.quantity, 0)}</strong><small>Boletos cobrados en el día</small></article><article><p>VENTAS DE CANDY</p><strong>${ctx.money(candy)}</strong><small>Cobros del equipo de Candy</small></article><article class="accent"><p>CIERRES POR REVISAR</p><strong>${ctx.list("closures").filter((c) => c.status !== "Confirmado").length}</strong><small>Validación por Contabilidad</small></article></div><div class="panel"><div class="panel-head"><div><p class="eyebrow">SEGUIMIENTO EN VIVO</p><h2>Ventas por persona</h2></div><span class="badge good">${users.length} usuarios</span></div>${ctx.table([
				"Usuario / área",
				"Sucursal",
				"Ventas",
				"Total del día",
				"Caja"
			], rows)}</div><div class="two"><section class="panel"><h2>Últimas ventas</h2>${sales.slice(-6).reverse().map((s) => `<div class="activity"><span class="activity-icon">${s.area === "candy" ? "C" : "B"}</span><div><strong>${ctx.esc(s.label)}</strong><small>${s.user} · ${s.at.slice(11, 16)}</small></div><b>${ctx.money(s.total)}</b></div>`).join("") || ctx.empty("Sin ventas hoy")}</section><section class="panel"><h2>Control de sucursales</h2>${(ctx.branch === "Todas" ? ctx.model.branches : [ctx.branch]).map((b) => `<div class="branch-line"><div><strong>${b}</strong><small>${ctx.model.state.audits.filter((a) => a.branch === b && a.status === "En curso").length} arqueos activos</small></div><b>${ctx.money(sales.filter((s) => s.branch === b).reduce((n, s) => n + s.total, 0))}</b></div>`).join("")}<p class="muted small">Las ventas confirmadas permanecen en el historial después del cierre.</p></section></div>`;
		}
		function dashboardActions() {
			const role = ctx.model.user.role;
			return `<div class="task-strip"><span>Tu siguiente paso</span>${[
				{
					page: "closures",
					title: "Cierres por revisar",
					count: ctx.list("closures").filter((c) => c.status !== "Confirmado").length
				},
				{
					page: "reports",
					title: "Reportes pendientes",
					count: ctx.list("reports").filter((r) => ["Pendiente", "Observado"].includes(r.status)).length
				},
				{
					page: "audits",
					title: "Arqueos en curso",
					count: ctx.list("audits").filter((a) => a.status === "En curso").length
				}
			].filter((t) => ctx.menus[role].includes(t.page)).map((t) => `<button data-page="${t.page}">${t.title}<b class="${t.count ? "pending-number" : ""}">${t.count}</b> →</button>`).join("")}${role === "manager" ? "<button data-page=\"shows\">Programar funciones →</button>" : ""}${role === "administrator" ? "<button data-page=\"reports\">Reportar movimiento →</button>" : ""}</div>`;
		}
		function history() {
			const labels = {
				payroll_delete: "Registro salarial retirado",
				payroll_role: "Sueldo de referencia actualizado",
				payroll_employee: "Empleado salarial actualizado",
				payroll_extra: "Extra salarial registrado",
				payroll_extra_void: "Extra salarial anulado",
				payroll_calculate: "Planilla recalculada",
				payroll_validate: "Planilla validada",
				payroll_mail_update: "Destinatario salarial actualizado",
				payroll_import: "Biométrico importado para salarios",
				candy_checkout: "Venta de Candy registrada",
				candy_void_request: "Anulación de Candy solicitada",
				candy_void_review: "Anulación de Candy revisada",
				cash_open: "Caja abierta",
				cash_void: "Movimiento de efectivo anulado",
				cash_movement: "Movimiento de efectivo",
				ticket_checkout: "Venta de boletos finalizada",
				room_delete: "Sala retirada",
				movie_delete: "Película retirada",
				trailer_delete: "Tráiler retirado",
				show_delete: "Función retirada",
				room_save: "Sala actualizada",
				movie_save: "Banner actualizado",
				schedule: "Programación creada",
				show_cancel: "Función cancelada",
				trailer_save: "Tráiler actualizado",
				sell: "Venta registrada",
				show: "Función publicada",
				report: "Movimiento reportado",
				review: "Reporte revisado",
				product: "Producto creado",
				stock: "Movimiento de Candy",
				audit_start: "Arqueo iniciado",
				audit_save: "Conteo guardado",
				audit_finish: "Arqueo finalizado",
				close: "Caja cerrada",
				close_review: "Cierre verificado"
			};
			return `<section class="panel"><div class="panel-head"><h2>Trazabilidad de operaciones</h2><label class="search-field">Buscar operación<input type="search" data-filter-table="operationRecords" placeholder="Acción, usuario o fecha…"></label></div><div id="operationRecords">${ctx.table([
				"Fecha y hora",
				"Usuario",
				"Sucursal",
				"Acción"
			], ctx.list("log").slice().reverse().map((l) => `<tr><td>${l.at.slice(0, 19).replace("T", " ")}</td><td>${l.user}</td><td>${l.branch}</td><td>${labels[l.action] || l.action}</td></tr>`))}</div></section>`;
		}
		return {
			overview,
			history
		};
	}

//#endregion
//#region src/shared/application/command-client.ts
/** Preserve HTTP failure status so a feature can retain its idempotent retry. */
	async function sendCommand(transport, command, schema) {
		const response = await transport("/api/action", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(command)
		});
		const body = await response.json();
		if (!response.ok) return {
			ok: false,
			status: response.status,
			body: { error: errorMessage(body) }
		};
		return {
			ok: true,
			status: response.status,
			body: schema.parse(body)
		};
	}

//#endregion
//#region src/modules/ticketing/application.ts
	const ticketLineSchema = looseObject({
		item: string(),
		quantity: number().int().positive(),
		unitPrice: number().positive(),
		seatsPerTicket: number().int().min(1).max(2)
	});
	const pendingTicketSchema = looseObject({
		requestId: string().min(8).max(100),
		lines: array(ticketLineSchema).min(1).max(50)
	});
	const saleResponseSchema$1 = looseObject({
		order: looseObject({
			id: string(),
			lines: array(looseObject({
				quantity: number(),
				unitPrice: number()
			})),
			total: number()
		}),
		repeated: boolean().optional()
	});
	function submitTicketSale(transport, command) {
		return sendCommand(transport, pendingTicketSchema.parse(command), saleResponseSchema$1);
	}
	function restorePendingTicket(raw) {
		if (!raw) return null;
		try {
			const value = JSON.parse(raw);
			const result = pendingTicketSchema.safeParse(value);
			return result.success ? result.data : null;
		} catch {
			return null;
		}
	}

//#endregion
//#region src/modules/ticketing/presentation.js
/** UI dependencies: $, api, branch, cashClosed, esc, list, model, money, notify, page, refresh, refreshView, table. Local basket state stays inside this factory. */
	function createTicketingController(ctx) {
		let controller;
		let cart = [], date = "", query = "", receipt = null, pending = null, working = false, owner = "", chosen = {};
		const key = () => "ticket-checkout-" + ctx.model.user.id;
		const freshId = () => crypto.randomUUID();
		const shows = () => ctx.list("shows").filter((s) => !s.cancelled && s.date + "T" + s.time >= ctx.model.serverTime).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
		const closed = () => ctx.cashClosed();
		const total = () => cart.reduce((sum, r) => sum + Math.round(r.unitPrice * 100) * r.quantity, 0) / 100;
		function remember() {
			try {
				if (pending) sessionStorage.setItem(key(), JSON.stringify(pending));
				else sessionStorage.removeItem(key());
			} catch {}
		}
		function ensure() {
			if (owner !== ctx.model.user.id) {
				owner = ctx.model.user.id;
				cart = [];
				receipt = null;
				date = "";
				pending = null;
				try {
					pending = restorePendingTicket(sessionStorage.getItem(key()));
					if (pending) cart = pending.lines;
				} catch {
					pending = null;
				}
			}
			if (!date) date = shows().find((s) => s.date >= ctx.model.today)?.date || ctx.model.today;
		}
		function current(r) {
			return ctx.list("shows").find((s) => s.id === r.item);
		}
		function cartHTML() {
			const unavailable = cart.some((r) => {
				const s = current(r);
				return !s || s.cancelled || s.date < ctx.model.today || s.date + "T" + s.time < ctx.model.serverTime || r.quantity > ctx.model.state.availability[r.item];
			});
			return `<div class="panel-head"><div><p class="eyebrow">TU VENTA</p><h2>Boletos seleccionados</h2></div><span class="badge">${cart.reduce((n, r) => n + r.quantity, 0)} boletos</span></div>${pending ? "<div class=\"banner warning\">Hay una confirmación pendiente. Reintenta para recuperar el resultado sin duplicar la venta.</div>" : ""}${cart.map((r) => {
				const s = current(r), left = ctx.model.state.availability[r.item] || 0;
				return `<article class="cart-line"><strong>${ctx.esc(s?.title || r.title || "Función no disponible")}</strong><small>${ctx.esc(s?.date || r.date)} · ${ctx.esc(s?.time || r.time)} · ${ctx.esc(s?.room || r.room)}</small><div class="cart-controls"><button data-ticket-minus="${r.item}" ${pending ? "disabled" : ""} aria-label="Restar boleto de ${ctx.esc(s?.title)}">−</button><input type="number" min="1" max="2000" value="${r.quantity}" data-ticket-qty="${r.item}" aria-label="Cantidad para ${ctx.esc(s?.title)}" ${pending ? "disabled" : ""}><button data-ticket-plus="${r.item}" ${pending ? "disabled" : ""} aria-label="Sumar boleto de ${ctx.esc(s?.title)}">+</button><b>${ctx.money(r.unitPrice * r.quantity)}</b><button data-ticket-remove="${r.item}" ${pending ? "disabled" : ""} aria-label="Quitar ${ctx.esc(s?.title)}">×</button></div><small>${ctx.money(r.unitPrice)} por boleto · ${r.seatsPerTicket === 2 ? "2×1 · " : ""}${r.quantity * r.seatsPerTicket} butacas</small>${!s || s.cancelled || r.quantity > left ? `<p class="negative">Disponibilidad actual: ${left}. Ajusta o retira esta función.</p>` : ""}</article>`;
			}).join("") || "<div class=\"empty cart-empty\"><span class=\"empty-icon\" aria-hidden=\"true\">＋</span><h3>Tu venta empieza aquí</h3><p>Elige una película, un horario y la cantidad de boletos.</p></div>"}<div class="checkout-total"><span>Total a cobrar</span><strong>${ctx.money(total())}</strong></div><label>Importe recibido (opcional)<input id="ticketReceived" type="number" min="0" step="0.01" placeholder="BOB" ${pending ? "disabled" : ""} value="${pending?.received ?? ""}"></label><p id="ticketChange" class="muted">Sin registro de medio de pago.</p><button id="ticketFinish" class="primary" ${working || !pending && (closed() || !cart.length || unavailable) ? "disabled" : ""}>${working ? "Confirmando…" : pending ? "Reintentar confirmación" : "Finalizar venta →"}</button>${cart.length && !pending ? "<button id=\"ticketClear\" class=\"subtle\">Vaciar lista</button>" : ""}<p class="muted small">Los boletos se descuentan al finalizar, no al agregarlos a la lista.</p>`;
		}
		function prettyDate(value) {
			return (/* @__PURE__ */ new Date(value + "T12:00:00")).toLocaleDateString("es-BO", {
				weekday: "short",
				day: "numeric",
				month: "short"
			});
		}
		function progressHTML() {
			return window.UniversalUI.steps([
				"Función",
				"Boletos",
				"Confirmación"
			], receipt ? 2 : cart.length ? 1 : 0);
		}
		function dockHTML() {
			return `<div class="pos-mobile-dock" id="ticketDock"><div><small>${cart.reduce((n, r) => n + r.quantity, 0)} boletos en tu venta</small><strong>${ctx.money(total())}</strong></div><button class="primary" data-ticket-cart="yes">Ver venta <span aria-hidden="true">↑</span></button></div>`;
		}
		function gridHTML() {
			const items = shows().filter((s) => s.date === date && s.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())), groups = /* @__PURE__ */ new Map();
			for (const s of items) {
				const id = s.movieId || s.title;
				if (!groups.has(id)) groups.set(id, []);
				groups.get(id).push(s);
			}
			return [...groups].map(([id, functions]) => {
				const selected = functions.find((s) => s.id === chosen[id]), movie = ctx.list("movies").find((m) => m.id === functions[0].movieId), poster = movie?.poster;
				return `<article class="ticket-show ticket-movie ${selected ? "has-selection" : ""}"><div class="ticket-movie-heading">${poster ? `<img class="ticket-poster" src="${ctx.esc(poster)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : "<span class=\"ticket-poster ticket-poster-empty\" aria-hidden=\"true\">▸</span>"}<div><p class="eyebrow">${functions.length} ${functions.length === 1 ? "HORARIO" : "HORARIOS"} · ${ctx.esc(prettyDate(date))}</p><h2>${ctx.esc(functions[0].title)}</h2>${movie ? `<p class="ticket-movie-meta">${ctx.esc([
					movie.genre,
					movie.duration ? movie.duration + " min" : "",
					movie.rating
				].filter(Boolean).join(" · "))}</p>` : ""}</div></div><div class="ticket-times" aria-label="Horarios de ${ctx.esc(functions[0].title)}">${functions.map((s) => `<button type="button" data-ticket-time="${s.id}" aria-pressed="${selected?.id === s.id}" class="${selected?.id === s.id ? "active" : ""} ${!ctx.model.state.availability[s.id] ? "is-soldout" : ""}"><strong>${s.time}</strong><small>${ctx.esc(s.format)}${functions.filter((f) => f.time === s.time).length > 1 ? " · " + ctx.esc(s.room) : ""}${!ctx.model.state.availability[s.id] ? " · Agotada" : ""}</small></button>`).join("")}</div>${selected ? showDetails(selected) : "<p class=\"ticket-prompt\"><span aria-hidden=\"true\">↳</span> Elige un horario para ver la sala, el precio y los boletos disponibles.</p>"}</article>`;
			}).join("") || `<div class="panel empty"><span class="empty-icon" aria-hidden="true">▸</span><h3>No encontramos funciones</h3><p>Prueba otra película o fecha. La programación depende de esta sucursal.</p></div>`;
		}
		function showDetails(s) {
			const inCart = cart.find((r) => r.item === s.id)?.quantity || 0, left = ctx.model.state.availability[s.id] || 0;
			return `<section class="ticket-details" aria-label="Detalle de ${ctx.esc(s.title)} a las ${s.time}"><div class="panel-head"><strong>${ctx.esc(s.room)} · ${s.format}</strong>${s.seatsPerTicket === 2 ? "<span class=\"badge good\">2×1</span>" : ""}</div><div class="ticket-facts"><div><small>Precio por boleto</small><strong>${ctx.money(s.price)}</strong></div><div><small>Boletos disponibles</small><strong>${left}</strong></div></div><p class="muted small">${s.capacity} butacas en sala${s.seatsPerTicket === 2 ? " · Cada boleto ocupa 2 butacas" : ""}${inCart ? " · " + inCart + " boletos en tu lista" : ""}</p><div class="ticket-add"><label>Cantidad<input type="number" min="1" max="${Math.max(1, left - inCart)}" value="1" data-ticket-addqty="${s.id}" aria-label="Boletos de ${ctx.esc(s.title)} a las ${s.time}"></label><button data-ticket-add="${s.id}" ${closed() || pending || left <= inCart ? "disabled" : ""}>${left ? "Agregar a la venta +" : "Agotada"}</button></div></section>`;
		}
		function printStatus(o) {
			const p = o.printing, waiting = ["pending", "sending"].includes(p?.status), repeat = ["queued", "uncertain"].includes(p?.status);
			return `<p class="${[
				"pending",
				"sending",
				"queued",
				"manual"
			].includes(p?.status) ? "muted" : "negative"}">${ctx.esc(p?.message || "Impresión pendiente.")}</p>${p?.status === "manual" ? "" : `<button data-print-order="${o.id}" data-print-repeat="${repeat}" ${waiting ? "disabled" : ""}>${waiting ? "Esperando impresión…" : repeat ? "Reimprimir entradas" : "Enviar a la Epson"}</button>`}`;
		}
		function receiptHTML() {
			return receipt ? `<section class="panel ticket-success"><p class="eyebrow">VENTA FINALIZADA</p><h2>${ctx.money(receipt.total)} · ${receipt.lines.reduce((n, r) => n + r.quantity, 0)} boletos</h2><p>Comprobante ${ctx.esc(receipt.id)}${receipt.change !== null ? " · Cambio: " + ctx.money(receipt.change) : ""}</p><a class="button primary" href="/api/receipt/${receipt.id}" target="_blank" rel="noopener">Ver entradas individuales ↗</a>${printStatus(receipt)}<button id="ticketNew">Nueva venta</button></section>` : "";
		}
		function render() {
			ensure();
			if (receipt) receipt = (ctx.model.state.orders || []).find((order) => order.id === receipt.id) || receipt;
			const dates = [.../* @__PURE__ */ new Set([ctx.model.today, ...shows().map((s) => s.date)])];
			return `${closed() ? "<div class=\"banner warning\">Tu caja de hoy está cerrada. Puedes consultar y reimprimir tus ventas.</div>" : ""}${!shows().some((s) => s.date === ctx.model.today) ? "<div class=\"banner\">No hay funciones programadas para hoy. Puedes vender anticipadamente las próximas funciones.</div>" : ""}${receiptHTML()}<div id="ticketProgress">${progressHTML()}</div><div class="pos-section-heading"><div><h2>Elige la película y el horario</h2><p class="muted">${ctx.esc(ctx.branch)} · Boletos para hoy y próximas funciones</p></div><a class="button subtle-inline" href="#ticketReceipts">Mis comprobantes ↓</a></div><div class="ticket-layout"><section><div class="panel ticket-filters"><label>Fecha de la función<select id="ticketDate">${dates.map((d) => `<option value="${d}" ${d === date ? "selected" : ""}>${ctx.esc(prettyDate(d))}${d === ctx.model.today ? " · Hoy" : ""}</option>`).join("")}</select></label><label>Buscar película<input id="ticketSearch" type="search" value="${ctx.esc(query)}" placeholder="Busca por título" autocomplete="off"></label></div><div id="ticketGrid" class="ticket-grid">${gridHTML()}</div></section><section id="ticketCart" class="panel ticket-cart" tabindex="-1" aria-label="Resumen de venta">${cartHTML()}</section></div>${dockHTML()}<section class="panel pos-receipts" id="ticketReceipts"><div class="panel-head"><div><p class="eyebrow">VENTAS REGISTRADAS</p><h2>Mis comprobantes</h2></div></div>${ctx.table([
				"Fecha de venta",
				"Comprobante",
				"Boletos",
				"Total",
				"Impresión"
			], (ctx.model.state.orders || []).slice().reverse().map((o) => `<tr><td>${o.at.slice(0, 16).replace("T", " ")}</td><td>${ctx.esc(o.id)}</td><td>${o.lines.reduce((n, r) => n + r.quantity, 0)}</td><td>${ctx.money(o.total)}</td><td><a class="button" href="/api/receipt/${o.id}" target="_blank" rel="noopener">Ver entradas ↗</a>${printStatus(o)}</td></tr>`))}</section>`;
		}
		function updateCart() {
			const received = ctx.$("#ticketReceived")?.value;
			ctx.$("#ticketCart").innerHTML = cartHTML();
			if (!pending && received !== void 0) ctx.$("#ticketReceived").value = received;
			change();
			live();
			updateDock();
		}
		function updateDock() {
			if (ctx.$("#ticketProgress")) ctx.$("#ticketProgress").innerHTML = progressHTML();
			const dock = ctx.$("#ticketDock");
			if (dock) dock.outerHTML = dockHTML();
		}
		function change() {
			if (!ctx.$("#ticketChange")) return;
			const received = ctx.$("#ticketReceived").value;
			ctx.$("#ticketChange").textContent = received === "" ? "Sin registro de medio de pago." : Number(received) >= total() ? "Cambio: " + ctx.money(Number(received) - total()) : "Falta cobrar: " + ctx.money(total() - Number(received));
		}
		function live() {
			if (!ctx.$("#ticketGrid")) return;
			updateDock();
			if (!ctx.$("#ticketGrid").contains(document.activeElement)) ctx.$("#ticketGrid").innerHTML = gridHTML();
			const cartPanel = ctx.$("#ticketCart");
			if (cartPanel && !cartPanel.contains(document.activeElement) && !working) {
				const received = ctx.$("#ticketReceived")?.value;
				cartPanel.innerHTML = cartHTML();
				if (!pending && received !== void 0) ctx.$("#ticketReceived").value = received;
				change();
			}
			const button = ctx.$("#ticketFinish");
			if (button && !pending) button.disabled = working || closed() || !cart.length || cart.some((r) => !current(r) || current(r).cancelled || current(r).date + "T" + current(r).time < ctx.model.serverTime || r.quantity > (ctx.model.state.availability[r.item] || 0));
		}
		async function finish() {
			if (working) return;
			if (!pending) {
				if (!cart.length || closed()) return;
				const received = ctx.$("#ticketReceived").value;
				if (received !== "" && (!Number.isFinite(Number(received)) || Number(received) < total())) return ctx.notify("El importe recibido no alcanza el total.");
				pending = {
					action: "ticket_checkout",
					branch: ctx.model.user.branch,
					requestId: freshId(),
					lines: cart.map((r) => ({ ...r })),
					received
				};
				remember();
			}
			working = true;
			updateCart();
			try {
				const response = await submitTicketSale(ctx.transport, pending);
				const result = response.body;
				if (!response.ok) {
					if (response.status >= 500 || response.status === 429) throw new Error("Confirmación pendiente");
					pending = null;
					remember();
					await ctx.refresh(true);
					cart = cart.map((r) => {
						const s = current(r);
						return s ? {
							...r,
							unitPrice: s.price,
							seatsPerTicket: s.seatsPerTicket
						} : r;
					});
					ctx.notify(result.error || "No se pudo confirmar. Revisa la lista.");
					return;
				}
				receipt = result.order;
				cart = [];
				pending = null;
				remember();
				await ctx.refresh(true);
				ctx.notify(result.repeated ? "Comprobante recuperado. La venta no se duplicó." : "Venta finalizada. " + (receipt.printing?.message || "Revisa el estado de impresión."));
			} catch {
				ctx.notify("No se recibió la confirmación. Reintenta para comprobar la misma venta sin duplicarla.");
			} finally {
				working = false;
				ctx.refreshView();
			}
		}
		controller = {
			render,
			live,
			reset() {
				chosen = {};
				owner = "";
				cart = [];
				date = "";
				query = "";
				receipt = null;
				pending = null;
			}
		};
		ctx.$("#root").addEventListener("click", async (e) => {
			const b = e.target.closest("button");
			if (!b || ctx.model?.user.role !== "ticketing") return;
			if (b.dataset.ticketCart) {
				ctx.$("#ticketCart")?.scrollIntoView({
					behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
					block: "start"
				});
				ctx.$("#ticketCart")?.focus({ preventScroll: true });
				return;
			}
			if (b.dataset.printOrder) {
				if (working) return;
				const repeat = b.dataset.printRepeat === "true";
				if (repeat && !confirm("Revisa si los boletos ya salieron. ¿Enviar otra copia de todas las entradas?")) return;
				working = true;
				b.disabled = true;
				const requestKey = "ticket-print-" + ctx.model.user.id + "-" + b.dataset.printOrder;
				let requestId;
				try {
					requestId = sessionStorage.getItem(requestKey) || freshId();
					sessionStorage.setItem(requestKey, requestId);
				} catch {
					requestId = b.dataset.printRequest || freshId();
				}
				b.dataset.printRequest = requestId;
				try {
					const result = await ctx.api("print", {
						order: b.dataset.printOrder,
						reprint: repeat,
						requestId
					});
					try {
						sessionStorage.removeItem(requestKey);
					} catch {}
					if (receipt?.id === b.dataset.printOrder) receipt.printing = result.printing;
					ctx.notify(result.printing.message);
					await ctx.refresh(true);
				} catch (e) {
					ctx.notify(e.message, "error");
				} finally {
					working = false;
					ctx.refreshView();
				}
				return;
			}
			if (b.dataset.ticketTime) {
				const s = shows().find((s) => s.id === b.dataset.ticketTime);
				if (s) {
					chosen[s.movieId || s.title] = s.id;
					ctx.$("#ticketGrid").innerHTML = gridHTML();
				}
				return;
			}
			if (b.id === "ticketFinish") {
				finish();
				return;
			}
			if (pending) return;
			if (b.id === "ticketNew") {
				receipt = null;
				ctx.refreshView();
				return;
			}
			if (b.id === "ticketClear") {
				cart = [];
				updateCart();
				return;
			}
			const id = b.dataset.ticketAdd || b.dataset.ticketPlus || b.dataset.ticketMinus || b.dataset.ticketRemove;
			if (!id) return;
			const s = ctx.list("shows").find((s) => s.id === id), row = cart.find((r) => r.item === id);
			if (b.dataset.ticketRemove) cart = cart.filter((r) => r.item !== id);
			else if (b.dataset.ticketMinus) {
				if (row.quantity > 1) row.quantity--;
				else cart = cart.filter((r) => r.item !== id);
			} else {
				const n = b.dataset.ticketAdd ? Number(document.querySelector("[data-ticket-addqty=\"" + id + "\"]").value) : 1;
				if (!Number.isInteger(n) || n < 1) return ctx.notify("Introduce una cantidad entera mayor que cero.");
				if (!s || n + (row?.quantity || 0) > (ctx.model.state.availability[id] || 0)) return ctx.notify("No hay suficientes boletos disponibles.");
				if (row) row.quantity += n;
				else cart.push({
					item: id,
					title: s.title,
					date: s.date,
					time: s.time,
					room: s.room,
					quantity: n,
					unitPrice: s.price,
					seatsPerTicket: s.seatsPerTicket
				});
			}
			ctx.$("#ticketGrid").innerHTML = gridHTML();
			updateCart();
		});
		ctx.$("#root").addEventListener("change", (e) => {
			if (e.target.id === "ticketDate") {
				date = e.target.value;
				chosen = {};
				ctx.$("#ticketGrid").innerHTML = gridHTML();
			}
			if (e.target.dataset.ticketQty && !pending) {
				const row = cart.find((r) => r.item === e.target.dataset.ticketQty), n = Number(e.target.value);
				if (!Number.isInteger(n) || n < 1 || n > 2e3) {
					e.target.value = row.quantity;
					return ctx.notify("Cantidad inválida.");
				}
				row.quantity = n;
				updateCart();
			}
		});
		ctx.$("#root").addEventListener("input", (e) => {
			if (e.target.id === "ticketSearch") {
				query = e.target.value;
				ctx.$("#ticketGrid").innerHTML = gridHTML();
			}
			if (e.target.id === "ticketReceived") change();
		});
		if (ctx.model?.user.role === "ticketing" && ctx.page === "pos") ctx.refreshView();
		const originalRender = controller.render;
		controller.render = () => (ctx.cashClosed() ? ctx.openingPanel() : "") + originalRender();
		return controller;
	}

//#endregion
//#region src/modules/candy/application.ts
	const candyLineSchema = looseObject({
		item: string(),
		quantity: number().int().positive(),
		unitPrice: number().positive()
	});
	const pendingCandySchema = looseObject({
		requestId: string().min(8).max(100),
		lines: array(candyLineSchema).min(1).max(100)
	});
	const saleResponseSchema = looseObject({ order: looseObject({
		id: string(),
		total: number()
	}) });
	function submitCandySale(transport, command) {
		return sendCommand(transport, pendingCandySchema.parse(command), saleResponseSchema);
	}
	function restorePendingCandy(raw) {
		if (!raw) return null;
		try {
			const value = JSON.parse(raw);
			const result = pendingCandySchema.safeParse(value);
			return result.success ? result.data : null;
		} catch {
			return null;
		}
	}

//#endregion
//#region src/modules/candy/presentation.js
/** UI dependencies: $, badge, branch, cashClosed, esc, field, list, model, money, notify, openingPanel, page, refresh, refreshView, table. Local basket state stays inside this factory. */
	function createCandyController(ctx) {
		let controller;
		let owner = "", group = false, creating = false, cart = [], query = "", working = false, pending = null, historyDate = "", historySeller = "", historyStatus = "all";
		const storage = () => "candy-checkout-" + ctx.model.user.id;
		const products = () => ctx.list("products").filter((p) => p.kind === "candy");
		const locked = () => ctx.cashClosed() || ctx.list("audits").some((a) => a.kind === "candy" && a.status === "En curso");
		const total = () => cart.reduce((n, r) => n + Math.round(r.unitPrice * 100) * r.quantity, 0) / 100;
		function remember() {
			try {
				if (pending) sessionStorage.setItem(storage(), JSON.stringify(pending));
				else sessionStorage.removeItem(storage());
			} catch {}
		}
		function ensure() {
			if (owner === ctx.model.user.id) return;
			owner = ctx.model.user.id;
			historyDate = "";
			historySeller = "";
			historyStatus = "all";
			group = false;
			creating = false;
			cart = [];
			query = "";
			pending = null;
			try {
				pending = restorePendingCandy(sessionStorage.getItem(storage()));
				if (pending) {
					cart = pending.lines;
					creating = true;
				}
			} catch {}
		}
		function matches() {
			const q = query.trim().toLocaleLowerCase();
			return products().filter((p) => !q || p.code.toLocaleLowerCase().includes(q) || p.name.toLocaleLowerCase().includes(q));
		}
		function productRows() {
			return matches().map((p) => `<button type="button" class="candy-product" data-candy-add="${p.id}" ${locked() || pending || p.available === false || p.stock <= 0 ? "disabled" : ""}><span><small>${ctx.esc(p.code)}</small><strong>${ctx.esc(p.name)}</strong><small>${p.stock === void 0 ? p.available ? "Disponible" : "Agotado" : p.stock + " " + ctx.esc(p.unit) + " disponibles"}</small></span><b>${ctx.money(p.price)} ＋</b></button>`).join("") || "<p class=\"muted\">No hay productos con ese código o nombre.</p>";
		}
		function basket() {
			return `<div class="panel-head"><h2>Venta en preparación</h2><span class="badge">${cart.reduce((n, r) => n + r.quantity, 0)} unidades</span></div>${pending ? "<div class=\"banner warning\">Confirmación pendiente. Reintenta para recuperar esta venta sin duplicarla.</div>" : ""}${cart.map((r) => `<article class="cart-line"><strong>${ctx.esc(r.name)}</strong><small>${ctx.esc(r.code)} · Precio unitario: ${ctx.money(r.unitPrice)}</small><div class="cart-controls"><label>Cantidad<input type="number" data-candy-qty="${r.item}" min="1" max="10000" step="1" value="${r.quantity}" ${pending ? "disabled" : ""}></label><b>${ctx.money(r.unitPrice * r.quantity)}</b><button type="button" data-candy-remove="${r.item}" ${pending ? "disabled" : ""} aria-label="Quitar ${ctx.esc(r.name)}">×</button></div></article>`).join("") || "<p class=\"muted\">Busca un producto y agrégalo a la lista.</p>"}<div class="checkout-total"><span>Total a cobrar</span><strong>${ctx.money(total())}</strong></div><button class="primary candy-finish" data-candy-finish="yes" ${working || !pending && (!cart.length || locked()) ? "disabled" : ""}>${working ? "Registrando…" : pending ? "Reintentar cierre de venta" : "Cerrar venta →"}</button><p class="muted small">El precio lo define Contabilidad. El inventario se descuenta al registrar la venta.</p>`;
		}
		function history() {
			const orders = (ctx.model.state.candyOrders || []).filter((o) => o.branch === ctx.branch && (group || o.user === ctx.model.user.id)).slice().reverse();
			const visible = orders.filter((o) => {
				const req = (ctx.model.state.candyRequests || []).filter((r) => r.order === o.id).at(-1);
				return (!historyDate || o.at.slice(0, 10) === historyDate) && (!group || !historySeller || o.user === historySeller) && (historyStatus === "all" || (historyStatus === "void" ? o.voided : historyStatus === "pending" ? !o.voided && req?.status === "Pendiente" : !o.voided && req?.status !== "Pendiente"));
			});
			return `<section class="panel candy-history"><div class="panel-head"><div><p class="eyebrow">${group ? "EQUIPO DE LA SUCURSAL" : "MIS VENTAS"}</p><h2>Historial de ventas</h2></div><div class="tabs"><button data-candy-view="mine" class="${group ? "" : "active"}" aria-pressed="${!group}">Mis ventas</button><button data-candy-view="all" class="${group ? "active" : ""}" aria-pressed="${group}">Todo el equipo</button></div></div><div class="list-filters candy-history-filters"><label>Fecha de venta<input id="candyHistoryDate" type="date" value="${ctx.esc(historyDate)}"></label>${group ? `<label>Vendedor<select id="candyHistorySeller"><option value="">Todos los vendedores</option>${[...new Set(orders.map((o) => o.user))].map((user) => `<option value="${ctx.esc(user)}" ${historySeller === user ? "selected" : ""}>${ctx.esc(user)}</option>`).join("")}</select></label>` : ""}<label>Estado<select id="candyHistoryStatus"><option value="all">Todos los estados</option><option value="registered" ${historyStatus === "registered" ? "selected" : ""}>Registrada</option><option value="pending" ${historyStatus === "pending" ? "selected" : ""}>Anulación pendiente</option><option value="void" ${historyStatus === "void" ? "selected" : ""}>Anulada</option></select></label><button data-candy-reset-filters="yes">Limpiar filtros</button></div><div class="history-summary"><span>${visible.length} ventas ${group ? "del equipo" : "individuales"}</span><span>Total vigente en la lista <strong>${ctx.money(visible.filter((o) => !o.voided).reduce((n, o) => n + o.total, 0))}</strong></span></div>${visible.length ? ctx.table([
				"Fecha / recibo",
				"Vendedor / productos",
				"Total",
				"Estado",
				"Acciones"
			], visible.map((o) => {
				const request = (ctx.model.state.candyRequests || []).filter((r) => r.order === o.id).at(-1);
				return `<tr><td>${ctx.esc(o.at.slice(0, 16).replace("T", " "))}<small class="receipt-code">${ctx.esc(o.id)}</small></td><td>${ctx.esc(o.user)}<details class="sale-lines"><summary>${o.lines.reduce((n, l) => n + l.quantity, 0)} unidades · ver productos</summary><small>${o.lines.map((l) => `${l.quantity} × ${ctx.esc(l.name)}`).join("<br>")}</small></details></td><td class="sale-value">${ctx.money(o.total)}</td><td>${ctx.badge(o.voided ? "Anulada" : request?.status === "Pendiente" ? "Anulación pendiente" : "Registrada")}${request ? `<small>Solicitud: ${ctx.esc(request.status)}${request.note ? " · " + ctx.esc(request.note) : ""}</small>` : ""}</td><td><div class="receipt-actions"><a class="button" target="_blank" rel="noopener" href="/api/candy-receipt/${o.id}">Imprimir recibo ↗</a>${o.user === ctx.model.user.id && !o.voided && request?.status !== "Pendiente" ? `<button class="danger" data-candy-void="${o.id}">Solicitar anulación</button>` : ""}</div></td></tr>`;
			})) : "<div class=\"empty\"><h3>No hay ventas para mostrar</h3><p>Prueba otra fecha o limpia los filtros.</p></div>"}</section>`;
		}
		function dockHTML() {
			return `<div class="pos-mobile-dock" id="candyDock"><div><small>${cart.reduce((n, r) => n + r.quantity, 0)} unidades en tu venta</small><strong>${ctx.money(total())}</strong></div><button class="primary" data-candy-cart="yes">Ver venta ↑</button></div>`;
		}
		function render() {
			ensure();
			return `${ctx.cashClosed() ? ctx.openingPanel() : ""}<div class="pos-section-heading"><div><p class="eyebrow">${creating ? "NUEVA VENTA" : "CANDY BAR"}</p><h2>${creating ? "Prepara el siguiente pedido" : "Tus ventas, a mano"}</h2><p class="muted">${creating ? "Busca, añade y confirma las cantidades." : "Consulta los recibos y empieza una nueva venta."}</p></div>${creating ? `<button data-candy-cancel="yes" ${pending ? "disabled" : ""}>← Volver al historial</button>` : `<button class="primary" data-candy-new="yes" ${locked() ? "disabled" : ""}>＋ Nueva venta</button>`}</div>${locked() ? `<div class="banner warning">${ctx.cashClosed() ? "Abre una caja para registrar nuevas ventas." : "Arqueo de Candy bar en curso. Las ventas se habilitarán al finalizar."}</div>` : ""}${creating ? `<div id="candyProgress">${window.UniversalUI.steps([
				"Productos",
				"Cantidades",
				"Confirmación"
			], cart.length ? 1 : 0)}</div><div class="ticket-layout candy-layout"><section class="panel candy-search-panel"><div class="candy-search-heading"><label>Buscar por código o nombre<input id="candySearch" type="search" value="${ctx.esc(query)}" placeholder="Ej. XXX1 o Combo Universal" autocomplete="off" ${pending ? "disabled" : ""}></label><small>Escribe un código y pulsa Enter para agregar una unidad.</small></div><div id="candyProducts" class="candy-products">${productRows()}</div></section><section class="panel ticket-cart" id="candyBasket" tabindex="-1" aria-label="Resumen de venta">${basket()}</section></div>${dockHTML()}` : history()}`;
		}
		function requests() {
			if (!["accounting", "manager"].includes(ctx.model.user.role)) return "";
			const rows = (ctx.model.state.candyRequests || []).filter((r) => ctx.branch === "Todas" || r.branch === ctx.branch).slice().reverse();
			return `<section class="panel"><h2>Solicitudes de anulación · Candy bar</h2><p class="muted small">Aprobar retira el importe de las ventas y recalcula el cierre. Comprueba la devolución del cobro y si los productos deben regresar al inventario.</p>${ctx.table([
				"Solicitud",
				"Venta / motivo",
				"Estado / resolución"
			], rows.map((r) => {
				const o = (ctx.model.state.candyOrders || []).find((o) => o.id === r.order);
				return `<tr><td>${ctx.esc(r.at.slice(0, 16).replace("T", " "))}<small>${ctx.esc(r.user)} · ${ctx.esc(r.branch)}</small></td><td>${o ? ctx.money(o.total) : "—"}<small>${ctx.esc(r.reason)}</small><a href="/api/candy-receipt/${ctx.esc(r.order)}" target="_blank">Ver recibo ↗</a></td><td>${ctx.badge(r.status)}${r.note ? `<small>${ctx.esc(r.note)} · ${ctx.esc(r.reviewer)}</small>` : ""}${ctx.model.user.role === "accounting" && r.status === "Pendiente" ? `<form data-action="candy_void_review" data-id="${r.id}" data-branch="${ctx.esc(r.branch)}" class="compact"><label>Decisión<select name="status"><option value="">Selecciona…</option><option>Aprobado</option><option>Rechazado</option></select></label><label>¿Regresan los productos al inventario?<select name="restoreStock"><option value="">Selecciona…</option><option value="yes">Sí, productos recuperados</option><option value="no">No, productos entregados / consumidos</option></select></label><label>Motivo y devolución del cobro<input name="note" maxlength="300" required></label><button>Guardar resolución</button></form>` : ""}</td></tr>`;
			}))}</section>`;
		}
		function drawBasket() {
			if (ctx.$("#candyProgress")) ctx.$("#candyProgress").innerHTML = window.UniversalUI.steps([
				"Productos",
				"Cantidades",
				"Confirmación"
			], cart.length ? 1 : 0);
			if (ctx.$("#candyDock")) ctx.$("#candyDock").outerHTML = dockHTML();
			if (ctx.$("#candyBasket")) ctx.$("#candyBasket").innerHTML = basket();
			if (ctx.$("#candyProducts")) ctx.$("#candyProducts").innerHTML = productRows();
		}
		function add(id) {
			if (pending || working || locked()) return;
			const p = products().find((p) => p.id === id);
			if (!p) return;
			const r = cart.find((r) => r.item === id);
			if (p.available === false || (r?.quantity || 0) + 1 > (p.stock ?? 1e4)) {
				ctx.notify("No hay más existencias disponibles.");
				return;
			}
			if (r) r.quantity++;
			else cart.push({
				item: p.id,
				code: p.code,
				name: p.name,
				quantity: 1,
				unitPrice: p.price
			});
			drawBasket();
		}
		async function finish() {
			if (working) return;
			if (!pending) {
				if (locked() || !cart.length) return;
				pending = {
					action: "candy_checkout",
					branch: ctx.branch,
					requestId: crypto.randomUUID(),
					lines: cart.map((r) => ({ ...r }))
				};
				remember();
			}
			working = true;
			drawBasket();
			try {
				const response = await submitCandySale(ctx.transport, pending);
				const result = response.body;
				if (!response.ok) {
					if (response.status === 400) {
						pending = null;
						remember();
					}
					throw new Error(result.error || "No se pudo confirmar la venta.");
				}
				pending = null;
				remember();
				cart = [];
				creating = false;
				query = "";
				await ctx.refresh(true);
				ctx.notify("Venta registrada. Ya puedes imprimir el recibo desde el historial.");
			} catch (e) {
				ctx.notify(e.message, "error");
				if (!pending) {
					await ctx.refresh();
					cart = cart.map((r) => ({
						...r,
						unitPrice: products().find((p) => p.id === r.item)?.price ?? r.unitPrice
					}));
				}
			} finally {
				working = false;
				drawBasket();
			}
		}
		ctx.$("#root").addEventListener("click", (e) => {
			const b = e.target.closest("button");
			if (!b) return;
			if (b.dataset.candyCart) {
				ctx.$("#candyBasket")?.scrollIntoView({
					behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
					block: "start"
				});
				ctx.$("#candyBasket")?.focus({ preventScroll: true });
				return;
			}
			if (b.dataset.candyResetFilters) {
				historyDate = "";
				historySeller = "";
				historyStatus = "all";
				ctx.refreshView();
				return;
			}
			if (b.dataset.candyNew) {
				creating = true;
				ctx.refreshView();
				ctx.$("#candySearch")?.focus();
			}
			if (b.dataset.candyCancel) {
				if (cart.length && !confirm("¿Descartar la venta en preparación?")) return;
				creating = false;
				cart = [];
				query = "";
				ctx.refreshView();
			}
			if (b.dataset.candyView) {
				group = b.dataset.candyView === "all";
				historySeller = "";
				ctx.refreshView();
			}
			if (b.dataset.candyAdd) add(b.dataset.candyAdd);
			if (b.dataset.candyRemove && !pending) {
				cart = cart.filter((r) => r.item !== b.dataset.candyRemove);
				drawBasket();
			}
			if (b.dataset.candyFinish) finish();
			if (b.dataset.candyVoid) {
				const d = document.createElement("dialog");
				d.className = "cash-dialog";
				d.innerHTML = `<h2>Solicitar anulación de venta</h2><p class="muted">Contabilidad revisará el error. La venta seguirá vigente hasta que se apruebe su anulación.</p><form data-action="candy_void_request" data-id="${ctx.esc(b.dataset.candyVoid)}" data-branch="${ctx.esc(ctx.branch)}">${ctx.field("Explica el error", "reason", "text", "", "maxlength=\"300\"")}<div class="actions"><button type="button" data-cash-dismiss="yes">Cancelar</button><button class="primary">Enviar solicitud</button></div></form>`;
				ctx.$("#root").append(d);
				d.showModal();
				d.addEventListener("close", () => d.remove());
			}
		});
		ctx.$("#root").addEventListener("input", (e) => {
			if (e.target.id === "candySearch") {
				query = e.target.value;
				ctx.$("#candyProducts").innerHTML = productRows();
			}
		});
		ctx.$("#root").addEventListener("change", (e) => {
			if (e.target.id === "candyHistoryDate") {
				historyDate = e.target.value;
				ctx.refreshView();
			}
			if (e.target.id === "candyHistorySeller") {
				historySeller = e.target.value;
				ctx.refreshView();
			}
			if (e.target.id === "candyHistoryStatus") {
				historyStatus = e.target.value;
				ctx.refreshView();
			}
			if (e.target.dataset.candyQty && !pending) {
				const r = cart.find((r) => r.item === e.target.dataset.candyQty);
				const p = products().find((p) => p.id === r?.item), n = Number(e.target.value);
				if (r && Number.isInteger(n) && n > 0 && n <= Math.min(1e4, p?.stock ?? (p?.available ? 1e4 : 0))) r.quantity = n;
				else ctx.notify("Ingresa una cantidad entera dentro de las existencias disponibles.");
				drawBasket();
			}
		});
		ctx.$("#root").addEventListener("keydown", (e) => {
			if (e.target.id === "candySearch" && e.key === "Enter") {
				e.preventDefault();
				const p = products().find((p) => p.code.toLocaleLowerCase() === query.trim().toLocaleLowerCase()) || (matches().length === 1 ? matches()[0] : null);
				if (p) add(p.id);
				else ctx.notify("Selecciona uno de los productos encontrados.");
			}
		});
		controller = {
			render,
			requests,
			editing: () => ctx.model?.user.role === "candy" && ctx.page === "pos" && creating,
			reset: () => {
				owner = "";
				group = false;
				creating = false;
				cart = [];
				query = "";
				pending = null;
			}
		};
		return controller;
	}

//#endregion
//#region src/modules/payroll/presentation.js
/** UI dependencies: $, badge, branch, branchHint, empty, esc, field, model, money, refreshView, specific, table, uiDialogButton. Local basket state stays inside this factory. */
	function createPayrollController(ctx) {
		let controller;
		let tab = "imports";
		const rows = (key) => (ctx.model.state[key] || []).filter((r) => ctx.branch === "Todas" || r.branch === ctx.branch);
		const month = () => ctx.model.today.slice(0, 7);
		const panel = (title, body) => `<section class="panel"><h2>${title}</h2>${body}</section>`;
		const form = (action, body, row) => `<form data-action="${action}" class="form-grid" ${row ? `data-id="${row.id}" data-branch="${ctx.esc(row.branch)}"` : ""}>${body}</form>`;
		const removeButton = (kind, row, label = "Borrar") => `<form class="compact" data-action="payroll_delete" data-id="${row.id}" data-branch="${ctx.esc(row.branch)}"><input type="hidden" name="kind" value="${kind}"><button class="danger" type="submit">${label}</button></form>`;
		const weekdays = [
			"Lunes",
			"Martes",
			"Miércoles",
			"Jueves",
			"Viernes",
			"Sábado",
			"Domingo"
		];
		function lateFields(e) {
			const p = e?.latePolicy;
			return `<fieldset class="payroll-people payroll-lateness"><legend>Descuento por atrasos</legend><label>Aplicar descuentos<select name="lateEnabled"><option value="no" ${p?.enabled ? "" : "selected"}>No</option><option value="yes" ${p?.enabled ? "selected" : ""}>Sí</option></select></label><label>Hora de entrada<input type="time" name="shiftStart" value="${p?.start || "13:30"}"></label><label>Horas de jornada<input type="number" name="shiftHours" min="0.01" max="16" step="0.01" value="${p?.hours || 8}"></label><p class="muted small">Se usa la primera entrada válida del día. Solo se aplica el nivel más alto alcanzado, sin sumar niveles. El último nivel descuenta la jornada completa.</p>${[
				1,
				2,
				3
			].map((n) => {
				const t = p?.tiers?.[n - 1];
				return `<label>Nivel ${n}: minutos de atraso<input name="lateMinutes${n}" type="number" min="0" max="720" step="1" value="${t?.minutes ?? [
					5,
					10,
					30
				][n - 1]}"></label><label>Se aplica cuando<select name="lateCompare${n}"><option value="gt" ${(t?.comparison || [
					"gt",
					"gte",
					"gt"
				][n - 1]) === "gt" ? "selected" : ""}>Supera esos minutos (&gt;)</option><option value="gte" ${(t?.comparison || [
					"gt",
					"gte",
					"gt"
				][n - 1]) === "gte" ? "selected" : ""}>Alcanza esos minutos (≥)</option></select></label>${n < 3 ? `<label>Horas a descontar · nivel ${n}<input type="number" name="lateHours${n}" min="0.01" max="16" step="0.01" value="${t?.hours ?? [1, 3][n - 1]}"></label>` : "<p class=\"muted\">Nivel 3: descuento de un día completo.</p>"}`;
			}).join("")}</fieldset>`;
		}
		function employeeForm(e) {
			return form("payroll_employee", `${ctx.field("Código del biométrico", "code", "text", e?.code || "", "maxlength=\"80\"")}${ctx.field("Nombre completo", "name", "text", e?.name || "", "maxlength=\"120\"")}${ctx.field("Rol / cargo", "role", "text", e?.role || "", "list=\"salaryRoles\" maxlength=\"80\"")}<label>Sueldo mensual BOB ${e ? "" : "(vacío: usar referencia del rol)"}<input type="number" name="salary" min="0.01" max="1000000" step="0.01" value="${e?.salary || ""}" ${e ? "required" : ""}></label><label>Correo del empleado (puede completarse después)<input type="email" name="email" value="${ctx.esc(e?.email || "")}" maxlength="254"></label><label>Descanso semanal fijo<select name="restWeekday" required><option value="">Selecciona un día…</option>${weekdays.map((name, i) => `<option value="${i}" ${e?.restWeekday === i ? "selected" : ""}>${name}</option>`).join("")}</select></label><label>Estado<select name="active"><option value="yes" ${e?.active === false ? "" : "selected"}>Activo</option><option value="no" ${e?.active === false ? "selected" : ""}>Inactivo</option></select></label>${lateFields(e)}<button class="primary">${e ? "Guardar empleado" : "Registrar empleado"}</button>`, e);
		}
		function employees() {
			const roles = rows("payrollRoles"), people = rows("payrollEmployees");
			const reference = `<p class="muted">Se utiliza al registrar un empleado sin sueldo propio. Cambiar la referencia no modifica los sueldos ya asignados.</p>${form("payroll_role", `${ctx.field("Rol / cargo", "role", "text", "", "list=\"salaryRoles\" maxlength=\"80\"")}${ctx.field("Sueldo mensual · BOB", "salary", "number", "", "min=\"0.01\" step=\"0.01\" max=\"1000000\"")}<button class="primary">Guardar referencia</button>`)}`;
			return `<datalist id="salaryRoles">${[.../* @__PURE__ */ new Set([
				...roles.map((r) => r.role),
				"Boletería",
				"Candy bar",
				"Administración",
				"Contabilidad",
				"Gerencia",
				"Limpieza",
				"Proyección"
			])].map((r) => `<option value="${ctx.esc(r)}">`).join("")}</datalist><section class="panel"><div class="panel-head"><div><p class="eyebrow">CONFIGURACIÓN DEL EQUIPO</p><h2>Empleados y sueldos</h2><small>${people.filter((e) => e.active).length} activos · ${ctx.esc(ctx.branch)}</small></div>${ctx.uiDialogButton("payrollNewEmployee", "Registrar empleado", employeeForm(), "＋ Nuevo empleado", true)}</div><p class="muted small">El código debe coincidir con el biométrico. Conserva los ceros iniciales si el equipo los utiliza.</p><label class="search-field payroll-search">Buscar empleado<input type="search" data-filter-table="payrollEmployeeList" placeholder="Nombre, código o cargo…"></label><div id="payrollEmployeeList">${ctx.table([
				"Empleado",
				"Rol / descanso",
				"Sueldo mensual",
				"Acciones"
			], people.map((e) => `<tr><td><strong>${ctx.esc(e.name)}</strong><small>${ctx.esc(e.code)} · ${e.active ? "Activo" : "Inactivo"}</small></td><td>${ctx.esc(e.role)}<small>Descansa: ${weekdays[e.restWeekday] || "Sin configurar"}</small></td><td>${ctx.money(e.salary)}</td><td>${ctx.uiDialogButton("employee-" + e.id, e.name, employeeForm(e) + removeButton("employee", e, "Borrar empleado"), "Editar empleado")}</td></tr>`))}</div></section><details class="panel secondary-panel"><summary><span>Sueldos de referencia por rol<small>Valores para el registro de nuevos empleados</small></span><span>Configurar</span></summary><div class="reference-toolbar">${ctx.uiDialogButton("salaryReference", "Sueldo de referencia", reference, "＋ Añadir referencia")}</div>${ctx.table([
				"Rol",
				"Sueldo mensual",
				"Acciones"
			], roles.map((r) => `<tr><td>${ctx.esc(r.role)}</td><td>${ctx.money(r.salary)}</td><td>${removeButton("role", r, "Borrar referencia")}</td></tr>`))}</details>`;
		}
		function extras() {
			const people = rows("payrollEmployees").filter((e) => e.active);
			return `${ctx.specific() ? panel("Registrar extra", `<p class="muted">Selecciona el tipo de extra. El importe se suma una vez por empleado. Un día extra debe corresponder a su descanso semanal y tener entrada y salida válidas; así no se paga dos veces como jornada normal.</p>${form("payroll_extra", `<label>Tipo de extra<select name="extraType"><option value="special">Funciones especiales</option><option value="day">Días extras</option></select></label>${ctx.field("Mes de planilla", "month", "month", month())}${ctx.field("Fecha del extra", "date", "date", ctx.model.today)}${ctx.field("Descripción / motivo", "reason", "text", "", "maxlength=\"300\"")}${ctx.field("Importe para cada empleado · BOB", "amount", "number", "", "min=\"0.01\" step=\"0.01\" max=\"1000000\"")}<fieldset class="payroll-people"><legend>Empleados que recibirán el extra</legend>${people.map((e) => `<label><input type="checkbox" name="employees" value="${e.id}"><span>${ctx.esc(e.name)} <small>${ctx.esc(e.role)} · ${ctx.esc(e.code)}</small></span></label>`).join("") || "<p>Primero registra empleados activos.</p>"}</fieldset><button class="primary" ${people.length ? "" : "disabled"}>Registrar extra</button>`)}`) : ctx.branchHint()}${panel("Extras registrados", ctx.table([
				"Fecha / mes",
				"Tipo / motivo",
				"Importe por persona",
				"Beneficiarios",
				"Estado"
			], rows("payrollExtras").slice().reverse().map((x) => `<tr><td>${ctx.esc(x.date)}<small>${ctx.esc(x.branch)} · ${ctx.esc(x.month)}</small></td><td><strong>${x.extraType === "day" ? "Día extra" : "Función especial"}</strong><small>${ctx.esc(x.reason)}</small></td><td>${ctx.money(x.amount)}</td><td>${x.employees.map((id) => ctx.esc(rows("payrollEmployees").find((e) => e.id === id)?.name || id)).join("<br>")}<small>Total: ${ctx.money(x.amount * x.employees.length)}</small>${!rows("payrollRuns").some((r) => r.branch === x.branch && r.month === x.month) ? removeButton("extra", x, "Borrar extra") : ""}</td><td>${ctx.badge(x.voided ? "Anulado" : "Vigente")}${x.voided ? `<small>${ctx.esc(x.voidReason)}</small>` : rows("payrollRuns").some((r) => r.branch === x.branch && r.month === x.month && r.status === "Validada") ? "<small>Incluido en planilla validada</small>" : `<form class="compact" data-action="payroll_extra_void" data-id="${x.id}" data-branch="${ctx.esc(x.branch)}"><input name="reason" placeholder="Motivo de anulación" maxlength="300" required><button>Anular extra</button></form>`}</td></tr>`)))}`;
		}
		function mapping(source) {
			const choose = (label, key, rx) => {
				const guess = source.mapping?.[key] ?? source.headers.findIndex((h) => rx.test(h));
				return `<label>${label}<select name="${key}" required><option value="">Selecciona columna…</option>${source.headers.map((h, i) => `<option value="${i}" ${String(guess) === String(i) ? "selected" : ""}>${i + 1}. ${ctx.esc(h)}</option>`).join("")}</select></label>`;
			};
			return form("payroll_calculate", `${choose("Código de empleado", "code", /c[oó]d|id.*emp|usuario|pin/i)}${choose("Fecha", "date", /fecha|date/i)}${choose("Entrada", "entry", /entrada|entry|check.?in/i)}${choose("Salida", "exit", /salida|exit|check.?out/i)}<label>Formato de fecha de texto<select name="format"><option value="DMY" ${source.mapping?.format === "MDY" ? "" : "selected"}>Día / mes / año</option><option value="MDY" ${source.mapping?.format === "MDY" ? "selected" : ""}>Mes / día / año</option></select></label><button class="primary">Calcular borrador de planilla →</button>`, source);
		}
		function imports() {
			const last = new Date(Number(month().slice(0, 4)), Number(month().slice(5)), 0).getDate();
			return `${ctx.specific() ? panel("1. Importa el biométrico", `<p class="muted">Importa el mes completo con cabecera y columnas separadas de código, fecha, entrada y salida. Excel .xlsx, CSV, TXT o TSV; hasta 2 MB. Se conserva el archivo leído como registros originales.</p>${form("payroll_import", `${ctx.field("Primer día del mes", "start", "date", month() + "-01")}${ctx.field("Último día del mes", "end", "date", month() + "-" + last)}<label class="biometric-upload">Archivo del biométrico<small>Selecciona tu Excel con las marcaciones del mes.</small><input type="file" name="biometric" accept=".xlsx,.csv,.txt,.tsv" required></label><button class="primary">Importar marcaciones</button>`)}`) : ctx.branchHint()}${panel("2. Asocia las columnas y calcula", rows("payrollImports").slice().reverse().map((r) => `<details class="trailer-editor"><summary><span>${ctx.esc(r.filename)} · ${ctx.esc(r.branch)}</span><span>${ctx.esc(r.start)} / ${ctx.esc(r.end)} · ${r.rows.length} registros</span></summary><p class="muted small">Asocia las cuatro columnas. Se admiten fechas y horas numéricas de Excel y turnos que terminan después de medianoche. Las jornadas de más de 16 horas se marcan para revisión.</p>${mapping(r)}${removeButton("import", r, "Borrar archivo biométrico")}${ctx.table(r.headers.map(ctx.esc), r.rows.slice(0, 15).map((row) => "<tr>" + r.headers.map((_, i) => "<td>" + ctx.esc(row[i] ?? "") + "</td>").join("") + "</tr>"))}<small>Vista previa de 15 filas; se procesa el archivo completo.</small><div class="actions"><button type="button" data-payroll-tab="runs">Ir a revisar la planilla →</button></div></details>`).join("") || ctx.empty("Todavía no hay archivos importados", "Importa el biométrico del mes para asociar sus columnas y preparar la planilla."))}`;
		}
		function runs() {
			return panel("Revisar y aprobar", `<details class="payroll-explainer"><summary>Cómo se calcula el sueldo</summary><div class="banner">Sueldo devengado = mensual × días laborables con entrada y salida válidas / días laborables del mes. El descanso semanal fijo no se descuenta. Se restan los descuentos configurados por atraso y se suman los extras. Valor hora = sueldo mensual / días laborables / horas de jornada. No se descuenta más de una jornada por día ni se acumulan los niveles. Un archivo incompleto genera una estimación incompleta; revisa las fechas y completa las marcaciones antes de validar.</div></details>${rows("payrollRuns").slice().reverse().map((r) => `<article class="payroll-run">${r.status === "Borrador" && !r.history?.length ? removeButton("run", r, "Borrar borrador") : ""}<div class="panel-head"><div><p class="eyebrow">PLANILLA MENSUAL</p><h2>${ctx.esc(r.month)}</h2>${ctx.badge(r.status)}${r.calculationVersion !== 3 ? "<p class=\"negative\">Cálculo anterior: revisa el descanso y los atrasos del empleado y recalcula desde Biométrico.</p>" : ""}</div><strong class="amount">${r.calculationVersion === 3 ? ctx.money(r.total) : "Recalcular"}</strong><a class="button" target="_blank" href="/api/payroll-report/${r.id}">Reporte de planilla ↗</a></div><div class="payroll-line-list">${r.lines.map((l) => `<details class="payroll-person-result"><summary><span><strong>${ctx.esc(l.name)}</strong><small>${ctx.esc(l.role)} · ${ctx.esc(l.code)}</small></span><span class="attendance-chip">${l.workedDays ?? l.days} / ${l.expectedDays ?? "—"} días</span><span class="person-total">${r.calculationVersion === 3 ? ctx.money(l.total) : "Recalcular"} <span aria-hidden="true">⌄</span></span></summary><div class="payroll-person-detail"><div class="payroll-breakdown"><div><small>Sueldo mensual</small><strong>${ctx.money(l.base)}</strong></div><div><small>Devengado</small><strong>${l.earnedBase === void 0 ? "Recalcular" : ctx.money(l.earnedBase)}</strong></div><div><small>Descuento por atrasos</small><strong class="${l.lateDeduction ? "negative" : ""}">${ctx.money(l.lateDeduction || 0)}</strong></div><div><small>Extras</small><strong>${ctx.money(l.extraTotal)}</strong></div></div><p class="muted small">${l.hours} horas registradas · ${l.restDates?.length ?? "—"} descansos · ${l.missingDates?.length ?? "—"} días sin marcación.</p><details><summary>Fechas sin marcación (${l.missingDates?.length ?? 0})</summary><p class="muted small">${(l.missingDates || []).map(ctx.esc).join(", ") || "No hay días pendientes."}</p></details><details><summary>Detalle de atrasos</summary>${(l.lateRows || []).map((x) => `<p class="muted small">${ctx.esc(x.date)} · entrada ${ctx.esc(x.entry)} · ${x.minutes} min → ${x.wholeDay ? "1 día" : x.hours + " h"} · ${ctx.money(x.amount)}</p>`).join("") || "<p class=\"muted small\">Sin descuentos por atraso.</p>"}</details><a class="button" target="_blank" href="/api/payroll-report/${r.id}?employee=${l.employee}">Ver reporte individual ↗</a></div></details>`).join("")}</div><p class="muted small">Fechas detectadas en el archivo: ${ctx.esc(r.sourceStart || "—")} / ${ctx.esc(r.sourceEnd || "—")}. Mes calculado: ${ctx.esc(r.month)}.</p>${r.unmatchedCodes?.length ? `<div class="banner warning">Códigos sin empleado activo: ${r.unmatchedCodes.map(ctx.esc).join(", ")}. Debes asociarlos antes de validar.</div>` : ""}<details ${r.issues.length ? "open" : ""}><summary>Incidencias para revisar: ${r.issues.length}</summary><p class="muted small">Una fila inválida o duplicada no acredita una jornada. Varias marcaciones válidas del mismo día cuentan como una jornada. Los días sin registro no se pagan en esta estimación hasta corregir el biométrico; no se califican automáticamente como faltas injustificadas.</p>${ctx.table(["Fila", "Observación"], r.issues.map((i) => `<tr><td>${ctx.esc(i.row)}</td><td>${ctx.esc(i.message)}</td></tr>`))}</details>${r.status === "Borrador" ? `<form class="form-grid payroll-approval" data-action="payroll_validate" data-id="${r.id}" data-branch="${ctx.esc(r.branch)}"><label class="payroll-check"><input type="checkbox" name="confirm" value="yes" required><span>Revisé empleados, importes e incidencias; autorizo esta planilla y su envío individual.</span></label><label class="payroll-check"><input type="checkbox" name="attendanceConfirmed" value="yes" required><span>El archivo cubre el mes completo y revisé los días sin marcación.</span></label>${ctx.field("Constancia de revisión / incidencias aceptadas", "note", "text", "", "maxlength=\"500\"")}<button class="primary">Validar planilla y preparar envío</button><p class="muted small">Solo se permite validar cuando el mes terminó. Una vez validada, los importes quedan bloqueados. Con el correo conectado, el envío será automático. Si aún no está conectado, quedará pendiente.</p></form>` : `<p class="muted small">Validada por ${ctx.esc(r.validatedBy)} · ${ctx.esc(r.validatedAt)}<br>${ctx.esc(r.validationNote)}</p>${rows("payrollMail").some((j) => j.run === r.id && [
				"Enviado",
				"Enviando",
				"Revisar envío"
			].includes(j.status)) ? "<p class=\"muted small\">Hay envíos realizados o inciertos; esta planilla se conserva sin cambios.</p>" : `<form data-action="payroll_reopen" data-id="${r.id}" data-branch="${ctx.esc(r.branch)}" class="inline-form">${ctx.field("Motivo de corrección", "reason", "text", "", "maxlength=\"500\"")}<button>Volver a borrador y cancelar correos pendientes</button></form>`}`}</article>`).join("") || ctx.empty("Calcula una planilla desde el biométrico")}`);
		}
		function mail() {
			return panel("Envío individual de reportes", `<div class="banner">${ctx.model.state.payrollMailConfigured ? "Conexión de correo configurada. Los reportes validados pendientes se envían automáticamente." : "Correo empresarial pendiente de conexión. Los reportes se guardan en espera; no se está enviando ningún correo."}</div><p class="muted">Cada envío contiene únicamente el reporte del empleado destinatario, como archivo imprimible. «Enviado» significa aceptado por el servidor de correo, no confirmación de lectura ni de pago.</p>${ctx.table([
				"Empleado / planilla",
				"Correo destinatario",
				"Estado",
				"Acción"
			], rows("payrollMail").slice().reverse().map((j) => `<tr><td>${ctx.esc(j.name)}<small>${ctx.esc(j.subject)}</small></td><td>${ctx.esc(j.recipient) || "Sin correo"}</td><td>${ctx.badge(j.status)}${j.error ? `<small>${ctx.esc(j.error)}</small>` : ""}</td><td>${[
				"Enviado",
				"Enviando",
				"Cancelado por corrección"
			].includes(j.status) ? ctx.esc(j.finishedAt || j.at) : `<form class="compact" data-action="payroll_mail_update" data-id="${j.id}" data-branch="${ctx.esc(j.branch)}"><label>Correo confirmado<input type="email" name="email" value="${ctx.esc(j.recipient)}" required></label>${j.status === "Revisar envío" ? "<label class=\"payroll-check\"><input type=\"checkbox\" name=\"retry\" value=\"yes\" required><span>Comprobé que no llegó el correo anterior.</span></label>" : ""}<button>Guardar / poner en espera</button></form>`}</td></tr>`))}<details><summary>Conexión del correo empresarial</summary><p class="muted small">La cuenta emisora y sus credenciales se configuran en el servidor, no se guardan en el navegador. Cuando la empresa tenga su correo, se habilitará la conexión segura y después el envío automático. El proveedor debe permitir SMTP autenticado con TLS. Cada intento queda registrado; un envío incierto necesita revisión antes de repetirse.</p></details>`);
		}
		controller = { render: () => `<div class="payroll-navigation"><div class="payroll-workflow" aria-label="Proceso de salarios">${[
			[
				"imports",
				"1",
				"Biométrico",
				"Importar y asociar"
			],
			[
				"runs",
				"2",
				"Revisar y aprobar",
				"Asistencia e importes"
			],
			[
				"mail",
				"3",
				"Correos",
				"Entrega de reportes"
			]
		].map(([id, step, label, help]) => `<button data-payroll-tab="${id}" class="${id === tab ? "active" : ""}" aria-pressed="${id === tab}"><span class="workflow-number">${step}</span><span><strong>${label}</strong><small>${help}</small></span></button>`).join("")}</div><div class="tabs payroll-settings">${[["extras", "Extras"], ["employees", "Empleados y configuración"]].map(([id, label]) => `<button data-payroll-tab="${id}" class="${id === tab ? "active" : ""}">${label}</button>`).join("")}</div></div>${{
			employees,
			extras,
			imports,
			runs,
			mail
		}[tab]()}` };
		ctx.$("#root").addEventListener("click", (e) => {
			const button = e.target.closest("[data-payroll-tab]");
			if (button) {
				tab = button.dataset.payrollTab;
				ctx.refreshView();
			}
		});
		return controller;
	}

//#endregion
//#region src/app/admin.js
	const demoMode = window.ERP_CONFIG?.production === false;
	const $ = (s) => document.querySelector(s);
	const esc = window.UniversalUI.escape;
	const money = (n) => new Intl.NumberFormat("es-BO", {
		style: "currency",
		currency: "BOB"
	}).format(n || 0);
	const roles = {
		manager: "Dueño / Gerencia",
		accounting: "Contabilidad",
		administrator: "Administración",
		ticketing: "Boletería",
		candy: "Candy bar"
	};
	const kinds = {
		candy: "Candy bar",
		vault: "Bóveda de Administración"
	};
	const menus = {
		manager: [
			"overview",
			"shows",
			"trailers",
			"inventory",
			"audits",
			"closures",
			"history"
		],
		accounting: [
			"overview",
			"payroll",
			"inventory",
			"reports",
			"audits",
			"closures",
			"history"
		],
		administrator: [
			"overview",
			"inventory",
			"reports",
			"closures",
			"history"
		],
		ticketing: ["pos", "closures"],
		candy: [
			"pos",
			"inventory",
			"closures"
		]
	};
	const titles = {
		payroll: "Salarios y biométrico",
		trailers: "Cartelera y tráileres",
		overview: "Panorama de operación",
		shows: "Programación de funciones",
		inventory: "Inventarios",
		reports: "Reportes de movimientos",
		audits: "Arqueos de inventario",
		closures: "Cierres de caja",
		history: "Historial de operaciones",
		pos: "Punto de venta"
	};
	let model;
	let page;
	let branch = "Todas";
	let kind = "candy";
	let selected = "";
	let selectedAudit = "";
	let lastState = "";
	let busy = false;
	let dirty = false;
	function notify(message, type = "success") {
		const notice = $("#notice");
		notice.innerHTML = `<span>${esc(message)}</span><button type="button" aria-label="Cerrar aviso" data-notice-dismiss>×</button>`;
		notice.dataset.type = type;
		notice.setAttribute("role", type === "error" ? "alert" : "status");
		notice.classList.add("visible");
		clearTimeout(notify.timer);
		notify.timer = setTimeout(() => notice.classList.remove("visible"), 6e3);
	}
	const uiBrand = () => `<a class="brand" href="index.html" aria-label="Multicine Universal · página pública"><img src="assets/logo-multicine-universal.png" alt=""><span>UNIVERSAL<small>CONTROL DE OPERACIONES</small></span></a>`;
	const uiIcons = {
		overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
		shows: "M4 5h16v16H4z M8 2v6 M16 2v6 M4 11h16",
		trailers: "M3 5h18v14H3z M10 9l5 3-5 3z",
		inventory: "M3 7l9-4 9 4-9 4z M3 7v10l9 4 9-4V7 M12 11v10",
		reports: "M6 3h12v18H6z M9 8h6 M9 12h6 M9 16h3",
		audits: "M8 5H4v16h16V5h-4 M8 3h8v4H8z M8 13l3 3 5-6",
		closures: "M3 6h18v14H3z M3 10h18 M15 15h3",
		history: "M4 6v5h5 M4 11a8 8 0 1 1 2 7 M12 7v5l3 2",
		payroll: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M18 8v6 M15 11h6",
		pos: "M3 7h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4z M15 7v12"
	};
	const uiIcon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${uiIcons[name] || uiIcons.overview}"/></svg>`;
	const pageHelp = {
		overview: "Lo que está pasando hoy en tu sucursal.",
		shows: "Organiza la semana, las salas y cada horario.",
		trailers: "Elige lo que verá el público en la web de esta sucursal.",
		inventory: "Consulta las existencias y registra los movimientos de tu área.",
		reports: "Revisa los movimientos antes de actualizar las existencias.",
		audits: "Compara el conteo físico con las existencias del sistema.",
		closures: "Revisa los movimientos, cuenta el efectivo y registra la entrega.",
		history: "Consulta quién registró cada operación y cuándo.",
		payroll: "Asistencia, extras y salarios del equipo.",
		pos: "Todo listo para atender la siguiente venta."
	};
	let scheduleWeek = "";
	let inventoryQuery = "";
	let inventoryStock = "all";
	function uiDialogButton(id, title, body, label, primary = false) {
		return `<button type="button" data-ui-dialog="${esc(id)}" data-dialog-title="${esc(title)}" class="${primary ? "primary" : ""}">${label}</button><template id="${esc(id)}">${body}</template>`;
	}
	function openUIDialog(button) {
		const source = document.getElementById(button.dataset.uiDialog);
		if (!source) return;
		const dialog = document.createElement("dialog");
		dialog.className = "cash-dialog editor-dialog";
		dialog.setAttribute("aria-labelledby", "editorTitle");
		dialog.innerHTML = `<div class="panel-head"><div><p class="eyebrow">${esc(branch)} · ${esc(roles[model.user.role])}</p><h2 id="editorTitle">${esc(button.dataset.dialogTitle)}</h2></div><button type="button" data-cash-dismiss="yes" aria-label="Cerrar ventana">✕</button></div>`;
		const body = document.createElement("div");
		body.className = "dialog-body";
		body.append(source.content.cloneNode(true));
		dialog.append(body);
		$("#root").append(dialog);
		dialog.showModal();
		schedulePreview();
		dialog.addEventListener("close", () => {
			dirty = false;
			dialog.remove();
			button.focus();
		});
	}
	const sessionClient = new SessionClient((url, init) => fetch(url, init), () => {
		model = null;
		login();
	});
	const api = (path, data) => sessionClient.request(path, data);
	function demoLoginOptions() {
		return `<details open><summary>Explorar las áreas de la demo</summary><p class="muted">Contraseña de prueba: <strong>Cine2026!</strong></p><div class="demo-accounts">${[
			[
				"gerencia",
				"Gerencia",
				"overview"
			],
			[
				"contabilidad",
				"Contabilidad",
				"payroll"
			],
			[
				"admin.potosi",
				"Administración",
				"inventory"
			],
			[
				"boleteria.potosi",
				"Boletería",
				"pos"
			],
			[
				"candy.potosi",
				"Candy bar",
				"closures"
			]
		].map(([u, label, icon]) => `<button data-account="${u}">${uiIcon(icon)}<span>${label}<small>${u}</small></span></button>`).join("")}</div><p class="muted small">Para otras sucursales usa .sucre o .oruro. Segundos vendedores: boleteria2 y candy2 por sucursal.</p></details><p class="demo-label">DEMO LOCAL · Tus datos de prueba se conservan.</p>`;
	}
	function login() {
		$("#root").innerHTML = `<main class="login" id="main-content" tabindex="-1"><section class="intro">${uiBrand()}<div class="intro-copy"><p class="eyebrow">EL CINE EMPIEZA CON TU EQUIPO</p><h1>Una gran experiencia.<br><em>Detrás de cada función.</em></h1><p>Ventas, personas y operación, conectadas en un espacio pensado para tu día a día.</p><div class="login-stats"><span><strong>03</strong>Sucursales</span><span><strong>05</strong>Áreas de trabajo</span></div></div><small class="muted">MULTICINE UNIVERSAL · CONTROL DE OPERACIONES</small></section><section class="login-card"><p class="eyebrow">BIENVENIDO</p><h2>Entra a tu espacio</h2><p class="muted">Usa tu cuenta para continuar con tu equipo.</p><form id="loginForm"><label>Usuario<input name="username" autocomplete="username" value="${demoMode ? "gerencia" : ""}" required></label><label>Contraseña<input name="password" type="password" autocomplete="current-password" value="${demoMode ? "Cine2026!" : ""}" required></label><button class="primary">Entrar al sistema →</button></form>${demoMode ? demoLoginOptions() : ""}</section></main>`;
	}
	const list = (collection) => model.state[collection].filter((x) => branch === "Todas" || x.branch === branch);
	const badge = (status) => `<span class="badge ${[
		"Confirmado",
		"Aprobado",
		"Finalizado",
		"Enviado",
		"Caja abierta",
		"Publicado"
	].includes(status) ? "good" : [
		"Observado",
		"En curso",
		"Pendiente",
		"Pendiente de envío"
	].includes(status) ? "warn" : [
		"Rechazado",
		"Anulado",
		"Error"
	].includes(status) ? "bad" : ""}">${esc(status)}</span>`;
	const empty = window.UniversalUI.empty;
	const table = window.UniversalUI.table;
	const field = (label, name, type = "text", value = "", extra = "") => `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra} required></label>`;
	const productOptions = () => list("products").filter((p) => p.kind === kind).map((p) => `<option value="${p.id}">${esc(p.code)} · ${esc(p.name)}</option>`).join("");
	const specific = () => branch !== "Todas";
	const branchHint = () => "<div class=\"banner\">Selecciona una sucursal en la parte superior para registrar operaciones.</div>";
	function branchChooser() {
		$("#root").innerHTML = `<main class="branch-chooser" id="main-content" tabindex="-1"><div class="chooser-top">${uiBrand()}<button id="logout">Cerrar sesión ↗</button></div><section><p class="eyebrow">${esc(roles[model.user.role])}</p><h1>Elige tu sucursal</h1><p class="muted">Un espacio para cada cine. ¿Dónde trabajarás hoy?</p><div class="branch-cards">${model.branches.map((b, i) => `<button data-enter-branch="${esc(b)}"><span class="branch-symbol">${uiIcon("inventory")}<small>0${i + 1}</small></span><strong>${esc(b)}</strong><span>Gestionar sucursal <b>→</b></span></button>`).join("")}</div><p class="muted small">Puedes cambiar de sucursal desde la cabecera cuando lo necesites.</p></section></main>`;
	}
	function resetBranchSelection(value) {
		scheduleWeek = "";
		inventoryQuery = "";
		inventoryStock = "all";
		branch = value;
		page = "overview";
		selected = "";
		selectedAudit = "";
		kind = "candy";
		refreshView();
		window.scrollTo(0, 0);
	}
	function render() {
		if (!model) return login();
		const user = model.user;
		if (page === "inventory" && !candyAuditVisible()) page = "pos";
		if (["manager", "accounting"].includes(user.role) && !model.branches.includes(branch)) return branchChooser();
		if (!menus[user.role].includes(page)) page = menus[user.role][0];
		const title = user.role === "candy" && page === "pos" ? "Ventas de Candy bar" : titles[page];
		$("#root").innerHTML = `<div class="shell"><aside id="workspaceNav"><div class="sidebar-top">${uiBrand()}<button id="menuToggle" aria-expanded="false" aria-controls="areaNav" aria-label="Abrir menú de áreas">☰</button></div><p class="nav-label">OPERACIONES</p><nav id="areaNav" aria-label="Áreas de trabajo">${menus[user.role].filter((p) => p !== "inventory" || candyAuditVisible()).map((p) => `<button data-page="${p}" class="${page === p ? "active" : ""}" ${page === p ? "aria-current=\"page\"" : ""}>${uiIcon(p)}<span>${user.role === "candy" && p === "pos" ? "Ventas de Candy bar" : titles[p]}</span></button>`).join("")}</nav><details class="profile-menu"><summary><span class="avatar">${user.id[0].toUpperCase()}</span><span><strong>${esc(user.id)}</strong><small>${roles[user.role]}</small></span><span class="profile-chevron">⌄</span></summary><div><a href="index.html?branch=${encodeURIComponent(branch)}" target="_blank" rel="noopener">Ver página del cine ↗</a><button class="logout" id="logout">Cerrar sesión ↗</button></div></details><small class="sidebar-note">MULTICINE UNIVERSAL${demoMode ? " · DEMO" : ""}</small></aside><main class="workspace" id="main-content" tabindex="-1"><header><div><p class="eyebrow">${roles[user.role].toUpperCase()}</p><h1 id="pageTitle" tabindex="-1">${title}</h1><p class="page-help">${pageHelp[page]}</p></div><div class="header-tools"><div class="active-branch"><small>SUCURSAL</small><strong>${esc(branch)}</strong>${["manager", "accounting"].includes(user.role) ? "<button id=\"changeBranch\">Cambiar ↗</button>" : ""}</div></div></header><div class="page-caption"><span id="connection" class="live">● Conectado · actualizado</span><span>${(/* @__PURE__ */ new Date(model.today + "T12:00")).toLocaleDateString("es-BO", {
			day: "numeric",
			month: "long",
			year: "numeric"
		})} · BOB</span></div><div id="content" data-view="${page}">${{
			overview,
			shows,
			trailers,
			inventory,
			reports,
			audits,
			closures,
			history,
			pos,
			payroll
		}[page]()}</div><footer>Universal Control <span>${demoMode ? "Entorno de prueba · Datos guardados en este equipo" : "Operación de sucursal · Acceso personal"}</span></footer></main></div>`;
		filterInventory();
	}
	const deleteButton = (type, item) => `<button type="button" class="danger" data-delete="${type}" data-id="${item.id}" data-branch="${item.branch}" data-title="${esc(item.title || item.name || "función")}">Borrar ${{
		room: "sala",
		movie: "película / banner",
		trailer: "tráiler",
		show: "función"
	}[type]}</button>`;
	function payroll() {
		return features.payrollUI ? features.payrollUI.render() : "Cargando salarios…";
	}
	function pos() {
		if (model.user.role === "candy" && features.candyPOS) return features.candyPOS.render();
		if (model.user.role === "ticketing" && features.ticketPOS) return features.ticketPOS.render();
		const candy = model.user.role === "candy", closed = cashClosed(), locked = candy && list("audits").some((a) => a.kind === "candy" && a.status === "En curso");
		const items = candy ? list("products").filter((p) => p.kind === "candy") : list("shows").filter((s) => s.date === model.today && !s.cancelled);
		const item = items.find((i) => i.id === selected), disabled = closed || locked;
		return `${closed ? openingPanel() : ""}${disabled ? `<div class="banner warning">${closed ? "Tu caja está cerrada. Abre una nueva caja para vender. Puedes seguir imprimiendo tus cierres." : "Arqueo en curso: ventas bloqueadas por Contabilidad. Se habilitarán al finalizar."}</div>` : ""}<div class="product-grid">${items.map((i) => `<button class="product ${selected === i.id ? "selected" : ""}" data-item="${i.id}" ${disabled ? "disabled" : ""}><span class="product-icon">${candy ? "C" : "▶"}</span><small>${candy ? "CANDY BAR" : esc(i.room) + " · " + i.time}</small><h2>${esc(candy ? i.name : i.title)}</h2><p>${candy ? i.stock + " " + esc(i.unit) + " disponibles" : model.state.availability[i.id] + " boletos disponibles"}</p><strong>${money(i.price)}</strong></button>`).join("") || empty("No hay funciones para hoy")}</div>${item ? `<section class="panel"><h2>${esc(candy ? item.name : item.title)}</h2><form data-action="sell"><input type="hidden" name="item" value="${item.id}">${field("Cantidad de " + (candy ? "productos" : "entradas"), "quantity", "number", 1, "min=\"1\" step=\"1\"" + (!candy ? ` max="${model.state.availability[item.id]}"` : ""))}${candy ? "" : "<p class=\"muted\">" + (item.seatsPerTicket === 2 ? "Miércoles 2×1: cada boleto ocupa dos butacas. " : "") + "Precio por boleto: " + money(item.price) + "</p>"}<div class="actions"><strong id="saleTotal">Total: ${money(item.price)}</strong><button class="primary" ${disabled ? "disabled" : ""}>Confirmar venta →</button></div></form></section>` : ""}<section class="panel"><h2>Mis ventas del día</h2>${table([
			"Hora",
			"Detalle",
			"Cantidad / butacas",
			"Total"
		], list("sales").filter((s) => s.day === model.today).slice().reverse().map((s) => `<tr><td>${s.at.slice(11, 19)}</td><td>${esc(s.label)}</td><td>${s.quantity}${s.seats.length ? " · " + s.seats.join(", ") : ""}</td><td>${money(s.total)}</td></tr>`))}</section>`;
	}
	function captureViewState() {
		return {
			details: [...document.querySelectorAll("#content details")].map((node) => node.open),
			filters: [...document.querySelectorAll("[data-filter-table]")].map((node) => [node.dataset.filterTable, node.value]),
			scroll: window.scrollY,
			menu: $("#workspaceNav")?.classList.contains("menu-open"),
			profile: $(".profile-menu")?.open
		};
	}
	function restoreViewState(state) {
		document.querySelectorAll("#content details").forEach((node, i) => node.open = !!state.details[i]);
		for (const [target, value] of state.filters) {
			const input = document.querySelector(`[data-filter-table="${target}"]`);
			if (input) {
				input.value = value;
				input.dispatchEvent(new Event("input", { bubbles: true }));
			}
		}
		if (state.menu) {
			$("#workspaceNav")?.classList.add("menu-open");
			$("#menuToggle")?.setAttribute("aria-expanded", "true");
		}
		if ($(".profile-menu")) $(".profile-menu").open = !!state.profile;
		window.scrollTo(0, state.scroll);
	}
	function refreshView() {
		dirty = false;
		render();
		calculate();
		schedulePreview();
	}
	async function refresh(force = false) {
		try {
			if (force) sessionClient.invalidate();
			const next = await api("state");
			if (!next) {
				if ($("#connection")) $("#connection").textContent = "● Conectado · actualizado";
				return;
			}
			const signature = JSON.stringify(next), change = signature !== lastState, changedUser = model?.user?.id !== next.user.id;
			model = next;
			if (page === "inventory" && !candyAuditVisible()) {
				page = "pos";
				force = true;
			}
			if (!page || changedUser) {
				features.ticketPOS?.reset();
				features.candyPOS?.reset();
				page = menus[model.user.role][0];
				branch = ["manager", "accounting"].includes(model.user.role) ? "" : model.user.branch || "Todas";
				dirty = false;
				selected = "";
			}
			if (force || change) {
				if (model.user.role === "ticketing" && page === "pos" && !force && !changedUser) {
					lastState = signature;
					features.ticketPOS?.live();
					if ($("#connection")) $("#connection").textContent = "● Conectado · cada 2 s";
					return;
				}
				if (!force && !changedUser && features.candyPOS?.editing()) {
					if ($("#connection")) $("#connection").textContent = "● Conectado · venta en preparación";
					return;
				}
				if (!force && !changedUser && (dirty || document.querySelector("dialog[open]") || document.activeElement?.closest("form"))) {
					if ($("#connection")) $("#connection").textContent = "● Datos recibidos · editando";
					return;
				}
				const uiSnapshot = !force && !changedUser ? captureViewState() : null;
				lastState = signature;
				refreshView();
				if (uiSnapshot) restoreViewState(uiSnapshot);
				if (changedUser && ["candy", "ticketing"].includes(model.user.role) && cashClosed() && list("closures").slice().reverse().find((c) => c.user === model.user.id)?.day < model.today) showOpeningDialog();
			} else if ($("#connection")) $("#connection").textContent = "● Conectado · cada 2 s";
		} catch {
			if (model && $("#connection")) $("#connection").textContent = "● Sin conexión";
		}
	}
	const features = {};
	function viewPort(names) {
		return Object.defineProperties({}, Object.fromEntries(names.map((name) => [name, Object.getOwnPropertyDescriptor(context, name)])));
	}
	const context = {
		get transport() {
			return (url, init) => fetch(url, init);
		},
		get $() {
			return $;
		},
		get api() {
			return api;
		},
		get badge() {
			return badge;
		},
		get branch() {
			return branch;
		},
		set branch(value) {
			branch = value;
		},
		get branchHint() {
			return branchHint;
		},
		get cashClosed() {
			return cashClosed;
		},
		get deleteButton() {
			return deleteButton;
		},
		get empty() {
			return empty;
		},
		get esc() {
			return esc;
		},
		get candyRequests() {
			return () => features.candyPOS?.requests() || "";
		},
		get field() {
			return field;
		},
		get inventoryQuery() {
			return inventoryQuery;
		},
		set inventoryQuery(value) {
			inventoryQuery = value;
		},
		get inventoryStock() {
			return inventoryStock;
		},
		set inventoryStock(value) {
			inventoryStock = value;
		},
		get kind() {
			return kind;
		},
		set kind(value) {
			kind = value;
		},
		get kinds() {
			return kinds;
		},
		get list() {
			return list;
		},
		get menus() {
			return menus;
		},
		get model() {
			return model;
		},
		set model(value) {
			model = value;
		},
		get money() {
			return money;
		},
		get notify() {
			return notify;
		},
		get openingPanel() {
			return openingPanel;
		},
		get page() {
			return page;
		},
		set page(value) {
			page = value;
		},
		get productOptions() {
			return productOptions;
		},
		get refresh() {
			return refresh;
		},
		get refreshView() {
			return refreshView;
		},
		get roles() {
			return roles;
		},
		get scheduleWeek() {
			return scheduleWeek;
		},
		set scheduleWeek(value) {
			scheduleWeek = value;
		},
		get selectedAudit() {
			return selectedAudit;
		},
		set selectedAudit(value) {
			selectedAudit = value;
		},
		get specific() {
			return specific;
		},
		get table() {
			return table;
		},
		get uiDialogButton() {
			return uiDialogButton;
		}
	};
	const { shows, schedulePreview, verifyPoster, trailers } = createCatalogViews(viewPort([
		"$",
		"badge",
		"branch",
		"deleteButton",
		"empty",
		"esc",
		"field",
		"list",
		"model",
		"money",
		"scheduleWeek",
		"table",
		"uiDialogButton"
	]));
	const { inventory, reports, audits, calculate, filterInventory, auditFilter, candyAuditVisible } = createInventoryViews(viewPort([
		"$",
		"badge",
		"branchHint",
		"candyRequests",
		"empty",
		"esc",
		"field",
		"inventoryQuery",
		"inventoryStock",
		"kind",
		"kinds",
		"list",
		"model",
		"money",
		"productOptions",
		"selectedAudit",
		"specific",
		"table",
		"uiDialogButton"
	]));
	const { cashClosed, openingPanel, showOpeningDialog, openCashDialog, cashPreview, closures } = createCashViews(viewPort([
		"$",
		"badge",
		"branch",
		"esc",
		"field",
		"list",
		"model",
		"money",
		"roles",
		"table"
	]));
	const { overview, history } = createOperationsViews(viewPort([
		"badge",
		"branch",
		"empty",
		"esc",
		"list",
		"menus",
		"model",
		"money",
		"roles",
		"table"
	]));
	features.ticketPOS = createTicketingController(viewPort([
		"transport",
		"$",
		"api",
		"branch",
		"cashClosed",
		"esc",
		"list",
		"model",
		"money",
		"notify",
		"openingPanel",
		"page",
		"refresh",
		"refreshView",
		"table"
	]));
	features.candyPOS = createCandyController(viewPort([
		"transport",
		"$",
		"badge",
		"branch",
		"cashClosed",
		"esc",
		"field",
		"list",
		"model",
		"money",
		"notify",
		"openingPanel",
		"page",
		"refresh",
		"refreshView",
		"table"
	]));
	features.payrollUI = createPayrollController(viewPort([
		"$",
		"badge",
		"branch",
		"branchHint",
		"empty",
		"esc",
		"field",
		"model",
		"money",
		"refreshView",
		"specific",
		"table",
		"uiDialogButton"
	]));
	$("#root").addEventListener("click", async (event) => {
		const button = event.target.closest("button");
		if (!button) return;
		if (button.dataset.uiDialog) {
			openUIDialog(button);
			return;
		}
		if (button.id === "menuToggle") {
			const open = $("#workspaceNav").classList.toggle("menu-open");
			button.setAttribute("aria-expanded", String(open));
			button.setAttribute("aria-label", open ? "Cerrar menú de áreas" : "Abrir menú de áreas");
			return;
		}
		if (button.dataset.week) {
			const d = /* @__PURE__ */ new Date((scheduleWeek || model.today) + "T12:00");
			d.setDate(d.getDate() + Number(button.dataset.week || 0) * 7);
			scheduleWeek = button.dataset.week === "today" ? model.today : d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
			refreshView();
			return;
		}
		if (button.dataset.openCash) {
			showOpeningDialog();
			return;
		}
		if (button.dataset.cashDirection) {
			openCashDialog(button.dataset.cashDirection);
			return;
		}
		if (button.dataset.cashVoid) {
			openCashDialog("void", button.dataset.cashVoid, button.dataset.branch);
			return;
		}
		if (button.dataset.cashDismiss) {
			const dialog = button.closest("dialog");
			dirty = false;
			dialog.close();
			dialog.remove();
			return;
		}
		if (button.dataset.delete) {
			if (busy) return;
			const type = button.dataset.delete;
			if (!confirm("¿Borrar " + button.dataset.title + " de " + button.dataset.branch + "? Dejará de aparecer en las listas. Las funciones con ventas no se pueden borrar.")) return;
			try {
				busy = true;
				await api("action", {
					action: type + "_delete",
					id: button.dataset.id,
					branch: button.dataset.branch
				});
				try {
					localStorage.setItem("cinema-content-updated", String(Date.now()));
				} catch {}
				await refresh(true);
				notify("Registro retirado correctamente.");
			} catch (e) {
				notify(e.message, "error");
			} finally {
				busy = false;
			}
			return;
		}
		if (button.dataset.enterBranch && ["manager", "accounting"].includes(model?.user.role)) {
			if (model.branches.includes(button.dataset.enterBranch)) resetBranchSelection(button.dataset.enterBranch);
			return;
		}
		if (button.id === "changeBranch") {
			resetBranchSelection("");
			return;
		}
		if (button.dataset.account) {
			$("#loginForm [name=username]").value = button.dataset.account;
			$("#loginForm [name=password]").focus();
			document.querySelectorAll("[data-account]").forEach((b) => b.classList.toggle("selected", b === button));
			return;
		}
		if (button.dataset.page) {
			page = button.dataset.page;
			selected = "";
			refreshView();
			$("#pageTitle")?.focus({ preventScroll: true });
			window.scrollTo({ top: 0 });
			return;
		}
		if (button.dataset.kind) {
			kind = button.dataset.kind;
			refreshView();
			return;
		}
		if (button.dataset.item) {
			selected = button.dataset.item;
			refreshView();
			return;
		}
		if (button.id === "nextThursday") {
			const d = /* @__PURE__ */ new Date(model.today + "T12:00");
			d.setDate(d.getDate() + (4 - d.getDay() + 7) % 7);
			const f = button.closest("form");
			f.elements.date.value = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
			f.elements.days.value = "7";
			dirty = true;
			schedulePreview();
			return;
		}
		if (button.id === "logout") try {
			await api("logout", {});
			model = null;
			sessionClient.invalidate();
			lastState = "";
			page = null;
			selected = "";
			login();
		} catch (e) {
			notify(e.message, "error");
		}
	});
	$("#root").addEventListener("change", (e) => {
		if (e.target.id === "inventoryStock") {
			inventoryStock = e.target.value;
			filterInventory();
		}
		if (e.target.id === "auditPending" || e.target.classList.contains("count")) auditFilter();
		if (e.target.id === "branch") {
			branch = e.target.value;
			selectedAudit = "";
			refreshView();
		}
		if (e.target.id === "auditSelect") {
			selectedAudit = e.target.value;
			refreshView();
		}
	});
	$("#root").addEventListener("input", (e) => {
		if (e.target.id === "inventorySearch") {
			inventoryQuery = e.target.value;
			filterInventory();
		}
		if (e.target.dataset.filterTable) {
			const query = e.target.value.toLocaleLowerCase("es");
			document.querySelectorAll("#" + e.target.dataset.filterTable + " tbody tr").forEach((row) => row.hidden = !row.textContent.toLocaleLowerCase("es").includes(query));
		}
		e.target.removeAttribute("aria-invalid");
		e.target.parentElement?.querySelector(".field-error")?.remove();
		if (e.target.closest("form")) dirty = true;
		if (e.target.closest("[data-action=\"close\"]")) cashPreview();
		if (e.target.closest("[data-action=\"schedule\"]")) schedulePreview();
		if (e.target.classList.contains("count")) calculate();
		if (e.target.name === "quantity" && page === "pos") {
			const p = list(model.user.role === "ticketing" ? "shows" : "products").find((p) => p.id === selected);
			if (p && $("#saleTotal")) $("#saleTotal").textContent = "Total: " + money(p.price * Number(e.target.value));
		}
	});
	$("#root").addEventListener("submit", async (e) => {
		e.preventDefault();
		if (busy) return;
		const form = e.target;
		try {
			busy = true;
			form.querySelector(".form-error")?.remove();
			if (e.submitter) {
				e.submitter.disabled = true;
				e.submitter.setAttribute("aria-busy", "true");
			}
			if (form.id === "loginForm") {
				await api("login", Object.fromEntries(new FormData(form)));
				page = null;
				await refresh(true);
				return;
			}
			if (form.dataset.ticketForm || form.dataset.candyForm) return;
			const data = await prepareCommand(form, e.submitter, branch, kind, {
				confirm,
				notify,
				verifyPoster
			});
			if (!data) return;
			const result = await api("action", data);
			if (form.closest("dialog")) {
				const dialog = form.closest("dialog");
				dialog.close();
				dialog.remove();
			}
			if (result.audit) {
				selectedAudit = result.audit;
				const a = document.createElement("a");
				a.href = "/api/pdf/" + result.audit;
				a.download = "arqueo.pdf";
				document.body.append(a);
				a.click();
				a.remove();
			}
			try {
				localStorage.setItem("cinema-content-updated", String(Date.now()));
			} catch {}
			await refresh(true);
			notify(result.created ? `${result.created} funciones creadas y disponibles en boletería y cartelera.` : "Operación guardada correctamente.");
		} catch (error) {
			notify(error.message, "error");
			if (form.isConnected) {
				let message = form.querySelector(".form-error");
				if (!message) {
					message = document.createElement("p");
					message.className = "form-error";
					message.setAttribute("role", "alert");
					message.tabIndex = -1;
					form.prepend(message);
				}
				message.textContent = error.message;
				message.focus();
			}
		} finally {
			busy = false;
			if (e.submitter?.isConnected) {
				e.submitter.disabled = false;
				e.submitter.removeAttribute("aria-busy");
			}
		}
	});
	$("#root").addEventListener("invalid", (e) => {
		const input = e.target;
		input.setAttribute("aria-invalid", "true");
		if (input.parentElement.querySelector(".field-error")) return;
		const error = document.createElement("small");
		error.className = "field-error";
		error.textContent = input.validationMessage;
		input.parentElement.append(error);
	}, true);
	$("#root").addEventListener("keydown", (e) => {
		if (e.key === "Enter" && e.target.classList.contains("count")) {
			e.preventDefault();
			const inputs = [...document.querySelectorAll(".count:not(:disabled)")].filter((input) => !input.closest("tr").hidden), next = inputs[inputs.indexOf(e.target) + 1];
			next?.focus();
			next?.select();
		}
		if (e.key === "Escape" && $("#workspaceNav")?.classList.contains("menu-open")) {
			$("#workspaceNav").classList.remove("menu-open");
			$("#menuToggle")?.setAttribute("aria-expanded", "false");
			$("#menuToggle")?.setAttribute("aria-label", "Abrir menú de áreas");
			$("#menuToggle")?.focus();
		}
	});
	$("#notice").addEventListener("click", (event) => {
		if (event.target.closest("[data-notice-dismiss]")) {
			clearTimeout(notify.timer);
			$("#notice").classList.remove("visible");
		}
	});
	login();
	refresh();
	setInterval(() => {
		if (model && !busy) refresh();
	}, 2e3);

//#endregion
})();