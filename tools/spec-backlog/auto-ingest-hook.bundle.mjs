import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);

// tools/spec-backlog/auto-ingest-hook.ts
import fs4 from "node:fs";
import path4 from "node:path";

// .claude/skills/cross-spec-reconcile/scripts/reconcile.ts
import fs2 from "node:fs";
import path from "node:path";

// node_modules/glob/dist/esm/index.min.js
import { fileURLToPath as Wi } from "node:url";
import { posix as mi, win32 as re } from "node:path";
import { fileURLToPath as gi } from "node:url";
import { lstatSync as wi, readdir as yi, readdirSync as bi, readlinkSync as Si, realpathSync as Ei } from "fs";
import * as xi from "node:fs";
import { lstat as Ci, readdir as Ti, readlink as Ai, realpath as ki } from "node:fs/promises";
import { EventEmitter as ee } from "node:events";
import Pe from "node:stream";
import { StringDecoder as ni } from "node:string_decoder";
var Gt = (n7, t, e) => {
  let s = n7 instanceof RegExp ? ce(n7, e) : n7, i = t instanceof RegExp ? ce(t, e) : t, r = s !== null && i != null && ss(s, i, e);
  return r && { start: r[0], end: r[1], pre: e.slice(0, r[0]), body: e.slice(r[0] + s.length, r[1]), post: e.slice(r[1] + i.length) };
};
var ce = (n7, t) => {
  let e = t.match(n7);
  return e ? e[0] : null;
};
var ss = (n7, t, e) => {
  let s, i, r, o, h, a = e.indexOf(n7), l = e.indexOf(t, a + 1), u = a;
  if (a >= 0 && l > 0) {
    if (n7 === t) return [a, l];
    for (s = [], r = e.length; u >= 0 && !h; ) {
      if (u === a) s.push(u), a = e.indexOf(n7, u + 1);
      else if (s.length === 1) {
        let c = s.pop();
        c !== void 0 && (h = [c, l]);
      } else i = s.pop(), i !== void 0 && i < r && (r = i, o = l), l = e.indexOf(t, u + 1);
      u = a < l && a >= 0 ? a : l;
    }
    s.length && o !== void 0 && (h = [r, o]);
  }
  return h;
};
var fe = "\0SLASH" + Math.random() + "\0";
var ue = "\0OPEN" + Math.random() + "\0";
var qt = "\0CLOSE" + Math.random() + "\0";
var de = "\0COMMA" + Math.random() + "\0";
var pe = "\0PERIOD" + Math.random() + "\0";
var is = new RegExp(fe, "g");
var rs = new RegExp(ue, "g");
var ns = new RegExp(qt, "g");
var os = new RegExp(de, "g");
var hs = new RegExp(pe, "g");
var as = /\\\\/g;
var ls = /\\{/g;
var cs = /\\}/g;
var fs = /\\,/g;
var us = /\\./g;
var ds = 1e5;
function Ht(n7) {
  return isNaN(n7) ? n7.charCodeAt(0) : parseInt(n7, 10);
}
function ps(n7) {
  return n7.replace(as, fe).replace(ls, ue).replace(cs, qt).replace(fs, de).replace(us, pe);
}
function ms(n7) {
  return n7.replace(is, "\\").replace(rs, "{").replace(ns, "}").replace(os, ",").replace(hs, ".");
}
function me(n7) {
  if (!n7) return [""];
  let t = [], e = Gt("{", "}", n7);
  if (!e) return n7.split(",");
  let { pre: s, body: i, post: r } = e, o = s.split(",");
  o[o.length - 1] += "{" + i + "}";
  let h = me(r);
  return r.length && (o[o.length - 1] += h.shift(), o.push.apply(o, h)), t.push.apply(t, o), t;
}
function ge(n7, t = {}) {
  if (!n7) return [];
  let { max: e = ds } = t;
  return n7.slice(0, 2) === "{}" && (n7 = "\\{\\}" + n7.slice(2)), ht(ps(n7), e, true).map(ms);
}
function gs(n7) {
  return "{" + n7 + "}";
}
function ws(n7) {
  return /^-?0\d/.test(n7);
}
function ys(n7, t) {
  return n7 <= t;
}
function bs(n7, t) {
  return n7 >= t;
}
function ht(n7, t, e) {
  let s = [], i = Gt("{", "}", n7);
  if (!i) return [n7];
  let r = i.pre, o = i.post.length ? ht(i.post, t, false) : [""];
  if (/\$$/.test(i.pre)) for (let h = 0; h < o.length && h < t; h++) {
    let a = r + "{" + i.body + "}" + o[h];
    s.push(a);
  }
  else {
    let h = /^-?\d+\.\.-?\d+(?:\.\.-?\d+)?$/.test(i.body), a = /^[a-zA-Z]\.\.[a-zA-Z](?:\.\.-?\d+)?$/.test(i.body), l = h || a, u = i.body.indexOf(",") >= 0;
    if (!l && !u) return i.post.match(/,(?!,).*\}/) ? (n7 = i.pre + "{" + i.body + qt + i.post, ht(n7, t, true)) : [n7];
    let c;
    if (l) c = i.body.split(/\.\./);
    else if (c = me(i.body), c.length === 1 && c[0] !== void 0 && (c = ht(c[0], t, false).map(gs), c.length === 1)) return o.map((f) => i.pre + c[0] + f);
    let d;
    if (l && c[0] !== void 0 && c[1] !== void 0) {
      let f = Ht(c[0]), m = Ht(c[1]), p = Math.max(c[0].length, c[1].length), w = c.length === 3 && c[2] !== void 0 ? Math.abs(Ht(c[2])) : 1, g = ys;
      m < f && (w *= -1, g = bs);
      let E = c.some(ws);
      d = [];
      for (let y = f; g(y, m); y += w) {
        let b;
        if (a) b = String.fromCharCode(y), b === "\\" && (b = "");
        else if (b = String(y), E) {
          let z = p - b.length;
          if (z > 0) {
            let $ = new Array(z + 1).join("0");
            y < 0 ? b = "-" + $ + b.slice(1) : b = $ + b;
          }
        }
        d.push(b);
      }
    } else {
      d = [];
      for (let f = 0; f < c.length; f++) d.push.apply(d, ht(c[f], t, false));
    }
    for (let f = 0; f < d.length; f++) for (let m = 0; m < o.length && s.length < t; m++) {
      let p = r + d[f] + o[m];
      (!e || l || p) && s.push(p);
    }
  }
  return s;
}
var at = (n7) => {
  if (typeof n7 != "string") throw new TypeError("invalid pattern");
  if (n7.length > 65536) throw new TypeError("pattern is too long");
};
var Ss = { "[:alnum:]": ["\\p{L}\\p{Nl}\\p{Nd}", true], "[:alpha:]": ["\\p{L}\\p{Nl}", true], "[:ascii:]": ["\\x00-\\x7f", false], "[:blank:]": ["\\p{Zs}\\t", true], "[:cntrl:]": ["\\p{Cc}", true], "[:digit:]": ["\\p{Nd}", true], "[:graph:]": ["\\p{Z}\\p{C}", true, true], "[:lower:]": ["\\p{Ll}", true], "[:print:]": ["\\p{C}", true], "[:punct:]": ["\\p{P}", true], "[:space:]": ["\\p{Z}\\t\\r\\n\\v\\f", true], "[:upper:]": ["\\p{Lu}", true], "[:word:]": ["\\p{L}\\p{Nl}\\p{Nd}\\p{Pc}", true], "[:xdigit:]": ["A-Fa-f0-9", false] };
var lt = (n7) => n7.replace(/[[\]\\-]/g, "\\$&");
var Es = (n7) => n7.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
var we = (n7) => n7.join("");
var ye = (n7, t) => {
  let e = t;
  if (n7.charAt(e) !== "[") throw new Error("not in a brace expression");
  let s = [], i = [], r = e + 1, o = false, h = false, a = false, l = false, u = e, c = "";
  t: for (; r < n7.length; ) {
    let p = n7.charAt(r);
    if ((p === "!" || p === "^") && r === e + 1) {
      l = true, r++;
      continue;
    }
    if (p === "]" && o && !a) {
      u = r + 1;
      break;
    }
    if (o = true, p === "\\" && !a) {
      a = true, r++;
      continue;
    }
    if (p === "[" && !a) {
      for (let [w, [g, S, E]] of Object.entries(Ss)) if (n7.startsWith(w, r)) {
        if (c) return ["$.", false, n7.length - e, true];
        r += w.length, E ? i.push(g) : s.push(g), h = h || S;
        continue t;
      }
    }
    if (a = false, c) {
      p > c ? s.push(lt(c) + "-" + lt(p)) : p === c && s.push(lt(p)), c = "", r++;
      continue;
    }
    if (n7.startsWith("-]", r + 1)) {
      s.push(lt(p + "-")), r += 2;
      continue;
    }
    if (n7.startsWith("-", r + 1)) {
      c = p, r += 2;
      continue;
    }
    s.push(lt(p)), r++;
  }
  if (u < r) return ["", false, 0, false];
  if (!s.length && !i.length) return ["$.", false, n7.length - e, true];
  if (i.length === 0 && s.length === 1 && /^\\?.$/.test(s[0]) && !l) {
    let p = s[0].length === 2 ? s[0].slice(-1) : s[0];
    return [Es(p), false, u - e, false];
  }
  let d = "[" + (l ? "^" : "") + we(s) + "]", f = "[" + (l ? "" : "^") + we(i) + "]";
  return [s.length && i.length ? "(" + d + "|" + f + ")" : s.length ? d : f, h, u - e, true];
};
var W = (n7, { windowsPathsNoEscape: t = false, magicalBraces: e = true } = {}) => e ? t ? n7.replace(/\[([^\/\\])\]/g, "$1") : n7.replace(/((?!\\).|^)\[([^\/\\])\]/g, "$1$2").replace(/\\([^\/])/g, "$1") : t ? n7.replace(/\[([^\/\\{}])\]/g, "$1") : n7.replace(/((?!\\).|^)\[([^\/\\{}])\]/g, "$1$2").replace(/\\([^\/{}])/g, "$1");
var xs = /* @__PURE__ */ new Set(["!", "?", "+", "*", "@"]);
var be = (n7) => xs.has(n7);
var vs = "(?!(?:^|/)\\.\\.?(?:$|/))";
var Ct = "(?!\\.)";
var Cs = /* @__PURE__ */ new Set(["[", "."]);
var Ts = /* @__PURE__ */ new Set(["..", "."]);
var As = new Set("().*{}+?[]^$\\!");
var ks = (n7) => n7.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
var Kt = "[^/]";
var Se = Kt + "*?";
var Ee = Kt + "+?";
var Q = class n {
  type;
  #t;
  #s;
  #n = false;
  #r = [];
  #o;
  #S;
  #w;
  #c = false;
  #h;
  #u;
  #f = false;
  constructor(t, e, s = {}) {
    this.type = t, t && (this.#s = true), this.#o = e, this.#t = this.#o ? this.#o.#t : this, this.#h = this.#t === this ? s : this.#t.#h, this.#w = this.#t === this ? [] : this.#t.#w, t === "!" && !this.#t.#c && this.#w.push(this), this.#S = this.#o ? this.#o.#r.length : 0;
  }
  get hasMagic() {
    if (this.#s !== void 0) return this.#s;
    for (let t of this.#r) if (typeof t != "string" && (t.type || t.hasMagic)) return this.#s = true;
    return this.#s;
  }
  toString() {
    return this.#u !== void 0 ? this.#u : this.type ? this.#u = this.type + "(" + this.#r.map((t) => String(t)).join("|") + ")" : this.#u = this.#r.map((t) => String(t)).join("");
  }
  #a() {
    if (this !== this.#t) throw new Error("should only call on root");
    if (this.#c) return this;
    this.toString(), this.#c = true;
    let t;
    for (; t = this.#w.pop(); ) {
      if (t.type !== "!") continue;
      let e = t, s = e.#o;
      for (; s; ) {
        for (let i = e.#S + 1; !s.type && i < s.#r.length; i++) for (let r of t.#r) {
          if (typeof r == "string") throw new Error("string part in extglob AST??");
          r.copyIn(s.#r[i]);
        }
        e = s, s = e.#o;
      }
    }
    return this;
  }
  push(...t) {
    for (let e of t) if (e !== "") {
      if (typeof e != "string" && !(e instanceof n && e.#o === this)) throw new Error("invalid part: " + e);
      this.#r.push(e);
    }
  }
  toJSON() {
    let t = this.type === null ? this.#r.slice().map((e) => typeof e == "string" ? e : e.toJSON()) : [this.type, ...this.#r.map((e) => e.toJSON())];
    return this.isStart() && !this.type && t.unshift([]), this.isEnd() && (this === this.#t || this.#t.#c && this.#o?.type === "!") && t.push({}), t;
  }
  isStart() {
    if (this.#t === this) return true;
    if (!this.#o?.isStart()) return false;
    if (this.#S === 0) return true;
    let t = this.#o;
    for (let e = 0; e < this.#S; e++) {
      let s = t.#r[e];
      if (!(s instanceof n && s.type === "!")) return false;
    }
    return true;
  }
  isEnd() {
    if (this.#t === this || this.#o?.type === "!") return true;
    if (!this.#o?.isEnd()) return false;
    if (!this.type) return this.#o?.isEnd();
    let t = this.#o ? this.#o.#r.length : 0;
    return this.#S === t - 1;
  }
  copyIn(t) {
    typeof t == "string" ? this.push(t) : this.push(t.clone(this));
  }
  clone(t) {
    let e = new n(this.type, t);
    for (let s of this.#r) e.copyIn(s);
    return e;
  }
  static #i(t, e, s, i) {
    let r = false, o = false, h = -1, a = false;
    if (e.type === null) {
      let f = s, m = "";
      for (; f < t.length; ) {
        let p = t.charAt(f++);
        if (r || p === "\\") {
          r = !r, m += p;
          continue;
        }
        if (o) {
          f === h + 1 ? (p === "^" || p === "!") && (a = true) : p === "]" && !(f === h + 2 && a) && (o = false), m += p;
          continue;
        } else if (p === "[") {
          o = true, h = f, a = false, m += p;
          continue;
        }
        if (!i.noext && be(p) && t.charAt(f) === "(") {
          e.push(m), m = "";
          let w = new n(p, e);
          f = n.#i(t, w, f, i), e.push(w);
          continue;
        }
        m += p;
      }
      return e.push(m), f;
    }
    let l = s + 1, u = new n(null, e), c = [], d = "";
    for (; l < t.length; ) {
      let f = t.charAt(l++);
      if (r || f === "\\") {
        r = !r, d += f;
        continue;
      }
      if (o) {
        l === h + 1 ? (f === "^" || f === "!") && (a = true) : f === "]" && !(l === h + 2 && a) && (o = false), d += f;
        continue;
      } else if (f === "[") {
        o = true, h = l, a = false, d += f;
        continue;
      }
      if (be(f) && t.charAt(l) === "(") {
        u.push(d), d = "";
        let m = new n(f, u);
        u.push(m), l = n.#i(t, m, l, i);
        continue;
      }
      if (f === "|") {
        u.push(d), d = "", c.push(u), u = new n(null, e);
        continue;
      }
      if (f === ")") return d === "" && e.#r.length === 0 && (e.#f = true), u.push(d), d = "", e.push(...c, u), l;
      d += f;
    }
    return e.type = null, e.#s = void 0, e.#r = [t.substring(s - 1)], l;
  }
  static fromGlob(t, e = {}) {
    let s = new n(null, void 0, e);
    return n.#i(t, s, 0, e), s;
  }
  toMMPattern() {
    if (this !== this.#t) return this.#t.toMMPattern();
    let t = this.toString(), [e, s, i, r] = this.toRegExpSource();
    if (!(i || this.#s || this.#h.nocase && !this.#h.nocaseMagicOnly && t.toUpperCase() !== t.toLowerCase())) return s;
    let h = (this.#h.nocase ? "i" : "") + (r ? "u" : "");
    return Object.assign(new RegExp(`^${e}$`, h), { _src: e, _glob: t });
  }
  get options() {
    return this.#h;
  }
  toRegExpSource(t) {
    let e = t ?? !!this.#h.dot;
    if (this.#t === this && this.#a(), !this.type) {
      let a = this.isStart() && this.isEnd() && !this.#r.some((f) => typeof f != "string"), l = this.#r.map((f) => {
        let [m, p, w, g] = typeof f == "string" ? n.#E(f, this.#s, a) : f.toRegExpSource(t);
        return this.#s = this.#s || w, this.#n = this.#n || g, m;
      }).join(""), u = "";
      if (this.isStart() && typeof this.#r[0] == "string" && !(this.#r.length === 1 && Ts.has(this.#r[0]))) {
        let m = Cs, p = e && m.has(l.charAt(0)) || l.startsWith("\\.") && m.has(l.charAt(2)) || l.startsWith("\\.\\.") && m.has(l.charAt(4)), w = !e && !t && m.has(l.charAt(0));
        u = p ? vs : w ? Ct : "";
      }
      let c = "";
      return this.isEnd() && this.#t.#c && this.#o?.type === "!" && (c = "(?:$|\\/)"), [u + l + c, W(l), this.#s = !!this.#s, this.#n];
    }
    let s = this.type === "*" || this.type === "+", i = this.type === "!" ? "(?:(?!(?:" : "(?:", r = this.#d(e);
    if (this.isStart() && this.isEnd() && !r && this.type !== "!") {
      let a = this.toString();
      return this.#r = [a], this.type = null, this.#s = void 0, [a, W(this.toString()), false, false];
    }
    let o = !s || t || e || !Ct ? "" : this.#d(true);
    o === r && (o = ""), o && (r = `(?:${r})(?:${o})*?`);
    let h = "";
    if (this.type === "!" && this.#f) h = (this.isStart() && !e ? Ct : "") + Ee;
    else {
      let a = this.type === "!" ? "))" + (this.isStart() && !e && !t ? Ct : "") + Se + ")" : this.type === "@" ? ")" : this.type === "?" ? ")?" : this.type === "+" && o ? ")" : this.type === "*" && o ? ")?" : `)${this.type}`;
      h = i + r + a;
    }
    return [h, W(r), this.#s = !!this.#s, this.#n];
  }
  #d(t) {
    return this.#r.map((e) => {
      if (typeof e == "string") throw new Error("string type in extglob ast??");
      let [s, i, r, o] = e.toRegExpSource(t);
      return this.#n = this.#n || o, s;
    }).filter((e) => !(this.isStart() && this.isEnd()) || !!e).join("|");
  }
  static #E(t, e, s = false) {
    let i = false, r = "", o = false, h = false;
    for (let a = 0; a < t.length; a++) {
      let l = t.charAt(a);
      if (i) {
        i = false, r += (As.has(l) ? "\\" : "") + l;
        continue;
      }
      if (l === "*") {
        if (h) continue;
        h = true, r += s && /^[*]+$/.test(t) ? Ee : Se, e = true;
        continue;
      } else h = false;
      if (l === "\\") {
        a === t.length - 1 ? r += "\\\\" : i = true;
        continue;
      }
      if (l === "[") {
        let [u, c, d, f] = ye(t, a);
        if (d) {
          r += u, o = o || c, a += d - 1, e = e || f;
          continue;
        }
      }
      if (l === "?") {
        r += Kt, e = true;
        continue;
      }
      r += ks(l);
    }
    return [r, W(t), !!e, o];
  }
};
var tt = (n7, { windowsPathsNoEscape: t = false, magicalBraces: e = false } = {}) => e ? t ? n7.replace(/[?*()[\]{}]/g, "[$&]") : n7.replace(/[?*()[\]\\{}]/g, "\\$&") : t ? n7.replace(/[?*()[\]]/g, "[$&]") : n7.replace(/[?*()[\]\\]/g, "\\$&");
var O = (n7, t, e = {}) => (at(t), !e.nocomment && t.charAt(0) === "#" ? false : new D(t, e).match(n7));
var Rs = /^\*+([^+@!?\*\[\(]*)$/;
var Os = (n7) => (t) => !t.startsWith(".") && t.endsWith(n7);
var Fs = (n7) => (t) => t.endsWith(n7);
var Ds = (n7) => (n7 = n7.toLowerCase(), (t) => !t.startsWith(".") && t.toLowerCase().endsWith(n7));
var Ms = (n7) => (n7 = n7.toLowerCase(), (t) => t.toLowerCase().endsWith(n7));
var Ns = /^\*+\.\*+$/;
var _s = (n7) => !n7.startsWith(".") && n7.includes(".");
var Ls = (n7) => n7 !== "." && n7 !== ".." && n7.includes(".");
var Ws = /^\.\*+$/;
var Ps = (n7) => n7 !== "." && n7 !== ".." && n7.startsWith(".");
var js = /^\*+$/;
var Is = (n7) => n7.length !== 0 && !n7.startsWith(".");
var zs = (n7) => n7.length !== 0 && n7 !== "." && n7 !== "..";
var Bs = /^\?+([^+@!?\*\[\(]*)?$/;
var Us = ([n7, t = ""]) => {
  let e = Ce([n7]);
  return t ? (t = t.toLowerCase(), (s) => e(s) && s.toLowerCase().endsWith(t)) : e;
};
var $s = ([n7, t = ""]) => {
  let e = Te([n7]);
  return t ? (t = t.toLowerCase(), (s) => e(s) && s.toLowerCase().endsWith(t)) : e;
};
var Gs = ([n7, t = ""]) => {
  let e = Te([n7]);
  return t ? (s) => e(s) && s.endsWith(t) : e;
};
var Hs = ([n7, t = ""]) => {
  let e = Ce([n7]);
  return t ? (s) => e(s) && s.endsWith(t) : e;
};
var Ce = ([n7]) => {
  let t = n7.length;
  return (e) => e.length === t && !e.startsWith(".");
};
var Te = ([n7]) => {
  let t = n7.length;
  return (e) => e.length === t && e !== "." && e !== "..";
};
var Ae = typeof process == "object" && process ? typeof process.env == "object" && process.env && process.env.__MINIMATCH_TESTING_PLATFORM__ || process.platform : "posix";
var xe = { win32: { sep: "\\" }, posix: { sep: "/" } };
var qs = Ae === "win32" ? xe.win32.sep : xe.posix.sep;
O.sep = qs;
var A = /* @__PURE__ */ Symbol("globstar **");
O.GLOBSTAR = A;
var Ks = "[^/]";
var Vs = Ks + "*?";
var Ys = "(?:(?!(?:\\/|^)(?:\\.{1,2})($|\\/)).)*?";
var Xs = "(?:(?!(?:\\/|^)\\.).)*?";
var Js = (n7, t = {}) => (e) => O(e, n7, t);
O.filter = Js;
var N = (n7, t = {}) => Object.assign({}, n7, t);
var Zs = (n7) => {
  if (!n7 || typeof n7 != "object" || !Object.keys(n7).length) return O;
  let t = O;
  return Object.assign((s, i, r = {}) => t(s, i, N(n7, r)), { Minimatch: class extends t.Minimatch {
    constructor(i, r = {}) {
      super(i, N(n7, r));
    }
    static defaults(i) {
      return t.defaults(N(n7, i)).Minimatch;
    }
  }, AST: class extends t.AST {
    constructor(i, r, o = {}) {
      super(i, r, N(n7, o));
    }
    static fromGlob(i, r = {}) {
      return t.AST.fromGlob(i, N(n7, r));
    }
  }, unescape: (s, i = {}) => t.unescape(s, N(n7, i)), escape: (s, i = {}) => t.escape(s, N(n7, i)), filter: (s, i = {}) => t.filter(s, N(n7, i)), defaults: (s) => t.defaults(N(n7, s)), makeRe: (s, i = {}) => t.makeRe(s, N(n7, i)), braceExpand: (s, i = {}) => t.braceExpand(s, N(n7, i)), match: (s, i, r = {}) => t.match(s, i, N(n7, r)), sep: t.sep, GLOBSTAR: A });
};
O.defaults = Zs;
var ke = (n7, t = {}) => (at(n7), t.nobrace || !/\{(?:(?!\{).)*\}/.test(n7) ? [n7] : ge(n7, { max: t.braceExpandMax }));
O.braceExpand = ke;
var Qs = (n7, t = {}) => new D(n7, t).makeRe();
O.makeRe = Qs;
var ti = (n7, t, e = {}) => {
  let s = new D(t, e);
  return n7 = n7.filter((i) => s.match(i)), s.options.nonull && !n7.length && n7.push(t), n7;
};
O.match = ti;
var ve = /[?*]|[+@!]\(.*?\)|\[|\]/;
var ei = (n7) => n7.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
var D = class {
  options;
  set;
  pattern;
  windowsPathsNoEscape;
  nonegate;
  negate;
  comment;
  empty;
  preserveMultipleSlashes;
  partial;
  globSet;
  globParts;
  nocase;
  isWindows;
  platform;
  windowsNoMagicRoot;
  regexp;
  constructor(t, e = {}) {
    at(t), e = e || {}, this.options = e, this.pattern = t, this.platform = e.platform || Ae, this.isWindows = this.platform === "win32";
    let s = "allowWindowsEscape";
    this.windowsPathsNoEscape = !!e.windowsPathsNoEscape || e[s] === false, this.windowsPathsNoEscape && (this.pattern = this.pattern.replace(/\\/g, "/")), this.preserveMultipleSlashes = !!e.preserveMultipleSlashes, this.regexp = null, this.negate = false, this.nonegate = !!e.nonegate, this.comment = false, this.empty = false, this.partial = !!e.partial, this.nocase = !!this.options.nocase, this.windowsNoMagicRoot = e.windowsNoMagicRoot !== void 0 ? e.windowsNoMagicRoot : !!(this.isWindows && this.nocase), this.globSet = [], this.globParts = [], this.set = [], this.make();
  }
  hasMagic() {
    if (this.options.magicalBraces && this.set.length > 1) return true;
    for (let t of this.set) for (let e of t) if (typeof e != "string") return true;
    return false;
  }
  debug(...t) {
  }
  make() {
    let t = this.pattern, e = this.options;
    if (!e.nocomment && t.charAt(0) === "#") {
      this.comment = true;
      return;
    }
    if (!t) {
      this.empty = true;
      return;
    }
    this.parseNegate(), this.globSet = [...new Set(this.braceExpand())], e.debug && (this.debug = (...r) => console.error(...r)), this.debug(this.pattern, this.globSet);
    let s = this.globSet.map((r) => this.slashSplit(r));
    this.globParts = this.preprocess(s), this.debug(this.pattern, this.globParts);
    let i = this.globParts.map((r, o, h) => {
      if (this.isWindows && this.windowsNoMagicRoot) {
        let a = r[0] === "" && r[1] === "" && (r[2] === "?" || !ve.test(r[2])) && !ve.test(r[3]), l = /^[a-z]:/i.test(r[0]);
        if (a) return [...r.slice(0, 4), ...r.slice(4).map((u) => this.parse(u))];
        if (l) return [r[0], ...r.slice(1).map((u) => this.parse(u))];
      }
      return r.map((a) => this.parse(a));
    });
    if (this.debug(this.pattern, i), this.set = i.filter((r) => r.indexOf(false) === -1), this.isWindows) for (let r = 0; r < this.set.length; r++) {
      let o = this.set[r];
      o[0] === "" && o[1] === "" && this.globParts[r][2] === "?" && typeof o[3] == "string" && /^[a-z]:$/i.test(o[3]) && (o[2] = "?");
    }
    this.debug(this.pattern, this.set);
  }
  preprocess(t) {
    if (this.options.noglobstar) for (let s = 0; s < t.length; s++) for (let i = 0; i < t[s].length; i++) t[s][i] === "**" && (t[s][i] = "*");
    let { optimizationLevel: e = 1 } = this.options;
    return e >= 2 ? (t = this.firstPhasePreProcess(t), t = this.secondPhasePreProcess(t)) : e >= 1 ? t = this.levelOneOptimize(t) : t = this.adjascentGlobstarOptimize(t), t;
  }
  adjascentGlobstarOptimize(t) {
    return t.map((e) => {
      let s = -1;
      for (; (s = e.indexOf("**", s + 1)) !== -1; ) {
        let i = s;
        for (; e[i + 1] === "**"; ) i++;
        i !== s && e.splice(s, i - s);
      }
      return e;
    });
  }
  levelOneOptimize(t) {
    return t.map((e) => (e = e.reduce((s, i) => {
      let r = s[s.length - 1];
      return i === "**" && r === "**" ? s : i === ".." && r && r !== ".." && r !== "." && r !== "**" ? (s.pop(), s) : (s.push(i), s);
    }, []), e.length === 0 ? [""] : e));
  }
  levelTwoFileOptimize(t) {
    Array.isArray(t) || (t = this.slashSplit(t));
    let e = false;
    do {
      if (e = false, !this.preserveMultipleSlashes) {
        for (let i = 1; i < t.length - 1; i++) {
          let r = t[i];
          i === 1 && r === "" && t[0] === "" || (r === "." || r === "") && (e = true, t.splice(i, 1), i--);
        }
        t[0] === "." && t.length === 2 && (t[1] === "." || t[1] === "") && (e = true, t.pop());
      }
      let s = 0;
      for (; (s = t.indexOf("..", s + 1)) !== -1; ) {
        let i = t[s - 1];
        i && i !== "." && i !== ".." && i !== "**" && (e = true, t.splice(s - 1, 2), s -= 2);
      }
    } while (e);
    return t.length === 0 ? [""] : t;
  }
  firstPhasePreProcess(t) {
    let e = false;
    do {
      e = false;
      for (let s of t) {
        let i = -1;
        for (; (i = s.indexOf("**", i + 1)) !== -1; ) {
          let o = i;
          for (; s[o + 1] === "**"; ) o++;
          o > i && s.splice(i + 1, o - i);
          let h = s[i + 1], a = s[i + 2], l = s[i + 3];
          if (h !== ".." || !a || a === "." || a === ".." || !l || l === "." || l === "..") continue;
          e = true, s.splice(i, 1);
          let u = s.slice(0);
          u[i] = "**", t.push(u), i--;
        }
        if (!this.preserveMultipleSlashes) {
          for (let o = 1; o < s.length - 1; o++) {
            let h = s[o];
            o === 1 && h === "" && s[0] === "" || (h === "." || h === "") && (e = true, s.splice(o, 1), o--);
          }
          s[0] === "." && s.length === 2 && (s[1] === "." || s[1] === "") && (e = true, s.pop());
        }
        let r = 0;
        for (; (r = s.indexOf("..", r + 1)) !== -1; ) {
          let o = s[r - 1];
          if (o && o !== "." && o !== ".." && o !== "**") {
            e = true;
            let a = r === 1 && s[r + 1] === "**" ? ["."] : [];
            s.splice(r - 1, 2, ...a), s.length === 0 && s.push(""), r -= 2;
          }
        }
      }
    } while (e);
    return t;
  }
  secondPhasePreProcess(t) {
    for (let e = 0; e < t.length - 1; e++) for (let s = e + 1; s < t.length; s++) {
      let i = this.partsMatch(t[e], t[s], !this.preserveMultipleSlashes);
      if (i) {
        t[e] = [], t[s] = i;
        break;
      }
    }
    return t.filter((e) => e.length);
  }
  partsMatch(t, e, s = false) {
    let i = 0, r = 0, o = [], h = "";
    for (; i < t.length && r < e.length; ) if (t[i] === e[r]) o.push(h === "b" ? e[r] : t[i]), i++, r++;
    else if (s && t[i] === "**" && e[r] === t[i + 1]) o.push(t[i]), i++;
    else if (s && e[r] === "**" && t[i] === e[r + 1]) o.push(e[r]), r++;
    else if (t[i] === "*" && e[r] && (this.options.dot || !e[r].startsWith(".")) && e[r] !== "**") {
      if (h === "b") return false;
      h = "a", o.push(t[i]), i++, r++;
    } else if (e[r] === "*" && t[i] && (this.options.dot || !t[i].startsWith(".")) && t[i] !== "**") {
      if (h === "a") return false;
      h = "b", o.push(e[r]), i++, r++;
    } else return false;
    return t.length === e.length && o;
  }
  parseNegate() {
    if (this.nonegate) return;
    let t = this.pattern, e = false, s = 0;
    for (let i = 0; i < t.length && t.charAt(i) === "!"; i++) e = !e, s++;
    s && (this.pattern = t.slice(s)), this.negate = e;
  }
  matchOne(t, e, s = false) {
    let i = this.options;
    if (this.isWindows) {
      let p = typeof t[0] == "string" && /^[a-z]:$/i.test(t[0]), w = !p && t[0] === "" && t[1] === "" && t[2] === "?" && /^[a-z]:$/i.test(t[3]), g = typeof e[0] == "string" && /^[a-z]:$/i.test(e[0]), S = !g && e[0] === "" && e[1] === "" && e[2] === "?" && typeof e[3] == "string" && /^[a-z]:$/i.test(e[3]), E = w ? 3 : p ? 0 : void 0, y = S ? 3 : g ? 0 : void 0;
      if (typeof E == "number" && typeof y == "number") {
        let [b, z] = [t[E], e[y]];
        b.toLowerCase() === z.toLowerCase() && (e[y] = b, y > E ? e = e.slice(y) : E > y && (t = t.slice(E)));
      }
    }
    let { optimizationLevel: r = 1 } = this.options;
    r >= 2 && (t = this.levelTwoFileOptimize(t)), this.debug("matchOne", this, { file: t, pattern: e }), this.debug("matchOne", t.length, e.length);
    for (var o = 0, h = 0, a = t.length, l = e.length; o < a && h < l; o++, h++) {
      this.debug("matchOne loop");
      var u = e[h], c = t[o];
      if (this.debug(e, u, c), u === false) return false;
      if (u === A) {
        this.debug("GLOBSTAR", [e, u, c]);
        var d = o, f = h + 1;
        if (f === l) {
          for (this.debug("** at the end"); o < a; o++) if (t[o] === "." || t[o] === ".." || !i.dot && t[o].charAt(0) === ".") return false;
          return true;
        }
        for (; d < a; ) {
          var m = t[d];
          if (this.debug(`
globstar while`, t, d, e, f, m), this.matchOne(t.slice(d), e.slice(f), s)) return this.debug("globstar found match!", d, a, m), true;
          if (m === "." || m === ".." || !i.dot && m.charAt(0) === ".") {
            this.debug("dot detected!", t, d, e, f);
            break;
          }
          this.debug("globstar swallow a segment, and continue"), d++;
        }
        return !!(s && (this.debug(`
>>> no match, partial?`, t, d, e, f), d === a));
      }
      let p;
      if (typeof u == "string" ? (p = c === u, this.debug("string match", u, c, p)) : (p = u.test(c), this.debug("pattern match", u, c, p)), !p) return false;
    }
    if (o === a && h === l) return true;
    if (o === a) return s;
    if (h === l) return o === a - 1 && t[o] === "";
    throw new Error("wtf?");
  }
  braceExpand() {
    return ke(this.pattern, this.options);
  }
  parse(t) {
    at(t);
    let e = this.options;
    if (t === "**") return A;
    if (t === "") return "";
    let s, i = null;
    (s = t.match(js)) ? i = e.dot ? zs : Is : (s = t.match(Rs)) ? i = (e.nocase ? e.dot ? Ms : Ds : e.dot ? Fs : Os)(s[1]) : (s = t.match(Bs)) ? i = (e.nocase ? e.dot ? $s : Us : e.dot ? Gs : Hs)(s) : (s = t.match(Ns)) ? i = e.dot ? Ls : _s : (s = t.match(Ws)) && (i = Ps);
    let r = Q.fromGlob(t, this.options).toMMPattern();
    return i && typeof r == "object" && Reflect.defineProperty(r, "test", { value: i }), r;
  }
  makeRe() {
    if (this.regexp || this.regexp === false) return this.regexp;
    let t = this.set;
    if (!t.length) return this.regexp = false, this.regexp;
    let e = this.options, s = e.noglobstar ? Vs : e.dot ? Ys : Xs, i = new Set(e.nocase ? ["i"] : []), r = t.map((a) => {
      let l = a.map((c) => {
        if (c instanceof RegExp) for (let d of c.flags.split("")) i.add(d);
        return typeof c == "string" ? ei(c) : c === A ? A : c._src;
      });
      l.forEach((c, d) => {
        let f = l[d + 1], m = l[d - 1];
        c !== A || m === A || (m === void 0 ? f !== void 0 && f !== A ? l[d + 1] = "(?:\\/|" + s + "\\/)?" + f : l[d] = s : f === void 0 ? l[d - 1] = m + "(?:\\/|\\/" + s + ")?" : f !== A && (l[d - 1] = m + "(?:\\/|\\/" + s + "\\/)" + f, l[d + 1] = A));
      });
      let u = l.filter((c) => c !== A);
      if (this.partial && u.length >= 1) {
        let c = [];
        for (let d = 1; d <= u.length; d++) c.push(u.slice(0, d).join("/"));
        return "(?:" + c.join("|") + ")";
      }
      return u.join("/");
    }).join("|"), [o, h] = t.length > 1 ? ["(?:", ")"] : ["", ""];
    r = "^" + o + r + h + "$", this.partial && (r = "^(?:\\/|" + o + r.slice(1, -1) + h + ")$"), this.negate && (r = "^(?!" + r + ").+$");
    try {
      this.regexp = new RegExp(r, [...i].join(""));
    } catch {
      this.regexp = false;
    }
    return this.regexp;
  }
  slashSplit(t) {
    return this.preserveMultipleSlashes ? t.split("/") : this.isWindows && /^\/\/[^\/]+/.test(t) ? ["", ...t.split(/\/+/)] : t.split(/\/+/);
  }
  match(t, e = this.partial) {
    if (this.debug("match", t, this.pattern), this.comment) return false;
    if (this.empty) return t === "";
    if (t === "/" && e) return true;
    let s = this.options;
    this.isWindows && (t = t.split("\\").join("/"));
    let i = this.slashSplit(t);
    this.debug(this.pattern, "split", i);
    let r = this.set;
    this.debug(this.pattern, "set", r);
    let o = i[i.length - 1];
    if (!o) for (let h = i.length - 2; !o && h >= 0; h--) o = i[h];
    for (let h = 0; h < r.length; h++) {
      let a = r[h], l = i;
      if (s.matchBase && a.length === 1 && (l = [o]), this.matchOne(l, a, e)) return s.flipNegate ? true : !this.negate;
    }
    return s.flipNegate ? false : this.negate;
  }
  static defaults(t) {
    return O.defaults(t).Minimatch;
  }
};
O.AST = Q;
O.Minimatch = D;
O.escape = tt;
O.unescape = W;
var si = typeof performance == "object" && performance && typeof performance.now == "function" ? performance : Date;
var Oe = /* @__PURE__ */ new Set();
var Vt = typeof process == "object" && process ? process : {};
var Fe = (n7, t, e, s) => {
  typeof Vt.emitWarning == "function" ? Vt.emitWarning(n7, t, e, s) : console.error(`[${e}] ${t}: ${n7}`);
};
var At = globalThis.AbortController;
var Re = globalThis.AbortSignal;
if (typeof At > "u") {
  Re = class {
    onabort;
    _onabort = [];
    reason;
    aborted = false;
    addEventListener(e, s) {
      this._onabort.push(s);
    }
  }, At = class {
    constructor() {
      t();
    }
    signal = new Re();
    abort(e) {
      if (!this.signal.aborted) {
        this.signal.reason = e, this.signal.aborted = true;
        for (let s of this.signal._onabort) s(e);
        this.signal.onabort?.(e);
      }
    }
  };
  let n7 = Vt.env?.LRU_CACHE_IGNORE_AC_WARNING !== "1", t = () => {
    n7 && (n7 = false, Fe("AbortController is not defined. If using lru-cache in node 14, load an AbortController polyfill from the `node-abort-controller` package. A minimal polyfill is provided for use by LRUCache.fetch(), but it should not be relied upon in other contexts (eg, passing it to other APIs that use AbortController/AbortSignal might have undesirable effects). You may disable this with LRU_CACHE_IGNORE_AC_WARNING=1 in the env.", "NO_ABORT_CONTROLLER", "ENOTSUP", t));
  };
}
var ii = (n7) => !Oe.has(n7);
var q = (n7) => n7 && n7 === Math.floor(n7) && n7 > 0 && isFinite(n7);
var De = (n7) => q(n7) ? n7 <= Math.pow(2, 8) ? Uint8Array : n7 <= Math.pow(2, 16) ? Uint16Array : n7 <= Math.pow(2, 32) ? Uint32Array : n7 <= Number.MAX_SAFE_INTEGER ? Tt : null : null;
var Tt = class extends Array {
  constructor(n7) {
    super(n7), this.fill(0);
  }
};
var ri = class ct {
  heap;
  length;
  static #t = false;
  static create(t) {
    let e = De(t);
    if (!e) return [];
    ct.#t = true;
    let s = new ct(t, e);
    return ct.#t = false, s;
  }
  constructor(t, e) {
    if (!ct.#t) throw new TypeError("instantiate Stack using Stack.create(n)");
    this.heap = new e(t), this.length = 0;
  }
  push(t) {
    this.heap[this.length++] = t;
  }
  pop() {
    return this.heap[--this.length];
  }
};
var ft = class Me {
  #t;
  #s;
  #n;
  #r;
  #o;
  #S;
  #w;
  #c;
  get perf() {
    return this.#c;
  }
  ttl;
  ttlResolution;
  ttlAutopurge;
  updateAgeOnGet;
  updateAgeOnHas;
  allowStale;
  noDisposeOnSet;
  noUpdateTTL;
  maxEntrySize;
  sizeCalculation;
  noDeleteOnFetchRejection;
  noDeleteOnStaleGet;
  allowStaleOnFetchAbort;
  allowStaleOnFetchRejection;
  ignoreFetchAbort;
  #h;
  #u;
  #f;
  #a;
  #i;
  #d;
  #E;
  #b;
  #p;
  #R;
  #m;
  #C;
  #T;
  #g;
  #y;
  #x;
  #A;
  #e;
  #_;
  static unsafeExposeInternals(t) {
    return { starts: t.#T, ttls: t.#g, autopurgeTimers: t.#y, sizes: t.#C, keyMap: t.#f, keyList: t.#a, valList: t.#i, next: t.#d, prev: t.#E, get head() {
      return t.#b;
    }, get tail() {
      return t.#p;
    }, free: t.#R, isBackgroundFetch: (e) => t.#l(e), backgroundFetch: (e, s, i, r) => t.#U(e, s, i, r), moveToTail: (e) => t.#W(e), indexes: (e) => t.#F(e), rindexes: (e) => t.#D(e), isStale: (e) => t.#v(e) };
  }
  get max() {
    return this.#t;
  }
  get maxSize() {
    return this.#s;
  }
  get calculatedSize() {
    return this.#u;
  }
  get size() {
    return this.#h;
  }
  get fetchMethod() {
    return this.#S;
  }
  get memoMethod() {
    return this.#w;
  }
  get dispose() {
    return this.#n;
  }
  get onInsert() {
    return this.#r;
  }
  get disposeAfter() {
    return this.#o;
  }
  constructor(t) {
    let { max: e = 0, ttl: s, ttlResolution: i = 1, ttlAutopurge: r, updateAgeOnGet: o, updateAgeOnHas: h, allowStale: a, dispose: l, onInsert: u, disposeAfter: c, noDisposeOnSet: d, noUpdateTTL: f, maxSize: m = 0, maxEntrySize: p = 0, sizeCalculation: w, fetchMethod: g, memoMethod: S, noDeleteOnFetchRejection: E, noDeleteOnStaleGet: y, allowStaleOnFetchRejection: b, allowStaleOnFetchAbort: z, ignoreFetchAbort: $, perf: J } = t;
    if (J !== void 0 && typeof J?.now != "function") throw new TypeError("perf option must have a now() method if specified");
    if (this.#c = J ?? si, e !== 0 && !q(e)) throw new TypeError("max option must be a nonnegative integer");
    let Z = e ? De(e) : Array;
    if (!Z) throw new Error("invalid max value: " + e);
    if (this.#t = e, this.#s = m, this.maxEntrySize = p || this.#s, this.sizeCalculation = w, this.sizeCalculation) {
      if (!this.#s && !this.maxEntrySize) throw new TypeError("cannot set sizeCalculation without setting maxSize or maxEntrySize");
      if (typeof this.sizeCalculation != "function") throw new TypeError("sizeCalculation set to non-function");
    }
    if (S !== void 0 && typeof S != "function") throw new TypeError("memoMethod must be a function if defined");
    if (this.#w = S, g !== void 0 && typeof g != "function") throw new TypeError("fetchMethod must be a function if specified");
    if (this.#S = g, this.#A = !!g, this.#f = /* @__PURE__ */ new Map(), this.#a = new Array(e).fill(void 0), this.#i = new Array(e).fill(void 0), this.#d = new Z(e), this.#E = new Z(e), this.#b = 0, this.#p = 0, this.#R = ri.create(e), this.#h = 0, this.#u = 0, typeof l == "function" && (this.#n = l), typeof u == "function" && (this.#r = u), typeof c == "function" ? (this.#o = c, this.#m = []) : (this.#o = void 0, this.#m = void 0), this.#x = !!this.#n, this.#_ = !!this.#r, this.#e = !!this.#o, this.noDisposeOnSet = !!d, this.noUpdateTTL = !!f, this.noDeleteOnFetchRejection = !!E, this.allowStaleOnFetchRejection = !!b, this.allowStaleOnFetchAbort = !!z, this.ignoreFetchAbort = !!$, this.maxEntrySize !== 0) {
      if (this.#s !== 0 && !q(this.#s)) throw new TypeError("maxSize must be a positive integer if specified");
      if (!q(this.maxEntrySize)) throw new TypeError("maxEntrySize must be a positive integer if specified");
      this.#G();
    }
    if (this.allowStale = !!a, this.noDeleteOnStaleGet = !!y, this.updateAgeOnGet = !!o, this.updateAgeOnHas = !!h, this.ttlResolution = q(i) || i === 0 ? i : 1, this.ttlAutopurge = !!r, this.ttl = s || 0, this.ttl) {
      if (!q(this.ttl)) throw new TypeError("ttl must be a positive integer if specified");
      this.#M();
    }
    if (this.#t === 0 && this.ttl === 0 && this.#s === 0) throw new TypeError("At least one of max, maxSize, or ttl is required");
    if (!this.ttlAutopurge && !this.#t && !this.#s) {
      let $t = "LRU_CACHE_UNBOUNDED";
      ii($t) && (Oe.add($t), Fe("TTL caching without ttlAutopurge, max, or maxSize can result in unbounded memory consumption.", "UnboundedCacheWarning", $t, Me));
    }
  }
  getRemainingTTL(t) {
    return this.#f.has(t) ? 1 / 0 : 0;
  }
  #M() {
    let t = new Tt(this.#t), e = new Tt(this.#t);
    this.#g = t, this.#T = e;
    let s = this.ttlAutopurge ? new Array(this.#t) : void 0;
    this.#y = s, this.#j = (o, h, a = this.#c.now()) => {
      if (e[o] = h !== 0 ? a : 0, t[o] = h, s?.[o] && (clearTimeout(s[o]), s[o] = void 0), h !== 0 && s) {
        let l = setTimeout(() => {
          this.#v(o) && this.#O(this.#a[o], "expire");
        }, h + 1);
        l.unref && l.unref(), s[o] = l;
      }
    }, this.#k = (o) => {
      e[o] = t[o] !== 0 ? this.#c.now() : 0;
    }, this.#N = (o, h) => {
      if (t[h]) {
        let a = t[h], l = e[h];
        if (!a || !l) return;
        o.ttl = a, o.start = l, o.now = i || r();
        let u = o.now - l;
        o.remainingTTL = a - u;
      }
    };
    let i = 0, r = () => {
      let o = this.#c.now();
      if (this.ttlResolution > 0) {
        i = o;
        let h = setTimeout(() => i = 0, this.ttlResolution);
        h.unref && h.unref();
      }
      return o;
    };
    this.getRemainingTTL = (o) => {
      let h = this.#f.get(o);
      if (h === void 0) return 0;
      let a = t[h], l = e[h];
      if (!a || !l) return 1 / 0;
      let u = (i || r()) - l;
      return a - u;
    }, this.#v = (o) => {
      let h = e[o], a = t[o];
      return !!a && !!h && (i || r()) - h > a;
    };
  }
  #k = () => {
  };
  #N = () => {
  };
  #j = () => {
  };
  #v = () => false;
  #G() {
    let t = new Tt(this.#t);
    this.#u = 0, this.#C = t, this.#P = (e) => {
      this.#u -= t[e], t[e] = 0;
    }, this.#I = (e, s, i, r) => {
      if (this.#l(s)) return 0;
      if (!q(i)) if (r) {
        if (typeof r != "function") throw new TypeError("sizeCalculation must be a function");
        if (i = r(s, e), !q(i)) throw new TypeError("sizeCalculation return invalid (expect positive integer)");
      } else throw new TypeError("invalid size value (must be positive integer). When maxSize or maxEntrySize is used, sizeCalculation or size must be set.");
      return i;
    }, this.#L = (e, s, i) => {
      if (t[e] = s, this.#s) {
        let r = this.#s - t[e];
        for (; this.#u > r; ) this.#B(true);
      }
      this.#u += t[e], i && (i.entrySize = s, i.totalCalculatedSize = this.#u);
    };
  }
  #P = (t) => {
  };
  #L = (t, e, s) => {
  };
  #I = (t, e, s, i) => {
    if (s || i) throw new TypeError("cannot set size without setting maxSize or maxEntrySize on cache");
    return 0;
  };
  *#F({ allowStale: t = this.allowStale } = {}) {
    if (this.#h) for (let e = this.#p; !(!this.#z(e) || ((t || !this.#v(e)) && (yield e), e === this.#b)); ) e = this.#E[e];
  }
  *#D({ allowStale: t = this.allowStale } = {}) {
    if (this.#h) for (let e = this.#b; !(!this.#z(e) || ((t || !this.#v(e)) && (yield e), e === this.#p)); ) e = this.#d[e];
  }
  #z(t) {
    return t !== void 0 && this.#f.get(this.#a[t]) === t;
  }
  *entries() {
    for (let t of this.#F()) this.#i[t] !== void 0 && this.#a[t] !== void 0 && !this.#l(this.#i[t]) && (yield [this.#a[t], this.#i[t]]);
  }
  *rentries() {
    for (let t of this.#D()) this.#i[t] !== void 0 && this.#a[t] !== void 0 && !this.#l(this.#i[t]) && (yield [this.#a[t], this.#i[t]]);
  }
  *keys() {
    for (let t of this.#F()) {
      let e = this.#a[t];
      e !== void 0 && !this.#l(this.#i[t]) && (yield e);
    }
  }
  *rkeys() {
    for (let t of this.#D()) {
      let e = this.#a[t];
      e !== void 0 && !this.#l(this.#i[t]) && (yield e);
    }
  }
  *values() {
    for (let t of this.#F()) this.#i[t] !== void 0 && !this.#l(this.#i[t]) && (yield this.#i[t]);
  }
  *rvalues() {
    for (let t of this.#D()) this.#i[t] !== void 0 && !this.#l(this.#i[t]) && (yield this.#i[t]);
  }
  [Symbol.iterator]() {
    return this.entries();
  }
  [Symbol.toStringTag] = "LRUCache";
  find(t, e = {}) {
    for (let s of this.#F()) {
      let i = this.#i[s], r = this.#l(i) ? i.__staleWhileFetching : i;
      if (r !== void 0 && t(r, this.#a[s], this)) return this.get(this.#a[s], e);
    }
  }
  forEach(t, e = this) {
    for (let s of this.#F()) {
      let i = this.#i[s], r = this.#l(i) ? i.__staleWhileFetching : i;
      r !== void 0 && t.call(e, r, this.#a[s], this);
    }
  }
  rforEach(t, e = this) {
    for (let s of this.#D()) {
      let i = this.#i[s], r = this.#l(i) ? i.__staleWhileFetching : i;
      r !== void 0 && t.call(e, r, this.#a[s], this);
    }
  }
  purgeStale() {
    let t = false;
    for (let e of this.#D({ allowStale: true })) this.#v(e) && (this.#O(this.#a[e], "expire"), t = true);
    return t;
  }
  info(t) {
    let e = this.#f.get(t);
    if (e === void 0) return;
    let s = this.#i[e], i = this.#l(s) ? s.__staleWhileFetching : s;
    if (i === void 0) return;
    let r = { value: i };
    if (this.#g && this.#T) {
      let o = this.#g[e], h = this.#T[e];
      if (o && h) {
        let a = o - (this.#c.now() - h);
        r.ttl = a, r.start = Date.now();
      }
    }
    return this.#C && (r.size = this.#C[e]), r;
  }
  dump() {
    let t = [];
    for (let e of this.#F({ allowStale: true })) {
      let s = this.#a[e], i = this.#i[e], r = this.#l(i) ? i.__staleWhileFetching : i;
      if (r === void 0 || s === void 0) continue;
      let o = { value: r };
      if (this.#g && this.#T) {
        o.ttl = this.#g[e];
        let h = this.#c.now() - this.#T[e];
        o.start = Math.floor(Date.now() - h);
      }
      this.#C && (o.size = this.#C[e]), t.unshift([s, o]);
    }
    return t;
  }
  load(t) {
    this.clear();
    for (let [e, s] of t) {
      if (s.start) {
        let i = Date.now() - s.start;
        s.start = this.#c.now() - i;
      }
      this.set(e, s.value, s);
    }
  }
  set(t, e, s = {}) {
    if (e === void 0) return this.delete(t), this;
    let { ttl: i = this.ttl, start: r, noDisposeOnSet: o = this.noDisposeOnSet, sizeCalculation: h = this.sizeCalculation, status: a } = s, { noUpdateTTL: l = this.noUpdateTTL } = s, u = this.#I(t, e, s.size || 0, h);
    if (this.maxEntrySize && u > this.maxEntrySize) return a && (a.set = "miss", a.maxEntrySizeExceeded = true), this.#O(t, "set"), this;
    let c = this.#h === 0 ? void 0 : this.#f.get(t);
    if (c === void 0) c = this.#h === 0 ? this.#p : this.#R.length !== 0 ? this.#R.pop() : this.#h === this.#t ? this.#B(false) : this.#h, this.#a[c] = t, this.#i[c] = e, this.#f.set(t, c), this.#d[this.#p] = c, this.#E[c] = this.#p, this.#p = c, this.#h++, this.#L(c, u, a), a && (a.set = "add"), l = false, this.#_ && this.#r?.(e, t, "add");
    else {
      this.#W(c);
      let d = this.#i[c];
      if (e !== d) {
        if (this.#A && this.#l(d)) {
          d.__abortController.abort(new Error("replaced"));
          let { __staleWhileFetching: f } = d;
          f !== void 0 && !o && (this.#x && this.#n?.(f, t, "set"), this.#e && this.#m?.push([f, t, "set"]));
        } else o || (this.#x && this.#n?.(d, t, "set"), this.#e && this.#m?.push([d, t, "set"]));
        if (this.#P(c), this.#L(c, u, a), this.#i[c] = e, a) {
          a.set = "replace";
          let f = d && this.#l(d) ? d.__staleWhileFetching : d;
          f !== void 0 && (a.oldValue = f);
        }
      } else a && (a.set = "update");
      this.#_ && this.onInsert?.(e, t, e === d ? "update" : "replace");
    }
    if (i !== 0 && !this.#g && this.#M(), this.#g && (l || this.#j(c, i, r), a && this.#N(a, c)), !o && this.#e && this.#m) {
      let d = this.#m, f;
      for (; f = d?.shift(); ) this.#o?.(...f);
    }
    return this;
  }
  pop() {
    try {
      for (; this.#h; ) {
        let t = this.#i[this.#b];
        if (this.#B(true), this.#l(t)) {
          if (t.__staleWhileFetching) return t.__staleWhileFetching;
        } else if (t !== void 0) return t;
      }
    } finally {
      if (this.#e && this.#m) {
        let t = this.#m, e;
        for (; e = t?.shift(); ) this.#o?.(...e);
      }
    }
  }
  #B(t) {
    let e = this.#b, s = this.#a[e], i = this.#i[e];
    return this.#A && this.#l(i) ? i.__abortController.abort(new Error("evicted")) : (this.#x || this.#e) && (this.#x && this.#n?.(i, s, "evict"), this.#e && this.#m?.push([i, s, "evict"])), this.#P(e), this.#y?.[e] && (clearTimeout(this.#y[e]), this.#y[e] = void 0), t && (this.#a[e] = void 0, this.#i[e] = void 0, this.#R.push(e)), this.#h === 1 ? (this.#b = this.#p = 0, this.#R.length = 0) : this.#b = this.#d[e], this.#f.delete(s), this.#h--, e;
  }
  has(t, e = {}) {
    let { updateAgeOnHas: s = this.updateAgeOnHas, status: i } = e, r = this.#f.get(t);
    if (r !== void 0) {
      let o = this.#i[r];
      if (this.#l(o) && o.__staleWhileFetching === void 0) return false;
      if (this.#v(r)) i && (i.has = "stale", this.#N(i, r));
      else return s && this.#k(r), i && (i.has = "hit", this.#N(i, r)), true;
    } else i && (i.has = "miss");
    return false;
  }
  peek(t, e = {}) {
    let { allowStale: s = this.allowStale } = e, i = this.#f.get(t);
    if (i === void 0 || !s && this.#v(i)) return;
    let r = this.#i[i];
    return this.#l(r) ? r.__staleWhileFetching : r;
  }
  #U(t, e, s, i) {
    let r = e === void 0 ? void 0 : this.#i[e];
    if (this.#l(r)) return r;
    let o = new At(), { signal: h } = s;
    h?.addEventListener("abort", () => o.abort(h.reason), { signal: o.signal });
    let a = { signal: o.signal, options: s, context: i }, l = (p, w = false) => {
      let { aborted: g } = o.signal, S = s.ignoreFetchAbort && p !== void 0, E = s.ignoreFetchAbort || !!(s.allowStaleOnFetchAbort && p !== void 0);
      if (s.status && (g && !w ? (s.status.fetchAborted = true, s.status.fetchError = o.signal.reason, S && (s.status.fetchAbortIgnored = true)) : s.status.fetchResolved = true), g && !S && !w) return c(o.signal.reason, E);
      let y = f, b = this.#i[e];
      return (b === f || S && w && b === void 0) && (p === void 0 ? y.__staleWhileFetching !== void 0 ? this.#i[e] = y.__staleWhileFetching : this.#O(t, "fetch") : (s.status && (s.status.fetchUpdated = true), this.set(t, p, a.options))), p;
    }, u = (p) => (s.status && (s.status.fetchRejected = true, s.status.fetchError = p), c(p, false)), c = (p, w) => {
      let { aborted: g } = o.signal, S = g && s.allowStaleOnFetchAbort, E = S || s.allowStaleOnFetchRejection, y = E || s.noDeleteOnFetchRejection, b = f;
      if (this.#i[e] === f && (!y || !w && b.__staleWhileFetching === void 0 ? this.#O(t, "fetch") : S || (this.#i[e] = b.__staleWhileFetching)), E) return s.status && b.__staleWhileFetching !== void 0 && (s.status.returnedStale = true), b.__staleWhileFetching;
      if (b.__returned === b) throw p;
    }, d = (p, w) => {
      let g = this.#S?.(t, r, a);
      g && g instanceof Promise && g.then((S) => p(S === void 0 ? void 0 : S), w), o.signal.addEventListener("abort", () => {
        (!s.ignoreFetchAbort || s.allowStaleOnFetchAbort) && (p(void 0), s.allowStaleOnFetchAbort && (p = (S) => l(S, true)));
      });
    };
    s.status && (s.status.fetchDispatched = true);
    let f = new Promise(d).then(l, u), m = Object.assign(f, { __abortController: o, __staleWhileFetching: r, __returned: void 0 });
    return e === void 0 ? (this.set(t, m, { ...a.options, status: void 0 }), e = this.#f.get(t)) : this.#i[e] = m, m;
  }
  #l(t) {
    if (!this.#A) return false;
    let e = t;
    return !!e && e instanceof Promise && e.hasOwnProperty("__staleWhileFetching") && e.__abortController instanceof At;
  }
  async fetch(t, e = {}) {
    let { allowStale: s = this.allowStale, updateAgeOnGet: i = this.updateAgeOnGet, noDeleteOnStaleGet: r = this.noDeleteOnStaleGet, ttl: o = this.ttl, noDisposeOnSet: h = this.noDisposeOnSet, size: a = 0, sizeCalculation: l = this.sizeCalculation, noUpdateTTL: u = this.noUpdateTTL, noDeleteOnFetchRejection: c = this.noDeleteOnFetchRejection, allowStaleOnFetchRejection: d = this.allowStaleOnFetchRejection, ignoreFetchAbort: f = this.ignoreFetchAbort, allowStaleOnFetchAbort: m = this.allowStaleOnFetchAbort, context: p, forceRefresh: w = false, status: g, signal: S } = e;
    if (!this.#A) return g && (g.fetch = "get"), this.get(t, { allowStale: s, updateAgeOnGet: i, noDeleteOnStaleGet: r, status: g });
    let E = { allowStale: s, updateAgeOnGet: i, noDeleteOnStaleGet: r, ttl: o, noDisposeOnSet: h, size: a, sizeCalculation: l, noUpdateTTL: u, noDeleteOnFetchRejection: c, allowStaleOnFetchRejection: d, allowStaleOnFetchAbort: m, ignoreFetchAbort: f, status: g, signal: S }, y = this.#f.get(t);
    if (y === void 0) {
      g && (g.fetch = "miss");
      let b = this.#U(t, y, E, p);
      return b.__returned = b;
    } else {
      let b = this.#i[y];
      if (this.#l(b)) {
        let Z = s && b.__staleWhileFetching !== void 0;
        return g && (g.fetch = "inflight", Z && (g.returnedStale = true)), Z ? b.__staleWhileFetching : b.__returned = b;
      }
      let z = this.#v(y);
      if (!w && !z) return g && (g.fetch = "hit"), this.#W(y), i && this.#k(y), g && this.#N(g, y), b;
      let $ = this.#U(t, y, E, p), J = $.__staleWhileFetching !== void 0 && s;
      return g && (g.fetch = z ? "stale" : "refresh", J && z && (g.returnedStale = true)), J ? $.__staleWhileFetching : $.__returned = $;
    }
  }
  async forceFetch(t, e = {}) {
    let s = await this.fetch(t, e);
    if (s === void 0) throw new Error("fetch() returned undefined");
    return s;
  }
  memo(t, e = {}) {
    let s = this.#w;
    if (!s) throw new Error("no memoMethod provided to constructor");
    let { context: i, forceRefresh: r, ...o } = e, h = this.get(t, o);
    if (!r && h !== void 0) return h;
    let a = s(t, h, { options: o, context: i });
    return this.set(t, a, o), a;
  }
  get(t, e = {}) {
    let { allowStale: s = this.allowStale, updateAgeOnGet: i = this.updateAgeOnGet, noDeleteOnStaleGet: r = this.noDeleteOnStaleGet, status: o } = e, h = this.#f.get(t);
    if (h !== void 0) {
      let a = this.#i[h], l = this.#l(a);
      return o && this.#N(o, h), this.#v(h) ? (o && (o.get = "stale"), l ? (o && s && a.__staleWhileFetching !== void 0 && (o.returnedStale = true), s ? a.__staleWhileFetching : void 0) : (r || this.#O(t, "expire"), o && s && (o.returnedStale = true), s ? a : void 0)) : (o && (o.get = "hit"), l ? a.__staleWhileFetching : (this.#W(h), i && this.#k(h), a));
    } else o && (o.get = "miss");
  }
  #$(t, e) {
    this.#E[e] = t, this.#d[t] = e;
  }
  #W(t) {
    t !== this.#p && (t === this.#b ? this.#b = this.#d[t] : this.#$(this.#E[t], this.#d[t]), this.#$(this.#p, t), this.#p = t);
  }
  delete(t) {
    return this.#O(t, "delete");
  }
  #O(t, e) {
    let s = false;
    if (this.#h !== 0) {
      let i = this.#f.get(t);
      if (i !== void 0) if (this.#y?.[i] && (clearTimeout(this.#y?.[i]), this.#y[i] = void 0), s = true, this.#h === 1) this.#H(e);
      else {
        this.#P(i);
        let r = this.#i[i];
        if (this.#l(r) ? r.__abortController.abort(new Error("deleted")) : (this.#x || this.#e) && (this.#x && this.#n?.(r, t, e), this.#e && this.#m?.push([r, t, e])), this.#f.delete(t), this.#a[i] = void 0, this.#i[i] = void 0, i === this.#p) this.#p = this.#E[i];
        else if (i === this.#b) this.#b = this.#d[i];
        else {
          let o = this.#E[i];
          this.#d[o] = this.#d[i];
          let h = this.#d[i];
          this.#E[h] = this.#E[i];
        }
        this.#h--, this.#R.push(i);
      }
    }
    if (this.#e && this.#m?.length) {
      let i = this.#m, r;
      for (; r = i?.shift(); ) this.#o?.(...r);
    }
    return s;
  }
  clear() {
    return this.#H("delete");
  }
  #H(t) {
    for (let e of this.#D({ allowStale: true })) {
      let s = this.#i[e];
      if (this.#l(s)) s.__abortController.abort(new Error("deleted"));
      else {
        let i = this.#a[e];
        this.#x && this.#n?.(s, i, t), this.#e && this.#m?.push([s, i, t]);
      }
    }
    if (this.#f.clear(), this.#i.fill(void 0), this.#a.fill(void 0), this.#g && this.#T) {
      this.#g.fill(0), this.#T.fill(0);
      for (let e of this.#y ?? []) e !== void 0 && clearTimeout(e);
      this.#y?.fill(void 0);
    }
    if (this.#C && this.#C.fill(0), this.#b = 0, this.#p = 0, this.#R.length = 0, this.#u = 0, this.#h = 0, this.#e && this.#m) {
      let e = this.#m, s;
      for (; s = e?.shift(); ) this.#o?.(...s);
    }
  }
};
var Ne = typeof process == "object" && process ? process : { stdout: null, stderr: null };
var oi = (n7) => !!n7 && typeof n7 == "object" && (n7 instanceof V || n7 instanceof Pe || hi(n7) || ai(n7));
var hi = (n7) => !!n7 && typeof n7 == "object" && n7 instanceof ee && typeof n7.pipe == "function" && n7.pipe !== Pe.Writable.prototype.pipe;
var ai = (n7) => !!n7 && typeof n7 == "object" && n7 instanceof ee && typeof n7.write == "function" && typeof n7.end == "function";
var G = /* @__PURE__ */ Symbol("EOF");
var H = /* @__PURE__ */ Symbol("maybeEmitEnd");
var K = /* @__PURE__ */ Symbol("emittedEnd");
var kt = /* @__PURE__ */ Symbol("emittingEnd");
var ut = /* @__PURE__ */ Symbol("emittedError");
var Rt = /* @__PURE__ */ Symbol("closed");
var _e = /* @__PURE__ */ Symbol("read");
var Ot = /* @__PURE__ */ Symbol("flush");
var Le = /* @__PURE__ */ Symbol("flushChunk");
var P = /* @__PURE__ */ Symbol("encoding");
var et = /* @__PURE__ */ Symbol("decoder");
var v = /* @__PURE__ */ Symbol("flowing");
var dt = /* @__PURE__ */ Symbol("paused");
var st = /* @__PURE__ */ Symbol("resume");
var C = /* @__PURE__ */ Symbol("buffer");
var F = /* @__PURE__ */ Symbol("pipes");
var T = /* @__PURE__ */ Symbol("bufferLength");
var Yt = /* @__PURE__ */ Symbol("bufferPush");
var Ft = /* @__PURE__ */ Symbol("bufferShift");
var k = /* @__PURE__ */ Symbol("objectMode");
var x = /* @__PURE__ */ Symbol("destroyed");
var Xt = /* @__PURE__ */ Symbol("error");
var Jt = /* @__PURE__ */ Symbol("emitData");
var We = /* @__PURE__ */ Symbol("emitEnd");
var Zt = /* @__PURE__ */ Symbol("emitEnd2");
var B = /* @__PURE__ */ Symbol("async");
var Qt = /* @__PURE__ */ Symbol("abort");
var Dt = /* @__PURE__ */ Symbol("aborted");
var pt = /* @__PURE__ */ Symbol("signal");
var Y = /* @__PURE__ */ Symbol("dataListeners");
var M = /* @__PURE__ */ Symbol("discarded");
var mt = (n7) => Promise.resolve().then(n7);
var li = (n7) => n7();
var ci = (n7) => n7 === "end" || n7 === "finish" || n7 === "prefinish";
var fi = (n7) => n7 instanceof ArrayBuffer || !!n7 && typeof n7 == "object" && n7.constructor && n7.constructor.name === "ArrayBuffer" && n7.byteLength >= 0;
var ui = (n7) => !Buffer.isBuffer(n7) && ArrayBuffer.isView(n7);
var Mt = class {
  src;
  dest;
  opts;
  ondrain;
  constructor(t, e, s) {
    this.src = t, this.dest = e, this.opts = s, this.ondrain = () => t[st](), this.dest.on("drain", this.ondrain);
  }
  unpipe() {
    this.dest.removeListener("drain", this.ondrain);
  }
  proxyErrors(t) {
  }
  end() {
    this.unpipe(), this.opts.end && this.dest.end();
  }
};
var te = class extends Mt {
  unpipe() {
    this.src.removeListener("error", this.proxyErrors), super.unpipe();
  }
  constructor(t, e, s) {
    super(t, e, s), this.proxyErrors = (i) => this.dest.emit("error", i), t.on("error", this.proxyErrors);
  }
};
var di = (n7) => !!n7.objectMode;
var pi = (n7) => !n7.objectMode && !!n7.encoding && n7.encoding !== "buffer";
var V = class extends ee {
  [v] = false;
  [dt] = false;
  [F] = [];
  [C] = [];
  [k];
  [P];
  [B];
  [et];
  [G] = false;
  [K] = false;
  [kt] = false;
  [Rt] = false;
  [ut] = null;
  [T] = 0;
  [x] = false;
  [pt];
  [Dt] = false;
  [Y] = 0;
  [M] = false;
  writable = true;
  readable = true;
  constructor(...t) {
    let e = t[0] || {};
    if (super(), e.objectMode && typeof e.encoding == "string") throw new TypeError("Encoding and objectMode may not be used together");
    di(e) ? (this[k] = true, this[P] = null) : pi(e) ? (this[P] = e.encoding, this[k] = false) : (this[k] = false, this[P] = null), this[B] = !!e.async, this[et] = this[P] ? new ni(this[P]) : null, e && e.debugExposeBuffer === true && Object.defineProperty(this, "buffer", { get: () => this[C] }), e && e.debugExposePipes === true && Object.defineProperty(this, "pipes", { get: () => this[F] });
    let { signal: s } = e;
    s && (this[pt] = s, s.aborted ? this[Qt]() : s.addEventListener("abort", () => this[Qt]()));
  }
  get bufferLength() {
    return this[T];
  }
  get encoding() {
    return this[P];
  }
  set encoding(t) {
    throw new Error("Encoding must be set at instantiation time");
  }
  setEncoding(t) {
    throw new Error("Encoding must be set at instantiation time");
  }
  get objectMode() {
    return this[k];
  }
  set objectMode(t) {
    throw new Error("objectMode must be set at instantiation time");
  }
  get async() {
    return this[B];
  }
  set async(t) {
    this[B] = this[B] || !!t;
  }
  [Qt]() {
    this[Dt] = true, this.emit("abort", this[pt]?.reason), this.destroy(this[pt]?.reason);
  }
  get aborted() {
    return this[Dt];
  }
  set aborted(t) {
  }
  write(t, e, s) {
    if (this[Dt]) return false;
    if (this[G]) throw new Error("write after end");
    if (this[x]) return this.emit("error", Object.assign(new Error("Cannot call write after a stream was destroyed"), { code: "ERR_STREAM_DESTROYED" })), true;
    typeof e == "function" && (s = e, e = "utf8"), e || (e = "utf8");
    let i = this[B] ? mt : li;
    if (!this[k] && !Buffer.isBuffer(t)) {
      if (ui(t)) t = Buffer.from(t.buffer, t.byteOffset, t.byteLength);
      else if (fi(t)) t = Buffer.from(t);
      else if (typeof t != "string") throw new Error("Non-contiguous data written to non-objectMode stream");
    }
    return this[k] ? (this[v] && this[T] !== 0 && this[Ot](true), this[v] ? this.emit("data", t) : this[Yt](t), this[T] !== 0 && this.emit("readable"), s && i(s), this[v]) : t.length ? (typeof t == "string" && !(e === this[P] && !this[et]?.lastNeed) && (t = Buffer.from(t, e)), Buffer.isBuffer(t) && this[P] && (t = this[et].write(t)), this[v] && this[T] !== 0 && this[Ot](true), this[v] ? this.emit("data", t) : this[Yt](t), this[T] !== 0 && this.emit("readable"), s && i(s), this[v]) : (this[T] !== 0 && this.emit("readable"), s && i(s), this[v]);
  }
  read(t) {
    if (this[x]) return null;
    if (this[M] = false, this[T] === 0 || t === 0 || t && t > this[T]) return this[H](), null;
    this[k] && (t = null), this[C].length > 1 && !this[k] && (this[C] = [this[P] ? this[C].join("") : Buffer.concat(this[C], this[T])]);
    let e = this[_e](t || null, this[C][0]);
    return this[H](), e;
  }
  [_e](t, e) {
    if (this[k]) this[Ft]();
    else {
      let s = e;
      t === s.length || t === null ? this[Ft]() : typeof s == "string" ? (this[C][0] = s.slice(t), e = s.slice(0, t), this[T] -= t) : (this[C][0] = s.subarray(t), e = s.subarray(0, t), this[T] -= t);
    }
    return this.emit("data", e), !this[C].length && !this[G] && this.emit("drain"), e;
  }
  end(t, e, s) {
    return typeof t == "function" && (s = t, t = void 0), typeof e == "function" && (s = e, e = "utf8"), t !== void 0 && this.write(t, e), s && this.once("end", s), this[G] = true, this.writable = false, (this[v] || !this[dt]) && this[H](), this;
  }
  [st]() {
    this[x] || (!this[Y] && !this[F].length && (this[M] = true), this[dt] = false, this[v] = true, this.emit("resume"), this[C].length ? this[Ot]() : this[G] ? this[H]() : this.emit("drain"));
  }
  resume() {
    return this[st]();
  }
  pause() {
    this[v] = false, this[dt] = true, this[M] = false;
  }
  get destroyed() {
    return this[x];
  }
  get flowing() {
    return this[v];
  }
  get paused() {
    return this[dt];
  }
  [Yt](t) {
    this[k] ? this[T] += 1 : this[T] += t.length, this[C].push(t);
  }
  [Ft]() {
    return this[k] ? this[T] -= 1 : this[T] -= this[C][0].length, this[C].shift();
  }
  [Ot](t = false) {
    do
      ;
    while (this[Le](this[Ft]()) && this[C].length);
    !t && !this[C].length && !this[G] && this.emit("drain");
  }
  [Le](t) {
    return this.emit("data", t), this[v];
  }
  pipe(t, e) {
    if (this[x]) return t;
    this[M] = false;
    let s = this[K];
    return e = e || {}, t === Ne.stdout || t === Ne.stderr ? e.end = false : e.end = e.end !== false, e.proxyErrors = !!e.proxyErrors, s ? e.end && t.end() : (this[F].push(e.proxyErrors ? new te(this, t, e) : new Mt(this, t, e)), this[B] ? mt(() => this[st]()) : this[st]()), t;
  }
  unpipe(t) {
    let e = this[F].find((s) => s.dest === t);
    e && (this[F].length === 1 ? (this[v] && this[Y] === 0 && (this[v] = false), this[F] = []) : this[F].splice(this[F].indexOf(e), 1), e.unpipe());
  }
  addListener(t, e) {
    return this.on(t, e);
  }
  on(t, e) {
    let s = super.on(t, e);
    if (t === "data") this[M] = false, this[Y]++, !this[F].length && !this[v] && this[st]();
    else if (t === "readable" && this[T] !== 0) super.emit("readable");
    else if (ci(t) && this[K]) super.emit(t), this.removeAllListeners(t);
    else if (t === "error" && this[ut]) {
      let i = e;
      this[B] ? mt(() => i.call(this, this[ut])) : i.call(this, this[ut]);
    }
    return s;
  }
  removeListener(t, e) {
    return this.off(t, e);
  }
  off(t, e) {
    let s = super.off(t, e);
    return t === "data" && (this[Y] = this.listeners("data").length, this[Y] === 0 && !this[M] && !this[F].length && (this[v] = false)), s;
  }
  removeAllListeners(t) {
    let e = super.removeAllListeners(t);
    return (t === "data" || t === void 0) && (this[Y] = 0, !this[M] && !this[F].length && (this[v] = false)), e;
  }
  get emittedEnd() {
    return this[K];
  }
  [H]() {
    !this[kt] && !this[K] && !this[x] && this[C].length === 0 && this[G] && (this[kt] = true, this.emit("end"), this.emit("prefinish"), this.emit("finish"), this[Rt] && this.emit("close"), this[kt] = false);
  }
  emit(t, ...e) {
    let s = e[0];
    if (t !== "error" && t !== "close" && t !== x && this[x]) return false;
    if (t === "data") return !this[k] && !s ? false : this[B] ? (mt(() => this[Jt](s)), true) : this[Jt](s);
    if (t === "end") return this[We]();
    if (t === "close") {
      if (this[Rt] = true, !this[K] && !this[x]) return false;
      let r = super.emit("close");
      return this.removeAllListeners("close"), r;
    } else if (t === "error") {
      this[ut] = s, super.emit(Xt, s);
      let r = !this[pt] || this.listeners("error").length ? super.emit("error", s) : false;
      return this[H](), r;
    } else if (t === "resume") {
      let r = super.emit("resume");
      return this[H](), r;
    } else if (t === "finish" || t === "prefinish") {
      let r = super.emit(t);
      return this.removeAllListeners(t), r;
    }
    let i = super.emit(t, ...e);
    return this[H](), i;
  }
  [Jt](t) {
    for (let s of this[F]) s.dest.write(t) === false && this.pause();
    let e = this[M] ? false : super.emit("data", t);
    return this[H](), e;
  }
  [We]() {
    return this[K] ? false : (this[K] = true, this.readable = false, this[B] ? (mt(() => this[Zt]()), true) : this[Zt]());
  }
  [Zt]() {
    if (this[et]) {
      let e = this[et].end();
      if (e) {
        for (let s of this[F]) s.dest.write(e);
        this[M] || super.emit("data", e);
      }
    }
    for (let e of this[F]) e.end();
    let t = super.emit("end");
    return this.removeAllListeners("end"), t;
  }
  async collect() {
    let t = Object.assign([], { dataLength: 0 });
    this[k] || (t.dataLength = 0);
    let e = this.promise();
    return this.on("data", (s) => {
      t.push(s), this[k] || (t.dataLength += s.length);
    }), await e, t;
  }
  async concat() {
    if (this[k]) throw new Error("cannot concat in objectMode");
    let t = await this.collect();
    return this[P] ? t.join("") : Buffer.concat(t, t.dataLength);
  }
  async promise() {
    return new Promise((t, e) => {
      this.on(x, () => e(new Error("stream destroyed"))), this.on("error", (s) => e(s)), this.on("end", () => t());
    });
  }
  [Symbol.asyncIterator]() {
    this[M] = false;
    let t = false, e = async () => (this.pause(), t = true, { value: void 0, done: true });
    return { next: () => {
      if (t) return e();
      let i = this.read();
      if (i !== null) return Promise.resolve({ done: false, value: i });
      if (this[G]) return e();
      let r, o, h = (c) => {
        this.off("data", a), this.off("end", l), this.off(x, u), e(), o(c);
      }, a = (c) => {
        this.off("error", h), this.off("end", l), this.off(x, u), this.pause(), r({ value: c, done: !!this[G] });
      }, l = () => {
        this.off("error", h), this.off("data", a), this.off(x, u), e(), r({ done: true, value: void 0 });
      }, u = () => h(new Error("stream destroyed"));
      return new Promise((c, d) => {
        o = d, r = c, this.once(x, u), this.once("error", h), this.once("end", l), this.once("data", a);
      });
    }, throw: e, return: e, [Symbol.asyncIterator]() {
      return this;
    }, [Symbol.asyncDispose]: async () => {
    } };
  }
  [Symbol.iterator]() {
    this[M] = false;
    let t = false, e = () => (this.pause(), this.off(Xt, e), this.off(x, e), this.off("end", e), t = true, { done: true, value: void 0 }), s = () => {
      if (t) return e();
      let i = this.read();
      return i === null ? e() : { done: false, value: i };
    };
    return this.once("end", e), this.once(Xt, e), this.once(x, e), { next: s, throw: e, return: e, [Symbol.iterator]() {
      return this;
    }, [Symbol.dispose]: () => {
    } };
  }
  destroy(t) {
    if (this[x]) return t ? this.emit("error", t) : this.emit(x), this;
    this[x] = true, this[M] = true, this[C].length = 0, this[T] = 0;
    let e = this;
    return typeof e.close == "function" && !this[Rt] && e.close(), t ? this.emit("error", t) : this.emit(x), this;
  }
  static get isStream() {
    return oi;
  }
};
var vi = Ei.native;
var wt = { lstatSync: wi, readdir: yi, readdirSync: bi, readlinkSync: Si, realpathSync: vi, promises: { lstat: Ci, readdir: Ti, readlink: Ai, realpath: ki } };
var Ue = (n7) => !n7 || n7 === wt || n7 === xi ? wt : { ...wt, ...n7, promises: { ...wt.promises, ...n7.promises || {} } };
var $e = /^\\\\\?\\([a-z]:)\\?$/i;
var Ri = (n7) => n7.replace(/\//g, "\\").replace($e, "$1\\");
var Oi = /[\\\/]/;
var L = 0;
var Ge = 1;
var He = 2;
var U = 4;
var qe = 6;
var Ke = 8;
var X = 10;
var Ve = 12;
var _ = 15;
var gt = ~_;
var se = 16;
var je = 32;
var yt = 64;
var j = 128;
var Nt = 256;
var Lt = 512;
var Ie = yt | j | Lt;
var Fi = 1023;
var ie = (n7) => n7.isFile() ? Ke : n7.isDirectory() ? U : n7.isSymbolicLink() ? X : n7.isCharacterDevice() ? He : n7.isBlockDevice() ? qe : n7.isSocket() ? Ve : n7.isFIFO() ? Ge : L;
var ze = new ft({ max: 2 ** 12 });
var bt = (n7) => {
  let t = ze.get(n7);
  if (t) return t;
  let e = n7.normalize("NFKD");
  return ze.set(n7, e), e;
};
var Be = new ft({ max: 2 ** 12 });
var _t = (n7) => {
  let t = Be.get(n7);
  if (t) return t;
  let e = bt(n7.toLowerCase());
  return Be.set(n7, e), e;
};
var Wt = class extends ft {
  constructor() {
    super({ max: 256 });
  }
};
var ne = class extends ft {
  constructor(t = 16 * 1024) {
    super({ maxSize: t, sizeCalculation: (e) => e.length + 1 });
  }
};
var Ye = /* @__PURE__ */ Symbol("PathScurry setAsCwd");
var R = class {
  name;
  root;
  roots;
  parent;
  nocase;
  isCWD = false;
  #t;
  #s;
  get dev() {
    return this.#s;
  }
  #n;
  get mode() {
    return this.#n;
  }
  #r;
  get nlink() {
    return this.#r;
  }
  #o;
  get uid() {
    return this.#o;
  }
  #S;
  get gid() {
    return this.#S;
  }
  #w;
  get rdev() {
    return this.#w;
  }
  #c;
  get blksize() {
    return this.#c;
  }
  #h;
  get ino() {
    return this.#h;
  }
  #u;
  get size() {
    return this.#u;
  }
  #f;
  get blocks() {
    return this.#f;
  }
  #a;
  get atimeMs() {
    return this.#a;
  }
  #i;
  get mtimeMs() {
    return this.#i;
  }
  #d;
  get ctimeMs() {
    return this.#d;
  }
  #E;
  get birthtimeMs() {
    return this.#E;
  }
  #b;
  get atime() {
    return this.#b;
  }
  #p;
  get mtime() {
    return this.#p;
  }
  #R;
  get ctime() {
    return this.#R;
  }
  #m;
  get birthtime() {
    return this.#m;
  }
  #C;
  #T;
  #g;
  #y;
  #x;
  #A;
  #e;
  #_;
  #M;
  #k;
  get parentPath() {
    return (this.parent || this).fullpath();
  }
  get path() {
    return this.parentPath;
  }
  constructor(t, e = L, s, i, r, o, h) {
    this.name = t, this.#C = r ? _t(t) : bt(t), this.#e = e & Fi, this.nocase = r, this.roots = i, this.root = s || this, this.#_ = o, this.#g = h.fullpath, this.#x = h.relative, this.#A = h.relativePosix, this.parent = h.parent, this.parent ? this.#t = this.parent.#t : this.#t = Ue(h.fs);
  }
  depth() {
    return this.#T !== void 0 ? this.#T : this.parent ? this.#T = this.parent.depth() + 1 : this.#T = 0;
  }
  childrenCache() {
    return this.#_;
  }
  resolve(t) {
    if (!t) return this;
    let e = this.getRootString(t), i = t.substring(e.length).split(this.splitSep);
    return e ? this.getRoot(e).#N(i) : this.#N(i);
  }
  #N(t) {
    let e = this;
    for (let s of t) e = e.child(s);
    return e;
  }
  children() {
    let t = this.#_.get(this);
    if (t) return t;
    let e = Object.assign([], { provisional: 0 });
    return this.#_.set(this, e), this.#e &= ~se, e;
  }
  child(t, e) {
    if (t === "" || t === ".") return this;
    if (t === "..") return this.parent || this;
    let s = this.children(), i = this.nocase ? _t(t) : bt(t);
    for (let a of s) if (a.#C === i) return a;
    let r = this.parent ? this.sep : "", o = this.#g ? this.#g + r + t : void 0, h = this.newChild(t, L, { ...e, parent: this, fullpath: o });
    return this.canReaddir() || (h.#e |= j), s.push(h), h;
  }
  relative() {
    if (this.isCWD) return "";
    if (this.#x !== void 0) return this.#x;
    let t = this.name, e = this.parent;
    if (!e) return this.#x = this.name;
    let s = e.relative();
    return s + (!s || !e.parent ? "" : this.sep) + t;
  }
  relativePosix() {
    if (this.sep === "/") return this.relative();
    if (this.isCWD) return "";
    if (this.#A !== void 0) return this.#A;
    let t = this.name, e = this.parent;
    if (!e) return this.#A = this.fullpathPosix();
    let s = e.relativePosix();
    return s + (!s || !e.parent ? "" : "/") + t;
  }
  fullpath() {
    if (this.#g !== void 0) return this.#g;
    let t = this.name, e = this.parent;
    if (!e) return this.#g = this.name;
    let i = e.fullpath() + (e.parent ? this.sep : "") + t;
    return this.#g = i;
  }
  fullpathPosix() {
    if (this.#y !== void 0) return this.#y;
    if (this.sep === "/") return this.#y = this.fullpath();
    if (!this.parent) {
      let i = this.fullpath().replace(/\\/g, "/");
      return /^[a-z]:\//i.test(i) ? this.#y = `//?/${i}` : this.#y = i;
    }
    let t = this.parent, e = t.fullpathPosix(), s = e + (!e || !t.parent ? "" : "/") + this.name;
    return this.#y = s;
  }
  isUnknown() {
    return (this.#e & _) === L;
  }
  isType(t) {
    return this[`is${t}`]();
  }
  getType() {
    return this.isUnknown() ? "Unknown" : this.isDirectory() ? "Directory" : this.isFile() ? "File" : this.isSymbolicLink() ? "SymbolicLink" : this.isFIFO() ? "FIFO" : this.isCharacterDevice() ? "CharacterDevice" : this.isBlockDevice() ? "BlockDevice" : this.isSocket() ? "Socket" : "Unknown";
  }
  isFile() {
    return (this.#e & _) === Ke;
  }
  isDirectory() {
    return (this.#e & _) === U;
  }
  isCharacterDevice() {
    return (this.#e & _) === He;
  }
  isBlockDevice() {
    return (this.#e & _) === qe;
  }
  isFIFO() {
    return (this.#e & _) === Ge;
  }
  isSocket() {
    return (this.#e & _) === Ve;
  }
  isSymbolicLink() {
    return (this.#e & X) === X;
  }
  lstatCached() {
    return this.#e & je ? this : void 0;
  }
  readlinkCached() {
    return this.#M;
  }
  realpathCached() {
    return this.#k;
  }
  readdirCached() {
    let t = this.children();
    return t.slice(0, t.provisional);
  }
  canReadlink() {
    if (this.#M) return true;
    if (!this.parent) return false;
    let t = this.#e & _;
    return !(t !== L && t !== X || this.#e & Nt || this.#e & j);
  }
  calledReaddir() {
    return !!(this.#e & se);
  }
  isENOENT() {
    return !!(this.#e & j);
  }
  isNamed(t) {
    return this.nocase ? this.#C === _t(t) : this.#C === bt(t);
  }
  async readlink() {
    let t = this.#M;
    if (t) return t;
    if (this.canReadlink() && this.parent) try {
      let e = await this.#t.promises.readlink(this.fullpath()), s = (await this.parent.realpath())?.resolve(e);
      if (s) return this.#M = s;
    } catch (e) {
      this.#D(e.code);
      return;
    }
  }
  readlinkSync() {
    let t = this.#M;
    if (t) return t;
    if (this.canReadlink() && this.parent) try {
      let e = this.#t.readlinkSync(this.fullpath()), s = this.parent.realpathSync()?.resolve(e);
      if (s) return this.#M = s;
    } catch (e) {
      this.#D(e.code);
      return;
    }
  }
  #j(t) {
    this.#e |= se;
    for (let e = t.provisional; e < t.length; e++) {
      let s = t[e];
      s && s.#v();
    }
  }
  #v() {
    this.#e & j || (this.#e = (this.#e | j) & gt, this.#G());
  }
  #G() {
    let t = this.children();
    t.provisional = 0;
    for (let e of t) e.#v();
  }
  #P() {
    this.#e |= Lt, this.#L();
  }
  #L() {
    if (this.#e & yt) return;
    let t = this.#e;
    (t & _) === U && (t &= gt), this.#e = t | yt, this.#G();
  }
  #I(t = "") {
    t === "ENOTDIR" || t === "EPERM" ? this.#L() : t === "ENOENT" ? this.#v() : this.children().provisional = 0;
  }
  #F(t = "") {
    t === "ENOTDIR" ? this.parent.#L() : t === "ENOENT" && this.#v();
  }
  #D(t = "") {
    let e = this.#e;
    e |= Nt, t === "ENOENT" && (e |= j), (t === "EINVAL" || t === "UNKNOWN") && (e &= gt), this.#e = e, t === "ENOTDIR" && this.parent && this.parent.#L();
  }
  #z(t, e) {
    return this.#U(t, e) || this.#B(t, e);
  }
  #B(t, e) {
    let s = ie(t), i = this.newChild(t.name, s, { parent: this }), r = i.#e & _;
    return r !== U && r !== X && r !== L && (i.#e |= yt), e.unshift(i), e.provisional++, i;
  }
  #U(t, e) {
    for (let s = e.provisional; s < e.length; s++) {
      let i = e[s];
      if ((this.nocase ? _t(t.name) : bt(t.name)) === i.#C) return this.#l(t, i, s, e);
    }
  }
  #l(t, e, s, i) {
    let r = e.name;
    return e.#e = e.#e & gt | ie(t), r !== t.name && (e.name = t.name), s !== i.provisional && (s === i.length - 1 ? i.pop() : i.splice(s, 1), i.unshift(e)), i.provisional++, e;
  }
  async lstat() {
    if ((this.#e & j) === 0) try {
      return this.#$(await this.#t.promises.lstat(this.fullpath())), this;
    } catch (t) {
      this.#F(t.code);
    }
  }
  lstatSync() {
    if ((this.#e & j) === 0) try {
      return this.#$(this.#t.lstatSync(this.fullpath())), this;
    } catch (t) {
      this.#F(t.code);
    }
  }
  #$(t) {
    let { atime: e, atimeMs: s, birthtime: i, birthtimeMs: r, blksize: o, blocks: h, ctime: a, ctimeMs: l, dev: u, gid: c, ino: d, mode: f, mtime: m, mtimeMs: p, nlink: w, rdev: g, size: S, uid: E } = t;
    this.#b = e, this.#a = s, this.#m = i, this.#E = r, this.#c = o, this.#f = h, this.#R = a, this.#d = l, this.#s = u, this.#S = c, this.#h = d, this.#n = f, this.#p = m, this.#i = p, this.#r = w, this.#w = g, this.#u = S, this.#o = E;
    let y = ie(t);
    this.#e = this.#e & gt | y | je, y !== L && y !== U && y !== X && (this.#e |= yt);
  }
  #W = [];
  #O = false;
  #H(t) {
    this.#O = false;
    let e = this.#W.slice();
    this.#W.length = 0, e.forEach((s) => s(null, t));
  }
  readdirCB(t, e = false) {
    if (!this.canReaddir()) {
      e ? t(null, []) : queueMicrotask(() => t(null, []));
      return;
    }
    let s = this.children();
    if (this.calledReaddir()) {
      let r = s.slice(0, s.provisional);
      e ? t(null, r) : queueMicrotask(() => t(null, r));
      return;
    }
    if (this.#W.push(t), this.#O) return;
    this.#O = true;
    let i = this.fullpath();
    this.#t.readdir(i, { withFileTypes: true }, (r, o) => {
      if (r) this.#I(r.code), s.provisional = 0;
      else {
        for (let h of o) this.#z(h, s);
        this.#j(s);
      }
      this.#H(s.slice(0, s.provisional));
    });
  }
  #q;
  async readdir() {
    if (!this.canReaddir()) return [];
    let t = this.children();
    if (this.calledReaddir()) return t.slice(0, t.provisional);
    let e = this.fullpath();
    if (this.#q) await this.#q;
    else {
      let s = () => {
      };
      this.#q = new Promise((i) => s = i);
      try {
        for (let i of await this.#t.promises.readdir(e, { withFileTypes: true })) this.#z(i, t);
        this.#j(t);
      } catch (i) {
        this.#I(i.code), t.provisional = 0;
      }
      this.#q = void 0, s();
    }
    return t.slice(0, t.provisional);
  }
  readdirSync() {
    if (!this.canReaddir()) return [];
    let t = this.children();
    if (this.calledReaddir()) return t.slice(0, t.provisional);
    let e = this.fullpath();
    try {
      for (let s of this.#t.readdirSync(e, { withFileTypes: true })) this.#z(s, t);
      this.#j(t);
    } catch (s) {
      this.#I(s.code), t.provisional = 0;
    }
    return t.slice(0, t.provisional);
  }
  canReaddir() {
    if (this.#e & Ie) return false;
    let t = _ & this.#e;
    return t === L || t === U || t === X;
  }
  shouldWalk(t, e) {
    return (this.#e & U) === U && !(this.#e & Ie) && !t.has(this) && (!e || e(this));
  }
  async realpath() {
    if (this.#k) return this.#k;
    if (!((Lt | Nt | j) & this.#e)) try {
      let t = await this.#t.promises.realpath(this.fullpath());
      return this.#k = this.resolve(t);
    } catch {
      this.#P();
    }
  }
  realpathSync() {
    if (this.#k) return this.#k;
    if (!((Lt | Nt | j) & this.#e)) try {
      let t = this.#t.realpathSync(this.fullpath());
      return this.#k = this.resolve(t);
    } catch {
      this.#P();
    }
  }
  [Ye](t) {
    if (t === this) return;
    t.isCWD = false, this.isCWD = true;
    let e = /* @__PURE__ */ new Set([]), s = [], i = this;
    for (; i && i.parent; ) e.add(i), i.#x = s.join(this.sep), i.#A = s.join("/"), i = i.parent, s.push("..");
    for (i = t; i && i.parent && !e.has(i); ) i.#x = void 0, i.#A = void 0, i = i.parent;
  }
};
var Pt = class n2 extends R {
  sep = "\\";
  splitSep = Oi;
  constructor(t, e = L, s, i, r, o, h) {
    super(t, e, s, i, r, o, h);
  }
  newChild(t, e = L, s = {}) {
    return new n2(t, e, this.root, this.roots, this.nocase, this.childrenCache(), s);
  }
  getRootString(t) {
    return re.parse(t).root;
  }
  getRoot(t) {
    if (t = Ri(t.toUpperCase()), t === this.root.name) return this.root;
    for (let [e, s] of Object.entries(this.roots)) if (this.sameRoot(t, e)) return this.roots[t] = s;
    return this.roots[t] = new it(t, this).root;
  }
  sameRoot(t, e = this.root.name) {
    return t = t.toUpperCase().replace(/\//g, "\\").replace($e, "$1\\"), t === e;
  }
};
var jt = class n3 extends R {
  splitSep = "/";
  sep = "/";
  constructor(t, e = L, s, i, r, o, h) {
    super(t, e, s, i, r, o, h);
  }
  getRootString(t) {
    return t.startsWith("/") ? "/" : "";
  }
  getRoot(t) {
    return this.root;
  }
  newChild(t, e = L, s = {}) {
    return new n3(t, e, this.root, this.roots, this.nocase, this.childrenCache(), s);
  }
};
var It = class {
  root;
  rootPath;
  roots;
  cwd;
  #t;
  #s;
  #n;
  nocase;
  #r;
  constructor(t = process.cwd(), e, s, { nocase: i, childrenCacheSize: r = 16 * 1024, fs: o = wt } = {}) {
    this.#r = Ue(o), (t instanceof URL || t.startsWith("file://")) && (t = gi(t));
    let h = e.resolve(t);
    this.roots = /* @__PURE__ */ Object.create(null), this.rootPath = this.parseRootPath(h), this.#t = new Wt(), this.#s = new Wt(), this.#n = new ne(r);
    let a = h.substring(this.rootPath.length).split(s);
    if (a.length === 1 && !a[0] && a.pop(), i === void 0) throw new TypeError("must provide nocase setting to PathScurryBase ctor");
    this.nocase = i, this.root = this.newRoot(this.#r), this.roots[this.rootPath] = this.root;
    let l = this.root, u = a.length - 1, c = e.sep, d = this.rootPath, f = false;
    for (let m of a) {
      let p = u--;
      l = l.child(m, { relative: new Array(p).fill("..").join(c), relativePosix: new Array(p).fill("..").join("/"), fullpath: d += (f ? "" : c) + m }), f = true;
    }
    this.cwd = l;
  }
  depth(t = this.cwd) {
    return typeof t == "string" && (t = this.cwd.resolve(t)), t.depth();
  }
  childrenCache() {
    return this.#n;
  }
  resolve(...t) {
    let e = "";
    for (let r = t.length - 1; r >= 0; r--) {
      let o = t[r];
      if (!(!o || o === ".") && (e = e ? `${o}/${e}` : o, this.isAbsolute(o))) break;
    }
    let s = this.#t.get(e);
    if (s !== void 0) return s;
    let i = this.cwd.resolve(e).fullpath();
    return this.#t.set(e, i), i;
  }
  resolvePosix(...t) {
    let e = "";
    for (let r = t.length - 1; r >= 0; r--) {
      let o = t[r];
      if (!(!o || o === ".") && (e = e ? `${o}/${e}` : o, this.isAbsolute(o))) break;
    }
    let s = this.#s.get(e);
    if (s !== void 0) return s;
    let i = this.cwd.resolve(e).fullpathPosix();
    return this.#s.set(e, i), i;
  }
  relative(t = this.cwd) {
    return typeof t == "string" && (t = this.cwd.resolve(t)), t.relative();
  }
  relativePosix(t = this.cwd) {
    return typeof t == "string" && (t = this.cwd.resolve(t)), t.relativePosix();
  }
  basename(t = this.cwd) {
    return typeof t == "string" && (t = this.cwd.resolve(t)), t.name;
  }
  dirname(t = this.cwd) {
    return typeof t == "string" && (t = this.cwd.resolve(t)), (t.parent || t).fullpath();
  }
  async readdir(t = this.cwd, e = { withFileTypes: true }) {
    typeof t == "string" ? t = this.cwd.resolve(t) : t instanceof R || (e = t, t = this.cwd);
    let { withFileTypes: s } = e;
    if (t.canReaddir()) {
      let i = await t.readdir();
      return s ? i : i.map((r) => r.name);
    } else return [];
  }
  readdirSync(t = this.cwd, e = { withFileTypes: true }) {
    typeof t == "string" ? t = this.cwd.resolve(t) : t instanceof R || (e = t, t = this.cwd);
    let { withFileTypes: s = true } = e;
    return t.canReaddir() ? s ? t.readdirSync() : t.readdirSync().map((i) => i.name) : [];
  }
  async lstat(t = this.cwd) {
    return typeof t == "string" && (t = this.cwd.resolve(t)), t.lstat();
  }
  lstatSync(t = this.cwd) {
    return typeof t == "string" && (t = this.cwd.resolve(t)), t.lstatSync();
  }
  async readlink(t = this.cwd, { withFileTypes: e } = { withFileTypes: false }) {
    typeof t == "string" ? t = this.cwd.resolve(t) : t instanceof R || (e = t.withFileTypes, t = this.cwd);
    let s = await t.readlink();
    return e ? s : s?.fullpath();
  }
  readlinkSync(t = this.cwd, { withFileTypes: e } = { withFileTypes: false }) {
    typeof t == "string" ? t = this.cwd.resolve(t) : t instanceof R || (e = t.withFileTypes, t = this.cwd);
    let s = t.readlinkSync();
    return e ? s : s?.fullpath();
  }
  async realpath(t = this.cwd, { withFileTypes: e } = { withFileTypes: false }) {
    typeof t == "string" ? t = this.cwd.resolve(t) : t instanceof R || (e = t.withFileTypes, t = this.cwd);
    let s = await t.realpath();
    return e ? s : s?.fullpath();
  }
  realpathSync(t = this.cwd, { withFileTypes: e } = { withFileTypes: false }) {
    typeof t == "string" ? t = this.cwd.resolve(t) : t instanceof R || (e = t.withFileTypes, t = this.cwd);
    let s = t.realpathSync();
    return e ? s : s?.fullpath();
  }
  async walk(t = this.cwd, e = {}) {
    typeof t == "string" ? t = this.cwd.resolve(t) : t instanceof R || (e = t, t = this.cwd);
    let { withFileTypes: s = true, follow: i = false, filter: r, walkFilter: o } = e, h = [];
    (!r || r(t)) && h.push(s ? t : t.fullpath());
    let a = /* @__PURE__ */ new Set(), l = (c, d) => {
      a.add(c), c.readdirCB((f, m) => {
        if (f) return d(f);
        let p = m.length;
        if (!p) return d();
        let w = () => {
          --p === 0 && d();
        };
        for (let g of m) (!r || r(g)) && h.push(s ? g : g.fullpath()), i && g.isSymbolicLink() ? g.realpath().then((S) => S?.isUnknown() ? S.lstat() : S).then((S) => S?.shouldWalk(a, o) ? l(S, w) : w()) : g.shouldWalk(a, o) ? l(g, w) : w();
      }, true);
    }, u = t;
    return new Promise((c, d) => {
      l(u, (f) => {
        if (f) return d(f);
        c(h);
      });
    });
  }
  walkSync(t = this.cwd, e = {}) {
    typeof t == "string" ? t = this.cwd.resolve(t) : t instanceof R || (e = t, t = this.cwd);
    let { withFileTypes: s = true, follow: i = false, filter: r, walkFilter: o } = e, h = [];
    (!r || r(t)) && h.push(s ? t : t.fullpath());
    let a = /* @__PURE__ */ new Set([t]);
    for (let l of a) {
      let u = l.readdirSync();
      for (let c of u) {
        (!r || r(c)) && h.push(s ? c : c.fullpath());
        let d = c;
        if (c.isSymbolicLink()) {
          if (!(i && (d = c.realpathSync()))) continue;
          d.isUnknown() && d.lstatSync();
        }
        d.shouldWalk(a, o) && a.add(d);
      }
    }
    return h;
  }
  [Symbol.asyncIterator]() {
    return this.iterate();
  }
  iterate(t = this.cwd, e = {}) {
    return typeof t == "string" ? t = this.cwd.resolve(t) : t instanceof R || (e = t, t = this.cwd), this.stream(t, e)[Symbol.asyncIterator]();
  }
  [Symbol.iterator]() {
    return this.iterateSync();
  }
  *iterateSync(t = this.cwd, e = {}) {
    typeof t == "string" ? t = this.cwd.resolve(t) : t instanceof R || (e = t, t = this.cwd);
    let { withFileTypes: s = true, follow: i = false, filter: r, walkFilter: o } = e;
    (!r || r(t)) && (yield s ? t : t.fullpath());
    let h = /* @__PURE__ */ new Set([t]);
    for (let a of h) {
      let l = a.readdirSync();
      for (let u of l) {
        (!r || r(u)) && (yield s ? u : u.fullpath());
        let c = u;
        if (u.isSymbolicLink()) {
          if (!(i && (c = u.realpathSync()))) continue;
          c.isUnknown() && c.lstatSync();
        }
        c.shouldWalk(h, o) && h.add(c);
      }
    }
  }
  stream(t = this.cwd, e = {}) {
    typeof t == "string" ? t = this.cwd.resolve(t) : t instanceof R || (e = t, t = this.cwd);
    let { withFileTypes: s = true, follow: i = false, filter: r, walkFilter: o } = e, h = new V({ objectMode: true });
    (!r || r(t)) && h.write(s ? t : t.fullpath());
    let a = /* @__PURE__ */ new Set(), l = [t], u = 0, c = () => {
      let d = false;
      for (; !d; ) {
        let f = l.shift();
        if (!f) {
          u === 0 && h.end();
          return;
        }
        u++, a.add(f);
        let m = (w, g, S = false) => {
          if (w) return h.emit("error", w);
          if (i && !S) {
            let E = [];
            for (let y of g) y.isSymbolicLink() && E.push(y.realpath().then((b) => b?.isUnknown() ? b.lstat() : b));
            if (E.length) {
              Promise.all(E).then(() => m(null, g, true));
              return;
            }
          }
          for (let E of g) E && (!r || r(E)) && (h.write(s ? E : E.fullpath()) || (d = true));
          u--;
          for (let E of g) {
            let y = E.realpathCached() || E;
            y.shouldWalk(a, o) && l.push(y);
          }
          d && !h.flowing ? h.once("drain", c) : p || c();
        }, p = true;
        f.readdirCB(m, true), p = false;
      }
    };
    return c(), h;
  }
  streamSync(t = this.cwd, e = {}) {
    typeof t == "string" ? t = this.cwd.resolve(t) : t instanceof R || (e = t, t = this.cwd);
    let { withFileTypes: s = true, follow: i = false, filter: r, walkFilter: o } = e, h = new V({ objectMode: true }), a = /* @__PURE__ */ new Set();
    (!r || r(t)) && h.write(s ? t : t.fullpath());
    let l = [t], u = 0, c = () => {
      let d = false;
      for (; !d; ) {
        let f = l.shift();
        if (!f) {
          u === 0 && h.end();
          return;
        }
        u++, a.add(f);
        let m = f.readdirSync();
        for (let p of m) (!r || r(p)) && (h.write(s ? p : p.fullpath()) || (d = true));
        u--;
        for (let p of m) {
          let w = p;
          if (p.isSymbolicLink()) {
            if (!(i && (w = p.realpathSync()))) continue;
            w.isUnknown() && w.lstatSync();
          }
          w.shouldWalk(a, o) && l.push(w);
        }
      }
      d && !h.flowing && h.once("drain", c);
    };
    return c(), h;
  }
  chdir(t = this.cwd) {
    let e = this.cwd;
    this.cwd = typeof t == "string" ? this.cwd.resolve(t) : t, this.cwd[Ye](e);
  }
};
var it = class extends It {
  sep = "\\";
  constructor(t = process.cwd(), e = {}) {
    let { nocase: s = true } = e;
    super(t, re, "\\", { ...e, nocase: s }), this.nocase = s;
    for (let i = this.cwd; i; i = i.parent) i.nocase = this.nocase;
  }
  parseRootPath(t) {
    return re.parse(t).root.toUpperCase();
  }
  newRoot(t) {
    return new Pt(this.rootPath, U, void 0, this.roots, this.nocase, this.childrenCache(), { fs: t });
  }
  isAbsolute(t) {
    return t.startsWith("/") || t.startsWith("\\") || /^[a-z]:(\/|\\)/i.test(t);
  }
};
var rt = class extends It {
  sep = "/";
  constructor(t = process.cwd(), e = {}) {
    let { nocase: s = false } = e;
    super(t, mi, "/", { ...e, nocase: s }), this.nocase = s;
  }
  parseRootPath(t) {
    return "/";
  }
  newRoot(t) {
    return new jt(this.rootPath, U, void 0, this.roots, this.nocase, this.childrenCache(), { fs: t });
  }
  isAbsolute(t) {
    return t.startsWith("/");
  }
};
var St = class extends rt {
  constructor(t = process.cwd(), e = {}) {
    let { nocase: s = true } = e;
    super(t, { ...e, nocase: s });
  }
};
var Cr = process.platform === "win32" ? Pt : jt;
var Xe = process.platform === "win32" ? it : process.platform === "darwin" ? St : rt;
var Di = (n7) => n7.length >= 1;
var Mi = (n7) => n7.length >= 1;
var Ni = /* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom");
var nt = class n4 {
  #t;
  #s;
  #n;
  length;
  #r;
  #o;
  #S;
  #w;
  #c;
  #h;
  #u = true;
  constructor(t, e, s, i) {
    if (!Di(t)) throw new TypeError("empty pattern list");
    if (!Mi(e)) throw new TypeError("empty glob list");
    if (e.length !== t.length) throw new TypeError("mismatched pattern list and glob list lengths");
    if (this.length = t.length, s < 0 || s >= this.length) throw new TypeError("index out of range");
    if (this.#t = t, this.#s = e, this.#n = s, this.#r = i, this.#n === 0) {
      if (this.isUNC()) {
        let [r, o, h, a, ...l] = this.#t, [u, c, d, f, ...m] = this.#s;
        l[0] === "" && (l.shift(), m.shift());
        let p = [r, o, h, a, ""].join("/"), w = [u, c, d, f, ""].join("/");
        this.#t = [p, ...l], this.#s = [w, ...m], this.length = this.#t.length;
      } else if (this.isDrive() || this.isAbsolute()) {
        let [r, ...o] = this.#t, [h, ...a] = this.#s;
        o[0] === "" && (o.shift(), a.shift());
        let l = r + "/", u = h + "/";
        this.#t = [l, ...o], this.#s = [u, ...a], this.length = this.#t.length;
      }
    }
  }
  [Ni]() {
    return "Pattern <" + this.#s.slice(this.#n).join("/") + ">";
  }
  pattern() {
    return this.#t[this.#n];
  }
  isString() {
    return typeof this.#t[this.#n] == "string";
  }
  isGlobstar() {
    return this.#t[this.#n] === A;
  }
  isRegExp() {
    return this.#t[this.#n] instanceof RegExp;
  }
  globString() {
    return this.#S = this.#S || (this.#n === 0 ? this.isAbsolute() ? this.#s[0] + this.#s.slice(1).join("/") : this.#s.join("/") : this.#s.slice(this.#n).join("/"));
  }
  hasMore() {
    return this.length > this.#n + 1;
  }
  rest() {
    return this.#o !== void 0 ? this.#o : this.hasMore() ? (this.#o = new n4(this.#t, this.#s, this.#n + 1, this.#r), this.#o.#h = this.#h, this.#o.#c = this.#c, this.#o.#w = this.#w, this.#o) : this.#o = null;
  }
  isUNC() {
    let t = this.#t;
    return this.#c !== void 0 ? this.#c : this.#c = this.#r === "win32" && this.#n === 0 && t[0] === "" && t[1] === "" && typeof t[2] == "string" && !!t[2] && typeof t[3] == "string" && !!t[3];
  }
  isDrive() {
    let t = this.#t;
    return this.#w !== void 0 ? this.#w : this.#w = this.#r === "win32" && this.#n === 0 && this.length > 1 && typeof t[0] == "string" && /^[a-z]:$/i.test(t[0]);
  }
  isAbsolute() {
    let t = this.#t;
    return this.#h !== void 0 ? this.#h : this.#h = t[0] === "" && t.length > 1 || this.isDrive() || this.isUNC();
  }
  root() {
    let t = this.#t[0];
    return typeof t == "string" && this.isAbsolute() && this.#n === 0 ? t : "";
  }
  checkFollowGlobstar() {
    return !(this.#n === 0 || !this.isGlobstar() || !this.#u);
  }
  markFollowGlobstar() {
    return this.#n === 0 || !this.isGlobstar() || !this.#u ? false : (this.#u = false, true);
  }
};
var _i = typeof process == "object" && process && typeof process.platform == "string" ? process.platform : "linux";
var ot = class {
  relative;
  relativeChildren;
  absolute;
  absoluteChildren;
  platform;
  mmopts;
  constructor(t, { nobrace: e, nocase: s, noext: i, noglobstar: r, platform: o = _i }) {
    this.relative = [], this.absolute = [], this.relativeChildren = [], this.absoluteChildren = [], this.platform = o, this.mmopts = { dot: true, nobrace: e, nocase: s, noext: i, noglobstar: r, optimizationLevel: 2, platform: o, nocomment: true, nonegate: true };
    for (let h of t) this.add(h);
  }
  add(t) {
    let e = new D(t, this.mmopts);
    for (let s = 0; s < e.set.length; s++) {
      let i = e.set[s], r = e.globParts[s];
      if (!i || !r) throw new Error("invalid pattern object");
      for (; i[0] === "." && r[0] === "."; ) i.shift(), r.shift();
      let o = new nt(i, r, 0, this.platform), h = new D(o.globString(), this.mmopts), a = r[r.length - 1] === "**", l = o.isAbsolute();
      l ? this.absolute.push(h) : this.relative.push(h), a && (l ? this.absoluteChildren.push(h) : this.relativeChildren.push(h));
    }
  }
  ignored(t) {
    let e = t.fullpath(), s = `${e}/`, i = t.relative() || ".", r = `${i}/`;
    for (let o of this.relative) if (o.match(i) || o.match(r)) return true;
    for (let o of this.absolute) if (o.match(e) || o.match(s)) return true;
    return false;
  }
  childrenIgnored(t) {
    let e = t.fullpath() + "/", s = (t.relative() || ".") + "/";
    for (let i of this.relativeChildren) if (i.match(s)) return true;
    for (let i of this.absoluteChildren) if (i.match(e)) return true;
    return false;
  }
};
var oe = class n5 {
  store;
  constructor(t = /* @__PURE__ */ new Map()) {
    this.store = t;
  }
  copy() {
    return new n5(new Map(this.store));
  }
  hasWalked(t, e) {
    return this.store.get(t.fullpath())?.has(e.globString());
  }
  storeWalked(t, e) {
    let s = t.fullpath(), i = this.store.get(s);
    i ? i.add(e.globString()) : this.store.set(s, /* @__PURE__ */ new Set([e.globString()]));
  }
};
var he = class {
  store = /* @__PURE__ */ new Map();
  add(t, e, s) {
    let i = (e ? 2 : 0) | (s ? 1 : 0), r = this.store.get(t);
    this.store.set(t, r === void 0 ? i : i & r);
  }
  entries() {
    return [...this.store.entries()].map(([t, e]) => [t, !!(e & 2), !!(e & 1)]);
  }
};
var ae = class {
  store = /* @__PURE__ */ new Map();
  add(t, e) {
    if (!t.canReaddir()) return;
    let s = this.store.get(t);
    s ? s.find((i) => i.globString() === e.globString()) || s.push(e) : this.store.set(t, [e]);
  }
  get(t) {
    let e = this.store.get(t);
    if (!e) throw new Error("attempting to walk unknown path");
    return e;
  }
  entries() {
    return this.keys().map((t) => [t, this.store.get(t)]);
  }
  keys() {
    return [...this.store.keys()].filter((t) => t.canReaddir());
  }
};
var Et = class n6 {
  hasWalkedCache;
  matches = new he();
  subwalks = new ae();
  patterns;
  follow;
  dot;
  opts;
  constructor(t, e) {
    this.opts = t, this.follow = !!t.follow, this.dot = !!t.dot, this.hasWalkedCache = e ? e.copy() : new oe();
  }
  processPatterns(t, e) {
    this.patterns = e;
    let s = e.map((i) => [t, i]);
    for (let [i, r] of s) {
      this.hasWalkedCache.storeWalked(i, r);
      let o = r.root(), h = r.isAbsolute() && this.opts.absolute !== false;
      if (o) {
        i = i.resolve(o === "/" && this.opts.root !== void 0 ? this.opts.root : o);
        let c = r.rest();
        if (c) r = c;
        else {
          this.matches.add(i, true, false);
          continue;
        }
      }
      if (i.isENOENT()) continue;
      let a, l, u = false;
      for (; typeof (a = r.pattern()) == "string" && (l = r.rest()); ) i = i.resolve(a), r = l, u = true;
      if (a = r.pattern(), l = r.rest(), u) {
        if (this.hasWalkedCache.hasWalked(i, r)) continue;
        this.hasWalkedCache.storeWalked(i, r);
      }
      if (typeof a == "string") {
        let c = a === ".." || a === "" || a === ".";
        this.matches.add(i.resolve(a), h, c);
        continue;
      } else if (a === A) {
        (!i.isSymbolicLink() || this.follow || r.checkFollowGlobstar()) && this.subwalks.add(i, r);
        let c = l?.pattern(), d = l?.rest();
        if (!l || (c === "" || c === ".") && !d) this.matches.add(i, h, c === "" || c === ".");
        else if (c === "..") {
          let f = i.parent || i;
          d ? this.hasWalkedCache.hasWalked(f, d) || this.subwalks.add(f, d) : this.matches.add(f, h, true);
        }
      } else a instanceof RegExp && this.subwalks.add(i, r);
    }
    return this;
  }
  subwalkTargets() {
    return this.subwalks.keys();
  }
  child() {
    return new n6(this.opts, this.hasWalkedCache);
  }
  filterEntries(t, e) {
    let s = this.subwalks.get(t), i = this.child();
    for (let r of e) for (let o of s) {
      let h = o.isAbsolute(), a = o.pattern(), l = o.rest();
      a === A ? i.testGlobstar(r, o, l, h) : a instanceof RegExp ? i.testRegExp(r, a, l, h) : i.testString(r, a, l, h);
    }
    return i;
  }
  testGlobstar(t, e, s, i) {
    if ((this.dot || !t.name.startsWith(".")) && (e.hasMore() || this.matches.add(t, i, false), t.canReaddir() && (this.follow || !t.isSymbolicLink() ? this.subwalks.add(t, e) : t.isSymbolicLink() && (s && e.checkFollowGlobstar() ? this.subwalks.add(t, s) : e.markFollowGlobstar() && this.subwalks.add(t, e)))), s) {
      let r = s.pattern();
      if (typeof r == "string" && r !== ".." && r !== "" && r !== ".") this.testString(t, r, s.rest(), i);
      else if (r === "..") {
        let o = t.parent || t;
        this.subwalks.add(o, s);
      } else r instanceof RegExp && this.testRegExp(t, r, s.rest(), i);
    }
  }
  testRegExp(t, e, s, i) {
    e.test(t.name) && (s ? this.subwalks.add(t, s) : this.matches.add(t, i, false));
  }
  testString(t, e, s, i) {
    t.isNamed(e) && (s ? this.subwalks.add(t, s) : this.matches.add(t, i, false));
  }
};
var Li = (n7, t) => typeof n7 == "string" ? new ot([n7], t) : Array.isArray(n7) ? new ot(n7, t) : n7;
var zt = class {
  path;
  patterns;
  opts;
  seen = /* @__PURE__ */ new Set();
  paused = false;
  aborted = false;
  #t = [];
  #s;
  #n;
  signal;
  maxDepth;
  includeChildMatches;
  constructor(t, e, s) {
    if (this.patterns = t, this.path = e, this.opts = s, this.#n = !s.posix && s.platform === "win32" ? "\\" : "/", this.includeChildMatches = s.includeChildMatches !== false, (s.ignore || !this.includeChildMatches) && (this.#s = Li(s.ignore ?? [], s), !this.includeChildMatches && typeof this.#s.add != "function")) {
      let i = "cannot ignore child matches, ignore lacks add() method.";
      throw new Error(i);
    }
    this.maxDepth = s.maxDepth || 1 / 0, s.signal && (this.signal = s.signal, this.signal.addEventListener("abort", () => {
      this.#t.length = 0;
    }));
  }
  #r(t) {
    return this.seen.has(t) || !!this.#s?.ignored?.(t);
  }
  #o(t) {
    return !!this.#s?.childrenIgnored?.(t);
  }
  pause() {
    this.paused = true;
  }
  resume() {
    if (this.signal?.aborted) return;
    this.paused = false;
    let t;
    for (; !this.paused && (t = this.#t.shift()); ) t();
  }
  onResume(t) {
    this.signal?.aborted || (this.paused ? this.#t.push(t) : t());
  }
  async matchCheck(t, e) {
    if (e && this.opts.nodir) return;
    let s;
    if (this.opts.realpath) {
      if (s = t.realpathCached() || await t.realpath(), !s) return;
      t = s;
    }
    let r = t.isUnknown() || this.opts.stat ? await t.lstat() : t;
    if (this.opts.follow && this.opts.nodir && r?.isSymbolicLink()) {
      let o = await r.realpath();
      o && (o.isUnknown() || this.opts.stat) && await o.lstat();
    }
    return this.matchCheckTest(r, e);
  }
  matchCheckTest(t, e) {
    return t && (this.maxDepth === 1 / 0 || t.depth() <= this.maxDepth) && (!e || t.canReaddir()) && (!this.opts.nodir || !t.isDirectory()) && (!this.opts.nodir || !this.opts.follow || !t.isSymbolicLink() || !t.realpathCached()?.isDirectory()) && !this.#r(t) ? t : void 0;
  }
  matchCheckSync(t, e) {
    if (e && this.opts.nodir) return;
    let s;
    if (this.opts.realpath) {
      if (s = t.realpathCached() || t.realpathSync(), !s) return;
      t = s;
    }
    let r = t.isUnknown() || this.opts.stat ? t.lstatSync() : t;
    if (this.opts.follow && this.opts.nodir && r?.isSymbolicLink()) {
      let o = r.realpathSync();
      o && (o?.isUnknown() || this.opts.stat) && o.lstatSync();
    }
    return this.matchCheckTest(r, e);
  }
  matchFinish(t, e) {
    if (this.#r(t)) return;
    if (!this.includeChildMatches && this.#s?.add) {
      let r = `${t.relativePosix()}/**`;
      this.#s.add(r);
    }
    let s = this.opts.absolute === void 0 ? e : this.opts.absolute;
    this.seen.add(t);
    let i = this.opts.mark && t.isDirectory() ? this.#n : "";
    if (this.opts.withFileTypes) this.matchEmit(t);
    else if (s) {
      let r = this.opts.posix ? t.fullpathPosix() : t.fullpath();
      this.matchEmit(r + i);
    } else {
      let r = this.opts.posix ? t.relativePosix() : t.relative(), o = this.opts.dotRelative && !r.startsWith(".." + this.#n) ? "." + this.#n : "";
      this.matchEmit(r ? o + r + i : "." + i);
    }
  }
  async match(t, e, s) {
    let i = await this.matchCheck(t, s);
    i && this.matchFinish(i, e);
  }
  matchSync(t, e, s) {
    let i = this.matchCheckSync(t, s);
    i && this.matchFinish(i, e);
  }
  walkCB(t, e, s) {
    this.signal?.aborted && s(), this.walkCB2(t, e, new Et(this.opts), s);
  }
  walkCB2(t, e, s, i) {
    if (this.#o(t)) return i();
    if (this.signal?.aborted && i(), this.paused) {
      this.onResume(() => this.walkCB2(t, e, s, i));
      return;
    }
    s.processPatterns(t, e);
    let r = 1, o = () => {
      --r === 0 && i();
    };
    for (let [h, a, l] of s.matches.entries()) this.#r(h) || (r++, this.match(h, a, l).then(() => o()));
    for (let h of s.subwalkTargets()) {
      if (this.maxDepth !== 1 / 0 && h.depth() >= this.maxDepth) continue;
      r++;
      let a = h.readdirCached();
      h.calledReaddir() ? this.walkCB3(h, a, s, o) : h.readdirCB((l, u) => this.walkCB3(h, u, s, o), true);
    }
    o();
  }
  walkCB3(t, e, s, i) {
    s = s.filterEntries(t, e);
    let r = 1, o = () => {
      --r === 0 && i();
    };
    for (let [h, a, l] of s.matches.entries()) this.#r(h) || (r++, this.match(h, a, l).then(() => o()));
    for (let [h, a] of s.subwalks.entries()) r++, this.walkCB2(h, a, s.child(), o);
    o();
  }
  walkCBSync(t, e, s) {
    this.signal?.aborted && s(), this.walkCB2Sync(t, e, new Et(this.opts), s);
  }
  walkCB2Sync(t, e, s, i) {
    if (this.#o(t)) return i();
    if (this.signal?.aborted && i(), this.paused) {
      this.onResume(() => this.walkCB2Sync(t, e, s, i));
      return;
    }
    s.processPatterns(t, e);
    let r = 1, o = () => {
      --r === 0 && i();
    };
    for (let [h, a, l] of s.matches.entries()) this.#r(h) || this.matchSync(h, a, l);
    for (let h of s.subwalkTargets()) {
      if (this.maxDepth !== 1 / 0 && h.depth() >= this.maxDepth) continue;
      r++;
      let a = h.readdirSync();
      this.walkCB3Sync(h, a, s, o);
    }
    o();
  }
  walkCB3Sync(t, e, s, i) {
    s = s.filterEntries(t, e);
    let r = 1, o = () => {
      --r === 0 && i();
    };
    for (let [h, a, l] of s.matches.entries()) this.#r(h) || this.matchSync(h, a, l);
    for (let [h, a] of s.subwalks.entries()) r++, this.walkCB2Sync(h, a, s.child(), o);
    o();
  }
};
var xt = class extends zt {
  matches = /* @__PURE__ */ new Set();
  constructor(t, e, s) {
    super(t, e, s);
  }
  matchEmit(t) {
    this.matches.add(t);
  }
  async walk() {
    if (this.signal?.aborted) throw this.signal.reason;
    return this.path.isUnknown() && await this.path.lstat(), await new Promise((t, e) => {
      this.walkCB(this.path, this.patterns, () => {
        this.signal?.aborted ? e(this.signal.reason) : t(this.matches);
      });
    }), this.matches;
  }
  walkSync() {
    if (this.signal?.aborted) throw this.signal.reason;
    return this.path.isUnknown() && this.path.lstatSync(), this.walkCBSync(this.path, this.patterns, () => {
      if (this.signal?.aborted) throw this.signal.reason;
    }), this.matches;
  }
};
var vt = class extends zt {
  results;
  constructor(t, e, s) {
    super(t, e, s), this.results = new V({ signal: this.signal, objectMode: true }), this.results.on("drain", () => this.resume()), this.results.on("resume", () => this.resume());
  }
  matchEmit(t) {
    this.results.write(t), this.results.flowing || this.pause();
  }
  stream() {
    let t = this.path;
    return t.isUnknown() ? t.lstat().then(() => {
      this.walkCB(t, this.patterns, () => this.results.end());
    }) : this.walkCB(t, this.patterns, () => this.results.end()), this.results;
  }
  streamSync() {
    return this.path.isUnknown() && this.path.lstatSync(), this.walkCBSync(this.path, this.patterns, () => this.results.end()), this.results;
  }
};
var Pi = typeof process == "object" && process && typeof process.platform == "string" ? process.platform : "linux";
var I = class {
  absolute;
  cwd;
  root;
  dot;
  dotRelative;
  follow;
  ignore;
  magicalBraces;
  mark;
  matchBase;
  maxDepth;
  nobrace;
  nocase;
  nodir;
  noext;
  noglobstar;
  pattern;
  platform;
  realpath;
  scurry;
  stat;
  signal;
  windowsPathsNoEscape;
  withFileTypes;
  includeChildMatches;
  opts;
  patterns;
  constructor(t, e) {
    if (!e) throw new TypeError("glob options required");
    if (this.withFileTypes = !!e.withFileTypes, this.signal = e.signal, this.follow = !!e.follow, this.dot = !!e.dot, this.dotRelative = !!e.dotRelative, this.nodir = !!e.nodir, this.mark = !!e.mark, e.cwd ? (e.cwd instanceof URL || e.cwd.startsWith("file://")) && (e.cwd = Wi(e.cwd)) : this.cwd = "", this.cwd = e.cwd || "", this.root = e.root, this.magicalBraces = !!e.magicalBraces, this.nobrace = !!e.nobrace, this.noext = !!e.noext, this.realpath = !!e.realpath, this.absolute = e.absolute, this.includeChildMatches = e.includeChildMatches !== false, this.noglobstar = !!e.noglobstar, this.matchBase = !!e.matchBase, this.maxDepth = typeof e.maxDepth == "number" ? e.maxDepth : 1 / 0, this.stat = !!e.stat, this.ignore = e.ignore, this.withFileTypes && this.absolute !== void 0) throw new Error("cannot set absolute and withFileTypes:true");
    if (typeof t == "string" && (t = [t]), this.windowsPathsNoEscape = !!e.windowsPathsNoEscape || e.allowWindowsEscape === false, this.windowsPathsNoEscape && (t = t.map((a) => a.replace(/\\/g, "/"))), this.matchBase) {
      if (e.noglobstar) throw new TypeError("base matching requires globstar");
      t = t.map((a) => a.includes("/") ? a : `./**/${a}`);
    }
    if (this.pattern = t, this.platform = e.platform || Pi, this.opts = { ...e, platform: this.platform }, e.scurry) {
      if (this.scurry = e.scurry, e.nocase !== void 0 && e.nocase !== e.scurry.nocase) throw new Error("nocase option contradicts provided scurry option");
    } else {
      let a = e.platform === "win32" ? it : e.platform === "darwin" ? St : e.platform ? rt : Xe;
      this.scurry = new a(this.cwd, { nocase: e.nocase, fs: e.fs });
    }
    this.nocase = this.scurry.nocase;
    let s = this.platform === "darwin" || this.platform === "win32", i = { braceExpandMax: 1e4, ...e, dot: this.dot, matchBase: this.matchBase, nobrace: this.nobrace, nocase: this.nocase, nocaseMagicOnly: s, nocomment: true, noext: this.noext, nonegate: true, optimizationLevel: 2, platform: this.platform, windowsPathsNoEscape: this.windowsPathsNoEscape, debug: !!this.opts.debug }, r = this.pattern.map((a) => new D(a, i)), [o, h] = r.reduce((a, l) => (a[0].push(...l.set), a[1].push(...l.globParts), a), [[], []]);
    this.patterns = o.map((a, l) => {
      let u = h[l];
      if (!u) throw new Error("invalid pattern object");
      return new nt(a, u, 0, this.platform);
    });
  }
  async walk() {
    return [...await new xt(this.patterns, this.scurry.cwd, { ...this.opts, maxDepth: this.maxDepth !== 1 / 0 ? this.maxDepth + this.scurry.cwd.depth() : 1 / 0, platform: this.platform, nocase: this.nocase, includeChildMatches: this.includeChildMatches }).walk()];
  }
  walkSync() {
    return [...new xt(this.patterns, this.scurry.cwd, { ...this.opts, maxDepth: this.maxDepth !== 1 / 0 ? this.maxDepth + this.scurry.cwd.depth() : 1 / 0, platform: this.platform, nocase: this.nocase, includeChildMatches: this.includeChildMatches }).walkSync()];
  }
  stream() {
    return new vt(this.patterns, this.scurry.cwd, { ...this.opts, maxDepth: this.maxDepth !== 1 / 0 ? this.maxDepth + this.scurry.cwd.depth() : 1 / 0, platform: this.platform, nocase: this.nocase, includeChildMatches: this.includeChildMatches }).stream();
  }
  streamSync() {
    return new vt(this.patterns, this.scurry.cwd, { ...this.opts, maxDepth: this.maxDepth !== 1 / 0 ? this.maxDepth + this.scurry.cwd.depth() : 1 / 0, platform: this.platform, nocase: this.nocase, includeChildMatches: this.includeChildMatches }).streamSync();
  }
  iterateSync() {
    return this.streamSync()[Symbol.iterator]();
  }
  [Symbol.iterator]() {
    return this.iterateSync();
  }
  iterate() {
    return this.stream()[Symbol.asyncIterator]();
  }
  [Symbol.asyncIterator]() {
    return this.iterate();
  }
};
var le = (n7, t = {}) => {
  Array.isArray(n7) || (n7 = [n7]);
  for (let e of n7) if (new D(e, t).hasMagic()) return true;
  return false;
};
function Bt(n7, t = {}) {
  return new I(n7, t).streamSync();
}
function Qe(n7, t = {}) {
  return new I(n7, t).stream();
}
function ts(n7, t = {}) {
  return new I(n7, t).walkSync();
}
async function Je(n7, t = {}) {
  return new I(n7, t).walk();
}
function Ut(n7, t = {}) {
  return new I(n7, t).iterateSync();
}
function es(n7, t = {}) {
  return new I(n7, t).iterate();
}
var ji = Bt;
var Ii = Object.assign(Qe, { sync: Bt });
var zi = Ut;
var Bi = Object.assign(es, { sync: Ut });
var Ui = Object.assign(ts, { stream: Bt, iterate: Ut });
var Ze = Object.assign(Je, { glob: Je, globSync: ts, sync: Ui, globStream: Qe, stream: Ii, globStreamSync: Bt, streamSync: ji, globIterate: es, iterate: Bi, globIterateSync: Ut, iterateSync: zi, Glob: I, hasMagic: le, escape: tt, unescape: W });
Ze.glob = Ze;

// .claude/skills/cross-spec-reconcile/scripts/reconcile.ts
var DEFAULT_OWNERSHIP_STOPLIST = [
  // Pre-batch-10 base — expanded to entire tests/e2e dir per readiness audit
  // (individual test files shared across specs trigger ownership FPs).
  "tests/e2e/",
  "tests/unit/",
  "tests/fixtures/",
  "tests/setup/",
  "tests/hooks/",
  "tests/step_definitions/",
  "tools/_shared/",
  "tools/test-statusline/",
  "tools/tui-test-runner/",
  ".claude-plugin/",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "vitest.config.ts",
  // Batch-10 corpus expansion — shared tooling + skills + rules infra.
  "tools/specs-generator/",
  "tools/specs-validator/",
  "tools/auto-commit/",
  "tools/plan-pomogator/",
  "tools/migrate-v1-to-v2/",
  "tools/marksman-installer/",
  "tools/spec-graph/",
  ".claude/skills/",
  ".claude/rules/",
  ".claude/commands/",
  ".dev-pomogator/",
  ".devcontainer/",
  "scripts/",
  "Dockerfile.test",
  "docker-compose.test.yml"
];
var CONCEPT_OVERLAP_MIN_SHARED = 25;
var CONCEPT_NOUN_STOPLIST = /* @__PURE__ */ new Set([
  // Spec-ecosystem terms (batch-9 base)
  "Acceptance",
  "Criteria",
  "Schema",
  "Changelog",
  "Stop",
  "Docker",
  "TypeScript",
  "JavaScript",
  "Python",
  "GitHub",
  "README",
  "Phase",
  "Status",
  "TODO",
  "FIXME",
  "WARNING",
  "CRITICAL",
  "INFO",
  "JSON",
  "YAML",
  "Feature",
  "Scenario",
  "Requirement",
  "NFR",
  "Performance",
  "Security",
  "Reliability",
  "Usability",
  "Implementation",
  "Definition",
  "Validation",
  "Verification",
  "Configuration",
  "Documentation",
  "Integration",
  "Migration",
  // Batch-10: design-pattern + framework nouns (audit-derived corpus)
  "Builder",
  "Handler",
  "Manager",
  "Factory",
  "Provider",
  "Runner",
  "Validator",
  "Parser",
  "Serializer",
  "Transformer",
  "Strategy",
  "Observer",
  "Facade",
  "Adapter",
  "Bridge",
  "Registry",
  "Store",
  "Cache",
  "Queue",
  "Service",
  "Controller",
  "Component",
  "Module",
  "Extension",
  "Plugin",
  "Skill",
  "Command",
  "Hook",
  "Workflow",
  "Pipeline",
  "Worker",
  "Listener",
  "Emitter",
  "Subscriber",
  "Publisher",
  "Generator",
  "Iterator",
  "Visitor",
  "Composer",
  "Decorator",
  "Proxy",
  "Wrapper",
  "Container",
  "Context",
  "Session",
  "Request",
  "Response",
  "Message",
  "Event",
  "Action",
  "State",
  "Reducer",
  "Selector",
  "Middleware",
  "Repository",
  "Aggregate",
  "Entity",
  "Model",
  "View",
  "Template",
  "Render",
  "Layout",
  // Batch-10 dogfood pass-2: Keep-a-Changelog + spec-workflow vocab
  // surfaced as the dominant residual concept-overlap noise.
  "Unreleased",
  "Added",
  "Changed",
  "Removed",
  "Fixed",
  "Released",
  "Deprecated",
  "Code",
  "Claude",
  "Discovery",
  "Spec",
  "Pass",
  "Fail",
  "Test",
  "Tests",
  "Notes",
  "Comments",
  "Description",
  "Title",
  "Summary",
  "Details",
  "Overview",
  "Reference",
  "References",
  "Example",
  "Examples",
  "Note",
  "See",
  "Also",
  "TODO",
  "TBD",
  // Batch-21 honest-audit pass: words that appear in ≥50% of all
  // specs in this corpus and dominate concept-overlap with no real
  // signal (audit caught me claiming "89% reduction" while concept-
  // overlap still emitted 2082 generic-vocabulary findings).
  "Requirements",
  "Decisions",
  "Infrastructure",
  "Pending",
  "Initial",
  "Design",
  "Rule",
  "Read",
  "Atomic",
  "Update",
  "Updates",
  "Updated",
  "Create",
  "Created",
  "Delete",
  "Deleted",
  "Default",
  "Defaults",
  "File",
  "Files",
  "Path",
  "Paths",
  "Directory",
  "Folder",
  "Output",
  "Input",
  "Result",
  "Results",
  "Error",
  "Errors",
  "Warning",
  "Warnings",
  "Phase",
  "Phases",
  "Step",
  "Steps",
  "Task",
  "Tasks",
  "User",
  "Users",
  "System",
  "Service",
  "Process",
  "Method",
  "Function",
  "Class",
  "Object",
  "Array",
  "String",
  "Number",
  "Boolean",
  "Type",
  "Types",
  "Value",
  "Values",
  "Key",
  "Keys",
  "Field",
  "Fields",
  "Property",
  "Properties",
  "Mode",
  "Modes",
  "Format",
  "Formats",
  "Version",
  "Versions",
  "Index",
  "Order",
  "List",
  "Group",
  "Groups",
  "Section",
  "Sections",
  "Block",
  "Blocks",
  "Item",
  "Items",
  "Entry",
  "Entries",
  "Source",
  "Target",
  "Origin",
  "Destination",
  "Repo",
  "Repository",
  "Branch",
  "Commit",
  "Issue",
  "PR",
  "Local",
  "Remote",
  "Host",
  "Container",
  "Cluster",
  "Network",
  "Port",
  "URL",
  "URI",
  "JSON",
  "YAML",
  "XML",
  "HTML",
  "CSS",
  "Markdown",
  "Text",
  "Binary",
  // Batch-21 pass-2: top-30 corpus-shared nouns from honest audit
  "Name",
  "Auto",
  "Evidence",
  "Project",
  "Windows",
  "Classification",
  "Manifest",
  "Audit",
  "Report",
  "Existing",
  "Scope",
  "Rules",
  "Install",
  "Analysis",
  "SessionStart",
  "Changes",
  "Node",
  "Bash",
  "Research",
  "Verdict",
  "Generated",
  "Write",
  "Edit",
  "Hooks",
  "Shared",
  "Matrix",
  "Decision",
  "UserPromptSubmit",
  "Stories",
  "Framework",
  "Plugin",
  "Plugins",
  "Marketplace",
  "Settings",
  "Setup",
  "Cleanup",
  "Init",
  "Final",
  "Run",
  "Ready",
  "Done",
  "Open",
  "Close",
  "Save",
  "Load",
  "Apply",
  "Reset",
  "Skip",
  "Verify",
  "Verified",
  "Confirmed",
  "Detected"
]);
var PATH_REF_RE = /`(?:src|tools|tests|lib)\/[\w./-]+\*?(?:\.[\w]+)?`/g;
var MCP_METHOD_NAMES = /* @__PURE__ */ new Set([
  "tools/list",
  "tools/call",
  "resources/list",
  "resources/read",
  "resources/templates/list",
  "prompts/list",
  "prompts/get",
  "roots/list",
  "sampling/createMessage",
  "ping",
  "initialize",
  "notifications/initialized",
  "notifications/cancelled"
]);
var IDENTIFIER_LINE_RE = /\b(\w+(?:_key|_id|_token|_path|Key|Id|Token|Path))\s*=\s*["']([^"']+)["']/g;
var CONCEPT_NOUN_RE = /\b[A-Z][a-z]{3,}(?:[A-Z][a-z]{2,}){0,3}\b/g;
var FR_HEADING_RE = /^#{2,3}\s+(?:Requirement:\s+)?(FR-\d+)(?:[:\s]|$)/gm;
var AC_HEADING_RE = /^#{2,4}\s+(?:AC-\d+|Acceptance Criteria\b)/gm;
var FR_REF_RE = /\bFR-\d+\b/g;
var FEATURE_TAG_RE = /@feature(\d+)\b/g;
function relPosix(from, to) {
  return path.relative(from, to).replace(/\\/g, "/");
}
function listSpecs(repoRoot) {
  const specsDir = path.join(repoRoot, ".specs");
  if (!fs2.existsSync(specsDir)) return [];
  return fs2.readdirSync(specsDir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith(".")).filter((d) => {
    const subdir = path.join(specsDir, d.name);
    try {
      return fs2.readdirSync(subdir, { withFileTypes: true }).some((e) => e.isFile() && e.name.endsWith(".md"));
    } catch {
      return false;
    }
  }).map((d) => d.name);
}
function readSpecMd(repoRoot, slug) {
  const dir = path.join(repoRoot, ".specs", slug);
  if (!fs2.existsSync(dir)) return [];
  const out = [];
  for (const name of fs2.readdirSync(dir)) {
    if (!name.endsWith(".md")) continue;
    const abs = path.join(dir, name);
    out.push({ path: abs, body: fs2.readFileSync(abs, "utf8") });
  }
  return out;
}
function pathExistsResolvingDetail(repoRoot, ref, implRoots) {
  const cleanRef = ref.replace(/`/g, "");
  const roots = implRoots ?? ["."];
  let anyGlobPrefixMissing = false;
  for (const r of roots) {
    const rootAbs = path.join(repoRoot, r);
    const candidateAbs = path.join(rootAbs, cleanRef);
    if (!cleanRef.includes("*")) {
      if (fs2.existsSync(candidateAbs)) return { exists: true, globPrefixMissing: false };
      continue;
    }
    const firstStar = candidateAbs.indexOf("*");
    const prefixDir = path.dirname(candidateAbs.slice(0, firstStar));
    if (!fs2.existsSync(prefixDir)) {
      anyGlobPrefixMissing = true;
      continue;
    }
    try {
      const matches = ts(cleanRef, { cwd: rootAbs, nodir: false, dot: false });
      if (matches.length > 0) return { exists: true, globPrefixMissing: false };
    } catch {
    }
  }
  return { exists: false, globPrefixMissing: anyGlobPrefixMissing };
}
function findMissingFileReferences(files, repoRoot, implRoots) {
  const out = [];
  for (const file of files) {
    const lines = file.body.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const matches = lines[i].match(PATH_REF_RE);
      if (!matches) continue;
      for (const ref of matches) {
        const cleanRef = ref.replace(/`/g, "");
        if (MCP_METHOD_NAMES.has(cleanRef)) continue;
        const detail = pathExistsResolvingDetail(repoRoot, ref, implRoots);
        if (detail.exists) continue;
        const hint = detail.globPrefixMissing ? "Add the implementation, OR mark the FR as OUT_OF_SCOPE, OR remove the reference. (Glob prefix dir does not exist \u2014 was the parent directory removed or renamed?)" : "Add the implementation, OR mark the FR as OUT_OF_SCOPE, OR remove the reference.";
        out.push({
          code: "impl-drift/missing-file",
          class: "uncovered",
          severity: "WARNING",
          referenced_in: `${relPosix(repoRoot, file.path)}:${i + 1}`,
          expected_path: cleanRef,
          suggested_fix: hint
        });
      }
    }
  }
  return out;
}
function stripFencedBlocks(body) {
  return body.replace(/```[\s\S]*?```/g, "");
}
function normalizeIdentifierKey(key) {
  return key.toLowerCase().replace(/[_-]/g, "");
}
function collectIdentifiers(files) {
  const out = /* @__PURE__ */ new Map();
  for (const f of files) {
    const cleanBody = stripFencedBlocks(f.body);
    let m;
    IDENTIFIER_LINE_RE.lastIndex = 0;
    while ((m = IDENTIFIER_LINE_RE.exec(cleanBody)) !== null) {
      const lemma = normalizeIdentifierKey(m[1]);
      out.set(lemma, { value: m[2], where: f.path, originalKey: m[1] });
    }
  }
  return out;
}
function findRuntimeIdentifierDrift(bySlug) {
  const out = [];
  const slugs = [...bySlug.keys()];
  for (let i = 0; i < slugs.length; i++) {
    for (let j2 = i + 1; j2 < slugs.length; j2++) {
      const a = bySlug.get(slugs[i]);
      const b = bySlug.get(slugs[j2]);
      for (const lemma of a.keys()) {
        if (!b.has(lemma)) continue;
        const va = a.get(lemma);
        const vb = b.get(lemma);
        if (va.value !== vb.value || va.originalKey !== vb.originalKey) {
          out.push({
            code: "cross-spec/runtime-identifier-drift",
            class: "runtime-identifier-drift",
            severity: "CRITICAL",
            spec_a: `${va.where} (${va.originalKey} = "${va.value}")`,
            spec_b: `${vb.where} (${vb.originalKey} = "${vb.value}")`,
            suggested_fix: va.originalKey !== vb.originalKey ? `Concept normalises to "${lemma}" but spelled "${va.originalKey}" / "${vb.originalKey}". Pick one canonical key + update both specs in lockstep.` : "Pick one canonical name + update both specs in lockstep."
          });
        }
      }
    }
  }
  return out;
}
var URL_PATH_RE = /["'`](\/(?:api|v\d+|\.well-known|webhook|hook|callback)[\w/{}\-.]*?)["'`]/g;
var CLI_FLAG_RE = /\B(--[a-z][a-z0-9-]+)\b/g;
var TS_EXPORT_RE = /\bexport\s+(?:(?:default\s+)?(?:const|let|var|function|class|interface|type|enum)\s+(\w+)|\{\s*([^}]+)\s*\})/g;
var TS_DEFAULT_EXPORT_RE = /\bexport\s+default\s+(\w+)\s*;?/g;
var TS_STAR_REEXPORT_RE = /\bexport\s*\*\s*from\s*['"]/;
var TS_IMPORT_RE = /import\s+\{\s*([^}]+)\s*\}\s+from\s+['"]([^'"]+)['"]/g;
var ENUM_HEADER_RE = /(?:^|\n)\s*(?:Values|Enum|Options|Allowed):\s*([\w |,/-]+)/g;
var AC_TO_FR_RE = /AC-\d+[^\n]*?\(FR-(\d+)\)|\*\*Requirement:\*\*\s*\[FR-(\d+)\]/g;
var SCHEMA_KEY_BULLET_RE = /^\s*[-*]\s+`([a-zA-Z_][\w]*)`/gm;
var PHASE_CELL_RE = /\bPhase\s+(\d+)\b/i;
var NFR_BUDGET_RE = /\b(response[-\s]?time|latency|throughput|availability|uptime|error[-\s]rate|cpu|memory|storage)\b[^.\n]{0,40}?(\d+(?:\.\d+)?)\s*(ms|s|mb|gb|%|req\/s)/gi;
var DECISION_STATUS_LOCKED_RE = /\bStatus\s*[:=]\s*(?:LOCKED|FINAL)\b/i;
var DECISION_CHOSEN_RE = /\bChosen\s*[:=]\s*(@?[\w./-]+)/i;
var DECISION_IMPL_PATH_RE = /\bImplemented\s+in\s*[:=]\s*`([^`]+)`/i;
var TS_FILE_IMPORT_RE = /^\s*import\s+[^'"]+['"]([^'"]+)['"]/gm;
var TS_INTERFACE_RE = /(?:interface|type)\s+(\w+)\s*[={]\s*([\s\S]*?)^\s*\}/gm;
var TS_FIELD_RE = /^\s*(?:readonly\s+)?(\w+)\s*\??\s*:/gm;
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
var MD_LINK_RE = /\[[^\]]+\]\(([^)\s]+)\)/g;
function findMissingSymbols(files, repoRoot) {
  const out = [];
  for (const file of files) {
    let m;
    TS_IMPORT_RE.lastIndex = 0;
    while ((m = TS_IMPORT_RE.exec(file.body)) !== null) {
      const symbols = m[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
      const importPath = m[2];
      if (!importPath.startsWith(".") && !importPath.startsWith("/")) continue;
      const candidates = [
        importPath,
        `${importPath}.ts`,
        `${importPath}.tsx`,
        `${importPath}/index.ts`
      ];
      let resolved = null;
      for (const c of candidates) {
        const abs = path.isAbsolute(c) ? path.join(repoRoot, c.replace(/^\//, "")) : path.resolve(path.dirname(file.path), c);
        if (fs2.existsSync(abs) && fs2.statSync(abs).isFile()) {
          resolved = abs;
          break;
        }
      }
      if (!resolved) continue;
      const tsBody = fs2.readFileSync(resolved, "utf8");
      if (TS_STAR_REEXPORT_RE.test(tsBody)) continue;
      const exported = /* @__PURE__ */ new Set();
      let em;
      TS_EXPORT_RE.lastIndex = 0;
      while ((em = TS_EXPORT_RE.exec(tsBody)) !== null) {
        if (em[1]) exported.add(em[1]);
        if (em[2]) {
          for (const part of em[2].split(",")) {
            const name = part.trim().split(/\s+as\s+/).pop();
            if (name) exported.add(name);
          }
        }
      }
      TS_DEFAULT_EXPORT_RE.lastIndex = 0;
      let dm;
      let hasDefault = false;
      while ((dm = TS_DEFAULT_EXPORT_RE.exec(tsBody)) !== null) {
        exported.add(dm[1]);
        hasDefault = true;
      }
      if (/\bexport\s+default\s+(?:function|class|async\s+function)/.test(tsBody)) {
        hasDefault = true;
      }
      if (hasDefault) exported.add("default");
      for (const sym of symbols) {
        if (exported.has(sym)) continue;
        out.push({
          code: "impl-drift/missing-symbol",
          class: "uncovered",
          severity: "WARNING",
          referenced_in: `${relPosix(repoRoot, file.path)}`,
          expected_path: `${relPosix(repoRoot, resolved)}::${sym}`,
          suggested_fix: `\`${sym}\` is imported from ${importPath} but the file exports do not include it. Add the export or fix the import.`
        });
      }
    }
  }
  return out;
}
function collectUrlsBySlug(filesBySlug) {
  const out = /* @__PURE__ */ new Map();
  for (const [slug, files] of filesBySlug) {
    for (const f of files) {
      let m;
      URL_PATH_RE.lastIndex = 0;
      while ((m = URL_PATH_RE.exec(f.body)) !== null) {
        const url = m[1];
        if (!out.has(url)) out.set(url, /* @__PURE__ */ new Map());
        if (!out.get(url).has(slug)) out.get(url).set(slug, f.path);
      }
    }
  }
  return out;
}
function findUrlShapeDrift(filesBySlug) {
  const out = [];
  const urlsBySlug = collectUrlsBySlug(filesBySlug);
  const bySuffix = /* @__PURE__ */ new Map();
  const GENERIC_LAST_SEGMENTS = /* @__PURE__ */ new Set([
    "list",
    "get",
    "add",
    "set",
    "post",
    "put",
    "delete",
    "patch",
    "all",
    "new",
    "edit",
    "create",
    "remove",
    "update",
    "index",
    "show",
    "view",
    "find",
    "search",
    "query"
  ]);
  for (const [url, slugMap] of urlsBySlug) {
    const parts = url.split("/").filter(Boolean);
    if (parts.length < 1) continue;
    const last = parts[parts.length - 1].toLowerCase().replace(/[{}]/g, "");
    if (GENERIC_LAST_SEGMENTS.has(last)) continue;
    const suffix = "/" + parts.slice(-1).join("/");
    if (!bySuffix.has(suffix)) bySuffix.set(suffix, []);
    for (const slug of slugMap.keys()) bySuffix.get(suffix).push({ url, slug });
  }
  for (const [, hits] of bySuffix) {
    if (hits.length < 2) continue;
    const distinctUrls = new Set(hits.map((h) => h.url));
    if (distinctUrls.size < 2) continue;
    const distinctSlugs = new Set(hits.map((h) => h.slug));
    if (distinctSlugs.size < 2) continue;
    const sorted = [...hits].sort((a, b) => a.url.localeCompare(b.url));
    out.push({
      code: "cross-spec/url-shape-drift",
      class: "runtime-identifier-drift",
      severity: "CRITICAL",
      spec_a: `.specs/${sorted[0].slug} (${sorted[0].url})`,
      spec_b: `.specs/${sorted[1].slug} (${sorted[1].url})`,
      suggested_fix: `URLs ${[...distinctUrls].join(" vs ")} share the same suffix \u2014 clients will hit one and the server may serve the other. Pick a canonical shape.`
    });
  }
  return out;
}
function findCliFlagDrift(filesBySlug) {
  const out = [];
  const flagsBySlug = /* @__PURE__ */ new Map();
  for (const [slug, files] of filesBySlug) {
    const flags = /* @__PURE__ */ new Set();
    for (const f of files) {
      const body = stripFencedBlocks(f.body);
      let m;
      CLI_FLAG_RE.lastIndex = 0;
      while ((m = CLI_FLAG_RE.exec(body)) !== null) flags.add(m[1]);
    }
    flagsBySlug.set(slug, flags);
  }
  const byLemma = /* @__PURE__ */ new Map();
  for (const [slug, flags] of flagsBySlug) {
    for (const flag of flags) {
      const lemma = flag.replace(/^--/, "").replace(/-/g, "").toLowerCase();
      if (!byLemma.has(lemma)) byLemma.set(lemma, []);
      byLemma.get(lemma).push({ flag, slug });
    }
  }
  for (const [, hits] of byLemma) {
    if (hits.length < 2) continue;
    const distinctFlags = new Set(hits.map((h) => h.flag));
    if (distinctFlags.size < 2) continue;
    const distinctSlugs = new Set(hits.map((h) => h.slug));
    if (distinctSlugs.size < 2) continue;
    const sorted = [...hits].sort((a, b) => a.flag.localeCompare(b.flag));
    out.push({
      code: "cross-spec/cli-flag-drift",
      class: "runtime-identifier-drift",
      severity: "WARNING",
      spec_a: `.specs/${sorted[0].slug} (${sorted[0].flag})`,
      spec_b: `.specs/${sorted[1].slug} (${sorted[1].flag})`,
      suggested_fix: `Flags ${[...distinctFlags].join(" vs ")} normalise to the same lemma \u2014 users may type either and one will fail. Pick a canonical name.`
    });
  }
  return out;
}
function collectEnumsBySlug(filesBySlug) {
  const out = /* @__PURE__ */ new Map();
  for (const [slug, files] of filesBySlug) {
    const enumMap = /* @__PURE__ */ new Map();
    for (const f of files) {
      const body = stripFencedBlocks(f.body);
      const sections = body.split(/(?=^#{2,4}\s+)/m);
      for (const section of sections) {
        const headerMatch = section.match(/^#{2,4}\s+([^\n]+)/);
        if (!headerMatch) continue;
        const enumName = headerMatch[1].trim().toLowerCase().replace(/\s+/g, "-");
        let m;
        ENUM_HEADER_RE.lastIndex = 0;
        while ((m = ENUM_HEADER_RE.exec(section)) !== null) {
          const values = m[1].split(/[|,/]/).map((s) => s.trim().replace(/[`"]/g, "")).filter(Boolean);
          if (values.length < 2) continue;
          if (!enumMap.has(enumName)) enumMap.set(enumName, /* @__PURE__ */ new Set());
          for (const v2 of values) enumMap.get(enumName).add(v2);
        }
      }
    }
    out.set(slug, enumMap);
  }
  return out;
}
function findEnumDivergence(filesBySlug) {
  const out = [];
  const enumsBySlug = collectEnumsBySlug(filesBySlug);
  const slugs = [...enumsBySlug.keys()];
  for (let i = 0; i < slugs.length; i++) {
    for (let j2 = i + 1; j2 < slugs.length; j2++) {
      const a = enumsBySlug.get(slugs[i]);
      const b = enumsBySlug.get(slugs[j2]);
      for (const enumName of a.keys()) {
        if (!b.has(enumName)) continue;
        const setA = a.get(enumName);
        const setB = b.get(enumName);
        const symmetric = [];
        for (const v2 of setA) if (!setB.has(v2)) symmetric.push(v2);
        for (const v2 of setB) if (!setA.has(v2)) symmetric.push(v2);
        if (symmetric.length === 0) continue;
        out.push({
          code: "cross-spec/enum-divergence",
          class: "schema-drift",
          severity: "CRITICAL",
          spec_a: `.specs/${slugs[i]} (${enumName}: ${[...setA].sort().join(", ")})`,
          spec_b: `.specs/${slugs[j2]} (${enumName}: ${[...setB].sort().join(", ")})`,
          suggested_fix: `Enum "${enumName}" diverges on values [${symmetric.join(", ")}] \u2014 pick one canonical set or rename one of the enums.`
        });
      }
    }
  }
  return out;
}
function findModuleOwnershipConflict(filesBySlug, stoplist = DEFAULT_OWNERSHIP_STOPLIST, repoRoot = ".") {
  const out = [];
  const pathsBySlug = /* @__PURE__ */ new Map();
  for (const [slug, files] of filesBySlug) {
    const pathMap = /* @__PURE__ */ new Map();
    for (const f of files) {
      let m;
      PATH_REF_RE.lastIndex = 0;
      while ((m = PATH_REF_RE.exec(f.body)) !== null) {
        const raw = m[0].replace(/`/g, "");
        const ref = raw.replace(/\*/g, "");
        if (MCP_METHOD_NAMES.has(raw)) continue;
        if (stoplist.some((s) => ref.includes(s))) continue;
        if (!fs2.existsSync(path.join(repoRoot, ref))) continue;
        pathMap.set(ref, f.path);
      }
    }
    pathsBySlug.set(slug, pathMap);
  }
  const slugs = [...pathsBySlug.keys()];
  for (let i = 0; i < slugs.length; i++) {
    for (let j2 = i + 1; j2 < slugs.length; j2++) {
      const a = pathsBySlug.get(slugs[i]);
      const b = pathsBySlug.get(slugs[j2]);
      for (const refPath of a.keys()) {
        if (!b.has(refPath)) continue;
        out.push({
          code: "cross-spec/module-ownership-conflict",
          class: "contradiction",
          severity: "CRITICAL",
          spec_a: `.specs/${slugs[i]} (claims ${refPath})`,
          spec_b: `.specs/${slugs[j2]} (claims ${refPath})`,
          suggested_fix: `Both specs reference ${refPath} as a deliverable \u2014 pick one canonical owner or split the module.`
        });
      }
    }
  }
  return out;
}
function findDeadLinks(files, repoRoot) {
  const out = [];
  for (const file of files) {
    const cleanBody = stripFencedBlocks(file.body);
    const lines = cleanBody.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      let m;
      MD_LINK_RE.lastIndex = 0;
      while ((m = MD_LINK_RE.exec(lines[i])) !== null) {
        const target = m[1].split("#")[0].split("?")[0];
        if (!target) continue;
        if (/^[a-z]+:\/\//i.test(target)) continue;
        if (target.startsWith("mailto:")) continue;
        if (/^[.\[\]\\\+\*\(\)\{\}<>]+$/.test(target)) continue;
        if (/\[[^\]]*\][+*?]/.test(target)) continue;
        if (/\\[a-zA-Z]/.test(target)) continue;
        if (target.startsWith("../../../memory/")) continue;
        const primary = target.startsWith("/") ? path.join(repoRoot, target.slice(1)) : path.isAbsolute(target) ? target : path.resolve(path.dirname(file.path), target);
        if (fs2.existsSync(primary)) continue;
        const cleaned = target.replace(/^(?:\.\.[/\\])+/, "");
        const fallback = path.join(repoRoot, cleaned);
        if (fs2.existsSync(fallback)) continue;
        out.push({
          code: "impl-drift/dead-link",
          class: "uncovered",
          severity: "WARNING",
          referenced_in: `${relPosix(repoRoot, file.path)}:${i + 1}`,
          expected_path: target,
          suggested_fix: `Markdown link target "${target}" does not exist relative to ${path.basename(file.path)}. Fix the path or remove the link.`
        });
      }
    }
  }
  return out;
}
function findMissingAcceptance(files, repoRoot) {
  const defs = collectFrDefinitions(files);
  if (defs.size === 0) return [];
  let acFound = false;
  for (const f of files) {
    if (/^#{2,4}\s+(?:AC-\d+|Acceptance\s+Criteria)\b/m.test(f.body)) {
      acFound = true;
      break;
    }
  }
  if (acFound) return [];
  const [fr, file] = defs.entries().next().value;
  return [{
    code: "spec-only/missing-acceptance",
    class: "spec-only",
    severity: "WARNING",
    referenced_in: relPosix(repoRoot, file),
    suggested_fix: `${defs.size} FR(s) defined in this spec but no AC heading found in any MD file. Add ACCEPTANCE_CRITERIA.md (start with ${fr}).`
  }];
}
function findInvalidFrontmatter(repoRoot, slug) {
  const dir = path.join(repoRoot, ".specs", slug);
  if (!fs2.existsSync(dir)) return [];
  const out = [];
  for (const name of fs2.readdirSync(dir)) {
    if (!name.endsWith(".feature")) continue;
    const body = fs2.readFileSync(path.join(dir, name), "utf8");
    const langMatch = body.match(/^#\s*language\s*:\s*(\S+)/m);
    if (!langMatch) continue;
    if (!body.startsWith("#")) {
      out.push({
        code: "schema-drift/invalid-frontmatter",
        class: "schema-drift",
        severity: "WARNING",
        referenced_in: `.specs/${slug}/${name}`,
        suggested_fix: "`# language: <code>` directive must appear on the first line of the .feature file (before any blank lines or comments)."
      });
      continue;
    }
    const lang = langMatch[1];
    if (!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(lang)) {
      out.push({
        code: "schema-drift/invalid-frontmatter",
        class: "schema-drift",
        severity: "WARNING",
        referenced_in: `.specs/${slug}/${name}`,
        suggested_fix: `"# language: ${lang}" \u2014 Gherkin expects an ISO 639-1 code (e.g. \`en\`, \`ru\`, \`fr\`).`
      });
    }
  }
  return out;
}
function findMissingTestPerFR(files, featureTags, repoRoot, slug) {
  const progressFile = path.join(repoRoot, ".specs", slug, ".progress.json");
  let phaseIndex = 0;
  if (fs2.existsSync(progressFile)) {
    try {
      const parsed = JSON.parse(fs2.readFileSync(progressFile, "utf8"));
      if (typeof parsed.phase_index === "number") phaseIndex = parsed.phase_index;
    } catch {
    }
  }
  if (phaseIndex < 2) return [];
  const defs = collectFrDefinitions(files);
  const out = [];
  for (const [fr, definedIn] of defs.entries()) {
    if (featureTags.has(fr)) continue;
    out.push({
      code: "impl-drift/missing-test",
      class: "uncovered",
      severity: "INFO",
      referenced_in: relPosix(repoRoot, definedIn),
      suggested_fix: `Add @${fr.toLowerCase().replace("-", "")} tag + Scenario covering ${fr}, OR mark FR as [OUT_OF_SCOPE].`
    });
  }
  return out;
}
function findOrphanACs(files, repoRoot) {
  const defs = collectFrDefinitions(files);
  const out = [];
  for (const f of files) {
    if (!/(?:^|\/|\\)(?:ACCEPTANCE_CRITERIA|AC)\.md$/i.test(f.path)) continue;
    const body = stripFencedBlocks(f.body);
    const lines = body.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      let m;
      AC_TO_FR_RE.lastIndex = 0;
      while ((m = AC_TO_FR_RE.exec(lines[i])) !== null) {
        const num = m[1] ?? m[2];
        if (!num) continue;
        const fr = `FR-${num}`;
        if (defs.has(fr)) continue;
        out.push({
          code: "spec-only/orphan-AC",
          class: "spec-only",
          severity: "INFO",
          referenced_in: `${relPosix(repoRoot, f.path)}:${i + 1}`,
          suggested_fix: `AC references ${fr} which is not defined in this spec. Either add ${fr} to FR.md or fix the AC backref.`
        });
      }
    }
  }
  return out;
}
function findStaleFeatureFiles(repoRoot, slug, files) {
  const dir = path.join(repoRoot, ".specs", slug);
  if (!fs2.existsSync(dir)) return [];
  const MD_TARGETS = ["FR.md", "ACCEPTANCE_CRITERIA.md", "REQUIREMENTS.md", "DESIGN.md"];
  let latestSpecMtime = 0;
  for (const f of files) {
    if (!MD_TARGETS.some((m) => f.path.endsWith(m))) continue;
    try {
      const stat = fs2.statSync(f.path);
      if (stat.mtimeMs > latestSpecMtime) latestSpecMtime = stat.mtimeMs;
    } catch {
    }
  }
  if (latestSpecMtime === 0) return [];
  const out = [];
  const SKEW_MS = 6e4;
  for (const name of fs2.readdirSync(dir)) {
    if (!name.endsWith(".feature")) continue;
    const abs = path.join(dir, name);
    let featureMtime;
    try {
      featureMtime = fs2.statSync(abs).mtimeMs;
    } catch {
      continue;
    }
    if (featureMtime >= latestSpecMtime - SKEW_MS) continue;
    out.push({
      code: "impl-drift/test-result-stale",
      class: "uncovered",
      severity: "WARNING",
      referenced_in: `.specs/${slug}/${name}`,
      suggested_fix: `.feature last modified ${new Date(featureMtime).toISOString()} but spec MD last modified ${new Date(latestSpecMtime).toISOString()}. Re-run scenarios and/or update .feature to reflect spec changes. (CI gotcha: git clone resets mtimes \u2014 skip this finding on fresh checkouts.)`
    });
  }
  return out;
}
function findUnreachableTasks(files, repoRoot, slug) {
  const out = [];
  const progressFile = path.join(repoRoot, ".specs", slug, ".progress.json");
  if (!fs2.existsSync(progressFile)) return [];
  let currentPhase = 1;
  try {
    const progress = JSON.parse(fs2.readFileSync(progressFile, "utf8"));
    if (typeof progress.phase_index === "number") currentPhase = progress.phase_index;
  } catch {
    return [];
  }
  for (const f of files) {
    if (!/TASKS\.md$/i.test(f.path)) continue;
    const lines = f.body.split(/\r?\n/);
    let phaseColIdx = -1;
    let statusColIdx = -1;
    let idColIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].includes("|")) continue;
      const cells = lines[i].split("|").map((c) => c.trim().toLowerCase());
      const pIdx = cells.indexOf("phase");
      if (pIdx === -1) continue;
      phaseColIdx = pIdx;
      statusColIdx = cells.indexOf("status");
      idColIdx = cells.findIndex((c) => c === "id" || c === "task" || c === "title");
      for (let j2 = i + 2; j2 < lines.length; j2++) {
        const row = lines[j2];
        if (!row.includes("|") || /^\|[\s-:|]+\|/.test(row)) continue;
        if (row.trim() === "") break;
        const rowCells = row.split("|").map((c) => c.trim());
        const phaseCell = rowCells[phaseColIdx] ?? "";
        const statusCell = statusColIdx >= 0 ? (rowCells[statusColIdx] ?? "").toLowerCase() : "";
        const idCell = idColIdx >= 0 ? rowCells[idColIdx] ?? "" : `row-${j2}`;
        if (statusCell === "done") continue;
        const phaseMatch = phaseCell.match(PHASE_CELL_RE);
        if (!phaseMatch) continue;
        const taskPhase = parseInt(phaseMatch[1], 10);
        if (Number.isNaN(taskPhase) || taskPhase <= currentPhase) continue;
        out.push({
          code: "spec-only/unreachable-task",
          class: "spec-only",
          severity: "INFO",
          referenced_in: `${relPosix(repoRoot, f.path)}:${j2 + 1}`,
          suggested_fix: `Task "${idCell}" targets Phase ${taskPhase} but spec is at Phase ${currentPhase}. Advance phase_index, defer the task, or mark [OUT_OF_SCOPE].`
        });
      }
      break;
    }
  }
  return out;
}
function findJsonShapeDrift(files, repoRoot, slug) {
  const dir = path.join(repoRoot, ".specs", slug);
  if (!fs2.existsSync(dir)) return [];
  const declared = /* @__PURE__ */ new Set();
  for (const f of files) {
    if (!/SCHEMA\.md$/i.test(f.path)) continue;
    const sections = f.body.split(/^##\s+/m);
    for (const sec of sections) {
      if (!/Schema|Keys|Shape|Fields|Structure/i.test(sec.split(/\n/)[0] ?? "")) continue;
      let m;
      SCHEMA_KEY_BULLET_RE.lastIndex = 0;
      while ((m = SCHEMA_KEY_BULLET_RE.exec(sec)) !== null) declared.add(m[1]);
    }
  }
  if (declared.size === 0) return [];
  const out = [];
  for (const name of fs2.readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    if (name === ".progress.json") continue;
    const abs = path.join(dir, name);
    let observed;
    try {
      const parsed = JSON.parse(fs2.readFileSync(abs, "utf8"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
      observed = new Set(Object.keys(parsed));
    } catch {
      continue;
    }
    const missing = [];
    const extra = [];
    for (const k2 of declared) if (!observed.has(k2)) missing.push(k2);
    for (const k2 of observed) if (!declared.has(k2)) extra.push(k2);
    if (missing.length === 0 && extra.length === 0) continue;
    out.push({
      code: "schema-drift/json-shape-drift",
      class: "schema-drift",
      severity: "WARNING",
      referenced_in: `.specs/${slug}/${name}`,
      suggested_fix: `JSON ${name} top-level keys diverge from SCHEMA.md. Missing: [${missing.join(", ") || "(none)"}]. Extra: [${extra.join(", ") || "(none)"}].`
    });
  }
  return out;
}
function findMissingCrossRef(filesBySlug, allSlugs) {
  const out = [];
  const AUTO_GENERATED_FILES = [
    "OWNERSHIP_RECOMMENDATION.md",
    "DECISION_RECOMMENDATION.md",
    "CHANGELOG.md",
    // Keep-a-Changelog format mentions other items in prose
    "validation-report.md"
    // specs-validator output
  ];
  for (const slug of allSlugs) {
    const ownFiles = (filesBySlug.get(slug) ?? []).filter(
      (f) => !AUTO_GENERATED_FILES.some((n7) => f.path.endsWith(n7))
    );
    const stripInlineCode = (body) => stripFencedBlocks(body).replace(/`[^`]+`/g, "");
    const ownBodies = ownFiles.map((f) => stripInlineCode(f.body)).join("\n");
    for (const otherSlug of allSlugs) {
      if (otherSlug === slug) continue;
      const mentionRe = new RegExp(`\\b${escapeRegex(otherSlug)}\\b`, "g");
      const mentionCount = (ownBodies.match(mentionRe) ?? []).length;
      if (mentionCount < 2) continue;
      const linkRe = new RegExp(
        `\\]\\([^)]*\\.specs[/\\\\]${escapeRegex(otherSlug)}[/\\\\][^)]*\\)`,
        "g"
      );
      if (linkRe.test(ownBodies)) continue;
      let where = "";
      mentionRe.lastIndex = 0;
      for (const f of ownFiles) {
        const idx = f.body.search(mentionRe);
        if (idx === -1) continue;
        const lineNum = f.body.slice(0, idx).split(/\r?\n/).length;
        where = `${relPosix(".", f.path)}:${lineNum}`;
        break;
      }
      out.push({
        code: "cross-spec/missing-cross-ref",
        class: "concept-overlap",
        severity: "INFO",
        spec_a: `.specs/${slug}`,
        spec_b: `.specs/${otherSlug}`,
        referenced_in: where,
        suggested_fix: `Spec mentions "${otherSlug}" but has no markdown link. Add [...](../${otherSlug}/FR.md) to make the cross-ref explicit.`
      });
    }
  }
  return out;
}
function collectNfrBudgets(filesBySlug) {
  const out = /* @__PURE__ */ new Map();
  for (const [slug, files] of filesBySlug) {
    const budgets = /* @__PURE__ */ new Map();
    for (const f of files) {
      const body = stripFencedBlocks(f.body);
      let m;
      NFR_BUDGET_RE.lastIndex = 0;
      while ((m = NFR_BUDGET_RE.exec(body)) !== null) {
        let key = m[1].toLowerCase().replace(/[-\s]+/g, "-");
        if (key === "response-time") key = "latency";
        const rawValue = parseFloat(m[2]);
        const rawUnit = m[3].toLowerCase();
        const isTimeUnit = rawUnit === "s" || rawUnit === "ms";
        const normValue = isTimeUnit && rawUnit === "s" ? rawValue * 1e3 : rawValue;
        const normUnit = isTimeUnit ? "ms" : rawUnit;
        budgets.set(`${key}|${normUnit}`, {
          key,
          value: normValue,
          unit: normUnit,
          context: f.path
        });
      }
    }
    out.set(slug, budgets);
  }
  return out;
}
function findContradictoryNFR(filesBySlug) {
  const budgets = collectNfrBudgets(filesBySlug);
  const out = [];
  const slugs = [...budgets.keys()];
  for (let i = 0; i < slugs.length; i++) {
    for (let j2 = i + 1; j2 < slugs.length; j2++) {
      const a = budgets.get(slugs[i]);
      const b = budgets.get(slugs[j2]);
      for (const key of a.keys()) {
        if (!b.has(key)) continue;
        const ba = a.get(key);
        const bb = b.get(key);
        const diff = Math.abs(ba.value - bb.value);
        const max = Math.max(Math.abs(ba.value), Math.abs(bb.value), 1);
        if (diff / max <= 0.1) continue;
        out.push({
          code: "cross-spec/contradictory-nfr",
          class: "contradiction",
          severity: "CRITICAL",
          spec_a: `.specs/${slugs[i]} (${ba.key} = ${ba.value}${ba.unit})`,
          spec_b: `.specs/${slugs[j2]} (${bb.key} = ${bb.value}${bb.unit})`,
          suggested_fix: `NFR "${ba.key}" contradicts: ${ba.value}${ba.unit} vs ${bb.value}${bb.unit}. Reconcile budgets or document why they differ.`
        });
      }
    }
  }
  return out;
}
function collectTsInterfaces(filesBySlug) {
  const out = /* @__PURE__ */ new Map();
  for (const [slug, files] of filesBySlug) {
    const ifaces = /* @__PURE__ */ new Map();
    for (const f of files) {
      if (!/DESIGN\.md|SCHEMA\.md/i.test(f.path)) continue;
      let m;
      TS_INTERFACE_RE.lastIndex = 0;
      while ((m = TS_INTERFACE_RE.exec(f.body)) !== null) {
        const name = m[1];
        const fields = /* @__PURE__ */ new Set();
        let fm;
        TS_FIELD_RE.lastIndex = 0;
        while ((fm = TS_FIELD_RE.exec(m[2])) !== null) fields.add(fm[1]);
        if (fields.size > 0) ifaces.set(name, fields);
      }
    }
    out.set(slug, ifaces);
  }
  return out;
}
function findSchemaMismatch(filesBySlug) {
  const ifacesBySlug = collectTsInterfaces(filesBySlug);
  const out = [];
  const slugs = [...ifacesBySlug.keys()];
  for (let i = 0; i < slugs.length; i++) {
    for (let j2 = i + 1; j2 < slugs.length; j2++) {
      const a = ifacesBySlug.get(slugs[i]);
      const b = ifacesBySlug.get(slugs[j2]);
      for (const name of a.keys()) {
        if (!b.has(name)) continue;
        const fieldsA = a.get(name);
        const fieldsB = b.get(name);
        const diff = [];
        for (const f of fieldsA) if (!fieldsB.has(f)) diff.push(`A:${f}`);
        for (const f of fieldsB) if (!fieldsA.has(f)) diff.push(`B:${f}`);
        if (diff.length === 0) continue;
        out.push({
          code: "cross-spec/schema-mismatch",
          class: "schema-drift",
          severity: "CRITICAL",
          spec_a: `.specs/${slugs[i]} (${name}: ${[...fieldsA].sort().join(", ")})`,
          spec_b: `.specs/${slugs[j2]} (${name}: ${[...fieldsB].sort().join(", ")})`,
          suggested_fix: `Type "${name}" differs across specs. Symmetric diff: [${diff.join(", ")}]. Unify the schema or rename one type.`
        });
      }
    }
  }
  return out;
}
function findLockedDecisionDrift(files, repoRoot) {
  const out = [];
  for (const f of files) {
    if (!/DECISIONS\.md|DESIGN\.md/i.test(f.path)) continue;
    const sections = f.body.split(/^#{2,3}\s+/m);
    for (const section of sections) {
      const firstLine = section.split(/\r?\n/)[0] ?? "";
      const decisionMatch = firstLine.match(/^Decision[:\s]+([\w-]+)/);
      if (!decisionMatch) continue;
      const decisionId = decisionMatch[1];
      const block = section.slice(firstLine.length);
      if (!DECISION_STATUS_LOCKED_RE.test(block)) continue;
      const chosenMatch = block.match(DECISION_CHOSEN_RE);
      const implMatch = block.match(DECISION_IMPL_PATH_RE);
      if (!chosenMatch || !implMatch) continue;
      const chosen = chosenMatch[1].trim().replace(/@[\w.~^>=<*-]+$/, "");
      const implPath = implMatch[1].trim();
      const abs = path.isAbsolute(implPath) ? implPath : path.resolve(repoRoot, implPath);
      if (!fs2.existsSync(abs) || !fs2.statSync(abs).isFile()) continue;
      const code = fs2.readFileSync(abs, "utf8");
      const imports = [];
      let im;
      TS_FILE_IMPORT_RE.lastIndex = 0;
      while ((im = TS_FILE_IMPORT_RE.exec(code)) !== null) imports.push(im[1]);
      const hasChosen = imports.some(
        (i) => i === chosen || i.startsWith(`${chosen}/`) || i.endsWith(`/${chosen}`)
      );
      if (hasChosen) continue;
      out.push({
        code: "cross-spec/decision-locked-but-reality-diverges",
        class: "architectural-decision-vs-reality",
        severity: "CRITICAL",
        referenced_in: `${relPosix(repoRoot, f.path)} (decision ${decisionId})`,
        expected_path: implPath,
        suggested_fix: `LOCKED decision "${decisionId}" picks "${chosen}" but ${implPath} imports [${imports.slice(0, 3).join(", ")}\u2026]. Update the implementation, change Status \u2192 SUPERSEDED, or update DECISIONS.md.`
      });
    }
  }
  return out;
}
function findOrphanTasks(files, repoRoot) {
  const out = [];
  for (const f of files) {
    if (!/TASKS\.md$/i.test(f.path)) continue;
    const blocks = f.body.split(/^### /m).slice(1);
    let lineCursor = 1;
    for (const block of blocks) {
      const firstLine = block.split(/\r?\n/)[0];
      const blockLines = block.split(/\r?\n/).length;
      const hasFrRef = /\bFR-\d+\b/.test(block) || /@feature\d+\b/.test(block);
      if (!hasFrRef) {
        out.push({
          code: "spec-only/orphan-task",
          class: "spec-only",
          severity: "WARNING",
          referenced_in: `${relPosix(repoRoot, f.path)}:${lineCursor + 1}`,
          suggested_fix: `Task "${firstLine.slice(0, 60)}" cites no FR \u2014 add an FR-N back-reference or mark as infra-only.`
        });
      }
      lineCursor += blockLines - 1;
    }
  }
  return out;
}
function findMissingFrSections(files, repoRoot) {
  const defs = collectFrDefinitions(files);
  const cited = /* @__PURE__ */ new Set();
  for (const f of files) {
    const body = stripFencedBlocks(f.body);
    let m;
    FR_REF_RE.lastIndex = 0;
    while ((m = FR_REF_RE.exec(body)) !== null) cited.add(m[0]);
  }
  const out = [];
  for (const fr of cited) {
    if (defs.has(fr)) continue;
    let where = "";
    for (const f of files) {
      const idx = f.body.search(new RegExp(`\\b${fr}\\b`));
      if (idx === -1) continue;
      const lineNum = f.body.slice(0, idx).split(/\r?\n/).length;
      where = `${relPosix(repoRoot, f.path)}:${lineNum}`;
      break;
    }
    out.push({
      code: "spec-only/missing-fr-section",
      class: "spec-only",
      severity: "WARNING",
      referenced_in: where,
      suggested_fix: `${fr} is cited but no \`## ${fr}:\` heading exists \u2014 add the FR definition or remove the citation.`
    });
  }
  return out;
}
function findMissingFeatureHeadings(repoRoot, slug) {
  const dir = path.join(repoRoot, ".specs", slug);
  if (!fs2.existsSync(dir)) return [];
  const out = [];
  for (const name of fs2.readdirSync(dir)) {
    if (!name.endsWith(".feature")) continue;
    const abs = path.join(dir, name);
    const body = fs2.readFileSync(abs, "utf8");
    if (/^Feature:\s+\S/m.test(body)) continue;
    out.push({
      code: "schema-drift/missing-feature-heading",
      class: "schema-drift",
      severity: "CRITICAL",
      referenced_in: `.specs/${slug}/${name}`,
      suggested_fix: "Every .feature file must start with `Feature: <name>` \u2014 Gherkin parser rejects the file otherwise."
    });
  }
  return out;
}
function collectFrDefinitions(files) {
  const out = /* @__PURE__ */ new Map();
  for (const f of files) {
    let m;
    FR_HEADING_RE.lastIndex = 0;
    while ((m = FR_HEADING_RE.exec(f.body)) !== null) {
      if (!out.has(m[1])) out.set(m[1], f.path);
    }
  }
  return out;
}
function findWithinSpecDuplicateFRs(files, repoRoot, slug) {
  const seen = /* @__PURE__ */ new Map();
  const out = [];
  for (const f of files) {
    let m;
    FR_HEADING_RE.lastIndex = 0;
    while ((m = FR_HEADING_RE.exec(f.body)) !== null) {
      const fr = m[1];
      if (seen.has(fr)) {
        out.push({
          code: "spec-only/duplicate-fr-id",
          class: "contradiction",
          severity: "CRITICAL",
          referenced_in: `${relPosix(repoRoot, f.path)} (${fr})`,
          suggested_fix: `Two \`## ${fr}\` headings within the same spec \u2014 rename the second one or merge their content. First at ${path.basename(seen.get(fr))}, duplicate at ${path.basename(f.path)}.`
        });
        continue;
      }
      seen.set(fr, f.path);
    }
  }
  return out;
}
function collectFeatureTags(repoRoot, slug) {
  const dir = path.join(repoRoot, ".specs", slug);
  const out = /* @__PURE__ */ new Set();
  if (!fs2.existsSync(dir)) return out;
  for (const name of fs2.readdirSync(dir)) {
    if (!name.endsWith(".feature")) continue;
    const body = fs2.readFileSync(path.join(dir, name), "utf8");
    let m;
    FEATURE_TAG_RE.lastIndex = 0;
    while ((m = FEATURE_TAG_RE.exec(body)) !== null) {
      out.add(`FR-${parseInt(m[1], 10)}`);
    }
  }
  return out;
}
function findOrphanFRs(files, featureTags, repoRoot) {
  const defs = collectFrDefinitions(files);
  const out = [];
  for (const [fr, definedIn] of defs.entries()) {
    const refRe = new RegExp(`\\b${fr}\\b`, "g");
    const headingPrefixRe = /^#{1,6}\s/;
    let externalRefs = 0;
    for (const f of files) {
      for (const line of f.body.split(/\r?\n/)) {
        if (headingPrefixRe.test(line)) continue;
        refRe.lastIndex = 0;
        const matches = line.match(refRe);
        if (matches) externalRefs += matches.length;
      }
    }
    if (externalRefs >= 1) continue;
    if (featureTags.has(fr)) continue;
    out.push({
      code: "spec-only/orphan-FR",
      class: "spec-only",
      severity: "WARNING",
      referenced_in: relPosix(repoRoot, definedIn),
      suggested_fix: `Add an AC, Scenario, or Task that references ${fr} \u2014 or mark the FR as OUT_OF_SCOPE.`
    });
  }
  return out;
}
function findUncoveredACs(files, featureTags, repoRoot) {
  const out = [];
  for (const f of files) {
    let m;
    AC_HEADING_RE.lastIndex = 0;
    let acCount = 0;
    while ((m = AC_HEADING_RE.exec(f.body)) !== null) acCount++;
    if (acCount === 0) continue;
    if (featureTags.size > 0) continue;
    out.push({
      code: "spec-only/uncovered-AC",
      class: "spec-only",
      severity: "WARNING",
      referenced_in: relPosix(repoRoot, f.path),
      suggested_fix: `${acCount} AC heading(s) in this spec have no matching @featureN scenario in the spec's .feature files.`
    });
  }
  return out;
}
function findDuplicateFrIds(defsBySlug) {
  const out = [];
  const slugs = [...defsBySlug.keys()];
  for (let i = 0; i < slugs.length; i++) {
    for (let j2 = i + 1; j2 < slugs.length; j2++) {
      const a = defsBySlug.get(slugs[i]);
      const b = defsBySlug.get(slugs[j2]);
      for (const fr of a.keys()) {
        if (!b.has(fr)) continue;
        out.push({
          code: "cross-spec/duplicate-fr-id",
          class: "contradiction",
          severity: "CRITICAL",
          spec_a: `.specs/${slugs[i]} (${fr} at ${path.basename(a.get(fr))})`,
          spec_b: `.specs/${slugs[j2]} (${fr} at ${path.basename(b.get(fr))})`,
          suggested_fix: `Rename one definition \u2014 FR ids are unique per repo. Each spec should own a disjoint FR namespace.`
        });
      }
    }
  }
  return out;
}
function findContradictoryFRs(defsBySlug, filesBySlug) {
  const out = [];
  const slugs = [...defsBySlug.keys()];
  for (let i = 0; i < slugs.length; i++) {
    for (let j2 = i + 1; j2 < slugs.length; j2++) {
      const a = defsBySlug.get(slugs[i]);
      const b = defsBySlug.get(slugs[j2]);
      for (const fr of a.keys()) {
        if (!b.has(fr)) continue;
        const bodyA = extractFrBody(filesBySlug.get(slugs[i]), fr);
        const bodyB = extractFrBody(filesBySlug.get(slugs[j2]), fr);
        if (!bodyA || !bodyB) continue;
        if (cheapTextOverlap(bodyA, bodyB) >= 0.55) continue;
        out.push({
          code: "cross-spec/contradictory-fr",
          class: "contradiction",
          severity: "CRITICAL",
          spec_a: `.specs/${slugs[i]} (${fr})`,
          spec_b: `.specs/${slugs[j2]} (${fr})`,
          suggested_fix: `${fr} appears in both specs with substantially different body text. Pick one canonical definition.`
        });
      }
    }
  }
  return out;
}
function extractFrBody(files, fr) {
  for (const f of files) {
    const idx = f.body.search(new RegExp(`^#{2,3}\\s+(?:Requirement:\\s+)?${fr}\\b`, "m"));
    if (idx === -1) continue;
    const slice = f.body.slice(idx, idx + 400);
    return slice.replace(/\s+/g, " ").trim();
  }
  return null;
}
function cheapTextOverlap(a, b) {
  const tokenize = (s) => new Set(s.toLowerCase().split(/\W+/).filter((t) => t.length >= 3));
  const sa = tokenize(a);
  const sb = tokenize(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let shared = 0;
  for (const t of sa) if (sb.has(t)) shared++;
  return shared / Math.min(sa.size, sb.size);
}
function findTestsWithoutFR(repoRoot, slug, allFrDefs) {
  const tags = collectFeatureTags(repoRoot, slug);
  const out = [];
  for (const fr of tags) {
    if (allFrDefs.has(fr)) continue;
    out.push({
      code: "impl-drift/test-without-fr",
      class: "uncovered",
      severity: "WARNING",
      referenced_in: `.specs/${slug}/*.feature (@${fr.toLowerCase().replace("-", "")})`,
      suggested_fix: `Scenario tagged @${fr.toLowerCase().replace("-", "")} but no ${fr} heading exists in any spec. Add the FR or remove the tag.`
    });
  }
  return out;
}
function findConceptOverlap(bySlug) {
  const out = [];
  const conceptsBySlug = /* @__PURE__ */ new Map();
  for (const [slug, files] of bySlug.entries()) {
    const concepts = /* @__PURE__ */ new Set();
    for (const f of files) {
      let m;
      CONCEPT_NOUN_RE.lastIndex = 0;
      while ((m = CONCEPT_NOUN_RE.exec(f.body)) !== null) {
        if (CONCEPT_NOUN_STOPLIST.has(m[0])) continue;
        concepts.add(m[0]);
      }
    }
    conceptsBySlug.set(slug, concepts);
  }
  const slugs = [...conceptsBySlug.keys()];
  for (let i = 0; i < slugs.length; i++) {
    for (let j2 = i + 1; j2 < slugs.length; j2++) {
      const a = conceptsBySlug.get(slugs[i]);
      const b = conceptsBySlug.get(slugs[j2]);
      const shared = [];
      for (const c of a) if (b.has(c)) shared.push(c);
      if (shared.length < CONCEPT_OVERLAP_MIN_SHARED) continue;
      out.push({
        code: "cross-spec/concept-overlap",
        class: "concept-overlap",
        severity: "INFO",
        spec_a: `.specs/${slugs[i]}`,
        spec_b: `.specs/${slugs[j2]}`,
        suggested_fix: `Shared concepts (${shared.slice(0, 5).join(", ")}\u2026) \u2014 add an explicit cross-ref or mark as intentional separation.`
      });
    }
  }
  return out;
}
function reconcileLight(opts) {
  const allSlugs = opts.slugs?.length ? opts.slugs : listSpecs(opts.repoRoot);
  const filesBySlug = /* @__PURE__ */ new Map();
  for (const slug of allSlugs) filesBySlug.set(slug, readSpecMd(opts.repoRoot, slug));
  const idsBySlug = /* @__PURE__ */ new Map();
  const defsBySlug = /* @__PURE__ */ new Map();
  const allFrDefs = /* @__PURE__ */ new Set();
  for (const [slug, files] of filesBySlug.entries()) {
    idsBySlug.set(slug, collectIdentifiers(files));
    const defs = collectFrDefinitions(files);
    defsBySlug.set(slug, defs);
    for (const fr of defs.keys()) allFrDefs.add(fr);
  }
  const driftFindings = findRuntimeIdentifierDrift(idsBySlug);
  const overlapFindings = opts.conceptOverlapEnabled ? findConceptOverlap(filesBySlug) : [];
  const sharedFrNs = opts.crossSpecFrNamespace === "shared";
  const duplicateFrFindings = sharedFrNs ? findDuplicateFrIds(defsBySlug) : [];
  const contradictoryFrFindings = sharedFrNs ? findContradictoryFRs(defsBySlug, filesBySlug) : [];
  const urlDriftFindings = findUrlShapeDrift(filesBySlug);
  const cliDriftFindings = findCliFlagDrift(filesBySlug);
  const enumDivergenceFindings = findEnumDivergence(filesBySlug);
  const ownershipStoplist = opts.ownershipStoplist ?? DEFAULT_OWNERSHIP_STOPLIST;
  const moduleOwnershipFindings = findModuleOwnershipConflict(filesBySlug, ownershipStoplist, opts.repoRoot);
  const missingCrossRefFindings = findMissingCrossRef(filesBySlug, allSlugs);
  const contradictoryNfrFindings = opts.contradictoryNfrEnabled ? findContradictoryNFR(filesBySlug) : [];
  const schemaMismatchFindings = findSchemaMismatch(filesBySlug);
  const results = [];
  for (const slug of allSlugs) {
    const files = filesBySlug.get(slug);
    const findings = [];
    findings.push(...findMissingFileReferences(files, opts.repoRoot, opts.implRoots));
    const featureTags = collectFeatureTags(opts.repoRoot, slug);
    findings.push(...findOrphanFRs(files, featureTags, opts.repoRoot));
    findings.push(...findUncoveredACs(files, featureTags, opts.repoRoot));
    findings.push(...findTestsWithoutFR(opts.repoRoot, slug, allFrDefs));
    findings.push(...findOrphanTasks(files, opts.repoRoot));
    findings.push(...findMissingFrSections(files, opts.repoRoot));
    findings.push(...findMissingFeatureHeadings(opts.repoRoot, slug));
    findings.push(...findDeadLinks(files, opts.repoRoot));
    findings.push(...findMissingAcceptance(files, opts.repoRoot));
    findings.push(...findInvalidFrontmatter(opts.repoRoot, slug));
    findings.push(...findMissingSymbols(files, opts.repoRoot));
    findings.push(...findWithinSpecDuplicateFRs(files, opts.repoRoot, slug));
    findings.push(...findMissingTestPerFR(files, featureTags, opts.repoRoot, slug));
    findings.push(...findOrphanACs(files, opts.repoRoot));
    findings.push(...findStaleFeatureFiles(opts.repoRoot, slug, files));
    findings.push(...findUnreachableTasks(files, opts.repoRoot, slug));
    findings.push(...findJsonShapeDrift(files, opts.repoRoot, slug));
    findings.push(...findLockedDecisionDrift(files, opts.repoRoot));
    const slugForward = `.specs/${slug}`;
    const slugBackward = `.specs\\${slug}`;
    for (const f of [
      ...driftFindings,
      ...overlapFindings,
      ...duplicateFrFindings,
      ...contradictoryFrFindings,
      ...urlDriftFindings,
      ...cliDriftFindings,
      ...enumDivergenceFindings,
      ...moduleOwnershipFindings,
      ...missingCrossRefFindings,
      ...contradictoryNfrFindings,
      ...schemaMismatchFindings
    ]) {
      const a = f.spec_a ?? "";
      const b = f.spec_b ?? "";
      if (a.includes(slugForward) || a.includes(slugBackward) || b.includes(slugForward) || b.includes(slugBackward)) {
        findings.push(f);
      }
    }
    results.push({
      generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      mode: "light",
      specSlug: slug,
      findings
    });
  }
  return results;
}

// tools/spec-backlog/classifier.ts
import path2 from "node:path";
var GLOB_IGNORE = ["node_modules/**", ".git/**", "dist/**", ".next/**", "build/**"];
var POST_EXCLUDE_RE = /node_modules|\.git|\.next|dist|build|\.cache/;
function countBasenameMatches(repoRoot, target) {
  if (!repoRoot || !target) return -1;
  const basename = path2.basename(target);
  if (!basename) return -1;
  try {
    const matches = ts(`**/${basename}`, {
      cwd: repoRoot,
      absolute: true,
      ignore: GLOB_IGNORE
    }).filter((m) => !path2.relative(repoRoot, m).match(POST_EXCLUDE_RE));
    return matches.length;
  } catch {
    return -1;
  }
}
function classify(slug, finding, repoRoot) {
  const rawCode = finding.code;
  if (typeof rawCode !== "string" || rawCode.trim() === "") {
    return {
      verdict: "BACKLOG",
      entry: {
        slug,
        code: typeof rawCode === "string" ? rawCode : String(rawCode ?? "null-or-invalid"),
        category: "unrecognised",
        evidence: { file: finding.referenced_in },
        suggested_resolver: "human",
        difficulty: "easy"
      }
    };
  }
  const code = rawCode.trim();
  if (code === "cross-spec/concept-overlap") {
    return {
      verdict: "NOISE",
      noiseReason: "Documentation-quality signal. Action requires editorial judgment per spec pair."
    };
  }
  if (code === "cross-spec/missing-cross-ref") {
    const stripSpecsPrefix = (s) => s ? s.replace(/^\.?[\/\\]?\.specs[\/\\]/, "") : s;
    return {
      verdict: "BACKLOG",
      entry: {
        slug,
        code,
        category: "missing-cross-ref",
        evidence: {
          file: finding.referenced_in,
          spec_a: stripSpecsPrefix(finding.spec_a),
          spec_b: stripSpecsPrefix(finding.spec_b)
        },
        suggested_resolver: "cross-ref-linker",
        difficulty: "easy"
      }
    };
  }
  if (code === "impl-drift/dead-link") {
    const target = finding.expected_path ?? "";
    const isObviousTypo = /\.MD$|\.JSON$/.test(target) || /\.md\.md$/.test(target);
    if (isObviousTypo) {
      return { verdict: "AUTO_FIX", autoFixRule: "fix-case-extension" };
    }
    if (target && !target.includes("/") && !target.includes("\\")) {
      return {
        verdict: "BACKLOG",
        entry: {
          slug,
          code,
          category: "missing-spec-file",
          evidence: {
            file: finding.referenced_in,
            target,
            occurrence_count: 1,
            label_samples: []
          },
          suggested_resolver: "ac-author",
          difficulty: target === "ACCEPTANCE_CRITERIA.md" ? "medium" : "hard"
        }
      };
    }
    const matchCount = countBasenameMatches(repoRoot, target);
    if (matchCount === 0) {
      return {
        verdict: "NOISE",
        noiseReason: "Markdown link target does not exist anywhere in repo \u2014 no typo candidate to repair. Fix by creating the file, marking OUT_OF_SCOPE, or removing the link."
      };
    }
    if (matchCount >= 2) {
      return {
        verdict: "BACKLOG",
        entry: {
          slug,
          code,
          category: "ambiguous-link",
          evidence: { file: finding.referenced_in, target, occurrence_count: matchCount },
          suggested_resolver: "human",
          difficulty: "medium"
        }
      };
    }
    return {
      verdict: "BACKLOG",
      entry: {
        slug,
        code,
        category: "dead-link-typo",
        evidence: { file: finding.referenced_in, target },
        suggested_resolver: "link-fixer",
        difficulty: "easy"
      }
    };
  }
  if (code === "impl-drift/missing-test") {
    return {
      verdict: "BACKLOG",
      entry: {
        slug,
        code,
        category: "missing-test",
        evidence: {
          file: finding.referenced_in
        },
        suggested_resolver: "scenario-writer",
        difficulty: "medium"
      }
    };
  }
  if (code === "cross-spec/module-ownership-conflict") {
    return {
      verdict: "BACKLOG",
      entry: {
        slug,
        code,
        category: "ownership-conflict",
        evidence: {
          spec_a: finding.spec_a,
          spec_b: finding.spec_b
        },
        suggested_resolver: "owner-picker",
        difficulty: "hard"
      }
    };
  }
  if (code === "cross-spec/contradictory-nfr") {
    return {
      verdict: "BACKLOG",
      entry: {
        slug,
        code,
        category: "contradictory-nfr",
        evidence: { spec_a: finding.spec_a, spec_b: finding.spec_b },
        suggested_resolver: "decision-arbiter",
        difficulty: "hard"
      }
    };
  }
  if (code === "spec-only/missing-fr-section") {
    return {
      verdict: "BACKLOG",
      entry: {
        slug,
        code,
        category: "missing-fr-section",
        evidence: { file: finding.referenced_in },
        suggested_resolver: "fr-author",
        difficulty: "medium"
      }
    };
  }
  if (code === "impl-drift/deprecated-ref") {
    return {
      verdict: "BACKLOG",
      entry: {
        slug,
        code,
        category: "deprecated-ref",
        evidence: {
          file: finding.referenced_in,
          referenced_in: finding.referenced_in,
          target_path: finding.expected_path,
          target: finding.expected_path,
          // The detector emits version via a non-standard channel — pass
          // through whatever the finding carries. resolver bails with
          // missing-evidence if version is absent.
          version: finding.version
        },
        suggested_resolver: "wrap-deprecated-ref",
        difficulty: "easy"
      }
    };
  }
  if (code === "impl-drift/missing-file") {
    const target = finding.expected_path ?? "";
    if (/ACCEPTANCE_CRITERIA\.md|^AC\.md/.test(target)) {
      return {
        verdict: "BACKLOG",
        entry: {
          slug,
          code,
          category: "missing-spec-file",
          evidence: { file: finding.referenced_in, target },
          suggested_resolver: "ac-author",
          difficulty: "medium"
        }
      };
    }
    return {
      verdict: "NOISE",
      noiseReason: "Spec references a path in backticks that does not exist on disk. No mechanical resolver applies \u2014 fix by adding the impl, marking OUT_OF_SCOPE, or removing the reference."
    };
  }
  if (code === "spec-only/unreachable-task" || code === "impl-drift/test-result-stale") {
    return {
      verdict: "NOISE",
      noiseReason: code === "spec-only/unreachable-task" ? "Tasks targeting future phases ARE intentionally flagged per design \u2014 advance phase_index manually." : "Git clone resets mtimes \u2014 false positive in CI / fresh checkouts."
    };
  }
  if (code === "spec-only/orphan-task") {
    return {
      verdict: "BACKLOG",
      entry: {
        slug,
        code,
        category: "missing-fr-section",
        evidence: { file: finding.referenced_in },
        suggested_resolver: "fr-author",
        difficulty: "medium"
      }
    };
  }
  if (code === "spec-only/uncovered-AC" || code === "spec-only/orphan-FR" || code === "impl-drift/test-without-fr") {
    return {
      verdict: "BACKLOG",
      entry: {
        slug,
        code,
        category: "missing-test",
        evidence: { file: finding.referenced_in },
        suggested_resolver: "scenario-writer",
        difficulty: "medium"
      }
    };
  }
  if (code === "spec-only/duplicate-fr-id") {
    return {
      verdict: "BACKLOG",
      entry: {
        slug,
        code,
        category: "unrecognised",
        evidence: { file: finding.referenced_in },
        suggested_resolver: "human",
        difficulty: "hard"
      }
    };
  }
  if (code === "cross-spec/runtime-identifier-drift" || code === "cross-spec/url-shape-drift" || code === "cross-spec/cli-flag-drift" || code === "cross-spec/enum-divergence" || code === "cross-spec/schema-mismatch") {
    return {
      verdict: "BACKLOG",
      entry: {
        slug,
        code,
        category: "contradictory-nfr",
        evidence: { spec_a: finding.spec_a, spec_b: finding.spec_b },
        suggested_resolver: "decision-arbiter",
        difficulty: "hard"
      }
    };
  }
  if (code === "cross-spec/decision-locked-but-reality-diverges") {
    return {
      verdict: "BACKLOG",
      entry: {
        slug,
        code,
        category: "contradictory-nfr",
        evidence: { file: finding.referenced_in, target: finding.expected_path },
        suggested_resolver: "decision-arbiter",
        difficulty: "hard"
      }
    };
  }
  if (code === "impl-drift/missing-symbol") {
    return {
      verdict: "BACKLOG",
      entry: {
        slug,
        code,
        category: "dead-link-typo",
        evidence: { file: finding.referenced_in, target: finding.expected_path },
        suggested_resolver: "link-fixer",
        difficulty: "medium"
      }
    };
  }
  if (code === "spec-only/missing-acceptance") {
    return {
      verdict: "BACKLOG",
      entry: {
        slug,
        code,
        category: "missing-spec-file",
        evidence: { file: finding.referenced_in, target: "ACCEPTANCE_CRITERIA.md" },
        suggested_resolver: "ac-author",
        difficulty: "medium"
      }
    };
  }
  if (code === "spec-only/orphan-AC") {
    return {
      verdict: "BACKLOG",
      entry: {
        slug,
        code,
        category: "missing-fr-section",
        evidence: { file: finding.referenced_in },
        suggested_resolver: "fr-author",
        difficulty: "medium"
      }
    };
  }
  if (code === "schema-drift/missing-feature-heading") {
    return {
      verdict: "AUTO_FIX",
      autoFixRule: "add-feature-heading-line"
    };
  }
  if (code === "schema-drift/invalid-frontmatter") {
    return {
      verdict: "NOISE",
      noiseReason: "Gherkin parsers accept missing trailing newline / language directive in practice \u2014 pedantic."
    };
  }
  if (code === "cross-spec/contradictory-fr") {
    return {
      verdict: "BACKLOG",
      entry: {
        slug,
        code,
        category: "unrecognised",
        evidence: { spec_a: finding.spec_a, spec_b: finding.spec_b },
        suggested_resolver: "human",
        difficulty: "hard"
      }
    };
  }
  return {
    verdict: "BACKLOG",
    entry: {
      slug,
      code,
      category: "unrecognised",
      evidence: {
        file: finding.referenced_in,
        spec_a: finding.spec_a,
        spec_b: finding.spec_b
      },
      suggested_resolver: "human",
      difficulty: "medium"
    }
  };
}

// tools/spec-backlog/writer.ts
import { createHash } from "node:crypto";
import fs3 from "node:fs";
import path3 from "node:path";
function todayUtc() {
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
}
function backlogDir(repoRoot) {
  return path3.join(repoRoot, ".dev-pomogator", ".specs-backlog");
}
function backlogFile(repoRoot, day = todayUtc()) {
  return path3.join(backlogDir(repoRoot), `${day}.jsonl`);
}
function entryId(slug, code, evidence) {
  const key = [
    evidence.file ?? "",
    evidence.line ?? "",
    evidence.target ?? "",
    evidence.spec_a ?? "",
    evidence.spec_b ?? ""
  ].join("|");
  return createHash("sha256").update(`${slug}|${code}|${key}`).digest("hex").slice(0, 12);
}
function appendEntry(repoRoot, entry) {
  const full = {
    id: entry.id ?? entryId(entry.slug, entry.code, entry.evidence),
    ts: entry.ts ?? (/* @__PURE__ */ new Date()).toISOString(),
    slug: entry.slug,
    code: entry.code,
    category: entry.category,
    evidence: entry.evidence,
    suggested_resolver: entry.suggested_resolver,
    difficulty: entry.difficulty,
    status: entry.status ?? "open",
    resolution: entry.resolution
  };
  const file = backlogFile(repoRoot);
  fs3.mkdirSync(path3.dirname(file), { recursive: true });
  fs3.appendFileSync(file, JSON.stringify(full) + "\n");
  return full;
}
function readAll(repoRoot) {
  const dir = backlogDir(repoRoot);
  if (!fs3.existsSync(dir)) return [];
  const files = fs3.readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort();
  const byId = /* @__PURE__ */ new Map();
  for (const f of files) {
    const lines = fs3.readFileSync(path3.join(dir, f), "utf8").split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed.id) byId.set(parsed.id, parsed);
      } catch {
      }
    }
  }
  return [...byId.values()];
}
function readAllIds(repoRoot) {
  return new Set(readAll(repoRoot).map((e) => e.id));
}

// tools/spec-backlog/auto-ingest-hook.ts
var MARKER_DIR = ".dev-pomogator/.specs-backlog";
async function main() {
  const repoRoot = process.cwd();
  const sessionId = process.env.CLAUDE_SESSION_ID || process.env.TEST_STATUSLINE_SESSION || "unknown";
  const markerPath = path4.join(
    repoRoot,
    MARKER_DIR,
    `.auto-ingest.${sessionId}.lock`
  );
  if (fs4.existsSync(markerPath)) {
    const age = Date.now() - fs4.statSync(markerPath).mtimeMs;
    if (age < 12 * 3600 * 1e3) return;
    try {
      fs4.unlinkSync(markerPath);
    } catch {
    }
  }
  fs4.mkdirSync(path4.dirname(markerPath), { recursive: true });
  try {
    const reports = reconcileLight({ repoRoot });
    const existingIds = readAllIds(repoRoot);
    let queued = 0;
    let dedupe = 0;
    let auto = 0;
    let noise = 0;
    const seen = /* @__PURE__ */ new Set();
    for (const r of reports) {
      for (const f of r.findings) {
        const v2 = classify(r.specSlug, f, repoRoot);
        if (v2.verdict === "AUTO_FIX") {
          auto++;
          continue;
        }
        if (v2.verdict === "NOISE") {
          noise++;
          continue;
        }
        if (!v2.entry) continue;
        const id = entryId(r.specSlug, f.code, v2.entry.evidence);
        if (seen.has(id)) {
          dedupe++;
          continue;
        }
        seen.add(id);
        if (existingIds.has(id)) {
          dedupe++;
          continue;
        }
        appendEntry(repoRoot, v2.entry);
        existingIds.add(id);
        queued++;
      }
    }
    fs4.writeFileSync(
      markerPath,
      JSON.stringify({
        at: (/* @__PURE__ */ new Date()).toISOString(),
        sessionId,
        queued,
        dedupe,
        auto,
        noise
      })
    );
    if (queued > 0) {
      process.stderr.write(
        `[spec-backlog] auto-ingest: +${queued} new entries (${dedupe} duplicates skipped, ${auto} auto-fix, ${noise} noise)
  \u2192 list: \`dev-pomogator-spec-backlog list --slug <slug>\`
  \u2192 resolve: \`dev-pomogator-spec-backlog resolve --category <cat>\`
`
      );
    }
  } catch (err) {
    fs4.writeFileSync(
      markerPath,
      JSON.stringify({ at: (/* @__PURE__ */ new Date()).toISOString(), sessionId, error: String(err) })
    );
  }
}
main().catch(() => {
});
