#!/usr/bin/env node
var importMetaUrl = require("url").pathToFileURL(__filename).href;
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/semver/internal/constants.js
var require_constants = __commonJS({
  "node_modules/semver/internal/constants.js"(exports2, module2) {
    "use strict";
    var SEMVER_SPEC_VERSION = "2.0.0";
    var MAX_LENGTH = 256;
    var MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER || /* istanbul ignore next */
    9007199254740991;
    var MAX_SAFE_COMPONENT_LENGTH = 16;
    var MAX_SAFE_BUILD_LENGTH = MAX_LENGTH - 6;
    var RELEASE_TYPES = [
      "major",
      "premajor",
      "minor",
      "preminor",
      "patch",
      "prepatch",
      "prerelease"
    ];
    module2.exports = {
      MAX_LENGTH,
      MAX_SAFE_COMPONENT_LENGTH,
      MAX_SAFE_BUILD_LENGTH,
      MAX_SAFE_INTEGER,
      RELEASE_TYPES,
      SEMVER_SPEC_VERSION,
      FLAG_INCLUDE_PRERELEASE: 1,
      FLAG_LOOSE: 2
    };
  }
});

// node_modules/semver/internal/debug.js
var require_debug = __commonJS({
  "node_modules/semver/internal/debug.js"(exports2, module2) {
    "use strict";
    var debug = typeof process === "object" && process.env && process.env.NODE_DEBUG && /\bsemver\b/i.test(process.env.NODE_DEBUG) ? (...args2) => console.error("SEMVER", ...args2) : () => {
    };
    module2.exports = debug;
  }
});

// node_modules/semver/internal/re.js
var require_re = __commonJS({
  "node_modules/semver/internal/re.js"(exports2, module2) {
    "use strict";
    var {
      MAX_SAFE_COMPONENT_LENGTH,
      MAX_SAFE_BUILD_LENGTH,
      MAX_LENGTH
    } = require_constants();
    var debug = require_debug();
    exports2 = module2.exports = {};
    var re = exports2.re = [];
    var safeRe = exports2.safeRe = [];
    var src = exports2.src = [];
    var safeSrc = exports2.safeSrc = [];
    var t = exports2.t = {};
    var R = 0;
    var LETTERDASHNUMBER = "[a-zA-Z0-9-]";
    var safeRegexReplacements = [
      ["\\s", 1],
      ["\\d", MAX_LENGTH],
      [LETTERDASHNUMBER, MAX_SAFE_BUILD_LENGTH]
    ];
    var makeSafeRegex = (value) => {
      for (const [token, max] of safeRegexReplacements) {
        value = value.split(`${token}*`).join(`${token}{0,${max}}`).split(`${token}+`).join(`${token}{1,${max}}`);
      }
      return value;
    };
    var createToken = (name, value, isGlobal) => {
      const safe = makeSafeRegex(value);
      const index = R++;
      debug(name, index, value);
      t[name] = index;
      src[index] = value;
      safeSrc[index] = safe;
      re[index] = new RegExp(value, isGlobal ? "g" : void 0);
      safeRe[index] = new RegExp(safe, isGlobal ? "g" : void 0);
    };
    createToken("NUMERICIDENTIFIER", "0|[1-9]\\d*");
    createToken("NUMERICIDENTIFIERLOOSE", "\\d+");
    createToken("NONNUMERICIDENTIFIER", `\\d*[a-zA-Z-]${LETTERDASHNUMBER}*`);
    createToken("MAINVERSION", `(${src[t.NUMERICIDENTIFIER]})\\.(${src[t.NUMERICIDENTIFIER]})\\.(${src[t.NUMERICIDENTIFIER]})`);
    createToken("MAINVERSIONLOOSE", `(${src[t.NUMERICIDENTIFIERLOOSE]})\\.(${src[t.NUMERICIDENTIFIERLOOSE]})\\.(${src[t.NUMERICIDENTIFIERLOOSE]})`);
    createToken("PRERELEASEIDENTIFIER", `(?:${src[t.NONNUMERICIDENTIFIER]}|${src[t.NUMERICIDENTIFIER]})`);
    createToken("PRERELEASEIDENTIFIERLOOSE", `(?:${src[t.NONNUMERICIDENTIFIER]}|${src[t.NUMERICIDENTIFIERLOOSE]})`);
    createToken("PRERELEASE", `(?:-(${src[t.PRERELEASEIDENTIFIER]}(?:\\.${src[t.PRERELEASEIDENTIFIER]})*))`);
    createToken("PRERELEASELOOSE", `(?:-?(${src[t.PRERELEASEIDENTIFIERLOOSE]}(?:\\.${src[t.PRERELEASEIDENTIFIERLOOSE]})*))`);
    createToken("BUILDIDENTIFIER", `${LETTERDASHNUMBER}+`);
    createToken("BUILD", `(?:\\+(${src[t.BUILDIDENTIFIER]}(?:\\.${src[t.BUILDIDENTIFIER]})*))`);
    createToken("FULLPLAIN", `v?${src[t.MAINVERSION]}${src[t.PRERELEASE]}?${src[t.BUILD]}?`);
    createToken("FULL", `^${src[t.FULLPLAIN]}$`);
    createToken("LOOSEPLAIN", `[v=\\s]*${src[t.MAINVERSIONLOOSE]}${src[t.PRERELEASELOOSE]}?${src[t.BUILD]}?`);
    createToken("LOOSE", `^${src[t.LOOSEPLAIN]}$`);
    createToken("GTLT", "((?:<|>)?=?)");
    createToken("XRANGEIDENTIFIERLOOSE", `${src[t.NUMERICIDENTIFIERLOOSE]}|x|X|\\*`);
    createToken("XRANGEIDENTIFIER", `${src[t.NUMERICIDENTIFIER]}|x|X|\\*`);
    createToken("XRANGEPLAIN", `[v=\\s]*(${src[t.XRANGEIDENTIFIER]})(?:\\.(${src[t.XRANGEIDENTIFIER]})(?:\\.(${src[t.XRANGEIDENTIFIER]})(?:${src[t.PRERELEASE]})?${src[t.BUILD]}?)?)?`);
    createToken("XRANGEPLAINLOOSE", `[v=\\s]*(${src[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})(?:${src[t.PRERELEASELOOSE]})?${src[t.BUILD]}?)?)?`);
    createToken("XRANGE", `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAIN]}$`);
    createToken("XRANGELOOSE", `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("COERCEPLAIN", `${"(^|[^\\d])(\\d{1,"}${MAX_SAFE_COMPONENT_LENGTH}})(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?`);
    createToken("COERCE", `${src[t.COERCEPLAIN]}(?:$|[^\\d])`);
    createToken("COERCEFULL", src[t.COERCEPLAIN] + `(?:${src[t.PRERELEASE]})?(?:${src[t.BUILD]})?(?:$|[^\\d])`);
    createToken("COERCERTL", src[t.COERCE], true);
    createToken("COERCERTLFULL", src[t.COERCEFULL], true);
    createToken("LONETILDE", "(?:~>?)");
    createToken("TILDETRIM", `(\\s*)${src[t.LONETILDE]}\\s+`, true);
    exports2.tildeTrimReplace = "$1~";
    createToken("TILDE", `^${src[t.LONETILDE]}${src[t.XRANGEPLAIN]}$`);
    createToken("TILDELOOSE", `^${src[t.LONETILDE]}${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("LONECARET", "(?:\\^)");
    createToken("CARETTRIM", `(\\s*)${src[t.LONECARET]}\\s+`, true);
    exports2.caretTrimReplace = "$1^";
    createToken("CARET", `^${src[t.LONECARET]}${src[t.XRANGEPLAIN]}$`);
    createToken("CARETLOOSE", `^${src[t.LONECARET]}${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("COMPARATORLOOSE", `^${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]})$|^$`);
    createToken("COMPARATOR", `^${src[t.GTLT]}\\s*(${src[t.FULLPLAIN]})$|^$`);
    createToken("COMPARATORTRIM", `(\\s*)${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]}|${src[t.XRANGEPLAIN]})`, true);
    exports2.comparatorTrimReplace = "$1$2$3";
    createToken("HYPHENRANGE", `^\\s*(${src[t.XRANGEPLAIN]})\\s+-\\s+(${src[t.XRANGEPLAIN]})\\s*$`);
    createToken("HYPHENRANGELOOSE", `^\\s*(${src[t.XRANGEPLAINLOOSE]})\\s+-\\s+(${src[t.XRANGEPLAINLOOSE]})\\s*$`);
    createToken("STAR", "(<|>)?=?\\s*\\*");
    createToken("GTE0", "^\\s*>=\\s*0\\.0\\.0\\s*$");
    createToken("GTE0PRE", "^\\s*>=\\s*0\\.0\\.0-0\\s*$");
  }
});

// node_modules/semver/internal/parse-options.js
var require_parse_options = __commonJS({
  "node_modules/semver/internal/parse-options.js"(exports2, module2) {
    "use strict";
    var looseOption = Object.freeze({ loose: true });
    var emptyOpts = Object.freeze({});
    var parseOptions = (options) => {
      if (!options) {
        return emptyOpts;
      }
      if (typeof options !== "object") {
        return looseOption;
      }
      return options;
    };
    module2.exports = parseOptions;
  }
});

// node_modules/semver/internal/identifiers.js
var require_identifiers = __commonJS({
  "node_modules/semver/internal/identifiers.js"(exports2, module2) {
    "use strict";
    var numeric = /^[0-9]+$/;
    var compareIdentifiers = (a, b) => {
      if (typeof a === "number" && typeof b === "number") {
        return a === b ? 0 : a < b ? -1 : 1;
      }
      const anum = numeric.test(a);
      const bnum = numeric.test(b);
      if (anum && bnum) {
        a = +a;
        b = +b;
      }
      return a === b ? 0 : anum && !bnum ? -1 : bnum && !anum ? 1 : a < b ? -1 : 1;
    };
    var rcompareIdentifiers = (a, b) => compareIdentifiers(b, a);
    module2.exports = {
      compareIdentifiers,
      rcompareIdentifiers
    };
  }
});

// node_modules/semver/classes/semver.js
var require_semver = __commonJS({
  "node_modules/semver/classes/semver.js"(exports2, module2) {
    "use strict";
    var debug = require_debug();
    var { MAX_LENGTH, MAX_SAFE_INTEGER } = require_constants();
    var { safeRe: re, t } = require_re();
    var parseOptions = require_parse_options();
    var { compareIdentifiers } = require_identifiers();
    var SemVer = class _SemVer {
      constructor(version, options) {
        options = parseOptions(options);
        if (version instanceof _SemVer) {
          if (version.loose === !!options.loose && version.includePrerelease === !!options.includePrerelease) {
            return version;
          } else {
            version = version.version;
          }
        } else if (typeof version !== "string") {
          throw new TypeError(`Invalid version. Must be a string. Got type "${typeof version}".`);
        }
        if (version.length > MAX_LENGTH) {
          throw new TypeError(
            `version is longer than ${MAX_LENGTH} characters`
          );
        }
        debug("SemVer", version, options);
        this.options = options;
        this.loose = !!options.loose;
        this.includePrerelease = !!options.includePrerelease;
        const m = version.trim().match(options.loose ? re[t.LOOSE] : re[t.FULL]);
        if (!m) {
          throw new TypeError(`Invalid Version: ${version}`);
        }
        this.raw = version;
        this.major = +m[1];
        this.minor = +m[2];
        this.patch = +m[3];
        if (this.major > MAX_SAFE_INTEGER || this.major < 0) {
          throw new TypeError("Invalid major version");
        }
        if (this.minor > MAX_SAFE_INTEGER || this.minor < 0) {
          throw new TypeError("Invalid minor version");
        }
        if (this.patch > MAX_SAFE_INTEGER || this.patch < 0) {
          throw new TypeError("Invalid patch version");
        }
        if (!m[4]) {
          this.prerelease = [];
        } else {
          this.prerelease = m[4].split(".").map((id) => {
            if (/^[0-9]+$/.test(id)) {
              const num = +id;
              if (num >= 0 && num < MAX_SAFE_INTEGER) {
                return num;
              }
            }
            return id;
          });
        }
        this.build = m[5] ? m[5].split(".") : [];
        this.format();
      }
      format() {
        this.version = `${this.major}.${this.minor}.${this.patch}`;
        if (this.prerelease.length) {
          this.version += `-${this.prerelease.join(".")}`;
        }
        return this.version;
      }
      toString() {
        return this.version;
      }
      compare(other) {
        debug("SemVer.compare", this.version, this.options, other);
        if (!(other instanceof _SemVer)) {
          if (typeof other === "string" && other === this.version) {
            return 0;
          }
          other = new _SemVer(other, this.options);
        }
        if (other.version === this.version) {
          return 0;
        }
        return this.compareMain(other) || this.comparePre(other);
      }
      compareMain(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        if (this.major < other.major) {
          return -1;
        }
        if (this.major > other.major) {
          return 1;
        }
        if (this.minor < other.minor) {
          return -1;
        }
        if (this.minor > other.minor) {
          return 1;
        }
        if (this.patch < other.patch) {
          return -1;
        }
        if (this.patch > other.patch) {
          return 1;
        }
        return 0;
      }
      comparePre(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        if (this.prerelease.length && !other.prerelease.length) {
          return -1;
        } else if (!this.prerelease.length && other.prerelease.length) {
          return 1;
        } else if (!this.prerelease.length && !other.prerelease.length) {
          return 0;
        }
        let i = 0;
        do {
          const a = this.prerelease[i];
          const b = other.prerelease[i];
          debug("prerelease compare", i, a, b);
          if (a === void 0 && b === void 0) {
            return 0;
          } else if (b === void 0) {
            return 1;
          } else if (a === void 0) {
            return -1;
          } else if (a === b) {
            continue;
          } else {
            return compareIdentifiers(a, b);
          }
        } while (++i);
      }
      compareBuild(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        let i = 0;
        do {
          const a = this.build[i];
          const b = other.build[i];
          debug("build compare", i, a, b);
          if (a === void 0 && b === void 0) {
            return 0;
          } else if (b === void 0) {
            return 1;
          } else if (a === void 0) {
            return -1;
          } else if (a === b) {
            continue;
          } else {
            return compareIdentifiers(a, b);
          }
        } while (++i);
      }
      // preminor will bump the version up to the next minor release, and immediately
      // down to pre-release. premajor and prepatch work the same way.
      inc(release, identifier, identifierBase) {
        if (release.startsWith("pre")) {
          if (!identifier && identifierBase === false) {
            throw new Error("invalid increment argument: identifier is empty");
          }
          if (identifier) {
            const match = `-${identifier}`.match(this.options.loose ? re[t.PRERELEASELOOSE] : re[t.PRERELEASE]);
            if (!match || match[1] !== identifier) {
              throw new Error(`invalid identifier: ${identifier}`);
            }
          }
        }
        switch (release) {
          case "premajor":
            this.prerelease.length = 0;
            this.patch = 0;
            this.minor = 0;
            this.major++;
            this.inc("pre", identifier, identifierBase);
            break;
          case "preminor":
            this.prerelease.length = 0;
            this.patch = 0;
            this.minor++;
            this.inc("pre", identifier, identifierBase);
            break;
          case "prepatch":
            this.prerelease.length = 0;
            this.inc("patch", identifier, identifierBase);
            this.inc("pre", identifier, identifierBase);
            break;
          case "prerelease":
            if (this.prerelease.length === 0) {
              this.inc("patch", identifier, identifierBase);
            }
            this.inc("pre", identifier, identifierBase);
            break;
          case "release":
            if (this.prerelease.length === 0) {
              throw new Error(`version ${this.raw} is not a prerelease`);
            }
            this.prerelease.length = 0;
            break;
          case "major":
            if (this.minor !== 0 || this.patch !== 0 || this.prerelease.length === 0) {
              this.major++;
            }
            this.minor = 0;
            this.patch = 0;
            this.prerelease = [];
            break;
          case "minor":
            if (this.patch !== 0 || this.prerelease.length === 0) {
              this.minor++;
            }
            this.patch = 0;
            this.prerelease = [];
            break;
          case "patch":
            if (this.prerelease.length === 0) {
              this.patch++;
            }
            this.prerelease = [];
            break;
          case "pre": {
            const base = Number(identifierBase) ? 1 : 0;
            if (this.prerelease.length === 0) {
              this.prerelease = [base];
            } else {
              let i = this.prerelease.length;
              while (--i >= 0) {
                if (typeof this.prerelease[i] === "number") {
                  this.prerelease[i]++;
                  i = -2;
                }
              }
              if (i === -1) {
                if (identifier === this.prerelease.join(".") && identifierBase === false) {
                  throw new Error("invalid increment argument: identifier already exists");
                }
                this.prerelease.push(base);
              }
            }
            if (identifier) {
              let prerelease = [identifier, base];
              if (identifierBase === false) {
                prerelease = [identifier];
              }
              if (compareIdentifiers(this.prerelease[0], identifier) === 0) {
                if (isNaN(this.prerelease[1])) {
                  this.prerelease = prerelease;
                }
              } else {
                this.prerelease = prerelease;
              }
            }
            break;
          }
          default:
            throw new Error(`invalid increment argument: ${release}`);
        }
        this.raw = this.format();
        if (this.build.length) {
          this.raw += `+${this.build.join(".")}`;
        }
        return this;
      }
    };
    module2.exports = SemVer;
  }
});

// node_modules/semver/functions/parse.js
var require_parse = __commonJS({
  "node_modules/semver/functions/parse.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var parse = (version, options, throwErrors = false) => {
      if (version instanceof SemVer) {
        return version;
      }
      try {
        return new SemVer(version, options);
      } catch (er) {
        if (!throwErrors) {
          return null;
        }
        throw er;
      }
    };
    module2.exports = parse;
  }
});

// node_modules/semver/functions/valid.js
var require_valid = __commonJS({
  "node_modules/semver/functions/valid.js"(exports2, module2) {
    "use strict";
    var parse = require_parse();
    var valid = (version, options) => {
      const v = parse(version, options);
      return v ? v.version : null;
    };
    module2.exports = valid;
  }
});

// node_modules/semver/functions/clean.js
var require_clean = __commonJS({
  "node_modules/semver/functions/clean.js"(exports2, module2) {
    "use strict";
    var parse = require_parse();
    var clean = (version, options) => {
      const s = parse(version.trim().replace(/^[=v]+/, ""), options);
      return s ? s.version : null;
    };
    module2.exports = clean;
  }
});

// node_modules/semver/functions/inc.js
var require_inc = __commonJS({
  "node_modules/semver/functions/inc.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var inc = (version, release, options, identifier, identifierBase) => {
      if (typeof options === "string") {
        identifierBase = identifier;
        identifier = options;
        options = void 0;
      }
      try {
        return new SemVer(
          version instanceof SemVer ? version.version : version,
          options
        ).inc(release, identifier, identifierBase).version;
      } catch (er) {
        return null;
      }
    };
    module2.exports = inc;
  }
});

// node_modules/semver/functions/diff.js
var require_diff = __commonJS({
  "node_modules/semver/functions/diff.js"(exports2, module2) {
    "use strict";
    var parse = require_parse();
    var diff = (version1, version2) => {
      const v1 = parse(version1, null, true);
      const v2 = parse(version2, null, true);
      const comparison = v1.compare(v2);
      if (comparison === 0) {
        return null;
      }
      const v1Higher = comparison > 0;
      const highVersion = v1Higher ? v1 : v2;
      const lowVersion = v1Higher ? v2 : v1;
      const highHasPre = !!highVersion.prerelease.length;
      const lowHasPre = !!lowVersion.prerelease.length;
      if (lowHasPre && !highHasPre) {
        if (!lowVersion.patch && !lowVersion.minor) {
          return "major";
        }
        if (lowVersion.compareMain(highVersion) === 0) {
          if (lowVersion.minor && !lowVersion.patch) {
            return "minor";
          }
          return "patch";
        }
      }
      const prefix = highHasPre ? "pre" : "";
      if (v1.major !== v2.major) {
        return prefix + "major";
      }
      if (v1.minor !== v2.minor) {
        return prefix + "minor";
      }
      if (v1.patch !== v2.patch) {
        return prefix + "patch";
      }
      return "prerelease";
    };
    module2.exports = diff;
  }
});

// node_modules/semver/functions/major.js
var require_major = __commonJS({
  "node_modules/semver/functions/major.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var major = (a, loose) => new SemVer(a, loose).major;
    module2.exports = major;
  }
});

// node_modules/semver/functions/minor.js
var require_minor = __commonJS({
  "node_modules/semver/functions/minor.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var minor = (a, loose) => new SemVer(a, loose).minor;
    module2.exports = minor;
  }
});

// node_modules/semver/functions/patch.js
var require_patch = __commonJS({
  "node_modules/semver/functions/patch.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var patch = (a, loose) => new SemVer(a, loose).patch;
    module2.exports = patch;
  }
});

// node_modules/semver/functions/prerelease.js
var require_prerelease = __commonJS({
  "node_modules/semver/functions/prerelease.js"(exports2, module2) {
    "use strict";
    var parse = require_parse();
    var prerelease = (version, options) => {
      const parsed = parse(version, options);
      return parsed && parsed.prerelease.length ? parsed.prerelease : null;
    };
    module2.exports = prerelease;
  }
});

// node_modules/semver/functions/compare.js
var require_compare = __commonJS({
  "node_modules/semver/functions/compare.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var compare = (a, b, loose) => new SemVer(a, loose).compare(new SemVer(b, loose));
    module2.exports = compare;
  }
});

// node_modules/semver/functions/rcompare.js
var require_rcompare = __commonJS({
  "node_modules/semver/functions/rcompare.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var rcompare = (a, b, loose) => compare(b, a, loose);
    module2.exports = rcompare;
  }
});

// node_modules/semver/functions/compare-loose.js
var require_compare_loose = __commonJS({
  "node_modules/semver/functions/compare-loose.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var compareLoose = (a, b) => compare(a, b, true);
    module2.exports = compareLoose;
  }
});

// node_modules/semver/functions/compare-build.js
var require_compare_build = __commonJS({
  "node_modules/semver/functions/compare-build.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var compareBuild = (a, b, loose) => {
      const versionA = new SemVer(a, loose);
      const versionB = new SemVer(b, loose);
      return versionA.compare(versionB) || versionA.compareBuild(versionB);
    };
    module2.exports = compareBuild;
  }
});

// node_modules/semver/functions/sort.js
var require_sort = __commonJS({
  "node_modules/semver/functions/sort.js"(exports2, module2) {
    "use strict";
    var compareBuild = require_compare_build();
    var sort = (list, loose) => list.sort((a, b) => compareBuild(a, b, loose));
    module2.exports = sort;
  }
});

// node_modules/semver/functions/rsort.js
var require_rsort = __commonJS({
  "node_modules/semver/functions/rsort.js"(exports2, module2) {
    "use strict";
    var compareBuild = require_compare_build();
    var rsort = (list, loose) => list.sort((a, b) => compareBuild(b, a, loose));
    module2.exports = rsort;
  }
});

// node_modules/semver/functions/gt.js
var require_gt = __commonJS({
  "node_modules/semver/functions/gt.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var gt = (a, b, loose) => compare(a, b, loose) > 0;
    module2.exports = gt;
  }
});

// node_modules/semver/functions/lt.js
var require_lt = __commonJS({
  "node_modules/semver/functions/lt.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var lt = (a, b, loose) => compare(a, b, loose) < 0;
    module2.exports = lt;
  }
});

// node_modules/semver/functions/eq.js
var require_eq = __commonJS({
  "node_modules/semver/functions/eq.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var eq = (a, b, loose) => compare(a, b, loose) === 0;
    module2.exports = eq;
  }
});

// node_modules/semver/functions/neq.js
var require_neq = __commonJS({
  "node_modules/semver/functions/neq.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var neq = (a, b, loose) => compare(a, b, loose) !== 0;
    module2.exports = neq;
  }
});

// node_modules/semver/functions/gte.js
var require_gte = __commonJS({
  "node_modules/semver/functions/gte.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var gte = (a, b, loose) => compare(a, b, loose) >= 0;
    module2.exports = gte;
  }
});

// node_modules/semver/functions/lte.js
var require_lte = __commonJS({
  "node_modules/semver/functions/lte.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var lte = (a, b, loose) => compare(a, b, loose) <= 0;
    module2.exports = lte;
  }
});

// node_modules/semver/functions/cmp.js
var require_cmp = __commonJS({
  "node_modules/semver/functions/cmp.js"(exports2, module2) {
    "use strict";
    var eq = require_eq();
    var neq = require_neq();
    var gt = require_gt();
    var gte = require_gte();
    var lt = require_lt();
    var lte = require_lte();
    var cmp = (a, op, b, loose) => {
      switch (op) {
        case "===":
          if (typeof a === "object") {
            a = a.version;
          }
          if (typeof b === "object") {
            b = b.version;
          }
          return a === b;
        case "!==":
          if (typeof a === "object") {
            a = a.version;
          }
          if (typeof b === "object") {
            b = b.version;
          }
          return a !== b;
        case "":
        case "=":
        case "==":
          return eq(a, b, loose);
        case "!=":
          return neq(a, b, loose);
        case ">":
          return gt(a, b, loose);
        case ">=":
          return gte(a, b, loose);
        case "<":
          return lt(a, b, loose);
        case "<=":
          return lte(a, b, loose);
        default:
          throw new TypeError(`Invalid operator: ${op}`);
      }
    };
    module2.exports = cmp;
  }
});

// node_modules/semver/functions/coerce.js
var require_coerce = __commonJS({
  "node_modules/semver/functions/coerce.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var parse = require_parse();
    var { safeRe: re, t } = require_re();
    var coerce = (version, options) => {
      if (version instanceof SemVer) {
        return version;
      }
      if (typeof version === "number") {
        version = String(version);
      }
      if (typeof version !== "string") {
        return null;
      }
      options = options || {};
      let match = null;
      if (!options.rtl) {
        match = version.match(options.includePrerelease ? re[t.COERCEFULL] : re[t.COERCE]);
      } else {
        const coerceRtlRegex = options.includePrerelease ? re[t.COERCERTLFULL] : re[t.COERCERTL];
        let next;
        while ((next = coerceRtlRegex.exec(version)) && (!match || match.index + match[0].length !== version.length)) {
          if (!match || next.index + next[0].length !== match.index + match[0].length) {
            match = next;
          }
          coerceRtlRegex.lastIndex = next.index + next[1].length + next[2].length;
        }
        coerceRtlRegex.lastIndex = -1;
      }
      if (match === null) {
        return null;
      }
      const major = match[2];
      const minor = match[3] || "0";
      const patch = match[4] || "0";
      const prerelease = options.includePrerelease && match[5] ? `-${match[5]}` : "";
      const build = options.includePrerelease && match[6] ? `+${match[6]}` : "";
      return parse(`${major}.${minor}.${patch}${prerelease}${build}`, options);
    };
    module2.exports = coerce;
  }
});

// node_modules/semver/internal/lrucache.js
var require_lrucache = __commonJS({
  "node_modules/semver/internal/lrucache.js"(exports2, module2) {
    "use strict";
    var LRUCache = class {
      constructor() {
        this.max = 1e3;
        this.map = /* @__PURE__ */ new Map();
      }
      get(key) {
        const value = this.map.get(key);
        if (value === void 0) {
          return void 0;
        } else {
          this.map.delete(key);
          this.map.set(key, value);
          return value;
        }
      }
      delete(key) {
        return this.map.delete(key);
      }
      set(key, value) {
        const deleted = this.delete(key);
        if (!deleted && value !== void 0) {
          if (this.map.size >= this.max) {
            const firstKey = this.map.keys().next().value;
            this.delete(firstKey);
          }
          this.map.set(key, value);
        }
        return this;
      }
    };
    module2.exports = LRUCache;
  }
});

// node_modules/semver/classes/range.js
var require_range = __commonJS({
  "node_modules/semver/classes/range.js"(exports2, module2) {
    "use strict";
    var SPACE_CHARACTERS = /\s+/g;
    var Range = class _Range {
      constructor(range, options) {
        options = parseOptions(options);
        if (range instanceof _Range) {
          if (range.loose === !!options.loose && range.includePrerelease === !!options.includePrerelease) {
            return range;
          } else {
            return new _Range(range.raw, options);
          }
        }
        if (range instanceof Comparator) {
          this.raw = range.value;
          this.set = [[range]];
          this.formatted = void 0;
          return this;
        }
        this.options = options;
        this.loose = !!options.loose;
        this.includePrerelease = !!options.includePrerelease;
        this.raw = range.trim().replace(SPACE_CHARACTERS, " ");
        this.set = this.raw.split("||").map((r) => this.parseRange(r.trim())).filter((c) => c.length);
        if (!this.set.length) {
          throw new TypeError(`Invalid SemVer Range: ${this.raw}`);
        }
        if (this.set.length > 1) {
          const first = this.set[0];
          this.set = this.set.filter((c) => !isNullSet(c[0]));
          if (this.set.length === 0) {
            this.set = [first];
          } else if (this.set.length > 1) {
            for (const c of this.set) {
              if (c.length === 1 && isAny(c[0])) {
                this.set = [c];
                break;
              }
            }
          }
        }
        this.formatted = void 0;
      }
      get range() {
        if (this.formatted === void 0) {
          this.formatted = "";
          for (let i = 0; i < this.set.length; i++) {
            if (i > 0) {
              this.formatted += "||";
            }
            const comps = this.set[i];
            for (let k = 0; k < comps.length; k++) {
              if (k > 0) {
                this.formatted += " ";
              }
              this.formatted += comps[k].toString().trim();
            }
          }
        }
        return this.formatted;
      }
      format() {
        return this.range;
      }
      toString() {
        return this.range;
      }
      parseRange(range) {
        const memoOpts = (this.options.includePrerelease && FLAG_INCLUDE_PRERELEASE) | (this.options.loose && FLAG_LOOSE);
        const memoKey = memoOpts + ":" + range;
        const cached = cache.get(memoKey);
        if (cached) {
          return cached;
        }
        const loose = this.options.loose;
        const hr = loose ? re[t.HYPHENRANGELOOSE] : re[t.HYPHENRANGE];
        range = range.replace(hr, hyphenReplace(this.options.includePrerelease));
        debug("hyphen replace", range);
        range = range.replace(re[t.COMPARATORTRIM], comparatorTrimReplace);
        debug("comparator trim", range);
        range = range.replace(re[t.TILDETRIM], tildeTrimReplace);
        debug("tilde trim", range);
        range = range.replace(re[t.CARETTRIM], caretTrimReplace);
        debug("caret trim", range);
        let rangeList = range.split(" ").map((comp) => parseComparator(comp, this.options)).join(" ").split(/\s+/).map((comp) => replaceGTE0(comp, this.options));
        if (loose) {
          rangeList = rangeList.filter((comp) => {
            debug("loose invalid filter", comp, this.options);
            return !!comp.match(re[t.COMPARATORLOOSE]);
          });
        }
        debug("range list", rangeList);
        const rangeMap = /* @__PURE__ */ new Map();
        const comparators = rangeList.map((comp) => new Comparator(comp, this.options));
        for (const comp of comparators) {
          if (isNullSet(comp)) {
            return [comp];
          }
          rangeMap.set(comp.value, comp);
        }
        if (rangeMap.size > 1 && rangeMap.has("")) {
          rangeMap.delete("");
        }
        const result = [...rangeMap.values()];
        cache.set(memoKey, result);
        return result;
      }
      intersects(range, options) {
        if (!(range instanceof _Range)) {
          throw new TypeError("a Range is required");
        }
        return this.set.some((thisComparators) => {
          return isSatisfiable(thisComparators, options) && range.set.some((rangeComparators) => {
            return isSatisfiable(rangeComparators, options) && thisComparators.every((thisComparator) => {
              return rangeComparators.every((rangeComparator) => {
                return thisComparator.intersects(rangeComparator, options);
              });
            });
          });
        });
      }
      // if ANY of the sets match ALL of its comparators, then pass
      test(version) {
        if (!version) {
          return false;
        }
        if (typeof version === "string") {
          try {
            version = new SemVer(version, this.options);
          } catch (er) {
            return false;
          }
        }
        for (let i = 0; i < this.set.length; i++) {
          if (testSet(this.set[i], version, this.options)) {
            return true;
          }
        }
        return false;
      }
    };
    module2.exports = Range;
    var LRU = require_lrucache();
    var cache = new LRU();
    var parseOptions = require_parse_options();
    var Comparator = require_comparator();
    var debug = require_debug();
    var SemVer = require_semver();
    var {
      safeRe: re,
      t,
      comparatorTrimReplace,
      tildeTrimReplace,
      caretTrimReplace
    } = require_re();
    var { FLAG_INCLUDE_PRERELEASE, FLAG_LOOSE } = require_constants();
    var isNullSet = (c) => c.value === "<0.0.0-0";
    var isAny = (c) => c.value === "";
    var isSatisfiable = (comparators, options) => {
      let result = true;
      const remainingComparators = comparators.slice();
      let testComparator = remainingComparators.pop();
      while (result && remainingComparators.length) {
        result = remainingComparators.every((otherComparator) => {
          return testComparator.intersects(otherComparator, options);
        });
        testComparator = remainingComparators.pop();
      }
      return result;
    };
    var parseComparator = (comp, options) => {
      comp = comp.replace(re[t.BUILD], "");
      debug("comp", comp, options);
      comp = replaceCarets(comp, options);
      debug("caret", comp);
      comp = replaceTildes(comp, options);
      debug("tildes", comp);
      comp = replaceXRanges(comp, options);
      debug("xrange", comp);
      comp = replaceStars(comp, options);
      debug("stars", comp);
      return comp;
    };
    var isX = (id) => !id || id.toLowerCase() === "x" || id === "*";
    var replaceTildes = (comp, options) => {
      return comp.trim().split(/\s+/).map((c) => replaceTilde(c, options)).join(" ");
    };
    var replaceTilde = (comp, options) => {
      const r = options.loose ? re[t.TILDELOOSE] : re[t.TILDE];
      return comp.replace(r, (_, M, m, p, pr) => {
        debug("tilde", comp, _, M, m, p, pr);
        let ret;
        if (isX(M)) {
          ret = "";
        } else if (isX(m)) {
          ret = `>=${M}.0.0 <${+M + 1}.0.0-0`;
        } else if (isX(p)) {
          ret = `>=${M}.${m}.0 <${M}.${+m + 1}.0-0`;
        } else if (pr) {
          debug("replaceTilde pr", pr);
          ret = `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
        } else {
          ret = `>=${M}.${m}.${p} <${M}.${+m + 1}.0-0`;
        }
        debug("tilde return", ret);
        return ret;
      });
    };
    var replaceCarets = (comp, options) => {
      return comp.trim().split(/\s+/).map((c) => replaceCaret(c, options)).join(" ");
    };
    var replaceCaret = (comp, options) => {
      debug("caret", comp, options);
      const r = options.loose ? re[t.CARETLOOSE] : re[t.CARET];
      const z = options.includePrerelease ? "-0" : "";
      return comp.replace(r, (_, M, m, p, pr) => {
        debug("caret", comp, _, M, m, p, pr);
        let ret;
        if (isX(M)) {
          ret = "";
        } else if (isX(m)) {
          ret = `>=${M}.0.0${z} <${+M + 1}.0.0-0`;
        } else if (isX(p)) {
          if (M === "0") {
            ret = `>=${M}.${m}.0${z} <${M}.${+m + 1}.0-0`;
          } else {
            ret = `>=${M}.${m}.0${z} <${+M + 1}.0.0-0`;
          }
        } else if (pr) {
          debug("replaceCaret pr", pr);
          if (M === "0") {
            if (m === "0") {
              ret = `>=${M}.${m}.${p}-${pr} <${M}.${m}.${+p + 1}-0`;
            } else {
              ret = `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
            }
          } else {
            ret = `>=${M}.${m}.${p}-${pr} <${+M + 1}.0.0-0`;
          }
        } else {
          debug("no pr");
          if (M === "0") {
            if (m === "0") {
              ret = `>=${M}.${m}.${p}${z} <${M}.${m}.${+p + 1}-0`;
            } else {
              ret = `>=${M}.${m}.${p}${z} <${M}.${+m + 1}.0-0`;
            }
          } else {
            ret = `>=${M}.${m}.${p} <${+M + 1}.0.0-0`;
          }
        }
        debug("caret return", ret);
        return ret;
      });
    };
    var replaceXRanges = (comp, options) => {
      debug("replaceXRanges", comp, options);
      return comp.split(/\s+/).map((c) => replaceXRange(c, options)).join(" ");
    };
    var replaceXRange = (comp, options) => {
      comp = comp.trim();
      const r = options.loose ? re[t.XRANGELOOSE] : re[t.XRANGE];
      return comp.replace(r, (ret, gtlt, M, m, p, pr) => {
        debug("xRange", comp, ret, gtlt, M, m, p, pr);
        const xM = isX(M);
        const xm = xM || isX(m);
        const xp = xm || isX(p);
        const anyX = xp;
        if (gtlt === "=" && anyX) {
          gtlt = "";
        }
        pr = options.includePrerelease ? "-0" : "";
        if (xM) {
          if (gtlt === ">" || gtlt === "<") {
            ret = "<0.0.0-0";
          } else {
            ret = "*";
          }
        } else if (gtlt && anyX) {
          if (xm) {
            m = 0;
          }
          p = 0;
          if (gtlt === ">") {
            gtlt = ">=";
            if (xm) {
              M = +M + 1;
              m = 0;
              p = 0;
            } else {
              m = +m + 1;
              p = 0;
            }
          } else if (gtlt === "<=") {
            gtlt = "<";
            if (xm) {
              M = +M + 1;
            } else {
              m = +m + 1;
            }
          }
          if (gtlt === "<") {
            pr = "-0";
          }
          ret = `${gtlt + M}.${m}.${p}${pr}`;
        } else if (xm) {
          ret = `>=${M}.0.0${pr} <${+M + 1}.0.0-0`;
        } else if (xp) {
          ret = `>=${M}.${m}.0${pr} <${M}.${+m + 1}.0-0`;
        }
        debug("xRange return", ret);
        return ret;
      });
    };
    var replaceStars = (comp, options) => {
      debug("replaceStars", comp, options);
      return comp.trim().replace(re[t.STAR], "");
    };
    var replaceGTE0 = (comp, options) => {
      debug("replaceGTE0", comp, options);
      return comp.trim().replace(re[options.includePrerelease ? t.GTE0PRE : t.GTE0], "");
    };
    var hyphenReplace = (incPr) => ($0, from, fM, fm, fp, fpr, fb, to, tM, tm, tp, tpr) => {
      if (isX(fM)) {
        from = "";
      } else if (isX(fm)) {
        from = `>=${fM}.0.0${incPr ? "-0" : ""}`;
      } else if (isX(fp)) {
        from = `>=${fM}.${fm}.0${incPr ? "-0" : ""}`;
      } else if (fpr) {
        from = `>=${from}`;
      } else {
        from = `>=${from}${incPr ? "-0" : ""}`;
      }
      if (isX(tM)) {
        to = "";
      } else if (isX(tm)) {
        to = `<${+tM + 1}.0.0-0`;
      } else if (isX(tp)) {
        to = `<${tM}.${+tm + 1}.0-0`;
      } else if (tpr) {
        to = `<=${tM}.${tm}.${tp}-${tpr}`;
      } else if (incPr) {
        to = `<${tM}.${tm}.${+tp + 1}-0`;
      } else {
        to = `<=${to}`;
      }
      return `${from} ${to}`.trim();
    };
    var testSet = (set, version, options) => {
      for (let i = 0; i < set.length; i++) {
        if (!set[i].test(version)) {
          return false;
        }
      }
      if (version.prerelease.length && !options.includePrerelease) {
        for (let i = 0; i < set.length; i++) {
          debug(set[i].semver);
          if (set[i].semver === Comparator.ANY) {
            continue;
          }
          if (set[i].semver.prerelease.length > 0) {
            const allowed = set[i].semver;
            if (allowed.major === version.major && allowed.minor === version.minor && allowed.patch === version.patch) {
              return true;
            }
          }
        }
        return false;
      }
      return true;
    };
  }
});

// node_modules/semver/classes/comparator.js
var require_comparator = __commonJS({
  "node_modules/semver/classes/comparator.js"(exports2, module2) {
    "use strict";
    var ANY = Symbol("SemVer ANY");
    var Comparator = class _Comparator {
      static get ANY() {
        return ANY;
      }
      constructor(comp, options) {
        options = parseOptions(options);
        if (comp instanceof _Comparator) {
          if (comp.loose === !!options.loose) {
            return comp;
          } else {
            comp = comp.value;
          }
        }
        comp = comp.trim().split(/\s+/).join(" ");
        debug("comparator", comp, options);
        this.options = options;
        this.loose = !!options.loose;
        this.parse(comp);
        if (this.semver === ANY) {
          this.value = "";
        } else {
          this.value = this.operator + this.semver.version;
        }
        debug("comp", this);
      }
      parse(comp) {
        const r = this.options.loose ? re[t.COMPARATORLOOSE] : re[t.COMPARATOR];
        const m = comp.match(r);
        if (!m) {
          throw new TypeError(`Invalid comparator: ${comp}`);
        }
        this.operator = m[1] !== void 0 ? m[1] : "";
        if (this.operator === "=") {
          this.operator = "";
        }
        if (!m[2]) {
          this.semver = ANY;
        } else {
          this.semver = new SemVer(m[2], this.options.loose);
        }
      }
      toString() {
        return this.value;
      }
      test(version) {
        debug("Comparator.test", version, this.options.loose);
        if (this.semver === ANY || version === ANY) {
          return true;
        }
        if (typeof version === "string") {
          try {
            version = new SemVer(version, this.options);
          } catch (er) {
            return false;
          }
        }
        return cmp(version, this.operator, this.semver, this.options);
      }
      intersects(comp, options) {
        if (!(comp instanceof _Comparator)) {
          throw new TypeError("a Comparator is required");
        }
        if (this.operator === "") {
          if (this.value === "") {
            return true;
          }
          return new Range(comp.value, options).test(this.value);
        } else if (comp.operator === "") {
          if (comp.value === "") {
            return true;
          }
          return new Range(this.value, options).test(comp.semver);
        }
        options = parseOptions(options);
        if (options.includePrerelease && (this.value === "<0.0.0-0" || comp.value === "<0.0.0-0")) {
          return false;
        }
        if (!options.includePrerelease && (this.value.startsWith("<0.0.0") || comp.value.startsWith("<0.0.0"))) {
          return false;
        }
        if (this.operator.startsWith(">") && comp.operator.startsWith(">")) {
          return true;
        }
        if (this.operator.startsWith("<") && comp.operator.startsWith("<")) {
          return true;
        }
        if (this.semver.version === comp.semver.version && this.operator.includes("=") && comp.operator.includes("=")) {
          return true;
        }
        if (cmp(this.semver, "<", comp.semver, options) && this.operator.startsWith(">") && comp.operator.startsWith("<")) {
          return true;
        }
        if (cmp(this.semver, ">", comp.semver, options) && this.operator.startsWith("<") && comp.operator.startsWith(">")) {
          return true;
        }
        return false;
      }
    };
    module2.exports = Comparator;
    var parseOptions = require_parse_options();
    var { safeRe: re, t } = require_re();
    var cmp = require_cmp();
    var debug = require_debug();
    var SemVer = require_semver();
    var Range = require_range();
  }
});

// node_modules/semver/functions/satisfies.js
var require_satisfies = __commonJS({
  "node_modules/semver/functions/satisfies.js"(exports2, module2) {
    "use strict";
    var Range = require_range();
    var satisfies = (version, range, options) => {
      try {
        range = new Range(range, options);
      } catch (er) {
        return false;
      }
      return range.test(version);
    };
    module2.exports = satisfies;
  }
});

// node_modules/semver/ranges/to-comparators.js
var require_to_comparators = __commonJS({
  "node_modules/semver/ranges/to-comparators.js"(exports2, module2) {
    "use strict";
    var Range = require_range();
    var toComparators = (range, options) => new Range(range, options).set.map((comp) => comp.map((c) => c.value).join(" ").trim().split(" "));
    module2.exports = toComparators;
  }
});

// node_modules/semver/ranges/max-satisfying.js
var require_max_satisfying = __commonJS({
  "node_modules/semver/ranges/max-satisfying.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var Range = require_range();
    var maxSatisfying = (versions, range, options) => {
      let max = null;
      let maxSV = null;
      let rangeObj = null;
      try {
        rangeObj = new Range(range, options);
      } catch (er) {
        return null;
      }
      versions.forEach((v) => {
        if (rangeObj.test(v)) {
          if (!max || maxSV.compare(v) === -1) {
            max = v;
            maxSV = new SemVer(max, options);
          }
        }
      });
      return max;
    };
    module2.exports = maxSatisfying;
  }
});

// node_modules/semver/ranges/min-satisfying.js
var require_min_satisfying = __commonJS({
  "node_modules/semver/ranges/min-satisfying.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var Range = require_range();
    var minSatisfying = (versions, range, options) => {
      let min = null;
      let minSV = null;
      let rangeObj = null;
      try {
        rangeObj = new Range(range, options);
      } catch (er) {
        return null;
      }
      versions.forEach((v) => {
        if (rangeObj.test(v)) {
          if (!min || minSV.compare(v) === 1) {
            min = v;
            minSV = new SemVer(min, options);
          }
        }
      });
      return min;
    };
    module2.exports = minSatisfying;
  }
});

// node_modules/semver/ranges/min-version.js
var require_min_version = __commonJS({
  "node_modules/semver/ranges/min-version.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var Range = require_range();
    var gt = require_gt();
    var minVersion = (range, loose) => {
      range = new Range(range, loose);
      let minver = new SemVer("0.0.0");
      if (range.test(minver)) {
        return minver;
      }
      minver = new SemVer("0.0.0-0");
      if (range.test(minver)) {
        return minver;
      }
      minver = null;
      for (let i = 0; i < range.set.length; ++i) {
        const comparators = range.set[i];
        let setMin = null;
        comparators.forEach((comparator) => {
          const compver = new SemVer(comparator.semver.version);
          switch (comparator.operator) {
            case ">":
              if (compver.prerelease.length === 0) {
                compver.patch++;
              } else {
                compver.prerelease.push(0);
              }
              compver.raw = compver.format();
            case "":
            case ">=":
              if (!setMin || gt(compver, setMin)) {
                setMin = compver;
              }
              break;
            case "<":
            case "<=":
              break;
            default:
              throw new Error(`Unexpected operation: ${comparator.operator}`);
          }
        });
        if (setMin && (!minver || gt(minver, setMin))) {
          minver = setMin;
        }
      }
      if (minver && range.test(minver)) {
        return minver;
      }
      return null;
    };
    module2.exports = minVersion;
  }
});

// node_modules/semver/ranges/valid.js
var require_valid2 = __commonJS({
  "node_modules/semver/ranges/valid.js"(exports2, module2) {
    "use strict";
    var Range = require_range();
    var validRange = (range, options) => {
      try {
        return new Range(range, options).range || "*";
      } catch (er) {
        return null;
      }
    };
    module2.exports = validRange;
  }
});

// node_modules/semver/ranges/outside.js
var require_outside = __commonJS({
  "node_modules/semver/ranges/outside.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var Comparator = require_comparator();
    var { ANY } = Comparator;
    var Range = require_range();
    var satisfies = require_satisfies();
    var gt = require_gt();
    var lt = require_lt();
    var lte = require_lte();
    var gte = require_gte();
    var outside = (version, range, hilo, options) => {
      version = new SemVer(version, options);
      range = new Range(range, options);
      let gtfn, ltefn, ltfn, comp, ecomp;
      switch (hilo) {
        case ">":
          gtfn = gt;
          ltefn = lte;
          ltfn = lt;
          comp = ">";
          ecomp = ">=";
          break;
        case "<":
          gtfn = lt;
          ltefn = gte;
          ltfn = gt;
          comp = "<";
          ecomp = "<=";
          break;
        default:
          throw new TypeError('Must provide a hilo val of "<" or ">"');
      }
      if (satisfies(version, range, options)) {
        return false;
      }
      for (let i = 0; i < range.set.length; ++i) {
        const comparators = range.set[i];
        let high = null;
        let low = null;
        comparators.forEach((comparator) => {
          if (comparator.semver === ANY) {
            comparator = new Comparator(">=0.0.0");
          }
          high = high || comparator;
          low = low || comparator;
          if (gtfn(comparator.semver, high.semver, options)) {
            high = comparator;
          } else if (ltfn(comparator.semver, low.semver, options)) {
            low = comparator;
          }
        });
        if (high.operator === comp || high.operator === ecomp) {
          return false;
        }
        if ((!low.operator || low.operator === comp) && ltefn(version, low.semver)) {
          return false;
        } else if (low.operator === ecomp && ltfn(version, low.semver)) {
          return false;
        }
      }
      return true;
    };
    module2.exports = outside;
  }
});

// node_modules/semver/ranges/gtr.js
var require_gtr = __commonJS({
  "node_modules/semver/ranges/gtr.js"(exports2, module2) {
    "use strict";
    var outside = require_outside();
    var gtr = (version, range, options) => outside(version, range, ">", options);
    module2.exports = gtr;
  }
});

// node_modules/semver/ranges/ltr.js
var require_ltr = __commonJS({
  "node_modules/semver/ranges/ltr.js"(exports2, module2) {
    "use strict";
    var outside = require_outside();
    var ltr = (version, range, options) => outside(version, range, "<", options);
    module2.exports = ltr;
  }
});

// node_modules/semver/ranges/intersects.js
var require_intersects = __commonJS({
  "node_modules/semver/ranges/intersects.js"(exports2, module2) {
    "use strict";
    var Range = require_range();
    var intersects = (r1, r2, options) => {
      r1 = new Range(r1, options);
      r2 = new Range(r2, options);
      return r1.intersects(r2, options);
    };
    module2.exports = intersects;
  }
});

// node_modules/semver/ranges/simplify.js
var require_simplify = __commonJS({
  "node_modules/semver/ranges/simplify.js"(exports2, module2) {
    "use strict";
    var satisfies = require_satisfies();
    var compare = require_compare();
    module2.exports = (versions, range, options) => {
      const set = [];
      let first = null;
      let prev = null;
      const v = versions.sort((a, b) => compare(a, b, options));
      for (const version of v) {
        const included = satisfies(version, range, options);
        if (included) {
          prev = version;
          if (!first) {
            first = version;
          }
        } else {
          if (prev) {
            set.push([first, prev]);
          }
          prev = null;
          first = null;
        }
      }
      if (first) {
        set.push([first, null]);
      }
      const ranges = [];
      for (const [min, max] of set) {
        if (min === max) {
          ranges.push(min);
        } else if (!max && min === v[0]) {
          ranges.push("*");
        } else if (!max) {
          ranges.push(`>=${min}`);
        } else if (min === v[0]) {
          ranges.push(`<=${max}`);
        } else {
          ranges.push(`${min} - ${max}`);
        }
      }
      const simplified = ranges.join(" || ");
      const original = typeof range.raw === "string" ? range.raw : String(range);
      return simplified.length < original.length ? simplified : range;
    };
  }
});

// node_modules/semver/ranges/subset.js
var require_subset = __commonJS({
  "node_modules/semver/ranges/subset.js"(exports2, module2) {
    "use strict";
    var Range = require_range();
    var Comparator = require_comparator();
    var { ANY } = Comparator;
    var satisfies = require_satisfies();
    var compare = require_compare();
    var subset = (sub, dom, options = {}) => {
      if (sub === dom) {
        return true;
      }
      sub = new Range(sub, options);
      dom = new Range(dom, options);
      let sawNonNull = false;
      OUTER:
        for (const simpleSub of sub.set) {
          for (const simpleDom of dom.set) {
            const isSub = simpleSubset(simpleSub, simpleDom, options);
            sawNonNull = sawNonNull || isSub !== null;
            if (isSub) {
              continue OUTER;
            }
          }
          if (sawNonNull) {
            return false;
          }
        }
      return true;
    };
    var minimumVersionWithPreRelease = [new Comparator(">=0.0.0-0")];
    var minimumVersion = [new Comparator(">=0.0.0")];
    var simpleSubset = (sub, dom, options) => {
      if (sub === dom) {
        return true;
      }
      if (sub.length === 1 && sub[0].semver === ANY) {
        if (dom.length === 1 && dom[0].semver === ANY) {
          return true;
        } else if (options.includePrerelease) {
          sub = minimumVersionWithPreRelease;
        } else {
          sub = minimumVersion;
        }
      }
      if (dom.length === 1 && dom[0].semver === ANY) {
        if (options.includePrerelease) {
          return true;
        } else {
          dom = minimumVersion;
        }
      }
      const eqSet = /* @__PURE__ */ new Set();
      let gt, lt;
      for (const c of sub) {
        if (c.operator === ">" || c.operator === ">=") {
          gt = higherGT(gt, c, options);
        } else if (c.operator === "<" || c.operator === "<=") {
          lt = lowerLT(lt, c, options);
        } else {
          eqSet.add(c.semver);
        }
      }
      if (eqSet.size > 1) {
        return null;
      }
      let gtltComp;
      if (gt && lt) {
        gtltComp = compare(gt.semver, lt.semver, options);
        if (gtltComp > 0) {
          return null;
        } else if (gtltComp === 0 && (gt.operator !== ">=" || lt.operator !== "<=")) {
          return null;
        }
      }
      for (const eq of eqSet) {
        if (gt && !satisfies(eq, String(gt), options)) {
          return null;
        }
        if (lt && !satisfies(eq, String(lt), options)) {
          return null;
        }
        for (const c of dom) {
          if (!satisfies(eq, String(c), options)) {
            return false;
          }
        }
        return true;
      }
      let higher, lower;
      let hasDomLT, hasDomGT;
      let needDomLTPre = lt && !options.includePrerelease && lt.semver.prerelease.length ? lt.semver : false;
      let needDomGTPre = gt && !options.includePrerelease && gt.semver.prerelease.length ? gt.semver : false;
      if (needDomLTPre && needDomLTPre.prerelease.length === 1 && lt.operator === "<" && needDomLTPre.prerelease[0] === 0) {
        needDomLTPre = false;
      }
      for (const c of dom) {
        hasDomGT = hasDomGT || c.operator === ">" || c.operator === ">=";
        hasDomLT = hasDomLT || c.operator === "<" || c.operator === "<=";
        if (gt) {
          if (needDomGTPre) {
            if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomGTPre.major && c.semver.minor === needDomGTPre.minor && c.semver.patch === needDomGTPre.patch) {
              needDomGTPre = false;
            }
          }
          if (c.operator === ">" || c.operator === ">=") {
            higher = higherGT(gt, c, options);
            if (higher === c && higher !== gt) {
              return false;
            }
          } else if (gt.operator === ">=" && !satisfies(gt.semver, String(c), options)) {
            return false;
          }
        }
        if (lt) {
          if (needDomLTPre) {
            if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomLTPre.major && c.semver.minor === needDomLTPre.minor && c.semver.patch === needDomLTPre.patch) {
              needDomLTPre = false;
            }
          }
          if (c.operator === "<" || c.operator === "<=") {
            lower = lowerLT(lt, c, options);
            if (lower === c && lower !== lt) {
              return false;
            }
          } else if (lt.operator === "<=" && !satisfies(lt.semver, String(c), options)) {
            return false;
          }
        }
        if (!c.operator && (lt || gt) && gtltComp !== 0) {
          return false;
        }
      }
      if (gt && hasDomLT && !lt && gtltComp !== 0) {
        return false;
      }
      if (lt && hasDomGT && !gt && gtltComp !== 0) {
        return false;
      }
      if (needDomGTPre || needDomLTPre) {
        return false;
      }
      return true;
    };
    var higherGT = (a, b, options) => {
      if (!a) {
        return b;
      }
      const comp = compare(a.semver, b.semver, options);
      return comp > 0 ? a : comp < 0 ? b : b.operator === ">" && a.operator === ">=" ? b : a;
    };
    var lowerLT = (a, b, options) => {
      if (!a) {
        return b;
      }
      const comp = compare(a.semver, b.semver, options);
      return comp < 0 ? a : comp > 0 ? b : b.operator === "<" && a.operator === "<=" ? b : a;
    };
    module2.exports = subset;
  }
});

// node_modules/semver/index.js
var require_semver2 = __commonJS({
  "node_modules/semver/index.js"(exports2, module2) {
    "use strict";
    var internalRe = require_re();
    var constants = require_constants();
    var SemVer = require_semver();
    var identifiers = require_identifiers();
    var parse = require_parse();
    var valid = require_valid();
    var clean = require_clean();
    var inc = require_inc();
    var diff = require_diff();
    var major = require_major();
    var minor = require_minor();
    var patch = require_patch();
    var prerelease = require_prerelease();
    var compare = require_compare();
    var rcompare = require_rcompare();
    var compareLoose = require_compare_loose();
    var compareBuild = require_compare_build();
    var sort = require_sort();
    var rsort = require_rsort();
    var gt = require_gt();
    var lt = require_lt();
    var eq = require_eq();
    var neq = require_neq();
    var gte = require_gte();
    var lte = require_lte();
    var cmp = require_cmp();
    var coerce = require_coerce();
    var Comparator = require_comparator();
    var Range = require_range();
    var satisfies = require_satisfies();
    var toComparators = require_to_comparators();
    var maxSatisfying = require_max_satisfying();
    var minSatisfying = require_min_satisfying();
    var minVersion = require_min_version();
    var validRange = require_valid2();
    var outside = require_outside();
    var gtr = require_gtr();
    var ltr = require_ltr();
    var intersects = require_intersects();
    var simplifyRange = require_simplify();
    var subset = require_subset();
    module2.exports = {
      parse,
      valid,
      clean,
      inc,
      diff,
      major,
      minor,
      patch,
      prerelease,
      compare,
      rcompare,
      compareLoose,
      compareBuild,
      sort,
      rsort,
      gt,
      lt,
      eq,
      neq,
      gte,
      lte,
      cmp,
      coerce,
      Comparator,
      Range,
      satisfies,
      toComparators,
      maxSatisfying,
      minSatisfying,
      minVersion,
      validRange,
      outside,
      gtr,
      ltr,
      intersects,
      simplifyRange,
      subset,
      SemVer,
      re: internalRe.re,
      src: internalRe.src,
      tokens: internalRe.t,
      SEMVER_SPEC_VERSION: constants.SEMVER_SPEC_VERSION,
      RELEASE_TYPES: constants.RELEASE_TYPES,
      compareIdentifiers: identifiers.compareIdentifiers,
      rcompareIdentifiers: identifiers.rcompareIdentifiers
    };
  }
});

// node_modules/universalify/index.js
var require_universalify = __commonJS({
  "node_modules/universalify/index.js"(exports2) {
    "use strict";
    exports2.fromCallback = function(fn) {
      return Object.defineProperty(function(...args2) {
        if (typeof args2[args2.length - 1] === "function")
          fn.apply(this, args2);
        else {
          return new Promise((resolve, reject) => {
            args2.push((err, res) => err != null ? reject(err) : resolve(res));
            fn.apply(this, args2);
          });
        }
      }, "name", { value: fn.name });
    };
    exports2.fromPromise = function(fn) {
      return Object.defineProperty(function(...args2) {
        const cb = args2[args2.length - 1];
        if (typeof cb !== "function")
          return fn.apply(this, args2);
        else {
          args2.pop();
          fn.apply(this, args2).then((r) => cb(null, r), cb);
        }
      }, "name", { value: fn.name });
    };
  }
});

// node_modules/graceful-fs/polyfills.js
var require_polyfills = __commonJS({
  "node_modules/graceful-fs/polyfills.js"(exports2, module2) {
    var constants = require("constants");
    var origCwd = process.cwd;
    var cwd = null;
    var platform2 = process.env.GRACEFUL_FS_PLATFORM || process.platform;
    process.cwd = function() {
      if (!cwd)
        cwd = origCwd.call(process);
      return cwd;
    };
    try {
      process.cwd();
    } catch (er) {
    }
    if (typeof process.chdir === "function") {
      chdir = process.chdir;
      process.chdir = function(d) {
        cwd = null;
        chdir.call(process, d);
      };
      if (Object.setPrototypeOf)
        Object.setPrototypeOf(process.chdir, chdir);
    }
    var chdir;
    module2.exports = patch;
    function patch(fs14) {
      if (constants.hasOwnProperty("O_SYMLINK") && process.version.match(/^v0\.6\.[0-2]|^v0\.5\./)) {
        patchLchmod(fs14);
      }
      if (!fs14.lutimes) {
        patchLutimes(fs14);
      }
      fs14.chown = chownFix(fs14.chown);
      fs14.fchown = chownFix(fs14.fchown);
      fs14.lchown = chownFix(fs14.lchown);
      fs14.chmod = chmodFix(fs14.chmod);
      fs14.fchmod = chmodFix(fs14.fchmod);
      fs14.lchmod = chmodFix(fs14.lchmod);
      fs14.chownSync = chownFixSync(fs14.chownSync);
      fs14.fchownSync = chownFixSync(fs14.fchownSync);
      fs14.lchownSync = chownFixSync(fs14.lchownSync);
      fs14.chmodSync = chmodFixSync(fs14.chmodSync);
      fs14.fchmodSync = chmodFixSync(fs14.fchmodSync);
      fs14.lchmodSync = chmodFixSync(fs14.lchmodSync);
      fs14.stat = statFix(fs14.stat);
      fs14.fstat = statFix(fs14.fstat);
      fs14.lstat = statFix(fs14.lstat);
      fs14.statSync = statFixSync(fs14.statSync);
      fs14.fstatSync = statFixSync(fs14.fstatSync);
      fs14.lstatSync = statFixSync(fs14.lstatSync);
      if (fs14.chmod && !fs14.lchmod) {
        fs14.lchmod = function(path14, mode, cb) {
          if (cb)
            process.nextTick(cb);
        };
        fs14.lchmodSync = function() {
        };
      }
      if (fs14.chown && !fs14.lchown) {
        fs14.lchown = function(path14, uid, gid, cb) {
          if (cb)
            process.nextTick(cb);
        };
        fs14.lchownSync = function() {
        };
      }
      if (platform2 === "win32") {
        fs14.rename = typeof fs14.rename !== "function" ? fs14.rename : function(fs$rename) {
          function rename(from, to, cb) {
            var start = Date.now();
            var backoff = 0;
            fs$rename(from, to, function CB(er) {
              if (er && (er.code === "EACCES" || er.code === "EPERM" || er.code === "EBUSY") && Date.now() - start < 6e4) {
                setTimeout(function() {
                  fs14.stat(to, function(stater, st) {
                    if (stater && stater.code === "ENOENT")
                      fs$rename(from, to, CB);
                    else
                      cb(er);
                  });
                }, backoff);
                if (backoff < 100)
                  backoff += 10;
                return;
              }
              if (cb)
                cb(er);
            });
          }
          if (Object.setPrototypeOf)
            Object.setPrototypeOf(rename, fs$rename);
          return rename;
        }(fs14.rename);
      }
      fs14.read = typeof fs14.read !== "function" ? fs14.read : function(fs$read) {
        function read(fd, buffer, offset, length, position, callback_) {
          var callback;
          if (callback_ && typeof callback_ === "function") {
            var eagCounter = 0;
            callback = function(er, _, __) {
              if (er && er.code === "EAGAIN" && eagCounter < 10) {
                eagCounter++;
                return fs$read.call(fs14, fd, buffer, offset, length, position, callback);
              }
              callback_.apply(this, arguments);
            };
          }
          return fs$read.call(fs14, fd, buffer, offset, length, position, callback);
        }
        if (Object.setPrototypeOf)
          Object.setPrototypeOf(read, fs$read);
        return read;
      }(fs14.read);
      fs14.readSync = typeof fs14.readSync !== "function" ? fs14.readSync : /* @__PURE__ */ function(fs$readSync) {
        return function(fd, buffer, offset, length, position) {
          var eagCounter = 0;
          while (true) {
            try {
              return fs$readSync.call(fs14, fd, buffer, offset, length, position);
            } catch (er) {
              if (er.code === "EAGAIN" && eagCounter < 10) {
                eagCounter++;
                continue;
              }
              throw er;
            }
          }
        };
      }(fs14.readSync);
      function patchLchmod(fs15) {
        fs15.lchmod = function(path14, mode, callback) {
          fs15.open(
            path14,
            constants.O_WRONLY | constants.O_SYMLINK,
            mode,
            function(err, fd) {
              if (err) {
                if (callback)
                  callback(err);
                return;
              }
              fs15.fchmod(fd, mode, function(err2) {
                fs15.close(fd, function(err22) {
                  if (callback)
                    callback(err2 || err22);
                });
              });
            }
          );
        };
        fs15.lchmodSync = function(path14, mode) {
          var fd = fs15.openSync(path14, constants.O_WRONLY | constants.O_SYMLINK, mode);
          var threw = true;
          var ret;
          try {
            ret = fs15.fchmodSync(fd, mode);
            threw = false;
          } finally {
            if (threw) {
              try {
                fs15.closeSync(fd);
              } catch (er) {
              }
            } else {
              fs15.closeSync(fd);
            }
          }
          return ret;
        };
      }
      function patchLutimes(fs15) {
        if (constants.hasOwnProperty("O_SYMLINK") && fs15.futimes) {
          fs15.lutimes = function(path14, at, mt, cb) {
            fs15.open(path14, constants.O_SYMLINK, function(er, fd) {
              if (er) {
                if (cb)
                  cb(er);
                return;
              }
              fs15.futimes(fd, at, mt, function(er2) {
                fs15.close(fd, function(er22) {
                  if (cb)
                    cb(er2 || er22);
                });
              });
            });
          };
          fs15.lutimesSync = function(path14, at, mt) {
            var fd = fs15.openSync(path14, constants.O_SYMLINK);
            var ret;
            var threw = true;
            try {
              ret = fs15.futimesSync(fd, at, mt);
              threw = false;
            } finally {
              if (threw) {
                try {
                  fs15.closeSync(fd);
                } catch (er) {
                }
              } else {
                fs15.closeSync(fd);
              }
            }
            return ret;
          };
        } else if (fs15.futimes) {
          fs15.lutimes = function(_a, _b, _c, cb) {
            if (cb)
              process.nextTick(cb);
          };
          fs15.lutimesSync = function() {
          };
        }
      }
      function chmodFix(orig) {
        if (!orig)
          return orig;
        return function(target, mode, cb) {
          return orig.call(fs14, target, mode, function(er) {
            if (chownErOk(er))
              er = null;
            if (cb)
              cb.apply(this, arguments);
          });
        };
      }
      function chmodFixSync(orig) {
        if (!orig)
          return orig;
        return function(target, mode) {
          try {
            return orig.call(fs14, target, mode);
          } catch (er) {
            if (!chownErOk(er))
              throw er;
          }
        };
      }
      function chownFix(orig) {
        if (!orig)
          return orig;
        return function(target, uid, gid, cb) {
          return orig.call(fs14, target, uid, gid, function(er) {
            if (chownErOk(er))
              er = null;
            if (cb)
              cb.apply(this, arguments);
          });
        };
      }
      function chownFixSync(orig) {
        if (!orig)
          return orig;
        return function(target, uid, gid) {
          try {
            return orig.call(fs14, target, uid, gid);
          } catch (er) {
            if (!chownErOk(er))
              throw er;
          }
        };
      }
      function statFix(orig) {
        if (!orig)
          return orig;
        return function(target, options, cb) {
          if (typeof options === "function") {
            cb = options;
            options = null;
          }
          function callback(er, stats) {
            if (stats) {
              if (stats.uid < 0)
                stats.uid += 4294967296;
              if (stats.gid < 0)
                stats.gid += 4294967296;
            }
            if (cb)
              cb.apply(this, arguments);
          }
          return options ? orig.call(fs14, target, options, callback) : orig.call(fs14, target, callback);
        };
      }
      function statFixSync(orig) {
        if (!orig)
          return orig;
        return function(target, options) {
          var stats = options ? orig.call(fs14, target, options) : orig.call(fs14, target);
          if (stats) {
            if (stats.uid < 0)
              stats.uid += 4294967296;
            if (stats.gid < 0)
              stats.gid += 4294967296;
          }
          return stats;
        };
      }
      function chownErOk(er) {
        if (!er)
          return true;
        if (er.code === "ENOSYS")
          return true;
        var nonroot = !process.getuid || process.getuid() !== 0;
        if (nonroot) {
          if (er.code === "EINVAL" || er.code === "EPERM")
            return true;
        }
        return false;
      }
    }
  }
});

// node_modules/graceful-fs/legacy-streams.js
var require_legacy_streams = __commonJS({
  "node_modules/graceful-fs/legacy-streams.js"(exports2, module2) {
    var Stream = require("stream").Stream;
    module2.exports = legacy;
    function legacy(fs14) {
      return {
        ReadStream,
        WriteStream
      };
      function ReadStream(path14, options) {
        if (!(this instanceof ReadStream))
          return new ReadStream(path14, options);
        Stream.call(this);
        var self = this;
        this.path = path14;
        this.fd = null;
        this.readable = true;
        this.paused = false;
        this.flags = "r";
        this.mode = 438;
        this.bufferSize = 64 * 1024;
        options = options || {};
        var keys = Object.keys(options);
        for (var index = 0, length = keys.length; index < length; index++) {
          var key = keys[index];
          this[key] = options[key];
        }
        if (this.encoding)
          this.setEncoding(this.encoding);
        if (this.start !== void 0) {
          if ("number" !== typeof this.start) {
            throw TypeError("start must be a Number");
          }
          if (this.end === void 0) {
            this.end = Infinity;
          } else if ("number" !== typeof this.end) {
            throw TypeError("end must be a Number");
          }
          if (this.start > this.end) {
            throw new Error("start must be <= end");
          }
          this.pos = this.start;
        }
        if (this.fd !== null) {
          process.nextTick(function() {
            self._read();
          });
          return;
        }
        fs14.open(this.path, this.flags, this.mode, function(err, fd) {
          if (err) {
            self.emit("error", err);
            self.readable = false;
            return;
          }
          self.fd = fd;
          self.emit("open", fd);
          self._read();
        });
      }
      function WriteStream(path14, options) {
        if (!(this instanceof WriteStream))
          return new WriteStream(path14, options);
        Stream.call(this);
        this.path = path14;
        this.fd = null;
        this.writable = true;
        this.flags = "w";
        this.encoding = "binary";
        this.mode = 438;
        this.bytesWritten = 0;
        options = options || {};
        var keys = Object.keys(options);
        for (var index = 0, length = keys.length; index < length; index++) {
          var key = keys[index];
          this[key] = options[key];
        }
        if (this.start !== void 0) {
          if ("number" !== typeof this.start) {
            throw TypeError("start must be a Number");
          }
          if (this.start < 0) {
            throw new Error("start must be >= zero");
          }
          this.pos = this.start;
        }
        this.busy = false;
        this._queue = [];
        if (this.fd === null) {
          this._open = fs14.open;
          this._queue.push([this._open, this.path, this.flags, this.mode, void 0]);
          this.flush();
        }
      }
    }
  }
});

// node_modules/graceful-fs/clone.js
var require_clone = __commonJS({
  "node_modules/graceful-fs/clone.js"(exports2, module2) {
    "use strict";
    module2.exports = clone;
    var getPrototypeOf = Object.getPrototypeOf || function(obj) {
      return obj.__proto__;
    };
    function clone(obj) {
      if (obj === null || typeof obj !== "object")
        return obj;
      if (obj instanceof Object)
        var copy = { __proto__: getPrototypeOf(obj) };
      else
        var copy = /* @__PURE__ */ Object.create(null);
      Object.getOwnPropertyNames(obj).forEach(function(key) {
        Object.defineProperty(copy, key, Object.getOwnPropertyDescriptor(obj, key));
      });
      return copy;
    }
  }
});

// node_modules/graceful-fs/graceful-fs.js
var require_graceful_fs = __commonJS({
  "node_modules/graceful-fs/graceful-fs.js"(exports2, module2) {
    var fs14 = require("fs");
    var polyfills = require_polyfills();
    var legacy = require_legacy_streams();
    var clone = require_clone();
    var util = require("util");
    var gracefulQueue;
    var previousSymbol;
    if (typeof Symbol === "function" && typeof Symbol.for === "function") {
      gracefulQueue = Symbol.for("graceful-fs.queue");
      previousSymbol = Symbol.for("graceful-fs.previous");
    } else {
      gracefulQueue = "___graceful-fs.queue";
      previousSymbol = "___graceful-fs.previous";
    }
    function noop() {
    }
    function publishQueue(context, queue2) {
      Object.defineProperty(context, gracefulQueue, {
        get: function() {
          return queue2;
        }
      });
    }
    var debug = noop;
    if (util.debuglog)
      debug = util.debuglog("gfs4");
    else if (/\bgfs4\b/i.test(process.env.NODE_DEBUG || ""))
      debug = function() {
        var m = util.format.apply(util, arguments);
        m = "GFS4: " + m.split(/\n/).join("\nGFS4: ");
        console.error(m);
      };
    if (!fs14[gracefulQueue]) {
      queue = global[gracefulQueue] || [];
      publishQueue(fs14, queue);
      fs14.close = function(fs$close) {
        function close(fd, cb) {
          return fs$close.call(fs14, fd, function(err) {
            if (!err) {
              resetQueue();
            }
            if (typeof cb === "function")
              cb.apply(this, arguments);
          });
        }
        Object.defineProperty(close, previousSymbol, {
          value: fs$close
        });
        return close;
      }(fs14.close);
      fs14.closeSync = function(fs$closeSync) {
        function closeSync(fd) {
          fs$closeSync.apply(fs14, arguments);
          resetQueue();
        }
        Object.defineProperty(closeSync, previousSymbol, {
          value: fs$closeSync
        });
        return closeSync;
      }(fs14.closeSync);
      if (/\bgfs4\b/i.test(process.env.NODE_DEBUG || "")) {
        process.on("exit", function() {
          debug(fs14[gracefulQueue]);
          require("assert").equal(fs14[gracefulQueue].length, 0);
        });
      }
    }
    var queue;
    if (!global[gracefulQueue]) {
      publishQueue(global, fs14[gracefulQueue]);
    }
    module2.exports = patch(clone(fs14));
    if (process.env.TEST_GRACEFUL_FS_GLOBAL_PATCH && !fs14.__patched) {
      module2.exports = patch(fs14);
      fs14.__patched = true;
    }
    function patch(fs15) {
      polyfills(fs15);
      fs15.gracefulify = patch;
      fs15.createReadStream = createReadStream;
      fs15.createWriteStream = createWriteStream;
      var fs$readFile = fs15.readFile;
      fs15.readFile = readFile;
      function readFile(path14, options, cb) {
        if (typeof options === "function")
          cb = options, options = null;
        return go$readFile(path14, options, cb);
        function go$readFile(path15, options2, cb2, startTime) {
          return fs$readFile(path15, options2, function(err) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([go$readFile, [path15, options2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      var fs$writeFile = fs15.writeFile;
      fs15.writeFile = writeFile;
      function writeFile(path14, data, options, cb) {
        if (typeof options === "function")
          cb = options, options = null;
        return go$writeFile(path14, data, options, cb);
        function go$writeFile(path15, data2, options2, cb2, startTime) {
          return fs$writeFile(path15, data2, options2, function(err) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([go$writeFile, [path15, data2, options2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      var fs$appendFile = fs15.appendFile;
      if (fs$appendFile)
        fs15.appendFile = appendFile;
      function appendFile(path14, data, options, cb) {
        if (typeof options === "function")
          cb = options, options = null;
        return go$appendFile(path14, data, options, cb);
        function go$appendFile(path15, data2, options2, cb2, startTime) {
          return fs$appendFile(path15, data2, options2, function(err) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([go$appendFile, [path15, data2, options2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      var fs$copyFile = fs15.copyFile;
      if (fs$copyFile)
        fs15.copyFile = copyFile;
      function copyFile(src, dest, flags, cb) {
        if (typeof flags === "function") {
          cb = flags;
          flags = 0;
        }
        return go$copyFile(src, dest, flags, cb);
        function go$copyFile(src2, dest2, flags2, cb2, startTime) {
          return fs$copyFile(src2, dest2, flags2, function(err) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([go$copyFile, [src2, dest2, flags2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      var fs$readdir = fs15.readdir;
      fs15.readdir = readdir;
      var noReaddirOptionVersions = /^v[0-5]\./;
      function readdir(path14, options, cb) {
        if (typeof options === "function")
          cb = options, options = null;
        var go$readdir = noReaddirOptionVersions.test(process.version) ? function go$readdir2(path15, options2, cb2, startTime) {
          return fs$readdir(path15, fs$readdirCallback(
            path15,
            options2,
            cb2,
            startTime
          ));
        } : function go$readdir2(path15, options2, cb2, startTime) {
          return fs$readdir(path15, options2, fs$readdirCallback(
            path15,
            options2,
            cb2,
            startTime
          ));
        };
        return go$readdir(path14, options, cb);
        function fs$readdirCallback(path15, options2, cb2, startTime) {
          return function(err, files) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([
                go$readdir,
                [path15, options2, cb2],
                err,
                startTime || Date.now(),
                Date.now()
              ]);
            else {
              if (files && files.sort)
                files.sort();
              if (typeof cb2 === "function")
                cb2.call(this, err, files);
            }
          };
        }
      }
      if (process.version.substr(0, 4) === "v0.8") {
        var legStreams = legacy(fs15);
        ReadStream = legStreams.ReadStream;
        WriteStream = legStreams.WriteStream;
      }
      var fs$ReadStream = fs15.ReadStream;
      if (fs$ReadStream) {
        ReadStream.prototype = Object.create(fs$ReadStream.prototype);
        ReadStream.prototype.open = ReadStream$open;
      }
      var fs$WriteStream = fs15.WriteStream;
      if (fs$WriteStream) {
        WriteStream.prototype = Object.create(fs$WriteStream.prototype);
        WriteStream.prototype.open = WriteStream$open;
      }
      Object.defineProperty(fs15, "ReadStream", {
        get: function() {
          return ReadStream;
        },
        set: function(val) {
          ReadStream = val;
        },
        enumerable: true,
        configurable: true
      });
      Object.defineProperty(fs15, "WriteStream", {
        get: function() {
          return WriteStream;
        },
        set: function(val) {
          WriteStream = val;
        },
        enumerable: true,
        configurable: true
      });
      var FileReadStream = ReadStream;
      Object.defineProperty(fs15, "FileReadStream", {
        get: function() {
          return FileReadStream;
        },
        set: function(val) {
          FileReadStream = val;
        },
        enumerable: true,
        configurable: true
      });
      var FileWriteStream = WriteStream;
      Object.defineProperty(fs15, "FileWriteStream", {
        get: function() {
          return FileWriteStream;
        },
        set: function(val) {
          FileWriteStream = val;
        },
        enumerable: true,
        configurable: true
      });
      function ReadStream(path14, options) {
        if (this instanceof ReadStream)
          return fs$ReadStream.apply(this, arguments), this;
        else
          return ReadStream.apply(Object.create(ReadStream.prototype), arguments);
      }
      function ReadStream$open() {
        var that = this;
        open(that.path, that.flags, that.mode, function(err, fd) {
          if (err) {
            if (that.autoClose)
              that.destroy();
            that.emit("error", err);
          } else {
            that.fd = fd;
            that.emit("open", fd);
            that.read();
          }
        });
      }
      function WriteStream(path14, options) {
        if (this instanceof WriteStream)
          return fs$WriteStream.apply(this, arguments), this;
        else
          return WriteStream.apply(Object.create(WriteStream.prototype), arguments);
      }
      function WriteStream$open() {
        var that = this;
        open(that.path, that.flags, that.mode, function(err, fd) {
          if (err) {
            that.destroy();
            that.emit("error", err);
          } else {
            that.fd = fd;
            that.emit("open", fd);
          }
        });
      }
      function createReadStream(path14, options) {
        return new fs15.ReadStream(path14, options);
      }
      function createWriteStream(path14, options) {
        return new fs15.WriteStream(path14, options);
      }
      var fs$open = fs15.open;
      fs15.open = open;
      function open(path14, flags, mode, cb) {
        if (typeof mode === "function")
          cb = mode, mode = null;
        return go$open(path14, flags, mode, cb);
        function go$open(path15, flags2, mode2, cb2, startTime) {
          return fs$open(path15, flags2, mode2, function(err, fd) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([go$open, [path15, flags2, mode2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      return fs15;
    }
    function enqueue(elem) {
      debug("ENQUEUE", elem[0].name, elem[1]);
      fs14[gracefulQueue].push(elem);
      retry();
    }
    var retryTimer;
    function resetQueue() {
      var now = Date.now();
      for (var i = 0; i < fs14[gracefulQueue].length; ++i) {
        if (fs14[gracefulQueue][i].length > 2) {
          fs14[gracefulQueue][i][3] = now;
          fs14[gracefulQueue][i][4] = now;
        }
      }
      retry();
    }
    function retry() {
      clearTimeout(retryTimer);
      retryTimer = void 0;
      if (fs14[gracefulQueue].length === 0)
        return;
      var elem = fs14[gracefulQueue].shift();
      var fn = elem[0];
      var args2 = elem[1];
      var err = elem[2];
      var startTime = elem[3];
      var lastTime = elem[4];
      if (startTime === void 0) {
        debug("RETRY", fn.name, args2);
        fn.apply(null, args2);
      } else if (Date.now() - startTime >= 6e4) {
        debug("TIMEOUT", fn.name, args2);
        var cb = args2.pop();
        if (typeof cb === "function")
          cb.call(null, err);
      } else {
        var sinceAttempt = Date.now() - lastTime;
        var sinceStart = Math.max(lastTime - startTime, 1);
        var desiredDelay = Math.min(sinceStart * 1.2, 100);
        if (sinceAttempt >= desiredDelay) {
          debug("RETRY", fn.name, args2);
          fn.apply(null, args2.concat([startTime]));
        } else {
          fs14[gracefulQueue].push(elem);
        }
      }
      if (retryTimer === void 0) {
        retryTimer = setTimeout(retry, 0);
      }
    }
  }
});

// node_modules/fs-extra/lib/fs/index.js
var require_fs = __commonJS({
  "node_modules/fs-extra/lib/fs/index.js"(exports2) {
    "use strict";
    var u = require_universalify().fromCallback;
    var fs14 = require_graceful_fs();
    var api = [
      "access",
      "appendFile",
      "chmod",
      "chown",
      "close",
      "copyFile",
      "cp",
      "fchmod",
      "fchown",
      "fdatasync",
      "fstat",
      "fsync",
      "ftruncate",
      "futimes",
      "glob",
      "lchmod",
      "lchown",
      "lutimes",
      "link",
      "lstat",
      "mkdir",
      "mkdtemp",
      "open",
      "opendir",
      "readdir",
      "readFile",
      "readlink",
      "realpath",
      "rename",
      "rm",
      "rmdir",
      "stat",
      "statfs",
      "symlink",
      "truncate",
      "unlink",
      "utimes",
      "writeFile"
    ].filter((key) => {
      return typeof fs14[key] === "function";
    });
    Object.assign(exports2, fs14);
    api.forEach((method) => {
      exports2[method] = u(fs14[method]);
    });
    exports2.exists = function(filename, callback) {
      if (typeof callback === "function") {
        return fs14.exists(filename, callback);
      }
      return new Promise((resolve) => {
        return fs14.exists(filename, resolve);
      });
    };
    exports2.read = function(fd, buffer, offset, length, position, callback) {
      if (typeof callback === "function") {
        return fs14.read(fd, buffer, offset, length, position, callback);
      }
      return new Promise((resolve, reject) => {
        fs14.read(fd, buffer, offset, length, position, (err, bytesRead, buffer2) => {
          if (err)
            return reject(err);
          resolve({ bytesRead, buffer: buffer2 });
        });
      });
    };
    exports2.write = function(fd, buffer, ...args2) {
      if (typeof args2[args2.length - 1] === "function") {
        return fs14.write(fd, buffer, ...args2);
      }
      return new Promise((resolve, reject) => {
        fs14.write(fd, buffer, ...args2, (err, bytesWritten, buffer2) => {
          if (err)
            return reject(err);
          resolve({ bytesWritten, buffer: buffer2 });
        });
      });
    };
    exports2.readv = function(fd, buffers, ...args2) {
      if (typeof args2[args2.length - 1] === "function") {
        return fs14.readv(fd, buffers, ...args2);
      }
      return new Promise((resolve, reject) => {
        fs14.readv(fd, buffers, ...args2, (err, bytesRead, buffers2) => {
          if (err)
            return reject(err);
          resolve({ bytesRead, buffers: buffers2 });
        });
      });
    };
    exports2.writev = function(fd, buffers, ...args2) {
      if (typeof args2[args2.length - 1] === "function") {
        return fs14.writev(fd, buffers, ...args2);
      }
      return new Promise((resolve, reject) => {
        fs14.writev(fd, buffers, ...args2, (err, bytesWritten, buffers2) => {
          if (err)
            return reject(err);
          resolve({ bytesWritten, buffers: buffers2 });
        });
      });
    };
    if (typeof fs14.realpath.native === "function") {
      exports2.realpath.native = u(fs14.realpath.native);
    } else {
      process.emitWarning(
        "fs.realpath.native is not a function. Is fs being monkey-patched?",
        "Warning",
        "fs-extra-WARN0003"
      );
    }
  }
});

// node_modules/fs-extra/lib/mkdirs/utils.js
var require_utils = __commonJS({
  "node_modules/fs-extra/lib/mkdirs/utils.js"(exports2, module2) {
    "use strict";
    var path14 = require("path");
    module2.exports.checkPath = function checkPath(pth) {
      if (process.platform === "win32") {
        const pathHasInvalidWinCharacters = /[<>:"|?*]/.test(pth.replace(path14.parse(pth).root, ""));
        if (pathHasInvalidWinCharacters) {
          const error = new Error(`Path contains invalid characters: ${pth}`);
          error.code = "EINVAL";
          throw error;
        }
      }
    };
  }
});

// node_modules/fs-extra/lib/mkdirs/make-dir.js
var require_make_dir = __commonJS({
  "node_modules/fs-extra/lib/mkdirs/make-dir.js"(exports2, module2) {
    "use strict";
    var fs14 = require_fs();
    var { checkPath } = require_utils();
    var getMode = (options) => {
      const defaults = { mode: 511 };
      if (typeof options === "number")
        return options;
      return { ...defaults, ...options }.mode;
    };
    module2.exports.makeDir = async (dir, options) => {
      checkPath(dir);
      return fs14.mkdir(dir, {
        mode: getMode(options),
        recursive: true
      });
    };
    module2.exports.makeDirSync = (dir, options) => {
      checkPath(dir);
      return fs14.mkdirSync(dir, {
        mode: getMode(options),
        recursive: true
      });
    };
  }
});

// node_modules/fs-extra/lib/mkdirs/index.js
var require_mkdirs = __commonJS({
  "node_modules/fs-extra/lib/mkdirs/index.js"(exports2, module2) {
    "use strict";
    var u = require_universalify().fromPromise;
    var { makeDir: _makeDir, makeDirSync } = require_make_dir();
    var makeDir = u(_makeDir);
    module2.exports = {
      mkdirs: makeDir,
      mkdirsSync: makeDirSync,
      // alias
      mkdirp: makeDir,
      mkdirpSync: makeDirSync,
      ensureDir: makeDir,
      ensureDirSync: makeDirSync
    };
  }
});

// node_modules/fs-extra/lib/path-exists/index.js
var require_path_exists = __commonJS({
  "node_modules/fs-extra/lib/path-exists/index.js"(exports2, module2) {
    "use strict";
    var u = require_universalify().fromPromise;
    var fs14 = require_fs();
    function pathExists(path14) {
      return fs14.access(path14).then(() => true).catch(() => false);
    }
    module2.exports = {
      pathExists: u(pathExists),
      pathExistsSync: fs14.existsSync
    };
  }
});

// node_modules/fs-extra/lib/util/utimes.js
var require_utimes = __commonJS({
  "node_modules/fs-extra/lib/util/utimes.js"(exports2, module2) {
    "use strict";
    var fs14 = require_fs();
    var u = require_universalify().fromPromise;
    async function utimesMillis(path14, atime, mtime) {
      const fd = await fs14.open(path14, "r+");
      let closeErr = null;
      try {
        await fs14.futimes(fd, atime, mtime);
      } finally {
        try {
          await fs14.close(fd);
        } catch (e) {
          closeErr = e;
        }
      }
      if (closeErr) {
        throw closeErr;
      }
    }
    function utimesMillisSync(path14, atime, mtime) {
      const fd = fs14.openSync(path14, "r+");
      fs14.futimesSync(fd, atime, mtime);
      return fs14.closeSync(fd);
    }
    module2.exports = {
      utimesMillis: u(utimesMillis),
      utimesMillisSync
    };
  }
});

// node_modules/fs-extra/lib/util/stat.js
var require_stat = __commonJS({
  "node_modules/fs-extra/lib/util/stat.js"(exports2, module2) {
    "use strict";
    var fs14 = require_fs();
    var path14 = require("path");
    var u = require_universalify().fromPromise;
    function getStats(src, dest, opts) {
      const statFunc = opts.dereference ? (file) => fs14.stat(file, { bigint: true }) : (file) => fs14.lstat(file, { bigint: true });
      return Promise.all([
        statFunc(src),
        statFunc(dest).catch((err) => {
          if (err.code === "ENOENT")
            return null;
          throw err;
        })
      ]).then(([srcStat, destStat]) => ({ srcStat, destStat }));
    }
    function getStatsSync(src, dest, opts) {
      let destStat;
      const statFunc = opts.dereference ? (file) => fs14.statSync(file, { bigint: true }) : (file) => fs14.lstatSync(file, { bigint: true });
      const srcStat = statFunc(src);
      try {
        destStat = statFunc(dest);
      } catch (err) {
        if (err.code === "ENOENT")
          return { srcStat, destStat: null };
        throw err;
      }
      return { srcStat, destStat };
    }
    async function checkPaths(src, dest, funcName, opts) {
      const { srcStat, destStat } = await getStats(src, dest, opts);
      if (destStat) {
        if (areIdentical(srcStat, destStat)) {
          const srcBaseName = path14.basename(src);
          const destBaseName = path14.basename(dest);
          if (funcName === "move" && srcBaseName !== destBaseName && srcBaseName.toLowerCase() === destBaseName.toLowerCase()) {
            return { srcStat, destStat, isChangingCase: true };
          }
          throw new Error("Source and destination must not be the same.");
        }
        if (srcStat.isDirectory() && !destStat.isDirectory()) {
          throw new Error(`Cannot overwrite non-directory '${dest}' with directory '${src}'.`);
        }
        if (!srcStat.isDirectory() && destStat.isDirectory()) {
          throw new Error(`Cannot overwrite directory '${dest}' with non-directory '${src}'.`);
        }
      }
      if (srcStat.isDirectory() && isSrcSubdir(src, dest)) {
        throw new Error(errMsg(src, dest, funcName));
      }
      return { srcStat, destStat };
    }
    function checkPathsSync(src, dest, funcName, opts) {
      const { srcStat, destStat } = getStatsSync(src, dest, opts);
      if (destStat) {
        if (areIdentical(srcStat, destStat)) {
          const srcBaseName = path14.basename(src);
          const destBaseName = path14.basename(dest);
          if (funcName === "move" && srcBaseName !== destBaseName && srcBaseName.toLowerCase() === destBaseName.toLowerCase()) {
            return { srcStat, destStat, isChangingCase: true };
          }
          throw new Error("Source and destination must not be the same.");
        }
        if (srcStat.isDirectory() && !destStat.isDirectory()) {
          throw new Error(`Cannot overwrite non-directory '${dest}' with directory '${src}'.`);
        }
        if (!srcStat.isDirectory() && destStat.isDirectory()) {
          throw new Error(`Cannot overwrite directory '${dest}' with non-directory '${src}'.`);
        }
      }
      if (srcStat.isDirectory() && isSrcSubdir(src, dest)) {
        throw new Error(errMsg(src, dest, funcName));
      }
      return { srcStat, destStat };
    }
    async function checkParentPaths(src, srcStat, dest, funcName) {
      const srcParent = path14.resolve(path14.dirname(src));
      const destParent = path14.resolve(path14.dirname(dest));
      if (destParent === srcParent || destParent === path14.parse(destParent).root)
        return;
      let destStat;
      try {
        destStat = await fs14.stat(destParent, { bigint: true });
      } catch (err) {
        if (err.code === "ENOENT")
          return;
        throw err;
      }
      if (areIdentical(srcStat, destStat)) {
        throw new Error(errMsg(src, dest, funcName));
      }
      return checkParentPaths(src, srcStat, destParent, funcName);
    }
    function checkParentPathsSync(src, srcStat, dest, funcName) {
      const srcParent = path14.resolve(path14.dirname(src));
      const destParent = path14.resolve(path14.dirname(dest));
      if (destParent === srcParent || destParent === path14.parse(destParent).root)
        return;
      let destStat;
      try {
        destStat = fs14.statSync(destParent, { bigint: true });
      } catch (err) {
        if (err.code === "ENOENT")
          return;
        throw err;
      }
      if (areIdentical(srcStat, destStat)) {
        throw new Error(errMsg(src, dest, funcName));
      }
      return checkParentPathsSync(src, srcStat, destParent, funcName);
    }
    function areIdentical(srcStat, destStat) {
      return destStat.ino !== void 0 && destStat.dev !== void 0 && destStat.ino === srcStat.ino && destStat.dev === srcStat.dev;
    }
    function isSrcSubdir(src, dest) {
      const srcArr = path14.resolve(src).split(path14.sep).filter((i) => i);
      const destArr = path14.resolve(dest).split(path14.sep).filter((i) => i);
      return srcArr.every((cur, i) => destArr[i] === cur);
    }
    function errMsg(src, dest, funcName) {
      return `Cannot ${funcName} '${src}' to a subdirectory of itself, '${dest}'.`;
    }
    module2.exports = {
      // checkPaths
      checkPaths: u(checkPaths),
      checkPathsSync,
      // checkParent
      checkParentPaths: u(checkParentPaths),
      checkParentPathsSync,
      // Misc
      isSrcSubdir,
      areIdentical
    };
  }
});

// node_modules/fs-extra/lib/util/async.js
var require_async = __commonJS({
  "node_modules/fs-extra/lib/util/async.js"(exports2, module2) {
    "use strict";
    async function asyncIteratorConcurrentProcess(iterator, fn) {
      const promises = [];
      for await (const item of iterator) {
        promises.push(
          fn(item).then(
            () => null,
            (err) => err ?? new Error("unknown error")
          )
        );
      }
      await Promise.all(
        promises.map(
          (promise) => promise.then((possibleErr) => {
            if (possibleErr !== null)
              throw possibleErr;
          })
        )
      );
    }
    module2.exports = {
      asyncIteratorConcurrentProcess
    };
  }
});

// node_modules/fs-extra/lib/copy/copy.js
var require_copy = __commonJS({
  "node_modules/fs-extra/lib/copy/copy.js"(exports2, module2) {
    "use strict";
    var fs14 = require_fs();
    var path14 = require("path");
    var { mkdirs } = require_mkdirs();
    var { pathExists } = require_path_exists();
    var { utimesMillis } = require_utimes();
    var stat = require_stat();
    var { asyncIteratorConcurrentProcess } = require_async();
    async function copy(src, dest, opts = {}) {
      if (typeof opts === "function") {
        opts = { filter: opts };
      }
      opts.clobber = "clobber" in opts ? !!opts.clobber : true;
      opts.overwrite = "overwrite" in opts ? !!opts.overwrite : opts.clobber;
      if (opts.preserveTimestamps && process.arch === "ia32") {
        process.emitWarning(
          "Using the preserveTimestamps option in 32-bit node is not recommended;\n\n	see https://github.com/jprichardson/node-fs-extra/issues/269",
          "Warning",
          "fs-extra-WARN0001"
        );
      }
      const { srcStat, destStat } = await stat.checkPaths(src, dest, "copy", opts);
      await stat.checkParentPaths(src, srcStat, dest, "copy");
      const include = await runFilter(src, dest, opts);
      if (!include)
        return;
      const destParent = path14.dirname(dest);
      const dirExists = await pathExists(destParent);
      if (!dirExists) {
        await mkdirs(destParent);
      }
      await getStatsAndPerformCopy(destStat, src, dest, opts);
    }
    async function runFilter(src, dest, opts) {
      if (!opts.filter)
        return true;
      return opts.filter(src, dest);
    }
    async function getStatsAndPerformCopy(destStat, src, dest, opts) {
      const statFn = opts.dereference ? fs14.stat : fs14.lstat;
      const srcStat = await statFn(src);
      if (srcStat.isDirectory())
        return onDir(srcStat, destStat, src, dest, opts);
      if (srcStat.isFile() || srcStat.isCharacterDevice() || srcStat.isBlockDevice())
        return onFile(srcStat, destStat, src, dest, opts);
      if (srcStat.isSymbolicLink())
        return onLink(destStat, src, dest, opts);
      if (srcStat.isSocket())
        throw new Error(`Cannot copy a socket file: ${src}`);
      if (srcStat.isFIFO())
        throw new Error(`Cannot copy a FIFO pipe: ${src}`);
      throw new Error(`Unknown file: ${src}`);
    }
    async function onFile(srcStat, destStat, src, dest, opts) {
      if (!destStat)
        return copyFile(srcStat, src, dest, opts);
      if (opts.overwrite) {
        await fs14.unlink(dest);
        return copyFile(srcStat, src, dest, opts);
      }
      if (opts.errorOnExist) {
        throw new Error(`'${dest}' already exists`);
      }
    }
    async function copyFile(srcStat, src, dest, opts) {
      await fs14.copyFile(src, dest);
      if (opts.preserveTimestamps) {
        if (fileIsNotWritable(srcStat.mode)) {
          await makeFileWritable(dest, srcStat.mode);
        }
        const updatedSrcStat = await fs14.stat(src);
        await utimesMillis(dest, updatedSrcStat.atime, updatedSrcStat.mtime);
      }
      return fs14.chmod(dest, srcStat.mode);
    }
    function fileIsNotWritable(srcMode) {
      return (srcMode & 128) === 0;
    }
    function makeFileWritable(dest, srcMode) {
      return fs14.chmod(dest, srcMode | 128);
    }
    async function onDir(srcStat, destStat, src, dest, opts) {
      if (!destStat) {
        await fs14.mkdir(dest);
      }
      await asyncIteratorConcurrentProcess(await fs14.opendir(src), async (item) => {
        const srcItem = path14.join(src, item.name);
        const destItem = path14.join(dest, item.name);
        const include = await runFilter(srcItem, destItem, opts);
        if (include) {
          const { destStat: destStat2 } = await stat.checkPaths(srcItem, destItem, "copy", opts);
          await getStatsAndPerformCopy(destStat2, srcItem, destItem, opts);
        }
      });
      if (!destStat) {
        await fs14.chmod(dest, srcStat.mode);
      }
    }
    async function onLink(destStat, src, dest, opts) {
      let resolvedSrc = await fs14.readlink(src);
      if (opts.dereference) {
        resolvedSrc = path14.resolve(process.cwd(), resolvedSrc);
      }
      if (!destStat) {
        return fs14.symlink(resolvedSrc, dest);
      }
      let resolvedDest = null;
      try {
        resolvedDest = await fs14.readlink(dest);
      } catch (e) {
        if (e.code === "EINVAL" || e.code === "UNKNOWN")
          return fs14.symlink(resolvedSrc, dest);
        throw e;
      }
      if (opts.dereference) {
        resolvedDest = path14.resolve(process.cwd(), resolvedDest);
      }
      if (resolvedSrc !== resolvedDest) {
        if (stat.isSrcSubdir(resolvedSrc, resolvedDest)) {
          throw new Error(`Cannot copy '${resolvedSrc}' to a subdirectory of itself, '${resolvedDest}'.`);
        }
        if (stat.isSrcSubdir(resolvedDest, resolvedSrc)) {
          throw new Error(`Cannot overwrite '${resolvedDest}' with '${resolvedSrc}'.`);
        }
      }
      await fs14.unlink(dest);
      return fs14.symlink(resolvedSrc, dest);
    }
    module2.exports = copy;
  }
});

// node_modules/fs-extra/lib/copy/copy-sync.js
var require_copy_sync = __commonJS({
  "node_modules/fs-extra/lib/copy/copy-sync.js"(exports2, module2) {
    "use strict";
    var fs14 = require_graceful_fs();
    var path14 = require("path");
    var mkdirsSync = require_mkdirs().mkdirsSync;
    var utimesMillisSync = require_utimes().utimesMillisSync;
    var stat = require_stat();
    function copySync(src, dest, opts) {
      if (typeof opts === "function") {
        opts = { filter: opts };
      }
      opts = opts || {};
      opts.clobber = "clobber" in opts ? !!opts.clobber : true;
      opts.overwrite = "overwrite" in opts ? !!opts.overwrite : opts.clobber;
      if (opts.preserveTimestamps && process.arch === "ia32") {
        process.emitWarning(
          "Using the preserveTimestamps option in 32-bit node is not recommended;\n\n	see https://github.com/jprichardson/node-fs-extra/issues/269",
          "Warning",
          "fs-extra-WARN0002"
        );
      }
      const { srcStat, destStat } = stat.checkPathsSync(src, dest, "copy", opts);
      stat.checkParentPathsSync(src, srcStat, dest, "copy");
      if (opts.filter && !opts.filter(src, dest))
        return;
      const destParent = path14.dirname(dest);
      if (!fs14.existsSync(destParent))
        mkdirsSync(destParent);
      return getStats(destStat, src, dest, opts);
    }
    function getStats(destStat, src, dest, opts) {
      const statSync = opts.dereference ? fs14.statSync : fs14.lstatSync;
      const srcStat = statSync(src);
      if (srcStat.isDirectory())
        return onDir(srcStat, destStat, src, dest, opts);
      else if (srcStat.isFile() || srcStat.isCharacterDevice() || srcStat.isBlockDevice())
        return onFile(srcStat, destStat, src, dest, opts);
      else if (srcStat.isSymbolicLink())
        return onLink(destStat, src, dest, opts);
      else if (srcStat.isSocket())
        throw new Error(`Cannot copy a socket file: ${src}`);
      else if (srcStat.isFIFO())
        throw new Error(`Cannot copy a FIFO pipe: ${src}`);
      throw new Error(`Unknown file: ${src}`);
    }
    function onFile(srcStat, destStat, src, dest, opts) {
      if (!destStat)
        return copyFile(srcStat, src, dest, opts);
      return mayCopyFile(srcStat, src, dest, opts);
    }
    function mayCopyFile(srcStat, src, dest, opts) {
      if (opts.overwrite) {
        fs14.unlinkSync(dest);
        return copyFile(srcStat, src, dest, opts);
      } else if (opts.errorOnExist) {
        throw new Error(`'${dest}' already exists`);
      }
    }
    function copyFile(srcStat, src, dest, opts) {
      fs14.copyFileSync(src, dest);
      if (opts.preserveTimestamps)
        handleTimestamps(srcStat.mode, src, dest);
      return setDestMode(dest, srcStat.mode);
    }
    function handleTimestamps(srcMode, src, dest) {
      if (fileIsNotWritable(srcMode))
        makeFileWritable(dest, srcMode);
      return setDestTimestamps(src, dest);
    }
    function fileIsNotWritable(srcMode) {
      return (srcMode & 128) === 0;
    }
    function makeFileWritable(dest, srcMode) {
      return setDestMode(dest, srcMode | 128);
    }
    function setDestMode(dest, srcMode) {
      return fs14.chmodSync(dest, srcMode);
    }
    function setDestTimestamps(src, dest) {
      const updatedSrcStat = fs14.statSync(src);
      return utimesMillisSync(dest, updatedSrcStat.atime, updatedSrcStat.mtime);
    }
    function onDir(srcStat, destStat, src, dest, opts) {
      if (!destStat)
        return mkDirAndCopy(srcStat.mode, src, dest, opts);
      return copyDir(src, dest, opts);
    }
    function mkDirAndCopy(srcMode, src, dest, opts) {
      fs14.mkdirSync(dest);
      copyDir(src, dest, opts);
      return setDestMode(dest, srcMode);
    }
    function copyDir(src, dest, opts) {
      const dir = fs14.opendirSync(src);
      try {
        let dirent;
        while ((dirent = dir.readSync()) !== null) {
          copyDirItem(dirent.name, src, dest, opts);
        }
      } finally {
        dir.closeSync();
      }
    }
    function copyDirItem(item, src, dest, opts) {
      const srcItem = path14.join(src, item);
      const destItem = path14.join(dest, item);
      if (opts.filter && !opts.filter(srcItem, destItem))
        return;
      const { destStat } = stat.checkPathsSync(srcItem, destItem, "copy", opts);
      return getStats(destStat, srcItem, destItem, opts);
    }
    function onLink(destStat, src, dest, opts) {
      let resolvedSrc = fs14.readlinkSync(src);
      if (opts.dereference) {
        resolvedSrc = path14.resolve(process.cwd(), resolvedSrc);
      }
      if (!destStat) {
        return fs14.symlinkSync(resolvedSrc, dest);
      } else {
        let resolvedDest;
        try {
          resolvedDest = fs14.readlinkSync(dest);
        } catch (err) {
          if (err.code === "EINVAL" || err.code === "UNKNOWN")
            return fs14.symlinkSync(resolvedSrc, dest);
          throw err;
        }
        if (opts.dereference) {
          resolvedDest = path14.resolve(process.cwd(), resolvedDest);
        }
        if (resolvedSrc !== resolvedDest) {
          if (stat.isSrcSubdir(resolvedSrc, resolvedDest)) {
            throw new Error(`Cannot copy '${resolvedSrc}' to a subdirectory of itself, '${resolvedDest}'.`);
          }
          if (stat.isSrcSubdir(resolvedDest, resolvedSrc)) {
            throw new Error(`Cannot overwrite '${resolvedDest}' with '${resolvedSrc}'.`);
          }
        }
        return copyLink(resolvedSrc, dest);
      }
    }
    function copyLink(resolvedSrc, dest) {
      fs14.unlinkSync(dest);
      return fs14.symlinkSync(resolvedSrc, dest);
    }
    module2.exports = copySync;
  }
});

// node_modules/fs-extra/lib/copy/index.js
var require_copy2 = __commonJS({
  "node_modules/fs-extra/lib/copy/index.js"(exports2, module2) {
    "use strict";
    var u = require_universalify().fromPromise;
    module2.exports = {
      copy: u(require_copy()),
      copySync: require_copy_sync()
    };
  }
});

// node_modules/fs-extra/lib/remove/index.js
var require_remove = __commonJS({
  "node_modules/fs-extra/lib/remove/index.js"(exports2, module2) {
    "use strict";
    var fs14 = require_graceful_fs();
    var u = require_universalify().fromCallback;
    function remove(path14, callback) {
      fs14.rm(path14, { recursive: true, force: true }, callback);
    }
    function removeSync(path14) {
      fs14.rmSync(path14, { recursive: true, force: true });
    }
    module2.exports = {
      remove: u(remove),
      removeSync
    };
  }
});

// node_modules/fs-extra/lib/empty/index.js
var require_empty = __commonJS({
  "node_modules/fs-extra/lib/empty/index.js"(exports2, module2) {
    "use strict";
    var u = require_universalify().fromPromise;
    var fs14 = require_fs();
    var path14 = require("path");
    var mkdir = require_mkdirs();
    var remove = require_remove();
    var emptyDir = u(async function emptyDir2(dir) {
      let items;
      try {
        items = await fs14.readdir(dir);
      } catch {
        return mkdir.mkdirs(dir);
      }
      return Promise.all(items.map((item) => remove.remove(path14.join(dir, item))));
    });
    function emptyDirSync(dir) {
      let items;
      try {
        items = fs14.readdirSync(dir);
      } catch {
        return mkdir.mkdirsSync(dir);
      }
      items.forEach((item) => {
        item = path14.join(dir, item);
        remove.removeSync(item);
      });
    }
    module2.exports = {
      emptyDirSync,
      emptydirSync: emptyDirSync,
      emptyDir,
      emptydir: emptyDir
    };
  }
});

// node_modules/fs-extra/lib/ensure/file.js
var require_file = __commonJS({
  "node_modules/fs-extra/lib/ensure/file.js"(exports2, module2) {
    "use strict";
    var u = require_universalify().fromPromise;
    var path14 = require("path");
    var fs14 = require_fs();
    var mkdir = require_mkdirs();
    async function createFile(file) {
      let stats;
      try {
        stats = await fs14.stat(file);
      } catch {
      }
      if (stats && stats.isFile())
        return;
      const dir = path14.dirname(file);
      let dirStats = null;
      try {
        dirStats = await fs14.stat(dir);
      } catch (err) {
        if (err.code === "ENOENT") {
          await mkdir.mkdirs(dir);
          await fs14.writeFile(file, "");
          return;
        } else {
          throw err;
        }
      }
      if (dirStats.isDirectory()) {
        await fs14.writeFile(file, "");
      } else {
        await fs14.readdir(dir);
      }
    }
    function createFileSync(file) {
      let stats;
      try {
        stats = fs14.statSync(file);
      } catch {
      }
      if (stats && stats.isFile())
        return;
      const dir = path14.dirname(file);
      try {
        if (!fs14.statSync(dir).isDirectory()) {
          fs14.readdirSync(dir);
        }
      } catch (err) {
        if (err && err.code === "ENOENT")
          mkdir.mkdirsSync(dir);
        else
          throw err;
      }
      fs14.writeFileSync(file, "");
    }
    module2.exports = {
      createFile: u(createFile),
      createFileSync
    };
  }
});

// node_modules/fs-extra/lib/ensure/link.js
var require_link = __commonJS({
  "node_modules/fs-extra/lib/ensure/link.js"(exports2, module2) {
    "use strict";
    var u = require_universalify().fromPromise;
    var path14 = require("path");
    var fs14 = require_fs();
    var mkdir = require_mkdirs();
    var { pathExists } = require_path_exists();
    var { areIdentical } = require_stat();
    async function createLink(srcpath, dstpath) {
      let dstStat;
      try {
        dstStat = await fs14.lstat(dstpath);
      } catch {
      }
      let srcStat;
      try {
        srcStat = await fs14.lstat(srcpath);
      } catch (err) {
        err.message = err.message.replace("lstat", "ensureLink");
        throw err;
      }
      if (dstStat && areIdentical(srcStat, dstStat))
        return;
      const dir = path14.dirname(dstpath);
      const dirExists = await pathExists(dir);
      if (!dirExists) {
        await mkdir.mkdirs(dir);
      }
      await fs14.link(srcpath, dstpath);
    }
    function createLinkSync(srcpath, dstpath) {
      let dstStat;
      try {
        dstStat = fs14.lstatSync(dstpath);
      } catch {
      }
      try {
        const srcStat = fs14.lstatSync(srcpath);
        if (dstStat && areIdentical(srcStat, dstStat))
          return;
      } catch (err) {
        err.message = err.message.replace("lstat", "ensureLink");
        throw err;
      }
      const dir = path14.dirname(dstpath);
      const dirExists = fs14.existsSync(dir);
      if (dirExists)
        return fs14.linkSync(srcpath, dstpath);
      mkdir.mkdirsSync(dir);
      return fs14.linkSync(srcpath, dstpath);
    }
    module2.exports = {
      createLink: u(createLink),
      createLinkSync
    };
  }
});

// node_modules/fs-extra/lib/ensure/symlink-paths.js
var require_symlink_paths = __commonJS({
  "node_modules/fs-extra/lib/ensure/symlink-paths.js"(exports2, module2) {
    "use strict";
    var path14 = require("path");
    var fs14 = require_fs();
    var { pathExists } = require_path_exists();
    var u = require_universalify().fromPromise;
    async function symlinkPaths(srcpath, dstpath) {
      if (path14.isAbsolute(srcpath)) {
        try {
          await fs14.lstat(srcpath);
        } catch (err) {
          err.message = err.message.replace("lstat", "ensureSymlink");
          throw err;
        }
        return {
          toCwd: srcpath,
          toDst: srcpath
        };
      }
      const dstdir = path14.dirname(dstpath);
      const relativeToDst = path14.join(dstdir, srcpath);
      const exists = await pathExists(relativeToDst);
      if (exists) {
        return {
          toCwd: relativeToDst,
          toDst: srcpath
        };
      }
      try {
        await fs14.lstat(srcpath);
      } catch (err) {
        err.message = err.message.replace("lstat", "ensureSymlink");
        throw err;
      }
      return {
        toCwd: srcpath,
        toDst: path14.relative(dstdir, srcpath)
      };
    }
    function symlinkPathsSync(srcpath, dstpath) {
      if (path14.isAbsolute(srcpath)) {
        const exists2 = fs14.existsSync(srcpath);
        if (!exists2)
          throw new Error("absolute srcpath does not exist");
        return {
          toCwd: srcpath,
          toDst: srcpath
        };
      }
      const dstdir = path14.dirname(dstpath);
      const relativeToDst = path14.join(dstdir, srcpath);
      const exists = fs14.existsSync(relativeToDst);
      if (exists) {
        return {
          toCwd: relativeToDst,
          toDst: srcpath
        };
      }
      const srcExists = fs14.existsSync(srcpath);
      if (!srcExists)
        throw new Error("relative srcpath does not exist");
      return {
        toCwd: srcpath,
        toDst: path14.relative(dstdir, srcpath)
      };
    }
    module2.exports = {
      symlinkPaths: u(symlinkPaths),
      symlinkPathsSync
    };
  }
});

// node_modules/fs-extra/lib/ensure/symlink-type.js
var require_symlink_type = __commonJS({
  "node_modules/fs-extra/lib/ensure/symlink-type.js"(exports2, module2) {
    "use strict";
    var fs14 = require_fs();
    var u = require_universalify().fromPromise;
    async function symlinkType(srcpath, type) {
      if (type)
        return type;
      let stats;
      try {
        stats = await fs14.lstat(srcpath);
      } catch {
        return "file";
      }
      return stats && stats.isDirectory() ? "dir" : "file";
    }
    function symlinkTypeSync(srcpath, type) {
      if (type)
        return type;
      let stats;
      try {
        stats = fs14.lstatSync(srcpath);
      } catch {
        return "file";
      }
      return stats && stats.isDirectory() ? "dir" : "file";
    }
    module2.exports = {
      symlinkType: u(symlinkType),
      symlinkTypeSync
    };
  }
});

// node_modules/fs-extra/lib/ensure/symlink.js
var require_symlink = __commonJS({
  "node_modules/fs-extra/lib/ensure/symlink.js"(exports2, module2) {
    "use strict";
    var u = require_universalify().fromPromise;
    var path14 = require("path");
    var fs14 = require_fs();
    var { mkdirs, mkdirsSync } = require_mkdirs();
    var { symlinkPaths, symlinkPathsSync } = require_symlink_paths();
    var { symlinkType, symlinkTypeSync } = require_symlink_type();
    var { pathExists } = require_path_exists();
    var { areIdentical } = require_stat();
    async function createSymlink(srcpath, dstpath, type) {
      let stats;
      try {
        stats = await fs14.lstat(dstpath);
      } catch {
      }
      if (stats && stats.isSymbolicLink()) {
        const [srcStat, dstStat] = await Promise.all([
          fs14.stat(srcpath),
          fs14.stat(dstpath)
        ]);
        if (areIdentical(srcStat, dstStat))
          return;
      }
      const relative = await symlinkPaths(srcpath, dstpath);
      srcpath = relative.toDst;
      const toType = await symlinkType(relative.toCwd, type);
      const dir = path14.dirname(dstpath);
      if (!await pathExists(dir)) {
        await mkdirs(dir);
      }
      return fs14.symlink(srcpath, dstpath, toType);
    }
    function createSymlinkSync(srcpath, dstpath, type) {
      let stats;
      try {
        stats = fs14.lstatSync(dstpath);
      } catch {
      }
      if (stats && stats.isSymbolicLink()) {
        const srcStat = fs14.statSync(srcpath);
        const dstStat = fs14.statSync(dstpath);
        if (areIdentical(srcStat, dstStat))
          return;
      }
      const relative = symlinkPathsSync(srcpath, dstpath);
      srcpath = relative.toDst;
      type = symlinkTypeSync(relative.toCwd, type);
      const dir = path14.dirname(dstpath);
      const exists = fs14.existsSync(dir);
      if (exists)
        return fs14.symlinkSync(srcpath, dstpath, type);
      mkdirsSync(dir);
      return fs14.symlinkSync(srcpath, dstpath, type);
    }
    module2.exports = {
      createSymlink: u(createSymlink),
      createSymlinkSync
    };
  }
});

// node_modules/fs-extra/lib/ensure/index.js
var require_ensure = __commonJS({
  "node_modules/fs-extra/lib/ensure/index.js"(exports2, module2) {
    "use strict";
    var { createFile, createFileSync } = require_file();
    var { createLink, createLinkSync } = require_link();
    var { createSymlink, createSymlinkSync } = require_symlink();
    module2.exports = {
      // file
      createFile,
      createFileSync,
      ensureFile: createFile,
      ensureFileSync: createFileSync,
      // link
      createLink,
      createLinkSync,
      ensureLink: createLink,
      ensureLinkSync: createLinkSync,
      // symlink
      createSymlink,
      createSymlinkSync,
      ensureSymlink: createSymlink,
      ensureSymlinkSync: createSymlinkSync
    };
  }
});

// node_modules/jsonfile/utils.js
var require_utils2 = __commonJS({
  "node_modules/jsonfile/utils.js"(exports2, module2) {
    function stringify(obj, { EOL = "\n", finalEOL = true, replacer = null, spaces } = {}) {
      const EOF = finalEOL ? EOL : "";
      const str = JSON.stringify(obj, replacer, spaces);
      return str.replace(/\n/g, EOL) + EOF;
    }
    function stripBom(content) {
      if (Buffer.isBuffer(content))
        content = content.toString("utf8");
      return content.replace(/^\uFEFF/, "");
    }
    module2.exports = { stringify, stripBom };
  }
});

// node_modules/jsonfile/index.js
var require_jsonfile = __commonJS({
  "node_modules/jsonfile/index.js"(exports2, module2) {
    var _fs;
    try {
      _fs = require_graceful_fs();
    } catch (_) {
      _fs = require("fs");
    }
    var universalify = require_universalify();
    var { stringify, stripBom } = require_utils2();
    async function _readFile(file, options = {}) {
      if (typeof options === "string") {
        options = { encoding: options };
      }
      const fs14 = options.fs || _fs;
      const shouldThrow = "throws" in options ? options.throws : true;
      let data = await universalify.fromCallback(fs14.readFile)(file, options);
      data = stripBom(data);
      let obj;
      try {
        obj = JSON.parse(data, options ? options.reviver : null);
      } catch (err) {
        if (shouldThrow) {
          err.message = `${file}: ${err.message}`;
          throw err;
        } else {
          return null;
        }
      }
      return obj;
    }
    var readFile = universalify.fromPromise(_readFile);
    function readFileSync(file, options = {}) {
      if (typeof options === "string") {
        options = { encoding: options };
      }
      const fs14 = options.fs || _fs;
      const shouldThrow = "throws" in options ? options.throws : true;
      try {
        let content = fs14.readFileSync(file, options);
        content = stripBom(content);
        return JSON.parse(content, options.reviver);
      } catch (err) {
        if (shouldThrow) {
          err.message = `${file}: ${err.message}`;
          throw err;
        } else {
          return null;
        }
      }
    }
    async function _writeFile(file, obj, options = {}) {
      const fs14 = options.fs || _fs;
      const str = stringify(obj, options);
      await universalify.fromCallback(fs14.writeFile)(file, str, options);
    }
    var writeFile = universalify.fromPromise(_writeFile);
    function writeFileSync(file, obj, options = {}) {
      const fs14 = options.fs || _fs;
      const str = stringify(obj, options);
      return fs14.writeFileSync(file, str, options);
    }
    module2.exports = {
      readFile,
      readFileSync,
      writeFile,
      writeFileSync
    };
  }
});

// node_modules/fs-extra/lib/json/jsonfile.js
var require_jsonfile2 = __commonJS({
  "node_modules/fs-extra/lib/json/jsonfile.js"(exports2, module2) {
    "use strict";
    var jsonFile = require_jsonfile();
    module2.exports = {
      // jsonfile exports
      readJson: jsonFile.readFile,
      readJsonSync: jsonFile.readFileSync,
      writeJson: jsonFile.writeFile,
      writeJsonSync: jsonFile.writeFileSync
    };
  }
});

// node_modules/fs-extra/lib/output-file/index.js
var require_output_file = __commonJS({
  "node_modules/fs-extra/lib/output-file/index.js"(exports2, module2) {
    "use strict";
    var u = require_universalify().fromPromise;
    var fs14 = require_fs();
    var path14 = require("path");
    var mkdir = require_mkdirs();
    var pathExists = require_path_exists().pathExists;
    async function outputFile(file, data, encoding = "utf-8") {
      const dir = path14.dirname(file);
      if (!await pathExists(dir)) {
        await mkdir.mkdirs(dir);
      }
      return fs14.writeFile(file, data, encoding);
    }
    function outputFileSync(file, ...args2) {
      const dir = path14.dirname(file);
      if (!fs14.existsSync(dir)) {
        mkdir.mkdirsSync(dir);
      }
      fs14.writeFileSync(file, ...args2);
    }
    module2.exports = {
      outputFile: u(outputFile),
      outputFileSync
    };
  }
});

// node_modules/fs-extra/lib/json/output-json.js
var require_output_json = __commonJS({
  "node_modules/fs-extra/lib/json/output-json.js"(exports2, module2) {
    "use strict";
    var { stringify } = require_utils2();
    var { outputFile } = require_output_file();
    async function outputJson(file, data, options = {}) {
      const str = stringify(data, options);
      await outputFile(file, str, options);
    }
    module2.exports = outputJson;
  }
});

// node_modules/fs-extra/lib/json/output-json-sync.js
var require_output_json_sync = __commonJS({
  "node_modules/fs-extra/lib/json/output-json-sync.js"(exports2, module2) {
    "use strict";
    var { stringify } = require_utils2();
    var { outputFileSync } = require_output_file();
    function outputJsonSync(file, data, options) {
      const str = stringify(data, options);
      outputFileSync(file, str, options);
    }
    module2.exports = outputJsonSync;
  }
});

// node_modules/fs-extra/lib/json/index.js
var require_json = __commonJS({
  "node_modules/fs-extra/lib/json/index.js"(exports2, module2) {
    "use strict";
    var u = require_universalify().fromPromise;
    var jsonFile = require_jsonfile2();
    jsonFile.outputJson = u(require_output_json());
    jsonFile.outputJsonSync = require_output_json_sync();
    jsonFile.outputJSON = jsonFile.outputJson;
    jsonFile.outputJSONSync = jsonFile.outputJsonSync;
    jsonFile.writeJSON = jsonFile.writeJson;
    jsonFile.writeJSONSync = jsonFile.writeJsonSync;
    jsonFile.readJSON = jsonFile.readJson;
    jsonFile.readJSONSync = jsonFile.readJsonSync;
    module2.exports = jsonFile;
  }
});

// node_modules/fs-extra/lib/move/move.js
var require_move = __commonJS({
  "node_modules/fs-extra/lib/move/move.js"(exports2, module2) {
    "use strict";
    var fs14 = require_fs();
    var path14 = require("path");
    var { copy } = require_copy2();
    var { remove } = require_remove();
    var { mkdirp } = require_mkdirs();
    var { pathExists } = require_path_exists();
    var stat = require_stat();
    async function move(src, dest, opts = {}) {
      const overwrite = opts.overwrite || opts.clobber || false;
      const { srcStat, isChangingCase = false } = await stat.checkPaths(src, dest, "move", opts);
      await stat.checkParentPaths(src, srcStat, dest, "move");
      const destParent = path14.dirname(dest);
      const parsedParentPath = path14.parse(destParent);
      if (parsedParentPath.root !== destParent) {
        await mkdirp(destParent);
      }
      return doRename(src, dest, overwrite, isChangingCase);
    }
    async function doRename(src, dest, overwrite, isChangingCase) {
      if (!isChangingCase) {
        if (overwrite) {
          await remove(dest);
        } else if (await pathExists(dest)) {
          throw new Error("dest already exists.");
        }
      }
      try {
        await fs14.rename(src, dest);
      } catch (err) {
        if (err.code !== "EXDEV") {
          throw err;
        }
        await moveAcrossDevice(src, dest, overwrite);
      }
    }
    async function moveAcrossDevice(src, dest, overwrite) {
      const opts = {
        overwrite,
        errorOnExist: true,
        preserveTimestamps: true
      };
      await copy(src, dest, opts);
      return remove(src);
    }
    module2.exports = move;
  }
});

// node_modules/fs-extra/lib/move/move-sync.js
var require_move_sync = __commonJS({
  "node_modules/fs-extra/lib/move/move-sync.js"(exports2, module2) {
    "use strict";
    var fs14 = require_graceful_fs();
    var path14 = require("path");
    var copySync = require_copy2().copySync;
    var removeSync = require_remove().removeSync;
    var mkdirpSync = require_mkdirs().mkdirpSync;
    var stat = require_stat();
    function moveSync(src, dest, opts) {
      opts = opts || {};
      const overwrite = opts.overwrite || opts.clobber || false;
      const { srcStat, isChangingCase = false } = stat.checkPathsSync(src, dest, "move", opts);
      stat.checkParentPathsSync(src, srcStat, dest, "move");
      if (!isParentRoot(dest))
        mkdirpSync(path14.dirname(dest));
      return doRename(src, dest, overwrite, isChangingCase);
    }
    function isParentRoot(dest) {
      const parent = path14.dirname(dest);
      const parsedPath = path14.parse(parent);
      return parsedPath.root === parent;
    }
    function doRename(src, dest, overwrite, isChangingCase) {
      if (isChangingCase)
        return rename(src, dest, overwrite);
      if (overwrite) {
        removeSync(dest);
        return rename(src, dest, overwrite);
      }
      if (fs14.existsSync(dest))
        throw new Error("dest already exists.");
      return rename(src, dest, overwrite);
    }
    function rename(src, dest, overwrite) {
      try {
        fs14.renameSync(src, dest);
      } catch (err) {
        if (err.code !== "EXDEV")
          throw err;
        return moveAcrossDevice(src, dest, overwrite);
      }
    }
    function moveAcrossDevice(src, dest, overwrite) {
      const opts = {
        overwrite,
        errorOnExist: true,
        preserveTimestamps: true
      };
      copySync(src, dest, opts);
      return removeSync(src);
    }
    module2.exports = moveSync;
  }
});

// node_modules/fs-extra/lib/move/index.js
var require_move2 = __commonJS({
  "node_modules/fs-extra/lib/move/index.js"(exports2, module2) {
    "use strict";
    var u = require_universalify().fromPromise;
    module2.exports = {
      move: u(require_move()),
      moveSync: require_move_sync()
    };
  }
});

// node_modules/fs-extra/lib/index.js
var require_lib = __commonJS({
  "node_modules/fs-extra/lib/index.js"(exports2, module2) {
    "use strict";
    module2.exports = {
      // Export promiseified graceful-fs:
      ...require_fs(),
      // Export extra methods:
      ...require_copy2(),
      ...require_empty(),
      ...require_ensure(),
      ...require_json(),
      ...require_mkdirs(),
      ...require_move2(),
      ...require_output_file(),
      ...require_path_exists(),
      ...require_remove()
    };
  }
});

// src/config/schema.ts
function getManagedPaths(items) {
  if (!items)
    return [];
  return items.map((item) => typeof item === "string" ? item : item.path);
}
function getManagedHash(items, relativePath) {
  if (!items)
    return void 0;
  for (const item of items) {
    if (typeof item === "string")
      continue;
    if (item.path === relativePath)
      return item.hash;
  }
  return void 0;
}
var DEFAULT_CONFIG;
var init_schema = __esm({
  "src/config/schema.ts"() {
    "use strict";
    DEFAULT_CONFIG = {
      platforms: [],
      autoUpdate: true,
      enableMemory: true,
      lastCheck: (/* @__PURE__ */ new Date()).toISOString(),
      cooldownHours: 24,
      rememberChoice: true,
      installedExtensions: []
    };
  }
});

// node_modules/isexe/windows.js
var require_windows = __commonJS({
  "node_modules/isexe/windows.js"(exports2, module2) {
    module2.exports = isexe;
    isexe.sync = sync;
    var fs14 = require("fs");
    function checkPathExt(path14, options) {
      var pathext = options.pathExt !== void 0 ? options.pathExt : process.env.PATHEXT;
      if (!pathext) {
        return true;
      }
      pathext = pathext.split(";");
      if (pathext.indexOf("") !== -1) {
        return true;
      }
      for (var i = 0; i < pathext.length; i++) {
        var p = pathext[i].toLowerCase();
        if (p && path14.substr(-p.length).toLowerCase() === p) {
          return true;
        }
      }
      return false;
    }
    function checkStat(stat, path14, options) {
      if (!stat.isSymbolicLink() && !stat.isFile()) {
        return false;
      }
      return checkPathExt(path14, options);
    }
    function isexe(path14, options, cb) {
      fs14.stat(path14, function(er, stat) {
        cb(er, er ? false : checkStat(stat, path14, options));
      });
    }
    function sync(path14, options) {
      return checkStat(fs14.statSync(path14), path14, options);
    }
  }
});

// node_modules/isexe/mode.js
var require_mode = __commonJS({
  "node_modules/isexe/mode.js"(exports2, module2) {
    module2.exports = isexe;
    isexe.sync = sync;
    var fs14 = require("fs");
    function isexe(path14, options, cb) {
      fs14.stat(path14, function(er, stat) {
        cb(er, er ? false : checkStat(stat, options));
      });
    }
    function sync(path14, options) {
      return checkStat(fs14.statSync(path14), options);
    }
    function checkStat(stat, options) {
      return stat.isFile() && checkMode(stat, options);
    }
    function checkMode(stat, options) {
      var mod = stat.mode;
      var uid = stat.uid;
      var gid = stat.gid;
      var myUid = options.uid !== void 0 ? options.uid : process.getuid && process.getuid();
      var myGid = options.gid !== void 0 ? options.gid : process.getgid && process.getgid();
      var u = parseInt("100", 8);
      var g = parseInt("010", 8);
      var o = parseInt("001", 8);
      var ug = u | g;
      var ret = mod & o || mod & g && gid === myGid || mod & u && uid === myUid || mod & ug && myUid === 0;
      return ret;
    }
  }
});

// node_modules/isexe/index.js
var require_isexe = __commonJS({
  "node_modules/isexe/index.js"(exports2, module2) {
    var fs14 = require("fs");
    var core;
    if (process.platform === "win32" || global.TESTING_WINDOWS) {
      core = require_windows();
    } else {
      core = require_mode();
    }
    module2.exports = isexe;
    isexe.sync = sync;
    function isexe(path14, options, cb) {
      if (typeof options === "function") {
        cb = options;
        options = {};
      }
      if (!cb) {
        if (typeof Promise !== "function") {
          throw new TypeError("callback not provided");
        }
        return new Promise(function(resolve, reject) {
          isexe(path14, options || {}, function(er, is) {
            if (er) {
              reject(er);
            } else {
              resolve(is);
            }
          });
        });
      }
      core(path14, options || {}, function(er, is) {
        if (er) {
          if (er.code === "EACCES" || options && options.ignoreErrors) {
            er = null;
            is = false;
          }
        }
        cb(er, is);
      });
    }
    function sync(path14, options) {
      try {
        return core.sync(path14, options || {});
      } catch (er) {
        if (options && options.ignoreErrors || er.code === "EACCES") {
          return false;
        } else {
          throw er;
        }
      }
    }
  }
});

// node_modules/which/which.js
var require_which = __commonJS({
  "node_modules/which/which.js"(exports2, module2) {
    var isWindows = process.platform === "win32" || process.env.OSTYPE === "cygwin" || process.env.OSTYPE === "msys";
    var path14 = require("path");
    var COLON = isWindows ? ";" : ":";
    var isexe = require_isexe();
    var getNotFoundError = (cmd) => Object.assign(new Error(`not found: ${cmd}`), { code: "ENOENT" });
    var getPathInfo = (cmd, opt) => {
      const colon = opt.colon || COLON;
      const pathEnv = cmd.match(/\//) || isWindows && cmd.match(/\\/) ? [""] : [
        // windows always checks the cwd first
        ...isWindows ? [process.cwd()] : [],
        ...(opt.path || process.env.PATH || /* istanbul ignore next: very unusual */
        "").split(colon)
      ];
      const pathExtExe = isWindows ? opt.pathExt || process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM" : "";
      const pathExt = isWindows ? pathExtExe.split(colon) : [""];
      if (isWindows) {
        if (cmd.indexOf(".") !== -1 && pathExt[0] !== "")
          pathExt.unshift("");
      }
      return {
        pathEnv,
        pathExt,
        pathExtExe
      };
    };
    var which = (cmd, opt, cb) => {
      if (typeof opt === "function") {
        cb = opt;
        opt = {};
      }
      if (!opt)
        opt = {};
      const { pathEnv, pathExt, pathExtExe } = getPathInfo(cmd, opt);
      const found = [];
      const step = (i) => new Promise((resolve, reject) => {
        if (i === pathEnv.length)
          return opt.all && found.length ? resolve(found) : reject(getNotFoundError(cmd));
        const ppRaw = pathEnv[i];
        const pathPart = /^".*"$/.test(ppRaw) ? ppRaw.slice(1, -1) : ppRaw;
        const pCmd = path14.join(pathPart, cmd);
        const p = !pathPart && /^\.[\\\/]/.test(cmd) ? cmd.slice(0, 2) + pCmd : pCmd;
        resolve(subStep(p, i, 0));
      });
      const subStep = (p, i, ii) => new Promise((resolve, reject) => {
        if (ii === pathExt.length)
          return resolve(step(i + 1));
        const ext = pathExt[ii];
        isexe(p + ext, { pathExt: pathExtExe }, (er, is) => {
          if (!er && is) {
            if (opt.all)
              found.push(p + ext);
            else
              return resolve(p + ext);
          }
          return resolve(subStep(p, i, ii + 1));
        });
      });
      return cb ? step(0).then((res) => cb(null, res), cb) : step(0);
    };
    var whichSync = (cmd, opt) => {
      opt = opt || {};
      const { pathEnv, pathExt, pathExtExe } = getPathInfo(cmd, opt);
      const found = [];
      for (let i = 0; i < pathEnv.length; i++) {
        const ppRaw = pathEnv[i];
        const pathPart = /^".*"$/.test(ppRaw) ? ppRaw.slice(1, -1) : ppRaw;
        const pCmd = path14.join(pathPart, cmd);
        const p = !pathPart && /^\.[\\\/]/.test(cmd) ? cmd.slice(0, 2) + pCmd : pCmd;
        for (let j = 0; j < pathExt.length; j++) {
          const cur = p + pathExt[j];
          try {
            const is = isexe.sync(cur, { pathExt: pathExtExe });
            if (is) {
              if (opt.all)
                found.push(cur);
              else
                return cur;
            }
          } catch (ex) {
          }
        }
      }
      if (opt.all && found.length)
        return found;
      if (opt.nothrow)
        return null;
      throw getNotFoundError(cmd);
    };
    module2.exports = which;
    which.sync = whichSync;
  }
});

// node_modules/path-key/index.js
var require_path_key = __commonJS({
  "node_modules/path-key/index.js"(exports2, module2) {
    "use strict";
    var pathKey = (options = {}) => {
      const environment = options.env || process.env;
      const platform2 = options.platform || process.platform;
      if (platform2 !== "win32") {
        return "PATH";
      }
      return Object.keys(environment).reverse().find((key) => key.toUpperCase() === "PATH") || "Path";
    };
    module2.exports = pathKey;
    module2.exports.default = pathKey;
  }
});

// node_modules/cross-spawn/lib/util/resolveCommand.js
var require_resolveCommand = __commonJS({
  "node_modules/cross-spawn/lib/util/resolveCommand.js"(exports2, module2) {
    "use strict";
    var path14 = require("path");
    var which = require_which();
    var getPathKey = require_path_key();
    function resolveCommandAttempt(parsed, withoutPathExt) {
      const env = parsed.options.env || process.env;
      const cwd = process.cwd();
      const hasCustomCwd = parsed.options.cwd != null;
      const shouldSwitchCwd = hasCustomCwd && process.chdir !== void 0 && !process.chdir.disabled;
      if (shouldSwitchCwd) {
        try {
          process.chdir(parsed.options.cwd);
        } catch (err) {
        }
      }
      let resolved;
      try {
        resolved = which.sync(parsed.command, {
          path: env[getPathKey({ env })],
          pathExt: withoutPathExt ? path14.delimiter : void 0
        });
      } catch (e) {
      } finally {
        if (shouldSwitchCwd) {
          process.chdir(cwd);
        }
      }
      if (resolved) {
        resolved = path14.resolve(hasCustomCwd ? parsed.options.cwd : "", resolved);
      }
      return resolved;
    }
    function resolveCommand(parsed) {
      return resolveCommandAttempt(parsed) || resolveCommandAttempt(parsed, true);
    }
    module2.exports = resolveCommand;
  }
});

// node_modules/cross-spawn/lib/util/escape.js
var require_escape = __commonJS({
  "node_modules/cross-spawn/lib/util/escape.js"(exports2, module2) {
    "use strict";
    var metaCharsRegExp = /([()\][%!^"`<>&|;, *?])/g;
    function escapeCommand(arg) {
      arg = arg.replace(metaCharsRegExp, "^$1");
      return arg;
    }
    function escapeArgument(arg, doubleEscapeMetaChars) {
      arg = `${arg}`;
      arg = arg.replace(/(?=(\\+?)?)\1"/g, '$1$1\\"');
      arg = arg.replace(/(?=(\\+?)?)\1$/, "$1$1");
      arg = `"${arg}"`;
      arg = arg.replace(metaCharsRegExp, "^$1");
      if (doubleEscapeMetaChars) {
        arg = arg.replace(metaCharsRegExp, "^$1");
      }
      return arg;
    }
    module2.exports.command = escapeCommand;
    module2.exports.argument = escapeArgument;
  }
});

// node_modules/shebang-regex/index.js
var require_shebang_regex = __commonJS({
  "node_modules/shebang-regex/index.js"(exports2, module2) {
    "use strict";
    module2.exports = /^#!(.*)/;
  }
});

// node_modules/shebang-command/index.js
var require_shebang_command = __commonJS({
  "node_modules/shebang-command/index.js"(exports2, module2) {
    "use strict";
    var shebangRegex = require_shebang_regex();
    module2.exports = (string = "") => {
      const match = string.match(shebangRegex);
      if (!match) {
        return null;
      }
      const [path14, argument] = match[0].replace(/#! ?/, "").split(" ");
      const binary = path14.split("/").pop();
      if (binary === "env") {
        return argument;
      }
      return argument ? `${binary} ${argument}` : binary;
    };
  }
});

// node_modules/cross-spawn/lib/util/readShebang.js
var require_readShebang = __commonJS({
  "node_modules/cross-spawn/lib/util/readShebang.js"(exports2, module2) {
    "use strict";
    var fs14 = require("fs");
    var shebangCommand = require_shebang_command();
    function readShebang(command) {
      const size = 150;
      const buffer = Buffer.alloc(size);
      let fd;
      try {
        fd = fs14.openSync(command, "r");
        fs14.readSync(fd, buffer, 0, size, 0);
        fs14.closeSync(fd);
      } catch (e) {
      }
      return shebangCommand(buffer.toString());
    }
    module2.exports = readShebang;
  }
});

// node_modules/cross-spawn/lib/parse.js
var require_parse2 = __commonJS({
  "node_modules/cross-spawn/lib/parse.js"(exports2, module2) {
    "use strict";
    var path14 = require("path");
    var resolveCommand = require_resolveCommand();
    var escape = require_escape();
    var readShebang = require_readShebang();
    var isWin = process.platform === "win32";
    var isExecutableRegExp = /\.(?:com|exe)$/i;
    var isCmdShimRegExp = /node_modules[\\/].bin[\\/][^\\/]+\.cmd$/i;
    function detectShebang(parsed) {
      parsed.file = resolveCommand(parsed);
      const shebang = parsed.file && readShebang(parsed.file);
      if (shebang) {
        parsed.args.unshift(parsed.file);
        parsed.command = shebang;
        return resolveCommand(parsed);
      }
      return parsed.file;
    }
    function parseNonShell(parsed) {
      if (!isWin) {
        return parsed;
      }
      const commandFile = detectShebang(parsed);
      const needsShell = !isExecutableRegExp.test(commandFile);
      if (parsed.options.forceShell || needsShell) {
        const needsDoubleEscapeMetaChars = isCmdShimRegExp.test(commandFile);
        parsed.command = path14.normalize(parsed.command);
        parsed.command = escape.command(parsed.command);
        parsed.args = parsed.args.map((arg) => escape.argument(arg, needsDoubleEscapeMetaChars));
        const shellCommand = [parsed.command].concat(parsed.args).join(" ");
        parsed.args = ["/d", "/s", "/c", `"${shellCommand}"`];
        parsed.command = process.env.comspec || "cmd.exe";
        parsed.options.windowsVerbatimArguments = true;
      }
      return parsed;
    }
    function parse(command, args2, options) {
      if (args2 && !Array.isArray(args2)) {
        options = args2;
        args2 = null;
      }
      args2 = args2 ? args2.slice(0) : [];
      options = Object.assign({}, options);
      const parsed = {
        command,
        args: args2,
        options,
        file: void 0,
        original: {
          command,
          args: args2
        }
      };
      return options.shell ? parsed : parseNonShell(parsed);
    }
    module2.exports = parse;
  }
});

// node_modules/cross-spawn/lib/enoent.js
var require_enoent = __commonJS({
  "node_modules/cross-spawn/lib/enoent.js"(exports2, module2) {
    "use strict";
    var isWin = process.platform === "win32";
    function notFoundError(original, syscall) {
      return Object.assign(new Error(`${syscall} ${original.command} ENOENT`), {
        code: "ENOENT",
        errno: "ENOENT",
        syscall: `${syscall} ${original.command}`,
        path: original.command,
        spawnargs: original.args
      });
    }
    function hookChildProcess(cp, parsed) {
      if (!isWin) {
        return;
      }
      const originalEmit = cp.emit;
      cp.emit = function(name, arg1) {
        if (name === "exit") {
          const err = verifyENOENT(arg1, parsed);
          if (err) {
            return originalEmit.call(cp, "error", err);
          }
        }
        return originalEmit.apply(cp, arguments);
      };
    }
    function verifyENOENT(status, parsed) {
      if (isWin && status === 1 && !parsed.file) {
        return notFoundError(parsed.original, "spawn");
      }
      return null;
    }
    function verifyENOENTSync(status, parsed) {
      if (isWin && status === 1 && !parsed.file) {
        return notFoundError(parsed.original, "spawnSync");
      }
      return null;
    }
    module2.exports = {
      hookChildProcess,
      verifyENOENT,
      verifyENOENTSync,
      notFoundError
    };
  }
});

// node_modules/cross-spawn/index.js
var require_cross_spawn = __commonJS({
  "node_modules/cross-spawn/index.js"(exports2, module2) {
    "use strict";
    var cp = require("child_process");
    var parse = require_parse2();
    var enoent = require_enoent();
    function spawn(command, args2, options) {
      const parsed = parse(command, args2, options);
      const spawned = cp.spawn(parsed.command, parsed.args, parsed.options);
      enoent.hookChildProcess(spawned, parsed);
      return spawned;
    }
    function spawnSync(command, args2, options) {
      const parsed = parse(command, args2, options);
      const result = cp.spawnSync(parsed.command, parsed.args, parsed.options);
      result.error = result.error || enoent.verifyENOENTSync(result.status, parsed);
      return result;
    }
    module2.exports = spawn;
    module2.exports.spawn = spawn;
    module2.exports.sync = spawnSync;
    module2.exports._parse = parse;
    module2.exports._enoent = enoent;
  }
});

// src/updater/standalone.ts
var import_fs5 = __toESM(require("fs"), 1);
var import_path13 = __toESM(require("path"), 1);
var import_os7 = __toESM(require("os"), 1);
var import_semver2 = __toESM(require_semver2(), 1);

// src/utils/logger.ts
var import_fs = __toESM(require("fs"), 1);
var import_path = __toESM(require("path"), 1);
var import_os = __toESM(require("os"), 1);
var LOG_DIR = import_path.default.join(import_os.default.homedir(), ".dev-pomogator", "logs");
var MAX_LOG_SIZE = 1024 * 1024;
function createLogger(filename) {
  const logFile = import_path.default.join(LOG_DIR, filename);
  function log(level, message) {
    try {
      import_fs.default.mkdirSync(LOG_DIR, { recursive: true });
      if (import_fs.default.existsSync(logFile)) {
        const stats = import_fs.default.statSync(logFile);
        if (stats.size > MAX_LOG_SIZE) {
          import_fs.default.renameSync(logFile, logFile + ".old");
        }
      }
      const timestamp = (/* @__PURE__ */ new Date()).toISOString();
      const line = `[${timestamp}] [${level}] ${message}
`;
      import_fs.default.appendFileSync(logFile, line);
    } catch {
    }
  }
  return {
    info: (msg) => log("INFO", msg),
    warn: (msg) => log("WARN", msg),
    error: (msg) => log("ERROR", msg)
  };
}
function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
function formatErrorChain(error) {
  if (!(error instanceof Error))
    return String(error);
  const parts = [];
  let current = error;
  let depth = 0;
  while (current && depth < 10) {
    const prefix = depth === 0 ? "" : "Caused by: ";
    parts.push(`${prefix}${current.message}`);
    if (current.stack) {
      const stackLines = current.stack.split("\n").slice(1).join("\n");
      if (stackLines.trim())
        parts.push(stackLines);
    }
    current = current.cause instanceof Error ? current.cause : void 0;
    depth++;
  }
  return parts.join("\n");
}
var logger = createLogger("update.log");

// src/config/index.ts
var import_fs_extra = __toESM(require_lib(), 1);
var import_path2 = __toESM(require("path"), 1);
var import_os2 = __toESM(require("os"), 1);
var CONFIG_DIR = import_path2.default.join(import_os2.default.homedir(), ".dev-pomogator");
var CONFIG_FILE = import_path2.default.join(CONFIG_DIR, "config.json");
async function loadConfig() {
  try {
    if (await import_fs_extra.default.pathExists(CONFIG_FILE)) {
      const config = await import_fs_extra.default.readJson(CONFIG_FILE);
      return normalizeConfig(config);
    }
  } catch {
  }
  return null;
}
function normalizeManagedItems(items) {
  if (!items || items.length === 0)
    return items;
  if (items.every((i) => typeof i !== "string"))
    return items;
  return items.map(
    (item) => typeof item === "string" ? { path: item, hash: "" } : item
  );
}
function normalizeManagedEntry(managed) {
  return {
    ...managed,
    commands: normalizeManagedItems(managed.commands),
    rules: normalizeManagedItems(managed.rules),
    tools: normalizeManagedItems(managed.tools)
  };
}
function normalizeConfig(config) {
  const normalized = {
    ...config,
    installedExtensions: Array.isArray(config.installedExtensions) ? config.installedExtensions.map((ext) => {
      const rawManaged = ext.managed ?? {};
      const normalizedManaged = {};
      for (const [projectPath, entry] of Object.entries(rawManaged)) {
        normalizedManaged[projectPath] = normalizeManagedEntry(entry);
      }
      return {
        ...ext,
        projectPaths: Array.isArray(ext.projectPaths) ? ext.projectPaths : [],
        managed: normalizedManaged
      };
    }) : []
  };
  return normalized;
}
async function saveConfig(config) {
  await import_fs_extra.default.ensureDir(CONFIG_DIR);
  const tempFile = import_path2.default.join(CONFIG_DIR, "config.json.tmp");
  await import_fs_extra.default.writeJson(tempFile, config, { spaces: 2 });
  if (process.platform !== "win32") {
    await import_fs_extra.default.chmod(tempFile, 384);
  }
  await import_fs_extra.default.move(tempFile, CONFIG_FILE, { overwrite: true });
}
function getConfigDir() {
  return CONFIG_DIR;
}

// src/updater/index.ts
init_schema();

// src/updater/cooldown.ts
function shouldCheckUpdate(config) {
  if (!config.lastCheck) {
    return true;
  }
  const lastCheck = new Date(config.lastCheck);
  if (Number.isNaN(lastCheck.getTime())) {
    return true;
  }
  const now = /* @__PURE__ */ new Date();
  const hoursSinceLastCheck = (now.getTime() - lastCheck.getTime()) / (1e3 * 60 * 60);
  return hoursSinceLastCheck >= config.cooldownHours;
}

// src/updater/github.ts
var import_fs_extra2 = __toESM(require_lib(), 1);
var import_path3 = __toESM(require("path"), 1);
var RAW_BASE = "https://raw.githubusercontent.com/stgmt/dev-pomogator/main";
var MAX_RETRIES = 3;
var RETRY_DELAY_MS = 2e3;
var FETCH_TIMEOUT_MS = 15e3;
function getLocalUpdateSourceRoot() {
  return process.env.DEV_POMOGATOR_UPDATE_SOURCE_ROOT || null;
}
async function readLocalUpdateFile(relativePath) {
  const sourceRoot = getLocalUpdateSourceRoot();
  if (!sourceRoot) {
    return null;
  }
  const base = import_path3.default.resolve(sourceRoot);
  const resolved = import_path3.default.resolve(base, relativePath);
  const relative = import_path3.default.relative(base, resolved);
  if (relative.startsWith("..") || import_path3.default.isAbsolute(relative)) {
    return null;
  }
  if (!await import_fs_extra2.default.pathExists(resolved)) {
    return null;
  }
  return import_fs_extra2.default.readFile(resolved, "utf-8");
}
async function fetchWithRetry(url) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "dev-pomogator" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
      });
      if (!response.ok) {
        console.log(`  \u26A0 HTTP ${response.status} for ${url}`);
        return null;
      }
      return response;
    } catch (error) {
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
        continue;
      }
      const message = error instanceof Error ? error.message : String(error);
      console.log(`  \u26A0 Fetch failed for ${url}: ${message}`);
      return null;
    }
  }
  return null;
}
async function fetchExtensionManifest(name) {
  const localManifest = await readLocalUpdateFile(`extensions/${name}/extension.json`);
  if (localManifest) {
    return JSON.parse(localManifest);
  }
  const url = `${RAW_BASE}/extensions/${name}/extension.json`;
  const response = await fetchWithRetry(url);
  if (!response)
    return null;
  return response.json();
}
async function downloadExtensionFile(extensionName, relativePath) {
  if (relativePath.startsWith(".claude/rules/") || relativePath.startsWith(".claude/commands/") || relativePath.startsWith(".claude/skills/")) {
    const localFile2 = await readLocalUpdateFile(relativePath);
    if (localFile2 !== null)
      return localFile2;
    const url2 = `${RAW_BASE}/${relativePath}`;
    const response2 = await fetchWithRetry(url2);
    if (!response2)
      return null;
    return response2.text();
  }
  const remotePath = relativePath.replace(/^\.dev-pomogator\//, "").replace(/^\.claude\//, "");
  const localFile = await readLocalUpdateFile(`extensions/${extensionName}/${remotePath}`);
  if (localFile !== null) {
    return localFile;
  }
  const url = `${RAW_BASE}/extensions/${extensionName}/${remotePath}`;
  const response = await fetchWithRetry(url);
  if (!response)
    return null;
  return response.text();
}

// src/updater/lock.ts
var import_fs_extra3 = __toESM(require_lib(), 1);
var import_path4 = __toESM(require("path"), 1);
var import_os3 = __toESM(require("os"), 1);
var LOCK_FILE = import_path4.default.join(import_os3.default.homedir(), ".dev-pomogator", "update.lock");
var LOCK_STALE = LOCK_FILE + ".stale";
var LOCK_TIMEOUT = 60 * 1e3;
async function tryCreateLock() {
  try {
    await import_fs_extra3.default.ensureDir(import_path4.default.dirname(LOCK_FILE));
    await import_fs_extra3.default.writeFile(LOCK_FILE, process.pid.toString(), { flag: "wx" });
    return true;
  } catch (error) {
    if (error?.code === "EEXIST") {
      return false;
    }
    return false;
  }
}
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
async function isLockStale() {
  try {
    const [content, stat] = await Promise.all([
      import_fs_extra3.default.readFile(LOCK_FILE, "utf-8"),
      import_fs_extra3.default.stat(LOCK_FILE)
    ]);
    const pid = parseInt(content.trim(), 10);
    if (!Number.isNaN(pid) && pid > 0) {
      if (!isProcessAlive(pid)) {
        return true;
      }
    }
    return Date.now() - stat.mtimeMs > LOCK_TIMEOUT;
  } catch {
    return true;
  }
}
async function acquireLock() {
  try {
    if (await tryCreateLock()) {
      return true;
    }
    if (await isLockStale()) {
      try {
        await import_fs_extra3.default.rename(LOCK_FILE, LOCK_STALE);
      } catch {
        return false;
      }
      const acquired = await tryCreateLock();
      import_fs_extra3.default.remove(LOCK_STALE).catch(() => {
      });
      return acquired;
    }
    return false;
  } catch {
    return false;
  }
}
async function releaseLock() {
  try {
    await import_fs_extra3.default.remove(LOCK_FILE);
  } catch {
  }
}

// src/installer/extensions.ts
var import_fs_extra4 = __toESM(require_lib(), 1);
var import_path6 = __toESM(require("path"), 1);
var import_child_process = require("child_process");
var import_cross_spawn = __toESM(require_cross_spawn(), 1);
var import_url = require("url");

// src/utils/msys.ts
var import_fs2 = __toESM(require("fs"), 1);
var import_path5 = __toESM(require("path"), 1);
function getMsysSafeEnv(baseEnv) {
  const env = { ...baseEnv ?? process.env };
  if (process.platform === "win32") {
    env.MSYS_NO_PATHCONV = "1";
    env.MSYS2_ARG_CONV_EXCL = "*";
  }
  return env;
}
function detectMangledArtifacts(projectRoot) {
  const artifacts = [];
  try {
    const entries = import_fs2.default.readdirSync(projectRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && /^[A-Za-z]:$/.test(entry.name)) {
        const nested = import_path5.default.join(projectRoot, entry.name, "Program Files", "Git");
        if (import_fs2.default.existsSync(nested)) {
          artifacts.push(entry.name);
        }
      }
    }
  } catch {
  }
  return artifacts;
}

// src/installer/extensions.ts
var __dirname = import_path6.default.dirname((0, import_url.fileURLToPath)(importMetaUrl));
var PostUpdateHookError = class extends Error {
  constructor(extensionName, message) {
    super(`Post-update hook failed for ${extensionName}: ${message}`);
    this.name = "PostUpdateHookError";
  }
};
function execShellCommand(command, opts) {
  return new Promise((resolve, reject) => {
    const parts = command.split(/\s+/);
    const child = (0, import_cross_spawn.default)(parts[0], parts.slice(1), {
      cwd: opts.cwd,
      stdio: opts.stdio,
      env: opts.env
    });
    let stderr = "";
    if (opts.stdio === "pipe" && child.stderr) {
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
    }
    child.on("error", (err) => {
      reject(new Error(`Command failed: ${command}
${err.message}`));
    });
    child.on("close", (code) => {
      if (code !== 0) {
        const msg = stderr ? `
${stderr.trim()}` : "";
        reject(new Error(`Command failed with exit code ${code}: ${command}${msg}`));
      } else {
        resolve();
      }
    });
  });
}
function isCI() {
  return !!(process.env.CI || process.env.GITHUB_ACTIONS || process.env.GITLAB_CI || process.env.JENKINS_URL || process.env.CIRCLECI || process.env.TRAVIS);
}
function isNonInteractive() {
  return isCI() || !process.stdin.isTTY || !process.stdout.isTTY;
}
function augmentCommandForNonInteractive(command) {
  if (command.includes("configure.py") && !command.includes("--non-interactive")) {
    return command.replace("configure.py", "configure.py --non-interactive");
  }
  return command;
}
function getPostUpdateHook(extension, platform2) {
  if (!extension.postUpdate)
    return void 0;
  const postUpdate = extension.postUpdate;
  if ("command" in postUpdate) {
    return postUpdate;
  }
  if (platform2 && postUpdate[platform2]) {
    return postUpdate[platform2];
  }
  return void 0;
}
function isRecoverableNpmError(error) {
  const msg = String(error instanceof Error ? error.message : error);
  return msg.includes("ENOTEMPTY") || msg.includes("MODULE_NOT_FOUND") || msg.includes("Cannot find module") || msg.includes("ERR_MODULE_NOT_FOUND");
}
function cleanNpxCache() {
  try {
    const cache = (0, import_child_process.execSync)("npm config get cache", {
      encoding: "utf-8",
      timeout: 1e4,
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
    const npxDir = import_path6.default.join(cache, "_npx");
    if (import_fs_extra4.default.existsSync(npxDir)) {
      import_fs_extra4.default.rmSync(npxDir, { recursive: true, force: true });
      console.log("  \u21BB Cleaned corrupted npx cache, retrying...");
    }
  } catch {
  }
}
function forceRemoveDir(dirPath) {
  try {
    import_fs_extra4.default.rmSync(dirPath, { recursive: true, force: true });
    return;
  } catch {
  }
  if (process.platform !== "win32") {
    try {
      (0, import_child_process.execSync)(`chmod -R u+w "${dirPath}"`, { stdio: "pipe", timeout: 5e3 });
      import_fs_extra4.default.rmSync(dirPath, { recursive: true, force: true });
      return;
    } catch {
    }
  }
  const aside = `${dirPath}-purge-${Date.now()}`;
  import_fs_extra4.default.renameSync(dirPath, aside);
}
var STALE_NPM_DIR_PATTERN = /-.{8,}$/;
function cleanStaleNodeModulesDirs(cwd) {
  try {
    const nodeModulesDir = import_path6.default.join(cwd, "node_modules");
    const entries = import_fs_extra4.default.readdirSync(nodeModulesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith(".") && STALE_NPM_DIR_PATTERN.test(entry.name)) {
        try {
          forceRemoveDir(import_path6.default.join(nodeModulesDir, entry.name));
          console.log(`  \u21BB Cleaned stale temp dir: node_modules/${entry.name}`);
        } catch (e) {
          console.log(`  \u26A0 Could not remove stale dir node_modules/${entry.name}: ${e instanceof Error ? e.message : e}`);
        }
      }
    }
  } catch {
  }
}
async function runPostUpdateHook(extension, repoRoot, platform2, failFast = false) {
  const hook = getPostUpdateHook(extension, platform2);
  if (!hook)
    return;
  const { command: rawCommand, interactive = true, skipInCI = true } = hook;
  let command = process.platform === "win32" ? rawCommand.replace(/\bpython3\b/g, "python") : rawCommand;
  if (skipInCI && isCI()) {
    console.log(`  \u23ED Skipping post-update hook for ${extension.name} (CI detected)`);
    return;
  }
  const nonInteractive = isNonInteractive();
  if (interactive && nonInteractive) {
    command = augmentCommandForNonInteractive(command);
  }
  const useInherit = interactive && !nonInteractive;
  console.log(`  \u25B6 Running post-update hook for ${extension.name}...`);
  const env = getMsysSafeEnv();
  try {
    await execShellCommand(command, { cwd: repoRoot, stdio: useInherit ? "inherit" : "pipe", env });
    console.log(`  \u2713 Post-update hook completed for ${extension.name}`);
  } catch (error) {
    if (isRecoverableNpmError(error)) {
      cleanNpxCache();
      cleanStaleNodeModulesDirs(repoRoot);
      try {
        await execShellCommand(command, { cwd: repoRoot, stdio: useInherit ? "inherit" : "pipe", env });
        console.log(`  \u2713 Post-update hook completed for ${extension.name} (after cache cleanup)`);
        return;
      } catch {
      }
    }
    const message = error instanceof Error ? error.message : String(error);
    console.log(`  \u26A0 Post-update hook failed for ${extension.name}: ${message}`);
    if (failFast) {
      throw new PostUpdateHookError(extension.name, message);
    }
  }
}

// src/updater/content-hash.ts
var import_crypto = require("crypto");
var import_fs_extra5 = __toESM(require_lib(), 1);
function computeHash(content) {
  return (0, import_crypto.createHash)("sha256").update(content, "utf-8").digest("hex");
}
async function getFileHash(filePath) {
  try {
    const content = await import_fs_extra5.default.readFile(filePath, "utf-8");
    return computeHash(content);
  } catch (err) {
    const code = err?.code;
    if (code && code !== "ENOENT") {
      console.log(`  \u26A0 Failed to read file for hash: ${filePath} (${code})`);
    }
    return null;
  }
}
async function isModifiedByUser(filePath, storedHash) {
  const currentHash = await getFileHash(filePath);
  if (currentHash === null)
    return false;
  if (!storedHash)
    return true;
  return currentHash !== storedHash;
}

// src/updater/backup.ts
var import_fs_extra6 = __toESM(require_lib(), 1);
var import_path7 = __toESM(require("path"), 1);

// src/constants.ts
var RULES_SUBFOLDER = "pomogator";
var USER_OVERRIDES_DIR = ".dev-pomogator/.user-overrides";

// src/updater/backup.ts
function resolveWithinDir(base, relativePath) {
  const resolvedBase = import_path7.default.resolve(base);
  const resolved = import_path7.default.resolve(resolvedBase, relativePath);
  const rel = import_path7.default.relative(resolvedBase, resolved);
  if (rel.startsWith("..") || import_path7.default.isAbsolute(rel))
    return null;
  return resolved;
}
async function backupUserFile(projectPath, relativePath) {
  try {
    const sourcePath = resolveWithinDir(projectPath, relativePath);
    if (!sourcePath) {
      console.log(`  \u26A0 Skipping backup \u2014 path outside project: ${relativePath}`);
      return null;
    }
    if (!await import_fs_extra6.default.pathExists(sourcePath))
      return null;
    const backupPath = resolveWithinDir(
      import_path7.default.join(projectPath, USER_OVERRIDES_DIR),
      relativePath
    );
    if (!backupPath) {
      console.log(`  \u26A0 Skipping backup \u2014 backup path outside project: ${relativePath}`);
      return null;
    }
    await import_fs_extra6.default.ensureDir(import_path7.default.dirname(backupPath));
    await import_fs_extra6.default.copy(sourcePath, backupPath, { overwrite: true });
    return backupPath;
  } catch (error) {
    console.log(`  \u26A0 Failed to backup ${relativePath}: ${error}`);
    return null;
  }
}
async function writeUpdateReport(modifications) {
  if (modifications.length === 0)
    return;
  const configDir = getConfigDir();
  const reportPath = import_path7.default.join(configDir, "last-update-report.md");
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  const lines = [
    "# Update Report",
    "",
    `Generated: ${timestamp}`,
    "",
    `${modifications.length} file(s) with user modifications were backed up before overwriting.`,
    "",
    "| File | Extension | Backup |",
    "|------|-----------|--------|"
  ];
  for (const mod of modifications) {
    lines.push(`| \`${mod.relativePath}\` | ${mod.extensionName} | \`${mod.backupPath}\` |`);
  }
  lines.push("");
  lines.push("> Merge your changes from `.dev-pomogator/.user-overrides/` back into the updated files if needed.");
  lines.push("");
  await import_fs_extra6.default.ensureDir(configDir);
  await import_fs_extra6.default.writeFile(reportPath, lines.join("\n"), "utf-8");
}

// src/updater/index.ts
var import_fs_extra9 = __toESM(require_lib(), 1);
var import_path11 = __toESM(require("path"), 1);
var import_os5 = __toESM(require("os"), 1);
var import_semver = __toESM(require_semver2(), 1);

// src/installer/shared.ts
var import_fs_extra7 = __toESM(require_lib(), 1);
var import_path8 = __toESM(require("path"), 1);
function makePortableTsxCommand(scriptPath, args2) {
  const escaped = scriptPath.replace(/\\/g, "/");
  const runner = `node -e "require(require('path').join(require('os').homedir(),'.dev-pomogator','scripts','tsx-runner.js'))"`;
  return args2 ? `${runner} -- "${escaped}" ${args2}` : `${runner} -- "${escaped}"`;
}
function replaceNpxTsxWithPortable(command) {
  return command.replace(
    /\bnpx\s+tsx\s+"([^"]+)"/g,
    (_match, scriptPath) => makePortableTsxCommand(scriptPath)
  ).replace(
    /\bnpx\s+tsx\s+(\S+)/g,
    (_match, scriptPath) => makePortableTsxCommand(scriptPath)
  );
}
function resolveHookToolPaths(command, _repoRoot) {
  return command;
}
async function ensureExecutableShellScripts(targetPath) {
  if (!await import_fs_extra7.default.pathExists(targetPath)) {
    return;
  }
  const stat = await import_fs_extra7.default.stat(targetPath);
  if (stat.isDirectory()) {
    const items = await import_fs_extra7.default.readdir(targetPath, { withFileTypes: true });
    for (const item of items) {
      await ensureExecutableShellScripts(import_path8.default.join(targetPath, item.name));
    }
    return;
  }
  if (!targetPath.endsWith(".sh")) {
    return;
  }
  await import_fs_extra7.default.chmod(targetPath, 493);
}

// src/utils/atomic-json.ts
var import_fs_extra8 = __toESM(require_lib(), 1);
var import_fs3 = __toESM(require("fs"), 1);
var import_path9 = __toESM(require("path"), 1);
async function writeJsonAtomic(filePath, data) {
  await import_fs_extra8.default.ensureDir(import_path9.default.dirname(filePath));
  try {
    const content = await import_fs_extra8.default.readFile(filePath, "utf-8");
    JSON.parse(content);
    await import_fs_extra8.default.writeFile(filePath + ".bak", content, "utf-8");
  } catch {
  }
  const tempFile = filePath + ".tmp";
  await import_fs_extra8.default.writeJson(tempFile, data, { spaces: 2 });
  await import_fs_extra8.default.move(tempFile, filePath, { overwrite: true });
}
async function readJsonSafe(filePath, fallback = {}) {
  try {
    return await import_fs_extra8.default.readJson(filePath);
  } catch (err) {
    const code = err.code;
    if (code !== "ENOENT") {
      console.warn(`  [WARN] Corrupted JSON: ${filePath}`);
    }
  }
  const bakPath = filePath + ".bak";
  try {
    const recovered = await import_fs_extra8.default.readJson(bakPath);
    console.warn(`  [WARN] Recovered from backup: ${bakPath}`);
    await import_fs_extra8.default.copy(bakPath, filePath, { overwrite: true });
    return recovered;
  } catch (err) {
    const code = err.code;
    if (code !== "ENOENT") {
      console.warn(`  [WARN] Backup also corrupted: ${bakPath}`);
    }
  }
  console.warn(`  [WARN] Using empty fallback for: ${filePath}`);
  return fallback;
}
function writeJsonAtomicSync(filePath, data) {
  import_fs3.default.mkdirSync(import_path9.default.dirname(filePath), { recursive: true });
  try {
    const content = import_fs3.default.readFileSync(filePath, "utf-8");
    JSON.parse(content);
    import_fs3.default.writeFileSync(filePath + ".bak", content, "utf-8");
  } catch {
  }
  const tempFile = filePath + ".tmp";
  import_fs3.default.writeFileSync(tempFile, JSON.stringify(data, null, 2));
  import_fs3.default.renameSync(tempFile, filePath);
}

// src/utils/statusline.ts
var import_os4 = __toESM(require("os"), 1);
var import_path10 = __toESM(require("path"), 1);
var MANAGED_STATUSLINE_DIR = ".dev-pomogator/tools/test-statusline/";
var LEGACY_RENDER_SCRIPT = "statusline_render.cjs";
var LEGACY_WRAPPER_MARKER = "statusline_wrapper.js";
var DEFAULT_USER_STATUSLINE_COMMAND = "npx -y ccstatusline@latest";
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function extractFlagValue(command, flag) {
  const match = command.match(
    new RegExp(`${escapeRegExp(flag)}\\s+(?:"([^"]+)"|'([^']+)'|(\\S+))`)
  );
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}
function decodeBase64Strict(value) {
  if (!/^[A-Za-z0-9+/=]+$/.test(value) || value.length % 4 !== 0) {
    return null;
  }
  const decoded = Buffer.from(value, "base64").toString("utf-8");
  const normalizedInput = value.replace(/=+$/, "");
  const normalizedRoundTrip = Buffer.from(decoded, "utf-8").toString("base64").replace(/=+$/, "");
  return normalizedInput === normalizedRoundTrip ? decoded : null;
}
function normalizeExistingStatusLine(entry) {
  const command = entry?.command?.trim();
  if (!command) {
    return void 0;
  }
  return {
    type: entry?.type,
    command
  };
}
function isWrappedStatusLineCommand(command) {
  return command.includes(LEGACY_WRAPPER_MARKER);
}
function isManagedStatusLineCommand(command) {
  if (isWrappedStatusLineCommand(command))
    return false;
  if (command.includes(MANAGED_STATUSLINE_DIR))
    return true;
  return command.includes("'.dev-pomogator','scripts','" + LEGACY_RENDER_SCRIPT + "'");
}
function classifyClaudeStatusLineCommand(command) {
  const normalizedCommand = command?.trim();
  if (!normalizedCommand) {
    return "none";
  }
  if (isWrappedStatusLineCommand(normalizedCommand)) {
    return "wrapped";
  }
  if (isManagedStatusLineCommand(normalizedCommand)) {
    return "managed";
  }
  return "user";
}
function selectExistingClaudeStatusLine({
  globalStatusLine
}) {
  const global2 = normalizeExistingStatusLine(globalStatusLine);
  if (global2) {
    return {
      source: "global",
      kind: classifyClaudeStatusLineCommand(global2.command),
      entry: global2
    };
  }
  return {
    source: "none",
    kind: "none"
  };
}
function extractUserCommandFromLegacyWrapper(command) {
  if (!isWrappedStatusLineCommand(command)) {
    return null;
  }
  const encodedUserCommand = extractFlagValue(command, "--user-b64");
  if (!encodedUserCommand)
    return null;
  return decodeBase64Strict(encodedUserCommand);
}
var VALID_STATUSLINE_TYPES = /* @__PURE__ */ new Set(["command"]);
async function writeGlobalStatusLine(statusLineConfig, preloadedSettings) {
  if (!VALID_STATUSLINE_TYPES.has(statusLineConfig.type)) {
    console.warn(`  \u26A0 statusLine.type "${statusLineConfig.type}" is not valid for Claude Code (expected: ${[...VALID_STATUSLINE_TYPES].join(", ")}), using "command"`);
    statusLineConfig = { ...statusLineConfig, type: "command" };
  }
  const settingsPath = import_path10.default.join(import_os4.default.homedir(), ".claude", "settings.json");
  const settings = preloadedSettings ?? await readJsonSafe(settingsPath, {});
  const resolved = resolveClaudeStatusLine({
    globalStatusLine: settings.statusLine,
    statusLineConfig
  });
  const existingStatusLine = settings.statusLine ?? {};
  settings.statusLine = {
    ...existingStatusLine,
    type: resolved.type,
    command: resolved.command
  };
  await writeJsonAtomic(settingsPath, settings);
}
function resolveClaudeStatusLine({
  globalStatusLine,
  statusLineConfig
}) {
  const selected = selectExistingClaudeStatusLine({ globalStatusLine });
  const existingCommand = selected.entry?.command;
  if (!existingCommand) {
    return {
      type: statusLineConfig.type,
      command: DEFAULT_USER_STATUSLINE_COMMAND,
      mode: "direct",
      source: "none",
      existingKind: "none"
    };
  }
  if (selected.kind === "wrapped") {
    const userCmd = extractUserCommandFromLegacyWrapper(existingCommand) || DEFAULT_USER_STATUSLINE_COMMAND;
    return {
      type: statusLineConfig.type,
      command: userCmd,
      mode: "direct",
      source: selected.source,
      existingKind: selected.kind
    };
  }
  if (selected.kind === "managed") {
    return {
      type: statusLineConfig.type,
      command: DEFAULT_USER_STATUSLINE_COMMAND,
      mode: "direct",
      source: selected.source,
      existingKind: selected.kind
    };
  }
  return {
    type: statusLineConfig.type,
    command: existingCommand,
    mode: "direct",
    source: selected.source,
    existingKind: selected.kind
  };
}

// src/updater/index.ts
function normalizeRelativePath(value) {
  return value.replace(/\\/g, "/");
}
function resolveWithinProject(projectPath, relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  if (import_path11.default.isAbsolute(normalized)) {
    return null;
  }
  const base = import_path11.default.resolve(projectPath);
  const resolved = import_path11.default.resolve(base, normalized);
  const relative = import_path11.default.relative(base, resolved);
  if (relative.startsWith("..") || import_path11.default.isAbsolute(relative)) {
    return null;
  }
  return resolved;
}
function ensureManagedEntry(installed, projectPath) {
  if (!installed.managed) {
    installed.managed = {};
  }
  if (!installed.managed[projectPath]) {
    installed.managed[projectPath] = {};
  }
  return installed.managed[projectPath];
}
async function shouldBackupFile(destFile, storedHash, upstreamContent) {
  if (!await isModifiedByUser(destFile, storedHash)) {
    return false;
  }
  if (!storedHash) {
    const currentHash = await getFileHash(destFile);
    if (currentHash === null)
      return false;
    return currentHash !== computeHash(upstreamContent);
  }
  return true;
}
async function removeStaleFiles(projectPath, previousItems = [], next = [], extensionName) {
  const previousSet = new Set(getManagedPaths(previousItems).map(normalizeRelativePath));
  const nextSet = new Set(next.map(normalizeRelativePath));
  const backedUp = [];
  for (const relativePath of previousSet) {
    if (nextSet.has(relativePath)) {
      continue;
    }
    const destFile = resolveWithinProject(projectPath, relativePath);
    if (!destFile) {
      console.log(`  \u26A0 Skipping stale path outside project: ${relativePath}`);
      continue;
    }
    if (await import_fs_extra9.default.pathExists(destFile)) {
      const storedHash = getManagedHash(previousItems, relativePath);
      const shouldBackupStaleFile = storedHash ? await isModifiedByUser(destFile, storedHash) : true;
      if (shouldBackupStaleFile && extensionName) {
        const backupPath = await backupUserFile(projectPath, relativePath);
        if (backupPath) {
          console.log(`  \u{1F4CB} Backed up stale user-modified file: ${relativePath}`);
          backedUp.push({ relativePath, backupPath, extensionName });
        }
      }
      await import_fs_extra9.default.remove(destFile);
      console.log(`  - Removed stale file: ${relativePath}`);
    }
  }
  return backedUp;
}
async function updateCommandFiles(extensionName, platform2, files, projectPath, previousItems) {
  if (files.length === 0)
    return { written: [], hadFailures: false, backedUp: [] };
  const platformDir = ".claude";
  const destDir = import_path11.default.join(projectPath, platformDir, "commands");
  await import_fs_extra9.default.ensureDir(destDir);
  const written = [];
  const backedUp = [];
  let hadFailures = false;
  for (const relativePath of files) {
    const content = await downloadExtensionFile(extensionName, relativePath);
    const fileName = import_path11.default.basename(relativePath);
    const destFile = import_path11.default.join(destDir, fileName);
    const relativeDest = normalizeRelativePath(
      import_path11.default.join(platformDir, "commands", fileName)
    );
    if (!content) {
      console.log(`  \u26A0 Failed to download command: ${relativePath}`);
      hadFailures = true;
      continue;
    }
    const storedHash = getManagedHash(previousItems, relativeDest);
    if (await shouldBackupFile(destFile, storedHash, content)) {
      const backupPath = await backupUserFile(projectPath, relativeDest);
      if (backupPath) {
        console.log(`  \u{1F4CB} Backed up user-modified command: ${relativeDest}`);
        backedUp.push({ relativePath: relativeDest, backupPath, extensionName });
      }
    }
    await import_fs_extra9.default.writeFile(destFile, content, "utf-8");
    written.push({ path: relativeDest, hash: computeHash(content) });
  }
  return { written, hadFailures, backedUp };
}
async function updateRuleFiles(extensionName, platform2, files, projectPath, previousItems) {
  if (files.length === 0)
    return { written: [], hadFailures: false, backedUp: [] };
  const written = [];
  const backedUp = [];
  let hadFailures = false;
  for (const relativePath of files) {
    const content = await downloadExtensionFile(extensionName, relativePath);
    const relativeDest = normalizeRelativePath(relativePath);
    const destFile = import_path11.default.join(projectPath, relativePath);
    await import_fs_extra9.default.ensureDir(import_path11.default.dirname(destFile));
    if (!content) {
      console.log(`  \u26A0 Failed to download rule: ${relativePath}`);
      hadFailures = true;
      continue;
    }
    const storedHash = getManagedHash(previousItems, relativeDest);
    if (await shouldBackupFile(destFile, storedHash, content)) {
      const backupPath = await backupUserFile(projectPath, relativeDest);
      if (backupPath) {
        console.log(`  \u{1F4CB} Backed up user-modified rule: ${relativeDest}`);
        backedUp.push({ relativePath: relativeDest, backupPath, extensionName });
      }
    }
    await import_fs_extra9.default.writeFile(destFile, content, "utf-8");
    written.push({ path: relativeDest, hash: computeHash(content) });
  }
  return { written, hadFailures, backedUp };
}
async function migrateRulesNamespace(installed, projectPath) {
  if (!installed.managed)
    return;
  const managed = installed.managed[projectPath];
  if (!managed?.rules)
    return;
  let changed = false;
  for (let i = 0; i < managed.rules.length; i++) {
    const entry = managed.rules[i];
    const entryPath = typeof entry === "string" ? entry : entry.path;
    const oldPrefix = `.claude/rules/${RULES_SUBFOLDER}/`;
    if (!entryPath.startsWith(oldPrefix))
      continue;
    const fileName = import_path11.default.basename(entryPath);
    const newPath = `.claude/rules/${installed.name}/${fileName}`;
    const oldFile = import_path11.default.join(projectPath, entryPath);
    const newFile = import_path11.default.join(projectPath, newPath);
    if (!await import_fs_extra9.default.pathExists(oldFile))
      continue;
    if (await import_fs_extra9.default.pathExists(newFile))
      continue;
    await import_fs_extra9.default.ensureDir(import_path11.default.dirname(newFile));
    await import_fs_extra9.default.move(oldFile, newFile);
    if (typeof entry === "string") {
      managed.rules[i] = newPath;
    } else {
      entry.path = newPath;
    }
    changed = true;
    console.log(`  \u{1F4E6} Migrated rule: ${oldPrefix}${fileName} \u2192 ${newPath}`);
  }
  if (changed) {
    const pomDir = import_path11.default.join(projectPath, ".claude", "rules", RULES_SUBFOLDER);
    try {
      const remaining = await import_fs_extra9.default.readdir(pomDir);
      if (remaining.length === 0) {
        await import_fs_extra9.default.remove(pomDir);
      }
    } catch {
    }
  }
}
async function updateToolFiles(extensionName, toolFiles, projectPath, previousItems) {
  const allFiles = Object.values(toolFiles).flat();
  if (allFiles.length === 0)
    return { written: [], hadFailures: false, backedUp: [] };
  const written = [];
  const backedUp = [];
  let hadFailures = false;
  for (const relativePath of allFiles) {
    const content = await downloadExtensionFile(extensionName, relativePath);
    const destFile = resolveWithinProject(projectPath, relativePath);
    if (!destFile) {
      console.log(`  \u26A0 Skipping tool file outside project: ${relativePath}`);
      hadFailures = true;
      continue;
    }
    await import_fs_extra9.default.ensureDir(import_path11.default.dirname(destFile));
    const normalizedPath = normalizeRelativePath(relativePath);
    if (!content) {
      console.log(`  \u26A0 Failed to download tool file: ${relativePath}`);
      hadFailures = true;
      continue;
    }
    const storedHash = getManagedHash(previousItems, normalizedPath);
    if (await shouldBackupFile(destFile, storedHash, content)) {
      const backupPath = await backupUserFile(projectPath, normalizedPath);
      if (backupPath) {
        console.log(`  \u{1F4CB} Backed up user-modified tool: ${normalizedPath}`);
        backedUp.push({ relativePath: normalizedPath, backupPath, extensionName });
      }
    }
    await import_fs_extra9.default.writeFile(destFile, content, "utf-8");
    await ensureExecutableShellScripts(destFile);
    written.push({ path: normalizedPath, hash: computeHash(content) });
  }
  return { written, hadFailures, backedUp };
}
async function updateSkillFiles(extensionName, skillFiles, projectPath, previousItems) {
  const allFiles = Object.values(skillFiles).flat();
  if (allFiles.length === 0)
    return { written: [], hadFailures: false, backedUp: [] };
  const written = [];
  const backedUp = [];
  let hadFailures = false;
  for (const relativePath of allFiles) {
    const content = await downloadExtensionFile(extensionName, relativePath);
    const destFile = resolveWithinProject(projectPath, relativePath);
    if (!destFile) {
      console.log(`  \u26A0 Skipping skill file outside project: ${relativePath}`);
      hadFailures = true;
      continue;
    }
    await import_fs_extra9.default.ensureDir(import_path11.default.dirname(destFile));
    const normalizedPath = normalizeRelativePath(relativePath);
    if (!content) {
      console.log(`  \u26A0 Failed to download skill file: ${relativePath}`);
      hadFailures = true;
      continue;
    }
    const storedHash = getManagedHash(previousItems, normalizedPath);
    if (await shouldBackupFile(destFile, storedHash, content)) {
      const backupPath = await backupUserFile(projectPath, normalizedPath);
      if (backupPath) {
        console.log(`  \u{1F4CB} Backed up user-modified skill: ${normalizedPath}`);
        backedUp.push({ relativePath: normalizedPath, backupPath, extensionName });
      }
    }
    await import_fs_extra9.default.writeFile(destFile, content, "utf-8");
    written.push({ path: normalizedPath, hash: computeHash(content) });
  }
  return { written, hadFailures, backedUp };
}
async function updateClaudeHooksForProject(repoRoot, hooks, previousManagedHooks = {}) {
  const settingsPath = import_path11.default.join(repoRoot, ".claude", "settings.json");
  const hasNewHooks = Object.keys(hooks).length > 0;
  if (!hasNewHooks && Object.keys(previousManagedHooks).length === 0) {
    return {};
  }
  const settings = await readJsonSafe(settingsPath, {});
  if (!settings.hooks) {
    settings.hooks = {};
  }
  const existingHooks = settings.hooks;
  for (const hookName of Object.keys(existingHooks)) {
    const arr = existingHooks[hookName];
    existingHooks[hookName] = arr.filter(
      (entry) => !entry.hooks?.some((h) => h.command.includes(".dev-pomogator/tools/"))
    );
  }
  const nextManagedHooks = {};
  for (const [hookName, rawHook] of Object.entries(hooks)) {
    const rawCommand = typeof rawHook === "string" ? rawHook : rawHook.command;
    const matcher = typeof rawHook === "string" ? "" : rawHook.matcher ?? "";
    const timeout = typeof rawHook === "string" ? 60 : rawHook.timeout ?? 60;
    if (!nextManagedHooks[hookName]) {
      nextManagedHooks[hookName] = [];
    }
    nextManagedHooks[hookName].push(rawCommand);
    const command = replaceNpxTsxWithPortable(resolveHookToolPaths(rawCommand, repoRoot));
    if (!existingHooks[hookName]) {
      existingHooks[hookName] = [];
    }
    const hookArray = existingHooks[hookName];
    const commandExists = hookArray.some(
      (h) => h.hooks?.some((hook) => hook.command === command)
    );
    if (!commandExists) {
      hookArray.push({
        matcher,
        hooks: [{
          type: "command",
          command,
          timeout
        }]
      });
    }
  }
  for (const [hookName, commands] of Object.entries(previousManagedHooks)) {
    const hookArray = existingHooks[hookName];
    if (!hookArray) {
      continue;
    }
    const nextAbsolute = new Set(
      (nextManagedHooks[hookName] ?? []).map((cmd) => resolveHookToolPaths(cmd, repoRoot))
    );
    const removeSet = new Set(
      commands.map((cmd) => resolveHookToolPaths(cmd, repoRoot)).filter((cmd) => !nextAbsolute.has(cmd))
    );
    if (removeSet.size === 0) {
      continue;
    }
    existingHooks[hookName] = hookArray.filter(
      (entry) => !entry.hooks?.some((hook) => removeSet.has(hook.command))
    );
  }
  await writeJsonAtomic(settingsPath, settings);
  return nextManagedHooks;
}
async function updateClaudeStatusLineGlobal(statusLineConfig) {
  await writeGlobalStatusLine(statusLineConfig);
}
async function cleanupLegacyStatusLine() {
  const settingsPath = import_path11.default.join(import_os5.default.homedir(), ".claude", "settings.json");
  const settings = await readJsonSafe(settingsPath, {});
  const statusLine = settings.statusLine;
  if (!statusLine?.command)
    return;
  if (isManagedStatusLineCommand(statusLine.command)) {
    delete settings.statusLine;
    await writeJsonAtomic(settingsPath, settings);
    console.log("  \u2713 Removed legacy statusLine from global settings");
  }
}
async function checkUpdate(options = {}) {
  const { force = false, platform: platform2 } = options;
  if (!await acquireLock()) {
    return false;
  }
  try {
    const config = await loadConfig();
    if (!config) {
      return false;
    }
    if (!config.autoUpdate && !force) {
      return false;
    }
    if (!force && !shouldCheckUpdate(config)) {
      return false;
    }
    let updated = false;
    const allBackedUp = [];
    for (const installed of config.installedExtensions) {
      if (platform2 && installed.platform !== platform2) {
        continue;
      }
      try {
        const remote = await fetchExtensionManifest(installed.name);
        if (!remote) {
          continue;
        }
        if (!import_semver.default.gt(remote.version, installed.version)) {
          continue;
        }
        const commandFiles = remote.commandFiles?.[installed.platform] ?? [];
        const ruleFiles = remote.ruleFiles?.[installed.platform] ?? [];
        const toolFiles = remote.toolFiles ?? {};
        const skillFiles = installed.platform === "claude" ? remote.skillFiles ?? {} : {};
        const hooks = remote.hooks?.[installed.platform] ?? {};
        for (const projectPath of installed.projectPaths) {
          await migrateRulesNamespace(installed, projectPath);
        }
        for (const projectPath of installed.projectPaths) {
          try {
            const managedEntry = ensureManagedEntry(installed, projectPath);
            const commandResult = await updateCommandFiles(
              installed.name,
              installed.platform,
              commandFiles,
              projectPath,
              managedEntry.commands
            );
            const ruleResult = await updateRuleFiles(
              installed.name,
              installed.platform,
              ruleFiles,
              projectPath,
              managedEntry.rules
            );
            const toolResult = await updateToolFiles(
              installed.name,
              toolFiles,
              projectPath,
              managedEntry.tools
            );
            const skillResult = await updateSkillFiles(
              installed.name,
              skillFiles,
              projectPath,
              managedEntry.skills
            );
            allBackedUp.push(
              ...commandResult.backedUp,
              ...ruleResult.backedUp,
              ...toolResult.backedUp,
              ...skillResult.backedUp
            );
            const writtenCommandPaths = commandResult.written.map((e) => e.path);
            const writtenRulePaths = ruleResult.written.map((e) => e.path);
            const writtenToolPaths = toolResult.written.map((e) => e.path);
            const writtenSkillPaths = skillResult.written.map((e) => e.path);
            allBackedUp.push(
              ...await removeStaleFiles(projectPath, managedEntry.commands, writtenCommandPaths, installed.name)
            );
            managedEntry.commands = commandResult.written;
            allBackedUp.push(
              ...await removeStaleFiles(projectPath, managedEntry.rules, writtenRulePaths, installed.name)
            );
            managedEntry.rules = ruleResult.written;
            allBackedUp.push(
              ...await removeStaleFiles(projectPath, managedEntry.tools, writtenToolPaths, installed.name)
            );
            managedEntry.tools = toolResult.written;
            allBackedUp.push(
              ...await removeStaleFiles(projectPath, managedEntry.skills, writtenSkillPaths, installed.name)
            );
            managedEntry.skills = skillResult.written;
            const previousHooks = managedEntry.hooks ?? {};
            const updatedHooks = await updateClaudeHooksForProject(projectPath, hooks, previousHooks);
            managedEntry.hooks = updatedHooks;
            {
              const projectSettingsPath = import_path11.default.join(projectPath, ".claude", "settings.json");
              const projectSettings = await readJsonSafe(projectSettingsPath, {});
              if (projectSettings.statusLine) {
                delete projectSettings.statusLine;
                await writeJsonAtomic(projectSettingsPath, projectSettings);
              }
            }
            if (remote.postUpdate) {
              await runPostUpdateHook(remote, projectPath, installed.platform, true);
            }
          } catch (error) {
            if (error instanceof PostUpdateHookError) {
              throw error;
            }
            console.log(`  \u26A0 Update failed for project ${projectPath}: ${error instanceof Error ? error.message : error}`);
          }
        }
        if (installed.platform === "claude" && remote.statusLine?.claude) {
          await updateClaudeStatusLineGlobal(remote.statusLine.claude);
        } else if (installed.platform === "claude" && !remote.statusLine?.claude) {
          await cleanupLegacyStatusLine();
        }
        installed.version = remote.version;
        updated = true;
      } catch (error) {
        if (error instanceof PostUpdateHookError) {
          throw error;
        }
        console.log(`  \u26A0 Update failed for ${installed.name}: ${getErrorMessage(error)}`);
        logger.error(`Extension ${installed.name} update failed: ${formatErrorChain(error)}`);
      }
    }
    const scannedPaths = /* @__PURE__ */ new Set();
    for (const installed of config.installedExtensions) {
      if (platform2 && installed.platform !== platform2)
        continue;
      for (const projectPath of installed.projectPaths) {
        if (scannedPaths.has(projectPath))
          continue;
        scannedPaths.add(projectPath);
        const mangledArtifacts = detectMangledArtifacts(projectPath);
        if (mangledArtifacts.length > 0) {
          console.log(`  \u26A0 MSYS path mangling artifacts in ${projectPath}: ${mangledArtifacts.join(", ")}`);
          console.log(`    Fix: add MSYS_NO_PATHCONV=1 to your environment. These directories can be safely deleted.`);
        }
      }
    }
    if (allBackedUp.length > 0) {
      console.log(`  \u{1F4CB} ${allBackedUp.length} user-modified file(s) backed up to .dev-pomogator/.user-overrides/`);
      await writeUpdateReport(allBackedUp);
    }
    config.lastCheck = (/* @__PURE__ */ new Date()).toISOString();
    await saveConfig(config);
    return updated;
  } finally {
    await releaseLock();
  }
}

// src/updater/hook-migration.ts
var import_fs4 = __toESM(require("fs"), 1);
var import_path12 = __toESM(require("path"), 1);
var import_os6 = __toESM(require("os"), 1);
var CONFIG_DIR2 = import_path12.default.join(import_os6.default.homedir(), ".dev-pomogator");
var CONFIG_FILE2 = import_path12.default.join(CONFIG_DIR2, "config.json");
var OLD_HOOK_RE = /\bnpx\s+tsx\s+[."']?\.?dev-pomogator\/tools\//;
function isOldFormat(command) {
  return OLD_HOOK_RE.test(command);
}
async function migrateOldProjectHooks(platform2) {
  if (platform2 !== "claude")
    return 0;
  if (!import_fs4.default.existsSync(CONFIG_FILE2))
    return 0;
  let config;
  try {
    config = JSON.parse(import_fs4.default.readFileSync(CONFIG_FILE2, "utf-8"));
  } catch {
    return 0;
  }
  const extensions = config.installedExtensions ?? [];
  const projectPaths = /* @__PURE__ */ new Set();
  for (const ext of extensions) {
    if (ext.platform !== "claude")
      continue;
    for (const p of ext.projectPaths ?? [])
      projectPaths.add(p);
  }
  let total = 0;
  for (const projectPath of projectPaths) {
    total += migrateProjectSettings(projectPath);
  }
  return total;
}
function migrateProjectSettings(projectPath) {
  const settingsPath = import_path12.default.join(projectPath, ".claude", "settings.json");
  if (!import_fs4.default.existsSync(settingsPath))
    return 0;
  let settings;
  try {
    settings = JSON.parse(import_fs4.default.readFileSync(settingsPath, "utf-8"));
  } catch {
    return 0;
  }
  if (!settings.hooks)
    return 0;
  let migrated = 0;
  for (const hookEntries of Object.values(settings.hooks)) {
    if (!Array.isArray(hookEntries))
      continue;
    for (const entry of hookEntries) {
      for (const hook of entry.hooks ?? []) {
        if (hook.command && isOldFormat(hook.command)) {
          hook.command = replaceNpxTsxWithPortable(
            resolveHookToolPaths(hook.command, projectPath)
          );
          migrated++;
        }
      }
    }
  }
  if (migrated > 0) {
    writeJsonAtomicSync(settingsPath, settings);
    logger.info(`Migrated ${migrated} old-format hook(s) in ${projectPath}`);
  }
  return migrated;
}

// src/updater/standalone.ts
var CONFIG_DIR3 = import_path13.default.join(import_os7.default.homedir(), ".dev-pomogator");
var CONFIG_FILE3 = import_path13.default.join(CONFIG_DIR3, "config.json");
var args = process.argv.slice(2);
var isCheckOnly = args.includes("--check-only");
var platform = "claude";
function loadConfig2() {
  try {
    if (import_fs5.default.existsSync(CONFIG_FILE3)) {
      return JSON.parse(import_fs5.default.readFileSync(CONFIG_FILE3, "utf-8"));
    }
  } catch {
    logger.error("Failed to load config");
  }
  return null;
}
function shouldUpdate(config) {
  if (!config || !config.autoUpdate)
    return false;
  if (!config.lastCheck)
    return true;
  const lastCheck = new Date(config.lastCheck);
  const now = /* @__PURE__ */ new Date();
  const hours = (now.getTime() - lastCheck.getTime()) / (1e3 * 60 * 60);
  const cooldown = config.cooldownHours || 24;
  return hours >= cooldown;
}
async function checkOnly() {
  const config = loadConfig2();
  if (!config?.installedExtensions?.length)
    return;
  const outdated = [];
  const seen = /* @__PURE__ */ new Set();
  const toCheck = [];
  for (const ext of config.installedExtensions) {
    if (seen.has(ext.name))
      continue;
    if (ext.platform !== platform)
      continue;
    seen.add(ext.name);
    toCheck.push(ext);
  }
  const results = await Promise.all(
    toCheck.map(async (ext) => {
      try {
        const remote = await fetchExtensionManifest(ext.name);
        if (remote && import_semver2.default.gt(remote.version, ext.version)) {
          return { name: ext.name, current: ext.version, latest: remote.version };
        }
      } catch {
      }
      return null;
    })
  );
  for (const result of results) {
    if (result)
      outdated.push(result);
  }
  if (outdated.length > 0) {
    const details = outdated.map((e) => `${e.name}: ${e.current} \u2192 ${e.latest}`).join(", ");
    const cmd = "npx github:stgmt/dev-pomogator --claude --all";
    process.stderr.write(`
\u26A0\uFE0F  dev-pomogator update available (${details})
   Run: ${cmd}

`);
  }
}
async function main() {
  if (isCheckOnly) {
    await checkOnly();
    return;
  }
  logger.info(`=== Update check started (${platform}) ===`);
  await migrateOldProjectHooks(platform).catch((err) => {
    logger.warn(`Hook migration failed: ${getErrorMessage(err)}`);
  });
  const config = loadConfig2();
  if (!shouldUpdate(config)) {
    logger.info("Skipped: cooldown not expired or autoUpdate disabled");
    return;
  }
  logger.info("Cooldown expired, checking for updates...");
  try {
    const updated = await checkUpdate({ platform });
    if (updated) {
      logger.info(`Extensions updated successfully (${platform})`);
    } else {
      logger.info("No updates available");
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error(`Update failed: ${message}`);
  }
}
main().catch((e) => {
  const message = e instanceof Error ? e.message : String(e);
  if (!isCheckOnly)
    logger.error(`Fatal: ${message}`);
}).finally(() => {
  if (!isCheckOnly) {
    logger.info("Update check completed");
    process.stdout.write(JSON.stringify({ continue: true }));
  }
});
