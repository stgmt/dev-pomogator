import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
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

// tools/spec-graph/identity.ts
function assertPart(value, name) {
  if (!value) throw new Error(`INVALID_IDENTITY: ${name} must be non-empty`);
  if (name === "localId" && value.includes(":")) {
    throw new Error('INVALID_IDENTITY: localId must not contain ":"');
  }
}
function formatIdentity(identity) {
  assertPart(identity.localId, "localId");
  if (identity.namespace === void 0) return identity.localId;
  assertPart(identity.namespace, "namespace");
  return `${identity.namespace}:${identity.localId}`;
}
function parseIdentity(canonicalId) {
  if (!canonicalId) throw new Error("INVALID_IDENTITY: id must be non-empty");
  const separator = canonicalId.lastIndexOf(":");
  if (separator < 0) return { localId: canonicalId };
  const namespace = canonicalId.slice(0, separator);
  const localId = canonicalId.slice(separator + 1);
  assertPart(namespace, "namespace");
  assertPart(localId, "localId");
  return { namespace, localId };
}
function localIdOf(identity) {
  return parseIdentity(typeof identity === "string" ? identity : identity.id).localId;
}
function caseFold(value) {
  return value.toLowerCase();
}
function unicodeFold(value) {
  return value.normalize("NFKC").toLowerCase();
}
function identityCollisionKey(identity) {
  return `${unicodeFold(identity.namespace ?? "")}:${unicodeFold(identity.localId)}`;
}
function classifyIdentityCollision(firstId, secondId) {
  const first = parseIdentity(firstId);
  const second = parseIdentity(secondId);
  if (unicodeFold(first.namespace ?? "") !== unicodeFold(second.namespace ?? "")) return null;
  if (first.localId === second.localId && first.namespace === second.namespace) return "EXACT";
  if (caseFold(first.localId) === caseFold(second.localId)) return "CASE_NORMALIZED";
  if (unicodeFold(first.localId) === unicodeFold(second.localId)) return "UNICODE_NORMALIZED";
  return null;
}
var init_identity = __esm({
  "tools/spec-graph/identity.ts"() {
    "use strict";
  }
});

// tools/spec-graph/coverage.ts
function specOf(file) {
  const m = file.replace(/\\/g, "/").match(/(?:^|\/)\.specs\/(.+)\/[^/]+$/);
  return m ? m[1] : void 0;
}
function qualifySlice(slice, slug) {
  if (!slug) return;
  for (const node of slice.nodes) {
    node.spec = slug;
    node.id = formatIdentity({ namespace: slug, localId: node.id });
    if (node.type === "Task" && Array.isArray(node.refs)) {
      node.refs = node.refs.map((r) => `${slug}:${r}`);
    } else if (node.type === "AC" && typeof node.parentFr === "string" && node.parentFr) {
      node.parentFr = `${slug}:${node.parentFr}`;
    }
  }
  for (const e of slice.edges) {
    e.from = `${slug}:${e.from}`;
    e.to = `${slug}:${e.to}`;
  }
}
function scenarioKey(s) {
  const m = s.match(/\b([a-z][a-z0-9]*(?:gen)?\d{3})[_-](\d+)\b/i);
  if (!m) return null;
  const prefix = m[1].toLowerCase() === "scengen004" ? "specgen004" : m[1].toLowerCase();
  return `${prefix}_${m[2]}`;
}
function bucketScenarios(scenarios) {
  const out = {
    passed: [],
    stale: [],
    pending: [],
    not_run: [],
    undefined: [],
    ambiguous: [],
    failed: [],
    skipped: []
  };
  for (const s of scenarios) {
    const bucket = s.result ? s.stale && s.result.toUpperCase() === "PASSED" ? "stale" : RESULT_TO_BUCKET[s.result.toUpperCase()] ?? "undefined" : "not_run";
    out[bucket].push(s.id);
  }
  return out;
}
function mapTasksToScenarios(tasks, scenarios) {
  const byTag = /* @__PURE__ */ new Map();
  const byKey = /* @__PURE__ */ new Map();
  const scenarioSpec = /* @__PURE__ */ new Map();
  for (const s of scenarios) {
    scenarioSpec.set(s.id, s.spec);
    for (const tag of s.tags) {
      const key = tag.toLowerCase();
      if (!byTag.has(key)) byTag.set(key, /* @__PURE__ */ new Set());
      byTag.get(key).add(s.id);
    }
    const k = scenarioKey(s.id);
    if (k) byKey.set(k, s.id);
  }
  const out = /* @__PURE__ */ new Map();
  for (const task of tasks) {
    const explicitIds = /* @__PURE__ */ new Set();
    const taggedIds = /* @__PURE__ */ new Set();
    const refIds = /* @__PURE__ */ new Set();
    const sameSpec = (sid) => task.spec === void 0 || scenarioSpec.get(sid) === task.spec;
    for (const m of task.doneWhen.matchAll(/\b[a-z][a-z0-9]*(?:gen)?\d{3}[_-]\d+\b/gi)) {
      const k = scenarioKey(m[0]);
      const sid = k && byKey.get(k);
      if (sid) explicitIds.add(sid);
    }
    for (const m of task.doneWhen.matchAll(/@feature\d+/gi)) {
      for (const sid of byTag.get(m[0].toLowerCase()) ?? []) if (sameSpec(sid)) taggedIds.add(sid);
    }
    for (const ref of task.refs) {
      const n = ref.match(/FR-(\d+)/i);
      if (n) {
        for (const sid of byTag.get(`@feature${n[1]}`) ?? []) if (sameSpec(sid)) refIds.add(sid);
      }
    }
    out.set(task.id, [...explicitIds.size > 0 ? explicitIds : taggedIds.size > 0 ? taggedIds : refIds]);
  }
  return out;
}
function verifiedStatus(scenarioIds, bucketById, verdict) {
  if (scenarioIds.length === 0) return "unverified";
  if (!scenarioIds.every((id) => bucketById.get(id) === "passed")) return "IN_PROGRESS";
  if (verdict === "WEAK" || verdict === "FAKE-POSITIVE-RISK") return "IN_PROGRESS";
  return "DONE";
}
function taskTruthIssues(task, scenarioIds, bucketById, scenarioById, verified) {
  if (task.status !== "done") return [];
  const evidence = scenarioIds.map((id) => ({
    id,
    bucket: bucketById.get(id) ?? "unverified",
    source: scenarioById.get(id)?.source
  }));
  const issues = [];
  if (verified !== "DONE") {
    issues.push({
      code: "TASK_DONE_UNVERIFIED",
      taskId: task.id,
      message: scenarioIds.length > 0 ? `Status: DONE but mapped scenario evidence is not all canonical PASSED (${evidence.map((s) => `${s.id}=${s.bucket}`).join(", ")})` : "Status: DONE but no mapped scenario evidence exists",
      scenarios: evidence
    });
  }
  if (/^\s*-\s*\[\s\]/m.test(task.doneWhen)) {
    issues.push({
      code: "TASK_DONE_CHECKLIST_OPEN",
      taskId: task.id,
      message: "Status: DONE but Done When contains unchecked checkbox item(s)",
      scenarios: evidence
    });
  }
  const filteredOnly = scenarioIds.length > 0 && scenarioIds.every((id) => {
    const scenario = scenarioById.get(id);
    return bucketById.get(id) === "passed" && scenario?.source?.includes("filtered") && scenario.canonicalResult?.toUpperCase() !== "PASSED";
  });
  if (filteredOnly) {
    issues.push({
      code: "TASK_DONE_FILTERED_ONLY",
      taskId: task.id,
      message: "Status: DONE is backed only by filtered-run evidence; canonical full-run proof is required for DONE truth",
      scenarios: evidence
    });
  }
  return issues;
}
function computeCoverage(tasks, scenarios, testQualityByTask = {}) {
  const buckets = bucketScenarios(scenarios);
  const bucketById = /* @__PURE__ */ new Map();
  for (const b of Object.keys(buckets)) for (const id of buckets[b]) bucketById.set(id, b);
  const scenarioById = new Map(scenarios.map((s) => [s.id, s]));
  const taskMap = mapTasksToScenarios(tasks, scenarios);
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const tasksOut = {};
  for (const [taskId, scenarioIds] of taskMap) {
    const verdict = testQualityByTask[taskId];
    const verified = verifiedStatus(scenarioIds, bucketById, verdict);
    const task = taskById.get(taskId);
    const issues = task ? taskTruthIssues(task, scenarioIds, bucketById, scenarioById, verified) : [];
    tasksOut[taskId] = {
      verified_status: issues.length > 0 ? "IN_PROGRESS" : verified,
      scenarios: scenarioIds,
      ...verdict ? { test_quality: verdict } : {},
      ...issues.length > 0 ? { truth_issues: issues } : {}
    };
  }
  const totals = { scenarios: scenarios.length };
  for (const b of Object.keys(buckets)) totals[b] = buckets[b].length;
  return { buckets, tasks: tasksOut, totals };
}
var RESULT_TO_BUCKET;
var init_coverage = __esm({
  "tools/spec-graph/coverage.ts"() {
    "use strict";
    init_identity();
    RESULT_TO_BUCKET = {
      PASSED: "passed",
      PENDING: "pending",
      UNDEFINED: "undefined",
      AMBIGUOUS: "ambiguous",
      FAILED: "failed",
      SKIPPED: "skipped"
    };
  }
});

// tools/spec-graph/edge-schema.ts
function syntheticTargetMatches(rule, target) {
  if (rule.syntheticTarget === "result") return target.startsWith("RESULT-");
  if (rule.syntheticTarget === "trace") return target.startsWith("TRACE-");
  return false;
}
function validateEdgeEndpoints(edge, graph) {
  const source = graph.nodes.get(edge.from);
  const target = graph.nodes.get(edge.to);
  if (!source || !target && syntheticTargetMatches(EDGE_SCHEMA[edge.type], edge.to)) return null;
  if (!source || !target) return null;
  const rule = EDGE_SCHEMA[edge.type];
  if (rule.sources.includes(source.type) && rule.targets.includes(target.type)) return null;
  return {
    code: "ENDPOINT_VIOLATION",
    edge,
    actualSource: source.type,
    actualTarget: target.type,
    allowedSources: rule.sources,
    allowedTargets: rule.targets
  };
}
function validateGraphEdgeEndpoints(graph) {
  const violations = [];
  for (const edge of graph.edges) {
    const violation = validateEdgeEndpoints(edge, graph);
    if (violation) violations.push(violation);
  }
  return violations;
}
function refreshEndpointViolations(graph) {
  const violations = validateGraphEdgeEndpoints(graph);
  graph.endpointViolations = violations;
  return violations;
}
var EDGE_SCHEMA;
var init_edge_schema = __esm({
  "tools/spec-graph/edge-schema.ts"() {
    "use strict";
    EDGE_SCHEMA = {
      refs: {
        sources: ["Task"],
        targets: ["FR", "NFR", "AC", "Scenario"]
      },
      covers: {
        sources: ["FR", "NFR"],
        targets: ["AC", "Story", "Decision"]
      },
      "tested-by": {
        sources: ["FR", "NFR", "AC"],
        targets: ["Scenario"]
      },
      verifies: {
        sources: ["Scenario", "AC"],
        targets: ["FR", "NFR"]
      },
      entitles: {
        sources: ["Decision", "UseCase"],
        targets: ["FR", "NFR", "Task"]
      },
      "tagged-by": {
        sources: ["Scenario"],
        targets: ["FR", "NFR", "AC"]
      },
      implements: {
        sources: ["FR", "NFR"],
        targets: ["File"]
      },
      "last-result": {
        sources: ["Scenario"],
        targets: [],
        syntheticTarget: "result"
      },
      "runtime-trace": {
        sources: ["Scenario"],
        targets: [],
        syntheticTarget: "trace"
      },
      "step-binding": {
        sources: ["Scenario"],
        targets: ["StepBinding"]
      },
      "code-impl": {
        sources: ["FR", "NFR", "AC", "Scenario"],
        targets: ["File"]
      },
      "evidenced-by": {
        sources: ["FR", "NFR", "AC", "Scenario"],
        targets: ["Evidence"]
      }
    };
  }
});

// tools/anchor-integrity/marksman-slug.mjs
function marksmanSlug(headingText) {
  return headingText.toLowerCase().replace(/[^\p{L}\p{N}\s-]+/gu, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
}
var init_marksman_slug = __esm({
  "tools/anchor-integrity/marksman-slug.mjs"() {
    "use strict";
  }
});

// node_modules/yaml/dist/nodes/identity.js
var require_identity = __commonJS({
  "node_modules/yaml/dist/nodes/identity.js"(exports) {
    "use strict";
    var ALIAS = /* @__PURE__ */ Symbol.for("yaml.alias");
    var DOC = /* @__PURE__ */ Symbol.for("yaml.document");
    var MAP = /* @__PURE__ */ Symbol.for("yaml.map");
    var PAIR = /* @__PURE__ */ Symbol.for("yaml.pair");
    var SCALAR = /* @__PURE__ */ Symbol.for("yaml.scalar");
    var SEQ = /* @__PURE__ */ Symbol.for("yaml.seq");
    var NODE_TYPE = /* @__PURE__ */ Symbol.for("yaml.node.type");
    var isAlias = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === ALIAS;
    var isDocument = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === DOC;
    var isMap = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === MAP;
    var isPair = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === PAIR;
    var isScalar = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SCALAR;
    var isSeq = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SEQ;
    function isCollection(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case MAP:
          case SEQ:
            return true;
        }
      return false;
    }
    function isNode(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case ALIAS:
          case MAP:
          case SCALAR:
          case SEQ:
            return true;
        }
      return false;
    }
    var hasAnchor = (node) => (isScalar(node) || isCollection(node)) && !!node.anchor;
    exports.ALIAS = ALIAS;
    exports.DOC = DOC;
    exports.MAP = MAP;
    exports.NODE_TYPE = NODE_TYPE;
    exports.PAIR = PAIR;
    exports.SCALAR = SCALAR;
    exports.SEQ = SEQ;
    exports.hasAnchor = hasAnchor;
    exports.isAlias = isAlias;
    exports.isCollection = isCollection;
    exports.isDocument = isDocument;
    exports.isMap = isMap;
    exports.isNode = isNode;
    exports.isPair = isPair;
    exports.isScalar = isScalar;
    exports.isSeq = isSeq;
  }
});

// node_modules/yaml/dist/visit.js
var require_visit = __commonJS({
  "node_modules/yaml/dist/visit.js"(exports) {
    "use strict";
    var identity = require_identity();
    var BREAK = /* @__PURE__ */ Symbol("break visit");
    var SKIP = /* @__PURE__ */ Symbol("skip children");
    var REMOVE = /* @__PURE__ */ Symbol("remove node");
    function visit(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = visit_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        visit_(null, node, visitor_, Object.freeze([]));
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    function visit_(key, node, visitor, path7) {
      const ctrl = callVisitor(key, node, visitor, path7);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path7, ctrl);
        return visit_(key, ctrl, visitor, path7);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path7 = Object.freeze(path7.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = visit_(i, node.items[i], visitor, path7);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path7 = Object.freeze(path7.concat(node));
          const ck = visit_("key", node.key, visitor, path7);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = visit_("value", node.value, visitor, path7);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    async function visitAsync(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = await visitAsync_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        await visitAsync_(null, node, visitor_, Object.freeze([]));
    }
    visitAsync.BREAK = BREAK;
    visitAsync.SKIP = SKIP;
    visitAsync.REMOVE = REMOVE;
    async function visitAsync_(key, node, visitor, path7) {
      const ctrl = await callVisitor(key, node, visitor, path7);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path7, ctrl);
        return visitAsync_(key, ctrl, visitor, path7);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path7 = Object.freeze(path7.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = await visitAsync_(i, node.items[i], visitor, path7);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path7 = Object.freeze(path7.concat(node));
          const ck = await visitAsync_("key", node.key, visitor, path7);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = await visitAsync_("value", node.value, visitor, path7);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    function initVisitor(visitor) {
      if (typeof visitor === "object" && (visitor.Collection || visitor.Node || visitor.Value)) {
        return Object.assign({
          Alias: visitor.Node,
          Map: visitor.Node,
          Scalar: visitor.Node,
          Seq: visitor.Node
        }, visitor.Value && {
          Map: visitor.Value,
          Scalar: visitor.Value,
          Seq: visitor.Value
        }, visitor.Collection && {
          Map: visitor.Collection,
          Seq: visitor.Collection
        }, visitor);
      }
      return visitor;
    }
    function callVisitor(key, node, visitor, path7) {
      if (typeof visitor === "function")
        return visitor(key, node, path7);
      if (identity.isMap(node))
        return visitor.Map?.(key, node, path7);
      if (identity.isSeq(node))
        return visitor.Seq?.(key, node, path7);
      if (identity.isPair(node))
        return visitor.Pair?.(key, node, path7);
      if (identity.isScalar(node))
        return visitor.Scalar?.(key, node, path7);
      if (identity.isAlias(node))
        return visitor.Alias?.(key, node, path7);
      return void 0;
    }
    function replaceNode(key, path7, node) {
      const parent = path7[path7.length - 1];
      if (identity.isCollection(parent)) {
        parent.items[key] = node;
      } else if (identity.isPair(parent)) {
        if (key === "key")
          parent.key = node;
        else
          parent.value = node;
      } else if (identity.isDocument(parent)) {
        parent.contents = node;
      } else {
        const pt = identity.isAlias(parent) ? "alias" : "scalar";
        throw new Error(`Cannot replace node with ${pt} parent`);
      }
    }
    exports.visit = visit;
    exports.visitAsync = visitAsync;
  }
});

// node_modules/yaml/dist/doc/directives.js
var require_directives = __commonJS({
  "node_modules/yaml/dist/doc/directives.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    var escapeChars = {
      "!": "%21",
      ",": "%2C",
      "[": "%5B",
      "]": "%5D",
      "{": "%7B",
      "}": "%7D"
    };
    var escapeTagName = (tn) => tn.replace(/[!,[\]{}]/g, (ch) => escapeChars[ch]);
    var Directives = class _Directives {
      constructor(yaml, tags) {
        this.docStart = null;
        this.docEnd = false;
        this.yaml = Object.assign({}, _Directives.defaultYaml, yaml);
        this.tags = Object.assign({}, _Directives.defaultTags, tags);
      }
      clone() {
        const copy = new _Directives(this.yaml, this.tags);
        copy.docStart = this.docStart;
        return copy;
      }
      /**
       * During parsing, get a Directives instance for the current document and
       * update the stream state according to the current version's spec.
       */
      atDocument() {
        const res = new _Directives(this.yaml, this.tags);
        switch (this.yaml.version) {
          case "1.1":
            this.atNextDocument = true;
            break;
          case "1.2":
            this.atNextDocument = false;
            this.yaml = {
              explicit: _Directives.defaultYaml.explicit,
              version: "1.2"
            };
            this.tags = Object.assign({}, _Directives.defaultTags);
            break;
        }
        return res;
      }
      /**
       * @param onError - May be called even if the action was successful
       * @returns `true` on success
       */
      add(line, onError) {
        if (this.atNextDocument) {
          this.yaml = { explicit: _Directives.defaultYaml.explicit, version: "1.1" };
          this.tags = Object.assign({}, _Directives.defaultTags);
          this.atNextDocument = false;
        }
        const parts = line.trim().split(/[ \t]+/);
        const name = parts.shift();
        switch (name) {
          case "%TAG": {
            if (parts.length !== 2) {
              onError(0, "%TAG directive should contain exactly two parts");
              if (parts.length < 2)
                return false;
            }
            const [handle, prefix] = parts;
            this.tags[handle] = prefix;
            return true;
          }
          case "%YAML": {
            this.yaml.explicit = true;
            if (parts.length !== 1) {
              onError(0, "%YAML directive should contain exactly one part");
              return false;
            }
            const [version2] = parts;
            if (version2 === "1.1" || version2 === "1.2") {
              this.yaml.version = version2;
              return true;
            } else {
              const isValid = /^\d+\.\d+$/.test(version2);
              onError(6, `Unsupported YAML version ${version2}`, isValid);
              return false;
            }
          }
          default:
            onError(0, `Unknown directive ${name}`, true);
            return false;
        }
      }
      /**
       * Resolves a tag, matching handles to those defined in %TAG directives.
       *
       * @returns Resolved tag, which may also be the non-specific tag `'!'` or a
       *   `'!local'` tag, or `null` if unresolvable.
       */
      tagName(source, onError) {
        if (source === "!")
          return "!";
        if (source[0] !== "!") {
          onError(`Not a valid tag: ${source}`);
          return null;
        }
        if (source[1] === "<") {
          const verbatim = source.slice(2, -1);
          if (verbatim === "!" || verbatim === "!!") {
            onError(`Verbatim tags aren't resolved, so ${source} is invalid.`);
            return null;
          }
          if (source[source.length - 1] !== ">")
            onError("Verbatim tags must end with a >");
          return verbatim;
        }
        const [, handle, suffix] = source.match(/^(.*!)([^!]*)$/s);
        if (!suffix)
          onError(`The ${source} tag has no suffix`);
        const prefix = this.tags[handle];
        if (prefix) {
          try {
            return prefix + decodeURIComponent(suffix);
          } catch (error) {
            onError(String(error));
            return null;
          }
        }
        if (handle === "!")
          return source;
        onError(`Could not resolve tag: ${source}`);
        return null;
      }
      /**
       * Given a fully resolved tag, returns its printable string form,
       * taking into account current tag prefixes and defaults.
       */
      tagString(tag) {
        for (const [handle, prefix] of Object.entries(this.tags)) {
          if (tag.startsWith(prefix))
            return handle + escapeTagName(tag.substring(prefix.length));
        }
        return tag[0] === "!" ? tag : `!<${tag}>`;
      }
      toString(doc) {
        const lines = this.yaml.explicit ? [`%YAML ${this.yaml.version || "1.2"}`] : [];
        const tagEntries = Object.entries(this.tags);
        let tagNames;
        if (doc && tagEntries.length > 0 && identity.isNode(doc.contents)) {
          const tags = {};
          visit.visit(doc.contents, (_key, node) => {
            if (identity.isNode(node) && node.tag)
              tags[node.tag] = true;
          });
          tagNames = Object.keys(tags);
        } else
          tagNames = [];
        for (const [handle, prefix] of tagEntries) {
          if (handle === "!!" && prefix === "tag:yaml.org,2002:")
            continue;
          if (!doc || tagNames.some((tn) => tn.startsWith(prefix)))
            lines.push(`%TAG ${handle} ${prefix}`);
        }
        return lines.join("\n");
      }
    };
    Directives.defaultYaml = { explicit: false, version: "1.2" };
    Directives.defaultTags = { "!!": "tag:yaml.org,2002:" };
    exports.Directives = Directives;
  }
});

// node_modules/yaml/dist/doc/anchors.js
var require_anchors = __commonJS({
  "node_modules/yaml/dist/doc/anchors.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    function anchorIsValid(anchor) {
      if (/[\x00-\x19\s,[\]{}]/.test(anchor)) {
        const sa = JSON.stringify(anchor);
        const msg = `Anchor must not contain whitespace or control characters: ${sa}`;
        throw new Error(msg);
      }
      return true;
    }
    function anchorNames(root) {
      const anchors = /* @__PURE__ */ new Set();
      visit.visit(root, {
        Value(_key, node) {
          if (node.anchor)
            anchors.add(node.anchor);
        }
      });
      return anchors;
    }
    function findNewAnchor(prefix, exclude) {
      for (let i = 1; true; ++i) {
        const name = `${prefix}${i}`;
        if (!exclude.has(name))
          return name;
      }
    }
    function createNodeAnchors(doc, prefix) {
      const aliasObjects = [];
      const sourceObjects = /* @__PURE__ */ new Map();
      let prevAnchors = null;
      return {
        onAnchor: (source) => {
          aliasObjects.push(source);
          prevAnchors ?? (prevAnchors = anchorNames(doc));
          const anchor = findNewAnchor(prefix, prevAnchors);
          prevAnchors.add(anchor);
          return anchor;
        },
        /**
         * With circular references, the source node is only resolved after all
         * of its child nodes are. This is why anchors are set only after all of
         * the nodes have been created.
         */
        setAnchors: () => {
          for (const source of aliasObjects) {
            const ref = sourceObjects.get(source);
            if (typeof ref === "object" && ref.anchor && (identity.isScalar(ref.node) || identity.isCollection(ref.node))) {
              ref.node.anchor = ref.anchor;
            } else {
              const error = new Error("Failed to resolve repeated object (this should not happen)");
              error.source = source;
              throw error;
            }
          }
        },
        sourceObjects
      };
    }
    exports.anchorIsValid = anchorIsValid;
    exports.anchorNames = anchorNames;
    exports.createNodeAnchors = createNodeAnchors;
    exports.findNewAnchor = findNewAnchor;
  }
});

// node_modules/yaml/dist/doc/applyReviver.js
var require_applyReviver = __commonJS({
  "node_modules/yaml/dist/doc/applyReviver.js"(exports) {
    "use strict";
    function applyReviver(reviver, obj, key, val) {
      if (val && typeof val === "object") {
        if (Array.isArray(val)) {
          for (let i = 0, len = val.length; i < len; ++i) {
            const v0 = val[i];
            const v1 = applyReviver(reviver, val, String(i), v0);
            if (v1 === void 0)
              delete val[i];
            else if (v1 !== v0)
              val[i] = v1;
          }
        } else if (val instanceof Map) {
          for (const k of Array.from(val.keys())) {
            const v0 = val.get(k);
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              val.delete(k);
            else if (v1 !== v0)
              val.set(k, v1);
          }
        } else if (val instanceof Set) {
          for (const v0 of Array.from(val)) {
            const v1 = applyReviver(reviver, val, v0, v0);
            if (v1 === void 0)
              val.delete(v0);
            else if (v1 !== v0) {
              val.delete(v0);
              val.add(v1);
            }
          }
        } else {
          for (const [k, v0] of Object.entries(val)) {
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              delete val[k];
            else if (v1 !== v0)
              val[k] = v1;
          }
        }
      }
      return reviver.call(obj, key, val);
    }
    exports.applyReviver = applyReviver;
  }
});

// node_modules/yaml/dist/nodes/toJS.js
var require_toJS = __commonJS({
  "node_modules/yaml/dist/nodes/toJS.js"(exports) {
    "use strict";
    var identity = require_identity();
    function toJS(value, arg, ctx) {
      if (Array.isArray(value))
        return value.map((v, i) => toJS(v, String(i), ctx));
      if (value && typeof value.toJSON === "function") {
        if (!ctx || !identity.hasAnchor(value))
          return value.toJSON(arg, ctx);
        const data = { aliasCount: 0, count: 1, res: void 0 };
        ctx.anchors.set(value, data);
        ctx.onCreate = (res2) => {
          data.res = res2;
          delete ctx.onCreate;
        };
        const res = value.toJSON(arg, ctx);
        if (ctx.onCreate)
          ctx.onCreate(res);
        return res;
      }
      if (typeof value === "bigint" && !ctx?.keep)
        return Number(value);
      return value;
    }
    exports.toJS = toJS;
  }
});

// node_modules/yaml/dist/nodes/Node.js
var require_Node = __commonJS({
  "node_modules/yaml/dist/nodes/Node.js"(exports) {
    "use strict";
    var applyReviver = require_applyReviver();
    var identity = require_identity();
    var toJS = require_toJS();
    var NodeBase = class {
      constructor(type) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: type });
      }
      /** Create a copy of this node.  */
      clone() {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** A plain JavaScript representation of this node. */
      toJS(doc, { mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        if (!identity.isDocument(doc))
          throw new TypeError("A document argument is required");
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc,
          keep: true,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this, "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
    };
    exports.NodeBase = NodeBase;
  }
});

// node_modules/yaml/dist/nodes/Alias.js
var require_Alias = __commonJS({
  "node_modules/yaml/dist/nodes/Alias.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var visit = require_visit();
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var Alias = class extends Node.NodeBase {
      constructor(source) {
        super(identity.ALIAS);
        this.source = source;
        Object.defineProperty(this, "tag", {
          set() {
            throw new Error("Alias nodes cannot have tags");
          }
        });
      }
      /**
       * Resolve the value of this alias within `doc`, finding the last
       * instance of the `source` anchor before this node.
       */
      resolve(doc, ctx) {
        let nodes;
        if (ctx?.aliasResolveCache) {
          nodes = ctx.aliasResolveCache;
        } else {
          nodes = [];
          visit.visit(doc, {
            Node: (_key, node) => {
              if (identity.isAlias(node) || identity.hasAnchor(node))
                nodes.push(node);
            }
          });
          if (ctx)
            ctx.aliasResolveCache = nodes;
        }
        let found = void 0;
        for (const node of nodes) {
          if (node === this)
            break;
          if (node.anchor === this.source)
            found = node;
        }
        return found;
      }
      toJSON(_arg, ctx) {
        if (!ctx)
          return { source: this.source };
        const { anchors: anchors2, doc, maxAliasCount } = ctx;
        const source = this.resolve(doc, ctx);
        if (!source) {
          const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
          throw new ReferenceError(msg);
        }
        let data = anchors2.get(source);
        if (!data) {
          toJS.toJS(source, null, ctx);
          data = anchors2.get(source);
        }
        if (data?.res === void 0) {
          const msg = "This should not happen: Alias anchor was not resolved?";
          throw new ReferenceError(msg);
        }
        if (maxAliasCount >= 0) {
          data.count += 1;
          if (data.aliasCount === 0)
            data.aliasCount = getAliasCount(doc, source, anchors2);
          if (data.count * data.aliasCount > maxAliasCount) {
            const msg = "Excessive alias count indicates a resource exhaustion attack";
            throw new ReferenceError(msg);
          }
        }
        return data.res;
      }
      toString(ctx, _onComment, _onChompKeep) {
        const src = `*${this.source}`;
        if (ctx) {
          anchors.anchorIsValid(this.source);
          if (ctx.options.verifyAliasOrder && !ctx.anchors.has(this.source)) {
            const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
            throw new Error(msg);
          }
          if (ctx.implicitKey)
            return `${src} `;
        }
        return src;
      }
    };
    function getAliasCount(doc, node, anchors2) {
      if (identity.isAlias(node)) {
        const source = node.resolve(doc);
        const anchor = anchors2 && source && anchors2.get(source);
        return anchor ? anchor.count * anchor.aliasCount : 0;
      } else if (identity.isCollection(node)) {
        let count = 0;
        for (const item of node.items) {
          const c = getAliasCount(doc, item, anchors2);
          if (c > count)
            count = c;
        }
        return count;
      } else if (identity.isPair(node)) {
        const kc = getAliasCount(doc, node.key, anchors2);
        const vc = getAliasCount(doc, node.value, anchors2);
        return Math.max(kc, vc);
      }
      return 1;
    }
    exports.Alias = Alias;
  }
});

// node_modules/yaml/dist/nodes/Scalar.js
var require_Scalar = __commonJS({
  "node_modules/yaml/dist/nodes/Scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var isScalarValue = (value) => !value || typeof value !== "function" && typeof value !== "object";
    var Scalar = class extends Node.NodeBase {
      constructor(value) {
        super(identity.SCALAR);
        this.value = value;
      }
      toJSON(arg, ctx) {
        return ctx?.keep ? this.value : toJS.toJS(this.value, arg, ctx);
      }
      toString() {
        return String(this.value);
      }
    };
    Scalar.BLOCK_FOLDED = "BLOCK_FOLDED";
    Scalar.BLOCK_LITERAL = "BLOCK_LITERAL";
    Scalar.PLAIN = "PLAIN";
    Scalar.QUOTE_DOUBLE = "QUOTE_DOUBLE";
    Scalar.QUOTE_SINGLE = "QUOTE_SINGLE";
    exports.Scalar = Scalar;
    exports.isScalarValue = isScalarValue;
  }
});

// node_modules/yaml/dist/doc/createNode.js
var require_createNode = __commonJS({
  "node_modules/yaml/dist/doc/createNode.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var defaultTagPrefix = "tag:yaml.org,2002:";
    function findTagObject(value, tagName, tags) {
      if (tagName) {
        const match = tags.filter((t) => t.tag === tagName);
        const tagObj = match.find((t) => !t.format) ?? match[0];
        if (!tagObj)
          throw new Error(`Tag ${tagName} not found`);
        return tagObj;
      }
      return tags.find((t) => t.identify?.(value) && !t.format);
    }
    function createNode(value, tagName, ctx) {
      if (identity.isDocument(value))
        value = value.contents;
      if (identity.isNode(value))
        return value;
      if (identity.isPair(value)) {
        const map = ctx.schema[identity.MAP].createNode?.(ctx.schema, null, ctx);
        map.items.push(value);
        return map;
      }
      if (value instanceof String || value instanceof Number || value instanceof Boolean || typeof BigInt !== "undefined" && value instanceof BigInt) {
        value = value.valueOf();
      }
      const { aliasDuplicateObjects, onAnchor, onTagObj, schema, sourceObjects } = ctx;
      let ref = void 0;
      if (aliasDuplicateObjects && value && typeof value === "object") {
        ref = sourceObjects.get(value);
        if (ref) {
          ref.anchor ?? (ref.anchor = onAnchor(value));
          return new Alias.Alias(ref.anchor);
        } else {
          ref = { anchor: null, node: null };
          sourceObjects.set(value, ref);
        }
      }
      if (tagName?.startsWith("!!"))
        tagName = defaultTagPrefix + tagName.slice(2);
      let tagObj = findTagObject(value, tagName, schema.tags);
      if (!tagObj) {
        if (value && typeof value.toJSON === "function") {
          value = value.toJSON();
        }
        if (!value || typeof value !== "object") {
          const node2 = new Scalar.Scalar(value);
          if (ref)
            ref.node = node2;
          return node2;
        }
        tagObj = value instanceof Map ? schema[identity.MAP] : Symbol.iterator in Object(value) ? schema[identity.SEQ] : schema[identity.MAP];
      }
      if (onTagObj) {
        onTagObj(tagObj);
        delete ctx.onTagObj;
      }
      const node = tagObj?.createNode ? tagObj.createNode(ctx.schema, value, ctx) : typeof tagObj?.nodeClass?.from === "function" ? tagObj.nodeClass.from(ctx.schema, value, ctx) : new Scalar.Scalar(value);
      if (tagName)
        node.tag = tagName;
      else if (!tagObj.default)
        node.tag = tagObj.tag;
      if (ref)
        ref.node = node;
      return node;
    }
    exports.createNode = createNode;
  }
});

// node_modules/yaml/dist/nodes/Collection.js
var require_Collection = __commonJS({
  "node_modules/yaml/dist/nodes/Collection.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var identity = require_identity();
    var Node = require_Node();
    function collectionFromPath(schema, path7, value) {
      let v = value;
      for (let i = path7.length - 1; i >= 0; --i) {
        const k = path7[i];
        if (typeof k === "number" && Number.isInteger(k) && k >= 0) {
          const a = [];
          a[k] = v;
          v = a;
        } else {
          v = /* @__PURE__ */ new Map([[k, v]]);
        }
      }
      return createNode.createNode(v, void 0, {
        aliasDuplicateObjects: false,
        keepUndefined: false,
        onAnchor: () => {
          throw new Error("This should not happen, please report a bug.");
        },
        schema,
        sourceObjects: /* @__PURE__ */ new Map()
      });
    }
    var isEmptyPath = (path7) => path7 == null || typeof path7 === "object" && !!path7[Symbol.iterator]().next().done;
    var Collection = class extends Node.NodeBase {
      constructor(type, schema) {
        super(type);
        Object.defineProperty(this, "schema", {
          value: schema,
          configurable: true,
          enumerable: false,
          writable: true
        });
      }
      /**
       * Create a copy of this collection.
       *
       * @param schema - If defined, overwrites the original's schema
       */
      clone(schema) {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (schema)
          copy.schema = schema;
        copy.items = copy.items.map((it) => identity.isNode(it) || identity.isPair(it) ? it.clone(schema) : it);
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /**
       * Adds a value to the collection. For `!!map` and `!!omap` the value must
       * be a Pair instance or a `{ key, value }` object, which may not have a key
       * that already exists in the map.
       */
      addIn(path7, value) {
        if (isEmptyPath(path7))
          this.add(value);
        else {
          const [key, ...rest] = path7;
          const node = this.get(key, true);
          if (identity.isCollection(node))
            node.addIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
      /**
       * Removes a value from the collection.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path7) {
        const [key, ...rest] = path7;
        if (rest.length === 0)
          return this.delete(key);
        const node = this.get(key, true);
        if (identity.isCollection(node))
          return node.deleteIn(rest);
        else
          throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path7, keepScalar) {
        const [key, ...rest] = path7;
        const node = this.get(key, true);
        if (rest.length === 0)
          return !keepScalar && identity.isScalar(node) ? node.value : node;
        else
          return identity.isCollection(node) ? node.getIn(rest, keepScalar) : void 0;
      }
      hasAllNullValues(allowScalar) {
        return this.items.every((node) => {
          if (!identity.isPair(node))
            return false;
          const n = node.value;
          return n == null || allowScalar && identity.isScalar(n) && n.value == null && !n.commentBefore && !n.comment && !n.tag;
        });
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       */
      hasIn(path7) {
        const [key, ...rest] = path7;
        if (rest.length === 0)
          return this.has(key);
        const node = this.get(key, true);
        return identity.isCollection(node) ? node.hasIn(rest) : false;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path7, value) {
        const [key, ...rest] = path7;
        if (rest.length === 0) {
          this.set(key, value);
        } else {
          const node = this.get(key, true);
          if (identity.isCollection(node))
            node.setIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
    };
    exports.Collection = Collection;
    exports.collectionFromPath = collectionFromPath;
    exports.isEmptyPath = isEmptyPath;
  }
});

// node_modules/yaml/dist/stringify/stringifyComment.js
var require_stringifyComment = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyComment.js"(exports) {
    "use strict";
    var stringifyComment = (str) => str.replace(/^(?!$)(?: $)?/gm, "#");
    function indentComment(comment, indent) {
      if (/^\n+$/.test(comment))
        return comment.substring(1);
      return indent ? comment.replace(/^(?! *$)/gm, indent) : comment;
    }
    var lineComment = (str, indent, comment) => str.endsWith("\n") ? indentComment(comment, indent) : comment.includes("\n") ? "\n" + indentComment(comment, indent) : (str.endsWith(" ") ? "" : " ") + comment;
    exports.indentComment = indentComment;
    exports.lineComment = lineComment;
    exports.stringifyComment = stringifyComment;
  }
});

// node_modules/yaml/dist/stringify/foldFlowLines.js
var require_foldFlowLines = __commonJS({
  "node_modules/yaml/dist/stringify/foldFlowLines.js"(exports) {
    "use strict";
    var FOLD_FLOW = "flow";
    var FOLD_BLOCK = "block";
    var FOLD_QUOTED = "quoted";
    function foldFlowLines(text, indent, mode = "flow", { indentAtStart, lineWidth = 80, minContentWidth = 20, onFold, onOverflow } = {}) {
      if (!lineWidth || lineWidth < 0)
        return text;
      if (lineWidth < minContentWidth)
        minContentWidth = 0;
      const endStep = Math.max(1 + minContentWidth, 1 + lineWidth - indent.length);
      if (text.length <= endStep)
        return text;
      const folds = [];
      const escapedFolds = {};
      let end = lineWidth - indent.length;
      if (typeof indentAtStart === "number") {
        if (indentAtStart > lineWidth - Math.max(2, minContentWidth))
          folds.push(0);
        else
          end = lineWidth - indentAtStart;
      }
      let split = void 0;
      let prev = void 0;
      let overflow = false;
      let i = -1;
      let escStart = -1;
      let escEnd = -1;
      if (mode === FOLD_BLOCK) {
        i = consumeMoreIndentedLines(text, i, indent.length);
        if (i !== -1)
          end = i + endStep;
      }
      for (let ch; ch = text[i += 1]; ) {
        if (mode === FOLD_QUOTED && ch === "\\") {
          escStart = i;
          switch (text[i + 1]) {
            case "x":
              i += 3;
              break;
            case "u":
              i += 5;
              break;
            case "U":
              i += 9;
              break;
            default:
              i += 1;
          }
          escEnd = i;
        }
        if (ch === "\n") {
          if (mode === FOLD_BLOCK)
            i = consumeMoreIndentedLines(text, i, indent.length);
          end = i + indent.length + endStep;
          split = void 0;
        } else {
          if (ch === " " && prev && prev !== " " && prev !== "\n" && prev !== "	") {
            const next = text[i + 1];
            if (next && next !== " " && next !== "\n" && next !== "	")
              split = i;
          }
          if (i >= end) {
            if (split) {
              folds.push(split);
              end = split + endStep;
              split = void 0;
            } else if (mode === FOLD_QUOTED) {
              while (prev === " " || prev === "	") {
                prev = ch;
                ch = text[i += 1];
                overflow = true;
              }
              const j = i > escEnd + 1 ? i - 2 : escStart - 1;
              if (escapedFolds[j])
                return text;
              folds.push(j);
              escapedFolds[j] = true;
              end = j + endStep;
              split = void 0;
            } else {
              overflow = true;
            }
          }
        }
        prev = ch;
      }
      if (overflow && onOverflow)
        onOverflow();
      if (folds.length === 0)
        return text;
      if (onFold)
        onFold();
      let res = text.slice(0, folds[0]);
      for (let i2 = 0; i2 < folds.length; ++i2) {
        const fold = folds[i2];
        const end2 = folds[i2 + 1] || text.length;
        if (fold === 0)
          res = `
${indent}${text.slice(0, end2)}`;
        else {
          if (mode === FOLD_QUOTED && escapedFolds[fold])
            res += `${text[fold]}\\`;
          res += `
${indent}${text.slice(fold + 1, end2)}`;
        }
      }
      return res;
    }
    function consumeMoreIndentedLines(text, i, indent) {
      let end = i;
      let start = i + 1;
      let ch = text[start];
      while (ch === " " || ch === "	") {
        if (i < start + indent) {
          ch = text[++i];
        } else {
          do {
            ch = text[++i];
          } while (ch && ch !== "\n");
          end = i;
          start = i + 1;
          ch = text[start];
        }
      }
      return end;
    }
    exports.FOLD_BLOCK = FOLD_BLOCK;
    exports.FOLD_FLOW = FOLD_FLOW;
    exports.FOLD_QUOTED = FOLD_QUOTED;
    exports.foldFlowLines = foldFlowLines;
  }
});

// node_modules/yaml/dist/stringify/stringifyString.js
var require_stringifyString = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyString.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var foldFlowLines = require_foldFlowLines();
    var getFoldOptions = (ctx, isBlock) => ({
      indentAtStart: isBlock ? ctx.indent.length : ctx.indentAtStart,
      lineWidth: ctx.options.lineWidth,
      minContentWidth: ctx.options.minContentWidth
    });
    var containsDocumentMarker = (str) => /^(%|---|\.\.\.)/m.test(str);
    function lineLengthOverLimit(str, lineWidth, indentLength) {
      if (!lineWidth || lineWidth < 0)
        return false;
      const limit = lineWidth - indentLength;
      const strLen = str.length;
      if (strLen <= limit)
        return false;
      for (let i = 0, start = 0; i < strLen; ++i) {
        if (str[i] === "\n") {
          if (i - start > limit)
            return true;
          start = i + 1;
          if (strLen - start <= limit)
            return false;
        }
      }
      return true;
    }
    function doubleQuotedString(value, ctx) {
      const json = JSON.stringify(value);
      if (ctx.options.doubleQuotedAsJSON)
        return json;
      const { implicitKey } = ctx;
      const minMultiLineLength = ctx.options.doubleQuotedMinMultiLineLength;
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      let str = "";
      let start = 0;
      for (let i = 0, ch = json[i]; ch; ch = json[++i]) {
        if (ch === " " && json[i + 1] === "\\" && json[i + 2] === "n") {
          str += json.slice(start, i) + "\\ ";
          i += 1;
          start = i;
          ch = "\\";
        }
        if (ch === "\\")
          switch (json[i + 1]) {
            case "u":
              {
                str += json.slice(start, i);
                const code = json.substr(i + 2, 4);
                switch (code) {
                  case "0000":
                    str += "\\0";
                    break;
                  case "0007":
                    str += "\\a";
                    break;
                  case "000b":
                    str += "\\v";
                    break;
                  case "001b":
                    str += "\\e";
                    break;
                  case "0085":
                    str += "\\N";
                    break;
                  case "00a0":
                    str += "\\_";
                    break;
                  case "2028":
                    str += "\\L";
                    break;
                  case "2029":
                    str += "\\P";
                    break;
                  default:
                    if (code.substr(0, 2) === "00")
                      str += "\\x" + code.substr(2);
                    else
                      str += json.substr(i, 6);
                }
                i += 5;
                start = i + 1;
              }
              break;
            case "n":
              if (implicitKey || json[i + 2] === '"' || json.length < minMultiLineLength) {
                i += 1;
              } else {
                str += json.slice(start, i) + "\n\n";
                while (json[i + 2] === "\\" && json[i + 3] === "n" && json[i + 4] !== '"') {
                  str += "\n";
                  i += 2;
                }
                str += indent;
                if (json[i + 2] === " ")
                  str += "\\";
                i += 1;
                start = i + 1;
              }
              break;
            default:
              i += 1;
          }
      }
      str = start ? str + json.slice(start) : json;
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_QUOTED, getFoldOptions(ctx, false));
    }
    function singleQuotedString(value, ctx) {
      if (ctx.options.singleQuote === false || ctx.implicitKey && value.includes("\n") || /[ \t]\n|\n[ \t]/.test(value))
        return doubleQuotedString(value, ctx);
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      const res = "'" + value.replace(/'/g, "''").replace(/\n+/g, `$&
${indent}`) + "'";
      return ctx.implicitKey ? res : foldFlowLines.foldFlowLines(res, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function quotedString(value, ctx) {
      const { singleQuote } = ctx.options;
      let qs;
      if (singleQuote === false)
        qs = doubleQuotedString;
      else {
        const hasDouble = value.includes('"');
        const hasSingle = value.includes("'");
        if (hasDouble && !hasSingle)
          qs = singleQuotedString;
        else if (hasSingle && !hasDouble)
          qs = doubleQuotedString;
        else
          qs = singleQuote ? singleQuotedString : doubleQuotedString;
      }
      return qs(value, ctx);
    }
    var blockEndNewlines;
    try {
      blockEndNewlines = new RegExp("(^|(?<!\n))\n+(?!\n|$)", "g");
    } catch {
      blockEndNewlines = /\n+(?!\n|$)/g;
    }
    function blockString({ comment, type, value }, ctx, onComment, onChompKeep) {
      const { blockQuote, commentString, lineWidth } = ctx.options;
      if (!blockQuote || /\n[\t ]+$/.test(value)) {
        return quotedString(value, ctx);
      }
      const indent = ctx.indent || (ctx.forceBlockIndent || containsDocumentMarker(value) ? "  " : "");
      const literal = blockQuote === "literal" ? true : blockQuote === "folded" || type === Scalar.Scalar.BLOCK_FOLDED ? false : type === Scalar.Scalar.BLOCK_LITERAL ? true : !lineLengthOverLimit(value, lineWidth, indent.length);
      if (!value)
        return literal ? "|\n" : ">\n";
      let chomp;
      let endStart;
      for (endStart = value.length; endStart > 0; --endStart) {
        const ch = value[endStart - 1];
        if (ch !== "\n" && ch !== "	" && ch !== " ")
          break;
      }
      let end = value.substring(endStart);
      const endNlPos = end.indexOf("\n");
      if (endNlPos === -1) {
        chomp = "-";
      } else if (value === end || endNlPos !== end.length - 1) {
        chomp = "+";
        if (onChompKeep)
          onChompKeep();
      } else {
        chomp = "";
      }
      if (end) {
        value = value.slice(0, -end.length);
        if (end[end.length - 1] === "\n")
          end = end.slice(0, -1);
        end = end.replace(blockEndNewlines, `$&${indent}`);
      }
      let startWithSpace = false;
      let startEnd;
      let startNlPos = -1;
      for (startEnd = 0; startEnd < value.length; ++startEnd) {
        const ch = value[startEnd];
        if (ch === " ")
          startWithSpace = true;
        else if (ch === "\n")
          startNlPos = startEnd;
        else
          break;
      }
      let start = value.substring(0, startNlPos < startEnd ? startNlPos + 1 : startEnd);
      if (start) {
        value = value.substring(start.length);
        start = start.replace(/\n+/g, `$&${indent}`);
      }
      const indentSize = indent ? "2" : "1";
      let header = (startWithSpace ? indentSize : "") + chomp;
      if (comment) {
        header += " " + commentString(comment.replace(/ ?[\r\n]+/g, " "));
        if (onComment)
          onComment();
      }
      if (!literal) {
        const foldedValue = value.replace(/\n+/g, "\n$&").replace(/(?:^|\n)([\t ].*)(?:([\n\t ]*)\n(?![\n\t ]))?/g, "$1$2").replace(/\n+/g, `$&${indent}`);
        let literalFallback = false;
        const foldOptions = getFoldOptions(ctx, true);
        if (blockQuote !== "folded" && type !== Scalar.Scalar.BLOCK_FOLDED) {
          foldOptions.onOverflow = () => {
            literalFallback = true;
          };
        }
        const body = foldFlowLines.foldFlowLines(`${start}${foldedValue}${end}`, indent, foldFlowLines.FOLD_BLOCK, foldOptions);
        if (!literalFallback)
          return `>${header}
${indent}${body}`;
      }
      value = value.replace(/\n+/g, `$&${indent}`);
      return `|${header}
${indent}${start}${value}${end}`;
    }
    function plainString(item, ctx, onComment, onChompKeep) {
      const { type, value } = item;
      const { actualString, implicitKey, indent, indentStep, inFlow } = ctx;
      if (implicitKey && value.includes("\n") || inFlow && /[[\]{},]/.test(value)) {
        return quotedString(value, ctx);
      }
      if (/^[\n\t ,[\]{}#&*!|>'"%@`]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$/.test(value)) {
        return implicitKey || inFlow || !value.includes("\n") ? quotedString(value, ctx) : blockString(item, ctx, onComment, onChompKeep);
      }
      if (!implicitKey && !inFlow && type !== Scalar.Scalar.PLAIN && value.includes("\n")) {
        return blockString(item, ctx, onComment, onChompKeep);
      }
      if (containsDocumentMarker(value)) {
        if (indent === "") {
          ctx.forceBlockIndent = true;
          return blockString(item, ctx, onComment, onChompKeep);
        } else if (implicitKey && indent === indentStep) {
          return quotedString(value, ctx);
        }
      }
      const str = value.replace(/\n+/g, `$&
${indent}`);
      if (actualString) {
        const test = (tag) => tag.default && tag.tag !== "tag:yaml.org,2002:str" && tag.test?.test(str);
        const { compat, tags } = ctx.doc.schema;
        if (tags.some(test) || compat?.some(test))
          return quotedString(value, ctx);
      }
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function stringifyString(item, ctx, onComment, onChompKeep) {
      const { implicitKey, inFlow } = ctx;
      const ss = typeof item.value === "string" ? item : Object.assign({}, item, { value: String(item.value) });
      let { type } = item;
      if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
        if (/[\x00-\x08\x0b-\x1f\x7f-\x9f\u{D800}-\u{DFFF}]/u.test(ss.value))
          type = Scalar.Scalar.QUOTE_DOUBLE;
      }
      const _stringify = (_type) => {
        switch (_type) {
          case Scalar.Scalar.BLOCK_FOLDED:
          case Scalar.Scalar.BLOCK_LITERAL:
            return implicitKey || inFlow ? quotedString(ss.value, ctx) : blockString(ss, ctx, onComment, onChompKeep);
          case Scalar.Scalar.QUOTE_DOUBLE:
            return doubleQuotedString(ss.value, ctx);
          case Scalar.Scalar.QUOTE_SINGLE:
            return singleQuotedString(ss.value, ctx);
          case Scalar.Scalar.PLAIN:
            return plainString(ss, ctx, onComment, onChompKeep);
          default:
            return null;
        }
      };
      let res = _stringify(type);
      if (res === null) {
        const { defaultKeyType, defaultStringType } = ctx.options;
        const t = implicitKey && defaultKeyType || defaultStringType;
        res = _stringify(t);
        if (res === null)
          throw new Error(`Unsupported default string type ${t}`);
      }
      return res;
    }
    exports.stringifyString = stringifyString;
  }
});

// node_modules/yaml/dist/stringify/stringify.js
var require_stringify = __commonJS({
  "node_modules/yaml/dist/stringify/stringify.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var identity = require_identity();
    var stringifyComment = require_stringifyComment();
    var stringifyString = require_stringifyString();
    function createStringifyContext(doc, options) {
      const opt = Object.assign({
        blockQuote: true,
        commentString: stringifyComment.stringifyComment,
        defaultKeyType: null,
        defaultStringType: "PLAIN",
        directives: null,
        doubleQuotedAsJSON: false,
        doubleQuotedMinMultiLineLength: 40,
        falseStr: "false",
        flowCollectionPadding: true,
        indentSeq: true,
        lineWidth: 80,
        minContentWidth: 20,
        nullStr: "null",
        simpleKeys: false,
        singleQuote: null,
        trailingComma: false,
        trueStr: "true",
        verifyAliasOrder: true
      }, doc.schema.toStringOptions, options);
      let inFlow;
      switch (opt.collectionStyle) {
        case "block":
          inFlow = false;
          break;
        case "flow":
          inFlow = true;
          break;
        default:
          inFlow = null;
      }
      return {
        anchors: /* @__PURE__ */ new Set(),
        doc,
        flowCollectionPadding: opt.flowCollectionPadding ? " " : "",
        indent: "",
        indentStep: typeof opt.indent === "number" ? " ".repeat(opt.indent) : "  ",
        inFlow,
        options: opt
      };
    }
    function getTagObject(tags, item) {
      if (item.tag) {
        const match = tags.filter((t) => t.tag === item.tag);
        if (match.length > 0)
          return match.find((t) => t.format === item.format) ?? match[0];
      }
      let tagObj = void 0;
      let obj;
      if (identity.isScalar(item)) {
        obj = item.value;
        let match = tags.filter((t) => t.identify?.(obj));
        if (match.length > 1) {
          const testMatch = match.filter((t) => t.test);
          if (testMatch.length > 0)
            match = testMatch;
        }
        tagObj = match.find((t) => t.format === item.format) ?? match.find((t) => !t.format);
      } else {
        obj = item;
        tagObj = tags.find((t) => t.nodeClass && obj instanceof t.nodeClass);
      }
      if (!tagObj) {
        const name = obj?.constructor?.name ?? (obj === null ? "null" : typeof obj);
        throw new Error(`Tag not resolved for ${name} value`);
      }
      return tagObj;
    }
    function stringifyProps(node, tagObj, { anchors: anchors$1, doc }) {
      if (!doc.directives)
        return "";
      const props = [];
      const anchor = (identity.isScalar(node) || identity.isCollection(node)) && node.anchor;
      if (anchor && anchors.anchorIsValid(anchor)) {
        anchors$1.add(anchor);
        props.push(`&${anchor}`);
      }
      const tag = node.tag ?? (tagObj.default ? null : tagObj.tag);
      if (tag)
        props.push(doc.directives.tagString(tag));
      return props.join(" ");
    }
    function stringify(item, ctx, onComment, onChompKeep) {
      if (identity.isPair(item))
        return item.toString(ctx, onComment, onChompKeep);
      if (identity.isAlias(item)) {
        if (ctx.doc.directives)
          return item.toString(ctx);
        if (ctx.resolvedAliases?.has(item)) {
          throw new TypeError(`Cannot stringify circular structure without alias nodes`);
        } else {
          if (ctx.resolvedAliases)
            ctx.resolvedAliases.add(item);
          else
            ctx.resolvedAliases = /* @__PURE__ */ new Set([item]);
          item = item.resolve(ctx.doc);
        }
      }
      let tagObj = void 0;
      const node = identity.isNode(item) ? item : ctx.doc.createNode(item, { onTagObj: (o) => tagObj = o });
      tagObj ?? (tagObj = getTagObject(ctx.doc.schema.tags, node));
      const props = stringifyProps(node, tagObj, ctx);
      if (props.length > 0)
        ctx.indentAtStart = (ctx.indentAtStart ?? 0) + props.length + 1;
      const str = typeof tagObj.stringify === "function" ? tagObj.stringify(node, ctx, onComment, onChompKeep) : identity.isScalar(node) ? stringifyString.stringifyString(node, ctx, onComment, onChompKeep) : node.toString(ctx, onComment, onChompKeep);
      if (!props)
        return str;
      return identity.isScalar(node) || str[0] === "{" || str[0] === "[" ? `${props} ${str}` : `${props}
${ctx.indent}${str}`;
    }
    exports.createStringifyContext = createStringifyContext;
    exports.stringify = stringify;
  }
});

// node_modules/yaml/dist/stringify/stringifyPair.js
var require_stringifyPair = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyPair.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyPair({ key, value }, ctx, onComment, onChompKeep) {
      const { allNullValues, doc, indent, indentStep, options: { commentString, indentSeq, simpleKeys } } = ctx;
      let keyComment = identity.isNode(key) && key.comment || null;
      if (simpleKeys) {
        if (keyComment) {
          throw new Error("With simple keys, key nodes cannot have comments");
        }
        if (identity.isCollection(key) || !identity.isNode(key) && typeof key === "object") {
          const msg = "With simple keys, collection cannot be used as a key value";
          throw new Error(msg);
        }
      }
      let explicitKey = !simpleKeys && (!key || keyComment && value == null && !ctx.inFlow || identity.isCollection(key) || (identity.isScalar(key) ? key.type === Scalar.Scalar.BLOCK_FOLDED || key.type === Scalar.Scalar.BLOCK_LITERAL : typeof key === "object"));
      ctx = Object.assign({}, ctx, {
        allNullValues: false,
        implicitKey: !explicitKey && (simpleKeys || !allNullValues),
        indent: indent + indentStep
      });
      let keyCommentDone = false;
      let chompKeep = false;
      let str = stringify.stringify(key, ctx, () => keyCommentDone = true, () => chompKeep = true);
      if (!explicitKey && !ctx.inFlow && str.length > 1024) {
        if (simpleKeys)
          throw new Error("With simple keys, single line scalar must not span more than 1024 characters");
        explicitKey = true;
      }
      if (ctx.inFlow) {
        if (allNullValues || value == null) {
          if (keyCommentDone && onComment)
            onComment();
          return str === "" ? "?" : explicitKey ? `? ${str}` : str;
        }
      } else if (allNullValues && !simpleKeys || value == null && explicitKey) {
        str = `? ${str}`;
        if (keyComment && !keyCommentDone) {
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        } else if (chompKeep && onChompKeep)
          onChompKeep();
        return str;
      }
      if (keyCommentDone)
        keyComment = null;
      if (explicitKey) {
        if (keyComment)
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        str = `? ${str}
${indent}:`;
      } else {
        str = `${str}:`;
        if (keyComment)
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
      }
      let vsb, vcb, valueComment;
      if (identity.isNode(value)) {
        vsb = !!value.spaceBefore;
        vcb = value.commentBefore;
        valueComment = value.comment;
      } else {
        vsb = false;
        vcb = null;
        valueComment = null;
        if (value && typeof value === "object")
          value = doc.createNode(value);
      }
      ctx.implicitKey = false;
      if (!explicitKey && !keyComment && identity.isScalar(value))
        ctx.indentAtStart = str.length + 1;
      chompKeep = false;
      if (!indentSeq && indentStep.length >= 2 && !ctx.inFlow && !explicitKey && identity.isSeq(value) && !value.flow && !value.tag && !value.anchor) {
        ctx.indent = ctx.indent.substring(2);
      }
      let valueCommentDone = false;
      const valueStr = stringify.stringify(value, ctx, () => valueCommentDone = true, () => chompKeep = true);
      let ws = " ";
      if (keyComment || vsb || vcb) {
        ws = vsb ? "\n" : "";
        if (vcb) {
          const cs = commentString(vcb);
          ws += `
${stringifyComment.indentComment(cs, ctx.indent)}`;
        }
        if (valueStr === "" && !ctx.inFlow) {
          if (ws === "\n" && valueComment)
            ws = "\n\n";
        } else {
          ws += `
${ctx.indent}`;
        }
      } else if (!explicitKey && identity.isCollection(value)) {
        const vs0 = valueStr[0];
        const nl0 = valueStr.indexOf("\n");
        const hasNewline = nl0 !== -1;
        const flow = ctx.inFlow ?? value.flow ?? value.items.length === 0;
        if (hasNewline || !flow) {
          let hasPropsLine = false;
          if (hasNewline && (vs0 === "&" || vs0 === "!")) {
            let sp0 = valueStr.indexOf(" ");
            if (vs0 === "&" && sp0 !== -1 && sp0 < nl0 && valueStr[sp0 + 1] === "!") {
              sp0 = valueStr.indexOf(" ", sp0 + 1);
            }
            if (sp0 === -1 || nl0 < sp0)
              hasPropsLine = true;
          }
          if (!hasPropsLine)
            ws = `
${ctx.indent}`;
        }
      } else if (valueStr === "" || valueStr[0] === "\n") {
        ws = "";
      }
      str += ws + valueStr;
      if (ctx.inFlow) {
        if (valueCommentDone && onComment)
          onComment();
      } else if (valueComment && !valueCommentDone) {
        str += stringifyComment.lineComment(str, ctx.indent, commentString(valueComment));
      } else if (chompKeep && onChompKeep) {
        onChompKeep();
      }
      return str;
    }
    exports.stringifyPair = stringifyPair;
  }
});

// node_modules/yaml/dist/log.js
var require_log = __commonJS({
  "node_modules/yaml/dist/log.js"(exports) {
    "use strict";
    var node_process = __require("process");
    function debug(logLevel, ...messages) {
      if (logLevel === "debug")
        console.log(...messages);
    }
    function warn(logLevel, warning) {
      if (logLevel === "debug" || logLevel === "warn") {
        if (typeof node_process.emitWarning === "function")
          node_process.emitWarning(warning);
        else
          console.warn(warning);
      }
    }
    exports.debug = debug;
    exports.warn = warn;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/merge.js
var require_merge = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/merge.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var MERGE_KEY = "<<";
    var merge = {
      identify: (value) => value === MERGE_KEY || typeof value === "symbol" && value.description === MERGE_KEY,
      default: "key",
      tag: "tag:yaml.org,2002:merge",
      test: /^<<$/,
      resolve: () => Object.assign(new Scalar.Scalar(Symbol(MERGE_KEY)), {
        addToJSMap: addMergeToJSMap
      }),
      stringify: () => MERGE_KEY
    };
    var isMergeKey = (ctx, key) => (merge.identify(key) || identity.isScalar(key) && (!key.type || key.type === Scalar.Scalar.PLAIN) && merge.identify(key.value)) && ctx?.doc.schema.tags.some((tag) => tag.tag === merge.tag && tag.default);
    function addMergeToJSMap(ctx, map, value) {
      value = ctx && identity.isAlias(value) ? value.resolve(ctx.doc) : value;
      if (identity.isSeq(value))
        for (const it of value.items)
          mergeValue(ctx, map, it);
      else if (Array.isArray(value))
        for (const it of value)
          mergeValue(ctx, map, it);
      else
        mergeValue(ctx, map, value);
    }
    function mergeValue(ctx, map, value) {
      const source = ctx && identity.isAlias(value) ? value.resolve(ctx.doc) : value;
      if (!identity.isMap(source))
        throw new Error("Merge sources must be maps or map aliases");
      const srcMap = source.toJSON(null, ctx, Map);
      for (const [key, value2] of srcMap) {
        if (map instanceof Map) {
          if (!map.has(key))
            map.set(key, value2);
        } else if (map instanceof Set) {
          map.add(key);
        } else if (!Object.prototype.hasOwnProperty.call(map, key)) {
          Object.defineProperty(map, key, {
            value: value2,
            writable: true,
            enumerable: true,
            configurable: true
          });
        }
      }
      return map;
    }
    exports.addMergeToJSMap = addMergeToJSMap;
    exports.isMergeKey = isMergeKey;
    exports.merge = merge;
  }
});

// node_modules/yaml/dist/nodes/addPairToJSMap.js
var require_addPairToJSMap = __commonJS({
  "node_modules/yaml/dist/nodes/addPairToJSMap.js"(exports) {
    "use strict";
    var log = require_log();
    var merge = require_merge();
    var stringify = require_stringify();
    var identity = require_identity();
    var toJS = require_toJS();
    function addPairToJSMap(ctx, map, { key, value }) {
      if (identity.isNode(key) && key.addToJSMap)
        key.addToJSMap(ctx, map, value);
      else if (merge.isMergeKey(ctx, key))
        merge.addMergeToJSMap(ctx, map, value);
      else {
        const jsKey = toJS.toJS(key, "", ctx);
        if (map instanceof Map) {
          map.set(jsKey, toJS.toJS(value, jsKey, ctx));
        } else if (map instanceof Set) {
          map.add(jsKey);
        } else {
          const stringKey = stringifyKey(key, jsKey, ctx);
          const jsValue = toJS.toJS(value, stringKey, ctx);
          if (stringKey in map)
            Object.defineProperty(map, stringKey, {
              value: jsValue,
              writable: true,
              enumerable: true,
              configurable: true
            });
          else
            map[stringKey] = jsValue;
        }
      }
      return map;
    }
    function stringifyKey(key, jsKey, ctx) {
      if (jsKey === null)
        return "";
      if (typeof jsKey !== "object")
        return String(jsKey);
      if (identity.isNode(key) && ctx?.doc) {
        const strCtx = stringify.createStringifyContext(ctx.doc, {});
        strCtx.anchors = /* @__PURE__ */ new Set();
        for (const node of ctx.anchors.keys())
          strCtx.anchors.add(node.anchor);
        strCtx.inFlow = true;
        strCtx.inStringifyKey = true;
        const strKey = key.toString(strCtx);
        if (!ctx.mapKeyWarned) {
          let jsonStr = JSON.stringify(strKey);
          if (jsonStr.length > 40)
            jsonStr = jsonStr.substring(0, 36) + '..."';
          log.warn(ctx.doc.options.logLevel, `Keys with collection values will be stringified due to JS Object restrictions: ${jsonStr}. Set mapAsMap: true to use object keys.`);
          ctx.mapKeyWarned = true;
        }
        return strKey;
      }
      return JSON.stringify(jsKey);
    }
    exports.addPairToJSMap = addPairToJSMap;
  }
});

// node_modules/yaml/dist/nodes/Pair.js
var require_Pair = __commonJS({
  "node_modules/yaml/dist/nodes/Pair.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyPair = require_stringifyPair();
    var addPairToJSMap = require_addPairToJSMap();
    var identity = require_identity();
    function createPair(key, value, ctx) {
      const k = createNode.createNode(key, void 0, ctx);
      const v = createNode.createNode(value, void 0, ctx);
      return new Pair(k, v);
    }
    var Pair = class _Pair {
      constructor(key, value = null) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.PAIR });
        this.key = key;
        this.value = value;
      }
      clone(schema) {
        let { key, value } = this;
        if (identity.isNode(key))
          key = key.clone(schema);
        if (identity.isNode(value))
          value = value.clone(schema);
        return new _Pair(key, value);
      }
      toJSON(_, ctx) {
        const pair = ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        return addPairToJSMap.addPairToJSMap(ctx, pair, this);
      }
      toString(ctx, onComment, onChompKeep) {
        return ctx?.doc ? stringifyPair.stringifyPair(this, ctx, onComment, onChompKeep) : JSON.stringify(this);
      }
    };
    exports.Pair = Pair;
    exports.createPair = createPair;
  }
});

// node_modules/yaml/dist/stringify/stringifyCollection.js
var require_stringifyCollection = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyCollection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyCollection(collection, ctx, options) {
      const flow = ctx.inFlow ?? collection.flow;
      const stringify2 = flow ? stringifyFlowCollection : stringifyBlockCollection;
      return stringify2(collection, ctx, options);
    }
    function stringifyBlockCollection({ comment, items }, ctx, { blockItemPrefix, flowChars, itemIndent, onChompKeep, onComment }) {
      const { indent, options: { commentString } } = ctx;
      const itemCtx = Object.assign({}, ctx, { indent: itemIndent, type: null });
      let chompKeep = false;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment2 = null;
        if (identity.isNode(item)) {
          if (!chompKeep && item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, chompKeep);
          if (item.comment)
            comment2 = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (!chompKeep && ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, chompKeep);
          }
        }
        chompKeep = false;
        let str2 = stringify.stringify(item, itemCtx, () => comment2 = null, () => chompKeep = true);
        if (comment2)
          str2 += stringifyComment.lineComment(str2, itemIndent, commentString(comment2));
        if (chompKeep && comment2)
          chompKeep = false;
        lines.push(blockItemPrefix + str2);
      }
      let str;
      if (lines.length === 0) {
        str = flowChars.start + flowChars.end;
      } else {
        str = lines[0];
        for (let i = 1; i < lines.length; ++i) {
          const line = lines[i];
          str += line ? `
${indent}${line}` : "\n";
        }
      }
      if (comment) {
        str += "\n" + stringifyComment.indentComment(commentString(comment), indent);
        if (onComment)
          onComment();
      } else if (chompKeep && onChompKeep)
        onChompKeep();
      return str;
    }
    function stringifyFlowCollection({ items }, ctx, { flowChars, itemIndent }) {
      const { indent, indentStep, flowCollectionPadding: fcPadding, options: { commentString } } = ctx;
      itemIndent += indentStep;
      const itemCtx = Object.assign({}, ctx, {
        indent: itemIndent,
        inFlow: true,
        type: null
      });
      let reqNewline = false;
      let linesAtValue = 0;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment = null;
        if (identity.isNode(item)) {
          if (item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, false);
          if (item.comment)
            comment = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, false);
            if (ik.comment)
              reqNewline = true;
          }
          const iv = identity.isNode(item.value) ? item.value : null;
          if (iv) {
            if (iv.comment)
              comment = iv.comment;
            if (iv.commentBefore)
              reqNewline = true;
          } else if (item.value == null && ik?.comment) {
            comment = ik.comment;
          }
        }
        if (comment)
          reqNewline = true;
        let str = stringify.stringify(item, itemCtx, () => comment = null);
        reqNewline || (reqNewline = lines.length > linesAtValue || str.includes("\n"));
        if (i < items.length - 1) {
          str += ",";
        } else if (ctx.options.trailingComma) {
          if (ctx.options.lineWidth > 0) {
            reqNewline || (reqNewline = lines.reduce((sum, line) => sum + line.length + 2, 2) + (str.length + 2) > ctx.options.lineWidth);
          }
          if (reqNewline) {
            str += ",";
          }
        }
        if (comment)
          str += stringifyComment.lineComment(str, itemIndent, commentString(comment));
        lines.push(str);
        linesAtValue = lines.length;
      }
      const { start, end } = flowChars;
      if (lines.length === 0) {
        return start + end;
      } else {
        if (!reqNewline) {
          const len = lines.reduce((sum, line) => sum + line.length + 2, 2);
          reqNewline = ctx.options.lineWidth > 0 && len > ctx.options.lineWidth;
        }
        if (reqNewline) {
          let str = start;
          for (const line of lines)
            str += line ? `
${indentStep}${indent}${line}` : "\n";
          return `${str}
${indent}${end}`;
        } else {
          return `${start}${fcPadding}${lines.join(" ")}${fcPadding}${end}`;
        }
      }
    }
    function addCommentBefore({ indent, options: { commentString } }, lines, comment, chompKeep) {
      if (comment && chompKeep)
        comment = comment.replace(/^\n+/, "");
      if (comment) {
        const ic = stringifyComment.indentComment(commentString(comment), indent);
        lines.push(ic.trimStart());
      }
    }
    exports.stringifyCollection = stringifyCollection;
  }
});

// node_modules/yaml/dist/nodes/YAMLMap.js
var require_YAMLMap = __commonJS({
  "node_modules/yaml/dist/nodes/YAMLMap.js"(exports) {
    "use strict";
    var stringifyCollection = require_stringifyCollection();
    var addPairToJSMap = require_addPairToJSMap();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    function findPair(items, key) {
      const k = identity.isScalar(key) ? key.value : key;
      for (const it of items) {
        if (identity.isPair(it)) {
          if (it.key === key || it.key === k)
            return it;
          if (identity.isScalar(it.key) && it.key.value === k)
            return it;
        }
      }
      return void 0;
    }
    var YAMLMap = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:map";
      }
      constructor(schema) {
        super(identity.MAP, schema);
        this.items = [];
      }
      /**
       * A generic collection parsing method that can be extended
       * to other node classes that inherit from YAMLMap
       */
      static from(schema, obj, ctx) {
        const { keepUndefined, replacer } = ctx;
        const map = new this(schema);
        const add = (key, value) => {
          if (typeof replacer === "function")
            value = replacer.call(obj, key, value);
          else if (Array.isArray(replacer) && !replacer.includes(key))
            return;
          if (value !== void 0 || keepUndefined)
            map.items.push(Pair.createPair(key, value, ctx));
        };
        if (obj instanceof Map) {
          for (const [key, value] of obj)
            add(key, value);
        } else if (obj && typeof obj === "object") {
          for (const key of Object.keys(obj))
            add(key, obj[key]);
        }
        if (typeof schema.sortMapEntries === "function") {
          map.items.sort(schema.sortMapEntries);
        }
        return map;
      }
      /**
       * Adds a value to the collection.
       *
       * @param overwrite - If not set `true`, using a key that is already in the
       *   collection will throw. Otherwise, overwrites the previous value.
       */
      add(pair, overwrite) {
        let _pair;
        if (identity.isPair(pair))
          _pair = pair;
        else if (!pair || typeof pair !== "object" || !("key" in pair)) {
          _pair = new Pair.Pair(pair, pair?.value);
        } else
          _pair = new Pair.Pair(pair.key, pair.value);
        const prev = findPair(this.items, _pair.key);
        const sortEntries = this.schema?.sortMapEntries;
        if (prev) {
          if (!overwrite)
            throw new Error(`Key ${_pair.key} already set`);
          if (identity.isScalar(prev.value) && Scalar.isScalarValue(_pair.value))
            prev.value.value = _pair.value;
          else
            prev.value = _pair.value;
        } else if (sortEntries) {
          const i = this.items.findIndex((item) => sortEntries(_pair, item) < 0);
          if (i === -1)
            this.items.push(_pair);
          else
            this.items.splice(i, 0, _pair);
        } else {
          this.items.push(_pair);
        }
      }
      delete(key) {
        const it = findPair(this.items, key);
        if (!it)
          return false;
        const del = this.items.splice(this.items.indexOf(it), 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const it = findPair(this.items, key);
        const node = it?.value;
        return (!keepScalar && identity.isScalar(node) ? node.value : node) ?? void 0;
      }
      has(key) {
        return !!findPair(this.items, key);
      }
      set(key, value) {
        this.add(new Pair.Pair(key, value), true);
      }
      /**
       * @param ctx - Conversion context, originally set in Document#toJS()
       * @param {Class} Type - If set, forces the returned collection type
       * @returns Instance of Type, Map, or Object
       */
      toJSON(_, ctx, Type2) {
        const map = Type2 ? new Type2() : ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const item of this.items)
          addPairToJSMap.addPairToJSMap(ctx, map, item);
        return map;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        for (const item of this.items) {
          if (!identity.isPair(item))
            throw new Error(`Map items must all be pairs; found ${JSON.stringify(item)} instead`);
        }
        if (!ctx.allNullValues && this.hasAllNullValues(false))
          ctx = Object.assign({}, ctx, { allNullValues: true });
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "",
          flowChars: { start: "{", end: "}" },
          itemIndent: ctx.indent || "",
          onChompKeep,
          onComment
        });
      }
    };
    exports.YAMLMap = YAMLMap;
    exports.findPair = findPair;
  }
});

// node_modules/yaml/dist/schema/common/map.js
var require_map = __commonJS({
  "node_modules/yaml/dist/schema/common/map.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLMap = require_YAMLMap();
    var map = {
      collection: "map",
      default: true,
      nodeClass: YAMLMap.YAMLMap,
      tag: "tag:yaml.org,2002:map",
      resolve(map2, onError) {
        if (!identity.isMap(map2))
          onError("Expected a mapping for this tag");
        return map2;
      },
      createNode: (schema, obj, ctx) => YAMLMap.YAMLMap.from(schema, obj, ctx)
    };
    exports.map = map;
  }
});

// node_modules/yaml/dist/nodes/YAMLSeq.js
var require_YAMLSeq = __commonJS({
  "node_modules/yaml/dist/nodes/YAMLSeq.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyCollection = require_stringifyCollection();
    var Collection = require_Collection();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var toJS = require_toJS();
    var YAMLSeq = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:seq";
      }
      constructor(schema) {
        super(identity.SEQ, schema);
        this.items = [];
      }
      add(value) {
        this.items.push(value);
      }
      /**
       * Removes a value from the collection.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       *
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return false;
        const del = this.items.splice(idx, 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return void 0;
        const it = this.items[idx];
        return !keepScalar && identity.isScalar(it) ? it.value : it;
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       */
      has(key) {
        const idx = asItemIndex(key);
        return typeof idx === "number" && idx < this.items.length;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       *
       * If `key` does not contain a representation of an integer, this will throw.
       * It may be wrapped in a `Scalar`.
       */
      set(key, value) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          throw new Error(`Expected a valid index, not ${key}.`);
        const prev = this.items[idx];
        if (identity.isScalar(prev) && Scalar.isScalarValue(value))
          prev.value = value;
        else
          this.items[idx] = value;
      }
      toJSON(_, ctx) {
        const seq = [];
        if (ctx?.onCreate)
          ctx.onCreate(seq);
        let i = 0;
        for (const item of this.items)
          seq.push(toJS.toJS(item, String(i++), ctx));
        return seq;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "- ",
          flowChars: { start: "[", end: "]" },
          itemIndent: (ctx.indent || "") + "  ",
          onChompKeep,
          onComment
        });
      }
      static from(schema, obj, ctx) {
        const { replacer } = ctx;
        const seq = new this(schema);
        if (obj && Symbol.iterator in Object(obj)) {
          let i = 0;
          for (let it of obj) {
            if (typeof replacer === "function") {
              const key = obj instanceof Set ? it : String(i++);
              it = replacer.call(obj, key, it);
            }
            seq.items.push(createNode.createNode(it, void 0, ctx));
          }
        }
        return seq;
      }
    };
    function asItemIndex(key) {
      let idx = identity.isScalar(key) ? key.value : key;
      if (idx && typeof idx === "string")
        idx = Number(idx);
      return typeof idx === "number" && Number.isInteger(idx) && idx >= 0 ? idx : null;
    }
    exports.YAMLSeq = YAMLSeq;
  }
});

// node_modules/yaml/dist/schema/common/seq.js
var require_seq = __commonJS({
  "node_modules/yaml/dist/schema/common/seq.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLSeq = require_YAMLSeq();
    var seq = {
      collection: "seq",
      default: true,
      nodeClass: YAMLSeq.YAMLSeq,
      tag: "tag:yaml.org,2002:seq",
      resolve(seq2, onError) {
        if (!identity.isSeq(seq2))
          onError("Expected a sequence for this tag");
        return seq2;
      },
      createNode: (schema, obj, ctx) => YAMLSeq.YAMLSeq.from(schema, obj, ctx)
    };
    exports.seq = seq;
  }
});

// node_modules/yaml/dist/schema/common/string.js
var require_string = __commonJS({
  "node_modules/yaml/dist/schema/common/string.js"(exports) {
    "use strict";
    var stringifyString = require_stringifyString();
    var string = {
      identify: (value) => typeof value === "string",
      default: true,
      tag: "tag:yaml.org,2002:str",
      resolve: (str) => str,
      stringify(item, ctx, onComment, onChompKeep) {
        ctx = Object.assign({ actualString: true }, ctx);
        return stringifyString.stringifyString(item, ctx, onComment, onChompKeep);
      }
    };
    exports.string = string;
  }
});

// node_modules/yaml/dist/schema/common/null.js
var require_null = __commonJS({
  "node_modules/yaml/dist/schema/common/null.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var nullTag = {
      identify: (value) => value == null,
      createNode: () => new Scalar.Scalar(null),
      default: true,
      tag: "tag:yaml.org,2002:null",
      test: /^(?:~|[Nn]ull|NULL)?$/,
      resolve: () => new Scalar.Scalar(null),
      stringify: ({ source }, ctx) => typeof source === "string" && nullTag.test.test(source) ? source : ctx.options.nullStr
    };
    exports.nullTag = nullTag;
  }
});

// node_modules/yaml/dist/schema/core/bool.js
var require_bool = __commonJS({
  "node_modules/yaml/dist/schema/core/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var boolTag = {
      identify: (value) => typeof value === "boolean",
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$/,
      resolve: (str) => new Scalar.Scalar(str[0] === "t" || str[0] === "T"),
      stringify({ source, value }, ctx) {
        if (source && boolTag.test.test(source)) {
          const sv = source[0] === "t" || source[0] === "T";
          if (value === sv)
            return source;
        }
        return value ? ctx.options.trueStr : ctx.options.falseStr;
      }
    };
    exports.boolTag = boolTag;
  }
});

// node_modules/yaml/dist/stringify/stringifyNumber.js
var require_stringifyNumber = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyNumber.js"(exports) {
    "use strict";
    function stringifyNumber({ format, minFractionDigits, tag, value }) {
      if (typeof value === "bigint")
        return String(value);
      const num = typeof value === "number" ? value : Number(value);
      if (!isFinite(num))
        return isNaN(num) ? ".nan" : num < 0 ? "-.inf" : ".inf";
      let n = Object.is(value, -0) ? "-0" : JSON.stringify(value);
      if (!format && minFractionDigits && (!tag || tag === "tag:yaml.org,2002:float") && /^\d/.test(n)) {
        let i = n.indexOf(".");
        if (i < 0) {
          i = n.length;
          n += ".";
        }
        let d = minFractionDigits - (n.length - i - 1);
        while (d-- > 0)
          n += "0";
      }
      return n;
    }
    exports.stringifyNumber = stringifyNumber;
  }
});

// node_modules/yaml/dist/schema/core/float.js
var require_float = __commonJS({
  "node_modules/yaml/dist/schema/core/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str),
      stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$/,
      resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str));
        const dot = str.indexOf(".");
        if (dot !== -1 && str[str.length - 1] === "0")
          node.minFractionDigits = str.length - dot - 1;
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// node_modules/yaml/dist/schema/core/int.js
var require_int = __commonJS({
  "node_modules/yaml/dist/schema/core/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    var intResolve = (str, offset, radix, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str.substring(offset), radix);
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value) && value >= 0)
        return prefix + value.toString(radix);
      return stringifyNumber.stringifyNumber(node);
    }
    var intOct = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^0o[0-7]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 8, opt),
      stringify: (node) => intStringify(node, 8, "0o")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^0x[0-9a-fA-F]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// node_modules/yaml/dist/schema/core/schema.js
var require_schema = __commonJS({
  "node_modules/yaml/dist/schema/core/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.boolTag,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float
    ];
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/json/schema.js
var require_schema2 = __commonJS({
  "node_modules/yaml/dist/schema/json/schema.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var map = require_map();
    var seq = require_seq();
    function intIdentify(value) {
      return typeof value === "bigint" || Number.isInteger(value);
    }
    var stringifyJSON = ({ value }) => JSON.stringify(value);
    var jsonScalars = [
      {
        identify: (value) => typeof value === "string",
        default: true,
        tag: "tag:yaml.org,2002:str",
        resolve: (str) => str,
        stringify: stringifyJSON
      },
      {
        identify: (value) => value == null,
        createNode: () => new Scalar.Scalar(null),
        default: true,
        tag: "tag:yaml.org,2002:null",
        test: /^null$/,
        resolve: () => null,
        stringify: stringifyJSON
      },
      {
        identify: (value) => typeof value === "boolean",
        default: true,
        tag: "tag:yaml.org,2002:bool",
        test: /^true$|^false$/,
        resolve: (str) => str === "true",
        stringify: stringifyJSON
      },
      {
        identify: intIdentify,
        default: true,
        tag: "tag:yaml.org,2002:int",
        test: /^-?(?:0|[1-9][0-9]*)$/,
        resolve: (str, _onError, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str, 10),
        stringify: ({ value }) => intIdentify(value) ? value.toString() : JSON.stringify(value)
      },
      {
        identify: (value) => typeof value === "number",
        default: true,
        tag: "tag:yaml.org,2002:float",
        test: /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$/,
        resolve: (str) => parseFloat(str),
        stringify: stringifyJSON
      }
    ];
    var jsonError = {
      default: true,
      tag: "",
      test: /^/,
      resolve(str, onError) {
        onError(`Unresolved plain scalar ${JSON.stringify(str)}`);
        return str;
      }
    };
    var schema = [map.map, seq.seq].concat(jsonScalars, jsonError);
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/binary.js
var require_binary = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/binary.js"(exports) {
    "use strict";
    var node_buffer = __require("buffer");
    var Scalar = require_Scalar();
    var stringifyString = require_stringifyString();
    var binary = {
      identify: (value) => value instanceof Uint8Array,
      // Buffer inherits from Uint8Array
      default: false,
      tag: "tag:yaml.org,2002:binary",
      /**
       * Returns a Buffer in node and an Uint8Array in browsers
       *
       * To use the resulting buffer as an image, you'll want to do something like:
       *
       *   const blob = new Blob([buffer], { type: 'image/jpeg' })
       *   document.querySelector('#photo').src = URL.createObjectURL(blob)
       */
      resolve(src, onError) {
        if (typeof node_buffer.Buffer === "function") {
          return node_buffer.Buffer.from(src, "base64");
        } else if (typeof atob === "function") {
          const str = atob(src.replace(/[\n\r]/g, ""));
          const buffer = new Uint8Array(str.length);
          for (let i = 0; i < str.length; ++i)
            buffer[i] = str.charCodeAt(i);
          return buffer;
        } else {
          onError("This environment does not support reading binary tags; either Buffer or atob is required");
          return src;
        }
      },
      stringify({ comment, type, value }, ctx, onComment, onChompKeep) {
        if (!value)
          return "";
        const buf = value;
        let str;
        if (typeof node_buffer.Buffer === "function") {
          str = buf instanceof node_buffer.Buffer ? buf.toString("base64") : node_buffer.Buffer.from(buf.buffer).toString("base64");
        } else if (typeof btoa === "function") {
          let s = "";
          for (let i = 0; i < buf.length; ++i)
            s += String.fromCharCode(buf[i]);
          str = btoa(s);
        } else {
          throw new Error("This environment does not support writing binary tags; either Buffer or btoa is required");
        }
        type ?? (type = Scalar.Scalar.BLOCK_LITERAL);
        if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
          const lineWidth = Math.max(ctx.options.lineWidth - ctx.indent.length, ctx.options.minContentWidth);
          const n = Math.ceil(str.length / lineWidth);
          const lines = new Array(n);
          for (let i = 0, o = 0; i < n; ++i, o += lineWidth) {
            lines[i] = str.substr(o, lineWidth);
          }
          str = lines.join(type === Scalar.Scalar.BLOCK_LITERAL ? "\n" : " ");
        }
        return stringifyString.stringifyString({ comment, type, value: str }, ctx, onComment, onChompKeep);
      }
    };
    exports.binary = binary;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/pairs.js
var require_pairs = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/pairs.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLSeq = require_YAMLSeq();
    function resolvePairs(seq, onError) {
      if (identity.isSeq(seq)) {
        for (let i = 0; i < seq.items.length; ++i) {
          let item = seq.items[i];
          if (identity.isPair(item))
            continue;
          else if (identity.isMap(item)) {
            if (item.items.length > 1)
              onError("Each pair must have its own sequence indicator");
            const pair = item.items[0] || new Pair.Pair(new Scalar.Scalar(null));
            if (item.commentBefore)
              pair.key.commentBefore = pair.key.commentBefore ? `${item.commentBefore}
${pair.key.commentBefore}` : item.commentBefore;
            if (item.comment) {
              const cn = pair.value ?? pair.key;
              cn.comment = cn.comment ? `${item.comment}
${cn.comment}` : item.comment;
            }
            item = pair;
          }
          seq.items[i] = identity.isPair(item) ? item : new Pair.Pair(item);
        }
      } else
        onError("Expected a sequence for this tag");
      return seq;
    }
    function createPairs(schema, iterable, ctx) {
      const { replacer } = ctx;
      const pairs2 = new YAMLSeq.YAMLSeq(schema);
      pairs2.tag = "tag:yaml.org,2002:pairs";
      let i = 0;
      if (iterable && Symbol.iterator in Object(iterable))
        for (let it of iterable) {
          if (typeof replacer === "function")
            it = replacer.call(iterable, String(i++), it);
          let key, value;
          if (Array.isArray(it)) {
            if (it.length === 2) {
              key = it[0];
              value = it[1];
            } else
              throw new TypeError(`Expected [key, value] tuple: ${it}`);
          } else if (it && it instanceof Object) {
            const keys = Object.keys(it);
            if (keys.length === 1) {
              key = keys[0];
              value = it[key];
            } else {
              throw new TypeError(`Expected tuple with one key, not ${keys.length} keys`);
            }
          } else {
            key = it;
          }
          pairs2.items.push(Pair.createPair(key, value, ctx));
        }
      return pairs2;
    }
    var pairs = {
      collection: "seq",
      default: false,
      tag: "tag:yaml.org,2002:pairs",
      resolve: resolvePairs,
      createNode: createPairs
    };
    exports.createPairs = createPairs;
    exports.pairs = pairs;
    exports.resolvePairs = resolvePairs;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/omap.js
var require_omap = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/omap.js"(exports) {
    "use strict";
    var identity = require_identity();
    var toJS = require_toJS();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var pairs = require_pairs();
    var YAMLOMap = class _YAMLOMap extends YAMLSeq.YAMLSeq {
      constructor() {
        super();
        this.add = YAMLMap.YAMLMap.prototype.add.bind(this);
        this.delete = YAMLMap.YAMLMap.prototype.delete.bind(this);
        this.get = YAMLMap.YAMLMap.prototype.get.bind(this);
        this.has = YAMLMap.YAMLMap.prototype.has.bind(this);
        this.set = YAMLMap.YAMLMap.prototype.set.bind(this);
        this.tag = _YAMLOMap.tag;
      }
      /**
       * If `ctx` is given, the return type is actually `Map<unknown, unknown>`,
       * but TypeScript won't allow widening the signature of a child method.
       */
      toJSON(_, ctx) {
        if (!ctx)
          return super.toJSON(_);
        const map = /* @__PURE__ */ new Map();
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const pair of this.items) {
          let key, value;
          if (identity.isPair(pair)) {
            key = toJS.toJS(pair.key, "", ctx);
            value = toJS.toJS(pair.value, key, ctx);
          } else {
            key = toJS.toJS(pair, "", ctx);
          }
          if (map.has(key))
            throw new Error("Ordered maps must not include duplicate keys");
          map.set(key, value);
        }
        return map;
      }
      static from(schema, iterable, ctx) {
        const pairs$1 = pairs.createPairs(schema, iterable, ctx);
        const omap2 = new this();
        omap2.items = pairs$1.items;
        return omap2;
      }
    };
    YAMLOMap.tag = "tag:yaml.org,2002:omap";
    var omap = {
      collection: "seq",
      identify: (value) => value instanceof Map,
      nodeClass: YAMLOMap,
      default: false,
      tag: "tag:yaml.org,2002:omap",
      resolve(seq, onError) {
        const pairs$1 = pairs.resolvePairs(seq, onError);
        const seenKeys = [];
        for (const { key } of pairs$1.items) {
          if (identity.isScalar(key)) {
            if (seenKeys.includes(key.value)) {
              onError(`Ordered maps must not include duplicate keys: ${key.value}`);
            } else {
              seenKeys.push(key.value);
            }
          }
        }
        return Object.assign(new YAMLOMap(), pairs$1);
      },
      createNode: (schema, iterable, ctx) => YAMLOMap.from(schema, iterable, ctx)
    };
    exports.YAMLOMap = YAMLOMap;
    exports.omap = omap;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/bool.js
var require_bool2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function boolStringify({ value, source }, ctx) {
      const boolObj = value ? trueTag : falseTag;
      if (source && boolObj.test.test(source))
        return source;
      return value ? ctx.options.trueStr : ctx.options.falseStr;
    }
    var trueTag = {
      identify: (value) => value === true,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:Y|y|[Yy]es|YES|[Tt]rue|TRUE|[Oo]n|ON)$/,
      resolve: () => new Scalar.Scalar(true),
      stringify: boolStringify
    };
    var falseTag = {
      identify: (value) => value === false,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:N|n|[Nn]o|NO|[Ff]alse|FALSE|[Oo]ff|OFF)$/,
      resolve: () => new Scalar.Scalar(false),
      stringify: boolStringify
    };
    exports.falseTag = falseTag;
    exports.trueTag = trueTag;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/float.js
var require_float2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:[0-9][0-9_]*)?(?:\.[0-9_]*)?[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str.replace(/_/g, "")),
      stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*$/,
      resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str.replace(/_/g, "")));
        const dot = str.indexOf(".");
        if (dot !== -1) {
          const f = str.substring(dot + 1).replace(/_/g, "");
          if (f[f.length - 1] === "0")
            node.minFractionDigits = f.length;
        }
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/int.js
var require_int2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    function intResolve(str, offset, radix, { intAsBigInt }) {
      const sign = str[0];
      if (sign === "-" || sign === "+")
        offset += 1;
      str = str.substring(offset).replace(/_/g, "");
      if (intAsBigInt) {
        switch (radix) {
          case 2:
            str = `0b${str}`;
            break;
          case 8:
            str = `0o${str}`;
            break;
          case 16:
            str = `0x${str}`;
            break;
        }
        const n2 = BigInt(str);
        return sign === "-" ? BigInt(-1) * n2 : n2;
      }
      const n = parseInt(str, radix);
      return sign === "-" ? -1 * n : n;
    }
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value)) {
        const str = value.toString(radix);
        return value < 0 ? "-" + prefix + str.substr(1) : prefix + str;
      }
      return stringifyNumber.stringifyNumber(node);
    }
    var intBin = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "BIN",
      test: /^[-+]?0b[0-1_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 2, opt),
      stringify: (node) => intStringify(node, 2, "0b")
    };
    var intOct = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^[-+]?0[0-7_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 1, 8, opt),
      stringify: (node) => intStringify(node, 8, "0")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9][0-9_]*$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^[-+]?0x[0-9a-fA-F_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intBin = intBin;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/set.js
var require_set = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/set.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSet = class _YAMLSet extends YAMLMap.YAMLMap {
      constructor(schema) {
        super(schema);
        this.tag = _YAMLSet.tag;
      }
      add(key) {
        let pair;
        if (identity.isPair(key))
          pair = key;
        else if (key && typeof key === "object" && "key" in key && "value" in key && key.value === null)
          pair = new Pair.Pair(key.key, null);
        else
          pair = new Pair.Pair(key, null);
        const prev = YAMLMap.findPair(this.items, pair.key);
        if (!prev)
          this.items.push(pair);
      }
      /**
       * If `keepPair` is `true`, returns the Pair matching `key`.
       * Otherwise, returns the value of that Pair's key.
       */
      get(key, keepPair) {
        const pair = YAMLMap.findPair(this.items, key);
        return !keepPair && identity.isPair(pair) ? identity.isScalar(pair.key) ? pair.key.value : pair.key : pair;
      }
      set(key, value) {
        if (typeof value !== "boolean")
          throw new Error(`Expected boolean value for set(key, value) in a YAML set, not ${typeof value}`);
        const prev = YAMLMap.findPair(this.items, key);
        if (prev && !value) {
          this.items.splice(this.items.indexOf(prev), 1);
        } else if (!prev && value) {
          this.items.push(new Pair.Pair(key));
        }
      }
      toJSON(_, ctx) {
        return super.toJSON(_, ctx, Set);
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        if (this.hasAllNullValues(true))
          return super.toString(Object.assign({}, ctx, { allNullValues: true }), onComment, onChompKeep);
        else
          throw new Error("Set items must all have null values");
      }
      static from(schema, iterable, ctx) {
        const { replacer } = ctx;
        const set2 = new this(schema);
        if (iterable && Symbol.iterator in Object(iterable))
          for (let value of iterable) {
            if (typeof replacer === "function")
              value = replacer.call(iterable, value, value);
            set2.items.push(Pair.createPair(value, null, ctx));
          }
        return set2;
      }
    };
    YAMLSet.tag = "tag:yaml.org,2002:set";
    var set = {
      collection: "map",
      identify: (value) => value instanceof Set,
      nodeClass: YAMLSet,
      default: false,
      tag: "tag:yaml.org,2002:set",
      createNode: (schema, iterable, ctx) => YAMLSet.from(schema, iterable, ctx),
      resolve(map, onError) {
        if (identity.isMap(map)) {
          if (map.hasAllNullValues(true))
            return Object.assign(new YAMLSet(), map);
          else
            onError("Set items must all have null values");
        } else
          onError("Expected a mapping for this tag");
        return map;
      }
    };
    exports.YAMLSet = YAMLSet;
    exports.set = set;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/timestamp.js
var require_timestamp = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/timestamp.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    function parseSexagesimal(str, asBigInt) {
      const sign = str[0];
      const parts = sign === "-" || sign === "+" ? str.substring(1) : str;
      const num = (n) => asBigInt ? BigInt(n) : Number(n);
      const res = parts.replace(/_/g, "").split(":").reduce((res2, p) => res2 * num(60) + num(p), num(0));
      return sign === "-" ? num(-1) * res : res;
    }
    function stringifySexagesimal(node) {
      let { value } = node;
      let num = (n) => n;
      if (typeof value === "bigint")
        num = (n) => BigInt(n);
      else if (isNaN(value) || !isFinite(value))
        return stringifyNumber.stringifyNumber(node);
      let sign = "";
      if (value < 0) {
        sign = "-";
        value *= num(-1);
      }
      const _60 = num(60);
      const parts = [value % _60];
      if (value < 60) {
        parts.unshift(0);
      } else {
        value = (value - parts[0]) / _60;
        parts.unshift(value % _60);
        if (value >= 60) {
          value = (value - parts[0]) / _60;
          parts.unshift(value);
        }
      }
      return sign + parts.map((n) => String(n).padStart(2, "0")).join(":").replace(/000000\d*$/, "");
    }
    var intTime = {
      identify: (value) => typeof value === "bigint" || Number.isInteger(value),
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$/,
      resolve: (str, _onError, { intAsBigInt }) => parseSexagesimal(str, intAsBigInt),
      stringify: stringifySexagesimal
    };
    var floatTime = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/,
      resolve: (str) => parseSexagesimal(str, false),
      stringify: stringifySexagesimal
    };
    var timestamp = {
      identify: (value) => value instanceof Date,
      default: true,
      tag: "tag:yaml.org,2002:timestamp",
      // If the time zone is omitted, the timestamp is assumed to be specified in UTC. The time part
      // may be omitted altogether, resulting in a date format. In such a case, the time part is
      // assumed to be 00:00:00Z (start of day, UTC).
      test: RegExp("^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})(?:(?:t|T|[ \\t]+)([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2}(\\.[0-9]+)?)(?:[ \\t]*(Z|[-+][012]?[0-9](?::[0-9]{2})?))?)?$"),
      resolve(str) {
        const match = str.match(timestamp.test);
        if (!match)
          throw new Error("!!timestamp expects a date, starting with yyyy-mm-dd");
        const [, year, month, day, hour, minute, second] = match.map(Number);
        const millisec = match[7] ? Number((match[7] + "00").substr(1, 3)) : 0;
        let date = Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0, millisec);
        const tz = match[8];
        if (tz && tz !== "Z") {
          let d = parseSexagesimal(tz, false);
          if (Math.abs(d) < 30)
            d *= 60;
          date -= 6e4 * d;
        }
        return new Date(date);
      },
      stringify: ({ value }) => value?.toISOString().replace(/(T00:00:00)?\.000Z$/, "") ?? ""
    };
    exports.floatTime = floatTime;
    exports.intTime = intTime;
    exports.timestamp = timestamp;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/schema.js
var require_schema3 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var binary = require_binary();
    var bool = require_bool2();
    var float = require_float2();
    var int = require_int2();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var set = require_set();
    var timestamp = require_timestamp();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.trueTag,
      bool.falseTag,
      int.intBin,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float,
      binary.binary,
      merge.merge,
      omap.omap,
      pairs.pairs,
      set.set,
      timestamp.intTime,
      timestamp.floatTime,
      timestamp.timestamp
    ];
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/tags.js
var require_tags = __commonJS({
  "node_modules/yaml/dist/schema/tags.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = require_schema();
    var schema$1 = require_schema2();
    var binary = require_binary();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var schema$2 = require_schema3();
    var set = require_set();
    var timestamp = require_timestamp();
    var schemas = /* @__PURE__ */ new Map([
      ["core", schema.schema],
      ["failsafe", [map.map, seq.seq, string.string]],
      ["json", schema$1.schema],
      ["yaml11", schema$2.schema],
      ["yaml-1.1", schema$2.schema]
    ]);
    var tagsByName = {
      binary: binary.binary,
      bool: bool.boolTag,
      float: float.float,
      floatExp: float.floatExp,
      floatNaN: float.floatNaN,
      floatTime: timestamp.floatTime,
      int: int.int,
      intHex: int.intHex,
      intOct: int.intOct,
      intTime: timestamp.intTime,
      map: map.map,
      merge: merge.merge,
      null: _null.nullTag,
      omap: omap.omap,
      pairs: pairs.pairs,
      seq: seq.seq,
      set: set.set,
      timestamp: timestamp.timestamp
    };
    var coreKnownTags = {
      "tag:yaml.org,2002:binary": binary.binary,
      "tag:yaml.org,2002:merge": merge.merge,
      "tag:yaml.org,2002:omap": omap.omap,
      "tag:yaml.org,2002:pairs": pairs.pairs,
      "tag:yaml.org,2002:set": set.set,
      "tag:yaml.org,2002:timestamp": timestamp.timestamp
    };
    function getTags(customTags, schemaName, addMergeTag) {
      const schemaTags = schemas.get(schemaName);
      if (schemaTags && !customTags) {
        return addMergeTag && !schemaTags.includes(merge.merge) ? schemaTags.concat(merge.merge) : schemaTags.slice();
      }
      let tags = schemaTags;
      if (!tags) {
        if (Array.isArray(customTags))
          tags = [];
        else {
          const keys = Array.from(schemas.keys()).filter((key) => key !== "yaml11").map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown schema "${schemaName}"; use one of ${keys} or define customTags array`);
        }
      }
      if (Array.isArray(customTags)) {
        for (const tag of customTags)
          tags = tags.concat(tag);
      } else if (typeof customTags === "function") {
        tags = customTags(tags.slice());
      }
      if (addMergeTag)
        tags = tags.concat(merge.merge);
      return tags.reduce((tags2, tag) => {
        const tagObj = typeof tag === "string" ? tagsByName[tag] : tag;
        if (!tagObj) {
          const tagName = JSON.stringify(tag);
          const keys = Object.keys(tagsByName).map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown custom tag ${tagName}; use one of ${keys}`);
        }
        if (!tags2.includes(tagObj))
          tags2.push(tagObj);
        return tags2;
      }, []);
    }
    exports.coreKnownTags = coreKnownTags;
    exports.getTags = getTags;
  }
});

// node_modules/yaml/dist/schema/Schema.js
var require_Schema = __commonJS({
  "node_modules/yaml/dist/schema/Schema.js"(exports) {
    "use strict";
    var identity = require_identity();
    var map = require_map();
    var seq = require_seq();
    var string = require_string();
    var tags = require_tags();
    var sortMapEntriesByKey = (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    var Schema = class _Schema {
      constructor({ compat, customTags, merge, resolveKnownTags, schema, sortMapEntries, toStringDefaults }) {
        this.compat = Array.isArray(compat) ? tags.getTags(compat, "compat") : compat ? tags.getTags(null, compat) : null;
        this.name = typeof schema === "string" && schema || "core";
        this.knownTags = resolveKnownTags ? tags.coreKnownTags : {};
        this.tags = tags.getTags(customTags, this.name, merge);
        this.toStringOptions = toStringDefaults ?? null;
        Object.defineProperty(this, identity.MAP, { value: map.map });
        Object.defineProperty(this, identity.SCALAR, { value: string.string });
        Object.defineProperty(this, identity.SEQ, { value: seq.seq });
        this.sortMapEntries = typeof sortMapEntries === "function" ? sortMapEntries : sortMapEntries === true ? sortMapEntriesByKey : null;
      }
      clone() {
        const copy = Object.create(_Schema.prototype, Object.getOwnPropertyDescriptors(this));
        copy.tags = this.tags.slice();
        return copy;
      }
    };
    exports.Schema = Schema;
  }
});

// node_modules/yaml/dist/stringify/stringifyDocument.js
var require_stringifyDocument = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyDocument.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyDocument(doc, options) {
      const lines = [];
      let hasDirectives = options.directives === true;
      if (options.directives !== false && doc.directives) {
        const dir = doc.directives.toString(doc);
        if (dir) {
          lines.push(dir);
          hasDirectives = true;
        } else if (doc.directives.docStart)
          hasDirectives = true;
      }
      if (hasDirectives)
        lines.push("---");
      const ctx = stringify.createStringifyContext(doc, options);
      const { commentString } = ctx.options;
      if (doc.commentBefore) {
        if (lines.length !== 1)
          lines.unshift("");
        const cs = commentString(doc.commentBefore);
        lines.unshift(stringifyComment.indentComment(cs, ""));
      }
      let chompKeep = false;
      let contentComment = null;
      if (doc.contents) {
        if (identity.isNode(doc.contents)) {
          if (doc.contents.spaceBefore && hasDirectives)
            lines.push("");
          if (doc.contents.commentBefore) {
            const cs = commentString(doc.contents.commentBefore);
            lines.push(stringifyComment.indentComment(cs, ""));
          }
          ctx.forceBlockIndent = !!doc.comment;
          contentComment = doc.contents.comment;
        }
        const onChompKeep = contentComment ? void 0 : () => chompKeep = true;
        let body = stringify.stringify(doc.contents, ctx, () => contentComment = null, onChompKeep);
        if (contentComment)
          body += stringifyComment.lineComment(body, "", commentString(contentComment));
        if ((body[0] === "|" || body[0] === ">") && lines[lines.length - 1] === "---") {
          lines[lines.length - 1] = `--- ${body}`;
        } else
          lines.push(body);
      } else {
        lines.push(stringify.stringify(doc.contents, ctx));
      }
      if (doc.directives?.docEnd) {
        if (doc.comment) {
          const cs = commentString(doc.comment);
          if (cs.includes("\n")) {
            lines.push("...");
            lines.push(stringifyComment.indentComment(cs, ""));
          } else {
            lines.push(`... ${cs}`);
          }
        } else {
          lines.push("...");
        }
      } else {
        let dc = doc.comment;
        if (dc && chompKeep)
          dc = dc.replace(/^\n+/, "");
        if (dc) {
          if ((!chompKeep || contentComment) && lines[lines.length - 1] !== "")
            lines.push("");
          lines.push(stringifyComment.indentComment(commentString(dc), ""));
        }
      }
      return lines.join("\n") + "\n";
    }
    exports.stringifyDocument = stringifyDocument;
  }
});

// node_modules/yaml/dist/doc/Document.js
var require_Document = __commonJS({
  "node_modules/yaml/dist/doc/Document.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var toJS = require_toJS();
    var Schema = require_Schema();
    var stringifyDocument = require_stringifyDocument();
    var anchors = require_anchors();
    var applyReviver = require_applyReviver();
    var createNode = require_createNode();
    var directives = require_directives();
    var Document = class _Document {
      constructor(value, replacer, options) {
        this.commentBefore = null;
        this.comment = null;
        this.errors = [];
        this.warnings = [];
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.DOC });
        let _replacer = null;
        if (typeof replacer === "function" || Array.isArray(replacer)) {
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const opt = Object.assign({
          intAsBigInt: false,
          keepSourceTokens: false,
          logLevel: "warn",
          prettyErrors: true,
          strict: true,
          stringKeys: false,
          uniqueKeys: true,
          version: "1.2"
        }, options);
        this.options = opt;
        let { version: version2 } = opt;
        if (options?._directives) {
          this.directives = options._directives.atDocument();
          if (this.directives.yaml.explicit)
            version2 = this.directives.yaml.version;
        } else
          this.directives = new directives.Directives({ version: version2 });
        this.setSchema(version2, options);
        this.contents = value === void 0 ? null : this.createNode(value, _replacer, options);
      }
      /**
       * Create a deep copy of this Document and its contents.
       *
       * Custom Node values that inherit from `Object` still refer to their original instances.
       */
      clone() {
        const copy = Object.create(_Document.prototype, {
          [identity.NODE_TYPE]: { value: identity.DOC }
        });
        copy.commentBefore = this.commentBefore;
        copy.comment = this.comment;
        copy.errors = this.errors.slice();
        copy.warnings = this.warnings.slice();
        copy.options = Object.assign({}, this.options);
        if (this.directives)
          copy.directives = this.directives.clone();
        copy.schema = this.schema.clone();
        copy.contents = identity.isNode(this.contents) ? this.contents.clone(copy.schema) : this.contents;
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** Adds a value to the document. */
      add(value) {
        if (assertCollection(this.contents))
          this.contents.add(value);
      }
      /** Adds a value to the document. */
      addIn(path7, value) {
        if (assertCollection(this.contents))
          this.contents.addIn(path7, value);
      }
      /**
       * Create a new `Alias` node, ensuring that the target `node` has the required anchor.
       *
       * If `node` already has an anchor, `name` is ignored.
       * Otherwise, the `node.anchor` value will be set to `name`,
       * or if an anchor with that name is already present in the document,
       * `name` will be used as a prefix for a new unique anchor.
       * If `name` is undefined, the generated anchor will use 'a' as a prefix.
       */
      createAlias(node, name) {
        if (!node.anchor) {
          const prev = anchors.anchorNames(this);
          node.anchor = // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          !name || prev.has(name) ? anchors.findNewAnchor(name || "a", prev) : name;
        }
        return new Alias.Alias(node.anchor);
      }
      createNode(value, replacer, options) {
        let _replacer = void 0;
        if (typeof replacer === "function") {
          value = replacer.call({ "": value }, "", value);
          _replacer = replacer;
        } else if (Array.isArray(replacer)) {
          const keyToStr = (v) => typeof v === "number" || v instanceof String || v instanceof Number;
          const asStr = replacer.filter(keyToStr).map(String);
          if (asStr.length > 0)
            replacer = replacer.concat(asStr);
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const { aliasDuplicateObjects, anchorPrefix, flow, keepUndefined, onTagObj, tag } = options ?? {};
        const { onAnchor, setAnchors, sourceObjects } = anchors.createNodeAnchors(
          this,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          anchorPrefix || "a"
        );
        const ctx = {
          aliasDuplicateObjects: aliasDuplicateObjects ?? true,
          keepUndefined: keepUndefined ?? false,
          onAnchor,
          onTagObj,
          replacer: _replacer,
          schema: this.schema,
          sourceObjects
        };
        const node = createNode.createNode(value, tag, ctx);
        if (flow && identity.isCollection(node))
          node.flow = true;
        setAnchors();
        return node;
      }
      /**
       * Convert a key and a value into a `Pair` using the current schema,
       * recursively wrapping all values as `Scalar` or `Collection` nodes.
       */
      createPair(key, value, options = {}) {
        const k = this.createNode(key, null, options);
        const v = this.createNode(value, null, options);
        return new Pair.Pair(k, v);
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        return assertCollection(this.contents) ? this.contents.delete(key) : false;
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path7) {
        if (Collection.isEmptyPath(path7)) {
          if (this.contents == null)
            return false;
          this.contents = null;
          return true;
        }
        return assertCollection(this.contents) ? this.contents.deleteIn(path7) : false;
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      get(key, keepScalar) {
        return identity.isCollection(this.contents) ? this.contents.get(key, keepScalar) : void 0;
      }
      /**
       * Returns item at `path`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path7, keepScalar) {
        if (Collection.isEmptyPath(path7))
          return !keepScalar && identity.isScalar(this.contents) ? this.contents.value : this.contents;
        return identity.isCollection(this.contents) ? this.contents.getIn(path7, keepScalar) : void 0;
      }
      /**
       * Checks if the document includes a value with the key `key`.
       */
      has(key) {
        return identity.isCollection(this.contents) ? this.contents.has(key) : false;
      }
      /**
       * Checks if the document includes a value at `path`.
       */
      hasIn(path7) {
        if (Collection.isEmptyPath(path7))
          return this.contents !== void 0;
        return identity.isCollection(this.contents) ? this.contents.hasIn(path7) : false;
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      set(key, value) {
        if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, [key], value);
        } else if (assertCollection(this.contents)) {
          this.contents.set(key, value);
        }
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path7, value) {
        if (Collection.isEmptyPath(path7)) {
          this.contents = value;
        } else if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, Array.from(path7), value);
        } else if (assertCollection(this.contents)) {
          this.contents.setIn(path7, value);
        }
      }
      /**
       * Change the YAML version and schema used by the document.
       * A `null` version disables support for directives, explicit tags, anchors, and aliases.
       * It also requires the `schema` option to be given as a `Schema` instance value.
       *
       * Overrides all previously set schema options.
       */
      setSchema(version2, options = {}) {
        if (typeof version2 === "number")
          version2 = String(version2);
        let opt;
        switch (version2) {
          case "1.1":
            if (this.directives)
              this.directives.yaml.version = "1.1";
            else
              this.directives = new directives.Directives({ version: "1.1" });
            opt = { resolveKnownTags: false, schema: "yaml-1.1" };
            break;
          case "1.2":
          case "next":
            if (this.directives)
              this.directives.yaml.version = version2;
            else
              this.directives = new directives.Directives({ version: version2 });
            opt = { resolveKnownTags: true, schema: "core" };
            break;
          case null:
            if (this.directives)
              delete this.directives;
            opt = null;
            break;
          default: {
            const sv = JSON.stringify(version2);
            throw new Error(`Expected '1.1', '1.2' or null as first argument, but found: ${sv}`);
          }
        }
        if (options.schema instanceof Object)
          this.schema = options.schema;
        else if (opt)
          this.schema = new Schema.Schema(Object.assign(opt, options));
        else
          throw new Error(`With a null YAML version, the { schema: Schema } option is required`);
      }
      // json & jsonArg are only used from toJSON()
      toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc: this,
          keep: !json,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this.contents, jsonArg ?? "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
      /**
       * A JSON representation of the document `contents`.
       *
       * @param jsonArg Used by `JSON.stringify` to indicate the array index or
       *   property name.
       */
      toJSON(jsonArg, onAnchor) {
        return this.toJS({ json: true, jsonArg, mapAsMap: false, onAnchor });
      }
      /** A YAML representation of the document. */
      toString(options = {}) {
        if (this.errors.length > 0)
          throw new Error("Document with errors cannot be stringified");
        if ("indent" in options && (!Number.isInteger(options.indent) || Number(options.indent) <= 0)) {
          const s = JSON.stringify(options.indent);
          throw new Error(`"indent" option must be a positive integer, not ${s}`);
        }
        return stringifyDocument.stringifyDocument(this, options);
      }
    };
    function assertCollection(contents) {
      if (identity.isCollection(contents))
        return true;
      throw new Error("Expected a YAML collection as document contents");
    }
    exports.Document = Document;
  }
});

// node_modules/yaml/dist/errors.js
var require_errors = __commonJS({
  "node_modules/yaml/dist/errors.js"(exports) {
    "use strict";
    var YAMLError = class extends Error {
      constructor(name, pos, code, message) {
        super();
        this.name = name;
        this.code = code;
        this.message = message;
        this.pos = pos;
      }
    };
    var YAMLParseError = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLParseError", pos, code, message);
      }
    };
    var YAMLWarning = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLWarning", pos, code, message);
      }
    };
    var prettifyError = (src, lc) => (error) => {
      if (error.pos[0] === -1)
        return;
      error.linePos = error.pos.map((pos) => lc.linePos(pos));
      const { line, col } = error.linePos[0];
      error.message += ` at line ${line}, column ${col}`;
      let ci = col - 1;
      let lineStr = src.substring(lc.lineStarts[line - 1], lc.lineStarts[line]).replace(/[\n\r]+$/, "");
      if (ci >= 60 && lineStr.length > 80) {
        const trimStart = Math.min(ci - 39, lineStr.length - 79);
        lineStr = "\u2026" + lineStr.substring(trimStart);
        ci -= trimStart - 1;
      }
      if (lineStr.length > 80)
        lineStr = lineStr.substring(0, 79) + "\u2026";
      if (line > 1 && /^ *$/.test(lineStr.substring(0, ci))) {
        let prev = src.substring(lc.lineStarts[line - 2], lc.lineStarts[line - 1]);
        if (prev.length > 80)
          prev = prev.substring(0, 79) + "\u2026\n";
        lineStr = prev + lineStr;
      }
      if (/[^ ]/.test(lineStr)) {
        let count = 1;
        const end = error.linePos[1];
        if (end?.line === line && end.col > col) {
          count = Math.max(1, Math.min(end.col - col, 80 - ci));
        }
        const pointer = " ".repeat(ci) + "^".repeat(count);
        error.message += `:

${lineStr}
${pointer}
`;
      }
    };
    exports.YAMLError = YAMLError;
    exports.YAMLParseError = YAMLParseError;
    exports.YAMLWarning = YAMLWarning;
    exports.prettifyError = prettifyError;
  }
});

// node_modules/yaml/dist/compose/resolve-props.js
var require_resolve_props = __commonJS({
  "node_modules/yaml/dist/compose/resolve-props.js"(exports) {
    "use strict";
    function resolveProps(tokens, { flow, indicator, next, offset, onError, parentIndent, startOnNewline }) {
      let spaceBefore = false;
      let atNewline = startOnNewline;
      let hasSpace = startOnNewline;
      let comment = "";
      let commentSep = "";
      let hasNewline = false;
      let reqSpace = false;
      let tab = null;
      let anchor = null;
      let tag = null;
      let newlineAfterProp = null;
      let comma = null;
      let found = null;
      let start = null;
      for (const token of tokens) {
        if (reqSpace) {
          if (token.type !== "space" && token.type !== "newline" && token.type !== "comma")
            onError(token.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
          reqSpace = false;
        }
        if (tab) {
          if (atNewline && token.type !== "comment" && token.type !== "newline") {
            onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
          }
          tab = null;
        }
        switch (token.type) {
          case "space":
            if (!flow && (indicator !== "doc-start" || next?.type !== "flow-collection") && token.source.includes("	")) {
              tab = token;
            }
            hasSpace = true;
            break;
          case "comment": {
            if (!hasSpace)
              onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
            const cb = token.source.substring(1) || " ";
            if (!comment)
              comment = cb;
            else
              comment += commentSep + cb;
            commentSep = "";
            atNewline = false;
            break;
          }
          case "newline":
            if (atNewline) {
              if (comment)
                comment += token.source;
              else if (!found || indicator !== "seq-item-ind")
                spaceBefore = true;
            } else
              commentSep += token.source;
            atNewline = true;
            hasNewline = true;
            if (anchor || tag)
              newlineAfterProp = token;
            hasSpace = true;
            break;
          case "anchor":
            if (anchor)
              onError(token, "MULTIPLE_ANCHORS", "A node can have at most one anchor");
            if (token.source.endsWith(":"))
              onError(token.offset + token.source.length - 1, "BAD_ALIAS", "Anchor ending in : is ambiguous", true);
            anchor = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          case "tag": {
            if (tag)
              onError(token, "MULTIPLE_TAGS", "A node can have at most one tag");
            tag = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          }
          case indicator:
            if (anchor || tag)
              onError(token, "BAD_PROP_ORDER", `Anchors and tags must be after the ${token.source} indicator`);
            if (found)
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.source} in ${flow ?? "collection"}`);
            found = token;
            atNewline = indicator === "seq-item-ind" || indicator === "explicit-key-ind";
            hasSpace = false;
            break;
          case "comma":
            if (flow) {
              if (comma)
                onError(token, "UNEXPECTED_TOKEN", `Unexpected , in ${flow}`);
              comma = token;
              atNewline = false;
              hasSpace = false;
              break;
            }
          // else fallthrough
          default:
            onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.type} token`);
            atNewline = false;
            hasSpace = false;
        }
      }
      const last = tokens[tokens.length - 1];
      const end = last ? last.offset + last.source.length : offset;
      if (reqSpace && next && next.type !== "space" && next.type !== "newline" && next.type !== "comma" && (next.type !== "scalar" || next.source !== "")) {
        onError(next.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
      }
      if (tab && (atNewline && tab.indent <= parentIndent || next?.type === "block-map" || next?.type === "block-seq"))
        onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
      return {
        comma,
        found,
        spaceBefore,
        comment,
        hasNewline,
        anchor,
        tag,
        newlineAfterProp,
        end,
        start: start ?? end
      };
    }
    exports.resolveProps = resolveProps;
  }
});

// node_modules/yaml/dist/compose/util-contains-newline.js
var require_util_contains_newline = __commonJS({
  "node_modules/yaml/dist/compose/util-contains-newline.js"(exports) {
    "use strict";
    function containsNewline(key) {
      if (!key)
        return null;
      switch (key.type) {
        case "alias":
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          if (key.source.includes("\n"))
            return true;
          if (key.end) {
            for (const st of key.end)
              if (st.type === "newline")
                return true;
          }
          return false;
        case "flow-collection":
          for (const it of key.items) {
            for (const st of it.start)
              if (st.type === "newline")
                return true;
            if (it.sep) {
              for (const st of it.sep)
                if (st.type === "newline")
                  return true;
            }
            if (containsNewline(it.key) || containsNewline(it.value))
              return true;
          }
          return false;
        default:
          return true;
      }
    }
    exports.containsNewline = containsNewline;
  }
});

// node_modules/yaml/dist/compose/util-flow-indent-check.js
var require_util_flow_indent_check = __commonJS({
  "node_modules/yaml/dist/compose/util-flow-indent-check.js"(exports) {
    "use strict";
    var utilContainsNewline = require_util_contains_newline();
    function flowIndentCheck(indent, fc, onError) {
      if (fc?.type === "flow-collection") {
        const end = fc.end[0];
        if (end.indent === indent && (end.source === "]" || end.source === "}") && utilContainsNewline.containsNewline(fc)) {
          const msg = "Flow end indicator should be more indented than parent";
          onError(end, "BAD_INDENT", msg, true);
        }
      }
    }
    exports.flowIndentCheck = flowIndentCheck;
  }
});

// node_modules/yaml/dist/compose/util-map-includes.js
var require_util_map_includes = __commonJS({
  "node_modules/yaml/dist/compose/util-map-includes.js"(exports) {
    "use strict";
    var identity = require_identity();
    function mapIncludes(ctx, items, search) {
      const { uniqueKeys } = ctx.options;
      if (uniqueKeys === false)
        return false;
      const isEqual = typeof uniqueKeys === "function" ? uniqueKeys : (a, b) => a === b || identity.isScalar(a) && identity.isScalar(b) && a.value === b.value;
      return items.some((pair) => isEqual(pair.key, search));
    }
    exports.mapIncludes = mapIncludes;
  }
});

// node_modules/yaml/dist/compose/resolve-block-map.js
var require_resolve_block_map = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-map.js"(exports) {
    "use strict";
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    var utilMapIncludes = require_util_map_includes();
    var startColMsg = "All mapping items must start at the same column";
    function resolveBlockMap({ composeNode, composeEmptyNode }, ctx, bm, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLMap.YAMLMap;
      const map = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      let offset = bm.offset;
      let commentEnd = null;
      for (const collItem of bm.items) {
        const { start, key, sep, value } = collItem;
        const keyProps = resolveProps.resolveProps(start, {
          indicator: "explicit-key-ind",
          next: key ?? sep?.[0],
          offset,
          onError,
          parentIndent: bm.indent,
          startOnNewline: true
        });
        const implicitKey = !keyProps.found;
        if (implicitKey) {
          if (key) {
            if (key.type === "block-seq")
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "A block sequence may not be used as an implicit map key");
            else if ("indent" in key && key.indent !== bm.indent)
              onError(offset, "BAD_INDENT", startColMsg);
          }
          if (!keyProps.anchor && !keyProps.tag && !sep) {
            commentEnd = keyProps.end;
            if (keyProps.comment) {
              if (map.comment)
                map.comment += "\n" + keyProps.comment;
              else
                map.comment = keyProps.comment;
            }
            continue;
          }
          if (keyProps.newlineAfterProp || utilContainsNewline.containsNewline(key)) {
            onError(key ?? start[start.length - 1], "MULTILINE_IMPLICIT_KEY", "Implicit keys need to be on a single line");
          }
        } else if (keyProps.found?.indent !== bm.indent) {
          onError(offset, "BAD_INDENT", startColMsg);
        }
        ctx.atKey = true;
        const keyStart = keyProps.end;
        const keyNode = key ? composeNode(ctx, key, keyProps, onError) : composeEmptyNode(ctx, keyStart, start, null, keyProps, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bm.indent, key, onError);
        ctx.atKey = false;
        if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
          onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
        const valueProps = resolveProps.resolveProps(sep ?? [], {
          indicator: "map-value-ind",
          next: value,
          offset: keyNode.range[2],
          onError,
          parentIndent: bm.indent,
          startOnNewline: !key || key.type === "block-scalar"
        });
        offset = valueProps.end;
        if (valueProps.found) {
          if (implicitKey) {
            if (value?.type === "block-map" && !valueProps.hasNewline)
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "Nested mappings are not allowed in compact mappings");
            if (ctx.options.strict && keyProps.start < valueProps.found.offset - 1024)
              onError(keyNode.range, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit block mapping key");
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : composeEmptyNode(ctx, offset, sep, null, valueProps, onError);
          if (ctx.schema.compat)
            utilFlowIndentCheck.flowIndentCheck(bm.indent, value, onError);
          offset = valueNode.range[2];
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        } else {
          if (implicitKey)
            onError(keyNode.range, "MISSING_CHAR", "Implicit map keys need to be followed by map values");
          if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        }
      }
      if (commentEnd && commentEnd < offset)
        onError(commentEnd, "IMPOSSIBLE", "Map comment with trailing content");
      map.range = [bm.offset, offset, commentEnd ?? offset];
      return map;
    }
    exports.resolveBlockMap = resolveBlockMap;
  }
});

// node_modules/yaml/dist/compose/resolve-block-seq.js
var require_resolve_block_seq = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-seq.js"(exports) {
    "use strict";
    var YAMLSeq = require_YAMLSeq();
    var resolveProps = require_resolve_props();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    function resolveBlockSeq({ composeNode, composeEmptyNode }, ctx, bs, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLSeq.YAMLSeq;
      const seq = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = bs.offset;
      let commentEnd = null;
      for (const { start, value } of bs.items) {
        const props = resolveProps.resolveProps(start, {
          indicator: "seq-item-ind",
          next: value,
          offset,
          onError,
          parentIndent: bs.indent,
          startOnNewline: true
        });
        if (!props.found) {
          if (props.anchor || props.tag || value) {
            if (value?.type === "block-seq")
              onError(props.end, "BAD_INDENT", "All sequence items must start at the same column");
            else
              onError(offset, "MISSING_CHAR", "Sequence item without - indicator");
          } else {
            commentEnd = props.end;
            if (props.comment)
              seq.comment = props.comment;
            continue;
          }
        }
        const node = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, start, null, props, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bs.indent, value, onError);
        offset = node.range[2];
        seq.items.push(node);
      }
      seq.range = [bs.offset, offset, commentEnd ?? offset];
      return seq;
    }
    exports.resolveBlockSeq = resolveBlockSeq;
  }
});

// node_modules/yaml/dist/compose/resolve-end.js
var require_resolve_end = __commonJS({
  "node_modules/yaml/dist/compose/resolve-end.js"(exports) {
    "use strict";
    function resolveEnd(end, offset, reqSpace, onError) {
      let comment = "";
      if (end) {
        let hasSpace = false;
        let sep = "";
        for (const token of end) {
          const { source, type } = token;
          switch (type) {
            case "space":
              hasSpace = true;
              break;
            case "comment": {
              if (reqSpace && !hasSpace)
                onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
              const cb = source.substring(1) || " ";
              if (!comment)
                comment = cb;
              else
                comment += sep + cb;
              sep = "";
              break;
            }
            case "newline":
              if (comment)
                sep += source;
              hasSpace = true;
              break;
            default:
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${type} at node end`);
          }
          offset += source.length;
        }
      }
      return { comment, offset };
    }
    exports.resolveEnd = resolveEnd;
  }
});

// node_modules/yaml/dist/compose/resolve-flow-collection.js
var require_resolve_flow_collection = __commonJS({
  "node_modules/yaml/dist/compose/resolve-flow-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilMapIncludes = require_util_map_includes();
    var blockMsg = "Block collections are not allowed within flow collections";
    var isBlock = (token) => token && (token.type === "block-map" || token.type === "block-seq");
    function resolveFlowCollection({ composeNode, composeEmptyNode }, ctx, fc, onError, tag) {
      const isMap = fc.start.source === "{";
      const fcName = isMap ? "flow map" : "flow sequence";
      const NodeClass = tag?.nodeClass ?? (isMap ? YAMLMap.YAMLMap : YAMLSeq.YAMLSeq);
      const coll = new NodeClass(ctx.schema);
      coll.flow = true;
      const atRoot = ctx.atRoot;
      if (atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = fc.offset + fc.start.source.length;
      for (let i = 0; i < fc.items.length; ++i) {
        const collItem = fc.items[i];
        const { start, key, sep, value } = collItem;
        const props = resolveProps.resolveProps(start, {
          flow: fcName,
          indicator: "explicit-key-ind",
          next: key ?? sep?.[0],
          offset,
          onError,
          parentIndent: fc.indent,
          startOnNewline: false
        });
        if (!props.found) {
          if (!props.anchor && !props.tag && !sep && !value) {
            if (i === 0 && props.comma)
              onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
            else if (i < fc.items.length - 1)
              onError(props.start, "UNEXPECTED_TOKEN", `Unexpected empty item in ${fcName}`);
            if (props.comment) {
              if (coll.comment)
                coll.comment += "\n" + props.comment;
              else
                coll.comment = props.comment;
            }
            offset = props.end;
            continue;
          }
          if (!isMap && ctx.options.strict && utilContainsNewline.containsNewline(key))
            onError(
              key,
              // checked by containsNewline()
              "MULTILINE_IMPLICIT_KEY",
              "Implicit keys of flow sequence pairs need to be on a single line"
            );
        }
        if (i === 0) {
          if (props.comma)
            onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
        } else {
          if (!props.comma)
            onError(props.start, "MISSING_CHAR", `Missing , between ${fcName} items`);
          if (props.comment) {
            let prevItemComment = "";
            loop: for (const st of start) {
              switch (st.type) {
                case "comma":
                case "space":
                  break;
                case "comment":
                  prevItemComment = st.source.substring(1);
                  break loop;
                default:
                  break loop;
              }
            }
            if (prevItemComment) {
              let prev = coll.items[coll.items.length - 1];
              if (identity.isPair(prev))
                prev = prev.value ?? prev.key;
              if (prev.comment)
                prev.comment += "\n" + prevItemComment;
              else
                prev.comment = prevItemComment;
              props.comment = props.comment.substring(prevItemComment.length + 1);
            }
          }
        }
        if (!isMap && !sep && !props.found) {
          const valueNode = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, sep, null, props, onError);
          coll.items.push(valueNode);
          offset = valueNode.range[2];
          if (isBlock(value))
            onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
        } else {
          ctx.atKey = true;
          const keyStart = props.end;
          const keyNode = key ? composeNode(ctx, key, props, onError) : composeEmptyNode(ctx, keyStart, start, null, props, onError);
          if (isBlock(key))
            onError(keyNode.range, "BLOCK_IN_FLOW", blockMsg);
          ctx.atKey = false;
          const valueProps = resolveProps.resolveProps(sep ?? [], {
            flow: fcName,
            indicator: "map-value-ind",
            next: value,
            offset: keyNode.range[2],
            onError,
            parentIndent: fc.indent,
            startOnNewline: false
          });
          if (valueProps.found) {
            if (!isMap && !props.found && ctx.options.strict) {
              if (sep)
                for (const st of sep) {
                  if (st === valueProps.found)
                    break;
                  if (st.type === "newline") {
                    onError(st, "MULTILINE_IMPLICIT_KEY", "Implicit keys of flow sequence pairs need to be on a single line");
                    break;
                  }
                }
              if (props.start < valueProps.found.offset - 1024)
                onError(valueProps.found, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit flow sequence key");
            }
          } else if (value) {
            if ("source" in value && value.source?.[0] === ":")
              onError(value, "MISSING_CHAR", `Missing space after : in ${fcName}`);
            else
              onError(valueProps.start, "MISSING_CHAR", `Missing , or : between ${fcName} items`);
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : valueProps.found ? composeEmptyNode(ctx, valueProps.end, sep, null, valueProps, onError) : null;
          if (valueNode) {
            if (isBlock(value))
              onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
          } else if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          if (isMap) {
            const map = coll;
            if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
              onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
            map.items.push(pair);
          } else {
            const map = new YAMLMap.YAMLMap(ctx.schema);
            map.flow = true;
            map.items.push(pair);
            const endRange = (valueNode ?? keyNode).range;
            map.range = [keyNode.range[0], endRange[1], endRange[2]];
            coll.items.push(map);
          }
          offset = valueNode ? valueNode.range[2] : valueProps.end;
        }
      }
      const expectedEnd = isMap ? "}" : "]";
      const [ce, ...ee] = fc.end;
      let cePos = offset;
      if (ce?.source === expectedEnd)
        cePos = ce.offset + ce.source.length;
      else {
        const name = fcName[0].toUpperCase() + fcName.substring(1);
        const msg = atRoot ? `${name} must end with a ${expectedEnd}` : `${name} in block collection must be sufficiently indented and end with a ${expectedEnd}`;
        onError(offset, atRoot ? "MISSING_CHAR" : "BAD_INDENT", msg);
        if (ce && ce.source.length !== 1)
          ee.unshift(ce);
      }
      if (ee.length > 0) {
        const end = resolveEnd.resolveEnd(ee, cePos, ctx.options.strict, onError);
        if (end.comment) {
          if (coll.comment)
            coll.comment += "\n" + end.comment;
          else
            coll.comment = end.comment;
        }
        coll.range = [fc.offset, cePos, end.offset];
      } else {
        coll.range = [fc.offset, cePos, cePos];
      }
      return coll;
    }
    exports.resolveFlowCollection = resolveFlowCollection;
  }
});

// node_modules/yaml/dist/compose/compose-collection.js
var require_compose_collection = __commonJS({
  "node_modules/yaml/dist/compose/compose-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveBlockMap = require_resolve_block_map();
    var resolveBlockSeq = require_resolve_block_seq();
    var resolveFlowCollection = require_resolve_flow_collection();
    function resolveCollection(CN, ctx, token, onError, tagName, tag) {
      const coll = token.type === "block-map" ? resolveBlockMap.resolveBlockMap(CN, ctx, token, onError, tag) : token.type === "block-seq" ? resolveBlockSeq.resolveBlockSeq(CN, ctx, token, onError, tag) : resolveFlowCollection.resolveFlowCollection(CN, ctx, token, onError, tag);
      const Coll = coll.constructor;
      if (tagName === "!" || tagName === Coll.tagName) {
        coll.tag = Coll.tagName;
        return coll;
      }
      if (tagName)
        coll.tag = tagName;
      return coll;
    }
    function composeCollection(CN, ctx, token, props, onError) {
      const tagToken = props.tag;
      const tagName = !tagToken ? null : ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg));
      if (token.type === "block-seq") {
        const { anchor, newlineAfterProp: nl } = props;
        const lastProp = anchor && tagToken ? anchor.offset > tagToken.offset ? anchor : tagToken : anchor ?? tagToken;
        if (lastProp && (!nl || nl.offset < lastProp.offset)) {
          const message = "Missing newline after block sequence props";
          onError(lastProp, "MISSING_CHAR", message);
        }
      }
      const expType = token.type === "block-map" ? "map" : token.type === "block-seq" ? "seq" : token.start.source === "{" ? "map" : "seq";
      if (!tagToken || !tagName || tagName === "!" || tagName === YAMLMap.YAMLMap.tagName && expType === "map" || tagName === YAMLSeq.YAMLSeq.tagName && expType === "seq") {
        return resolveCollection(CN, ctx, token, onError, tagName);
      }
      let tag = ctx.schema.tags.find((t) => t.tag === tagName && t.collection === expType);
      if (!tag) {
        const kt = ctx.schema.knownTags[tagName];
        if (kt?.collection === expType) {
          ctx.schema.tags.push(Object.assign({}, kt, { default: false }));
          tag = kt;
        } else {
          if (kt) {
            onError(tagToken, "BAD_COLLECTION_TYPE", `${kt.tag} used for ${expType} collection, but expects ${kt.collection ?? "scalar"}`, true);
          } else {
            onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, true);
          }
          return resolveCollection(CN, ctx, token, onError, tagName);
        }
      }
      const coll = resolveCollection(CN, ctx, token, onError, tagName, tag);
      const res = tag.resolve?.(coll, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg), ctx.options) ?? coll;
      const node = identity.isNode(res) ? res : new Scalar.Scalar(res);
      node.range = coll.range;
      node.tag = tagName;
      if (tag?.format)
        node.format = tag.format;
      return node;
    }
    exports.composeCollection = composeCollection;
  }
});

// node_modules/yaml/dist/compose/resolve-block-scalar.js
var require_resolve_block_scalar = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function resolveBlockScalar(ctx, scalar, onError) {
      const start = scalar.offset;
      const header = parseBlockScalarHeader(scalar, ctx.options.strict, onError);
      if (!header)
        return { value: "", type: null, comment: "", range: [start, start, start] };
      const type = header.mode === ">" ? Scalar.Scalar.BLOCK_FOLDED : Scalar.Scalar.BLOCK_LITERAL;
      const lines = scalar.source ? splitLines(scalar.source) : [];
      let chompStart = lines.length;
      for (let i = lines.length - 1; i >= 0; --i) {
        const content = lines[i][1];
        if (content === "" || content === "\r")
          chompStart = i;
        else
          break;
      }
      if (chompStart === 0) {
        const value2 = header.chomp === "+" && lines.length > 0 ? "\n".repeat(Math.max(1, lines.length - 1)) : "";
        let end2 = start + header.length;
        if (scalar.source)
          end2 += scalar.source.length;
        return { value: value2, type, comment: header.comment, range: [start, end2, end2] };
      }
      let trimIndent = scalar.indent + header.indent;
      let offset = scalar.offset + header.length;
      let contentStart = 0;
      for (let i = 0; i < chompStart; ++i) {
        const [indent, content] = lines[i];
        if (content === "" || content === "\r") {
          if (header.indent === 0 && indent.length > trimIndent)
            trimIndent = indent.length;
        } else {
          if (indent.length < trimIndent) {
            const message = "Block scalars with more-indented leading empty lines must use an explicit indentation indicator";
            onError(offset + indent.length, "MISSING_CHAR", message);
          }
          if (header.indent === 0)
            trimIndent = indent.length;
          contentStart = i;
          if (trimIndent === 0 && !ctx.atRoot) {
            const message = "Block scalar values in collections must be indented";
            onError(offset, "BAD_INDENT", message);
          }
          break;
        }
        offset += indent.length + content.length + 1;
      }
      for (let i = lines.length - 1; i >= chompStart; --i) {
        if (lines[i][0].length > trimIndent)
          chompStart = i + 1;
      }
      let value = "";
      let sep = "";
      let prevMoreIndented = false;
      for (let i = 0; i < contentStart; ++i)
        value += lines[i][0].slice(trimIndent) + "\n";
      for (let i = contentStart; i < chompStart; ++i) {
        let [indent, content] = lines[i];
        offset += indent.length + content.length + 1;
        const crlf = content[content.length - 1] === "\r";
        if (crlf)
          content = content.slice(0, -1);
        if (content && indent.length < trimIndent) {
          const src = header.indent ? "explicit indentation indicator" : "first line";
          const message = `Block scalar lines must not be less indented than their ${src}`;
          onError(offset - content.length - (crlf ? 2 : 1), "BAD_INDENT", message);
          indent = "";
        }
        if (type === Scalar.Scalar.BLOCK_LITERAL) {
          value += sep + indent.slice(trimIndent) + content;
          sep = "\n";
        } else if (indent.length > trimIndent || content[0] === "	") {
          if (sep === " ")
            sep = "\n";
          else if (!prevMoreIndented && sep === "\n")
            sep = "\n\n";
          value += sep + indent.slice(trimIndent) + content;
          sep = "\n";
          prevMoreIndented = true;
        } else if (content === "") {
          if (sep === "\n")
            value += "\n";
          else
            sep = "\n";
        } else {
          value += sep + content;
          sep = " ";
          prevMoreIndented = false;
        }
      }
      switch (header.chomp) {
        case "-":
          break;
        case "+":
          for (let i = chompStart; i < lines.length; ++i)
            value += "\n" + lines[i][0].slice(trimIndent);
          if (value[value.length - 1] !== "\n")
            value += "\n";
          break;
        default:
          value += "\n";
      }
      const end = start + header.length + scalar.source.length;
      return { value, type, comment: header.comment, range: [start, end, end] };
    }
    function parseBlockScalarHeader({ offset, props }, strict, onError) {
      if (props[0].type !== "block-scalar-header") {
        onError(props[0], "IMPOSSIBLE", "Block scalar header not found");
        return null;
      }
      const { source } = props[0];
      const mode = source[0];
      let indent = 0;
      let chomp = "";
      let error = -1;
      for (let i = 1; i < source.length; ++i) {
        const ch = source[i];
        if (!chomp && (ch === "-" || ch === "+"))
          chomp = ch;
        else {
          const n = Number(ch);
          if (!indent && n)
            indent = n;
          else if (error === -1)
            error = offset + i;
        }
      }
      if (error !== -1)
        onError(error, "UNEXPECTED_TOKEN", `Block scalar header includes extra characters: ${source}`);
      let hasSpace = false;
      let comment = "";
      let length = source.length;
      for (let i = 1; i < props.length; ++i) {
        const token = props[i];
        switch (token.type) {
          case "space":
            hasSpace = true;
          // fallthrough
          case "newline":
            length += token.source.length;
            break;
          case "comment":
            if (strict && !hasSpace) {
              const message = "Comments must be separated from other tokens by white space characters";
              onError(token, "MISSING_CHAR", message);
            }
            length += token.source.length;
            comment = token.source.substring(1);
            break;
          case "error":
            onError(token, "UNEXPECTED_TOKEN", token.message);
            length += token.source.length;
            break;
          /* istanbul ignore next should not happen */
          default: {
            const message = `Unexpected token in block scalar header: ${token.type}`;
            onError(token, "UNEXPECTED_TOKEN", message);
            const ts = token.source;
            if (ts && typeof ts === "string")
              length += ts.length;
          }
        }
      }
      return { mode, indent, chomp, comment, length };
    }
    function splitLines(source) {
      const split = source.split(/\n( *)/);
      const first = split[0];
      const m = first.match(/^( *)/);
      const line0 = m?.[1] ? [m[1], first.slice(m[1].length)] : ["", first];
      const lines = [line0];
      for (let i = 1; i < split.length; i += 2)
        lines.push([split[i], split[i + 1]]);
      return lines;
    }
    exports.resolveBlockScalar = resolveBlockScalar;
  }
});

// node_modules/yaml/dist/compose/resolve-flow-scalar.js
var require_resolve_flow_scalar = __commonJS({
  "node_modules/yaml/dist/compose/resolve-flow-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var resolveEnd = require_resolve_end();
    function resolveFlowScalar(scalar, strict, onError) {
      const { offset, type, source, end } = scalar;
      let _type;
      let value;
      const _onError = (rel, code, msg) => onError(offset + rel, code, msg);
      switch (type) {
        case "scalar":
          _type = Scalar.Scalar.PLAIN;
          value = plainValue(source, _onError);
          break;
        case "single-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_SINGLE;
          value = singleQuotedValue(source, _onError);
          break;
        case "double-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_DOUBLE;
          value = doubleQuotedValue(source, _onError);
          break;
        /* istanbul ignore next should not happen */
        default:
          onError(scalar, "UNEXPECTED_TOKEN", `Expected a flow scalar value, but found: ${type}`);
          return {
            value: "",
            type: null,
            comment: "",
            range: [offset, offset + source.length, offset + source.length]
          };
      }
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, strict, onError);
      return {
        value,
        type: _type,
        comment: re.comment,
        range: [offset, valueEnd, re.offset]
      };
    }
    function plainValue(source, onError) {
      let badChar = "";
      switch (source[0]) {
        /* istanbul ignore next should not happen */
        case "	":
          badChar = "a tab character";
          break;
        case ",":
          badChar = "flow indicator character ,";
          break;
        case "%":
          badChar = "directive indicator character %";
          break;
        case "|":
        case ">": {
          badChar = `block scalar indicator ${source[0]}`;
          break;
        }
        case "@":
        case "`": {
          badChar = `reserved character ${source[0]}`;
          break;
        }
      }
      if (badChar)
        onError(0, "BAD_SCALAR_START", `Plain value cannot start with ${badChar}`);
      return foldLines(source);
    }
    function singleQuotedValue(source, onError) {
      if (source[source.length - 1] !== "'" || source.length === 1)
        onError(source.length, "MISSING_CHAR", "Missing closing 'quote");
      return foldLines(source.slice(1, -1)).replace(/''/g, "'");
    }
    function foldLines(source) {
      let first, line;
      try {
        first = new RegExp("(.*?)(?<![ 	])[ 	]*\r?\n", "sy");
        line = new RegExp("[ 	]*(.*?)(?:(?<![ 	])[ 	]*)?\r?\n", "sy");
      } catch {
        first = /(.*?)[ \t]*\r?\n/sy;
        line = /[ \t]*(.*?)[ \t]*\r?\n/sy;
      }
      let match = first.exec(source);
      if (!match)
        return source;
      let res = match[1];
      let sep = " ";
      let pos = first.lastIndex;
      line.lastIndex = pos;
      while (match = line.exec(source)) {
        if (match[1] === "") {
          if (sep === "\n")
            res += sep;
          else
            sep = "\n";
        } else {
          res += sep + match[1];
          sep = " ";
        }
        pos = line.lastIndex;
      }
      const last = /[ \t]*(.*)/sy;
      last.lastIndex = pos;
      match = last.exec(source);
      return res + sep + (match?.[1] ?? "");
    }
    function doubleQuotedValue(source, onError) {
      let res = "";
      for (let i = 1; i < source.length - 1; ++i) {
        const ch = source[i];
        if (ch === "\r" && source[i + 1] === "\n")
          continue;
        if (ch === "\n") {
          const { fold, offset } = foldNewline(source, i);
          res += fold;
          i = offset;
        } else if (ch === "\\") {
          let next = source[++i];
          const cc = escapeCodes[next];
          if (cc)
            res += cc;
          else if (next === "\n") {
            next = source[i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "\r" && source[i + 1] === "\n") {
            next = source[++i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "x" || next === "u" || next === "U") {
            const length = { x: 2, u: 4, U: 8 }[next];
            res += parseCharCode(source, i + 1, length, onError);
            i += length;
          } else {
            const raw = source.substr(i - 1, 2);
            onError(i - 1, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
            res += raw;
          }
        } else if (ch === " " || ch === "	") {
          const wsStart = i;
          let next = source[i + 1];
          while (next === " " || next === "	")
            next = source[++i + 1];
          if (next !== "\n" && !(next === "\r" && source[i + 2] === "\n"))
            res += i > wsStart ? source.slice(wsStart, i + 1) : ch;
        } else {
          res += ch;
        }
      }
      if (source[source.length - 1] !== '"' || source.length === 1)
        onError(source.length, "MISSING_CHAR", 'Missing closing "quote');
      return res;
    }
    function foldNewline(source, offset) {
      let fold = "";
      let ch = source[offset + 1];
      while (ch === " " || ch === "	" || ch === "\n" || ch === "\r") {
        if (ch === "\r" && source[offset + 2] !== "\n")
          break;
        if (ch === "\n")
          fold += "\n";
        offset += 1;
        ch = source[offset + 1];
      }
      if (!fold)
        fold = " ";
      return { fold, offset };
    }
    var escapeCodes = {
      "0": "\0",
      // null character
      a: "\x07",
      // bell character
      b: "\b",
      // backspace
      e: "\x1B",
      // escape character
      f: "\f",
      // form feed
      n: "\n",
      // line feed
      r: "\r",
      // carriage return
      t: "	",
      // horizontal tab
      v: "\v",
      // vertical tab
      N: "\x85",
      // Unicode next line
      _: "\xA0",
      // Unicode non-breaking space
      L: "\u2028",
      // Unicode line separator
      P: "\u2029",
      // Unicode paragraph separator
      " ": " ",
      '"': '"',
      "/": "/",
      "\\": "\\",
      "	": "	"
    };
    function parseCharCode(source, offset, length, onError) {
      const cc = source.substr(offset, length);
      const ok = cc.length === length && /^[0-9a-fA-F]+$/.test(cc);
      const code = ok ? parseInt(cc, 16) : NaN;
      if (isNaN(code)) {
        const raw = source.substr(offset - 2, length + 2);
        onError(offset - 2, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
        return raw;
      }
      return String.fromCodePoint(code);
    }
    exports.resolveFlowScalar = resolveFlowScalar;
  }
});

// node_modules/yaml/dist/compose/compose-scalar.js
var require_compose_scalar = __commonJS({
  "node_modules/yaml/dist/compose/compose-scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    function composeScalar(ctx, token, tagToken, onError) {
      const { value, type, comment, range } = token.type === "block-scalar" ? resolveBlockScalar.resolveBlockScalar(ctx, token, onError) : resolveFlowScalar.resolveFlowScalar(token, ctx.options.strict, onError);
      const tagName = tagToken ? ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg)) : null;
      let tag;
      if (ctx.options.stringKeys && ctx.atKey) {
        tag = ctx.schema[identity.SCALAR];
      } else if (tagName)
        tag = findScalarTagByName(ctx.schema, value, tagName, tagToken, onError);
      else if (token.type === "scalar")
        tag = findScalarTagByTest(ctx, value, token, onError);
      else
        tag = ctx.schema[identity.SCALAR];
      let scalar;
      try {
        const res = tag.resolve(value, (msg) => onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg), ctx.options);
        scalar = identity.isScalar(res) ? res : new Scalar.Scalar(res);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg);
        scalar = new Scalar.Scalar(value);
      }
      scalar.range = range;
      scalar.source = value;
      if (type)
        scalar.type = type;
      if (tagName)
        scalar.tag = tagName;
      if (tag.format)
        scalar.format = tag.format;
      if (comment)
        scalar.comment = comment;
      return scalar;
    }
    function findScalarTagByName(schema, value, tagName, tagToken, onError) {
      if (tagName === "!")
        return schema[identity.SCALAR];
      const matchWithTest = [];
      for (const tag of schema.tags) {
        if (!tag.collection && tag.tag === tagName) {
          if (tag.default && tag.test)
            matchWithTest.push(tag);
          else
            return tag;
        }
      }
      for (const tag of matchWithTest)
        if (tag.test?.test(value))
          return tag;
      const kt = schema.knownTags[tagName];
      if (kt && !kt.collection) {
        schema.tags.push(Object.assign({}, kt, { default: false, test: void 0 }));
        return kt;
      }
      onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, tagName !== "tag:yaml.org,2002:str");
      return schema[identity.SCALAR];
    }
    function findScalarTagByTest({ atKey, directives, schema }, value, token, onError) {
      const tag = schema.tags.find((tag2) => (tag2.default === true || atKey && tag2.default === "key") && tag2.test?.test(value)) || schema[identity.SCALAR];
      if (schema.compat) {
        const compat = schema.compat.find((tag2) => tag2.default && tag2.test?.test(value)) ?? schema[identity.SCALAR];
        if (tag.tag !== compat.tag) {
          const ts = directives.tagString(tag.tag);
          const cs = directives.tagString(compat.tag);
          const msg = `Value may be parsed as either ${ts} or ${cs}`;
          onError(token, "TAG_RESOLVE_FAILED", msg, true);
        }
      }
      return tag;
    }
    exports.composeScalar = composeScalar;
  }
});

// node_modules/yaml/dist/compose/util-empty-scalar-position.js
var require_util_empty_scalar_position = __commonJS({
  "node_modules/yaml/dist/compose/util-empty-scalar-position.js"(exports) {
    "use strict";
    function emptyScalarPosition(offset, before, pos) {
      if (before) {
        pos ?? (pos = before.length);
        for (let i = pos - 1; i >= 0; --i) {
          let st = before[i];
          switch (st.type) {
            case "space":
            case "comment":
            case "newline":
              offset -= st.source.length;
              continue;
          }
          st = before[++i];
          while (st?.type === "space") {
            offset += st.source.length;
            st = before[++i];
          }
          break;
        }
      }
      return offset;
    }
    exports.emptyScalarPosition = emptyScalarPosition;
  }
});

// node_modules/yaml/dist/compose/compose-node.js
var require_compose_node = __commonJS({
  "node_modules/yaml/dist/compose/compose-node.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var composeCollection = require_compose_collection();
    var composeScalar = require_compose_scalar();
    var resolveEnd = require_resolve_end();
    var utilEmptyScalarPosition = require_util_empty_scalar_position();
    var CN = { composeNode, composeEmptyNode };
    function composeNode(ctx, token, props, onError) {
      const atKey = ctx.atKey;
      const { spaceBefore, comment, anchor, tag } = props;
      let node;
      let isSrcToken = true;
      switch (token.type) {
        case "alias":
          node = composeAlias(ctx, token, onError);
          if (anchor || tag)
            onError(token, "ALIAS_PROPS", "An alias node must not specify any properties");
          break;
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "block-scalar":
          node = composeScalar.composeScalar(ctx, token, tag, onError);
          if (anchor)
            node.anchor = anchor.source.substring(1);
          break;
        case "block-map":
        case "block-seq":
        case "flow-collection":
          try {
            node = composeCollection.composeCollection(CN, ctx, token, props, onError);
            if (anchor)
              node.anchor = anchor.source.substring(1);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            onError(token, "RESOURCE_EXHAUSTION", message);
          }
          break;
        default: {
          const message = token.type === "error" ? token.message : `Unsupported token (type: ${token.type})`;
          onError(token, "UNEXPECTED_TOKEN", message);
          isSrcToken = false;
        }
      }
      node ?? (node = composeEmptyNode(ctx, token.offset, void 0, null, props, onError));
      if (anchor && node.anchor === "")
        onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      if (atKey && ctx.options.stringKeys && (!identity.isScalar(node) || typeof node.value !== "string" || node.tag && node.tag !== "tag:yaml.org,2002:str")) {
        const msg = "With stringKeys, all keys must be strings";
        onError(tag ?? token, "NON_STRING_KEY", msg);
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        if (token.type === "scalar" && token.source === "")
          node.comment = comment;
        else
          node.commentBefore = comment;
      }
      if (ctx.options.keepSourceTokens && isSrcToken)
        node.srcToken = token;
      return node;
    }
    function composeEmptyNode(ctx, offset, before, pos, { spaceBefore, comment, anchor, tag, end }, onError) {
      const token = {
        type: "scalar",
        offset: utilEmptyScalarPosition.emptyScalarPosition(offset, before, pos),
        indent: -1,
        source: ""
      };
      const node = composeScalar.composeScalar(ctx, token, tag, onError);
      if (anchor) {
        node.anchor = anchor.source.substring(1);
        if (node.anchor === "")
          onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        node.comment = comment;
        node.range[2] = end;
      }
      return node;
    }
    function composeAlias({ options }, { offset, source, end }, onError) {
      const alias = new Alias.Alias(source.substring(1));
      if (alias.source === "")
        onError(offset, "BAD_ALIAS", "Alias cannot be an empty string");
      if (alias.source.endsWith(":"))
        onError(offset + source.length - 1, "BAD_ALIAS", "Alias ending in : is ambiguous", true);
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, options.strict, onError);
      alias.range = [offset, valueEnd, re.offset];
      if (re.comment)
        alias.comment = re.comment;
      return alias;
    }
    exports.composeEmptyNode = composeEmptyNode;
    exports.composeNode = composeNode;
  }
});

// node_modules/yaml/dist/compose/compose-doc.js
var require_compose_doc = __commonJS({
  "node_modules/yaml/dist/compose/compose-doc.js"(exports) {
    "use strict";
    var Document = require_Document();
    var composeNode = require_compose_node();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    function composeDoc(options, directives, { offset, start, value, end }, onError) {
      const opts = Object.assign({ _directives: directives }, options);
      const doc = new Document.Document(void 0, opts);
      const ctx = {
        atKey: false,
        atRoot: true,
        directives: doc.directives,
        options: doc.options,
        schema: doc.schema
      };
      const props = resolveProps.resolveProps(start, {
        indicator: "doc-start",
        next: value ?? end?.[0],
        offset,
        onError,
        parentIndent: 0,
        startOnNewline: true
      });
      if (props.found) {
        doc.directives.docStart = true;
        if (value && (value.type === "block-map" || value.type === "block-seq") && !props.hasNewline)
          onError(props.end, "MISSING_CHAR", "Block collection cannot start on same line with directives-end marker");
      }
      doc.contents = value ? composeNode.composeNode(ctx, value, props, onError) : composeNode.composeEmptyNode(ctx, props.end, start, null, props, onError);
      const contentEnd = doc.contents.range[2];
      const re = resolveEnd.resolveEnd(end, contentEnd, false, onError);
      if (re.comment)
        doc.comment = re.comment;
      doc.range = [offset, contentEnd, re.offset];
      return doc;
    }
    exports.composeDoc = composeDoc;
  }
});

// node_modules/yaml/dist/compose/composer.js
var require_composer = __commonJS({
  "node_modules/yaml/dist/compose/composer.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var directives = require_directives();
    var Document = require_Document();
    var errors = require_errors();
    var identity = require_identity();
    var composeDoc = require_compose_doc();
    var resolveEnd = require_resolve_end();
    function getErrorPos(src) {
      if (typeof src === "number")
        return [src, src + 1];
      if (Array.isArray(src))
        return src.length === 2 ? src : [src[0], src[1]];
      const { offset, source } = src;
      return [offset, offset + (typeof source === "string" ? source.length : 1)];
    }
    function parsePrelude(prelude) {
      let comment = "";
      let atComment = false;
      let afterEmptyLine = false;
      for (let i = 0; i < prelude.length; ++i) {
        const source = prelude[i];
        switch (source[0]) {
          case "#":
            comment += (comment === "" ? "" : afterEmptyLine ? "\n\n" : "\n") + (source.substring(1) || " ");
            atComment = true;
            afterEmptyLine = false;
            break;
          case "%":
            if (prelude[i + 1]?.[0] !== "#")
              i += 1;
            atComment = false;
            break;
          default:
            if (!atComment)
              afterEmptyLine = true;
            atComment = false;
        }
      }
      return { comment, afterEmptyLine };
    }
    var Composer = class {
      constructor(options = {}) {
        this.doc = null;
        this.atDirectives = false;
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
        this.onError = (source, code, message, warning) => {
          const pos = getErrorPos(source);
          if (warning)
            this.warnings.push(new errors.YAMLWarning(pos, code, message));
          else
            this.errors.push(new errors.YAMLParseError(pos, code, message));
        };
        this.directives = new directives.Directives({ version: options.version || "1.2" });
        this.options = options;
      }
      decorate(doc, afterDoc) {
        const { comment, afterEmptyLine } = parsePrelude(this.prelude);
        if (comment) {
          const dc = doc.contents;
          if (afterDoc) {
            doc.comment = doc.comment ? `${doc.comment}
${comment}` : comment;
          } else if (afterEmptyLine || doc.directives.docStart || !dc) {
            doc.commentBefore = comment;
          } else if (identity.isCollection(dc) && !dc.flow && dc.items.length > 0) {
            let it = dc.items[0];
            if (identity.isPair(it))
              it = it.key;
            const cb = it.commentBefore;
            it.commentBefore = cb ? `${comment}
${cb}` : comment;
          } else {
            const cb = dc.commentBefore;
            dc.commentBefore = cb ? `${comment}
${cb}` : comment;
          }
        }
        if (afterDoc) {
          Array.prototype.push.apply(doc.errors, this.errors);
          Array.prototype.push.apply(doc.warnings, this.warnings);
        } else {
          doc.errors = this.errors;
          doc.warnings = this.warnings;
        }
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
      }
      /**
       * Current stream status information.
       *
       * Mostly useful at the end of input for an empty stream.
       */
      streamInfo() {
        return {
          comment: parsePrelude(this.prelude).comment,
          directives: this.directives,
          errors: this.errors,
          warnings: this.warnings
        };
      }
      /**
       * Compose tokens into documents.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *compose(tokens, forceDoc = false, endOffset = -1) {
        for (const token of tokens)
          yield* this.next(token);
        yield* this.end(forceDoc, endOffset);
      }
      /** Advance the composer by one CST token. */
      *next(token) {
        if (node_process.env.LOG_STREAM)
          console.dir(token, { depth: null });
        switch (token.type) {
          case "directive":
            this.directives.add(token.source, (offset, message, warning) => {
              const pos = getErrorPos(token);
              pos[0] += offset;
              this.onError(pos, "BAD_DIRECTIVE", message, warning);
            });
            this.prelude.push(token.source);
            this.atDirectives = true;
            break;
          case "document": {
            const doc = composeDoc.composeDoc(this.options, this.directives, token, this.onError);
            if (this.atDirectives && !doc.directives.docStart)
              this.onError(token, "MISSING_CHAR", "Missing directives-end/doc-start indicator line");
            this.decorate(doc, false);
            if (this.doc)
              yield this.doc;
            this.doc = doc;
            this.atDirectives = false;
            break;
          }
          case "byte-order-mark":
          case "space":
            break;
          case "comment":
          case "newline":
            this.prelude.push(token.source);
            break;
          case "error": {
            const msg = token.source ? `${token.message}: ${JSON.stringify(token.source)}` : token.message;
            const error = new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg);
            if (this.atDirectives || !this.doc)
              this.errors.push(error);
            else
              this.doc.errors.push(error);
            break;
          }
          case "doc-end": {
            if (!this.doc) {
              const msg = "Unexpected doc-end without preceding document";
              this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg));
              break;
            }
            this.doc.directives.docEnd = true;
            const end = resolveEnd.resolveEnd(token.end, token.offset + token.source.length, this.doc.options.strict, this.onError);
            this.decorate(this.doc, true);
            if (end.comment) {
              const dc = this.doc.comment;
              this.doc.comment = dc ? `${dc}
${end.comment}` : end.comment;
            }
            this.doc.range[2] = end.offset;
            break;
          }
          default:
            this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", `Unsupported token ${token.type}`));
        }
      }
      /**
       * Call at end of input to yield any remaining document.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *end(forceDoc = false, endOffset = -1) {
        if (this.doc) {
          this.decorate(this.doc, true);
          yield this.doc;
          this.doc = null;
        } else if (forceDoc) {
          const opts = Object.assign({ _directives: this.directives }, this.options);
          const doc = new Document.Document(void 0, opts);
          if (this.atDirectives)
            this.onError(endOffset, "MISSING_CHAR", "Missing directives-end indicator line");
          doc.range = [0, endOffset, endOffset];
          this.decorate(doc, false);
          yield doc;
        }
      }
    };
    exports.Composer = Composer;
  }
});

// node_modules/yaml/dist/parse/cst-scalar.js
var require_cst_scalar = __commonJS({
  "node_modules/yaml/dist/parse/cst-scalar.js"(exports) {
    "use strict";
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    var errors = require_errors();
    var stringifyString = require_stringifyString();
    function resolveAsScalar(token, strict = true, onError) {
      if (token) {
        const _onError = (pos, code, message) => {
          const offset = typeof pos === "number" ? pos : Array.isArray(pos) ? pos[0] : pos.offset;
          if (onError)
            onError(offset, code, message);
          else
            throw new errors.YAMLParseError([offset, offset + 1], code, message);
        };
        switch (token.type) {
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return resolveFlowScalar.resolveFlowScalar(token, strict, _onError);
          case "block-scalar":
            return resolveBlockScalar.resolveBlockScalar({ options: { strict } }, token, _onError);
        }
      }
      return null;
    }
    function createScalarToken(value, context) {
      const { implicitKey = false, indent, inFlow = false, offset = -1, type = "PLAIN" } = context;
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey,
        indent: indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      const end = context.end ?? [
        { type: "newline", offset: -1, indent, source: "\n" }
      ];
      switch (source[0]) {
        case "|":
        case ">": {
          const he = source.indexOf("\n");
          const head = source.substring(0, he);
          const body = source.substring(he + 1) + "\n";
          const props = [
            { type: "block-scalar-header", offset, indent, source: head }
          ];
          if (!addEndtoBlockProps(props, end))
            props.push({ type: "newline", offset: -1, indent, source: "\n" });
          return { type: "block-scalar", offset, indent, props, source: body };
        }
        case '"':
          return { type: "double-quoted-scalar", offset, indent, source, end };
        case "'":
          return { type: "single-quoted-scalar", offset, indent, source, end };
        default:
          return { type: "scalar", offset, indent, source, end };
      }
    }
    function setScalarValue(token, value, context = {}) {
      let { afterKey = false, implicitKey = false, inFlow = false, type } = context;
      let indent = "indent" in token ? token.indent : null;
      if (afterKey && typeof indent === "number")
        indent += 2;
      if (!type)
        switch (token.type) {
          case "single-quoted-scalar":
            type = "QUOTE_SINGLE";
            break;
          case "double-quoted-scalar":
            type = "QUOTE_DOUBLE";
            break;
          case "block-scalar": {
            const header = token.props[0];
            if (header.type !== "block-scalar-header")
              throw new Error("Invalid block scalar header");
            type = header.source[0] === ">" ? "BLOCK_FOLDED" : "BLOCK_LITERAL";
            break;
          }
          default:
            type = "PLAIN";
        }
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey: implicitKey || indent === null,
        indent: indent !== null && indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      switch (source[0]) {
        case "|":
        case ">":
          setBlockScalarValue(token, source);
          break;
        case '"':
          setFlowScalarValue(token, source, "double-quoted-scalar");
          break;
        case "'":
          setFlowScalarValue(token, source, "single-quoted-scalar");
          break;
        default:
          setFlowScalarValue(token, source, "scalar");
      }
    }
    function setBlockScalarValue(token, source) {
      const he = source.indexOf("\n");
      const head = source.substring(0, he);
      const body = source.substring(he + 1) + "\n";
      if (token.type === "block-scalar") {
        const header = token.props[0];
        if (header.type !== "block-scalar-header")
          throw new Error("Invalid block scalar header");
        header.source = head;
        token.source = body;
      } else {
        const { offset } = token;
        const indent = "indent" in token ? token.indent : -1;
        const props = [
          { type: "block-scalar-header", offset, indent, source: head }
        ];
        if (!addEndtoBlockProps(props, "end" in token ? token.end : void 0))
          props.push({ type: "newline", offset: -1, indent, source: "\n" });
        for (const key of Object.keys(token))
          if (key !== "type" && key !== "offset")
            delete token[key];
        Object.assign(token, { type: "block-scalar", indent, props, source: body });
      }
    }
    function addEndtoBlockProps(props, end) {
      if (end)
        for (const st of end)
          switch (st.type) {
            case "space":
            case "comment":
              props.push(st);
              break;
            case "newline":
              props.push(st);
              return true;
          }
      return false;
    }
    function setFlowScalarValue(token, source, type) {
      switch (token.type) {
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          token.type = type;
          token.source = source;
          break;
        case "block-scalar": {
          const end = token.props.slice(1);
          let oa = source.length;
          if (token.props[0].type === "block-scalar-header")
            oa -= token.props[0].source.length;
          for (const tok of end)
            tok.offset += oa;
          delete token.props;
          Object.assign(token, { type, source, end });
          break;
        }
        case "block-map":
        case "block-seq": {
          const offset = token.offset + source.length;
          const nl = { type: "newline", offset, indent: token.indent, source: "\n" };
          delete token.items;
          Object.assign(token, { type, source, end: [nl] });
          break;
        }
        default: {
          const indent = "indent" in token ? token.indent : -1;
          const end = "end" in token && Array.isArray(token.end) ? token.end.filter((st) => st.type === "space" || st.type === "comment" || st.type === "newline") : [];
          for (const key of Object.keys(token))
            if (key !== "type" && key !== "offset")
              delete token[key];
          Object.assign(token, { type, indent, source, end });
        }
      }
    }
    exports.createScalarToken = createScalarToken;
    exports.resolveAsScalar = resolveAsScalar;
    exports.setScalarValue = setScalarValue;
  }
});

// node_modules/yaml/dist/parse/cst-stringify.js
var require_cst_stringify = __commonJS({
  "node_modules/yaml/dist/parse/cst-stringify.js"(exports) {
    "use strict";
    var stringify = (cst) => "type" in cst ? stringifyToken(cst) : stringifyItem(cst);
    function stringifyToken(token) {
      switch (token.type) {
        case "block-scalar": {
          let res = "";
          for (const tok of token.props)
            res += stringifyToken(tok);
          return res + token.source;
        }
        case "block-map":
        case "block-seq": {
          let res = "";
          for (const item of token.items)
            res += stringifyItem(item);
          return res;
        }
        case "flow-collection": {
          let res = token.start.source;
          for (const item of token.items)
            res += stringifyItem(item);
          for (const st of token.end)
            res += st.source;
          return res;
        }
        case "document": {
          let res = stringifyItem(token);
          if (token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
        default: {
          let res = token.source;
          if ("end" in token && token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
      }
    }
    function stringifyItem({ start, key, sep, value }) {
      let res = "";
      for (const st of start)
        res += st.source;
      if (key)
        res += stringifyToken(key);
      if (sep)
        for (const st of sep)
          res += st.source;
      if (value)
        res += stringifyToken(value);
      return res;
    }
    exports.stringify = stringify;
  }
});

// node_modules/yaml/dist/parse/cst-visit.js
var require_cst_visit = __commonJS({
  "node_modules/yaml/dist/parse/cst-visit.js"(exports) {
    "use strict";
    var BREAK = /* @__PURE__ */ Symbol("break visit");
    var SKIP = /* @__PURE__ */ Symbol("skip children");
    var REMOVE = /* @__PURE__ */ Symbol("remove item");
    function visit(cst, visitor) {
      if ("type" in cst && cst.type === "document")
        cst = { start: cst.start, value: cst.value };
      _visit(Object.freeze([]), cst, visitor);
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    visit.itemAtPath = (cst, path7) => {
      let item = cst;
      for (const [field, index] of path7) {
        const tok = item?.[field];
        if (tok && "items" in tok) {
          item = tok.items[index];
        } else
          return void 0;
      }
      return item;
    };
    visit.parentCollection = (cst, path7) => {
      const parent = visit.itemAtPath(cst, path7.slice(0, -1));
      const field = path7[path7.length - 1][0];
      const coll = parent?.[field];
      if (coll && "items" in coll)
        return coll;
      throw new Error("Parent collection not found");
    };
    function _visit(path7, item, visitor) {
      let ctrl = visitor(item, path7);
      if (typeof ctrl === "symbol")
        return ctrl;
      for (const field of ["key", "value"]) {
        const token = item[field];
        if (token && "items" in token) {
          for (let i = 0; i < token.items.length; ++i) {
            const ci = _visit(Object.freeze(path7.concat([[field, i]])), token.items[i], visitor);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              token.items.splice(i, 1);
              i -= 1;
            }
          }
          if (typeof ctrl === "function" && field === "key")
            ctrl = ctrl(item, path7);
        }
      }
      return typeof ctrl === "function" ? ctrl(item, path7) : ctrl;
    }
    exports.visit = visit;
  }
});

// node_modules/yaml/dist/parse/cst.js
var require_cst = __commonJS({
  "node_modules/yaml/dist/parse/cst.js"(exports) {
    "use strict";
    var cstScalar = require_cst_scalar();
    var cstStringify = require_cst_stringify();
    var cstVisit = require_cst_visit();
    var BOM = "\uFEFF";
    var DOCUMENT = "";
    var FLOW_END = "";
    var SCALAR = "";
    var isCollection = (token) => !!token && "items" in token;
    var isScalar = (token) => !!token && (token.type === "scalar" || token.type === "single-quoted-scalar" || token.type === "double-quoted-scalar" || token.type === "block-scalar");
    function prettyToken(token) {
      switch (token) {
        case BOM:
          return "<BOM>";
        case DOCUMENT:
          return "<DOC>";
        case FLOW_END:
          return "<FLOW_END>";
        case SCALAR:
          return "<SCALAR>";
        default:
          return JSON.stringify(token);
      }
    }
    function tokenType(source) {
      switch (source) {
        case BOM:
          return "byte-order-mark";
        case DOCUMENT:
          return "doc-mode";
        case FLOW_END:
          return "flow-error-end";
        case SCALAR:
          return "scalar";
        case "---":
          return "doc-start";
        case "...":
          return "doc-end";
        case "":
        case "\n":
        case "\r\n":
          return "newline";
        case "-":
          return "seq-item-ind";
        case "?":
          return "explicit-key-ind";
        case ":":
          return "map-value-ind";
        case "{":
          return "flow-map-start";
        case "}":
          return "flow-map-end";
        case "[":
          return "flow-seq-start";
        case "]":
          return "flow-seq-end";
        case ",":
          return "comma";
      }
      switch (source[0]) {
        case " ":
        case "	":
          return "space";
        case "#":
          return "comment";
        case "%":
          return "directive-line";
        case "*":
          return "alias";
        case "&":
          return "anchor";
        case "!":
          return "tag";
        case "'":
          return "single-quoted-scalar";
        case '"':
          return "double-quoted-scalar";
        case "|":
        case ">":
          return "block-scalar-header";
      }
      return null;
    }
    exports.createScalarToken = cstScalar.createScalarToken;
    exports.resolveAsScalar = cstScalar.resolveAsScalar;
    exports.setScalarValue = cstScalar.setScalarValue;
    exports.stringify = cstStringify.stringify;
    exports.visit = cstVisit.visit;
    exports.BOM = BOM;
    exports.DOCUMENT = DOCUMENT;
    exports.FLOW_END = FLOW_END;
    exports.SCALAR = SCALAR;
    exports.isCollection = isCollection;
    exports.isScalar = isScalar;
    exports.prettyToken = prettyToken;
    exports.tokenType = tokenType;
  }
});

// node_modules/yaml/dist/parse/lexer.js
var require_lexer = __commonJS({
  "node_modules/yaml/dist/parse/lexer.js"(exports) {
    "use strict";
    var cst = require_cst();
    function isEmpty(ch) {
      switch (ch) {
        case void 0:
        case " ":
        case "\n":
        case "\r":
        case "	":
          return true;
        default:
          return false;
      }
    }
    var hexDigits = new Set("0123456789ABCDEFabcdef");
    var tagChars = new Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-#;/?:@&=+$_.!~*'()");
    var flowIndicatorChars = new Set(",[]{}");
    var invalidAnchorChars = new Set(" ,[]{}\n\r	");
    var isNotAnchorChar = (ch) => !ch || invalidAnchorChars.has(ch);
    var Lexer = class {
      constructor() {
        this.atEnd = false;
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        this.buffer = "";
        this.flowKey = false;
        this.flowLevel = 0;
        this.indentNext = 0;
        this.indentValue = 0;
        this.lineEndPos = null;
        this.next = null;
        this.pos = 0;
      }
      /**
       * Generate YAML tokens from the `source` string. If `incomplete`,
       * a part of the last line may be left as a buffer for the next call.
       *
       * @returns A generator of lexical tokens
       */
      *lex(source, incomplete = false) {
        if (source) {
          if (typeof source !== "string")
            throw TypeError("source is not a string");
          this.buffer = this.buffer ? this.buffer + source : source;
          this.lineEndPos = null;
        }
        this.atEnd = !incomplete;
        let next = this.next ?? "stream";
        while (next && (incomplete || this.hasChars(1)))
          next = yield* this.parseNext(next);
      }
      atLineEnd() {
        let i = this.pos;
        let ch = this.buffer[i];
        while (ch === " " || ch === "	")
          ch = this.buffer[++i];
        if (!ch || ch === "#" || ch === "\n")
          return true;
        if (ch === "\r")
          return this.buffer[i + 1] === "\n";
        return false;
      }
      charAt(n) {
        return this.buffer[this.pos + n];
      }
      continueScalar(offset) {
        let ch = this.buffer[offset];
        if (this.indentNext > 0) {
          let indent = 0;
          while (ch === " ")
            ch = this.buffer[++indent + offset];
          if (ch === "\r") {
            const next = this.buffer[indent + offset + 1];
            if (next === "\n" || !next && !this.atEnd)
              return offset + indent + 1;
          }
          return ch === "\n" || indent >= this.indentNext || !ch && !this.atEnd ? offset + indent : -1;
        }
        if (ch === "-" || ch === ".") {
          const dt = this.buffer.substr(offset, 3);
          if ((dt === "---" || dt === "...") && isEmpty(this.buffer[offset + 3]))
            return -1;
        }
        return offset;
      }
      getLine() {
        let end = this.lineEndPos;
        if (typeof end !== "number" || end !== -1 && end < this.pos) {
          end = this.buffer.indexOf("\n", this.pos);
          this.lineEndPos = end;
        }
        if (end === -1)
          return this.atEnd ? this.buffer.substring(this.pos) : null;
        if (this.buffer[end - 1] === "\r")
          end -= 1;
        return this.buffer.substring(this.pos, end);
      }
      hasChars(n) {
        return this.pos + n <= this.buffer.length;
      }
      setNext(state) {
        this.buffer = this.buffer.substring(this.pos);
        this.pos = 0;
        this.lineEndPos = null;
        this.next = state;
        return null;
      }
      peek(n) {
        return this.buffer.substr(this.pos, n);
      }
      *parseNext(next) {
        switch (next) {
          case "stream":
            return yield* this.parseStream();
          case "line-start":
            return yield* this.parseLineStart();
          case "block-start":
            return yield* this.parseBlockStart();
          case "doc":
            return yield* this.parseDocument();
          case "flow":
            return yield* this.parseFlowCollection();
          case "quoted-scalar":
            return yield* this.parseQuotedScalar();
          case "block-scalar":
            return yield* this.parseBlockScalar();
          case "plain-scalar":
            return yield* this.parsePlainScalar();
        }
      }
      *parseStream() {
        let line = this.getLine();
        if (line === null)
          return this.setNext("stream");
        if (line[0] === cst.BOM) {
          yield* this.pushCount(1);
          line = line.substring(1);
        }
        if (line[0] === "%") {
          let dirEnd = line.length;
          let cs = line.indexOf("#");
          while (cs !== -1) {
            const ch = line[cs - 1];
            if (ch === " " || ch === "	") {
              dirEnd = cs - 1;
              break;
            } else {
              cs = line.indexOf("#", cs + 1);
            }
          }
          while (true) {
            const ch = line[dirEnd - 1];
            if (ch === " " || ch === "	")
              dirEnd -= 1;
            else
              break;
          }
          const n = (yield* this.pushCount(dirEnd)) + (yield* this.pushSpaces(true));
          yield* this.pushCount(line.length - n);
          this.pushNewline();
          return "stream";
        }
        if (this.atLineEnd()) {
          const sp = yield* this.pushSpaces(true);
          yield* this.pushCount(line.length - sp);
          yield* this.pushNewline();
          return "stream";
        }
        yield cst.DOCUMENT;
        return yield* this.parseLineStart();
      }
      *parseLineStart() {
        const ch = this.charAt(0);
        if (!ch && !this.atEnd)
          return this.setNext("line-start");
        if (ch === "-" || ch === ".") {
          if (!this.atEnd && !this.hasChars(4))
            return this.setNext("line-start");
          const s = this.peek(3);
          if ((s === "---" || s === "...") && isEmpty(this.charAt(3))) {
            yield* this.pushCount(3);
            this.indentValue = 0;
            this.indentNext = 0;
            return s === "---" ? "doc" : "stream";
          }
        }
        this.indentValue = yield* this.pushSpaces(false);
        if (this.indentNext > this.indentValue && !isEmpty(this.charAt(1)))
          this.indentNext = this.indentValue;
        return yield* this.parseBlockStart();
      }
      *parseBlockStart() {
        const [ch0, ch1] = this.peek(2);
        if (!ch1 && !this.atEnd)
          return this.setNext("block-start");
        if ((ch0 === "-" || ch0 === "?" || ch0 === ":") && isEmpty(ch1)) {
          const n = (yield* this.pushCount(1)) + (yield* this.pushSpaces(true));
          this.indentNext = this.indentValue + 1;
          this.indentValue += n;
          return yield* this.parseBlockStart();
        }
        return "doc";
      }
      *parseDocument() {
        yield* this.pushSpaces(true);
        const line = this.getLine();
        if (line === null)
          return this.setNext("doc");
        let n = yield* this.pushIndicators();
        switch (line[n]) {
          case "#":
            yield* this.pushCount(line.length - n);
          // fallthrough
          case void 0:
            yield* this.pushNewline();
            return yield* this.parseLineStart();
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel = 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            return "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "doc";
          case '"':
          case "'":
            return yield* this.parseQuotedScalar();
          case "|":
          case ">":
            n += yield* this.parseBlockScalarHeader();
            n += yield* this.pushSpaces(true);
            yield* this.pushCount(line.length - n);
            yield* this.pushNewline();
            return yield* this.parseBlockScalar();
          default:
            return yield* this.parsePlainScalar();
        }
      }
      *parseFlowCollection() {
        let nl, sp;
        let indent = -1;
        do {
          nl = yield* this.pushNewline();
          if (nl > 0) {
            sp = yield* this.pushSpaces(false);
            this.indentValue = indent = sp;
          } else {
            sp = 0;
          }
          sp += yield* this.pushSpaces(true);
        } while (nl + sp > 0);
        const line = this.getLine();
        if (line === null)
          return this.setNext("flow");
        if (indent !== -1 && indent < this.indentNext && line[0] !== "#" || indent === 0 && (line.startsWith("---") || line.startsWith("...")) && isEmpty(line[3])) {
          const atFlowEndMarker = indent === this.indentNext - 1 && this.flowLevel === 1 && (line[0] === "]" || line[0] === "}");
          if (!atFlowEndMarker) {
            this.flowLevel = 0;
            yield cst.FLOW_END;
            return yield* this.parseLineStart();
          }
        }
        let n = 0;
        while (line[n] === ",") {
          n += yield* this.pushCount(1);
          n += yield* this.pushSpaces(true);
          this.flowKey = false;
        }
        n += yield* this.pushIndicators();
        switch (line[n]) {
          case void 0:
            return "flow";
          case "#":
            yield* this.pushCount(line.length - n);
            return "flow";
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel += 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            this.flowKey = true;
            this.flowLevel -= 1;
            return this.flowLevel ? "flow" : "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "flow";
          case '"':
          case "'":
            this.flowKey = true;
            return yield* this.parseQuotedScalar();
          case ":": {
            const next = this.charAt(1);
            if (this.flowKey || isEmpty(next) || next === ",") {
              this.flowKey = false;
              yield* this.pushCount(1);
              yield* this.pushSpaces(true);
              return "flow";
            }
          }
          // fallthrough
          default:
            this.flowKey = false;
            return yield* this.parsePlainScalar();
        }
      }
      *parseQuotedScalar() {
        const quote = this.charAt(0);
        let end = this.buffer.indexOf(quote, this.pos + 1);
        if (quote === "'") {
          while (end !== -1 && this.buffer[end + 1] === "'")
            end = this.buffer.indexOf("'", end + 2);
        } else {
          while (end !== -1) {
            let n = 0;
            while (this.buffer[end - 1 - n] === "\\")
              n += 1;
            if (n % 2 === 0)
              break;
            end = this.buffer.indexOf('"', end + 1);
          }
        }
        const qb = this.buffer.substring(0, end);
        let nl = qb.indexOf("\n", this.pos);
        if (nl !== -1) {
          while (nl !== -1) {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = qb.indexOf("\n", cs);
          }
          if (nl !== -1) {
            end = nl - (qb[nl - 1] === "\r" ? 2 : 1);
          }
        }
        if (end === -1) {
          if (!this.atEnd)
            return this.setNext("quoted-scalar");
          end = this.buffer.length;
        }
        yield* this.pushToIndex(end + 1, false);
        return this.flowLevel ? "flow" : "doc";
      }
      *parseBlockScalarHeader() {
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        let i = this.pos;
        while (true) {
          const ch = this.buffer[++i];
          if (ch === "+")
            this.blockScalarKeep = true;
          else if (ch > "0" && ch <= "9")
            this.blockScalarIndent = Number(ch) - 1;
          else if (ch !== "-")
            break;
        }
        return yield* this.pushUntil((ch) => isEmpty(ch) || ch === "#");
      }
      *parseBlockScalar() {
        let nl = this.pos - 1;
        let indent = 0;
        let ch;
        loop: for (let i2 = this.pos; ch = this.buffer[i2]; ++i2) {
          switch (ch) {
            case " ":
              indent += 1;
              break;
            case "\n":
              nl = i2;
              indent = 0;
              break;
            case "\r": {
              const next = this.buffer[i2 + 1];
              if (!next && !this.atEnd)
                return this.setNext("block-scalar");
              if (next === "\n")
                break;
            }
            // fallthrough
            default:
              break loop;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("block-scalar");
        if (indent >= this.indentNext) {
          if (this.blockScalarIndent === -1)
            this.indentNext = indent;
          else {
            this.indentNext = this.blockScalarIndent + (this.indentNext === 0 ? 1 : this.indentNext);
          }
          do {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = this.buffer.indexOf("\n", cs);
          } while (nl !== -1);
          if (nl === -1) {
            if (!this.atEnd)
              return this.setNext("block-scalar");
            nl = this.buffer.length;
          }
        }
        let i = nl + 1;
        ch = this.buffer[i];
        while (ch === " ")
          ch = this.buffer[++i];
        if (ch === "	") {
          while (ch === "	" || ch === " " || ch === "\r" || ch === "\n")
            ch = this.buffer[++i];
          nl = i - 1;
        } else if (!this.blockScalarKeep) {
          do {
            let i2 = nl - 1;
            let ch2 = this.buffer[i2];
            if (ch2 === "\r")
              ch2 = this.buffer[--i2];
            const lastChar = i2;
            while (ch2 === " ")
              ch2 = this.buffer[--i2];
            if (ch2 === "\n" && i2 >= this.pos && i2 + 1 + indent > lastChar)
              nl = i2;
            else
              break;
          } while (true);
        }
        yield cst.SCALAR;
        yield* this.pushToIndex(nl + 1, true);
        return yield* this.parseLineStart();
      }
      *parsePlainScalar() {
        const inFlow = this.flowLevel > 0;
        let end = this.pos - 1;
        let i = this.pos - 1;
        let ch;
        while (ch = this.buffer[++i]) {
          if (ch === ":") {
            const next = this.buffer[i + 1];
            if (isEmpty(next) || inFlow && flowIndicatorChars.has(next))
              break;
            end = i;
          } else if (isEmpty(ch)) {
            let next = this.buffer[i + 1];
            if (ch === "\r") {
              if (next === "\n") {
                i += 1;
                ch = "\n";
                next = this.buffer[i + 1];
              } else
                end = i;
            }
            if (next === "#" || inFlow && flowIndicatorChars.has(next))
              break;
            if (ch === "\n") {
              const cs = this.continueScalar(i + 1);
              if (cs === -1)
                break;
              i = Math.max(i, cs - 2);
            }
          } else {
            if (inFlow && flowIndicatorChars.has(ch))
              break;
            end = i;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("plain-scalar");
        yield cst.SCALAR;
        yield* this.pushToIndex(end + 1, true);
        return inFlow ? "flow" : "doc";
      }
      *pushCount(n) {
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos += n;
          return n;
        }
        return 0;
      }
      *pushToIndex(i, allowEmpty) {
        const s = this.buffer.slice(this.pos, i);
        if (s) {
          yield s;
          this.pos += s.length;
          return s.length;
        } else if (allowEmpty)
          yield "";
        return 0;
      }
      *pushIndicators() {
        switch (this.charAt(0)) {
          case "!":
            return (yield* this.pushTag()) + (yield* this.pushSpaces(true)) + (yield* this.pushIndicators());
          case "&":
            return (yield* this.pushUntil(isNotAnchorChar)) + (yield* this.pushSpaces(true)) + (yield* this.pushIndicators());
          case "-":
          // this is an error
          case "?":
          // this is an error outside flow collections
          case ":": {
            const inFlow = this.flowLevel > 0;
            const ch1 = this.charAt(1);
            if (isEmpty(ch1) || inFlow && flowIndicatorChars.has(ch1)) {
              if (!inFlow)
                this.indentNext = this.indentValue + 1;
              else if (this.flowKey)
                this.flowKey = false;
              return (yield* this.pushCount(1)) + (yield* this.pushSpaces(true)) + (yield* this.pushIndicators());
            }
          }
        }
        return 0;
      }
      *pushTag() {
        if (this.charAt(1) === "<") {
          let i = this.pos + 2;
          let ch = this.buffer[i];
          while (!isEmpty(ch) && ch !== ">")
            ch = this.buffer[++i];
          return yield* this.pushToIndex(ch === ">" ? i + 1 : i, false);
        } else {
          let i = this.pos + 1;
          let ch = this.buffer[i];
          while (ch) {
            if (tagChars.has(ch))
              ch = this.buffer[++i];
            else if (ch === "%" && hexDigits.has(this.buffer[i + 1]) && hexDigits.has(this.buffer[i + 2])) {
              ch = this.buffer[i += 3];
            } else
              break;
          }
          return yield* this.pushToIndex(i, false);
        }
      }
      *pushNewline() {
        const ch = this.buffer[this.pos];
        if (ch === "\n")
          return yield* this.pushCount(1);
        else if (ch === "\r" && this.charAt(1) === "\n")
          return yield* this.pushCount(2);
        else
          return 0;
      }
      *pushSpaces(allowTabs) {
        let i = this.pos - 1;
        let ch;
        do {
          ch = this.buffer[++i];
        } while (ch === " " || allowTabs && ch === "	");
        const n = i - this.pos;
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos = i;
        }
        return n;
      }
      *pushUntil(test) {
        let i = this.pos;
        let ch = this.buffer[i];
        while (!test(ch))
          ch = this.buffer[++i];
        return yield* this.pushToIndex(i, false);
      }
    };
    exports.Lexer = Lexer;
  }
});

// node_modules/yaml/dist/parse/line-counter.js
var require_line_counter = __commonJS({
  "node_modules/yaml/dist/parse/line-counter.js"(exports) {
    "use strict";
    var LineCounter = class {
      constructor() {
        this.lineStarts = [];
        this.addNewLine = (offset) => this.lineStarts.push(offset);
        this.linePos = (offset) => {
          let low = 0;
          let high = this.lineStarts.length;
          while (low < high) {
            const mid = low + high >> 1;
            if (this.lineStarts[mid] < offset)
              low = mid + 1;
            else
              high = mid;
          }
          if (this.lineStarts[low] === offset)
            return { line: low + 1, col: 1 };
          if (low === 0)
            return { line: 0, col: offset };
          const start = this.lineStarts[low - 1];
          return { line: low, col: offset - start + 1 };
        };
      }
    };
    exports.LineCounter = LineCounter;
  }
});

// node_modules/yaml/dist/parse/parser.js
var require_parser = __commonJS({
  "node_modules/yaml/dist/parse/parser.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var cst = require_cst();
    var lexer = require_lexer();
    function includesToken(list, type) {
      for (let i = 0; i < list.length; ++i)
        if (list[i].type === type)
          return true;
      return false;
    }
    function findNonEmptyIndex(list) {
      for (let i = 0; i < list.length; ++i) {
        switch (list[i].type) {
          case "space":
          case "comment":
          case "newline":
            break;
          default:
            return i;
        }
      }
      return -1;
    }
    function isFlowToken(token) {
      switch (token?.type) {
        case "alias":
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "flow-collection":
          return true;
        default:
          return false;
      }
    }
    function getPrevProps(parent) {
      switch (parent.type) {
        case "document":
          return parent.start;
        case "block-map": {
          const it = parent.items[parent.items.length - 1];
          return it.sep ?? it.start;
        }
        case "block-seq":
          return parent.items[parent.items.length - 1].start;
        /* istanbul ignore next should not happen */
        default:
          return [];
      }
    }
    function getFirstKeyStartProps(prev) {
      if (prev.length === 0)
        return [];
      let i = prev.length;
      loop: while (--i >= 0) {
        switch (prev[i].type) {
          case "doc-start":
          case "explicit-key-ind":
          case "map-value-ind":
          case "seq-item-ind":
          case "newline":
            break loop;
        }
      }
      while (prev[++i]?.type === "space") {
      }
      return prev.splice(i, prev.length);
    }
    function fixFlowSeqItems(fc) {
      if (fc.start.type === "flow-seq-start") {
        for (const it of fc.items) {
          if (it.sep && !it.value && !includesToken(it.start, "explicit-key-ind") && !includesToken(it.sep, "map-value-ind")) {
            if (it.key)
              it.value = it.key;
            delete it.key;
            if (isFlowToken(it.value)) {
              if (it.value.end)
                Array.prototype.push.apply(it.value.end, it.sep);
              else
                it.value.end = it.sep;
            } else
              Array.prototype.push.apply(it.start, it.sep);
            delete it.sep;
          }
        }
      }
    }
    var Parser2 = class {
      /**
       * @param onNewLine - If defined, called separately with the start position of
       *   each new line (in `parse()`, including the start of input).
       */
      constructor(onNewLine) {
        this.atNewLine = true;
        this.atScalar = false;
        this.indent = 0;
        this.offset = 0;
        this.onKeyLine = false;
        this.stack = [];
        this.source = "";
        this.type = "";
        this.lexer = new lexer.Lexer();
        this.onNewLine = onNewLine;
      }
      /**
       * Parse `source` as a YAML stream.
       * If `incomplete`, a part of the last line may be left as a buffer for the next call.
       *
       * Errors are not thrown, but yielded as `{ type: 'error', message }` tokens.
       *
       * @returns A generator of tokens representing each directive, document, and other structure.
       */
      *parse(source, incomplete = false) {
        if (this.onNewLine && this.offset === 0)
          this.onNewLine(0);
        for (const lexeme of this.lexer.lex(source, incomplete))
          yield* this.next(lexeme);
        if (!incomplete)
          yield* this.end();
      }
      /**
       * Advance the parser by the `source` of one lexical token.
       */
      *next(source) {
        this.source = source;
        if (node_process.env.LOG_TOKENS)
          console.log("|", cst.prettyToken(source));
        if (this.atScalar) {
          this.atScalar = false;
          yield* this.step();
          this.offset += source.length;
          return;
        }
        const type = cst.tokenType(source);
        if (!type) {
          const message = `Not a YAML token: ${source}`;
          yield* this.pop({ type: "error", offset: this.offset, message, source });
          this.offset += source.length;
        } else if (type === "scalar") {
          this.atNewLine = false;
          this.atScalar = true;
          this.type = "scalar";
        } else {
          this.type = type;
          yield* this.step();
          switch (type) {
            case "newline":
              this.atNewLine = true;
              this.indent = 0;
              if (this.onNewLine)
                this.onNewLine(this.offset + source.length);
              break;
            case "space":
              if (this.atNewLine && source[0] === " ")
                this.indent += source.length;
              break;
            case "explicit-key-ind":
            case "map-value-ind":
            case "seq-item-ind":
              if (this.atNewLine)
                this.indent += source.length;
              break;
            case "doc-mode":
            case "flow-error-end":
              return;
            default:
              this.atNewLine = false;
          }
          this.offset += source.length;
        }
      }
      /** Call at end of input to push out any remaining constructions */
      *end() {
        while (this.stack.length > 0)
          yield* this.pop();
      }
      get sourceToken() {
        const st = {
          type: this.type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
        return st;
      }
      *step() {
        const top = this.peek(1);
        if (this.type === "doc-end" && top?.type !== "doc-end") {
          while (this.stack.length > 0)
            yield* this.pop();
          this.stack.push({
            type: "doc-end",
            offset: this.offset,
            source: this.source
          });
          return;
        }
        if (!top)
          return yield* this.stream();
        switch (top.type) {
          case "document":
            return yield* this.document(top);
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return yield* this.scalar(top);
          case "block-scalar":
            return yield* this.blockScalar(top);
          case "block-map":
            return yield* this.blockMap(top);
          case "block-seq":
            return yield* this.blockSequence(top);
          case "flow-collection":
            return yield* this.flowCollection(top);
          case "doc-end":
            return yield* this.documentEnd(top);
        }
        yield* this.pop();
      }
      peek(n) {
        return this.stack[this.stack.length - n];
      }
      *pop(error) {
        const token = error ?? this.stack.pop();
        if (!token) {
          const message = "Tried to pop an empty stack";
          yield { type: "error", offset: this.offset, source: "", message };
        } else if (this.stack.length === 0) {
          yield token;
        } else {
          const top = this.peek(1);
          if (token.type === "block-scalar") {
            token.indent = "indent" in top ? top.indent : 0;
          } else if (token.type === "flow-collection" && top.type === "document") {
            token.indent = 0;
          }
          if (token.type === "flow-collection")
            fixFlowSeqItems(token);
          switch (top.type) {
            case "document":
              top.value = token;
              break;
            case "block-scalar":
              top.props.push(token);
              break;
            case "block-map": {
              const it = top.items[top.items.length - 1];
              if (it.value) {
                top.items.push({ start: [], key: token, sep: [] });
                this.onKeyLine = true;
                return;
              } else if (it.sep) {
                it.value = token;
              } else {
                Object.assign(it, { key: token, sep: [] });
                this.onKeyLine = !it.explicitKey;
                return;
              }
              break;
            }
            case "block-seq": {
              const it = top.items[top.items.length - 1];
              if (it.value)
                top.items.push({ start: [], value: token });
              else
                it.value = token;
              break;
            }
            case "flow-collection": {
              const it = top.items[top.items.length - 1];
              if (!it || it.value)
                top.items.push({ start: [], key: token, sep: [] });
              else if (it.sep)
                it.value = token;
              else
                Object.assign(it, { key: token, sep: [] });
              return;
            }
            /* istanbul ignore next should not happen */
            default:
              yield* this.pop();
              yield* this.pop(token);
          }
          if ((top.type === "document" || top.type === "block-map" || top.type === "block-seq") && (token.type === "block-map" || token.type === "block-seq")) {
            const last = token.items[token.items.length - 1];
            if (last && !last.sep && !last.value && last.start.length > 0 && findNonEmptyIndex(last.start) === -1 && (token.indent === 0 || last.start.every((st) => st.type !== "comment" || st.indent < token.indent))) {
              if (top.type === "document")
                top.end = last.start;
              else
                top.items.push({ start: last.start });
              token.items.splice(-1, 1);
            }
          }
        }
      }
      *stream() {
        switch (this.type) {
          case "directive-line":
            yield { type: "directive", offset: this.offset, source: this.source };
            return;
          case "byte-order-mark":
          case "space":
          case "comment":
          case "newline":
            yield this.sourceToken;
            return;
          case "doc-mode":
          case "doc-start": {
            const doc = {
              type: "document",
              offset: this.offset,
              start: []
            };
            if (this.type === "doc-start")
              doc.start.push(this.sourceToken);
            this.stack.push(doc);
            return;
          }
        }
        yield {
          type: "error",
          offset: this.offset,
          message: `Unexpected ${this.type} token in YAML stream`,
          source: this.source
        };
      }
      *document(doc) {
        if (doc.value)
          return yield* this.lineEnd(doc);
        switch (this.type) {
          case "doc-start": {
            if (findNonEmptyIndex(doc.start) !== -1) {
              yield* this.pop();
              yield* this.step();
            } else
              doc.start.push(this.sourceToken);
            return;
          }
          case "anchor":
          case "tag":
          case "space":
          case "comment":
          case "newline":
            doc.start.push(this.sourceToken);
            return;
        }
        const bv = this.startBlockValue(doc);
        if (bv)
          this.stack.push(bv);
        else {
          yield {
            type: "error",
            offset: this.offset,
            message: `Unexpected ${this.type} token in YAML document`,
            source: this.source
          };
        }
      }
      *scalar(scalar) {
        if (this.type === "map-value-ind") {
          const prev = getPrevProps(this.peek(2));
          const start = getFirstKeyStartProps(prev);
          let sep;
          if (scalar.end) {
            sep = scalar.end;
            sep.push(this.sourceToken);
            delete scalar.end;
          } else
            sep = [this.sourceToken];
          const map = {
            type: "block-map",
            offset: scalar.offset,
            indent: scalar.indent,
            items: [{ start, key: scalar, sep }]
          };
          this.onKeyLine = true;
          this.stack[this.stack.length - 1] = map;
        } else
          yield* this.lineEnd(scalar);
      }
      *blockScalar(scalar) {
        switch (this.type) {
          case "space":
          case "comment":
          case "newline":
            scalar.props.push(this.sourceToken);
            return;
          case "scalar":
            scalar.source = this.source;
            this.atNewLine = true;
            this.indent = 0;
            if (this.onNewLine) {
              let nl = this.source.indexOf("\n") + 1;
              while (nl !== 0) {
                this.onNewLine(this.offset + nl);
                nl = this.source.indexOf("\n", nl) + 1;
              }
            }
            yield* this.pop();
            break;
          /* istanbul ignore next should not happen */
          default:
            yield* this.pop();
            yield* this.step();
        }
      }
      *blockMap(map) {
        const it = map.items[map.items.length - 1];
        switch (this.type) {
          case "newline":
            this.onKeyLine = false;
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              it.start.push(this.sourceToken);
            }
            return;
          case "space":
          case "comment":
            if (it.value) {
              map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              if (this.atIndentedComment(it.start, map.indent)) {
                const prev = map.items[map.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  Array.prototype.push.apply(end, it.start);
                  end.push(this.sourceToken);
                  map.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
        }
        if (this.indent >= map.indent) {
          const atMapIndent = !this.onKeyLine && this.indent === map.indent;
          const atNextItem = atMapIndent && (it.sep || it.explicitKey) && this.type !== "seq-item-ind";
          let start = [];
          if (atNextItem && it.sep && !it.value) {
            const nl = [];
            for (let i = 0; i < it.sep.length; ++i) {
              const st = it.sep[i];
              switch (st.type) {
                case "newline":
                  nl.push(i);
                  break;
                case "space":
                  break;
                case "comment":
                  if (st.indent > map.indent)
                    nl.length = 0;
                  break;
                default:
                  nl.length = 0;
              }
            }
            if (nl.length >= 2)
              start = it.sep.splice(nl[1]);
          }
          switch (this.type) {
            case "anchor":
            case "tag":
              if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start });
                this.onKeyLine = true;
              } else if (it.sep) {
                it.sep.push(this.sourceToken);
              } else {
                it.start.push(this.sourceToken);
              }
              return;
            case "explicit-key-ind":
              if (!it.sep && !it.explicitKey) {
                it.start.push(this.sourceToken);
                it.explicitKey = true;
              } else if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start, explicitKey: true });
              } else {
                this.stack.push({
                  type: "block-map",
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start: [this.sourceToken], explicitKey: true }]
                });
              }
              this.onKeyLine = true;
              return;
            case "map-value-ind":
              if (it.explicitKey) {
                if (!it.sep) {
                  if (includesToken(it.start, "newline")) {
                    Object.assign(it, { key: null, sep: [this.sourceToken] });
                  } else {
                    const start2 = getFirstKeyStartProps(it.start);
                    this.stack.push({
                      type: "block-map",
                      offset: this.offset,
                      indent: this.indent,
                      items: [{ start: start2, key: null, sep: [this.sourceToken] }]
                    });
                  }
                } else if (it.value) {
                  map.items.push({ start: [], key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start, key: null, sep: [this.sourceToken] }]
                  });
                } else if (isFlowToken(it.key) && !includesToken(it.sep, "newline")) {
                  const start2 = getFirstKeyStartProps(it.start);
                  const key = it.key;
                  const sep = it.sep;
                  sep.push(this.sourceToken);
                  delete it.key;
                  delete it.sep;
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: start2, key, sep }]
                  });
                } else if (start.length > 0) {
                  it.sep = it.sep.concat(start, this.sourceToken);
                } else {
                  it.sep.push(this.sourceToken);
                }
              } else {
                if (!it.sep) {
                  Object.assign(it, { key: null, sep: [this.sourceToken] });
                } else if (it.value || atNextItem) {
                  map.items.push({ start, key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: [], key: null, sep: [this.sourceToken] }]
                  });
                } else {
                  it.sep.push(this.sourceToken);
                }
              }
              this.onKeyLine = true;
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs11 = this.flowScalar(this.type);
              if (atNextItem || it.value) {
                map.items.push({ start, key: fs11, sep: [] });
                this.onKeyLine = true;
              } else if (it.sep) {
                this.stack.push(fs11);
              } else {
                Object.assign(it, { key: fs11, sep: [] });
                this.onKeyLine = true;
              }
              return;
            }
            default: {
              const bv = this.startBlockValue(map);
              if (bv) {
                if (bv.type === "block-seq") {
                  if (!it.explicitKey && it.sep && !includesToken(it.sep, "newline")) {
                    yield* this.pop({
                      type: "error",
                      offset: this.offset,
                      message: "Unexpected block-seq-ind on same line with key",
                      source: this.source
                    });
                    return;
                  }
                } else if (atMapIndent) {
                  map.items.push({ start });
                }
                this.stack.push(bv);
                return;
              }
            }
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *blockSequence(seq) {
        const it = seq.items[seq.items.length - 1];
        switch (this.type) {
          case "newline":
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                seq.items.push({ start: [this.sourceToken] });
            } else
              it.start.push(this.sourceToken);
            return;
          case "space":
          case "comment":
            if (it.value)
              seq.items.push({ start: [this.sourceToken] });
            else {
              if (this.atIndentedComment(it.start, seq.indent)) {
                const prev = seq.items[seq.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  Array.prototype.push.apply(end, it.start);
                  end.push(this.sourceToken);
                  seq.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
          case "anchor":
          case "tag":
            if (it.value || this.indent <= seq.indent)
              break;
            it.start.push(this.sourceToken);
            return;
          case "seq-item-ind":
            if (this.indent !== seq.indent)
              break;
            if (it.value || includesToken(it.start, "seq-item-ind"))
              seq.items.push({ start: [this.sourceToken] });
            else
              it.start.push(this.sourceToken);
            return;
        }
        if (this.indent > seq.indent) {
          const bv = this.startBlockValue(seq);
          if (bv) {
            this.stack.push(bv);
            return;
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *flowCollection(fc) {
        const it = fc.items[fc.items.length - 1];
        if (this.type === "flow-error-end") {
          let top;
          do {
            yield* this.pop();
            top = this.peek(1);
          } while (top?.type === "flow-collection");
        } else if (fc.end.length === 0) {
          switch (this.type) {
            case "comma":
            case "explicit-key-ind":
              if (!it || it.sep)
                fc.items.push({ start: [this.sourceToken] });
              else
                it.start.push(this.sourceToken);
              return;
            case "map-value-ind":
              if (!it || it.value)
                fc.items.push({ start: [], key: null, sep: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                Object.assign(it, { key: null, sep: [this.sourceToken] });
              return;
            case "space":
            case "comment":
            case "newline":
            case "anchor":
            case "tag":
              if (!it || it.value)
                fc.items.push({ start: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                it.start.push(this.sourceToken);
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs11 = this.flowScalar(this.type);
              if (!it || it.value)
                fc.items.push({ start: [], key: fs11, sep: [] });
              else if (it.sep)
                this.stack.push(fs11);
              else
                Object.assign(it, { key: fs11, sep: [] });
              return;
            }
            case "flow-map-end":
            case "flow-seq-end":
              fc.end.push(this.sourceToken);
              return;
          }
          const bv = this.startBlockValue(fc);
          if (bv)
            this.stack.push(bv);
          else {
            yield* this.pop();
            yield* this.step();
          }
        } else {
          const parent = this.peek(2);
          if (parent.type === "block-map" && (this.type === "map-value-ind" && parent.indent === fc.indent || this.type === "newline" && !parent.items[parent.items.length - 1].sep)) {
            yield* this.pop();
            yield* this.step();
          } else if (this.type === "map-value-ind" && parent.type !== "flow-collection") {
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            fixFlowSeqItems(fc);
            const sep = fc.end.splice(1, fc.end.length);
            sep.push(this.sourceToken);
            const map = {
              type: "block-map",
              offset: fc.offset,
              indent: fc.indent,
              items: [{ start, key: fc, sep }]
            };
            this.onKeyLine = true;
            this.stack[this.stack.length - 1] = map;
          } else {
            yield* this.lineEnd(fc);
          }
        }
      }
      flowScalar(type) {
        if (this.onNewLine) {
          let nl = this.source.indexOf("\n") + 1;
          while (nl !== 0) {
            this.onNewLine(this.offset + nl);
            nl = this.source.indexOf("\n", nl) + 1;
          }
        }
        return {
          type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
      }
      startBlockValue(parent) {
        switch (this.type) {
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return this.flowScalar(this.type);
          case "block-scalar-header":
            return {
              type: "block-scalar",
              offset: this.offset,
              indent: this.indent,
              props: [this.sourceToken],
              source: ""
            };
          case "flow-map-start":
          case "flow-seq-start":
            return {
              type: "flow-collection",
              offset: this.offset,
              indent: this.indent,
              start: this.sourceToken,
              items: [],
              end: []
            };
          case "seq-item-ind":
            return {
              type: "block-seq",
              offset: this.offset,
              indent: this.indent,
              items: [{ start: [this.sourceToken] }]
            };
          case "explicit-key-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            start.push(this.sourceToken);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, explicitKey: true }]
            };
          }
          case "map-value-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, key: null, sep: [this.sourceToken] }]
            };
          }
        }
        return null;
      }
      atIndentedComment(start, indent) {
        if (this.type !== "comment")
          return false;
        if (this.indent <= indent)
          return false;
        return start.every((st) => st.type === "newline" || st.type === "space");
      }
      *documentEnd(docEnd) {
        if (this.type !== "doc-mode") {
          if (docEnd.end)
            docEnd.end.push(this.sourceToken);
          else
            docEnd.end = [this.sourceToken];
          if (this.type === "newline")
            yield* this.pop();
        }
      }
      *lineEnd(token) {
        switch (this.type) {
          case "comma":
          case "doc-start":
          case "doc-end":
          case "flow-seq-end":
          case "flow-map-end":
          case "map-value-ind":
            yield* this.pop();
            yield* this.step();
            break;
          case "newline":
            this.onKeyLine = false;
          // fallthrough
          case "space":
          case "comment":
          default:
            if (token.end)
              token.end.push(this.sourceToken);
            else
              token.end = [this.sourceToken];
            if (this.type === "newline")
              yield* this.pop();
        }
      }
    };
    exports.Parser = Parser2;
  }
});

// node_modules/yaml/dist/public-api.js
var require_public_api = __commonJS({
  "node_modules/yaml/dist/public-api.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var errors = require_errors();
    var log = require_log();
    var identity = require_identity();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    function parseOptions(options) {
      const prettyErrors = options.prettyErrors !== false;
      const lineCounter$1 = options.lineCounter || prettyErrors && new lineCounter.LineCounter() || null;
      return { lineCounter: lineCounter$1, prettyErrors };
    }
    function parseAllDocuments(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      const docs = Array.from(composer$1.compose(parser$1.parse(source)));
      if (prettyErrors && lineCounter2)
        for (const doc of docs) {
          doc.errors.forEach(errors.prettifyError(source, lineCounter2));
          doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
        }
      if (docs.length > 0)
        return docs;
      return Object.assign([], { empty: true }, composer$1.streamInfo());
    }
    function parseDocument(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      let doc = null;
      for (const _doc of composer$1.compose(parser$1.parse(source), true, source.length)) {
        if (!doc)
          doc = _doc;
        else if (doc.options.logLevel !== "silent") {
          doc.errors.push(new errors.YAMLParseError(_doc.range.slice(0, 2), "MULTIPLE_DOCS", "Source contains multiple documents; please use YAML.parseAllDocuments()"));
          break;
        }
      }
      if (prettyErrors && lineCounter2) {
        doc.errors.forEach(errors.prettifyError(source, lineCounter2));
        doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
      }
      return doc;
    }
    function parse(src, reviver, options) {
      let _reviver = void 0;
      if (typeof reviver === "function") {
        _reviver = reviver;
      } else if (options === void 0 && reviver && typeof reviver === "object") {
        options = reviver;
      }
      const doc = parseDocument(src, options);
      if (!doc)
        return null;
      doc.warnings.forEach((warning) => log.warn(doc.options.logLevel, warning));
      if (doc.errors.length > 0) {
        if (doc.options.logLevel !== "silent")
          throw doc.errors[0];
        else
          doc.errors = [];
      }
      return doc.toJS(Object.assign({ reviver: _reviver }, options));
    }
    function stringify(value, replacer, options) {
      let _replacer = null;
      if (typeof replacer === "function" || Array.isArray(replacer)) {
        _replacer = replacer;
      } else if (options === void 0 && replacer) {
        options = replacer;
      }
      if (typeof options === "string")
        options = options.length;
      if (typeof options === "number") {
        const indent = Math.round(options);
        options = indent < 1 ? void 0 : indent > 8 ? { indent: 8 } : { indent };
      }
      if (value === void 0) {
        const { keepUndefined } = options ?? replacer ?? {};
        if (!keepUndefined)
          return void 0;
      }
      if (identity.isDocument(value) && !_replacer)
        return value.toString(options);
      return new Document.Document(value, _replacer, options).toString(options);
    }
    exports.parse = parse;
    exports.parseAllDocuments = parseAllDocuments;
    exports.parseDocument = parseDocument;
    exports.stringify = stringify;
  }
});

// node_modules/yaml/dist/index.js
var require_dist = __commonJS({
  "node_modules/yaml/dist/index.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var Schema = require_Schema();
    var errors = require_errors();
    var Alias = require_Alias();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var cst = require_cst();
    var lexer = require_lexer();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    var publicApi = require_public_api();
    var visit = require_visit();
    exports.Composer = composer.Composer;
    exports.Document = Document.Document;
    exports.Schema = Schema.Schema;
    exports.YAMLError = errors.YAMLError;
    exports.YAMLParseError = errors.YAMLParseError;
    exports.YAMLWarning = errors.YAMLWarning;
    exports.Alias = Alias.Alias;
    exports.isAlias = identity.isAlias;
    exports.isCollection = identity.isCollection;
    exports.isDocument = identity.isDocument;
    exports.isMap = identity.isMap;
    exports.isNode = identity.isNode;
    exports.isPair = identity.isPair;
    exports.isScalar = identity.isScalar;
    exports.isSeq = identity.isSeq;
    exports.Pair = Pair.Pair;
    exports.Scalar = Scalar.Scalar;
    exports.YAMLMap = YAMLMap.YAMLMap;
    exports.YAMLSeq = YAMLSeq.YAMLSeq;
    exports.CST = cst;
    exports.Lexer = lexer.Lexer;
    exports.LineCounter = lineCounter.LineCounter;
    exports.Parser = parser.Parser;
    exports.parse = publicApi.parse;
    exports.parseAllDocuments = publicApi.parseAllDocuments;
    exports.parseDocument = publicApi.parseDocument;
    exports.stringify = publicApi.stringify;
    exports.visit = visit.visit;
    exports.visitAsync = visit.visitAsync;
  }
});

// tools/spec-graph/metadata-schema.ts
function objectOf(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function nonEmpty(value) {
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function validateRequirementMetadata(value) {
  const issues = [];
  const raw = objectOf(value);
  if (!raw) return { issues: [{ code: "FR_METADATA_INVALID", path: "$", message: "metadata must be an object" }] };
  if (raw.schemaVersion !== 1) issues.push({ code: "FR_METADATA_INVALID", path: "schemaVersion", message: "schemaVersion must be 1" });
  const verificationMethod = raw.verificationMethod === void 0 ? void 0 : enumValue(raw.verificationMethod, VERIFICATION_METHODS);
  if (raw.verificationMethod !== void 0 && !verificationMethod) issues.push({ code: "FR_METADATA_INVALID", path: "verificationMethod", message: `must be one of ${VERIFICATION_METHODS.join("|")}` });
  const safetyClass = raw.safetyClass === void 0 ? void 0 : enumValue(raw.safetyClass, SAFETY_CLASSES);
  if (raw.safetyClass !== void 0 && !safetyClass) issues.push({ code: "FR_METADATA_INVALID", path: "safetyClass", message: `must be one of ${SAFETY_CLASSES.join("|")}` });
  const risks = [];
  if (raw.risks !== void 0 && !Array.isArray(raw.risks)) issues.push({ code: "FR_METADATA_INVALID", path: "risks", message: "must be an array" });
  for (const [index, value2] of (Array.isArray(raw.risks) ? raw.risks : []).entries()) {
    const risk = objectOf(value2);
    const likelihood = enumValue(risk?.likelihood, ["low", "medium", "high"]);
    const impact = enumValue(risk?.impact, ["low", "medium", "high"]);
    const id = nonEmpty(risk?.id);
    if (!risk || !id || !likelihood || !impact) {
      issues.push({ code: "FR_METADATA_INVALID", path: `risks[${index}]`, message: "risk requires id and low|medium|high likelihood/impact" });
      continue;
    }
    risks.push({ id, likelihood, impact, ...nonEmpty(risk.mitigation) ? { mitigation: nonEmpty(risk.mitigation) } : {} });
  }
  const demands = [];
  const seen = /* @__PURE__ */ new Set();
  if (raw.demands !== void 0 && !Array.isArray(raw.demands)) issues.push({ code: "FR_METADATA_INVALID", path: "demands", message: "must be an array" });
  for (const [index, value2] of (Array.isArray(raw.demands) ? raw.demands : []).entries()) {
    const demand = objectOf(value2);
    const type = enumValue(demand?.type, DEMAND_TYPES);
    const obligation = enumValue(demand?.obligation, DEMAND_OBLIGATIONS);
    const state = demand?.state === void 0 ? void 0 : enumValue(demand.state, DEMAND_STATES);
    const rationale = nonEmpty(demand?.rationale);
    const actor = nonEmpty(demand?.actor);
    const auditRef = nonEmpty(demand?.auditRef);
    if (!demand || !type) {
      issues.push({ code: "FR_METADATA_INVALID", path: `demands[${index}].type`, message: `must be one of ${DEMAND_TYPES.join("|")}` });
      continue;
    }
    if (!obligation) {
      issues.push({ code: "FR_METADATA_INVALID", path: `demands[${index}].obligation`, message: `must be one of ${DEMAND_OBLIGATIONS.join("|")}` });
      continue;
    }
    if (demand.state !== void 0 && !state) issues.push({ code: "FR_METADATA_INVALID", path: `demands[${index}].state`, message: `must be one of ${DEMAND_STATES.join("|")}` });
    if ((obligation === "optional" || obligation === "not-applicable" || state === "NOT_APPLICABLE") && !rationale) issues.push({ code: "FR_METADATA_INVALID", path: `demands[${index}].rationale`, message: `${obligation}/${state ?? ""} requires rationale` });
    if (state === "WAIVED" && (!rationale || !actor || !auditRef)) issues.push({ code: "FR_METADATA_INVALID", path: `demands[${index}]`, message: "WAIVED requires rationale, actor and auditRef" });
    if (seen.has(type)) issues.push({ code: "FR_DEMAND_CONFLICT", path: `demands[${index}].type`, message: `duplicate demand type ${type}` });
    seen.add(type);
    const strings = (entry) => Array.isArray(entry) ? entry.filter((v) => typeof v === "string") : void 0;
    demands.push({ type, obligation, ...state ? { state } : {}, ...rationale ? { rationale } : {}, ...actor ? { actor } : {}, ...auditRef ? { auditRef } : {}, ...strings(demand.evidenceRefs) ? { evidenceRefs: strings(demand.evidenceRefs) } : {}, ...strings(demand.forwardTo) ? { forwardTo: strings(demand.forwardTo) } : {} });
  }
  const known = /* @__PURE__ */ new Set(["schemaVersion", "verificationMethod", "safetyClass", "rationale", "risks", "demands"]);
  const unknown = Object.fromEntries(Object.entries(raw).filter(([key]) => !known.has(key)));
  return {
    ...issues.length === 0 ? { metadata: { schemaVersion: 1, ...verificationMethod ? { verificationMethod } : {}, ...safetyClass ? { safetyClass } : {}, ...nonEmpty(raw.rationale) ? { rationale: nonEmpty(raw.rationale) } : {}, risks, demands, _unknown: unknown } } : {},
    issues
  };
}
function parseRequirementMetadataYaml(source) {
  try {
    return validateRequirementMetadata((0, import_yaml.parse)(source));
  } catch (error) {
    return { issues: [{ code: "FR_METADATA_INVALID", path: "$", message: `invalid YAML: ${error.message}` }] };
  }
}
var import_yaml, VERIFICATION_METHODS, SAFETY_CLASSES, DEMAND_TYPES, DEMAND_OBLIGATIONS, DEMAND_STATES, enumValue;
var init_metadata_schema = __esm({
  "tools/spec-graph/metadata-schema.ts"() {
    "use strict";
    import_yaml = __toESM(require_dist(), 1);
    VERIFICATION_METHODS = ["test", "analysis", "review", "inspection", "demonstration"];
    SAFETY_CLASSES = ["critical", "major", "minor"];
    DEMAND_TYPES = ["implementation", "integration-test", "documentation", "migration", "operational-proof"];
    DEMAND_OBLIGATIONS = ["required", "optional", "not-applicable"];
    DEMAND_STATES = ["PRESENT", "MISSING", "NOT_APPLICABLE", "WAIVED"];
    enumValue = (value, values) => typeof value === "string" && values.includes(value) ? value : void 0;
  }
});

// tools/spec-graph/parsers/md.ts
import fs2 from "node:fs";
import path2 from "node:path";
function slugify(text) {
  return marksmanSlug(text);
}
function stripInlineMarkers(text) {
  let s = text;
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1");
  s = s.replace(/__([^_]+)__/g, "$1");
  s = s.replace(/\*([^*]+)\*/g, "$1");
  s = s.replace(/_([^_]+)_/g, "$1");
  s = s.replace(/`([^`]+)`/g, "$1");
  return s.trim();
}
function relocatedTitleAfter(lines, i) {
  for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
    const t = lines[j].trim();
    if (!t) continue;
    if (t.startsWith("#")) return "";
    const m = t.match(/^\*\*(.+?)\*\*$/);
    return m ? stripInlineMarkers(m[1]).trim() : "";
  }
  return "";
}
function parentFrAfter(lines, i) {
  for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
    const t = lines[j].trim();
    if (!t) continue;
    if (t.startsWith("#")) return "";
    const href = t.match(/#fr-(\d+)\b/i);
    if (href) return `FR-${href[1]}`;
    const m = t.match(/\bFR-(\d+)\b/);
    if (m) return `FR-${m[1]}`;
  }
  return "";
}
function decisionRequirementAfter(lines, i) {
  for (let j = i + 1; j < Math.min(lines.length, i + 14); j++) {
    const t = lines[j].trim();
    if (t.startsWith("#")) return "";
    const label = t.match(/^\*\*\s*(?:Требовани[ея]|Requirements?)\s*:?\s*\*\*\s*:?\s*(.*)$/i);
    if (!label) continue;
    const rest = label[1];
    const href = rest.match(/#fr-(\d+)\b/i);
    if (href) return `FR-${href[1]}`;
    const m = rest.match(/\bFR-(\d+)\b/);
    return m ? `FR-${m[1]}` : "";
  }
  return "";
}
function sectionEnd(lines, headingIndex, level) {
  for (let i = headingIndex + 1; i < lines.length; i++) {
    const match = lines[i].match(HEADING_LINE_RE);
    if (match && match[1].length <= level) return i;
  }
  return lines.length;
}
function requirementFields(lines, headingIndex, level) {
  const end = sectionEnd(lines, headingIndex, level);
  const bodyLines = lines.slice(headingIndex + 1, end);
  const marker = bodyLines.findIndex((line) => /^```yaml\s+metadata\s*$/.test(line.trim()));
  if (marker < 0) return { body: bodyLines.join("\n").trim() };
  const close = bodyLines.findIndex((line, index) => index > marker && line.trim() === "```");
  if (close < 0) return { body: bodyLines.join("\n").trim(), metadataIssues: [{ code: "FR_METADATA_INVALID", path: "$", message: "metadata block has no closing fence" }] };
  const parsed = parseRequirementMetadataYaml(bodyLines.slice(marker + 1, close).join("\n"));
  return {
    body: [...bodyLines.slice(0, marker), ...bodyLines.slice(close + 1)].join("\n").trim(),
    ...parsed.metadata ? { metadata: parsed.metadata } : {},
    ...parsed.issues.length > 0 ? { metadataIssues: parsed.issues } : {}
  };
}
function parseMarkdown(mdSource, relativePath) {
  const nodes = [];
  const edges = [];
  const anchors = [];
  const lines = mdSource.split(/\r?\n/);
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (FENCE_RE.test(raw)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (raw.charCodeAt(0) !== 35) continue;
    const hm = raw.match(HEADING_LINE_RE);
    if (!hm) continue;
    const text = stripInlineMarkers(hm[2]);
    const line = i + 1;
    const location = { file: relativePath, line };
    let m = text.match(LEGACY_FR_HEADING_RE);
    if (m) {
      const num = m[1];
      const title = m[2].trim();
      const compact = `FR-${num}`;
      const modernSlug = `fr-${num}-${slugify(title)}`;
      const legacySlug = `requirement-fr-${num}-${slugify(title)}`;
      const node = {
        id: compact,
        type: "FR",
        title,
        file: relativePath,
        line,
        anchors: [compact, modernSlug, legacySlug],
        ...requirementFields(lines, i, hm[1].length)
      };
      nodes.push(node);
      anchors.push(
        { alias: compact, canonicalId: compact, location },
        { alias: modernSlug, canonicalId: compact, location },
        { alias: legacySlug, canonicalId: compact, location }
      );
      continue;
    }
    m = text.match(FR_HEADING_RE);
    if (m) {
      const num = m[1];
      const title = m[2].trim();
      const compact = `FR-${num}`;
      const slug = `fr-${num}-${slugify(title)}`;
      const node = {
        id: compact,
        type: "FR",
        title,
        file: relativePath,
        line,
        anchors: [compact, slug],
        ...requirementFields(lines, i, hm[1].length)
      };
      nodes.push(node);
      anchors.push(
        { alias: compact, canonicalId: compact, location },
        { alias: slug, canonicalId: compact, location }
      );
      continue;
    }
    m = text.match(NFR_HEADING_RE);
    if (m) {
      const category = m[1];
      const num = m[2];
      const title = m[3].trim();
      const compact = category ? `NFR-${category}-${num}` : `NFR-${num}`;
      const slug = `nfr-${category ? `${category.toLowerCase()}-` : ""}${num}-${slugify(title)}`;
      const node = {
        id: compact,
        type: "NFR",
        title,
        category,
        file: relativePath,
        line,
        anchors: [compact, slug],
        ...requirementFields(lines, i, hm[1].length)
      };
      nodes.push(node);
      anchors.push(
        { alias: compact, canonicalId: compact, location },
        { alias: slug, canonicalId: compact, location }
      );
      continue;
    }
    m = text.match(AC_HEADING_RE);
    if (m) {
      const acId = `AC-${m[1]}`;
      const parentFr = `FR-${m[2]}`;
      const ears = (m[3] || "").trim();
      const node = {
        id: acId,
        type: "AC",
        parentFr,
        file: relativePath,
        line,
        ears
      };
      nodes.push(node);
      edges.push({ from: parentFr, to: acId, type: "covers" });
      anchors.push({ alias: acId, canonicalId: acId, location });
      continue;
    }
    m = text.match(SHORT_FR_RE);
    if (m) {
      const num = m[1];
      const compact = `FR-${num}`;
      const slug = `fr-${num}`;
      const title = relocatedTitleAfter(lines, i);
      const node = { id: compact, type: "FR", title, file: relativePath, line, anchors: [compact, slug], ...requirementFields(lines, i, hm[1].length) };
      nodes.push(node);
      anchors.push(
        { alias: compact, canonicalId: compact, location },
        { alias: slug, canonicalId: compact, location }
      );
      continue;
    }
    m = text.match(SHORT_NFR_RE);
    if (m) {
      const category = m[1];
      const num = m[2];
      const compact = category ? `NFR-${category}-${num}` : `NFR-${num}`;
      const slug = `nfr-${category ? `${category.toLowerCase()}-` : ""}${num}`;
      const title = relocatedTitleAfter(lines, i);
      const node = { id: compact, type: "NFR", title, category, file: relativePath, line, anchors: [compact, slug], ...requirementFields(lines, i, hm[1].length) };
      nodes.push(node);
      anchors.push(
        { alias: compact, canonicalId: compact, location },
        { alias: slug, canonicalId: compact, location }
      );
      continue;
    }
    m = text.match(SHORT_AC_RE);
    if (m) {
      const acId = `AC-${m[1]}`;
      const slug = marksmanSlug(acId);
      const parentFr = parentFrAfter(lines, i);
      const node = { id: acId, type: "AC", parentFr, file: relativePath, line, ears: "" };
      nodes.push(node);
      if (parentFr) edges.push({ from: parentFr, to: acId, type: "covers" });
      anchors.push(
        { alias: acId, canonicalId: acId, location },
        { alias: slug, canonicalId: acId, location }
      );
      continue;
    }
    m = text.match(DECISION_HEADING_RE);
    if (m) {
      const title = m[1].trim();
      const decId = `Decision-${slugify(title)}`;
      const slug = slugify(text);
      const parentFr = decisionRequirementAfter(lines, i);
      const node = { id: decId, type: "Decision", title, parentFr, file: relativePath, line, body: text };
      nodes.push(node);
      if (parentFr) {
        edges.push({ from: parentFr, to: decId, type: "covers" });
        edges.push({ from: decId, to: parentFr, type: "entitles" });
      }
      anchors.push(
        { alias: decId, canonicalId: decId, location },
        { alias: slug, canonicalId: decId, location }
      );
      continue;
    }
    m = text.match(STORY_HEADING_RE);
    if (m) {
      const num = m[1];
      const title = m[2].trim();
      const storyId = `Story-${num}-${slugify(title)}`;
      const slug = slugify(text);
      const parentFr = decisionRequirementAfter(lines, i);
      const node = { id: storyId, type: "Story", title, parentFr, file: relativePath, line, body: text };
      nodes.push(node);
      if (parentFr) edges.push({ from: parentFr, to: storyId, type: "covers" });
      anchors.push(
        { alias: storyId, canonicalId: storyId, location },
        { alias: slug, canonicalId: storyId, location }
      );
      continue;
    }
  }
  qualifySlice({ nodes, edges }, specOf(relativePath));
  return { nodes, edges, anchors };
}
function parseMarkdownFile(absPath, repoRoot) {
  const source = fs2.readFileSync(absPath, "utf-8");
  const relative = path2.relative(repoRoot, absPath).split(path2.sep).join("/");
  return parseMarkdown(source, relative);
}
var HEADING_LINE_RE, FENCE_RE, FR_HEADING_RE, NFR_HEADING_RE, AC_HEADING_RE, DECISION_HEADING_RE, STORY_HEADING_RE, SHORT_FR_RE, SHORT_NFR_RE, SHORT_AC_RE, LEGACY_FR_HEADING_RE;
var init_md = __esm({
  "tools/spec-graph/parsers/md.ts"() {
    "use strict";
    init_marksman_slug();
    init_coverage();
    init_metadata_schema();
    HEADING_LINE_RE = /^(#{1,6})\s+(.+?)\s*$/;
    FENCE_RE = /^(?:```|~~~)/;
    FR_HEADING_RE = /^FR-(\d+):\s*(.+)$/;
    NFR_HEADING_RE = /^NFR(?:-([A-Za-z][A-Za-z0-9]*))?-(\d+):\s*(.+)$/;
    AC_HEADING_RE = /^AC-(\d+(?:\.\d+)?)\s*\(FR-(\d+)\)\s*:?\s*(.*)$/;
    DECISION_HEADING_RE = /^Decision:\s*(.+)$/;
    STORY_HEADING_RE = /^User Story (\d+):\s*(.+)$/;
    SHORT_FR_RE = /^FR-(\d+)$/;
    SHORT_NFR_RE = /^NFR(?:-([A-Za-z][A-Za-z0-9]*))?-(\d+)$/;
    SHORT_AC_RE = /^AC-(\d+(?:\.\d+)?)$/;
    LEGACY_FR_HEADING_RE = /^Requirement:\s*FR-(\d+)\s+(.+)$/;
  }
});

// node_modules/@cucumber/gherkin/dist/src/AstNode.js
var require_AstNode = __commonJS({
  "node_modules/@cucumber/gherkin/dist/src/AstNode.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var AstNode = class {
      constructor(ruleType) {
        this.ruleType = ruleType;
        this.subItems = /* @__PURE__ */ new Map();
      }
      // biome-ignore lint/suspicious/noExplicitAny: keys and values are heterogeneous AST entries
      add(type, obj) {
        let items = this.subItems.get(type);
        if (items === void 0) {
          items = [];
          this.subItems.set(type, items);
        }
        items.push(obj);
      }
      getSingle(ruleType) {
        return (this.subItems.get(ruleType) || [])[0];
      }
      getItems(ruleType) {
        return this.subItems.get(ruleType) || [];
      }
      getToken(tokenType) {
        return (this.subItems.get(tokenType) || [])[0];
      }
      getTokens(tokenType) {
        return this.subItems.get(tokenType) || [];
      }
    };
    exports.default = AstNode;
  }
});

// node_modules/@cucumber/gherkin/dist/src/Errors.js
var require_Errors = __commonJS({
  "node_modules/@cucumber/gherkin/dist/src/Errors.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.NoSuchLanguageException = exports.AstBuilderException = exports.CompositeParserException = exports.ParserException = exports.GherkinException = void 0;
    var GherkinException = class extends Error {
      constructor(message) {
        super(message);
        const actualProto = new.target.prototype;
        if (Object.setPrototypeOf) {
          Object.setPrototypeOf(this, actualProto);
        } else {
          this.__proto__ = actualProto;
        }
      }
      static _create(message, location) {
        const column = location != null ? location.column || 0 : -1;
        const line = location != null ? location.line || 0 : -1;
        const m = `(${line}:${column}): ${message}`;
        const err = new this(m);
        err.location = location;
        return err;
      }
    };
    exports.GherkinException = GherkinException;
    var ParserException = class _ParserException extends GherkinException {
      static create(message, line, column) {
        const err = new _ParserException(`(${line}:${column}): ${message}`);
        err.location = { line, column };
        return err;
      }
    };
    exports.ParserException = ParserException;
    var CompositeParserException = class _CompositeParserException extends GherkinException {
      static create(errors) {
        const message = `Parser errors:
${errors.map((e) => e.message).join("\n")}`;
        const err = new _CompositeParserException(message);
        err.errors = errors;
        return err;
      }
    };
    exports.CompositeParserException = CompositeParserException;
    var AstBuilderException = class _AstBuilderException extends GherkinException {
      static create(message, location) {
        return _AstBuilderException._create(message, location);
      }
    };
    exports.AstBuilderException = AstBuilderException;
    var NoSuchLanguageException = class _NoSuchLanguageException extends GherkinException {
      static create(language, location) {
        const message = `Language not supported: ${language}`;
        return _NoSuchLanguageException._create(message, location);
      }
    };
    exports.NoSuchLanguageException = NoSuchLanguageException;
  }
});

// node_modules/@cucumber/gherkin/dist/src/TokenExceptions.js
var require_TokenExceptions = __commonJS({
  "node_modules/@cucumber/gherkin/dist/src/TokenExceptions.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.UnexpectedEOFException = exports.UnexpectedTokenException = void 0;
    var Errors_1 = require_Errors();
    var UnexpectedTokenException = class _UnexpectedTokenException extends Errors_1.GherkinException {
      static create(token, expectedTokenTypes) {
        const message = `expected: ${expectedTokenTypes.join(", ")}, got '${token.getTokenValue().trim()}'`;
        const location = tokenLocation(token);
        return _UnexpectedTokenException._create(message, location);
      }
    };
    exports.UnexpectedTokenException = UnexpectedTokenException;
    var UnexpectedEOFException = class _UnexpectedEOFException extends Errors_1.GherkinException {
      static create(token, expectedTokenTypes) {
        const message = `unexpected end of file, expected: ${expectedTokenTypes.join(", ")}`;
        const location = tokenLocation(token);
        return _UnexpectedEOFException._create(message, location);
      }
    };
    exports.UnexpectedEOFException = UnexpectedEOFException;
    function tokenLocation(token) {
      var _a;
      return ((_a = token.location) === null || _a === void 0 ? void 0 : _a.line) && token.line && token.line.indent !== void 0 ? {
        line: token.location.line,
        column: token.line.indent + 1
      } : token.location;
    }
  }
});

// node_modules/@cucumber/gherkin/dist/src/TokenScanner.js
var require_TokenScanner = __commonJS({
  "node_modules/@cucumber/gherkin/dist/src/TokenScanner.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var TokenScanner = class {
      constructor(source, makeToken) {
        this.makeToken = makeToken;
        this.lineNumber = 0;
        this.lines = source.split(/\r?\n/);
        if (this.lines.length > 0 && this.lines[this.lines.length - 1].trim() === "") {
          this.lines.pop();
        }
      }
      read() {
        const line = this.lines[this.lineNumber++];
        const location = {
          line: this.lineNumber
        };
        return this.makeToken(line, location);
      }
    };
    exports.default = TokenScanner;
  }
});

// node_modules/@cucumber/gherkin/dist/src/countSymbols.js
var require_countSymbols = __commonJS({
  "node_modules/@cucumber/gherkin/dist/src/countSymbols.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = countSymbols;
    var regexAstralSymbols = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g;
    function countSymbols(s) {
      return s.replace(regexAstralSymbols, "_").length;
    }
  }
});

// node_modules/@cucumber/gherkin/dist/src/GherkinLine.js
var require_GherkinLine = __commonJS({
  "node_modules/@cucumber/gherkin/dist/src/GherkinLine.js"(exports, module) {
    "use strict";
    var __importDefault = exports && exports.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    var countSymbols_1 = __importDefault(require_countSymbols());
    var GherkinLine = class {
      constructor(lineText, lineNumber) {
        this.lineText = lineText;
        this.lineNumber = lineNumber;
        this.trimmedLineText = lineText.replace(/^\s+/g, "");
        this.isEmpty = this.trimmedLineText.length === 0;
        this.indent = (0, countSymbols_1.default)(lineText) - (0, countSymbols_1.default)(this.trimmedLineText);
      }
      startsWith(prefix) {
        return this.trimmedLineText.indexOf(prefix) === 0;
      }
      startsWithTitleKeyword(keyword) {
        return this.startsWith(`${keyword}:`);
      }
      match(regexp) {
        return this.trimmedLineText.match(regexp);
      }
      getLineText(indentToRemove) {
        if (indentToRemove < 0 || indentToRemove > this.indent) {
          return this.trimmedLineText;
        } else {
          return this.lineText.substring(indentToRemove);
        }
      }
      getRestTrimmed(length) {
        return this.trimmedLineText.substring(length).trim();
      }
      getTableCells() {
        const cells = [];
        let col = 0;
        let startCol = col + 1;
        let cell = "";
        let firstCell = true;
        while (col < this.trimmedLineText.length) {
          let chr = this.trimmedLineText[col];
          col++;
          if (chr === "|") {
            if (firstCell) {
              firstCell = false;
            } else {
              const trimmedLeft = cell.replace(/^[ \t\v\f\r\u0085\u00A0]*/g, "");
              const trimmed = trimmedLeft.replace(/[ \t\v\f\r\u0085\u00A0]*$/g, "");
              const cellIndent = cell.length - trimmedLeft.length;
              const span = {
                column: this.indent + startCol + cellIndent,
                text: trimmed
              };
              cells.push(span);
            }
            cell = "";
            startCol = col + 1;
          } else if (chr === "\\") {
            chr = this.trimmedLineText[col];
            col += 1;
            if (chr === "n") {
              cell += "\n";
            } else {
              if (chr !== "|" && chr !== "\\") {
                cell += "\\";
              }
              cell += chr;
            }
          } else {
            cell += chr;
          }
        }
        return cells;
      }
    };
    exports.default = GherkinLine;
    module.exports = GherkinLine;
  }
});

// node_modules/@cucumber/gherkin/dist/src/Parser.js
var require_Parser = __commonJS({
  "node_modules/@cucumber/gherkin/dist/src/Parser.js"(exports) {
    "use strict";
    var __importDefault = exports && exports.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.RuleType = exports.TokenType = exports.Token = void 0;
    var Errors_1 = require_Errors();
    var TokenExceptions_1 = require_TokenExceptions();
    var TokenScanner_1 = __importDefault(require_TokenScanner());
    var GherkinLine_1 = __importDefault(require_GherkinLine());
    var Token = class {
      constructor(line, location) {
        this.line = line;
        this.location = location;
        this.isEof = !line;
      }
      getTokenValue() {
        return this.isEof ? "EOF" : this.line.getLineText(-1);
      }
    };
    exports.Token = Token;
    var TokenType;
    (function(TokenType2) {
      TokenType2[TokenType2["None"] = 0] = "None";
      TokenType2[TokenType2["EOF"] = 1] = "EOF";
      TokenType2[TokenType2["Empty"] = 2] = "Empty";
      TokenType2[TokenType2["Comment"] = 3] = "Comment";
      TokenType2[TokenType2["TagLine"] = 4] = "TagLine";
      TokenType2[TokenType2["FeatureLine"] = 5] = "FeatureLine";
      TokenType2[TokenType2["RuleLine"] = 6] = "RuleLine";
      TokenType2[TokenType2["BackgroundLine"] = 7] = "BackgroundLine";
      TokenType2[TokenType2["ScenarioLine"] = 8] = "ScenarioLine";
      TokenType2[TokenType2["ExamplesLine"] = 9] = "ExamplesLine";
      TokenType2[TokenType2["StepLine"] = 10] = "StepLine";
      TokenType2[TokenType2["DocStringSeparator"] = 11] = "DocStringSeparator";
      TokenType2[TokenType2["TableRow"] = 12] = "TableRow";
      TokenType2[TokenType2["Language"] = 13] = "Language";
      TokenType2[TokenType2["Other"] = 14] = "Other";
    })(TokenType || (exports.TokenType = TokenType = {}));
    var RuleType;
    (function(RuleType2) {
      RuleType2[RuleType2["None"] = 0] = "None";
      RuleType2[RuleType2["_EOF"] = 1] = "_EOF";
      RuleType2[RuleType2["_Empty"] = 2] = "_Empty";
      RuleType2[RuleType2["_Comment"] = 3] = "_Comment";
      RuleType2[RuleType2["_TagLine"] = 4] = "_TagLine";
      RuleType2[RuleType2["_FeatureLine"] = 5] = "_FeatureLine";
      RuleType2[RuleType2["_RuleLine"] = 6] = "_RuleLine";
      RuleType2[RuleType2["_BackgroundLine"] = 7] = "_BackgroundLine";
      RuleType2[RuleType2["_ScenarioLine"] = 8] = "_ScenarioLine";
      RuleType2[RuleType2["_ExamplesLine"] = 9] = "_ExamplesLine";
      RuleType2[RuleType2["_StepLine"] = 10] = "_StepLine";
      RuleType2[RuleType2["_DocStringSeparator"] = 11] = "_DocStringSeparator";
      RuleType2[RuleType2["_TableRow"] = 12] = "_TableRow";
      RuleType2[RuleType2["_Language"] = 13] = "_Language";
      RuleType2[RuleType2["_Other"] = 14] = "_Other";
      RuleType2[RuleType2["GherkinDocument"] = 15] = "GherkinDocument";
      RuleType2[RuleType2["Feature"] = 16] = "Feature";
      RuleType2[RuleType2["FeatureHeader"] = 17] = "FeatureHeader";
      RuleType2[RuleType2["Rule"] = 18] = "Rule";
      RuleType2[RuleType2["RuleHeader"] = 19] = "RuleHeader";
      RuleType2[RuleType2["Background"] = 20] = "Background";
      RuleType2[RuleType2["ScenarioDefinition"] = 21] = "ScenarioDefinition";
      RuleType2[RuleType2["Scenario"] = 22] = "Scenario";
      RuleType2[RuleType2["ExamplesDefinition"] = 23] = "ExamplesDefinition";
      RuleType2[RuleType2["Examples"] = 24] = "Examples";
      RuleType2[RuleType2["ExamplesTable"] = 25] = "ExamplesTable";
      RuleType2[RuleType2["Step"] = 26] = "Step";
      RuleType2[RuleType2["StepArg"] = 27] = "StepArg";
      RuleType2[RuleType2["DataTable"] = 28] = "DataTable";
      RuleType2[RuleType2["DocString"] = 29] = "DocString";
      RuleType2[RuleType2["Tags"] = 30] = "Tags";
      RuleType2[RuleType2["DescriptionHelper"] = 31] = "DescriptionHelper";
      RuleType2[RuleType2["Description"] = 32] = "Description";
    })(RuleType || (exports.RuleType = RuleType = {}));
    var Parser2 = class {
      constructor(builder, tokenMatcher) {
        this.builder = builder;
        this.tokenMatcher = tokenMatcher;
        this.stopAtFirstError = false;
      }
      parse(gherkinSource) {
        const tokenScanner = new TokenScanner_1.default(gherkinSource, (line, location) => {
          const gherkinLine = line === null || line === void 0 ? null : new GherkinLine_1.default(line, location.line);
          return new Token(gherkinLine, location);
        });
        this.builder.reset();
        this.tokenMatcher.reset();
        this.context = {
          tokenScanner,
          tokenQueue: [],
          errors: []
        };
        this.startRule(this.context, RuleType.GherkinDocument);
        let state = 0;
        let token = null;
        while (true) {
          token = this.readToken(this.context);
          state = this.matchToken(state, token, this.context);
          if (token.isEof)
            break;
        }
        this.endRule(this.context);
        if (this.context.errors.length > 0) {
          throw Errors_1.CompositeParserException.create(this.context.errors);
        }
        return this.getResult();
      }
      addError(context, error) {
        if (!context.errors.map((e) => {
          return e.message;
        }).includes(error.message)) {
          context.errors.push(error);
          if (context.errors.length > 10)
            throw Errors_1.CompositeParserException.create(context.errors);
        }
      }
      startRule(context, ruleType) {
        this.handleAstError(context, () => this.builder.startRule(ruleType));
      }
      endRule(context) {
        this.handleAstError(context, () => this.builder.endRule());
      }
      build(context, token) {
        this.handleAstError(context, () => this.builder.build(token));
      }
      getResult() {
        return this.builder.getResult();
      }
      handleAstError(context, action) {
        this.handleExternalError(context, true, action);
      }
      handleExternalError(context, defaultValue, action) {
        if (this.stopAtFirstError)
          return action();
        try {
          return action();
        } catch (e) {
          if (e instanceof Errors_1.CompositeParserException) {
            e.errors.forEach((error) => this.addError(context, error));
          } else if (e instanceof Errors_1.ParserException || e instanceof Errors_1.AstBuilderException || e instanceof TokenExceptions_1.UnexpectedTokenException || e instanceof Errors_1.NoSuchLanguageException) {
            this.addError(context, e);
          } else {
            throw e;
          }
        }
        return defaultValue;
      }
      readToken(context) {
        return context.tokenQueue.length > 0 ? context.tokenQueue.shift() : context.tokenScanner.read();
      }
      matchToken(state, token, context) {
        switch (state) {
          case 0:
            return this.matchTokenAt_0(token, context);
          case 1:
            return this.matchTokenAt_1(token, context);
          case 2:
            return this.matchTokenAt_2(token, context);
          case 3:
            return this.matchTokenAt_3(token, context);
          case 4:
            return this.matchTokenAt_4(token, context);
          case 5:
            return this.matchTokenAt_5(token, context);
          case 6:
            return this.matchTokenAt_6(token, context);
          case 7:
            return this.matchTokenAt_7(token, context);
          case 8:
            return this.matchTokenAt_8(token, context);
          case 9:
            return this.matchTokenAt_9(token, context);
          case 10:
            return this.matchTokenAt_10(token, context);
          case 11:
            return this.matchTokenAt_11(token, context);
          case 12:
            return this.matchTokenAt_12(token, context);
          case 13:
            return this.matchTokenAt_13(token, context);
          case 14:
            return this.matchTokenAt_14(token, context);
          case 15:
            return this.matchTokenAt_15(token, context);
          case 16:
            return this.matchTokenAt_16(token, context);
          case 17:
            return this.matchTokenAt_17(token, context);
          case 18:
            return this.matchTokenAt_18(token, context);
          case 19:
            return this.matchTokenAt_19(token, context);
          case 20:
            return this.matchTokenAt_20(token, context);
          case 21:
            return this.matchTokenAt_21(token, context);
          case 22:
            return this.matchTokenAt_22(token, context);
          case 23:
            return this.matchTokenAt_23(token, context);
          case 24:
            return this.matchTokenAt_24(token, context);
          case 25:
            return this.matchTokenAt_25(token, context);
          case 26:
            return this.matchTokenAt_26(token, context);
          case 27:
            return this.matchTokenAt_27(token, context);
          case 28:
            return this.matchTokenAt_28(token, context);
          case 29:
            return this.matchTokenAt_29(token, context);
          case 30:
            return this.matchTokenAt_30(token, context);
          case 31:
            return this.matchTokenAt_31(token, context);
          case 32:
            return this.matchTokenAt_32(token, context);
          case 33:
            return this.matchTokenAt_33(token, context);
          case 35:
            return this.matchTokenAt_35(token, context);
          case 36:
            return this.matchTokenAt_36(token, context);
          case 37:
            return this.matchTokenAt_37(token, context);
          case 38:
            return this.matchTokenAt_38(token, context);
          case 39:
            return this.matchTokenAt_39(token, context);
          case 40:
            return this.matchTokenAt_40(token, context);
          case 41:
            return this.matchTokenAt_41(token, context);
          case 42:
            return this.matchTokenAt_42(token, context);
          default:
            throw new Error("Unknown state: " + state);
        }
      }
      // Start
      matchTokenAt_0(token, context) {
        if (this.match_EOF(context, token)) {
          this.build(context, token);
          return 34;
        }
        if (this.match_Language(context, token)) {
          this.startRule(context, RuleType.Feature);
          this.startRule(context, RuleType.FeatureHeader);
          this.build(context, token);
          return 1;
        }
        if (this.match_TagLine(context, token)) {
          this.startRule(context, RuleType.Feature);
          this.startRule(context, RuleType.FeatureHeader);
          this.startRule(context, RuleType.Tags);
          this.build(context, token);
          return 2;
        }
        if (this.match_FeatureLine(context, token)) {
          this.startRule(context, RuleType.Feature);
          this.startRule(context, RuleType.FeatureHeader);
          this.build(context, token);
          return 3;
        }
        if (this.match_Comment(context, token)) {
          this.build(context, token);
          return 0;
        }
        if (this.match_Empty(context, token)) {
          this.build(context, token);
          return 0;
        }
        const expectedTokens = ["#EOF", "#Language", "#TagLine", "#FeatureLine", "#Comment", "#Empty"];
        const error = token.isEof ? TokenExceptions_1.UnexpectedEOFException.create(token, expectedTokens) : TokenExceptions_1.UnexpectedTokenException.create(token, expectedTokens);
        if (this.stopAtFirstError)
          throw error;
        this.addError(context, error);
        return 0;
      }
      // GherkinDocument:0>Feature:0>FeatureHeader:0>#Language:0
      matchTokenAt_1(token, context) {
        if (this.match_TagLine(context, token)) {
          this.startRule(context, RuleType.Tags);
          this.build(context, token);
          return 2;
        }
        if (this.match_FeatureLine(context, token)) {
          this.build(context, token);
          return 3;
        }
        if (this.match_Comment(context, token)) {
          this.build(context, token);
          return 1;
        }
        if (this.match_Empty(context, token)) {
          this.build(context, token);
          return 1;
        }
        const expectedTokens = ["#TagLine", "#FeatureLine", "#Comment", "#Empty"];
        const error = token.isEof ? TokenExceptions_1.UnexpectedEOFException.create(token, expectedTokens) : TokenExceptions_1.UnexpectedTokenException.create(token, expectedTokens);
        if (this.stopAtFirstError)
          throw error;
        this.addError(context, error);
        return 1;
      }
      // GherkinDocument:0>Feature:0>FeatureHeader:1>Tags:0>#TagLine:0
      matchTokenAt_2(token, context) {
        if (this.match_TagLine(context, token)) {
          this.build(context, token);
          return 2;
        }
        if (this.match_FeatureLine(context, token)) {
          this.endRule(context);
          this.build(context, token);
          return 3;
        }
        if (this.match_Comment(context, token)) {
          this.build(context, token);
          return 2;
        }
        if (this.match_Empty(context, token)) {
          this.build(context, token);
          return 2;
        }
        const expectedTokens = ["#TagLine", "#FeatureLine", "#Comment", "#Empty"];
        const error = token.isEof ? TokenExceptions_1.UnexpectedEOFException.create(token, expectedTokens) : TokenExceptions_1.UnexpectedTokenException.create(token, expectedTokens);
        if (this.stopAtFirstError)
          throw error;
        this.addError(context, error);
        return 2;
      }
      // GherkinDocument:0>Feature:0>FeatureHeader:2>#FeatureLine:0
      matchTokenAt_3(token, context) {
        if (this.match_EOF(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.build(context, token);
          return 34;
        }
        if (this.match_Empty(context, token)) {
          this.build(context, token);
          return 3;
        }
        if (this.match_Comment(context, token)) {
          this.startRule(context, RuleType.Description);
          this.build(context, token);
          return 4;
        }
        if (this.match_BackgroundLine(context, token)) {
          this.endRule(context);
          this.startRule(context, RuleType.Background);
          this.build(context, token);
          return 5;
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_0(context, token)) {
            this.endRule(context);
            this.startRule(context, RuleType.ScenarioDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 9;
          }
        }
        if (this.match_TagLine(context, token)) {
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.startRule(context, RuleType.Tags);
          this.build(context, token);
          return 18;
        }
        if (this.match_ScenarioLine(context, token)) {
          this.endRule(context);
          this.startRule(context, RuleType.ScenarioDefinition);
          this.startRule(context, RuleType.Scenario);
          this.build(context, token);
          return 10;
        }
        if (this.match_RuleLine(context, token)) {
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.build(context, token);
          return 19;
        }
        if (this.match_Other(context, token)) {
          this.startRule(context, RuleType.Description);
          this.build(context, token);
          return 4;
        }
        const expectedTokens = ["#EOF", "#Empty", "#Comment", "#BackgroundLine", "#TagLine", "#ScenarioLine", "#RuleLine", "#Other"];
        const error = token.isEof ? TokenExceptions_1.UnexpectedEOFException.create(token, expectedTokens) : TokenExceptions_1.UnexpectedTokenException.create(token, expectedTokens);
        if (this.stopAtFirstError)
          throw error;
        this.addError(context, error);
        return 3;
      }
      // GherkinDocument:0>Feature:0>FeatureHeader:3>DescriptionHelper:1>Description:0>__alt1:0>#Other:0
      matchTokenAt_4(token, context) {
        if (this.match_EOF(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.build(context, token);
          return 34;
        }
        if (this.match_Comment(context, token)) {
          this.build(context, token);
          return 4;
        }
        if (this.match_BackgroundLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Background);
          this.build(context, token);
          return 5;
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_0(context, token)) {
            this.endRule(context);
            this.endRule(context);
            this.startRule(context, RuleType.ScenarioDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 9;
          }
        }
        if (this.match_TagLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.startRule(context, RuleType.Tags);
          this.build(context, token);
          return 18;
        }
        if (this.match_ScenarioLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.ScenarioDefinition);
          this.startRule(context, RuleType.Scenario);
          this.build(context, token);
          return 10;
        }
        if (this.match_RuleLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.build(context, token);
          return 19;
        }
        if (this.match_Other(context, token)) {
          this.build(context, token);
          return 4;
        }
        const expectedTokens = ["#EOF", "#Comment", "#BackgroundLine", "#TagLine", "#ScenarioLine", "#RuleLine", "#Other"];
        const error = token.isEof ? TokenExceptions_1.UnexpectedEOFException.create(token, expectedTokens) : TokenExceptions_1.UnexpectedTokenException.create(token, expectedTokens);
        if (this.stopAtFirstError)
          throw error;
        this.addError(context, error);
        return 4;
      }
      // GherkinDocument:0>Feature:1>Background:0>#BackgroundLine:0
      matchTokenAt_5(token, context) {
        if (this.match_EOF(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.build(context, token);
          return 34;
        }
        if (this.match_Empty(context, token)) {
          this.build(context, token);
          return 5;
        }
        if (this.match_Comment(context, token)) {
          this.startRule(context, RuleType.Description);
          this.build(context, token);
          return 6;
        }
        if (this.match_StepLine(context, token)) {
          this.startRule(context, RuleType.Step);
          this.build(context, token);
          return 7;
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_0(context, token)) {
            this.endRule(context);
            this.startRule(context, RuleType.ScenarioDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 9;
          }
        }
        if (this.match_TagLine(context, token)) {
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.startRule(context, RuleType.Tags);
          this.build(context, token);
          return 18;
        }
        if (this.match_ScenarioLine(context, token)) {
          this.endRule(context);
          this.startRule(context, RuleType.ScenarioDefinition);
          this.startRule(context, RuleType.Scenario);
          this.build(context, token);
          return 10;
        }
        if (this.match_RuleLine(context, token)) {
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.build(context, token);
          return 19;
        }
        if (this.match_Other(context, token)) {
          this.startRule(context, RuleType.Description);
          this.build(context, token);
          return 6;
        }
        const expectedTokens = ["#EOF", "#Empty", "#Comment", "#StepLine", "#TagLine", "#ScenarioLine", "#RuleLine", "#Other"];
        const error = token.isEof ? TokenExceptions_1.UnexpectedEOFException.create(token, expectedTokens) : TokenExceptions_1.UnexpectedTokenException.create(token, expectedTokens);
        if (this.stopAtFirstError)
          throw error;
        this.addError(context, error);
        return 5;
      }
      // GherkinDocument:0>Feature:1>Background:1>DescriptionHelper:1>Description:0>__alt1:0>#Other:0
      matchTokenAt_6(token, context) {
        if (this.match_EOF(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.build(context, token);
          return 34;
        }
        if (this.match_Comment(context, token)) {
          this.build(context, token);
          return 6;
        }
        if (this.match_StepLine(context, token)) {
          this.endRule(context);
          this.startRule(context, RuleType.Step);
          this.build(context, token);
          return 7;
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_0(context, token)) {
            this.endRule(context);
            this.endRule(context);
            this.startRule(context, RuleType.ScenarioDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 9;
          }
        }
        if (this.match_TagLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.startRule(context, RuleType.Tags);
          this.build(context, token);
          return 18;
        }
        if (this.match_ScenarioLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.ScenarioDefinition);
          this.startRule(context, RuleType.Scenario);
          this.build(context, token);
          return 10;
        }
        if (this.match_RuleLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.build(context, token);
          return 19;
        }
        if (this.match_Other(context, token)) {
          this.build(context, token);
          return 6;
        }
        const expectedTokens = ["#EOF", "#Comment", "#StepLine", "#TagLine", "#ScenarioLine", "#RuleLine", "#Other"];
        const error = token.isEof ? TokenExceptions_1.UnexpectedEOFException.create(token, expectedTokens) : TokenExceptions_1.UnexpectedTokenException.create(token, expectedTokens);
        if (this.stopAtFirstError)
          throw error;
        this.addError(context, error);
        return 6;
      }
      // GherkinDocument:0>Feature:1>Background:2>Step:0>#StepLine:0
      matchTokenAt_7(token, context) {
        if (this.match_EOF(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.build(context, token);
          return 34;
        }
        if (this.match_TableRow(context, token)) {
          this.startRule(context, RuleType.DataTable);
          this.build(context, token);
          return 8;
        }
        if (this.match_DocStringSeparator(context, token)) {
          this.startRule(context, RuleType.DocString);
          this.build(context, token);
          return 41;
        }
        if (this.match_StepLine(context, token)) {
          this.endRule(context);
          this.startRule(context, RuleType.Step);
          this.build(context, token);
          return 7;
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_0(context, token)) {
            this.endRule(context);
            this.endRule(context);
            this.startRule(context, RuleType.ScenarioDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 9;
          }
        }
        if (this.match_TagLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.startRule(context, RuleType.Tags);
          this.build(context, token);
          return 18;
        }
        if (this.match_ScenarioLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.ScenarioDefinition);
          this.startRule(context, RuleType.Scenario);
          this.build(context, token);
          return 10;
        }
        if (this.match_RuleLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.build(context, token);
          return 19;
        }
        if (this.match_Comment(context, token)) {
          this.build(context, token);
          return 7;
        }
        if (this.match_Empty(context, token)) {
          this.build(context, token);
          return 7;
        }
        const expectedTokens = ["#EOF", "#TableRow", "#DocStringSeparator", "#StepLine", "#TagLine", "#ScenarioLine", "#RuleLine", "#Comment", "#Empty"];
        const error = token.isEof ? TokenExceptions_1.UnexpectedEOFException.create(token, expectedTokens) : TokenExceptions_1.UnexpectedTokenException.create(token, expectedTokens);
        if (this.stopAtFirstError)
          throw error;
        this.addError(context, error);
        return 7;
      }
      // GherkinDocument:0>Feature:1>Background:2>Step:1>StepArg:0>__alt0:0>DataTable:0>#TableRow:0
      matchTokenAt_8(token, context) {
        if (this.match_EOF(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.build(context, token);
          return 34;
        }
        if (this.match_TableRow(context, token)) {
          this.build(context, token);
          return 8;
        }
        if (this.match_StepLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Step);
          this.build(context, token);
          return 7;
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_0(context, token)) {
            this.endRule(context);
            this.endRule(context);
            this.endRule(context);
            this.startRule(context, RuleType.ScenarioDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 9;
          }
        }
        if (this.match_TagLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.startRule(context, RuleType.Tags);
          this.build(context, token);
          return 18;
        }
        if (this.match_ScenarioLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.ScenarioDefinition);
          this.startRule(context, RuleType.Scenario);
          this.build(context, token);
          return 10;
        }
        if (this.match_RuleLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.build(context, token);
          return 19;
        }
        if (this.match_Comment(context, token)) {
          this.build(context, token);
          return 8;
        }
        if (this.match_Empty(context, token)) {
          this.build(context, token);
          return 8;
        }
        const expectedTokens = ["#EOF", "#TableRow", "#StepLine", "#TagLine", "#ScenarioLine", "#RuleLine", "#Comment", "#Empty"];
        const error = token.isEof ? TokenExceptions_1.UnexpectedEOFException.create(token, expectedTokens) : TokenExceptions_1.UnexpectedTokenException.create(token, expectedTokens);
        if (this.stopAtFirstError)
          throw error;
        this.addError(context, error);
        return 8;
      }
      // GherkinDocument:0>Feature:2>ScenarioDefinition:0>Tags:0>#TagLine:0
      matchTokenAt_9(token, context) {
        if (this.match_TagLine(context, token)) {
          this.build(context, token);
          return 9;
        }
        if (this.match_ScenarioLine(context, token)) {
          this.endRule(context);
          this.startRule(context, RuleType.Scenario);
          this.build(context, token);
          return 10;
        }
        if (this.match_Comment(context, token)) {
          this.build(context, token);
          return 9;
        }
        if (this.match_Empty(context, token)) {
          this.build(context, token);
          return 9;
        }
        const expectedTokens = ["#TagLine", "#ScenarioLine", "#Comment", "#Empty"];
        const error = token.isEof ? TokenExceptions_1.UnexpectedEOFException.create(token, expectedTokens) : TokenExceptions_1.UnexpectedTokenException.create(token, expectedTokens);
        if (this.stopAtFirstError)
          throw error;
        this.addError(context, error);
        return 9;
      }
      // GherkinDocument:0>Feature:2>ScenarioDefinition:1>Scenario:0>#ScenarioLine:0
      matchTokenAt_10(token, context) {
        if (this.match_EOF(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.build(context, token);
          return 34;
        }
        if (this.match_Empty(context, token)) {
          this.build(context, token);
          return 10;
        }
        if (this.match_Comment(context, token)) {
          this.startRule(context, RuleType.Description);
          this.build(context, token);
          return 11;
        }
        if (this.match_StepLine(context, token)) {
          this.startRule(context, RuleType.Step);
          this.build(context, token);
          return 12;
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_1(context, token)) {
            this.startRule(context, RuleType.ExamplesDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 14;
          }
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_0(context, token)) {
            this.endRule(context);
            this.endRule(context);
            this.startRule(context, RuleType.ScenarioDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 9;
          }
        }
        if (this.match_TagLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.startRule(context, RuleType.Tags);
          this.build(context, token);
          return 18;
        }
        if (this.match_ExamplesLine(context, token)) {
          this.startRule(context, RuleType.ExamplesDefinition);
          this.startRule(context, RuleType.Examples);
          this.build(context, token);
          return 15;
        }
        if (this.match_ScenarioLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.ScenarioDefinition);
          this.startRule(context, RuleType.Scenario);
          this.build(context, token);
          return 10;
        }
        if (this.match_RuleLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.build(context, token);
          return 19;
        }
        if (this.match_Other(context, token)) {
          this.startRule(context, RuleType.Description);
          this.build(context, token);
          return 11;
        }
        const expectedTokens = ["#EOF", "#Empty", "#Comment", "#StepLine", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#RuleLine", "#Other"];
        const error = token.isEof ? TokenExceptions_1.UnexpectedEOFException.create(token, expectedTokens) : TokenExceptions_1.UnexpectedTokenException.create(token, expectedTokens);
        if (this.stopAtFirstError)
          throw error;
        this.addError(context, error);
        return 10;
      }
      // GherkinDocument:0>Feature:2>ScenarioDefinition:1>Scenario:1>DescriptionHelper:1>Description:0>__alt1:0>#Other:0
      matchTokenAt_11(token, context) {
        if (this.match_EOF(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.build(context, token);
          return 34;
        }
        if (this.match_Comment(context, token)) {
          this.build(context, token);
          return 11;
        }
        if (this.match_StepLine(context, token)) {
          this.endRule(context);
          this.startRule(context, RuleType.Step);
          this.build(context, token);
          return 12;
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_1(context, token)) {
            this.endRule(context);
            this.startRule(context, RuleType.ExamplesDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 14;
          }
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_0(context, token)) {
            this.endRule(context);
            this.endRule(context);
            this.endRule(context);
            this.startRule(context, RuleType.ScenarioDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 9;
          }
        }
        if (this.match_TagLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.startRule(context, RuleType.Tags);
          this.build(context, token);
          return 18;
        }
        if (this.match_ExamplesLine(context, token)) {
          this.endRule(context);
          this.startRule(context, RuleType.ExamplesDefinition);
          this.startRule(context, RuleType.Examples);
          this.build(context, token);
          return 15;
        }
        if (this.match_ScenarioLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.ScenarioDefinition);
          this.startRule(context, RuleType.Scenario);
          this.build(context, token);
          return 10;
        }
        if (this.match_RuleLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.build(context, token);
          return 19;
        }
        if (this.match_Other(context, token)) {
          this.build(context, token);
          return 11;
        }
        const expectedTokens = ["#EOF", "#Comment", "#StepLine", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#RuleLine", "#Other"];
        const error = token.isEof ? TokenExceptions_1.UnexpectedEOFException.create(token, expectedTokens) : TokenExceptions_1.UnexpectedTokenException.create(token, expectedTokens);
        if (this.stopAtFirstError)
          throw error;
        this.addError(context, error);
        return 11;
      }
      // GherkinDocument:0>Feature:2>ScenarioDefinition:1>Scenario:2>Step:0>#StepLine:0
      matchTokenAt_12(token, context) {
        if (this.match_EOF(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.build(context, token);
          return 34;
        }
        if (this.match_TableRow(context, token)) {
          this.startRule(context, RuleType.DataTable);
          this.build(context, token);
          return 13;
        }
        if (this.match_DocStringSeparator(context, token)) {
          this.startRule(context, RuleType.DocString);
          this.build(context, token);
          return 39;
        }
        if (this.match_StepLine(context, token)) {
          this.endRule(context);
          this.startRule(context, RuleType.Step);
          this.build(context, token);
          return 12;
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_1(context, token)) {
            this.endRule(context);
            this.startRule(context, RuleType.ExamplesDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 14;
          }
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_0(context, token)) {
            this.endRule(context);
            this.endRule(context);
            this.endRule(context);
            this.startRule(context, RuleType.ScenarioDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 9;
          }
        }
        if (this.match_TagLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.startRule(context, RuleType.Tags);
          this.build(context, token);
          return 18;
        }
        if (this.match_ExamplesLine(context, token)) {
          this.endRule(context);
          this.startRule(context, RuleType.ExamplesDefinition);
          this.startRule(context, RuleType.Examples);
          this.build(context, token);
          return 15;
        }
        if (this.match_ScenarioLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.ScenarioDefinition);
          this.startRule(context, RuleType.Scenario);
          this.build(context, token);
          return 10;
        }
        if (this.match_RuleLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.build(context, token);
          return 19;
        }
        if (this.match_Comment(context, token)) {
          this.build(context, token);
          return 12;
        }
        if (this.match_Empty(context, token)) {
          this.build(context, token);
          return 12;
        }
        const expectedTokens = ["#EOF", "#TableRow", "#DocStringSeparator", "#StepLine", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#RuleLine", "#Comment", "#Empty"];
        const error = token.isEof ? TokenExceptions_1.UnexpectedEOFException.create(token, expectedTokens) : TokenExceptions_1.UnexpectedTokenException.create(token, expectedTokens);
        if (this.stopAtFirstError)
          throw error;
        this.addError(context, error);
        return 12;
      }
      // GherkinDocument:0>Feature:2>ScenarioDefinition:1>Scenario:2>Step:1>StepArg:0>__alt0:0>DataTable:0>#TableRow:0
      matchTokenAt_13(token, context) {
        if (this.match_EOF(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.build(context, token);
          return 34;
        }
        if (this.match_TableRow(context, token)) {
          this.build(context, token);
          return 13;
        }
        if (this.match_StepLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Step);
          this.build(context, token);
          return 12;
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_1(context, token)) {
            this.endRule(context);
            this.endRule(context);
            this.startRule(context, RuleType.ExamplesDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 14;
          }
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_0(context, token)) {
            this.endRule(context);
            this.endRule(context);
            this.endRule(context);
            this.endRule(context);
            this.startRule(context, RuleType.ScenarioDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 9;
          }
        }
        if (this.match_TagLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.startRule(context, RuleType.Tags);
          this.build(context, token);
          return 18;
        }
        if (this.match_ExamplesLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.ExamplesDefinition);
          this.startRule(context, RuleType.Examples);
          this.build(context, token);
          return 15;
        }
        if (this.match_ScenarioLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.ScenarioDefinition);
          this.startRule(context, RuleType.Scenario);
          this.build(context, token);
          return 10;
        }
        if (this.match_RuleLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.build(context, token);
          return 19;
        }
        if (this.match_Comment(context, token)) {
          this.build(context, token);
          return 13;
        }
        if (this.match_Empty(context, token)) {
          this.build(context, token);
          return 13;
        }
        const expectedTokens = ["#EOF", "#TableRow", "#StepLine", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#RuleLine", "#Comment", "#Empty"];
        const error = token.isEof ? TokenExceptions_1.UnexpectedEOFException.create(token, expectedTokens) : TokenExceptions_1.UnexpectedTokenException.create(token, expectedTokens);
        if (this.stopAtFirstError)
          throw error;
        this.addError(context, error);
        return 13;
      }
      // GherkinDocument:0>Feature:2>ScenarioDefinition:1>Scenario:3>ExamplesDefinition:0>Tags:0>#TagLine:0
      matchTokenAt_14(token, context) {
        if (this.match_TagLine(context, token)) {
          this.build(context, token);
          return 14;
        }
        if (this.match_ExamplesLine(context, token)) {
          this.endRule(context);
          this.startRule(context, RuleType.Examples);
          this.build(context, token);
          return 15;
        }
        if (this.match_Comment(context, token)) {
          this.build(context, token);
          return 14;
        }
        if (this.match_Empty(context, token)) {
          this.build(context, token);
          return 14;
        }
        const expectedTokens = ["#TagLine", "#ExamplesLine", "#Comment", "#Empty"];
        const error = token.isEof ? TokenExceptions_1.UnexpectedEOFException.create(token, expectedTokens) : TokenExceptions_1.UnexpectedTokenException.create(token, expectedTokens);
        if (this.stopAtFirstError)
          throw error;
        this.addError(context, error);
        return 14;
      }
      // GherkinDocument:0>Feature:2>ScenarioDefinition:1>Scenario:3>ExamplesDefinition:1>Examples:0>#ExamplesLine:0
      matchTokenAt_15(token, context) {
        if (this.match_EOF(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.build(context, token);
          return 34;
        }
        if (this.match_Empty(context, token)) {
          this.build(context, token);
          return 15;
        }
        if (this.match_Comment(context, token)) {
          this.startRule(context, RuleType.Description);
          this.build(context, token);
          return 16;
        }
        if (this.match_TableRow(context, token)) {
          this.startRule(context, RuleType.ExamplesTable);
          this.build(context, token);
          return 17;
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_1(context, token)) {
            this.endRule(context);
            this.endRule(context);
            this.startRule(context, RuleType.ExamplesDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 14;
          }
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_0(context, token)) {
            this.endRule(context);
            this.endRule(context);
            this.endRule(context);
            this.endRule(context);
            this.startRule(context, RuleType.ScenarioDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 9;
          }
        }
        if (this.match_TagLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.startRule(context, RuleType.Tags);
          this.build(context, token);
          return 18;
        }
        if (this.match_ExamplesLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.ExamplesDefinition);
          this.startRule(context, RuleType.Examples);
          this.build(context, token);
          return 15;
        }
        if (this.match_ScenarioLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.ScenarioDefinition);
          this.startRule(context, RuleType.Scenario);
          this.build(context, token);
          return 10;
        }
        if (this.match_RuleLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.build(context, token);
          return 19;
        }
        if (this.match_Other(context, token)) {
          this.startRule(context, RuleType.Description);
          this.build(context, token);
          return 16;
        }
        const expectedTokens = ["#EOF", "#Empty", "#Comment", "#TableRow", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#RuleLine", "#Other"];
        const error = token.isEof ? TokenExceptions_1.UnexpectedEOFException.create(token, expectedTokens) : TokenExceptions_1.UnexpectedTokenException.create(token, expectedTokens);
        if (this.stopAtFirstError)
          throw error;
        this.addError(context, error);
        return 15;
      }
      // GherkinDocument:0>Feature:2>ScenarioDefinition:1>Scenario:3>ExamplesDefinition:1>Examples:1>DescriptionHelper:1>Description:0>__alt1:0>#Other:0
      matchTokenAt_16(token, context) {
        if (this.match_EOF(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.build(context, token);
          return 34;
        }
        if (this.match_Comment(context, token)) {
          this.build(context, token);
          return 16;
        }
        if (this.match_TableRow(context, token)) {
          this.endRule(context);
          this.startRule(context, RuleType.ExamplesTable);
          this.build(context, token);
          return 17;
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_1(context, token)) {
            this.endRule(context);
            this.endRule(context);
            this.endRule(context);
            this.startRule(context, RuleType.ExamplesDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 14;
          }
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_0(context, token)) {
            this.endRule(context);
            this.endRule(context);
            this.endRule(context);
            this.endRule(context);
            this.endRule(context);
            this.startRule(context, RuleType.ScenarioDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 9;
          }
        }
        if (this.match_TagLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.startRule(context, RuleType.Tags);
          this.build(context, token);
          return 18;
        }
        if (this.match_ExamplesLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.ExamplesDefinition);
          this.startRule(context, RuleType.Examples);
          this.build(context, token);
          return 15;
        }
        if (this.match_ScenarioLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.ScenarioDefinition);
          this.startRule(context, RuleType.Scenario);
          this.build(context, token);
          return 10;
        }
        if (this.match_RuleLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.build(context, token);
          return 19;
        }
        if (this.match_Other(context, token)) {
          this.build(context, token);
          return 16;
        }
        const expectedTokens = ["#EOF", "#Comment", "#TableRow", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#RuleLine", "#Other"];
        const error = token.isEof ? TokenExceptions_1.UnexpectedEOFException.create(token, expectedTokens) : TokenExceptions_1.UnexpectedTokenException.create(token, expectedTokens);
        if (this.stopAtFirstError)
          throw error;
        this.addError(context, error);
        return 16;
      }
      // GherkinDocument:0>Feature:2>ScenarioDefinition:1>Scenario:3>ExamplesDefinition:1>Examples:2>ExamplesTable:0>#TableRow:0
      matchTokenAt_17(token, context) {
        if (this.match_EOF(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.build(context, token);
          return 34;
        }
        if (this.match_TableRow(context, token)) {
          this.build(context, token);
          return 17;
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_1(context, token)) {
            this.endRule(context);
            this.endRule(context);
            this.endRule(context);
            this.startRule(context, RuleType.ExamplesDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 14;
          }
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_0(context, token)) {
            this.endRule(context);
            this.endRule(context);
            this.endRule(context);
            this.endRule(context);
            this.endRule(context);
            this.startRule(context, RuleType.ScenarioDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 9;
          }
        }
        if (this.match_TagLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.startRule(context, RuleType.Tags);
          this.build(context, token);
          return 18;
        }
        if (this.match_ExamplesLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.ExamplesDefinition);
          this.startRule(context, RuleType.Examples);
          this.build(context, token);
          return 15;
        }
        if (this.match_ScenarioLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.ScenarioDefinition);
          this.startRule(context, RuleType.Scenario);
          this.build(context, token);
          return 10;
        }
        if (this.match_RuleLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.build(context, token);
          return 19;
        }
        if (this.match_Comment(context, token)) {
          this.build(context, token);
          return 17;
        }
        if (this.match_Empty(context, token)) {
          this.build(context, token);
          return 17;
        }
        const expectedTokens = ["#EOF", "#TableRow", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#RuleLine", "#Comment", "#Empty"];
        const error = token.isEof ? TokenExceptions_1.UnexpectedEOFException.create(token, expectedTokens) : TokenExceptions_1.UnexpectedTokenException.create(token, expectedTokens);
        if (this.stopAtFirstError)
          throw error;
        this.addError(context, error);
        return 17;
      }
      // GherkinDocument:0>Feature:3>Rule:0>RuleHeader:0>Tags:0>#TagLine:0
      matchTokenAt_18(token, context) {
        if (this.match_TagLine(context, token)) {
          this.build(context, token);
          return 18;
        }
        if (this.match_RuleLine(context, token)) {
          this.endRule(context);
          this.build(context, token);
          return 19;
        }
        if (this.match_Comment(context, token)) {
          this.build(context, token);
          return 18;
        }
        if (this.match_Empty(context, token)) {
          this.build(context, token);
          return 18;
        }
        const expectedTokens = ["#TagLine", "#RuleLine", "#Comment", "#Empty"];
        const error = token.isEof ? TokenExceptions_1.UnexpectedEOFException.create(token, expectedTokens) : TokenExceptions_1.UnexpectedTokenException.create(token, expectedTokens);
        if (this.stopAtFirstError)
          throw error;
        this.addError(context, error);
        return 18;
      }
      // GherkinDocument:0>Feature:3>Rule:0>RuleHeader:1>#RuleLine:0
      matchTokenAt_19(token, context) {
        if (this.match_EOF(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.build(context, token);
          return 34;
        }
        if (this.match_Empty(context, token)) {
          this.build(context, token);
          return 19;
        }
        if (this.match_Comment(context, token)) {
          this.startRule(context, RuleType.Description);
          this.build(context, token);
          return 20;
        }
        if (this.match_BackgroundLine(context, token)) {
          this.endRule(context);
          this.startRule(context, RuleType.Background);
          this.build(context, token);
          return 21;
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_0(context, token)) {
            this.endRule(context);
            this.startRule(context, RuleType.ScenarioDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 25;
          }
        }
        if (this.match_TagLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.startRule(context, RuleType.Tags);
          this.build(context, token);
          return 18;
        }
        if (this.match_ScenarioLine(context, token)) {
          this.endRule(context);
          this.startRule(context, RuleType.ScenarioDefinition);
          this.startRule(context, RuleType.Scenario);
          this.build(context, token);
          return 26;
        }
        if (this.match_RuleLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.build(context, token);
          return 19;
        }
        if (this.match_Other(context, token)) {
          this.startRule(context, RuleType.Description);
          this.build(context, token);
          return 20;
        }
        const expectedTokens = ["#EOF", "#Empty", "#Comment", "#BackgroundLine", "#TagLine", "#ScenarioLine", "#RuleLine", "#Other"];
        const error = token.isEof ? TokenExceptions_1.UnexpectedEOFException.create(token, expectedTokens) : TokenExceptions_1.UnexpectedTokenException.create(token, expectedTokens);
        if (this.stopAtFirstError)
          throw error;
        this.addError(context, error);
        return 19;
      }
      // GherkinDocument:0>Feature:3>Rule:0>RuleHeader:2>DescriptionHelper:1>Description:0>__alt1:0>#Other:0
      matchTokenAt_20(token, context) {
        if (this.match_EOF(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.build(context, token);
          return 34;
        }
        if (this.match_Comment(context, token)) {
          this.build(context, token);
          return 20;
        }
        if (this.match_BackgroundLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Background);
          this.build(context, token);
          return 21;
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_0(context, token)) {
            this.endRule(context);
            this.endRule(context);
            this.startRule(context, RuleType.ScenarioDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 25;
          }
        }
        if (this.match_TagLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.startRule(context, RuleType.Tags);
          this.build(context, token);
          return 18;
        }
        if (this.match_ScenarioLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.ScenarioDefinition);
          this.startRule(context, RuleType.Scenario);
          this.build(context, token);
          return 26;
        }
        if (this.match_RuleLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.build(context, token);
          return 19;
        }
        if (this.match_Other(context, token)) {
          this.build(context, token);
          return 20;
        }
        const expectedTokens = ["#EOF", "#Comment", "#BackgroundLine", "#TagLine", "#ScenarioLine", "#RuleLine", "#Other"];
        const error = token.isEof ? TokenExceptions_1.UnexpectedEOFException.create(token, expectedTokens) : TokenExceptions_1.UnexpectedTokenException.create(token, expectedTokens);
        if (this.stopAtFirstError)
          throw error;
        this.addError(context, error);
        return 20;
      }
      // GherkinDocument:0>Feature:3>Rule:1>Background:0>#BackgroundLine:0
      matchTokenAt_21(token, context) {
        if (this.match_EOF(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.build(context, token);
          return 34;
        }
        if (this.match_Empty(context, token)) {
          this.build(context, token);
          return 21;
        }
        if (this.match_Comment(context, token)) {
          this.startRule(context, RuleType.Description);
          this.build(context, token);
          return 22;
        }
        if (this.match_StepLine(context, token)) {
          this.startRule(context, RuleType.Step);
          this.build(context, token);
          return 23;
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_0(context, token)) {
            this.endRule(context);
            this.startRule(context, RuleType.ScenarioDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 25;
          }
        }
        if (this.match_TagLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.startRule(context, RuleType.Tags);
          this.build(context, token);
          return 18;
        }
        if (this.match_ScenarioLine(context, token)) {
          this.endRule(context);
          this.startRule(context, RuleType.ScenarioDefinition);
          this.startRule(context, RuleType.Scenario);
          this.build(context, token);
          return 26;
        }
        if (this.match_RuleLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.build(context, token);
          return 19;
        }
        if (this.match_Other(context, token)) {
          this.startRule(context, RuleType.Description);
          this.build(context, token);
          return 22;
        }
        const expectedTokens = ["#EOF", "#Empty", "#Comment", "#StepLine", "#TagLine", "#ScenarioLine", "#RuleLine", "#Other"];
        const error = token.isEof ? TokenExceptions_1.UnexpectedEOFException.create(token, expectedTokens) : TokenExceptions_1.UnexpectedTokenException.create(token, expectedTokens);
        if (this.stopAtFirstError)
          throw error;
        this.addError(context, error);
        return 21;
      }
      // GherkinDocument:0>Feature:3>Rule:1>Background:1>DescriptionHelper:1>Description:0>__alt1:0>#Other:0
      matchTokenAt_22(token, context) {
        if (this.match_EOF(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.build(context, token);
          return 34;
        }
        if (this.match_Comment(context, token)) {
          this.build(context, token);
          return 22;
        }
        if (this.match_StepLine(context, token)) {
          this.endRule(context);
          this.startRule(context, RuleType.Step);
          this.build(context, token);
          return 23;
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_0(context, token)) {
            this.endRule(context);
            this.endRule(context);
            this.startRule(context, RuleType.ScenarioDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 25;
          }
        }
        if (this.match_TagLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.startRule(context, RuleType.Tags);
          this.build(context, token);
          return 18;
        }
        if (this.match_ScenarioLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.ScenarioDefinition);
          this.startRule(context, RuleType.Scenario);
          this.build(context, token);
          return 26;
        }
        if (this.match_RuleLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.build(context, token);
          return 19;
        }
        if (this.match_Other(context, token)) {
          this.build(context, token);
          return 22;
        }
        const expectedTokens = ["#EOF", "#Comment", "#StepLine", "#TagLine", "#ScenarioLine", "#RuleLine", "#Other"];
        const error = token.isEof ? TokenExceptions_1.UnexpectedEOFException.create(token, expectedTokens) : TokenExceptions_1.UnexpectedTokenException.create(token, expectedTokens);
        if (this.stopAtFirstError)
          throw error;
        this.addError(context, error);
        return 22;
      }
      // GherkinDocument:0>Feature:3>Rule:1>Background:2>Step:0>#StepLine:0
      matchTokenAt_23(token, context) {
        if (this.match_EOF(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.build(context, token);
          return 34;
        }
        if (this.match_TableRow(context, token)) {
          this.startRule(context, RuleType.DataTable);
          this.build(context, token);
          return 24;
        }
        if (this.match_DocStringSeparator(context, token)) {
          this.startRule(context, RuleType.DocString);
          this.build(context, token);
          return 37;
        }
        if (this.match_StepLine(context, token)) {
          this.endRule(context);
          this.startRule(context, RuleType.Step);
          this.build(context, token);
          return 23;
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_0(context, token)) {
            this.endRule(context);
            this.endRule(context);
            this.startRule(context, RuleType.ScenarioDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 25;
          }
        }
        if (this.match_TagLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.startRule(context, RuleType.Tags);
          this.build(context, token);
          return 18;
        }
        if (this.match_ScenarioLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.ScenarioDefinition);
          this.startRule(context, RuleType.Scenario);
          this.build(context, token);
          return 26;
        }
        if (this.match_RuleLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.build(context, token);
          return 19;
        }
        if (this.match_Comment(context, token)) {
          this.build(context, token);
          return 23;
        }
        if (this.match_Empty(context, token)) {
          this.build(context, token);
          return 23;
        }
        const expectedTokens = ["#EOF", "#TableRow", "#DocStringSeparator", "#StepLine", "#TagLine", "#ScenarioLine", "#RuleLine", "#Comment", "#Empty"];
        const error = token.isEof ? TokenExceptions_1.UnexpectedEOFException.create(token, expectedTokens) : TokenExceptions_1.UnexpectedTokenException.create(token, expectedTokens);
        if (this.stopAtFirstError)
          throw error;
        this.addError(context, error);
        return 23;
      }
      // GherkinDocument:0>Feature:3>Rule:1>Background:2>Step:1>StepArg:0>__alt0:0>DataTable:0>#TableRow:0
      matchTokenAt_24(token, context) {
        if (this.match_EOF(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.build(context, token);
          return 34;
        }
        if (this.match_TableRow(context, token)) {
          this.build(context, token);
          return 24;
        }
        if (this.match_StepLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Step);
          this.build(context, token);
          return 23;
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_0(context, token)) {
            this.endRule(context);
            this.endRule(context);
            this.endRule(context);
            this.startRule(context, RuleType.ScenarioDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 25;
          }
        }
        if (this.match_TagLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.startRule(context, RuleType.Tags);
          this.build(context, token);
          return 18;
        }
        if (this.match_ScenarioLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.ScenarioDefinition);
          this.startRule(context, RuleType.Scenario);
          this.build(context, token);
          return 26;
        }
        if (this.match_RuleLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.build(context, token);
          return 19;
        }
        if (this.match_Comment(context, token)) {
          this.build(context, token);
          return 24;
        }
        if (this.match_Empty(context, token)) {
          this.build(context, token);
          return 24;
        }
        const expectedTokens = ["#EOF", "#TableRow", "#StepLine", "#TagLine", "#ScenarioLine", "#RuleLine", "#Comment", "#Empty"];
        const error = token.isEof ? TokenExceptions_1.UnexpectedEOFException.create(token, expectedTokens) : TokenExceptions_1.UnexpectedTokenException.create(token, expectedTokens);
        if (this.stopAtFirstError)
          throw error;
        this.addError(context, error);
        return 24;
      }
      // GherkinDocument:0>Feature:3>Rule:2>ScenarioDefinition:0>Tags:0>#TagLine:0
      matchTokenAt_25(token, context) {
        if (this.match_TagLine(context, token)) {
          this.build(context, token);
          return 25;
        }
        if (this.match_ScenarioLine(context, token)) {
          this.endRule(context);
          this.startRule(context, RuleType.Scenario);
          this.build(context, token);
          return 26;
        }
        if (this.match_Comment(context, token)) {
          this.build(context, token);
          return 25;
        }
        if (this.match_Empty(context, token)) {
          this.build(context, token);
          return 25;
        }
        const expectedTokens = ["#TagLine", "#ScenarioLine", "#Comment", "#Empty"];
        const error = token.isEof ? TokenExceptions_1.UnexpectedEOFException.create(token, expectedTokens) : TokenExceptions_1.UnexpectedTokenException.create(token, expectedTokens);
        if (this.stopAtFirstError)
          throw error;
        this.addError(context, error);
        return 25;
      }
      // GherkinDocument:0>Feature:3>Rule:2>ScenarioDefinition:1>Scenario:0>#ScenarioLine:0
      matchTokenAt_26(token, context) {
        if (this.match_EOF(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.build(context, token);
          return 34;
        }
        if (this.match_Empty(context, token)) {
          this.build(context, token);
          return 26;
        }
        if (this.match_Comment(context, token)) {
          this.startRule(context, RuleType.Description);
          this.build(context, token);
          return 27;
        }
        if (this.match_StepLine(context, token)) {
          this.startRule(context, RuleType.Step);
          this.build(context, token);
          return 28;
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_1(context, token)) {
            this.startRule(context, RuleType.ExamplesDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 30;
          }
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_0(context, token)) {
            this.endRule(context);
            this.endRule(context);
            this.startRule(context, RuleType.ScenarioDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 25;
          }
        }
        if (this.match_TagLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.startRule(context, RuleType.Tags);
          this.build(context, token);
          return 18;
        }
        if (this.match_ExamplesLine(context, token)) {
          this.startRule(context, RuleType.ExamplesDefinition);
          this.startRule(context, RuleType.Examples);
          this.build(context, token);
          return 31;
        }
        if (this.match_ScenarioLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.ScenarioDefinition);
          this.startRule(context, RuleType.Scenario);
          this.build(context, token);
          return 26;
        }
        if (this.match_RuleLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.build(context, token);
          return 19;
        }
        if (this.match_Other(context, token)) {
          this.startRule(context, RuleType.Description);
          this.build(context, token);
          return 27;
        }
        const expectedTokens = ["#EOF", "#Empty", "#Comment", "#StepLine", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#RuleLine", "#Other"];
        const error = token.isEof ? TokenExceptions_1.UnexpectedEOFException.create(token, expectedTokens) : TokenExceptions_1.UnexpectedTokenException.create(token, expectedTokens);
        if (this.stopAtFirstError)
          throw error;
        this.addError(context, error);
        return 26;
      }
      // GherkinDocument:0>Feature:3>Rule:2>ScenarioDefinition:1>Scenario:1>DescriptionHelper:1>Description:0>__alt1:0>#Other:0
      matchTokenAt_27(token, context) {
        if (this.match_EOF(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.build(context, token);
          return 34;
        }
        if (this.match_Comment(context, token)) {
          this.build(context, token);
          return 27;
        }
        if (this.match_StepLine(context, token)) {
          this.endRule(context);
          this.startRule(context, RuleType.Step);
          this.build(context, token);
          return 28;
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_1(context, token)) {
            this.endRule(context);
            this.startRule(context, RuleType.ExamplesDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 30;
          }
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_0(context, token)) {
            this.endRule(context);
            this.endRule(context);
            this.endRule(context);
            this.startRule(context, RuleType.ScenarioDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 25;
          }
        }
        if (this.match_TagLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.startRule(context, RuleType.Tags);
          this.build(context, token);
          return 18;
        }
        if (this.match_ExamplesLine(context, token)) {
          this.endRule(context);
          this.startRule(context, RuleType.ExamplesDefinition);
          this.startRule(context, RuleType.Examples);
          this.build(context, token);
          return 31;
        }
        if (this.match_ScenarioLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.ScenarioDefinition);
          this.startRule(context, RuleType.Scenario);
          this.build(context, token);
          return 26;
        }
        if (this.match_RuleLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.build(context, token);
          return 19;
        }
        if (this.match_Other(context, token)) {
          this.build(context, token);
          return 27;
        }
        const expectedTokens = ["#EOF", "#Comment", "#StepLine", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#RuleLine", "#Other"];
        const error = token.isEof ? TokenExceptions_1.UnexpectedEOFException.create(token, expectedTokens) : TokenExceptions_1.UnexpectedTokenException.create(token, expectedTokens);
        if (this.stopAtFirstError)
          throw error;
        this.addError(context, error);
        return 27;
      }
      // GherkinDocument:0>Feature:3>Rule:2>ScenarioDefinition:1>Scenario:2>Step:0>#StepLine:0
      matchTokenAt_28(token, context) {
        if (this.match_EOF(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.build(context, token);
          return 34;
        }
        if (this.match_TableRow(context, token)) {
          this.startRule(context, RuleType.DataTable);
          this.build(context, token);
          return 29;
        }
        if (this.match_DocStringSeparator(context, token)) {
          this.startRule(context, RuleType.DocString);
          this.build(context, token);
          return 35;
        }
        if (this.match_StepLine(context, token)) {
          this.endRule(context);
          this.startRule(context, RuleType.Step);
          this.build(context, token);
          return 28;
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_1(context, token)) {
            this.endRule(context);
            this.startRule(context, RuleType.ExamplesDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 30;
          }
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_0(context, token)) {
            this.endRule(context);
            this.endRule(context);
            this.endRule(context);
            this.startRule(context, RuleType.ScenarioDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 25;
          }
        }
        if (this.match_TagLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.startRule(context, RuleType.Tags);
          this.build(context, token);
          return 18;
        }
        if (this.match_ExamplesLine(context, token)) {
          this.endRule(context);
          this.startRule(context, RuleType.ExamplesDefinition);
          this.startRule(context, RuleType.Examples);
          this.build(context, token);
          return 31;
        }
        if (this.match_ScenarioLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.ScenarioDefinition);
          this.startRule(context, RuleType.Scenario);
          this.build(context, token);
          return 26;
        }
        if (this.match_RuleLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.build(context, token);
          return 19;
        }
        if (this.match_Comment(context, token)) {
          this.build(context, token);
          return 28;
        }
        if (this.match_Empty(context, token)) {
          this.build(context, token);
          return 28;
        }
        const expectedTokens = ["#EOF", "#TableRow", "#DocStringSeparator", "#StepLine", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#RuleLine", "#Comment", "#Empty"];
        const error = token.isEof ? TokenExceptions_1.UnexpectedEOFException.create(token, expectedTokens) : TokenExceptions_1.UnexpectedTokenException.create(token, expectedTokens);
        if (this.stopAtFirstError)
          throw error;
        this.addError(context, error);
        return 28;
      }
      // GherkinDocument:0>Feature:3>Rule:2>ScenarioDefinition:1>Scenario:2>Step:1>StepArg:0>__alt0:0>DataTable:0>#TableRow:0
      matchTokenAt_29(token, context) {
        if (this.match_EOF(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.build(context, token);
          return 34;
        }
        if (this.match_TableRow(context, token)) {
          this.build(context, token);
          return 29;
        }
        if (this.match_StepLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Step);
          this.build(context, token);
          return 28;
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_1(context, token)) {
            this.endRule(context);
            this.endRule(context);
            this.startRule(context, RuleType.ExamplesDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 30;
          }
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_0(context, token)) {
            this.endRule(context);
            this.endRule(context);
            this.endRule(context);
            this.endRule(context);
            this.startRule(context, RuleType.ScenarioDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 25;
          }
        }
        if (this.match_TagLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.startRule(context, RuleType.Tags);
          this.build(context, token);
          return 18;
        }
        if (this.match_ExamplesLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.ExamplesDefinition);
          this.startRule(context, RuleType.Examples);
          this.build(context, token);
          return 31;
        }
        if (this.match_ScenarioLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.ScenarioDefinition);
          this.startRule(context, RuleType.Scenario);
          this.build(context, token);
          return 26;
        }
        if (this.match_RuleLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.build(context, token);
          return 19;
        }
        if (this.match_Comment(context, token)) {
          this.build(context, token);
          return 29;
        }
        if (this.match_Empty(context, token)) {
          this.build(context, token);
          return 29;
        }
        const expectedTokens = ["#EOF", "#TableRow", "#StepLine", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#RuleLine", "#Comment", "#Empty"];
        const error = token.isEof ? TokenExceptions_1.UnexpectedEOFException.create(token, expectedTokens) : TokenExceptions_1.UnexpectedTokenException.create(token, expectedTokens);
        if (this.stopAtFirstError)
          throw error;
        this.addError(context, error);
        return 29;
      }
      // GherkinDocument:0>Feature:3>Rule:2>ScenarioDefinition:1>Scenario:3>ExamplesDefinition:0>Tags:0>#TagLine:0
      matchTokenAt_30(token, context) {
        if (this.match_TagLine(context, token)) {
          this.build(context, token);
          return 30;
        }
        if (this.match_ExamplesLine(context, token)) {
          this.endRule(context);
          this.startRule(context, RuleType.Examples);
          this.build(context, token);
          return 31;
        }
        if (this.match_Comment(context, token)) {
          this.build(context, token);
          return 30;
        }
        if (this.match_Empty(context, token)) {
          this.build(context, token);
          return 30;
        }
        const expectedTokens = ["#TagLine", "#ExamplesLine", "#Comment", "#Empty"];
        const error = token.isEof ? TokenExceptions_1.UnexpectedEOFException.create(token, expectedTokens) : TokenExceptions_1.UnexpectedTokenException.create(token, expectedTokens);
        if (this.stopAtFirstError)
          throw error;
        this.addError(context, error);
        return 30;
      }
      // GherkinDocument:0>Feature:3>Rule:2>ScenarioDefinition:1>Scenario:3>ExamplesDefinition:1>Examples:0>#ExamplesLine:0
      matchTokenAt_31(token, context) {
        if (this.match_EOF(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.build(context, token);
          return 34;
        }
        if (this.match_Empty(context, token)) {
          this.build(context, token);
          return 31;
        }
        if (this.match_Comment(context, token)) {
          this.startRule(context, RuleType.Description);
          this.build(context, token);
          return 32;
        }
        if (this.match_TableRow(context, token)) {
          this.startRule(context, RuleType.ExamplesTable);
          this.build(context, token);
          return 33;
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_1(context, token)) {
            this.endRule(context);
            this.endRule(context);
            this.startRule(context, RuleType.ExamplesDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 30;
          }
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_0(context, token)) {
            this.endRule(context);
            this.endRule(context);
            this.endRule(context);
            this.endRule(context);
            this.startRule(context, RuleType.ScenarioDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 25;
          }
        }
        if (this.match_TagLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.startRule(context, RuleType.Tags);
          this.build(context, token);
          return 18;
        }
        if (this.match_ExamplesLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.ExamplesDefinition);
          this.startRule(context, RuleType.Examples);
          this.build(context, token);
          return 31;
        }
        if (this.match_ScenarioLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.ScenarioDefinition);
          this.startRule(context, RuleType.Scenario);
          this.build(context, token);
          return 26;
        }
        if (this.match_RuleLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.build(context, token);
          return 19;
        }
        if (this.match_Other(context, token)) {
          this.startRule(context, RuleType.Description);
          this.build(context, token);
          return 32;
        }
        const expectedTokens = ["#EOF", "#Empty", "#Comment", "#TableRow", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#RuleLine", "#Other"];
        const error = token.isEof ? TokenExceptions_1.UnexpectedEOFException.create(token, expectedTokens) : TokenExceptions_1.UnexpectedTokenException.create(token, expectedTokens);
        if (this.stopAtFirstError)
          throw error;
        this.addError(context, error);
        return 31;
      }
      // GherkinDocument:0>Feature:3>Rule:2>ScenarioDefinition:1>Scenario:3>ExamplesDefinition:1>Examples:1>DescriptionHelper:1>Description:0>__alt1:0>#Other:0
      matchTokenAt_32(token, context) {
        if (this.match_EOF(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.build(context, token);
          return 34;
        }
        if (this.match_Comment(context, token)) {
          this.build(context, token);
          return 32;
        }
        if (this.match_TableRow(context, token)) {
          this.endRule(context);
          this.startRule(context, RuleType.ExamplesTable);
          this.build(context, token);
          return 33;
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_1(context, token)) {
            this.endRule(context);
            this.endRule(context);
            this.endRule(context);
            this.startRule(context, RuleType.ExamplesDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 30;
          }
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_0(context, token)) {
            this.endRule(context);
            this.endRule(context);
            this.endRule(context);
            this.endRule(context);
            this.endRule(context);
            this.startRule(context, RuleType.ScenarioDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 25;
          }
        }
        if (this.match_TagLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.startRule(context, RuleType.Tags);
          this.build(context, token);
          return 18;
        }
        if (this.match_ExamplesLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.ExamplesDefinition);
          this.startRule(context, RuleType.Examples);
          this.build(context, token);
          return 31;
        }
        if (this.match_ScenarioLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.ScenarioDefinition);
          this.startRule(context, RuleType.Scenario);
          this.build(context, token);
          return 26;
        }
        if (this.match_RuleLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.build(context, token);
          return 19;
        }
        if (this.match_Other(context, token)) {
          this.build(context, token);
          return 32;
        }
        const expectedTokens = ["#EOF", "#Comment", "#TableRow", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#RuleLine", "#Other"];
        const error = token.isEof ? TokenExceptions_1.UnexpectedEOFException.create(token, expectedTokens) : TokenExceptions_1.UnexpectedTokenException.create(token, expectedTokens);
        if (this.stopAtFirstError)
          throw error;
        this.addError(context, error);
        return 32;
      }
      // GherkinDocument:0>Feature:3>Rule:2>ScenarioDefinition:1>Scenario:3>ExamplesDefinition:1>Examples:2>ExamplesTable:0>#TableRow:0
      matchTokenAt_33(token, context) {
        if (this.match_EOF(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.build(context, token);
          return 34;
        }
        if (this.match_TableRow(context, token)) {
          this.build(context, token);
          return 33;
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_1(context, token)) {
            this.endRule(context);
            this.endRule(context);
            this.endRule(context);
            this.startRule(context, RuleType.ExamplesDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 30;
          }
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_0(context, token)) {
            this.endRule(context);
            this.endRule(context);
            this.endRule(context);
            this.endRule(context);
            this.endRule(context);
            this.startRule(context, RuleType.ScenarioDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 25;
          }
        }
        if (this.match_TagLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.startRule(context, RuleType.Tags);
          this.build(context, token);
          return 18;
        }
        if (this.match_ExamplesLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.ExamplesDefinition);
          this.startRule(context, RuleType.Examples);
          this.build(context, token);
          return 31;
        }
        if (this.match_ScenarioLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.ScenarioDefinition);
          this.startRule(context, RuleType.Scenario);
          this.build(context, token);
          return 26;
        }
        if (this.match_RuleLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.build(context, token);
          return 19;
        }
        if (this.match_Comment(context, token)) {
          this.build(context, token);
          return 33;
        }
        if (this.match_Empty(context, token)) {
          this.build(context, token);
          return 33;
        }
        const expectedTokens = ["#EOF", "#TableRow", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#RuleLine", "#Comment", "#Empty"];
        const error = token.isEof ? TokenExceptions_1.UnexpectedEOFException.create(token, expectedTokens) : TokenExceptions_1.UnexpectedTokenException.create(token, expectedTokens);
        if (this.stopAtFirstError)
          throw error;
        this.addError(context, error);
        return 33;
      }
      // GherkinDocument:0>Feature:3>Rule:2>ScenarioDefinition:1>Scenario:2>Step:1>StepArg:0>__alt0:1>DocString:0>#DocStringSeparator:0
      matchTokenAt_35(token, context) {
        if (this.match_DocStringSeparator(context, token)) {
          this.build(context, token);
          return 36;
        }
        if (this.match_Other(context, token)) {
          this.build(context, token);
          return 35;
        }
        const expectedTokens = ["#DocStringSeparator", "#Other"];
        const error = token.isEof ? TokenExceptions_1.UnexpectedEOFException.create(token, expectedTokens) : TokenExceptions_1.UnexpectedTokenException.create(token, expectedTokens);
        if (this.stopAtFirstError)
          throw error;
        this.addError(context, error);
        return 35;
      }
      // GherkinDocument:0>Feature:3>Rule:2>ScenarioDefinition:1>Scenario:2>Step:1>StepArg:0>__alt0:1>DocString:2>#DocStringSeparator:0
      matchTokenAt_36(token, context) {
        if (this.match_EOF(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.build(context, token);
          return 34;
        }
        if (this.match_StepLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Step);
          this.build(context, token);
          return 28;
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_1(context, token)) {
            this.endRule(context);
            this.endRule(context);
            this.startRule(context, RuleType.ExamplesDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 30;
          }
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_0(context, token)) {
            this.endRule(context);
            this.endRule(context);
            this.endRule(context);
            this.endRule(context);
            this.startRule(context, RuleType.ScenarioDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 25;
          }
        }
        if (this.match_TagLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.startRule(context, RuleType.Tags);
          this.build(context, token);
          return 18;
        }
        if (this.match_ExamplesLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.ExamplesDefinition);
          this.startRule(context, RuleType.Examples);
          this.build(context, token);
          return 31;
        }
        if (this.match_ScenarioLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.ScenarioDefinition);
          this.startRule(context, RuleType.Scenario);
          this.build(context, token);
          return 26;
        }
        if (this.match_RuleLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.build(context, token);
          return 19;
        }
        if (this.match_Comment(context, token)) {
          this.build(context, token);
          return 36;
        }
        if (this.match_Empty(context, token)) {
          this.build(context, token);
          return 36;
        }
        const expectedTokens = ["#EOF", "#StepLine", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#RuleLine", "#Comment", "#Empty"];
        const error = token.isEof ? TokenExceptions_1.UnexpectedEOFException.create(token, expectedTokens) : TokenExceptions_1.UnexpectedTokenException.create(token, expectedTokens);
        if (this.stopAtFirstError)
          throw error;
        this.addError(context, error);
        return 36;
      }
      // GherkinDocument:0>Feature:3>Rule:1>Background:2>Step:1>StepArg:0>__alt0:1>DocString:0>#DocStringSeparator:0
      matchTokenAt_37(token, context) {
        if (this.match_DocStringSeparator(context, token)) {
          this.build(context, token);
          return 38;
        }
        if (this.match_Other(context, token)) {
          this.build(context, token);
          return 37;
        }
        const expectedTokens = ["#DocStringSeparator", "#Other"];
        const error = token.isEof ? TokenExceptions_1.UnexpectedEOFException.create(token, expectedTokens) : TokenExceptions_1.UnexpectedTokenException.create(token, expectedTokens);
        if (this.stopAtFirstError)
          throw error;
        this.addError(context, error);
        return 37;
      }
      // GherkinDocument:0>Feature:3>Rule:1>Background:2>Step:1>StepArg:0>__alt0:1>DocString:2>#DocStringSeparator:0
      matchTokenAt_38(token, context) {
        if (this.match_EOF(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.build(context, token);
          return 34;
        }
        if (this.match_StepLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Step);
          this.build(context, token);
          return 23;
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_0(context, token)) {
            this.endRule(context);
            this.endRule(context);
            this.endRule(context);
            this.startRule(context, RuleType.ScenarioDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 25;
          }
        }
        if (this.match_TagLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.startRule(context, RuleType.Tags);
          this.build(context, token);
          return 18;
        }
        if (this.match_ScenarioLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.ScenarioDefinition);
          this.startRule(context, RuleType.Scenario);
          this.build(context, token);
          return 26;
        }
        if (this.match_RuleLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.build(context, token);
          return 19;
        }
        if (this.match_Comment(context, token)) {
          this.build(context, token);
          return 38;
        }
        if (this.match_Empty(context, token)) {
          this.build(context, token);
          return 38;
        }
        const expectedTokens = ["#EOF", "#StepLine", "#TagLine", "#ScenarioLine", "#RuleLine", "#Comment", "#Empty"];
        const error = token.isEof ? TokenExceptions_1.UnexpectedEOFException.create(token, expectedTokens) : TokenExceptions_1.UnexpectedTokenException.create(token, expectedTokens);
        if (this.stopAtFirstError)
          throw error;
        this.addError(context, error);
        return 38;
      }
      // GherkinDocument:0>Feature:2>ScenarioDefinition:1>Scenario:2>Step:1>StepArg:0>__alt0:1>DocString:0>#DocStringSeparator:0
      matchTokenAt_39(token, context) {
        if (this.match_DocStringSeparator(context, token)) {
          this.build(context, token);
          return 40;
        }
        if (this.match_Other(context, token)) {
          this.build(context, token);
          return 39;
        }
        const expectedTokens = ["#DocStringSeparator", "#Other"];
        const error = token.isEof ? TokenExceptions_1.UnexpectedEOFException.create(token, expectedTokens) : TokenExceptions_1.UnexpectedTokenException.create(token, expectedTokens);
        if (this.stopAtFirstError)
          throw error;
        this.addError(context, error);
        return 39;
      }
      // GherkinDocument:0>Feature:2>ScenarioDefinition:1>Scenario:2>Step:1>StepArg:0>__alt0:1>DocString:2>#DocStringSeparator:0
      matchTokenAt_40(token, context) {
        if (this.match_EOF(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.build(context, token);
          return 34;
        }
        if (this.match_StepLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Step);
          this.build(context, token);
          return 12;
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_1(context, token)) {
            this.endRule(context);
            this.endRule(context);
            this.startRule(context, RuleType.ExamplesDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 14;
          }
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_0(context, token)) {
            this.endRule(context);
            this.endRule(context);
            this.endRule(context);
            this.endRule(context);
            this.startRule(context, RuleType.ScenarioDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 9;
          }
        }
        if (this.match_TagLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.startRule(context, RuleType.Tags);
          this.build(context, token);
          return 18;
        }
        if (this.match_ExamplesLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.ExamplesDefinition);
          this.startRule(context, RuleType.Examples);
          this.build(context, token);
          return 15;
        }
        if (this.match_ScenarioLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.ScenarioDefinition);
          this.startRule(context, RuleType.Scenario);
          this.build(context, token);
          return 10;
        }
        if (this.match_RuleLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.build(context, token);
          return 19;
        }
        if (this.match_Comment(context, token)) {
          this.build(context, token);
          return 40;
        }
        if (this.match_Empty(context, token)) {
          this.build(context, token);
          return 40;
        }
        const expectedTokens = ["#EOF", "#StepLine", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#RuleLine", "#Comment", "#Empty"];
        const error = token.isEof ? TokenExceptions_1.UnexpectedEOFException.create(token, expectedTokens) : TokenExceptions_1.UnexpectedTokenException.create(token, expectedTokens);
        if (this.stopAtFirstError)
          throw error;
        this.addError(context, error);
        return 40;
      }
      // GherkinDocument:0>Feature:1>Background:2>Step:1>StepArg:0>__alt0:1>DocString:0>#DocStringSeparator:0
      matchTokenAt_41(token, context) {
        if (this.match_DocStringSeparator(context, token)) {
          this.build(context, token);
          return 42;
        }
        if (this.match_Other(context, token)) {
          this.build(context, token);
          return 41;
        }
        const expectedTokens = ["#DocStringSeparator", "#Other"];
        const error = token.isEof ? TokenExceptions_1.UnexpectedEOFException.create(token, expectedTokens) : TokenExceptions_1.UnexpectedTokenException.create(token, expectedTokens);
        if (this.stopAtFirstError)
          throw error;
        this.addError(context, error);
        return 41;
      }
      // GherkinDocument:0>Feature:1>Background:2>Step:1>StepArg:0>__alt0:1>DocString:2>#DocStringSeparator:0
      matchTokenAt_42(token, context) {
        if (this.match_EOF(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.build(context, token);
          return 34;
        }
        if (this.match_StepLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Step);
          this.build(context, token);
          return 7;
        }
        if (this.match_TagLine(context, token)) {
          if (this.lookahead_0(context, token)) {
            this.endRule(context);
            this.endRule(context);
            this.endRule(context);
            this.startRule(context, RuleType.ScenarioDefinition);
            this.startRule(context, RuleType.Tags);
            this.build(context, token);
            return 9;
          }
        }
        if (this.match_TagLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.startRule(context, RuleType.Tags);
          this.build(context, token);
          return 18;
        }
        if (this.match_ScenarioLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.ScenarioDefinition);
          this.startRule(context, RuleType.Scenario);
          this.build(context, token);
          return 10;
        }
        if (this.match_RuleLine(context, token)) {
          this.endRule(context);
          this.endRule(context);
          this.endRule(context);
          this.startRule(context, RuleType.Rule);
          this.startRule(context, RuleType.RuleHeader);
          this.build(context, token);
          return 19;
        }
        if (this.match_Comment(context, token)) {
          this.build(context, token);
          return 42;
        }
        if (this.match_Empty(context, token)) {
          this.build(context, token);
          return 42;
        }
        const expectedTokens = ["#EOF", "#StepLine", "#TagLine", "#ScenarioLine", "#RuleLine", "#Comment", "#Empty"];
        const error = token.isEof ? TokenExceptions_1.UnexpectedEOFException.create(token, expectedTokens) : TokenExceptions_1.UnexpectedTokenException.create(token, expectedTokens);
        if (this.stopAtFirstError)
          throw error;
        this.addError(context, error);
        return 42;
      }
      match_EOF(context, token) {
        return this.handleExternalError(context, false, () => this.tokenMatcher.match_EOF(token));
      }
      match_Empty(context, token) {
        if (token.isEof)
          return false;
        return this.handleExternalError(context, false, () => this.tokenMatcher.match_Empty(token));
      }
      match_Comment(context, token) {
        if (token.isEof)
          return false;
        return this.handleExternalError(context, false, () => this.tokenMatcher.match_Comment(token));
      }
      match_TagLine(context, token) {
        if (token.isEof)
          return false;
        return this.handleExternalError(context, false, () => this.tokenMatcher.match_TagLine(token));
      }
      match_FeatureLine(context, token) {
        if (token.isEof)
          return false;
        return this.handleExternalError(context, false, () => this.tokenMatcher.match_FeatureLine(token));
      }
      match_RuleLine(context, token) {
        if (token.isEof)
          return false;
        return this.handleExternalError(context, false, () => this.tokenMatcher.match_RuleLine(token));
      }
      match_BackgroundLine(context, token) {
        if (token.isEof)
          return false;
        return this.handleExternalError(context, false, () => this.tokenMatcher.match_BackgroundLine(token));
      }
      match_ScenarioLine(context, token) {
        if (token.isEof)
          return false;
        return this.handleExternalError(context, false, () => this.tokenMatcher.match_ScenarioLine(token));
      }
      match_ExamplesLine(context, token) {
        if (token.isEof)
          return false;
        return this.handleExternalError(context, false, () => this.tokenMatcher.match_ExamplesLine(token));
      }
      match_StepLine(context, token) {
        if (token.isEof)
          return false;
        return this.handleExternalError(context, false, () => this.tokenMatcher.match_StepLine(token));
      }
      match_DocStringSeparator(context, token) {
        if (token.isEof)
          return false;
        return this.handleExternalError(context, false, () => this.tokenMatcher.match_DocStringSeparator(token));
      }
      match_TableRow(context, token) {
        if (token.isEof)
          return false;
        return this.handleExternalError(context, false, () => this.tokenMatcher.match_TableRow(token));
      }
      match_Language(context, token) {
        if (token.isEof)
          return false;
        return this.handleExternalError(context, false, () => this.tokenMatcher.match_Language(token));
      }
      match_Other(context, token) {
        if (token.isEof)
          return false;
        return this.handleExternalError(context, false, () => this.tokenMatcher.match_Other(token));
      }
      lookahead_0(context, currentToken) {
        let token;
        const queue = [];
        let match = false;
        do {
          token = this.readToken(this.context);
          queue.push(token);
          if (this.match_ScenarioLine(context, token)) {
            match = true;
            break;
          }
        } while (this.match_Empty(context, token) || this.match_Comment(context, token) || this.match_TagLine(context, token));
        context.tokenQueue = context.tokenQueue.concat(queue);
        return match;
      }
      lookahead_1(context, currentToken) {
        let token;
        const queue = [];
        let match = false;
        do {
          token = this.readToken(this.context);
          queue.push(token);
          if (this.match_ExamplesLine(context, token)) {
            match = true;
            break;
          }
        } while (this.match_Empty(context, token) || this.match_Comment(context, token) || this.match_TagLine(context, token));
        context.tokenQueue = context.tokenQueue.concat(queue);
        return match;
      }
    };
    exports.default = Parser2;
  }
});

// node_modules/@cucumber/gherkin/dist/src/AstBuilder.js
var require_AstBuilder = __commonJS({
  "node_modules/@cucumber/gherkin/dist/src/AstBuilder.js"(exports) {
    "use strict";
    var __importDefault = exports && exports.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    var AstNode_1 = __importDefault(require_AstNode());
    var Errors_1 = require_Errors();
    var Parser_1 = require_Parser();
    var AstBuilder2 = class {
      constructor(newId) {
        this.newId = newId;
        if (!newId) {
          throw new Error("No newId");
        }
        this.reset();
      }
      reset() {
        this.stack = [new AstNode_1.default(Parser_1.RuleType.None)];
        this.comments = [];
      }
      startRule(ruleType) {
        this.stack.push(new AstNode_1.default(ruleType));
      }
      endRule() {
        const node = this.stack.pop();
        const transformedNode = this.transformNode(node);
        this.currentNode().add(node.ruleType, transformedNode);
      }
      build(token) {
        if (token.matchedType === Parser_1.TokenType.Comment) {
          this.comments.push({
            location: this.getLocation(token),
            text: token.matchedText
          });
        } else {
          this.currentNode().add(token.matchedType, token);
        }
      }
      getResult() {
        return this.currentNode().getSingle(Parser_1.RuleType.GherkinDocument);
      }
      currentNode() {
        return this.stack[this.stack.length - 1];
      }
      getLocation(token, column) {
        return !column ? token.location : { line: token.location.line, column };
      }
      getTags(node) {
        const tags = [];
        const tagsNode = node.getSingle(Parser_1.RuleType.Tags);
        if (!tagsNode) {
          return tags;
        }
        const tokens = tagsNode.getTokens(Parser_1.TokenType.TagLine);
        for (const token of tokens) {
          for (const tagItem of token.matchedItems) {
            tags.push({
              location: this.getLocation(token, tagItem.column),
              name: tagItem.text,
              id: this.newId()
            });
          }
        }
        return tags;
      }
      getCells(tableRowToken) {
        return tableRowToken.matchedItems.map((cellItem) => ({
          location: this.getLocation(tableRowToken, cellItem.column),
          value: cellItem.text
        }));
      }
      getDescription(node) {
        return node.getSingle(Parser_1.RuleType.Description) || "";
      }
      getSteps(node) {
        return node.getItems(Parser_1.RuleType.Step);
      }
      getTableRows(node) {
        const rows = node.getTokens(Parser_1.TokenType.TableRow).map((token) => ({
          id: this.newId(),
          location: this.getLocation(token),
          cells: this.getCells(token)
        }));
        this.ensureCellCount(rows);
        return rows.length === 0 ? [] : rows;
      }
      ensureCellCount(rows) {
        if (rows.length === 0) {
          return;
        }
        const cellCount = rows[0].cells.length;
        rows.forEach((row) => {
          if (row.cells.length !== cellCount) {
            throw Errors_1.AstBuilderException.create("inconsistent cell count within the table", row.location);
          }
        });
      }
      transformNode(node) {
        switch (node.ruleType) {
          case Parser_1.RuleType.Step: {
            const stepLine = node.getToken(Parser_1.TokenType.StepLine);
            const dataTable = node.getSingle(Parser_1.RuleType.DataTable);
            const docString = node.getSingle(Parser_1.RuleType.DocString);
            const location = this.getLocation(stepLine);
            const step = {
              id: this.newId(),
              location,
              keyword: stepLine.matchedKeyword,
              keywordType: stepLine.matchedKeywordType,
              text: stepLine.matchedText,
              dataTable,
              docString
            };
            return step;
          }
          case Parser_1.RuleType.DocString: {
            const separatorToken = node.getTokens(Parser_1.TokenType.DocStringSeparator)[0];
            const mediaType = separatorToken.matchedText.length > 0 ? separatorToken.matchedText : void 0;
            const lineTokens = node.getTokens(Parser_1.TokenType.Other);
            const content = lineTokens.map((t) => t.matchedText).join("\n");
            const result = {
              location: this.getLocation(separatorToken),
              content,
              delimiter: separatorToken.matchedKeyword
            };
            if (mediaType) {
              result.mediaType = mediaType;
            }
            return result;
          }
          case Parser_1.RuleType.DataTable: {
            const rows = this.getTableRows(node);
            const dataTable = {
              location: rows[0].location,
              rows
            };
            return dataTable;
          }
          case Parser_1.RuleType.Background: {
            const backgroundLine = node.getToken(Parser_1.TokenType.BackgroundLine);
            const description = this.getDescription(node);
            const steps = this.getSteps(node);
            const background = {
              id: this.newId(),
              location: this.getLocation(backgroundLine),
              keyword: backgroundLine.matchedKeyword,
              name: backgroundLine.matchedText,
              description,
              steps
            };
            return background;
          }
          case Parser_1.RuleType.ScenarioDefinition: {
            const tags = this.getTags(node);
            const scenarioNode = node.getSingle(Parser_1.RuleType.Scenario);
            const scenarioLine = scenarioNode.getToken(Parser_1.TokenType.ScenarioLine);
            const description = this.getDescription(scenarioNode);
            const steps = this.getSteps(scenarioNode);
            const examples = scenarioNode.getItems(Parser_1.RuleType.ExamplesDefinition);
            const scenario = {
              id: this.newId(),
              tags,
              location: this.getLocation(scenarioLine),
              keyword: scenarioLine.matchedKeyword,
              name: scenarioLine.matchedText,
              description,
              steps,
              examples
            };
            return scenario;
          }
          case Parser_1.RuleType.ExamplesDefinition: {
            const tags = this.getTags(node);
            const examplesNode = node.getSingle(Parser_1.RuleType.Examples);
            const examplesLine = examplesNode.getToken(Parser_1.TokenType.ExamplesLine);
            const description = this.getDescription(examplesNode);
            const examplesTable = examplesNode.getSingle(Parser_1.RuleType.ExamplesTable);
            const examples = {
              id: this.newId(),
              tags,
              location: this.getLocation(examplesLine),
              keyword: examplesLine.matchedKeyword,
              name: examplesLine.matchedText,
              description,
              tableHeader: examplesTable ? examplesTable[0] : void 0,
              tableBody: examplesTable ? examplesTable.slice(1) : []
            };
            return examples;
          }
          case Parser_1.RuleType.ExamplesTable: {
            return this.getTableRows(node);
          }
          case Parser_1.RuleType.Description: {
            let lineTokens = node.getTokens(Parser_1.TokenType.Other);
            let end = lineTokens.length;
            while (end > 0 && lineTokens[end - 1].line.trimmedLineText === "") {
              end--;
            }
            lineTokens = lineTokens.slice(0, end);
            return lineTokens.map((token) => token.matchedText).join("\n");
          }
          case Parser_1.RuleType.Feature: {
            const header = node.getSingle(Parser_1.RuleType.FeatureHeader);
            if (!header) {
              return null;
            }
            const tags = this.getTags(header);
            const featureLine = header.getToken(Parser_1.TokenType.FeatureLine);
            if (!featureLine) {
              return null;
            }
            const children = [];
            const background = node.getSingle(Parser_1.RuleType.Background);
            if (background) {
              children.push({
                background
              });
            }
            for (const scenario of node.getItems(Parser_1.RuleType.ScenarioDefinition)) {
              children.push({
                scenario
              });
            }
            for (const rule of node.getItems(Parser_1.RuleType.Rule)) {
              children.push({
                rule
              });
            }
            const description = this.getDescription(header);
            const language = featureLine.matchedGherkinDialect;
            const feature = {
              tags,
              location: this.getLocation(featureLine),
              language,
              keyword: featureLine.matchedKeyword,
              name: featureLine.matchedText,
              description,
              children
            };
            return feature;
          }
          case Parser_1.RuleType.Rule: {
            const header = node.getSingle(Parser_1.RuleType.RuleHeader);
            if (!header) {
              return null;
            }
            const ruleLine = header.getToken(Parser_1.TokenType.RuleLine);
            if (!ruleLine) {
              return null;
            }
            const tags = this.getTags(header);
            const children = [];
            const background = node.getSingle(Parser_1.RuleType.Background);
            if (background) {
              children.push({
                background
              });
            }
            for (const scenario of node.getItems(Parser_1.RuleType.ScenarioDefinition)) {
              children.push({
                scenario
              });
            }
            const description = this.getDescription(header);
            const rule = {
              id: this.newId(),
              location: this.getLocation(ruleLine),
              keyword: ruleLine.matchedKeyword,
              name: ruleLine.matchedText,
              description,
              children,
              tags
            };
            return rule;
          }
          case Parser_1.RuleType.GherkinDocument: {
            const feature = node.getSingle(Parser_1.RuleType.Feature);
            const gherkinDocument = {
              feature,
              comments: this.comments
            };
            return gherkinDocument;
          }
          default:
            return node;
        }
      }
    };
    exports.default = AstBuilder2;
  }
});

// node_modules/@cucumber/messages/dist/cjs/src/TimeConversion.js
var require_TimeConversion = __commonJS({
  "node_modules/@cucumber/messages/dist/cjs/src/TimeConversion.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.millisecondsSinceEpochToTimestamp = millisecondsSinceEpochToTimestamp;
    exports.millisecondsToDuration = millisecondsToDuration2;
    exports.timestampToMillisecondsSinceEpoch = timestampToMillisecondsSinceEpoch;
    exports.durationToMilliseconds = durationToMilliseconds;
    exports.addDurations = addDurations;
    var MILLISECONDS_PER_SECOND = 1e3;
    var NANOSECONDS_PER_MILLISECOND = 1e6;
    var NANOSECONDS_PER_SECOND = 1e9;
    function millisecondsSinceEpochToTimestamp(millisecondsSinceEpoch) {
      return toSecondsAndNanos(millisecondsSinceEpoch);
    }
    function millisecondsToDuration2(durationInMilliseconds) {
      return toSecondsAndNanos(durationInMilliseconds);
    }
    function timestampToMillisecondsSinceEpoch(timestamp) {
      var seconds = timestamp.seconds, nanos = timestamp.nanos;
      return toMillis(seconds, nanos);
    }
    function durationToMilliseconds(duration) {
      var seconds = duration.seconds, nanos = duration.nanos;
      return toMillis(seconds, nanos);
    }
    function addDurations(durationA, durationB) {
      var seconds = +durationA.seconds + +durationB.seconds;
      var nanos = durationA.nanos + durationB.nanos;
      if (nanos >= NANOSECONDS_PER_SECOND) {
        seconds += 1;
        nanos -= NANOSECONDS_PER_SECOND;
      }
      return { seconds, nanos };
    }
    function toSecondsAndNanos(milliseconds) {
      var seconds = Math.floor(milliseconds / MILLISECONDS_PER_SECOND);
      var nanos = Math.floor(milliseconds % MILLISECONDS_PER_SECOND * NANOSECONDS_PER_MILLISECOND);
      return { seconds, nanos };
    }
    function toMillis(seconds, nanos) {
      var secondMillis = +seconds * MILLISECONDS_PER_SECOND;
      var nanoMillis = nanos / NANOSECONDS_PER_MILLISECOND;
      return secondMillis + nanoMillis;
    }
  }
});

// node_modules/@cucumber/messages/dist/cjs/src/IdGenerator.js
var require_IdGenerator = __commonJS({
  "node_modules/@cucumber/messages/dist/cjs/src/IdGenerator.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.uuid = uuid2;
    exports.incrementing = incrementing2;
    function uuid2() {
      return function() {
        return crypto.randomUUID();
      };
    }
    function incrementing2() {
      var next = 0;
      return function() {
        return (next++).toString();
      };
    }
  }
});

// node_modules/class-transformer/cjs/enums/transformation-type.enum.js
var require_transformation_type_enum = __commonJS({
  "node_modules/class-transformer/cjs/enums/transformation-type.enum.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.TransformationType = void 0;
    var TransformationType;
    (function(TransformationType2) {
      TransformationType2[TransformationType2["PLAIN_TO_CLASS"] = 0] = "PLAIN_TO_CLASS";
      TransformationType2[TransformationType2["CLASS_TO_PLAIN"] = 1] = "CLASS_TO_PLAIN";
      TransformationType2[TransformationType2["CLASS_TO_CLASS"] = 2] = "CLASS_TO_CLASS";
    })(TransformationType = exports.TransformationType || (exports.TransformationType = {}));
  }
});

// node_modules/class-transformer/cjs/enums/index.js
var require_enums = __commonJS({
  "node_modules/class-transformer/cjs/enums/index.js"(exports) {
    "use strict";
    var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      Object.defineProperty(o, k2, { enumerable: true, get: function() {
        return m[k];
      } });
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __exportStar = exports && exports.__exportStar || function(m, exports2) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p)) __createBinding(exports2, m, p);
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    __exportStar(require_transformation_type_enum(), exports);
  }
});

// node_modules/class-transformer/cjs/MetadataStorage.js
var require_MetadataStorage = __commonJS({
  "node_modules/class-transformer/cjs/MetadataStorage.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.MetadataStorage = void 0;
    var enums_1 = require_enums();
    var MetadataStorage = class {
      constructor() {
        this._typeMetadatas = /* @__PURE__ */ new Map();
        this._transformMetadatas = /* @__PURE__ */ new Map();
        this._exposeMetadatas = /* @__PURE__ */ new Map();
        this._excludeMetadatas = /* @__PURE__ */ new Map();
        this._ancestorsMap = /* @__PURE__ */ new Map();
      }
      // -------------------------------------------------------------------------
      // Adder Methods
      // -------------------------------------------------------------------------
      addTypeMetadata(metadata) {
        if (!this._typeMetadatas.has(metadata.target)) {
          this._typeMetadatas.set(metadata.target, /* @__PURE__ */ new Map());
        }
        this._typeMetadatas.get(metadata.target).set(metadata.propertyName, metadata);
      }
      addTransformMetadata(metadata) {
        if (!this._transformMetadatas.has(metadata.target)) {
          this._transformMetadatas.set(metadata.target, /* @__PURE__ */ new Map());
        }
        if (!this._transformMetadatas.get(metadata.target).has(metadata.propertyName)) {
          this._transformMetadatas.get(metadata.target).set(metadata.propertyName, []);
        }
        this._transformMetadatas.get(metadata.target).get(metadata.propertyName).push(metadata);
      }
      addExposeMetadata(metadata) {
        if (!this._exposeMetadatas.has(metadata.target)) {
          this._exposeMetadatas.set(metadata.target, /* @__PURE__ */ new Map());
        }
        this._exposeMetadatas.get(metadata.target).set(metadata.propertyName, metadata);
      }
      addExcludeMetadata(metadata) {
        if (!this._excludeMetadatas.has(metadata.target)) {
          this._excludeMetadatas.set(metadata.target, /* @__PURE__ */ new Map());
        }
        this._excludeMetadatas.get(metadata.target).set(metadata.propertyName, metadata);
      }
      // -------------------------------------------------------------------------
      // Public Methods
      // -------------------------------------------------------------------------
      findTransformMetadatas(target, propertyName, transformationType) {
        return this.findMetadatas(this._transformMetadatas, target, propertyName).filter((metadata) => {
          if (!metadata.options)
            return true;
          if (metadata.options.toClassOnly === true && metadata.options.toPlainOnly === true)
            return true;
          if (metadata.options.toClassOnly === true) {
            return transformationType === enums_1.TransformationType.CLASS_TO_CLASS || transformationType === enums_1.TransformationType.PLAIN_TO_CLASS;
          }
          if (metadata.options.toPlainOnly === true) {
            return transformationType === enums_1.TransformationType.CLASS_TO_PLAIN;
          }
          return true;
        });
      }
      findExcludeMetadata(target, propertyName) {
        return this.findMetadata(this._excludeMetadatas, target, propertyName);
      }
      findExposeMetadata(target, propertyName) {
        return this.findMetadata(this._exposeMetadatas, target, propertyName);
      }
      findExposeMetadataByCustomName(target, name) {
        return this.getExposedMetadatas(target).find((metadata) => {
          return metadata.options && metadata.options.name === name;
        });
      }
      findTypeMetadata(target, propertyName) {
        return this.findMetadata(this._typeMetadatas, target, propertyName);
      }
      getStrategy(target) {
        const excludeMap = this._excludeMetadatas.get(target);
        const exclude = excludeMap && excludeMap.get(void 0);
        const exposeMap = this._exposeMetadatas.get(target);
        const expose = exposeMap && exposeMap.get(void 0);
        if (exclude && expose || !exclude && !expose)
          return "none";
        return exclude ? "excludeAll" : "exposeAll";
      }
      getExposedMetadatas(target) {
        return this.getMetadata(this._exposeMetadatas, target);
      }
      getExcludedMetadatas(target) {
        return this.getMetadata(this._excludeMetadatas, target);
      }
      getExposedProperties(target, transformationType) {
        return this.getExposedMetadatas(target).filter((metadata) => {
          if (!metadata.options)
            return true;
          if (metadata.options.toClassOnly === true && metadata.options.toPlainOnly === true)
            return true;
          if (metadata.options.toClassOnly === true) {
            return transformationType === enums_1.TransformationType.CLASS_TO_CLASS || transformationType === enums_1.TransformationType.PLAIN_TO_CLASS;
          }
          if (metadata.options.toPlainOnly === true) {
            return transformationType === enums_1.TransformationType.CLASS_TO_PLAIN;
          }
          return true;
        }).map((metadata) => metadata.propertyName);
      }
      getExcludedProperties(target, transformationType) {
        return this.getExcludedMetadatas(target).filter((metadata) => {
          if (!metadata.options)
            return true;
          if (metadata.options.toClassOnly === true && metadata.options.toPlainOnly === true)
            return true;
          if (metadata.options.toClassOnly === true) {
            return transformationType === enums_1.TransformationType.CLASS_TO_CLASS || transformationType === enums_1.TransformationType.PLAIN_TO_CLASS;
          }
          if (metadata.options.toPlainOnly === true) {
            return transformationType === enums_1.TransformationType.CLASS_TO_PLAIN;
          }
          return true;
        }).map((metadata) => metadata.propertyName);
      }
      clear() {
        this._typeMetadatas.clear();
        this._exposeMetadatas.clear();
        this._excludeMetadatas.clear();
        this._ancestorsMap.clear();
      }
      // -------------------------------------------------------------------------
      // Private Methods
      // -------------------------------------------------------------------------
      getMetadata(metadatas, target) {
        const metadataFromTargetMap = metadatas.get(target);
        let metadataFromTarget;
        if (metadataFromTargetMap) {
          metadataFromTarget = Array.from(metadataFromTargetMap.values()).filter((meta) => meta.propertyName !== void 0);
        }
        const metadataFromAncestors = [];
        for (const ancestor of this.getAncestors(target)) {
          const ancestorMetadataMap = metadatas.get(ancestor);
          if (ancestorMetadataMap) {
            const metadataFromAncestor = Array.from(ancestorMetadataMap.values()).filter((meta) => meta.propertyName !== void 0);
            metadataFromAncestors.push(...metadataFromAncestor);
          }
        }
        return metadataFromAncestors.concat(metadataFromTarget || []);
      }
      findMetadata(metadatas, target, propertyName) {
        const metadataFromTargetMap = metadatas.get(target);
        if (metadataFromTargetMap) {
          const metadataFromTarget = metadataFromTargetMap.get(propertyName);
          if (metadataFromTarget) {
            return metadataFromTarget;
          }
        }
        for (const ancestor of this.getAncestors(target)) {
          const ancestorMetadataMap = metadatas.get(ancestor);
          if (ancestorMetadataMap) {
            const ancestorResult = ancestorMetadataMap.get(propertyName);
            if (ancestorResult) {
              return ancestorResult;
            }
          }
        }
        return void 0;
      }
      findMetadatas(metadatas, target, propertyName) {
        const metadataFromTargetMap = metadatas.get(target);
        let metadataFromTarget;
        if (metadataFromTargetMap) {
          metadataFromTarget = metadataFromTargetMap.get(propertyName);
        }
        const metadataFromAncestorsTarget = [];
        for (const ancestor of this.getAncestors(target)) {
          const ancestorMetadataMap = metadatas.get(ancestor);
          if (ancestorMetadataMap) {
            if (ancestorMetadataMap.has(propertyName)) {
              metadataFromAncestorsTarget.push(...ancestorMetadataMap.get(propertyName));
            }
          }
        }
        return metadataFromAncestorsTarget.slice().reverse().concat((metadataFromTarget || []).slice().reverse());
      }
      getAncestors(target) {
        if (!target)
          return [];
        if (!this._ancestorsMap.has(target)) {
          const ancestors = [];
          for (let baseClass = Object.getPrototypeOf(target.prototype.constructor); typeof baseClass.prototype !== "undefined"; baseClass = Object.getPrototypeOf(baseClass.prototype.constructor)) {
            ancestors.push(baseClass);
          }
          this._ancestorsMap.set(target, ancestors);
        }
        return this._ancestorsMap.get(target);
      }
    };
    exports.MetadataStorage = MetadataStorage;
  }
});

// node_modules/class-transformer/cjs/storage.js
var require_storage = __commonJS({
  "node_modules/class-transformer/cjs/storage.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.defaultMetadataStorage = void 0;
    var MetadataStorage_1 = require_MetadataStorage();
    exports.defaultMetadataStorage = new MetadataStorage_1.MetadataStorage();
  }
});

// node_modules/class-transformer/cjs/utils/get-global.util.js
var require_get_global_util = __commonJS({
  "node_modules/class-transformer/cjs/utils/get-global.util.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getGlobal = void 0;
    function getGlobal() {
      if (typeof globalThis !== "undefined") {
        return globalThis;
      }
      if (typeof global !== "undefined") {
        return global;
      }
      if (typeof window !== "undefined") {
        return window;
      }
      if (typeof self !== "undefined") {
        return self;
      }
    }
    exports.getGlobal = getGlobal;
  }
});

// node_modules/class-transformer/cjs/utils/is-promise.util.js
var require_is_promise_util = __commonJS({
  "node_modules/class-transformer/cjs/utils/is-promise.util.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.isPromise = void 0;
    function isPromise(p) {
      return p !== null && typeof p === "object" && typeof p.then === "function";
    }
    exports.isPromise = isPromise;
  }
});

// node_modules/class-transformer/cjs/utils/index.js
var require_utils = __commonJS({
  "node_modules/class-transformer/cjs/utils/index.js"(exports) {
    "use strict";
    var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      Object.defineProperty(o, k2, { enumerable: true, get: function() {
        return m[k];
      } });
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __exportStar = exports && exports.__exportStar || function(m, exports2) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p)) __createBinding(exports2, m, p);
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    __exportStar(require_get_global_util(), exports);
    __exportStar(require_is_promise_util(), exports);
  }
});

// node_modules/class-transformer/cjs/TransformOperationExecutor.js
var require_TransformOperationExecutor = __commonJS({
  "node_modules/class-transformer/cjs/TransformOperationExecutor.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.TransformOperationExecutor = void 0;
    var storage_1 = require_storage();
    var enums_1 = require_enums();
    var utils_1 = require_utils();
    function instantiateArrayType(arrayType) {
      const array = new arrayType();
      if (!(array instanceof Set) && !("push" in array)) {
        return [];
      }
      return array;
    }
    var TransformOperationExecutor = class {
      // -------------------------------------------------------------------------
      // Constructor
      // -------------------------------------------------------------------------
      constructor(transformationType, options) {
        this.transformationType = transformationType;
        this.options = options;
        this.recursionStack = /* @__PURE__ */ new Set();
      }
      // -------------------------------------------------------------------------
      // Public Methods
      // -------------------------------------------------------------------------
      transform(source, value, targetType, arrayType, isMap, level = 0) {
        if (Array.isArray(value) || value instanceof Set) {
          const newValue = arrayType && this.transformationType === enums_1.TransformationType.PLAIN_TO_CLASS ? instantiateArrayType(arrayType) : [];
          value.forEach((subValue, index) => {
            const subSource = source ? source[index] : void 0;
            if (!this.options.enableCircularCheck || !this.isCircular(subValue)) {
              let realTargetType;
              if (typeof targetType !== "function" && targetType && targetType.options && targetType.options.discriminator && targetType.options.discriminator.property && targetType.options.discriminator.subTypes) {
                if (this.transformationType === enums_1.TransformationType.PLAIN_TO_CLASS) {
                  realTargetType = targetType.options.discriminator.subTypes.find((subType) => subType.name === subValue[targetType.options.discriminator.property]);
                  const options = { newObject: newValue, object: subValue, property: void 0 };
                  const newType = targetType.typeFunction(options);
                  realTargetType === void 0 ? realTargetType = newType : realTargetType = realTargetType.value;
                  if (!targetType.options.keepDiscriminatorProperty)
                    delete subValue[targetType.options.discriminator.property];
                }
                if (this.transformationType === enums_1.TransformationType.CLASS_TO_CLASS) {
                  realTargetType = subValue.constructor;
                }
                if (this.transformationType === enums_1.TransformationType.CLASS_TO_PLAIN) {
                  subValue[targetType.options.discriminator.property] = targetType.options.discriminator.subTypes.find((subType) => subType.value === subValue.constructor).name;
                }
              } else {
                realTargetType = targetType;
              }
              const value2 = this.transform(subSource, subValue, realTargetType, void 0, subValue instanceof Map, level + 1);
              if (newValue instanceof Set) {
                newValue.add(value2);
              } else {
                newValue.push(value2);
              }
            } else if (this.transformationType === enums_1.TransformationType.CLASS_TO_CLASS) {
              if (newValue instanceof Set) {
                newValue.add(subValue);
              } else {
                newValue.push(subValue);
              }
            }
          });
          return newValue;
        } else if (targetType === String && !isMap) {
          if (value === null || value === void 0)
            return value;
          return String(value);
        } else if (targetType === Number && !isMap) {
          if (value === null || value === void 0)
            return value;
          return Number(value);
        } else if (targetType === Boolean && !isMap) {
          if (value === null || value === void 0)
            return value;
          return Boolean(value);
        } else if ((targetType === Date || value instanceof Date) && !isMap) {
          if (value instanceof Date) {
            return new Date(value.valueOf());
          }
          if (value === null || value === void 0)
            return value;
          return new Date(value);
        } else if (!!(0, utils_1.getGlobal)().Buffer && (targetType === Buffer || value instanceof Buffer) && !isMap) {
          if (value === null || value === void 0)
            return value;
          return Buffer.from(value);
        } else if ((0, utils_1.isPromise)(value) && !isMap) {
          return new Promise((resolve, reject) => {
            value.then((data) => resolve(this.transform(void 0, data, targetType, void 0, void 0, level + 1)), reject);
          });
        } else if (!isMap && value !== null && typeof value === "object" && typeof value.then === "function") {
          return value;
        } else if (typeof value === "object" && value !== null) {
          if (!targetType && value.constructor !== Object)
            if (!Array.isArray(value) && value.constructor === Array) {
            } else {
              targetType = value.constructor;
            }
          if (!targetType && source)
            targetType = source.constructor;
          if (this.options.enableCircularCheck) {
            this.recursionStack.add(value);
          }
          const keys = this.getKeys(targetType, value, isMap);
          let newValue = source ? source : {};
          if (!source && (this.transformationType === enums_1.TransformationType.PLAIN_TO_CLASS || this.transformationType === enums_1.TransformationType.CLASS_TO_CLASS)) {
            if (isMap) {
              newValue = /* @__PURE__ */ new Map();
            } else if (targetType) {
              newValue = new targetType();
            } else {
              newValue = {};
            }
          }
          for (const key of keys) {
            if (key === "__proto__" || key === "constructor") {
              continue;
            }
            const valueKey = key;
            let newValueKey = key, propertyName = key;
            if (!this.options.ignoreDecorators && targetType) {
              if (this.transformationType === enums_1.TransformationType.PLAIN_TO_CLASS) {
                const exposeMetadata = storage_1.defaultMetadataStorage.findExposeMetadataByCustomName(targetType, key);
                if (exposeMetadata) {
                  propertyName = exposeMetadata.propertyName;
                  newValueKey = exposeMetadata.propertyName;
                }
              } else if (this.transformationType === enums_1.TransformationType.CLASS_TO_PLAIN || this.transformationType === enums_1.TransformationType.CLASS_TO_CLASS) {
                const exposeMetadata = storage_1.defaultMetadataStorage.findExposeMetadata(targetType, key);
                if (exposeMetadata && exposeMetadata.options && exposeMetadata.options.name) {
                  newValueKey = exposeMetadata.options.name;
                }
              }
            }
            let subValue = void 0;
            if (this.transformationType === enums_1.TransformationType.PLAIN_TO_CLASS) {
              subValue = value[valueKey];
            } else {
              if (value instanceof Map) {
                subValue = value.get(valueKey);
              } else if (value[valueKey] instanceof Function) {
                subValue = value[valueKey]();
              } else {
                subValue = value[valueKey];
              }
            }
            let type = void 0, isSubValueMap = subValue instanceof Map;
            if (targetType && isMap) {
              type = targetType;
            } else if (targetType) {
              const metadata = storage_1.defaultMetadataStorage.findTypeMetadata(targetType, propertyName);
              if (metadata) {
                const options = { newObject: newValue, object: value, property: propertyName };
                const newType = metadata.typeFunction ? metadata.typeFunction(options) : metadata.reflectedType;
                if (metadata.options && metadata.options.discriminator && metadata.options.discriminator.property && metadata.options.discriminator.subTypes) {
                  if (!(value[valueKey] instanceof Array)) {
                    if (this.transformationType === enums_1.TransformationType.PLAIN_TO_CLASS) {
                      type = metadata.options.discriminator.subTypes.find((subType) => {
                        if (subValue && subValue instanceof Object && metadata.options.discriminator.property in subValue) {
                          return subType.name === subValue[metadata.options.discriminator.property];
                        }
                      });
                      type === void 0 ? type = newType : type = type.value;
                      if (!metadata.options.keepDiscriminatorProperty) {
                        if (subValue && subValue instanceof Object && metadata.options.discriminator.property in subValue) {
                          delete subValue[metadata.options.discriminator.property];
                        }
                      }
                    }
                    if (this.transformationType === enums_1.TransformationType.CLASS_TO_CLASS) {
                      type = subValue.constructor;
                    }
                    if (this.transformationType === enums_1.TransformationType.CLASS_TO_PLAIN) {
                      if (subValue) {
                        subValue[metadata.options.discriminator.property] = metadata.options.discriminator.subTypes.find((subType) => subType.value === subValue.constructor).name;
                      }
                    }
                  } else {
                    type = metadata;
                  }
                } else {
                  type = newType;
                }
                isSubValueMap = isSubValueMap || metadata.reflectedType === Map;
              } else if (this.options.targetMaps) {
                this.options.targetMaps.filter((map) => map.target === targetType && !!map.properties[propertyName]).forEach((map) => type = map.properties[propertyName]);
              } else if (this.options.enableImplicitConversion && this.transformationType === enums_1.TransformationType.PLAIN_TO_CLASS) {
                const reflectedType = Reflect.getMetadata("design:type", targetType.prototype, propertyName);
                if (reflectedType) {
                  type = reflectedType;
                }
              }
            }
            const arrayType2 = Array.isArray(value[valueKey]) ? this.getReflectedType(targetType, propertyName) : void 0;
            const subSource = source ? source[valueKey] : void 0;
            if (newValue.constructor.prototype) {
              const descriptor = Object.getOwnPropertyDescriptor(newValue.constructor.prototype, newValueKey);
              if ((this.transformationType === enums_1.TransformationType.PLAIN_TO_CLASS || this.transformationType === enums_1.TransformationType.CLASS_TO_CLASS) && // eslint-disable-next-line @typescript-eslint/unbound-method
              (descriptor && !descriptor.set || newValue[newValueKey] instanceof Function))
                continue;
            }
            if (!this.options.enableCircularCheck || !this.isCircular(subValue)) {
              const transformKey = this.transformationType === enums_1.TransformationType.PLAIN_TO_CLASS ? newValueKey : key;
              let finalValue;
              if (this.transformationType === enums_1.TransformationType.CLASS_TO_PLAIN) {
                finalValue = value[transformKey];
                finalValue = this.applyCustomTransformations(finalValue, targetType, transformKey, value, this.transformationType);
                finalValue = value[transformKey] === finalValue ? subValue : finalValue;
                finalValue = this.transform(subSource, finalValue, type, arrayType2, isSubValueMap, level + 1);
              } else {
                if (subValue === void 0 && this.options.exposeDefaultValues) {
                  finalValue = newValue[newValueKey];
                } else {
                  finalValue = this.transform(subSource, subValue, type, arrayType2, isSubValueMap, level + 1);
                  finalValue = this.applyCustomTransformations(finalValue, targetType, transformKey, value, this.transformationType);
                }
              }
              if (finalValue !== void 0 || this.options.exposeUnsetFields) {
                if (newValue instanceof Map) {
                  newValue.set(newValueKey, finalValue);
                } else {
                  newValue[newValueKey] = finalValue;
                }
              }
            } else if (this.transformationType === enums_1.TransformationType.CLASS_TO_CLASS) {
              let finalValue = subValue;
              finalValue = this.applyCustomTransformations(finalValue, targetType, key, value, this.transformationType);
              if (finalValue !== void 0 || this.options.exposeUnsetFields) {
                if (newValue instanceof Map) {
                  newValue.set(newValueKey, finalValue);
                } else {
                  newValue[newValueKey] = finalValue;
                }
              }
            }
          }
          if (this.options.enableCircularCheck) {
            this.recursionStack.delete(value);
          }
          return newValue;
        } else {
          return value;
        }
      }
      applyCustomTransformations(value, target, key, obj, transformationType) {
        let metadatas = storage_1.defaultMetadataStorage.findTransformMetadatas(target, key, this.transformationType);
        if (this.options.version !== void 0) {
          metadatas = metadatas.filter((metadata) => {
            if (!metadata.options)
              return true;
            return this.checkVersion(metadata.options.since, metadata.options.until);
          });
        }
        if (this.options.groups && this.options.groups.length) {
          metadatas = metadatas.filter((metadata) => {
            if (!metadata.options)
              return true;
            return this.checkGroups(metadata.options.groups);
          });
        } else {
          metadatas = metadatas.filter((metadata) => {
            return !metadata.options || !metadata.options.groups || !metadata.options.groups.length;
          });
        }
        metadatas.forEach((metadata) => {
          value = metadata.transformFn({ value, key, obj, type: transformationType, options: this.options });
        });
        return value;
      }
      // preventing circular references
      isCircular(object) {
        return this.recursionStack.has(object);
      }
      getReflectedType(target, propertyName) {
        if (!target)
          return void 0;
        const meta = storage_1.defaultMetadataStorage.findTypeMetadata(target, propertyName);
        return meta ? meta.reflectedType : void 0;
      }
      getKeys(target, object, isMap) {
        let strategy = storage_1.defaultMetadataStorage.getStrategy(target);
        if (strategy === "none")
          strategy = this.options.strategy || "exposeAll";
        let keys = [];
        if (strategy === "exposeAll" || isMap) {
          if (object instanceof Map) {
            keys = Array.from(object.keys());
          } else {
            keys = Object.keys(object);
          }
        }
        if (isMap) {
          return keys;
        }
        if (this.options.ignoreDecorators && this.options.excludeExtraneousValues && target) {
          const exposedProperties = storage_1.defaultMetadataStorage.getExposedProperties(target, this.transformationType);
          const excludedProperties = storage_1.defaultMetadataStorage.getExcludedProperties(target, this.transformationType);
          keys = [...exposedProperties, ...excludedProperties];
        }
        if (!this.options.ignoreDecorators && target) {
          let exposedProperties = storage_1.defaultMetadataStorage.getExposedProperties(target, this.transformationType);
          if (this.transformationType === enums_1.TransformationType.PLAIN_TO_CLASS) {
            exposedProperties = exposedProperties.map((key) => {
              const exposeMetadata = storage_1.defaultMetadataStorage.findExposeMetadata(target, key);
              if (exposeMetadata && exposeMetadata.options && exposeMetadata.options.name) {
                return exposeMetadata.options.name;
              }
              return key;
            });
          }
          if (this.options.excludeExtraneousValues) {
            keys = exposedProperties;
          } else {
            keys = keys.concat(exposedProperties);
          }
          const excludedProperties = storage_1.defaultMetadataStorage.getExcludedProperties(target, this.transformationType);
          if (excludedProperties.length > 0) {
            keys = keys.filter((key) => {
              return !excludedProperties.includes(key);
            });
          }
          if (this.options.version !== void 0) {
            keys = keys.filter((key) => {
              const exposeMetadata = storage_1.defaultMetadataStorage.findExposeMetadata(target, key);
              if (!exposeMetadata || !exposeMetadata.options)
                return true;
              return this.checkVersion(exposeMetadata.options.since, exposeMetadata.options.until);
            });
          }
          if (this.options.groups && this.options.groups.length) {
            keys = keys.filter((key) => {
              const exposeMetadata = storage_1.defaultMetadataStorage.findExposeMetadata(target, key);
              if (!exposeMetadata || !exposeMetadata.options)
                return true;
              return this.checkGroups(exposeMetadata.options.groups);
            });
          } else {
            keys = keys.filter((key) => {
              const exposeMetadata = storage_1.defaultMetadataStorage.findExposeMetadata(target, key);
              return !exposeMetadata || !exposeMetadata.options || !exposeMetadata.options.groups || !exposeMetadata.options.groups.length;
            });
          }
        }
        if (this.options.excludePrefixes && this.options.excludePrefixes.length) {
          keys = keys.filter((key) => this.options.excludePrefixes.every((prefix) => {
            return key.substr(0, prefix.length) !== prefix;
          }));
        }
        keys = keys.filter((key, index, self2) => {
          return self2.indexOf(key) === index;
        });
        return keys;
      }
      checkVersion(since, until) {
        let decision = true;
        if (decision && since)
          decision = this.options.version >= since;
        if (decision && until)
          decision = this.options.version < until;
        return decision;
      }
      checkGroups(groups) {
        if (!groups)
          return true;
        return this.options.groups.some((optionGroup) => groups.includes(optionGroup));
      }
    };
    exports.TransformOperationExecutor = TransformOperationExecutor;
  }
});

// node_modules/class-transformer/cjs/constants/default-options.constant.js
var require_default_options_constant = __commonJS({
  "node_modules/class-transformer/cjs/constants/default-options.constant.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.defaultOptions = void 0;
    exports.defaultOptions = {
      enableCircularCheck: false,
      enableImplicitConversion: false,
      excludeExtraneousValues: false,
      excludePrefixes: void 0,
      exposeDefaultValues: false,
      exposeUnsetFields: true,
      groups: void 0,
      ignoreDecorators: false,
      strategy: void 0,
      targetMaps: void 0,
      version: void 0
    };
  }
});

// node_modules/class-transformer/cjs/ClassTransformer.js
var require_ClassTransformer = __commonJS({
  "node_modules/class-transformer/cjs/ClassTransformer.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ClassTransformer = void 0;
    var TransformOperationExecutor_1 = require_TransformOperationExecutor();
    var enums_1 = require_enums();
    var default_options_constant_1 = require_default_options_constant();
    var ClassTransformer = class {
      instanceToPlain(object, options) {
        const executor = new TransformOperationExecutor_1.TransformOperationExecutor(enums_1.TransformationType.CLASS_TO_PLAIN, {
          ...default_options_constant_1.defaultOptions,
          ...options
        });
        return executor.transform(void 0, object, void 0, void 0, void 0, void 0);
      }
      classToPlainFromExist(object, plainObject, options) {
        const executor = new TransformOperationExecutor_1.TransformOperationExecutor(enums_1.TransformationType.CLASS_TO_PLAIN, {
          ...default_options_constant_1.defaultOptions,
          ...options
        });
        return executor.transform(plainObject, object, void 0, void 0, void 0, void 0);
      }
      plainToInstance(cls, plain, options) {
        const executor = new TransformOperationExecutor_1.TransformOperationExecutor(enums_1.TransformationType.PLAIN_TO_CLASS, {
          ...default_options_constant_1.defaultOptions,
          ...options
        });
        return executor.transform(void 0, plain, cls, void 0, void 0, void 0);
      }
      plainToClassFromExist(clsObject, plain, options) {
        const executor = new TransformOperationExecutor_1.TransformOperationExecutor(enums_1.TransformationType.PLAIN_TO_CLASS, {
          ...default_options_constant_1.defaultOptions,
          ...options
        });
        return executor.transform(clsObject, plain, void 0, void 0, void 0, void 0);
      }
      instanceToInstance(object, options) {
        const executor = new TransformOperationExecutor_1.TransformOperationExecutor(enums_1.TransformationType.CLASS_TO_CLASS, {
          ...default_options_constant_1.defaultOptions,
          ...options
        });
        return executor.transform(void 0, object, void 0, void 0, void 0, void 0);
      }
      classToClassFromExist(object, fromObject, options) {
        const executor = new TransformOperationExecutor_1.TransformOperationExecutor(enums_1.TransformationType.CLASS_TO_CLASS, {
          ...default_options_constant_1.defaultOptions,
          ...options
        });
        return executor.transform(fromObject, object, void 0, void 0, void 0, void 0);
      }
      serialize(object, options) {
        return JSON.stringify(this.instanceToPlain(object, options));
      }
      /**
       * Deserializes given JSON string to a object of the given class.
       */
      deserialize(cls, json, options) {
        const jsonObject = JSON.parse(json);
        return this.plainToInstance(cls, jsonObject, options);
      }
      /**
       * Deserializes given JSON string to an array of objects of the given class.
       */
      deserializeArray(cls, json, options) {
        const jsonObject = JSON.parse(json);
        return this.plainToInstance(cls, jsonObject, options);
      }
    };
    exports.ClassTransformer = ClassTransformer;
  }
});

// node_modules/class-transformer/cjs/decorators/exclude.decorator.js
var require_exclude_decorator = __commonJS({
  "node_modules/class-transformer/cjs/decorators/exclude.decorator.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Exclude = void 0;
    var storage_1 = require_storage();
    function Exclude(options = {}) {
      return function(object, propertyName) {
        storage_1.defaultMetadataStorage.addExcludeMetadata({
          target: object instanceof Function ? object : object.constructor,
          propertyName,
          options
        });
      };
    }
    exports.Exclude = Exclude;
  }
});

// node_modules/class-transformer/cjs/decorators/expose.decorator.js
var require_expose_decorator = __commonJS({
  "node_modules/class-transformer/cjs/decorators/expose.decorator.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Expose = void 0;
    var storage_1 = require_storage();
    function Expose(options = {}) {
      return function(object, propertyName) {
        storage_1.defaultMetadataStorage.addExposeMetadata({
          target: object instanceof Function ? object : object.constructor,
          propertyName,
          options
        });
      };
    }
    exports.Expose = Expose;
  }
});

// node_modules/class-transformer/cjs/decorators/transform-instance-to-instance.decorator.js
var require_transform_instance_to_instance_decorator = __commonJS({
  "node_modules/class-transformer/cjs/decorators/transform-instance-to-instance.decorator.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.TransformInstanceToInstance = void 0;
    var ClassTransformer_1 = require_ClassTransformer();
    function TransformInstanceToInstance(params) {
      return function(target, propertyKey, descriptor) {
        const classTransformer = new ClassTransformer_1.ClassTransformer();
        const originalMethod = descriptor.value;
        descriptor.value = function(...args) {
          const result = originalMethod.apply(this, args);
          const isPromise = !!result && (typeof result === "object" || typeof result === "function") && typeof result.then === "function";
          return isPromise ? result.then((data) => classTransformer.instanceToInstance(data, params)) : classTransformer.instanceToInstance(result, params);
        };
      };
    }
    exports.TransformInstanceToInstance = TransformInstanceToInstance;
  }
});

// node_modules/class-transformer/cjs/decorators/transform-instance-to-plain.decorator.js
var require_transform_instance_to_plain_decorator = __commonJS({
  "node_modules/class-transformer/cjs/decorators/transform-instance-to-plain.decorator.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.TransformInstanceToPlain = void 0;
    var ClassTransformer_1 = require_ClassTransformer();
    function TransformInstanceToPlain(params) {
      return function(target, propertyKey, descriptor) {
        const classTransformer = new ClassTransformer_1.ClassTransformer();
        const originalMethod = descriptor.value;
        descriptor.value = function(...args) {
          const result = originalMethod.apply(this, args);
          const isPromise = !!result && (typeof result === "object" || typeof result === "function") && typeof result.then === "function";
          return isPromise ? result.then((data) => classTransformer.instanceToPlain(data, params)) : classTransformer.instanceToPlain(result, params);
        };
      };
    }
    exports.TransformInstanceToPlain = TransformInstanceToPlain;
  }
});

// node_modules/class-transformer/cjs/decorators/transform-plain-to-instance.decorator.js
var require_transform_plain_to_instance_decorator = __commonJS({
  "node_modules/class-transformer/cjs/decorators/transform-plain-to-instance.decorator.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.TransformPlainToInstance = void 0;
    var ClassTransformer_1 = require_ClassTransformer();
    function TransformPlainToInstance(classType, params) {
      return function(target, propertyKey, descriptor) {
        const classTransformer = new ClassTransformer_1.ClassTransformer();
        const originalMethod = descriptor.value;
        descriptor.value = function(...args) {
          const result = originalMethod.apply(this, args);
          const isPromise = !!result && (typeof result === "object" || typeof result === "function") && typeof result.then === "function";
          return isPromise ? result.then((data) => classTransformer.plainToInstance(classType, data, params)) : classTransformer.plainToInstance(classType, result, params);
        };
      };
    }
    exports.TransformPlainToInstance = TransformPlainToInstance;
  }
});

// node_modules/class-transformer/cjs/decorators/transform.decorator.js
var require_transform_decorator = __commonJS({
  "node_modules/class-transformer/cjs/decorators/transform.decorator.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Transform = void 0;
    var storage_1 = require_storage();
    function Transform(transformFn, options = {}) {
      return function(target, propertyName) {
        storage_1.defaultMetadataStorage.addTransformMetadata({
          target: target.constructor,
          propertyName,
          transformFn,
          options
        });
      };
    }
    exports.Transform = Transform;
  }
});

// node_modules/class-transformer/cjs/decorators/type.decorator.js
var require_type_decorator = __commonJS({
  "node_modules/class-transformer/cjs/decorators/type.decorator.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Type = void 0;
    var storage_1 = require_storage();
    function Type2(typeFunction, options = {}) {
      return function(target, propertyName) {
        const reflectedType = Reflect.getMetadata("design:type", target, propertyName);
        storage_1.defaultMetadataStorage.addTypeMetadata({
          target: target.constructor,
          propertyName,
          reflectedType,
          typeFunction,
          options
        });
      };
    }
    exports.Type = Type2;
  }
});

// node_modules/class-transformer/cjs/decorators/index.js
var require_decorators = __commonJS({
  "node_modules/class-transformer/cjs/decorators/index.js"(exports) {
    "use strict";
    var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      Object.defineProperty(o, k2, { enumerable: true, get: function() {
        return m[k];
      } });
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __exportStar = exports && exports.__exportStar || function(m, exports2) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p)) __createBinding(exports2, m, p);
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    __exportStar(require_exclude_decorator(), exports);
    __exportStar(require_expose_decorator(), exports);
    __exportStar(require_transform_instance_to_instance_decorator(), exports);
    __exportStar(require_transform_instance_to_plain_decorator(), exports);
    __exportStar(require_transform_plain_to_instance_decorator(), exports);
    __exportStar(require_transform_decorator(), exports);
    __exportStar(require_type_decorator(), exports);
  }
});

// node_modules/class-transformer/cjs/interfaces/decorator-options/expose-options.interface.js
var require_expose_options_interface = __commonJS({
  "node_modules/class-transformer/cjs/interfaces/decorator-options/expose-options.interface.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
  }
});

// node_modules/class-transformer/cjs/interfaces/decorator-options/exclude-options.interface.js
var require_exclude_options_interface = __commonJS({
  "node_modules/class-transformer/cjs/interfaces/decorator-options/exclude-options.interface.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
  }
});

// node_modules/class-transformer/cjs/interfaces/decorator-options/transform-options.interface.js
var require_transform_options_interface = __commonJS({
  "node_modules/class-transformer/cjs/interfaces/decorator-options/transform-options.interface.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
  }
});

// node_modules/class-transformer/cjs/interfaces/decorator-options/type-discriminator-descriptor.interface.js
var require_type_discriminator_descriptor_interface = __commonJS({
  "node_modules/class-transformer/cjs/interfaces/decorator-options/type-discriminator-descriptor.interface.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
  }
});

// node_modules/class-transformer/cjs/interfaces/decorator-options/type-options.interface.js
var require_type_options_interface = __commonJS({
  "node_modules/class-transformer/cjs/interfaces/decorator-options/type-options.interface.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
  }
});

// node_modules/class-transformer/cjs/interfaces/metadata/exclude-metadata.interface.js
var require_exclude_metadata_interface = __commonJS({
  "node_modules/class-transformer/cjs/interfaces/metadata/exclude-metadata.interface.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
  }
});

// node_modules/class-transformer/cjs/interfaces/metadata/expose-metadata.interface.js
var require_expose_metadata_interface = __commonJS({
  "node_modules/class-transformer/cjs/interfaces/metadata/expose-metadata.interface.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
  }
});

// node_modules/class-transformer/cjs/interfaces/metadata/transform-metadata.interface.js
var require_transform_metadata_interface = __commonJS({
  "node_modules/class-transformer/cjs/interfaces/metadata/transform-metadata.interface.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
  }
});

// node_modules/class-transformer/cjs/interfaces/metadata/transform-fn-params.interface.js
var require_transform_fn_params_interface = __commonJS({
  "node_modules/class-transformer/cjs/interfaces/metadata/transform-fn-params.interface.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
  }
});

// node_modules/class-transformer/cjs/interfaces/metadata/type-metadata.interface.js
var require_type_metadata_interface = __commonJS({
  "node_modules/class-transformer/cjs/interfaces/metadata/type-metadata.interface.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
  }
});

// node_modules/class-transformer/cjs/interfaces/class-constructor.type.js
var require_class_constructor_type = __commonJS({
  "node_modules/class-transformer/cjs/interfaces/class-constructor.type.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
  }
});

// node_modules/class-transformer/cjs/interfaces/class-transformer-options.interface.js
var require_class_transformer_options_interface = __commonJS({
  "node_modules/class-transformer/cjs/interfaces/class-transformer-options.interface.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
  }
});

// node_modules/class-transformer/cjs/interfaces/target-map.interface.js
var require_target_map_interface = __commonJS({
  "node_modules/class-transformer/cjs/interfaces/target-map.interface.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
  }
});

// node_modules/class-transformer/cjs/interfaces/type-help-options.interface.js
var require_type_help_options_interface = __commonJS({
  "node_modules/class-transformer/cjs/interfaces/type-help-options.interface.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
  }
});

// node_modules/class-transformer/cjs/interfaces/index.js
var require_interfaces = __commonJS({
  "node_modules/class-transformer/cjs/interfaces/index.js"(exports) {
    "use strict";
    var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      Object.defineProperty(o, k2, { enumerable: true, get: function() {
        return m[k];
      } });
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __exportStar = exports && exports.__exportStar || function(m, exports2) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p)) __createBinding(exports2, m, p);
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    __exportStar(require_expose_options_interface(), exports);
    __exportStar(require_exclude_options_interface(), exports);
    __exportStar(require_transform_options_interface(), exports);
    __exportStar(require_type_discriminator_descriptor_interface(), exports);
    __exportStar(require_type_options_interface(), exports);
    __exportStar(require_exclude_metadata_interface(), exports);
    __exportStar(require_expose_metadata_interface(), exports);
    __exportStar(require_transform_metadata_interface(), exports);
    __exportStar(require_transform_fn_params_interface(), exports);
    __exportStar(require_type_metadata_interface(), exports);
    __exportStar(require_class_constructor_type(), exports);
    __exportStar(require_class_transformer_options_interface(), exports);
    __exportStar(require_target_map_interface(), exports);
    __exportStar(require_type_help_options_interface(), exports);
  }
});

// node_modules/class-transformer/cjs/index.js
var require_cjs = __commonJS({
  "node_modules/class-transformer/cjs/index.js"(exports) {
    "use strict";
    var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      Object.defineProperty(o, k2, { enumerable: true, get: function() {
        return m[k];
      } });
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __exportStar = exports && exports.__exportStar || function(m, exports2) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p)) __createBinding(exports2, m, p);
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.deserializeArray = exports.deserialize = exports.serialize = exports.classToClassFromExist = exports.instanceToInstance = exports.plainToClassFromExist = exports.plainToInstance = exports.plainToClass = exports.classToPlainFromExist = exports.instanceToPlain = exports.classToPlain = exports.ClassTransformer = void 0;
    var ClassTransformer_1 = require_ClassTransformer();
    var ClassTransformer_2 = require_ClassTransformer();
    Object.defineProperty(exports, "ClassTransformer", { enumerable: true, get: function() {
      return ClassTransformer_2.ClassTransformer;
    } });
    __exportStar(require_decorators(), exports);
    __exportStar(require_interfaces(), exports);
    __exportStar(require_enums(), exports);
    var classTransformer = new ClassTransformer_1.ClassTransformer();
    function classToPlain(object, options) {
      return classTransformer.instanceToPlain(object, options);
    }
    exports.classToPlain = classToPlain;
    function instanceToPlain(object, options) {
      return classTransformer.instanceToPlain(object, options);
    }
    exports.instanceToPlain = instanceToPlain;
    function classToPlainFromExist(object, plainObject, options) {
      return classTransformer.classToPlainFromExist(object, plainObject, options);
    }
    exports.classToPlainFromExist = classToPlainFromExist;
    function plainToClass(cls, plain, options) {
      return classTransformer.plainToInstance(cls, plain, options);
    }
    exports.plainToClass = plainToClass;
    function plainToInstance(cls, plain, options) {
      return classTransformer.plainToInstance(cls, plain, options);
    }
    exports.plainToInstance = plainToInstance;
    function plainToClassFromExist(clsObject, plain, options) {
      return classTransformer.plainToClassFromExist(clsObject, plain, options);
    }
    exports.plainToClassFromExist = plainToClassFromExist;
    function instanceToInstance(object, options) {
      return classTransformer.instanceToInstance(object, options);
    }
    exports.instanceToInstance = instanceToInstance;
    function classToClassFromExist(object, fromObject, options) {
      return classTransformer.classToClassFromExist(object, fromObject, options);
    }
    exports.classToClassFromExist = classToClassFromExist;
    function serialize(object, options) {
      return classTransformer.serialize(object, options);
    }
    exports.serialize = serialize;
    function deserialize(cls, json, options) {
      return classTransformer.deserialize(cls, json, options);
    }
    exports.deserialize = deserialize;
    function deserializeArray(cls, json, options) {
      return classTransformer.deserializeArray(cls, json, options);
    }
    exports.deserializeArray = deserializeArray;
  }
});

// node_modules/reflect-metadata/Reflect.js
var require_Reflect = __commonJS({
  "node_modules/reflect-metadata/Reflect.js"() {
    var Reflect2;
    (function(Reflect3) {
      (function(factory) {
        var root = typeof globalThis === "object" ? globalThis : typeof global === "object" ? global : typeof self === "object" ? self : typeof this === "object" ? this : sloppyModeThis();
        var exporter = makeExporter(Reflect3);
        if (typeof root.Reflect !== "undefined") {
          exporter = makeExporter(root.Reflect, exporter);
        }
        factory(exporter, root);
        if (typeof root.Reflect === "undefined") {
          root.Reflect = Reflect3;
        }
        function makeExporter(target, previous) {
          return function(key, value) {
            Object.defineProperty(target, key, { configurable: true, writable: true, value });
            if (previous)
              previous(key, value);
          };
        }
        function functionThis() {
          try {
            return Function("return this;")();
          } catch (_) {
          }
        }
        function indirectEvalThis() {
          try {
            return (void 0, eval)("(function() { return this; })()");
          } catch (_) {
          }
        }
        function sloppyModeThis() {
          return functionThis() || indirectEvalThis();
        }
      })(function(exporter, root) {
        var hasOwn = Object.prototype.hasOwnProperty;
        var supportsSymbol = typeof Symbol === "function";
        var toPrimitiveSymbol = supportsSymbol && typeof Symbol.toPrimitive !== "undefined" ? Symbol.toPrimitive : "@@toPrimitive";
        var iteratorSymbol = supportsSymbol && typeof Symbol.iterator !== "undefined" ? Symbol.iterator : "@@iterator";
        var supportsCreate = typeof Object.create === "function";
        var supportsProto = { __proto__: [] } instanceof Array;
        var downLevel = !supportsCreate && !supportsProto;
        var HashMap = {
          // create an object in dictionary mode (a.k.a. "slow" mode in v8)
          create: supportsCreate ? function() {
            return MakeDictionary(/* @__PURE__ */ Object.create(null));
          } : supportsProto ? function() {
            return MakeDictionary({ __proto__: null });
          } : function() {
            return MakeDictionary({});
          },
          has: downLevel ? function(map, key) {
            return hasOwn.call(map, key);
          } : function(map, key) {
            return key in map;
          },
          get: downLevel ? function(map, key) {
            return hasOwn.call(map, key) ? map[key] : void 0;
          } : function(map, key) {
            return map[key];
          }
        };
        var functionPrototype = Object.getPrototypeOf(Function);
        var _Map = typeof Map === "function" && typeof Map.prototype.entries === "function" ? Map : CreateMapPolyfill();
        var _Set = typeof Set === "function" && typeof Set.prototype.entries === "function" ? Set : CreateSetPolyfill();
        var _WeakMap = typeof WeakMap === "function" ? WeakMap : CreateWeakMapPolyfill();
        var registrySymbol = supportsSymbol ? /* @__PURE__ */ Symbol.for("@reflect-metadata:registry") : void 0;
        var metadataRegistry = GetOrCreateMetadataRegistry();
        var metadataProvider = CreateMetadataProvider(metadataRegistry);
        function decorate(decorators, target, propertyKey, attributes) {
          if (!IsUndefined(propertyKey)) {
            if (!IsArray(decorators))
              throw new TypeError();
            if (!IsObject(target))
              throw new TypeError();
            if (!IsObject(attributes) && !IsUndefined(attributes) && !IsNull(attributes))
              throw new TypeError();
            if (IsNull(attributes))
              attributes = void 0;
            propertyKey = ToPropertyKey(propertyKey);
            return DecorateProperty(decorators, target, propertyKey, attributes);
          } else {
            if (!IsArray(decorators))
              throw new TypeError();
            if (!IsConstructor(target))
              throw new TypeError();
            return DecorateConstructor(decorators, target);
          }
        }
        exporter("decorate", decorate);
        function metadata(metadataKey, metadataValue) {
          function decorator(target, propertyKey) {
            if (!IsObject(target))
              throw new TypeError();
            if (!IsUndefined(propertyKey) && !IsPropertyKey(propertyKey))
              throw new TypeError();
            OrdinaryDefineOwnMetadata(metadataKey, metadataValue, target, propertyKey);
          }
          return decorator;
        }
        exporter("metadata", metadata);
        function defineMetadata(metadataKey, metadataValue, target, propertyKey) {
          if (!IsObject(target))
            throw new TypeError();
          if (!IsUndefined(propertyKey))
            propertyKey = ToPropertyKey(propertyKey);
          return OrdinaryDefineOwnMetadata(metadataKey, metadataValue, target, propertyKey);
        }
        exporter("defineMetadata", defineMetadata);
        function hasMetadata(metadataKey, target, propertyKey) {
          if (!IsObject(target))
            throw new TypeError();
          if (!IsUndefined(propertyKey))
            propertyKey = ToPropertyKey(propertyKey);
          return OrdinaryHasMetadata(metadataKey, target, propertyKey);
        }
        exporter("hasMetadata", hasMetadata);
        function hasOwnMetadata(metadataKey, target, propertyKey) {
          if (!IsObject(target))
            throw new TypeError();
          if (!IsUndefined(propertyKey))
            propertyKey = ToPropertyKey(propertyKey);
          return OrdinaryHasOwnMetadata(metadataKey, target, propertyKey);
        }
        exporter("hasOwnMetadata", hasOwnMetadata);
        function getMetadata(metadataKey, target, propertyKey) {
          if (!IsObject(target))
            throw new TypeError();
          if (!IsUndefined(propertyKey))
            propertyKey = ToPropertyKey(propertyKey);
          return OrdinaryGetMetadata(metadataKey, target, propertyKey);
        }
        exporter("getMetadata", getMetadata);
        function getOwnMetadata(metadataKey, target, propertyKey) {
          if (!IsObject(target))
            throw new TypeError();
          if (!IsUndefined(propertyKey))
            propertyKey = ToPropertyKey(propertyKey);
          return OrdinaryGetOwnMetadata(metadataKey, target, propertyKey);
        }
        exporter("getOwnMetadata", getOwnMetadata);
        function getMetadataKeys(target, propertyKey) {
          if (!IsObject(target))
            throw new TypeError();
          if (!IsUndefined(propertyKey))
            propertyKey = ToPropertyKey(propertyKey);
          return OrdinaryMetadataKeys(target, propertyKey);
        }
        exporter("getMetadataKeys", getMetadataKeys);
        function getOwnMetadataKeys(target, propertyKey) {
          if (!IsObject(target))
            throw new TypeError();
          if (!IsUndefined(propertyKey))
            propertyKey = ToPropertyKey(propertyKey);
          return OrdinaryOwnMetadataKeys(target, propertyKey);
        }
        exporter("getOwnMetadataKeys", getOwnMetadataKeys);
        function deleteMetadata(metadataKey, target, propertyKey) {
          if (!IsObject(target))
            throw new TypeError();
          if (!IsUndefined(propertyKey))
            propertyKey = ToPropertyKey(propertyKey);
          if (!IsObject(target))
            throw new TypeError();
          if (!IsUndefined(propertyKey))
            propertyKey = ToPropertyKey(propertyKey);
          var provider = GetMetadataProvider(
            target,
            propertyKey,
            /*Create*/
            false
          );
          if (IsUndefined(provider))
            return false;
          return provider.OrdinaryDeleteMetadata(metadataKey, target, propertyKey);
        }
        exporter("deleteMetadata", deleteMetadata);
        function DecorateConstructor(decorators, target) {
          for (var i = decorators.length - 1; i >= 0; --i) {
            var decorator = decorators[i];
            var decorated = decorator(target);
            if (!IsUndefined(decorated) && !IsNull(decorated)) {
              if (!IsConstructor(decorated))
                throw new TypeError();
              target = decorated;
            }
          }
          return target;
        }
        function DecorateProperty(decorators, target, propertyKey, descriptor) {
          for (var i = decorators.length - 1; i >= 0; --i) {
            var decorator = decorators[i];
            var decorated = decorator(target, propertyKey, descriptor);
            if (!IsUndefined(decorated) && !IsNull(decorated)) {
              if (!IsObject(decorated))
                throw new TypeError();
              descriptor = decorated;
            }
          }
          return descriptor;
        }
        function OrdinaryHasMetadata(MetadataKey, O, P) {
          var hasOwn2 = OrdinaryHasOwnMetadata(MetadataKey, O, P);
          if (hasOwn2)
            return true;
          var parent = OrdinaryGetPrototypeOf(O);
          if (!IsNull(parent))
            return OrdinaryHasMetadata(MetadataKey, parent, P);
          return false;
        }
        function OrdinaryHasOwnMetadata(MetadataKey, O, P) {
          var provider = GetMetadataProvider(
            O,
            P,
            /*Create*/
            false
          );
          if (IsUndefined(provider))
            return false;
          return ToBoolean(provider.OrdinaryHasOwnMetadata(MetadataKey, O, P));
        }
        function OrdinaryGetMetadata(MetadataKey, O, P) {
          var hasOwn2 = OrdinaryHasOwnMetadata(MetadataKey, O, P);
          if (hasOwn2)
            return OrdinaryGetOwnMetadata(MetadataKey, O, P);
          var parent = OrdinaryGetPrototypeOf(O);
          if (!IsNull(parent))
            return OrdinaryGetMetadata(MetadataKey, parent, P);
          return void 0;
        }
        function OrdinaryGetOwnMetadata(MetadataKey, O, P) {
          var provider = GetMetadataProvider(
            O,
            P,
            /*Create*/
            false
          );
          if (IsUndefined(provider))
            return;
          return provider.OrdinaryGetOwnMetadata(MetadataKey, O, P);
        }
        function OrdinaryDefineOwnMetadata(MetadataKey, MetadataValue, O, P) {
          var provider = GetMetadataProvider(
            O,
            P,
            /*Create*/
            true
          );
          provider.OrdinaryDefineOwnMetadata(MetadataKey, MetadataValue, O, P);
        }
        function OrdinaryMetadataKeys(O, P) {
          var ownKeys = OrdinaryOwnMetadataKeys(O, P);
          var parent = OrdinaryGetPrototypeOf(O);
          if (parent === null)
            return ownKeys;
          var parentKeys = OrdinaryMetadataKeys(parent, P);
          if (parentKeys.length <= 0)
            return ownKeys;
          if (ownKeys.length <= 0)
            return parentKeys;
          var set = new _Set();
          var keys = [];
          for (var _i = 0, ownKeys_1 = ownKeys; _i < ownKeys_1.length; _i++) {
            var key = ownKeys_1[_i];
            var hasKey = set.has(key);
            if (!hasKey) {
              set.add(key);
              keys.push(key);
            }
          }
          for (var _a = 0, parentKeys_1 = parentKeys; _a < parentKeys_1.length; _a++) {
            var key = parentKeys_1[_a];
            var hasKey = set.has(key);
            if (!hasKey) {
              set.add(key);
              keys.push(key);
            }
          }
          return keys;
        }
        function OrdinaryOwnMetadataKeys(O, P) {
          var provider = GetMetadataProvider(
            O,
            P,
            /*create*/
            false
          );
          if (!provider) {
            return [];
          }
          return provider.OrdinaryOwnMetadataKeys(O, P);
        }
        function Type2(x) {
          if (x === null)
            return 1;
          switch (typeof x) {
            case "undefined":
              return 0;
            case "boolean":
              return 2;
            case "string":
              return 3;
            case "symbol":
              return 4;
            case "number":
              return 5;
            case "object":
              return x === null ? 1 : 6;
            default:
              return 6;
          }
        }
        function IsUndefined(x) {
          return x === void 0;
        }
        function IsNull(x) {
          return x === null;
        }
        function IsSymbol(x) {
          return typeof x === "symbol";
        }
        function IsObject(x) {
          return typeof x === "object" ? x !== null : typeof x === "function";
        }
        function ToPrimitive(input, PreferredType) {
          switch (Type2(input)) {
            case 0:
              return input;
            case 1:
              return input;
            case 2:
              return input;
            case 3:
              return input;
            case 4:
              return input;
            case 5:
              return input;
          }
          var hint = PreferredType === 3 ? "string" : PreferredType === 5 ? "number" : "default";
          var exoticToPrim = GetMethod(input, toPrimitiveSymbol);
          if (exoticToPrim !== void 0) {
            var result = exoticToPrim.call(input, hint);
            if (IsObject(result))
              throw new TypeError();
            return result;
          }
          return OrdinaryToPrimitive(input, hint === "default" ? "number" : hint);
        }
        function OrdinaryToPrimitive(O, hint) {
          if (hint === "string") {
            var toString_1 = O.toString;
            if (IsCallable(toString_1)) {
              var result = toString_1.call(O);
              if (!IsObject(result))
                return result;
            }
            var valueOf = O.valueOf;
            if (IsCallable(valueOf)) {
              var result = valueOf.call(O);
              if (!IsObject(result))
                return result;
            }
          } else {
            var valueOf = O.valueOf;
            if (IsCallable(valueOf)) {
              var result = valueOf.call(O);
              if (!IsObject(result))
                return result;
            }
            var toString_2 = O.toString;
            if (IsCallable(toString_2)) {
              var result = toString_2.call(O);
              if (!IsObject(result))
                return result;
            }
          }
          throw new TypeError();
        }
        function ToBoolean(argument) {
          return !!argument;
        }
        function ToString(argument) {
          return "" + argument;
        }
        function ToPropertyKey(argument) {
          var key = ToPrimitive(
            argument,
            3
            /* String */
          );
          if (IsSymbol(key))
            return key;
          return ToString(key);
        }
        function IsArray(argument) {
          return Array.isArray ? Array.isArray(argument) : argument instanceof Object ? argument instanceof Array : Object.prototype.toString.call(argument) === "[object Array]";
        }
        function IsCallable(argument) {
          return typeof argument === "function";
        }
        function IsConstructor(argument) {
          return typeof argument === "function";
        }
        function IsPropertyKey(argument) {
          switch (Type2(argument)) {
            case 3:
              return true;
            case 4:
              return true;
            default:
              return false;
          }
        }
        function SameValueZero(x, y) {
          return x === y || x !== x && y !== y;
        }
        function GetMethod(V, P) {
          var func = V[P];
          if (func === void 0 || func === null)
            return void 0;
          if (!IsCallable(func))
            throw new TypeError();
          return func;
        }
        function GetIterator(obj) {
          var method = GetMethod(obj, iteratorSymbol);
          if (!IsCallable(method))
            throw new TypeError();
          var iterator = method.call(obj);
          if (!IsObject(iterator))
            throw new TypeError();
          return iterator;
        }
        function IteratorValue(iterResult) {
          return iterResult.value;
        }
        function IteratorStep(iterator) {
          var result = iterator.next();
          return result.done ? false : result;
        }
        function IteratorClose(iterator) {
          var f = iterator["return"];
          if (f)
            f.call(iterator);
        }
        function OrdinaryGetPrototypeOf(O) {
          var proto = Object.getPrototypeOf(O);
          if (typeof O !== "function" || O === functionPrototype)
            return proto;
          if (proto !== functionPrototype)
            return proto;
          var prototype = O.prototype;
          var prototypeProto = prototype && Object.getPrototypeOf(prototype);
          if (prototypeProto == null || prototypeProto === Object.prototype)
            return proto;
          var constructor = prototypeProto.constructor;
          if (typeof constructor !== "function")
            return proto;
          if (constructor === O)
            return proto;
          return constructor;
        }
        function CreateMetadataRegistry() {
          var fallback;
          if (!IsUndefined(registrySymbol) && typeof root.Reflect !== "undefined" && !(registrySymbol in root.Reflect) && typeof root.Reflect.defineMetadata === "function") {
            fallback = CreateFallbackProvider(root.Reflect);
          }
          var first;
          var second;
          var rest;
          var targetProviderMap = new _WeakMap();
          var registry = {
            registerProvider,
            getProvider,
            setProvider
          };
          return registry;
          function registerProvider(provider) {
            if (!Object.isExtensible(registry)) {
              throw new Error("Cannot add provider to a frozen registry.");
            }
            switch (true) {
              case fallback === provider:
                break;
              case IsUndefined(first):
                first = provider;
                break;
              case first === provider:
                break;
              case IsUndefined(second):
                second = provider;
                break;
              case second === provider:
                break;
              default:
                if (rest === void 0)
                  rest = new _Set();
                rest.add(provider);
                break;
            }
          }
          function getProviderNoCache(O, P) {
            if (!IsUndefined(first)) {
              if (first.isProviderFor(O, P))
                return first;
              if (!IsUndefined(second)) {
                if (second.isProviderFor(O, P))
                  return first;
                if (!IsUndefined(rest)) {
                  var iterator = GetIterator(rest);
                  while (true) {
                    var next = IteratorStep(iterator);
                    if (!next) {
                      return void 0;
                    }
                    var provider = IteratorValue(next);
                    if (provider.isProviderFor(O, P)) {
                      IteratorClose(iterator);
                      return provider;
                    }
                  }
                }
              }
            }
            if (!IsUndefined(fallback) && fallback.isProviderFor(O, P)) {
              return fallback;
            }
            return void 0;
          }
          function getProvider(O, P) {
            var providerMap = targetProviderMap.get(O);
            var provider;
            if (!IsUndefined(providerMap)) {
              provider = providerMap.get(P);
            }
            if (!IsUndefined(provider)) {
              return provider;
            }
            provider = getProviderNoCache(O, P);
            if (!IsUndefined(provider)) {
              if (IsUndefined(providerMap)) {
                providerMap = new _Map();
                targetProviderMap.set(O, providerMap);
              }
              providerMap.set(P, provider);
            }
            return provider;
          }
          function hasProvider(provider) {
            if (IsUndefined(provider))
              throw new TypeError();
            return first === provider || second === provider || !IsUndefined(rest) && rest.has(provider);
          }
          function setProvider(O, P, provider) {
            if (!hasProvider(provider)) {
              throw new Error("Metadata provider not registered.");
            }
            var existingProvider = getProvider(O, P);
            if (existingProvider !== provider) {
              if (!IsUndefined(existingProvider)) {
                return false;
              }
              var providerMap = targetProviderMap.get(O);
              if (IsUndefined(providerMap)) {
                providerMap = new _Map();
                targetProviderMap.set(O, providerMap);
              }
              providerMap.set(P, provider);
            }
            return true;
          }
        }
        function GetOrCreateMetadataRegistry() {
          var metadataRegistry2;
          if (!IsUndefined(registrySymbol) && IsObject(root.Reflect) && Object.isExtensible(root.Reflect)) {
            metadataRegistry2 = root.Reflect[registrySymbol];
          }
          if (IsUndefined(metadataRegistry2)) {
            metadataRegistry2 = CreateMetadataRegistry();
          }
          if (!IsUndefined(registrySymbol) && IsObject(root.Reflect) && Object.isExtensible(root.Reflect)) {
            Object.defineProperty(root.Reflect, registrySymbol, {
              enumerable: false,
              configurable: false,
              writable: false,
              value: metadataRegistry2
            });
          }
          return metadataRegistry2;
        }
        function CreateMetadataProvider(registry) {
          var metadata2 = new _WeakMap();
          var provider = {
            isProviderFor: function(O, P) {
              var targetMetadata = metadata2.get(O);
              if (IsUndefined(targetMetadata))
                return false;
              return targetMetadata.has(P);
            },
            OrdinaryDefineOwnMetadata: OrdinaryDefineOwnMetadata2,
            OrdinaryHasOwnMetadata: OrdinaryHasOwnMetadata2,
            OrdinaryGetOwnMetadata: OrdinaryGetOwnMetadata2,
            OrdinaryOwnMetadataKeys: OrdinaryOwnMetadataKeys2,
            OrdinaryDeleteMetadata
          };
          metadataRegistry.registerProvider(provider);
          return provider;
          function GetOrCreateMetadataMap(O, P, Create) {
            var targetMetadata = metadata2.get(O);
            var createdTargetMetadata = false;
            if (IsUndefined(targetMetadata)) {
              if (!Create)
                return void 0;
              targetMetadata = new _Map();
              metadata2.set(O, targetMetadata);
              createdTargetMetadata = true;
            }
            var metadataMap = targetMetadata.get(P);
            if (IsUndefined(metadataMap)) {
              if (!Create)
                return void 0;
              metadataMap = new _Map();
              targetMetadata.set(P, metadataMap);
              if (!registry.setProvider(O, P, provider)) {
                targetMetadata.delete(P);
                if (createdTargetMetadata) {
                  metadata2.delete(O);
                }
                throw new Error("Wrong provider for target.");
              }
            }
            return metadataMap;
          }
          function OrdinaryHasOwnMetadata2(MetadataKey, O, P) {
            var metadataMap = GetOrCreateMetadataMap(
              O,
              P,
              /*Create*/
              false
            );
            if (IsUndefined(metadataMap))
              return false;
            return ToBoolean(metadataMap.has(MetadataKey));
          }
          function OrdinaryGetOwnMetadata2(MetadataKey, O, P) {
            var metadataMap = GetOrCreateMetadataMap(
              O,
              P,
              /*Create*/
              false
            );
            if (IsUndefined(metadataMap))
              return void 0;
            return metadataMap.get(MetadataKey);
          }
          function OrdinaryDefineOwnMetadata2(MetadataKey, MetadataValue, O, P) {
            var metadataMap = GetOrCreateMetadataMap(
              O,
              P,
              /*Create*/
              true
            );
            metadataMap.set(MetadataKey, MetadataValue);
          }
          function OrdinaryOwnMetadataKeys2(O, P) {
            var keys = [];
            var metadataMap = GetOrCreateMetadataMap(
              O,
              P,
              /*Create*/
              false
            );
            if (IsUndefined(metadataMap))
              return keys;
            var keysObj = metadataMap.keys();
            var iterator = GetIterator(keysObj);
            var k = 0;
            while (true) {
              var next = IteratorStep(iterator);
              if (!next) {
                keys.length = k;
                return keys;
              }
              var nextValue = IteratorValue(next);
              try {
                keys[k] = nextValue;
              } catch (e) {
                try {
                  IteratorClose(iterator);
                } finally {
                  throw e;
                }
              }
              k++;
            }
          }
          function OrdinaryDeleteMetadata(MetadataKey, O, P) {
            var metadataMap = GetOrCreateMetadataMap(
              O,
              P,
              /*Create*/
              false
            );
            if (IsUndefined(metadataMap))
              return false;
            if (!metadataMap.delete(MetadataKey))
              return false;
            if (metadataMap.size === 0) {
              var targetMetadata = metadata2.get(O);
              if (!IsUndefined(targetMetadata)) {
                targetMetadata.delete(P);
                if (targetMetadata.size === 0) {
                  metadata2.delete(targetMetadata);
                }
              }
            }
            return true;
          }
        }
        function CreateFallbackProvider(reflect) {
          var defineMetadata2 = reflect.defineMetadata, hasOwnMetadata2 = reflect.hasOwnMetadata, getOwnMetadata2 = reflect.getOwnMetadata, getOwnMetadataKeys2 = reflect.getOwnMetadataKeys, deleteMetadata2 = reflect.deleteMetadata;
          var metadataOwner = new _WeakMap();
          var provider = {
            isProviderFor: function(O, P) {
              var metadataPropertySet = metadataOwner.get(O);
              if (!IsUndefined(metadataPropertySet) && metadataPropertySet.has(P)) {
                return true;
              }
              if (getOwnMetadataKeys2(O, P).length) {
                if (IsUndefined(metadataPropertySet)) {
                  metadataPropertySet = new _Set();
                  metadataOwner.set(O, metadataPropertySet);
                }
                metadataPropertySet.add(P);
                return true;
              }
              return false;
            },
            OrdinaryDefineOwnMetadata: defineMetadata2,
            OrdinaryHasOwnMetadata: hasOwnMetadata2,
            OrdinaryGetOwnMetadata: getOwnMetadata2,
            OrdinaryOwnMetadataKeys: getOwnMetadataKeys2,
            OrdinaryDeleteMetadata: deleteMetadata2
          };
          return provider;
        }
        function GetMetadataProvider(O, P, Create) {
          var registeredProvider = metadataRegistry.getProvider(O, P);
          if (!IsUndefined(registeredProvider)) {
            return registeredProvider;
          }
          if (Create) {
            if (metadataRegistry.setProvider(O, P, metadataProvider)) {
              return metadataProvider;
            }
            throw new Error("Illegal state.");
          }
          return void 0;
        }
        function CreateMapPolyfill() {
          var cacheSentinel = {};
          var arraySentinel = [];
          var MapIterator = (
            /** @class */
            (function() {
              function MapIterator2(keys, values, selector) {
                this._index = 0;
                this._keys = keys;
                this._values = values;
                this._selector = selector;
              }
              MapIterator2.prototype["@@iterator"] = function() {
                return this;
              };
              MapIterator2.prototype[iteratorSymbol] = function() {
                return this;
              };
              MapIterator2.prototype.next = function() {
                var index = this._index;
                if (index >= 0 && index < this._keys.length) {
                  var result = this._selector(this._keys[index], this._values[index]);
                  if (index + 1 >= this._keys.length) {
                    this._index = -1;
                    this._keys = arraySentinel;
                    this._values = arraySentinel;
                  } else {
                    this._index++;
                  }
                  return { value: result, done: false };
                }
                return { value: void 0, done: true };
              };
              MapIterator2.prototype.throw = function(error) {
                if (this._index >= 0) {
                  this._index = -1;
                  this._keys = arraySentinel;
                  this._values = arraySentinel;
                }
                throw error;
              };
              MapIterator2.prototype.return = function(value) {
                if (this._index >= 0) {
                  this._index = -1;
                  this._keys = arraySentinel;
                  this._values = arraySentinel;
                }
                return { value, done: true };
              };
              return MapIterator2;
            })()
          );
          var Map2 = (
            /** @class */
            (function() {
              function Map3() {
                this._keys = [];
                this._values = [];
                this._cacheKey = cacheSentinel;
                this._cacheIndex = -2;
              }
              Object.defineProperty(Map3.prototype, "size", {
                get: function() {
                  return this._keys.length;
                },
                enumerable: true,
                configurable: true
              });
              Map3.prototype.has = function(key) {
                return this._find(
                  key,
                  /*insert*/
                  false
                ) >= 0;
              };
              Map3.prototype.get = function(key) {
                var index = this._find(
                  key,
                  /*insert*/
                  false
                );
                return index >= 0 ? this._values[index] : void 0;
              };
              Map3.prototype.set = function(key, value) {
                var index = this._find(
                  key,
                  /*insert*/
                  true
                );
                this._values[index] = value;
                return this;
              };
              Map3.prototype.delete = function(key) {
                var index = this._find(
                  key,
                  /*insert*/
                  false
                );
                if (index >= 0) {
                  var size = this._keys.length;
                  for (var i = index + 1; i < size; i++) {
                    this._keys[i - 1] = this._keys[i];
                    this._values[i - 1] = this._values[i];
                  }
                  this._keys.length--;
                  this._values.length--;
                  if (SameValueZero(key, this._cacheKey)) {
                    this._cacheKey = cacheSentinel;
                    this._cacheIndex = -2;
                  }
                  return true;
                }
                return false;
              };
              Map3.prototype.clear = function() {
                this._keys.length = 0;
                this._values.length = 0;
                this._cacheKey = cacheSentinel;
                this._cacheIndex = -2;
              };
              Map3.prototype.keys = function() {
                return new MapIterator(this._keys, this._values, getKey);
              };
              Map3.prototype.values = function() {
                return new MapIterator(this._keys, this._values, getValue);
              };
              Map3.prototype.entries = function() {
                return new MapIterator(this._keys, this._values, getEntry);
              };
              Map3.prototype["@@iterator"] = function() {
                return this.entries();
              };
              Map3.prototype[iteratorSymbol] = function() {
                return this.entries();
              };
              Map3.prototype._find = function(key, insert) {
                if (!SameValueZero(this._cacheKey, key)) {
                  this._cacheIndex = -1;
                  for (var i = 0; i < this._keys.length; i++) {
                    if (SameValueZero(this._keys[i], key)) {
                      this._cacheIndex = i;
                      break;
                    }
                  }
                }
                if (this._cacheIndex < 0 && insert) {
                  this._cacheIndex = this._keys.length;
                  this._keys.push(key);
                  this._values.push(void 0);
                }
                return this._cacheIndex;
              };
              return Map3;
            })()
          );
          return Map2;
          function getKey(key, _) {
            return key;
          }
          function getValue(_, value) {
            return value;
          }
          function getEntry(key, value) {
            return [key, value];
          }
        }
        function CreateSetPolyfill() {
          var Set2 = (
            /** @class */
            (function() {
              function Set3() {
                this._map = new _Map();
              }
              Object.defineProperty(Set3.prototype, "size", {
                get: function() {
                  return this._map.size;
                },
                enumerable: true,
                configurable: true
              });
              Set3.prototype.has = function(value) {
                return this._map.has(value);
              };
              Set3.prototype.add = function(value) {
                return this._map.set(value, value), this;
              };
              Set3.prototype.delete = function(value) {
                return this._map.delete(value);
              };
              Set3.prototype.clear = function() {
                this._map.clear();
              };
              Set3.prototype.keys = function() {
                return this._map.keys();
              };
              Set3.prototype.values = function() {
                return this._map.keys();
              };
              Set3.prototype.entries = function() {
                return this._map.entries();
              };
              Set3.prototype["@@iterator"] = function() {
                return this.keys();
              };
              Set3.prototype[iteratorSymbol] = function() {
                return this.keys();
              };
              return Set3;
            })()
          );
          return Set2;
        }
        function CreateWeakMapPolyfill() {
          var UUID_SIZE = 16;
          var keys = HashMap.create();
          var rootKey = CreateUniqueKey();
          return (
            /** @class */
            (function() {
              function WeakMap2() {
                this._key = CreateUniqueKey();
              }
              WeakMap2.prototype.has = function(target) {
                var table = GetOrCreateWeakMapTable(
                  target,
                  /*create*/
                  false
                );
                return table !== void 0 ? HashMap.has(table, this._key) : false;
              };
              WeakMap2.prototype.get = function(target) {
                var table = GetOrCreateWeakMapTable(
                  target,
                  /*create*/
                  false
                );
                return table !== void 0 ? HashMap.get(table, this._key) : void 0;
              };
              WeakMap2.prototype.set = function(target, value) {
                var table = GetOrCreateWeakMapTable(
                  target,
                  /*create*/
                  true
                );
                table[this._key] = value;
                return this;
              };
              WeakMap2.prototype.delete = function(target) {
                var table = GetOrCreateWeakMapTable(
                  target,
                  /*create*/
                  false
                );
                return table !== void 0 ? delete table[this._key] : false;
              };
              WeakMap2.prototype.clear = function() {
                this._key = CreateUniqueKey();
              };
              return WeakMap2;
            })()
          );
          function CreateUniqueKey() {
            var key;
            do
              key = "@@WeakMap@@" + CreateUUID();
            while (HashMap.has(keys, key));
            keys[key] = true;
            return key;
          }
          function GetOrCreateWeakMapTable(target, create) {
            if (!hasOwn.call(target, rootKey)) {
              if (!create)
                return void 0;
              Object.defineProperty(target, rootKey, { value: HashMap.create() });
            }
            return target[rootKey];
          }
          function FillRandomBytes(buffer, size) {
            for (var i = 0; i < size; ++i)
              buffer[i] = Math.random() * 255 | 0;
            return buffer;
          }
          function GenRandomBytes(size) {
            if (typeof Uint8Array === "function") {
              var array = new Uint8Array(size);
              if (typeof crypto !== "undefined") {
                crypto.getRandomValues(array);
              } else if (typeof msCrypto !== "undefined") {
                msCrypto.getRandomValues(array);
              } else {
                FillRandomBytes(array, size);
              }
              return array;
            }
            return FillRandomBytes(new Array(size), size);
          }
          function CreateUUID() {
            var data = GenRandomBytes(UUID_SIZE);
            data[6] = data[6] & 79 | 64;
            data[8] = data[8] & 191 | 128;
            var result = "";
            for (var offset = 0; offset < UUID_SIZE; ++offset) {
              var byte = data[offset];
              if (offset === 4 || offset === 6 || offset === 8)
                result += "-";
              if (byte < 16)
                result += "0";
              result += byte.toString(16).toLowerCase();
            }
            return result;
          }
        }
        function MakeDictionary(obj) {
          obj.__ = void 0;
          delete obj.__;
          return obj;
        }
      });
    })(Reflect2 || (Reflect2 = {}));
  }
});

// node_modules/@cucumber/messages/dist/cjs/src/messages.js
var require_messages = __commonJS({
  "node_modules/@cucumber/messages/dist/cjs/src/messages.js"(exports) {
    "use strict";
    var __decorate2 = exports && exports.__decorate || function(decorators, target, key, desc) {
      var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
      if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
      else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
      return c > 3 && r && Object.defineProperty(target, key, r), r;
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.TestCaseFinished = exports.TestStep = exports.StepMatchArgumentsList = exports.StepMatchArgument = exports.Group = exports.TestCase = exports.Snippet = exports.Suggestion = exports.StepDefinitionPattern = exports.StepDefinition = exports.JavaStackTraceElement = exports.JavaMethod = exports.SourceReference = exports.Source = exports.PickleTag = exports.PickleTableRow = exports.PickleTableCell = exports.PickleTable = exports.PickleStepArgument = exports.PickleStep = exports.PickleDocString = exports.Pickle = exports.ParseError = exports.ParameterType = exports.Product = exports.Git = exports.Ci = exports.Meta = exports.Location = exports.Hook = exports.Tag = exports.TableRow = exports.TableCell = exports.Step = exports.Scenario = exports.RuleChild = exports.Rule = exports.FeatureChild = exports.Feature = exports.Examples = exports.DocString = exports.DataTable = exports.Comment = exports.Background = exports.GherkinDocument = exports.ExternalAttachment = exports.Exception = exports.Envelope = exports.Duration = exports.Attachment = void 0;
    exports.TestStepResultStatus = exports.StepKeywordType = exports.StepDefinitionPatternType = exports.SourceMediaType = exports.PickleStepType = exports.HookType = exports.AttachmentContentEncoding = exports.UndefinedParameterType = exports.Timestamp = exports.TestStepStarted = exports.TestStepResult = exports.TestStepFinished = exports.TestRunStarted = exports.TestRunHookStarted = exports.TestRunHookFinished = exports.TestRunFinished = exports.TestCaseStarted = void 0;
    var class_transformer_1 = require_cjs();
    require_Reflect();
    var Attachment2 = (
      /** @class */
      (function() {
        function Attachment3() {
          this.body = "";
          this.contentEncoding = AttachmentContentEncoding2.IDENTITY;
          this.mediaType = "";
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Source2;
          })
        ], Attachment3.prototype, "source", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Timestamp2;
          })
        ], Attachment3.prototype, "timestamp", void 0);
        return Attachment3;
      })()
    );
    exports.Attachment = Attachment2;
    var Duration2 = (
      /** @class */
      /* @__PURE__ */ (function() {
        function Duration3() {
          this.seconds = 0;
          this.nanos = 0;
        }
        return Duration3;
      })()
    );
    exports.Duration = Duration2;
    var Envelope2 = (
      /** @class */
      (function() {
        function Envelope3() {
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Attachment2;
          })
        ], Envelope3.prototype, "attachment", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return ExternalAttachment2;
          })
        ], Envelope3.prototype, "externalAttachment", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return GherkinDocument2;
          })
        ], Envelope3.prototype, "gherkinDocument", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Hook2;
          })
        ], Envelope3.prototype, "hook", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Meta2;
          })
        ], Envelope3.prototype, "meta", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return ParameterType2;
          })
        ], Envelope3.prototype, "parameterType", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return ParseError2;
          })
        ], Envelope3.prototype, "parseError", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Pickle2;
          })
        ], Envelope3.prototype, "pickle", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Suggestion2;
          })
        ], Envelope3.prototype, "suggestion", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Source2;
          })
        ], Envelope3.prototype, "source", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return StepDefinition2;
          })
        ], Envelope3.prototype, "stepDefinition", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return TestCase2;
          })
        ], Envelope3.prototype, "testCase", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return TestCaseFinished2;
          })
        ], Envelope3.prototype, "testCaseFinished", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return TestCaseStarted2;
          })
        ], Envelope3.prototype, "testCaseStarted", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return TestRunFinished2;
          })
        ], Envelope3.prototype, "testRunFinished", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return TestRunStarted2;
          })
        ], Envelope3.prototype, "testRunStarted", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return TestStepFinished2;
          })
        ], Envelope3.prototype, "testStepFinished", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return TestStepStarted2;
          })
        ], Envelope3.prototype, "testStepStarted", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return TestRunHookStarted2;
          })
        ], Envelope3.prototype, "testRunHookStarted", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return TestRunHookFinished2;
          })
        ], Envelope3.prototype, "testRunHookFinished", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return UndefinedParameterType2;
          })
        ], Envelope3.prototype, "undefinedParameterType", void 0);
        return Envelope3;
      })()
    );
    exports.Envelope = Envelope2;
    var Exception2 = (
      /** @class */
      /* @__PURE__ */ (function() {
        function Exception3() {
          this.type = "";
        }
        return Exception3;
      })()
    );
    exports.Exception = Exception2;
    var ExternalAttachment2 = (
      /** @class */
      (function() {
        function ExternalAttachment3() {
          this.url = "";
          this.mediaType = "";
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Timestamp2;
          })
        ], ExternalAttachment3.prototype, "timestamp", void 0);
        return ExternalAttachment3;
      })()
    );
    exports.ExternalAttachment = ExternalAttachment2;
    var GherkinDocument2 = (
      /** @class */
      (function() {
        function GherkinDocument3() {
          this.comments = [];
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Feature2;
          })
        ], GherkinDocument3.prototype, "feature", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Comment2;
          })
        ], GherkinDocument3.prototype, "comments", void 0);
        return GherkinDocument3;
      })()
    );
    exports.GherkinDocument = GherkinDocument2;
    var Background2 = (
      /** @class */
      (function() {
        function Background3() {
          this.location = new Location2();
          this.keyword = "";
          this.name = "";
          this.description = "";
          this.steps = [];
          this.id = "";
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Location2;
          })
        ], Background3.prototype, "location", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Step2;
          })
        ], Background3.prototype, "steps", void 0);
        return Background3;
      })()
    );
    exports.Background = Background2;
    var Comment2 = (
      /** @class */
      (function() {
        function Comment3() {
          this.location = new Location2();
          this.text = "";
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Location2;
          })
        ], Comment3.prototype, "location", void 0);
        return Comment3;
      })()
    );
    exports.Comment = Comment2;
    var DataTable2 = (
      /** @class */
      (function() {
        function DataTable3() {
          this.location = new Location2();
          this.rows = [];
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Location2;
          })
        ], DataTable3.prototype, "location", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return TableRow2;
          })
        ], DataTable3.prototype, "rows", void 0);
        return DataTable3;
      })()
    );
    exports.DataTable = DataTable2;
    var DocString2 = (
      /** @class */
      (function() {
        function DocString3() {
          this.location = new Location2();
          this.content = "";
          this.delimiter = "";
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Location2;
          })
        ], DocString3.prototype, "location", void 0);
        return DocString3;
      })()
    );
    exports.DocString = DocString2;
    var Examples2 = (
      /** @class */
      (function() {
        function Examples3() {
          this.location = new Location2();
          this.tags = [];
          this.keyword = "";
          this.name = "";
          this.description = "";
          this.tableBody = [];
          this.id = "";
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Location2;
          })
        ], Examples3.prototype, "location", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Tag2;
          })
        ], Examples3.prototype, "tags", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return TableRow2;
          })
        ], Examples3.prototype, "tableHeader", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return TableRow2;
          })
        ], Examples3.prototype, "tableBody", void 0);
        return Examples3;
      })()
    );
    exports.Examples = Examples2;
    var Feature2 = (
      /** @class */
      (function() {
        function Feature3() {
          this.location = new Location2();
          this.tags = [];
          this.language = "";
          this.keyword = "";
          this.name = "";
          this.description = "";
          this.children = [];
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Location2;
          })
        ], Feature3.prototype, "location", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Tag2;
          })
        ], Feature3.prototype, "tags", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return FeatureChild2;
          })
        ], Feature3.prototype, "children", void 0);
        return Feature3;
      })()
    );
    exports.Feature = Feature2;
    var FeatureChild2 = (
      /** @class */
      (function() {
        function FeatureChild3() {
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Rule2;
          })
        ], FeatureChild3.prototype, "rule", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Background2;
          })
        ], FeatureChild3.prototype, "background", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Scenario2;
          })
        ], FeatureChild3.prototype, "scenario", void 0);
        return FeatureChild3;
      })()
    );
    exports.FeatureChild = FeatureChild2;
    var Rule2 = (
      /** @class */
      (function() {
        function Rule3() {
          this.location = new Location2();
          this.tags = [];
          this.keyword = "";
          this.name = "";
          this.description = "";
          this.children = [];
          this.id = "";
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Location2;
          })
        ], Rule3.prototype, "location", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Tag2;
          })
        ], Rule3.prototype, "tags", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return RuleChild2;
          })
        ], Rule3.prototype, "children", void 0);
        return Rule3;
      })()
    );
    exports.Rule = Rule2;
    var RuleChild2 = (
      /** @class */
      (function() {
        function RuleChild3() {
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Background2;
          })
        ], RuleChild3.prototype, "background", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Scenario2;
          })
        ], RuleChild3.prototype, "scenario", void 0);
        return RuleChild3;
      })()
    );
    exports.RuleChild = RuleChild2;
    var Scenario2 = (
      /** @class */
      (function() {
        function Scenario3() {
          this.location = new Location2();
          this.tags = [];
          this.keyword = "";
          this.name = "";
          this.description = "";
          this.steps = [];
          this.examples = [];
          this.id = "";
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Location2;
          })
        ], Scenario3.prototype, "location", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Tag2;
          })
        ], Scenario3.prototype, "tags", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Step2;
          })
        ], Scenario3.prototype, "steps", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Examples2;
          })
        ], Scenario3.prototype, "examples", void 0);
        return Scenario3;
      })()
    );
    exports.Scenario = Scenario2;
    var Step2 = (
      /** @class */
      (function() {
        function Step3() {
          this.location = new Location2();
          this.keyword = "";
          this.text = "";
          this.id = "";
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Location2;
          })
        ], Step3.prototype, "location", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return DocString2;
          })
        ], Step3.prototype, "docString", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return DataTable2;
          })
        ], Step3.prototype, "dataTable", void 0);
        return Step3;
      })()
    );
    exports.Step = Step2;
    var TableCell2 = (
      /** @class */
      (function() {
        function TableCell3() {
          this.location = new Location2();
          this.value = "";
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Location2;
          })
        ], TableCell3.prototype, "location", void 0);
        return TableCell3;
      })()
    );
    exports.TableCell = TableCell2;
    var TableRow2 = (
      /** @class */
      (function() {
        function TableRow3() {
          this.location = new Location2();
          this.cells = [];
          this.id = "";
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Location2;
          })
        ], TableRow3.prototype, "location", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return TableCell2;
          })
        ], TableRow3.prototype, "cells", void 0);
        return TableRow3;
      })()
    );
    exports.TableRow = TableRow2;
    var Tag2 = (
      /** @class */
      (function() {
        function Tag3() {
          this.location = new Location2();
          this.name = "";
          this.id = "";
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Location2;
          })
        ], Tag3.prototype, "location", void 0);
        return Tag3;
      })()
    );
    exports.Tag = Tag2;
    var Hook2 = (
      /** @class */
      (function() {
        function Hook3() {
          this.id = "";
          this.sourceReference = new SourceReference2();
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return SourceReference2;
          })
        ], Hook3.prototype, "sourceReference", void 0);
        return Hook3;
      })()
    );
    exports.Hook = Hook2;
    var Location2 = (
      /** @class */
      /* @__PURE__ */ (function() {
        function Location3() {
          this.line = 0;
        }
        return Location3;
      })()
    );
    exports.Location = Location2;
    var Meta2 = (
      /** @class */
      (function() {
        function Meta3() {
          this.protocolVersion = "";
          this.implementation = new Product2();
          this.runtime = new Product2();
          this.os = new Product2();
          this.cpu = new Product2();
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Product2;
          })
        ], Meta3.prototype, "implementation", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Product2;
          })
        ], Meta3.prototype, "runtime", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Product2;
          })
        ], Meta3.prototype, "os", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Product2;
          })
        ], Meta3.prototype, "cpu", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Ci2;
          })
        ], Meta3.prototype, "ci", void 0);
        return Meta3;
      })()
    );
    exports.Meta = Meta2;
    var Ci2 = (
      /** @class */
      (function() {
        function Ci3() {
          this.name = "";
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Git2;
          })
        ], Ci3.prototype, "git", void 0);
        return Ci3;
      })()
    );
    exports.Ci = Ci2;
    var Git2 = (
      /** @class */
      /* @__PURE__ */ (function() {
        function Git3() {
          this.remote = "";
          this.revision = "";
        }
        return Git3;
      })()
    );
    exports.Git = Git2;
    var Product2 = (
      /** @class */
      /* @__PURE__ */ (function() {
        function Product3() {
          this.name = "";
        }
        return Product3;
      })()
    );
    exports.Product = Product2;
    var ParameterType2 = (
      /** @class */
      (function() {
        function ParameterType3() {
          this.name = "";
          this.regularExpressions = [];
          this.preferForRegularExpressionMatch = false;
          this.useForSnippets = false;
          this.id = "";
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return SourceReference2;
          })
        ], ParameterType3.prototype, "sourceReference", void 0);
        return ParameterType3;
      })()
    );
    exports.ParameterType = ParameterType2;
    var ParseError2 = (
      /** @class */
      (function() {
        function ParseError3() {
          this.source = new SourceReference2();
          this.message = "";
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return SourceReference2;
          })
        ], ParseError3.prototype, "source", void 0);
        return ParseError3;
      })()
    );
    exports.ParseError = ParseError2;
    var Pickle2 = (
      /** @class */
      (function() {
        function Pickle3() {
          this.id = "";
          this.uri = "";
          this.name = "";
          this.language = "";
          this.steps = [];
          this.tags = [];
          this.astNodeIds = [];
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Location2;
          })
        ], Pickle3.prototype, "location", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return PickleStep2;
          })
        ], Pickle3.prototype, "steps", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return PickleTag2;
          })
        ], Pickle3.prototype, "tags", void 0);
        return Pickle3;
      })()
    );
    exports.Pickle = Pickle2;
    var PickleDocString2 = (
      /** @class */
      /* @__PURE__ */ (function() {
        function PickleDocString3() {
          this.content = "";
        }
        return PickleDocString3;
      })()
    );
    exports.PickleDocString = PickleDocString2;
    var PickleStep2 = (
      /** @class */
      (function() {
        function PickleStep3() {
          this.astNodeIds = [];
          this.id = "";
          this.text = "";
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return PickleStepArgument2;
          })
        ], PickleStep3.prototype, "argument", void 0);
        return PickleStep3;
      })()
    );
    exports.PickleStep = PickleStep2;
    var PickleStepArgument2 = (
      /** @class */
      (function() {
        function PickleStepArgument3() {
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return PickleDocString2;
          })
        ], PickleStepArgument3.prototype, "docString", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return PickleTable2;
          })
        ], PickleStepArgument3.prototype, "dataTable", void 0);
        return PickleStepArgument3;
      })()
    );
    exports.PickleStepArgument = PickleStepArgument2;
    var PickleTable2 = (
      /** @class */
      (function() {
        function PickleTable3() {
          this.rows = [];
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return PickleTableRow2;
          })
        ], PickleTable3.prototype, "rows", void 0);
        return PickleTable3;
      })()
    );
    exports.PickleTable = PickleTable2;
    var PickleTableCell2 = (
      /** @class */
      /* @__PURE__ */ (function() {
        function PickleTableCell3() {
          this.value = "";
        }
        return PickleTableCell3;
      })()
    );
    exports.PickleTableCell = PickleTableCell2;
    var PickleTableRow2 = (
      /** @class */
      (function() {
        function PickleTableRow3() {
          this.cells = [];
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return PickleTableCell2;
          })
        ], PickleTableRow3.prototype, "cells", void 0);
        return PickleTableRow3;
      })()
    );
    exports.PickleTableRow = PickleTableRow2;
    var PickleTag2 = (
      /** @class */
      /* @__PURE__ */ (function() {
        function PickleTag3() {
          this.name = "";
          this.astNodeId = "";
        }
        return PickleTag3;
      })()
    );
    exports.PickleTag = PickleTag2;
    var Source2 = (
      /** @class */
      /* @__PURE__ */ (function() {
        function Source3() {
          this.uri = "";
          this.data = "";
          this.mediaType = SourceMediaType2.TEXT_X_CUCUMBER_GHERKIN_PLAIN;
        }
        return Source3;
      })()
    );
    exports.Source = Source2;
    var SourceReference2 = (
      /** @class */
      (function() {
        function SourceReference3() {
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return JavaMethod2;
          })
        ], SourceReference3.prototype, "javaMethod", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return JavaStackTraceElement2;
          })
        ], SourceReference3.prototype, "javaStackTraceElement", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Location2;
          })
        ], SourceReference3.prototype, "location", void 0);
        return SourceReference3;
      })()
    );
    exports.SourceReference = SourceReference2;
    var JavaMethod2 = (
      /** @class */
      /* @__PURE__ */ (function() {
        function JavaMethod3() {
          this.className = "";
          this.methodName = "";
          this.methodParameterTypes = [];
        }
        return JavaMethod3;
      })()
    );
    exports.JavaMethod = JavaMethod2;
    var JavaStackTraceElement2 = (
      /** @class */
      /* @__PURE__ */ (function() {
        function JavaStackTraceElement3() {
          this.className = "";
          this.fileName = "";
          this.methodName = "";
        }
        return JavaStackTraceElement3;
      })()
    );
    exports.JavaStackTraceElement = JavaStackTraceElement2;
    var StepDefinition2 = (
      /** @class */
      (function() {
        function StepDefinition3() {
          this.id = "";
          this.pattern = new StepDefinitionPattern2();
          this.sourceReference = new SourceReference2();
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return StepDefinitionPattern2;
          })
        ], StepDefinition3.prototype, "pattern", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return SourceReference2;
          })
        ], StepDefinition3.prototype, "sourceReference", void 0);
        return StepDefinition3;
      })()
    );
    exports.StepDefinition = StepDefinition2;
    var StepDefinitionPattern2 = (
      /** @class */
      /* @__PURE__ */ (function() {
        function StepDefinitionPattern3() {
          this.source = "";
          this.type = StepDefinitionPatternType2.CUCUMBER_EXPRESSION;
        }
        return StepDefinitionPattern3;
      })()
    );
    exports.StepDefinitionPattern = StepDefinitionPattern2;
    var Suggestion2 = (
      /** @class */
      (function() {
        function Suggestion3() {
          this.id = "";
          this.pickleStepId = "";
          this.snippets = [];
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Snippet2;
          })
        ], Suggestion3.prototype, "snippets", void 0);
        return Suggestion3;
      })()
    );
    exports.Suggestion = Suggestion2;
    var Snippet2 = (
      /** @class */
      /* @__PURE__ */ (function() {
        function Snippet3() {
          this.language = "";
          this.code = "";
        }
        return Snippet3;
      })()
    );
    exports.Snippet = Snippet2;
    var TestCase2 = (
      /** @class */
      (function() {
        function TestCase3() {
          this.id = "";
          this.pickleId = "";
          this.testSteps = [];
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return TestStep2;
          })
        ], TestCase3.prototype, "testSteps", void 0);
        return TestCase3;
      })()
    );
    exports.TestCase = TestCase2;
    var Group2 = (
      /** @class */
      (function() {
        function Group3() {
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Group3;
          })
        ], Group3.prototype, "children", void 0);
        return Group3;
      })()
    );
    exports.Group = Group2;
    var StepMatchArgument2 = (
      /** @class */
      (function() {
        function StepMatchArgument3() {
          this.group = new Group2();
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Group2;
          })
        ], StepMatchArgument3.prototype, "group", void 0);
        return StepMatchArgument3;
      })()
    );
    exports.StepMatchArgument = StepMatchArgument2;
    var StepMatchArgumentsList2 = (
      /** @class */
      (function() {
        function StepMatchArgumentsList3() {
          this.stepMatchArguments = [];
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return StepMatchArgument2;
          })
        ], StepMatchArgumentsList3.prototype, "stepMatchArguments", void 0);
        return StepMatchArgumentsList3;
      })()
    );
    exports.StepMatchArgumentsList = StepMatchArgumentsList2;
    var TestStep2 = (
      /** @class */
      (function() {
        function TestStep3() {
          this.id = "";
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return StepMatchArgumentsList2;
          })
        ], TestStep3.prototype, "stepMatchArgumentsLists", void 0);
        return TestStep3;
      })()
    );
    exports.TestStep = TestStep2;
    var TestCaseFinished2 = (
      /** @class */
      (function() {
        function TestCaseFinished3() {
          this.testCaseStartedId = "";
          this.timestamp = new Timestamp2();
          this.willBeRetried = false;
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Timestamp2;
          })
        ], TestCaseFinished3.prototype, "timestamp", void 0);
        return TestCaseFinished3;
      })()
    );
    exports.TestCaseFinished = TestCaseFinished2;
    var TestCaseStarted2 = (
      /** @class */
      (function() {
        function TestCaseStarted3() {
          this.attempt = 0;
          this.id = "";
          this.testCaseId = "";
          this.timestamp = new Timestamp2();
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Timestamp2;
          })
        ], TestCaseStarted3.prototype, "timestamp", void 0);
        return TestCaseStarted3;
      })()
    );
    exports.TestCaseStarted = TestCaseStarted2;
    var TestRunFinished2 = (
      /** @class */
      (function() {
        function TestRunFinished3() {
          this.success = false;
          this.timestamp = new Timestamp2();
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Timestamp2;
          })
        ], TestRunFinished3.prototype, "timestamp", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Exception2;
          })
        ], TestRunFinished3.prototype, "exception", void 0);
        return TestRunFinished3;
      })()
    );
    exports.TestRunFinished = TestRunFinished2;
    var TestRunHookFinished2 = (
      /** @class */
      (function() {
        function TestRunHookFinished3() {
          this.testRunHookStartedId = "";
          this.result = new TestStepResult2();
          this.timestamp = new Timestamp2();
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return TestStepResult2;
          })
        ], TestRunHookFinished3.prototype, "result", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Timestamp2;
          })
        ], TestRunHookFinished3.prototype, "timestamp", void 0);
        return TestRunHookFinished3;
      })()
    );
    exports.TestRunHookFinished = TestRunHookFinished2;
    var TestRunHookStarted2 = (
      /** @class */
      (function() {
        function TestRunHookStarted3() {
          this.id = "";
          this.testRunStartedId = "";
          this.hookId = "";
          this.timestamp = new Timestamp2();
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Timestamp2;
          })
        ], TestRunHookStarted3.prototype, "timestamp", void 0);
        return TestRunHookStarted3;
      })()
    );
    exports.TestRunHookStarted = TestRunHookStarted2;
    var TestRunStarted2 = (
      /** @class */
      (function() {
        function TestRunStarted3() {
          this.timestamp = new Timestamp2();
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Timestamp2;
          })
        ], TestRunStarted3.prototype, "timestamp", void 0);
        return TestRunStarted3;
      })()
    );
    exports.TestRunStarted = TestRunStarted2;
    var TestStepFinished2 = (
      /** @class */
      (function() {
        function TestStepFinished3() {
          this.testCaseStartedId = "";
          this.testStepId = "";
          this.testStepResult = new TestStepResult2();
          this.timestamp = new Timestamp2();
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return TestStepResult2;
          })
        ], TestStepFinished3.prototype, "testStepResult", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Timestamp2;
          })
        ], TestStepFinished3.prototype, "timestamp", void 0);
        return TestStepFinished3;
      })()
    );
    exports.TestStepFinished = TestStepFinished2;
    var TestStepResult2 = (
      /** @class */
      (function() {
        function TestStepResult3() {
          this.duration = new Duration2();
          this.status = TestStepResultStatus2.UNKNOWN;
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Duration2;
          })
        ], TestStepResult3.prototype, "duration", void 0);
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Exception2;
          })
        ], TestStepResult3.prototype, "exception", void 0);
        return TestStepResult3;
      })()
    );
    exports.TestStepResult = TestStepResult2;
    var TestStepStarted2 = (
      /** @class */
      (function() {
        function TestStepStarted3() {
          this.testCaseStartedId = "";
          this.testStepId = "";
          this.timestamp = new Timestamp2();
        }
        __decorate2([
          (0, class_transformer_1.Type)(function() {
            return Timestamp2;
          })
        ], TestStepStarted3.prototype, "timestamp", void 0);
        return TestStepStarted3;
      })()
    );
    exports.TestStepStarted = TestStepStarted2;
    var Timestamp2 = (
      /** @class */
      /* @__PURE__ */ (function() {
        function Timestamp3() {
          this.seconds = 0;
          this.nanos = 0;
        }
        return Timestamp3;
      })()
    );
    exports.Timestamp = Timestamp2;
    var UndefinedParameterType2 = (
      /** @class */
      /* @__PURE__ */ (function() {
        function UndefinedParameterType3() {
          this.expression = "";
          this.name = "";
        }
        return UndefinedParameterType3;
      })()
    );
    exports.UndefinedParameterType = UndefinedParameterType2;
    var AttachmentContentEncoding2;
    (function(AttachmentContentEncoding3) {
      AttachmentContentEncoding3["IDENTITY"] = "IDENTITY";
      AttachmentContentEncoding3["BASE64"] = "BASE64";
    })(AttachmentContentEncoding2 || (exports.AttachmentContentEncoding = AttachmentContentEncoding2 = {}));
    var HookType2;
    (function(HookType3) {
      HookType3["BEFORE_TEST_RUN"] = "BEFORE_TEST_RUN";
      HookType3["AFTER_TEST_RUN"] = "AFTER_TEST_RUN";
      HookType3["BEFORE_TEST_CASE"] = "BEFORE_TEST_CASE";
      HookType3["AFTER_TEST_CASE"] = "AFTER_TEST_CASE";
      HookType3["BEFORE_TEST_STEP"] = "BEFORE_TEST_STEP";
      HookType3["AFTER_TEST_STEP"] = "AFTER_TEST_STEP";
    })(HookType2 || (exports.HookType = HookType2 = {}));
    var PickleStepType2;
    (function(PickleStepType3) {
      PickleStepType3["UNKNOWN"] = "Unknown";
      PickleStepType3["CONTEXT"] = "Context";
      PickleStepType3["ACTION"] = "Action";
      PickleStepType3["OUTCOME"] = "Outcome";
    })(PickleStepType2 || (exports.PickleStepType = PickleStepType2 = {}));
    var SourceMediaType2;
    (function(SourceMediaType3) {
      SourceMediaType3["TEXT_X_CUCUMBER_GHERKIN_PLAIN"] = "text/x.cucumber.gherkin+plain";
      SourceMediaType3["TEXT_X_CUCUMBER_GHERKIN_MARKDOWN"] = "text/x.cucumber.gherkin+markdown";
    })(SourceMediaType2 || (exports.SourceMediaType = SourceMediaType2 = {}));
    var StepDefinitionPatternType2;
    (function(StepDefinitionPatternType3) {
      StepDefinitionPatternType3["CUCUMBER_EXPRESSION"] = "CUCUMBER_EXPRESSION";
      StepDefinitionPatternType3["REGULAR_EXPRESSION"] = "REGULAR_EXPRESSION";
    })(StepDefinitionPatternType2 || (exports.StepDefinitionPatternType = StepDefinitionPatternType2 = {}));
    var StepKeywordType2;
    (function(StepKeywordType3) {
      StepKeywordType3["UNKNOWN"] = "Unknown";
      StepKeywordType3["CONTEXT"] = "Context";
      StepKeywordType3["ACTION"] = "Action";
      StepKeywordType3["OUTCOME"] = "Outcome";
      StepKeywordType3["CONJUNCTION"] = "Conjunction";
    })(StepKeywordType2 || (exports.StepKeywordType = StepKeywordType2 = {}));
    var TestStepResultStatus2;
    (function(TestStepResultStatus3) {
      TestStepResultStatus3["UNKNOWN"] = "UNKNOWN";
      TestStepResultStatus3["PASSED"] = "PASSED";
      TestStepResultStatus3["SKIPPED"] = "SKIPPED";
      TestStepResultStatus3["PENDING"] = "PENDING";
      TestStepResultStatus3["UNDEFINED"] = "UNDEFINED";
      TestStepResultStatus3["AMBIGUOUS"] = "AMBIGUOUS";
      TestStepResultStatus3["FAILED"] = "FAILED";
    })(TestStepResultStatus2 || (exports.TestStepResultStatus = TestStepResultStatus2 = {}));
  }
});

// node_modules/@cucumber/messages/dist/cjs/src/parseEnvelope.js
var require_parseEnvelope = __commonJS({
  "node_modules/@cucumber/messages/dist/cjs/src/parseEnvelope.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.parseEnvelope = parseEnvelope2;
    var messages_js_1 = require_messages();
    var class_transformer_1 = require_cjs();
    function parseEnvelope2(json) {
      var plain = JSON.parse(json);
      return (0, class_transformer_1.plainToClass)(messages_js_1.Envelope, plain);
    }
  }
});

// node_modules/@cucumber/messages/dist/cjs/src/getWorstTestStepResult.js
var require_getWorstTestStepResult = __commonJS({
  "node_modules/@cucumber/messages/dist/cjs/src/getWorstTestStepResult.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getWorstTestStepResult = getWorstTestStepResult2;
    var messages_js_1 = require_messages();
    var TimeConversion_js_1 = require_TimeConversion();
    function getWorstTestStepResult2(testStepResults) {
      return testStepResults.slice().sort(function(r1, r2) {
        return ordinal(r2.status) - ordinal(r1.status);
      })[0] || {
        status: messages_js_1.TestStepResultStatus.UNKNOWN,
        duration: (0, TimeConversion_js_1.millisecondsToDuration)(0)
      };
    }
    function ordinal(status) {
      return [
        messages_js_1.TestStepResultStatus.UNKNOWN,
        messages_js_1.TestStepResultStatus.PASSED,
        messages_js_1.TestStepResultStatus.SKIPPED,
        messages_js_1.TestStepResultStatus.PENDING,
        messages_js_1.TestStepResultStatus.UNDEFINED,
        messages_js_1.TestStepResultStatus.AMBIGUOUS,
        messages_js_1.TestStepResultStatus.FAILED
      ].indexOf(status);
    }
  }
});

// node_modules/@cucumber/messages/dist/cjs/src/version.js
var require_version = __commonJS({
  "node_modules/@cucumber/messages/dist/cjs/src/version.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.version = void 0;
    exports.version = "32.2.0";
  }
});

// node_modules/@cucumber/messages/dist/cjs/src/index.js
var require_src = __commonJS({
  "node_modules/@cucumber/messages/dist/cjs/src/index.js"(exports) {
    "use strict";
    var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports && exports.__importStar || /* @__PURE__ */ (function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    })();
    var __exportStar = exports && exports.__exportStar || function(m, exports2) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p)) __createBinding(exports2, m, p);
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getWorstTestStepResult = exports.parseEnvelope = exports.version = exports.IdGenerator = exports.TimeConversion = void 0;
    var TimeConversion = __importStar(require_TimeConversion());
    exports.TimeConversion = TimeConversion;
    var IdGenerator = __importStar(require_IdGenerator());
    exports.IdGenerator = IdGenerator;
    var parseEnvelope_js_1 = require_parseEnvelope();
    Object.defineProperty(exports, "parseEnvelope", { enumerable: true, get: function() {
      return parseEnvelope_js_1.parseEnvelope;
    } });
    var getWorstTestStepResult_js_1 = require_getWorstTestStepResult();
    Object.defineProperty(exports, "getWorstTestStepResult", { enumerable: true, get: function() {
      return getWorstTestStepResult_js_1.getWorstTestStepResult;
    } });
    var version_js_1 = require_version();
    Object.defineProperty(exports, "version", { enumerable: true, get: function() {
      return version_js_1.version;
    } });
    __exportStar(require_messages(), exports);
  }
});

// node_modules/@cucumber/gherkin/dist/src/compareStepKeywords.js
var require_compareStepKeywords = __commonJS({
  "node_modules/@cucumber/gherkin/dist/src/compareStepKeywords.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.compareStepKeywords = compareStepKeywords;
    function compareStepKeywords(a, b) {
      return b.length - a.length;
    }
  }
});

// node_modules/@cucumber/gherkin/dist/src/gherkin-languages.json
var require_gherkin_languages = __commonJS({
  "node_modules/@cucumber/gherkin/dist/src/gherkin-languages.json"(exports, module) {
    module.exports = {
      af: {
        and: [
          "* ",
          "En "
        ],
        background: [
          "Agtergrond"
        ],
        but: [
          "* ",
          "Maar "
        ],
        examples: [
          "Voorbeelde"
        ],
        feature: [
          "Funksie",
          "Besigheid Behoefte",
          "Vermo\xEB"
        ],
        given: [
          "* ",
          "Gegewe "
        ],
        name: "Afrikaans",
        native: "Afrikaans",
        rule: [
          "Re\xEBl",
          "Reel"
        ],
        scenario: [
          "Voorbeeld",
          "Situasie"
        ],
        scenarioOutline: [
          "Situasie Uiteensetting"
        ],
        then: [
          "* ",
          "Dan "
        ],
        when: [
          "* ",
          "Wanneer "
        ]
      },
      am: {
        and: [
          "* ",
          "\u0535\u057E "
        ],
        background: [
          "\u053F\u0578\u0576\u057F\u0565\u0584\u057D\u057F"
        ],
        but: [
          "* ",
          "\u0532\u0561\u0575\u0581 "
        ],
        examples: [
          "\u0555\u0580\u056B\u0576\u0561\u056F\u0576\u0565\u0580"
        ],
        feature: [
          "\u0556\u0578\u0582\u0576\u056F\u0581\u056B\u0578\u0576\u0561\u056C\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
          "\u0540\u0561\u057F\u056F\u0578\u0582\u0569\u0575\u0578\u0582\u0576"
        ],
        given: [
          "* ",
          "\u0534\u056B\u0581\u0578\u0582\u0584 "
        ],
        name: "Armenian",
        native: "\u0570\u0561\u0575\u0565\u0580\u0565\u0576",
        rule: [
          "Rule"
        ],
        scenario: [
          "\u0555\u0580\u056B\u0576\u0561\u056F",
          "\u054D\u0581\u0565\u0576\u0561\u0580"
        ],
        scenarioOutline: [
          "\u054D\u0581\u0565\u0576\u0561\u0580\u056B \u056F\u0561\u057C\u0578\u0582\u0581\u057E\u0561\u0581\u0584\u0568"
        ],
        then: [
          "* ",
          "\u0531\u057A\u0561 "
        ],
        when: [
          "* ",
          "\u0535\u0569\u0565 ",
          "\u0535\u0580\u0562 "
        ]
      },
      an: {
        and: [
          "* ",
          "Y ",
          "E "
        ],
        background: [
          "Antecedents"
        ],
        but: [
          "* ",
          "Pero "
        ],
        examples: [
          "Eixemplos"
        ],
        feature: [
          "Caracteristica"
        ],
        given: [
          "* ",
          "Dau ",
          "Dada ",
          "Daus ",
          "Dadas "
        ],
        name: "Aragonese",
        native: "Aragon\xE9s",
        rule: [
          "Rule"
        ],
        scenario: [
          "Eixemplo",
          "Caso"
        ],
        scenarioOutline: [
          "Esquema del caso"
        ],
        then: [
          "* ",
          "Alavez ",
          "Allora ",
          "Antonces "
        ],
        when: [
          "* ",
          "Cuan "
        ]
      },
      ar: {
        and: [
          "* ",
          "\u0648 "
        ],
        background: [
          "\u0627\u0644\u062E\u0644\u0641\u064A\u0629"
        ],
        but: [
          "* ",
          "\u0644\u0643\u0646 "
        ],
        examples: [
          "\u0627\u0645\u062B\u0644\u0629"
        ],
        feature: [
          "\u062E\u0627\u0635\u064A\u0629"
        ],
        given: [
          "* ",
          "\u0628\u0641\u0631\u0636 "
        ],
        name: "Arabic",
        native: "\u0627\u0644\u0639\u0631\u0628\u064A\u0629",
        rule: [
          "Rule"
        ],
        scenario: [
          "\u0645\u062B\u0627\u0644",
          "\u0633\u064A\u0646\u0627\u0631\u064A\u0648"
        ],
        scenarioOutline: [
          "\u0633\u064A\u0646\u0627\u0631\u064A\u0648 \u0645\u062E\u0637\u0637"
        ],
        then: [
          "* ",
          "\u0627\u0630\u0627\u064B ",
          "\u062B\u0645 "
        ],
        when: [
          "* ",
          "\u0645\u062A\u0649 ",
          "\u0639\u0646\u062F\u0645\u0627 "
        ]
      },
      ast: {
        and: [
          "* ",
          "Y ",
          "Ya "
        ],
        background: [
          "Antecedentes"
        ],
        but: [
          "* ",
          "Peru "
        ],
        examples: [
          "Exemplos"
        ],
        feature: [
          "Carauter\xEDstica"
        ],
        given: [
          "* ",
          "D\xE1u ",
          "Dada ",
          "Daos ",
          "Daes "
        ],
        name: "Asturian",
        native: "asturianu",
        rule: [
          "Rule"
        ],
        scenario: [
          "Exemplo",
          "Casu"
        ],
        scenarioOutline: [
          "Esbozu del casu"
        ],
        then: [
          "* ",
          "Ent\xF3s "
        ],
        when: [
          "* ",
          "Cuando "
        ]
      },
      az: {
        and: [
          "* ",
          "V\u0259 ",
          "H\u0259m "
        ],
        background: [
          "Ke\xE7mi\u015F",
          "Kontekst"
        ],
        but: [
          "* ",
          "Amma ",
          "Ancaq "
        ],
        examples: [
          "N\xFCmun\u0259l\u0259r"
        ],
        feature: [
          "\xD6z\u0259llik"
        ],
        given: [
          "* ",
          "Tutaq ki ",
          "Verilir "
        ],
        name: "Azerbaijani",
        native: "Az\u0259rbaycanca",
        rule: [
          "Rule"
        ],
        scenario: [
          "N\xFCmun\u0259",
          "Ssenari"
        ],
        scenarioOutline: [
          "Ssenarinin strukturu"
        ],
        then: [
          "* ",
          "O halda "
        ],
        when: [
          "* ",
          "\u018Fg\u0259r ",
          "N\u0259 vaxt ki "
        ]
      },
      be: {
        and: [
          "* ",
          "I ",
          "\u0414\u044B ",
          "\u0422\u0430\u043A\u0441\u0430\u043C\u0430 "
        ],
        background: [
          "\u041A\u0430\u043D\u0442\u044D\u043A\u0441\u0442"
        ],
        but: [
          "* ",
          "\u0410\u043B\u0435 ",
          "\u0406\u043D\u0430\u043A\u0448 "
        ],
        examples: [
          "\u041F\u0440\u044B\u043A\u043B\u0430\u0434\u044B"
        ],
        feature: [
          "\u0424\u0443\u043D\u043A\u0446\u044B\u044F\u043D\u0430\u043B\u044C\u043D\u0430\u0441\u0446\u044C",
          "\u0424\u0456\u0447\u0430"
        ],
        given: [
          "* ",
          "\u041D\u044F\u0445\u0430\u0439 ",
          "\u0414\u0430\u0434\u0437\u0435\u043D\u0430 "
        ],
        name: "Belarusian",
        native: "\u0411\u0435\u043B\u0430\u0440\u0443\u0441\u043A\u0430\u044F",
        rule: [
          "\u041F\u0440\u0430\u0432\u0456\u043B\u044B"
        ],
        scenario: [
          "\u0421\u0446\u044D\u043D\u0430\u0440\u044B\u0439",
          "C\u0446\u044D\u043D\u0430\u0440"
        ],
        scenarioOutline: [
          "\u0428\u0430\u0431\u043B\u043E\u043D \u0441\u0446\u044D\u043D\u0430\u0440\u044B\u044F",
          "\u0423\u0437\u043E\u0440 \u0441\u0446\u044D\u043D\u0430\u0440\u0430"
        ],
        then: [
          "* ",
          "\u0422\u0430\u0434\u044B "
        ],
        when: [
          "* ",
          "\u041A\u0430\u043B\u0456 "
        ]
      },
      bg: {
        and: [
          "* ",
          "\u0418 "
        ],
        background: [
          "\u041F\u0440\u0435\u0434\u0438\u0441\u0442\u043E\u0440\u0438\u044F"
        ],
        but: [
          "* ",
          "\u041D\u043E "
        ],
        examples: [
          "\u041F\u0440\u0438\u043C\u0435\u0440\u0438"
        ],
        feature: [
          "\u0424\u0443\u043D\u043A\u0446\u0438\u043E\u043D\u0430\u043B\u043D\u043E\u0441\u0442"
        ],
        given: [
          "* ",
          "\u0414\u0430\u0434\u0435\u043D\u043E "
        ],
        name: "Bulgarian",
        native: "\u0431\u044A\u043B\u0433\u0430\u0440\u0441\u043A\u0438",
        rule: [
          "\u041F\u0440\u0430\u0432\u0438\u043B\u043E"
        ],
        scenario: [
          "\u041F\u0440\u0438\u043C\u0435\u0440",
          "\u0421\u0446\u0435\u043D\u0430\u0440\u0438\u0439"
        ],
        scenarioOutline: [
          "\u0420\u0430\u043C\u043A\u0430 \u043D\u0430 \u0441\u0446\u0435\u043D\u0430\u0440\u0438\u0439"
        ],
        then: [
          "* ",
          "\u0422\u043E "
        ],
        when: [
          "* ",
          "\u041A\u043E\u0433\u0430\u0442\u043E "
        ]
      },
      bm: {
        and: [
          "* ",
          "Dan "
        ],
        background: [
          "Latar Belakang"
        ],
        but: [
          "* ",
          "Tetapi ",
          "Tapi "
        ],
        examples: [
          "Contoh"
        ],
        feature: [
          "Fungsi"
        ],
        given: [
          "* ",
          "Diberi ",
          "Bagi "
        ],
        name: "Malay",
        native: "Bahasa Melayu",
        rule: [
          "Rule"
        ],
        scenario: [
          "Senario",
          "Situasi",
          "Keadaan"
        ],
        scenarioOutline: [
          "Kerangka Senario",
          "Kerangka Situasi",
          "Kerangka Keadaan",
          "Garis Panduan Senario"
        ],
        then: [
          "* ",
          "Maka ",
          "Kemudian "
        ],
        when: [
          "* ",
          "Apabila "
        ]
      },
      bs: {
        and: [
          "* ",
          "I ",
          "A "
        ],
        background: [
          "Pozadina"
        ],
        but: [
          "* ",
          "Ali "
        ],
        examples: [
          "Primjeri"
        ],
        feature: [
          "Karakteristika"
        ],
        given: [
          "* ",
          "Dato "
        ],
        name: "Bosnian",
        native: "Bosanski",
        rule: [
          "Rule"
        ],
        scenario: [
          "Primjer",
          "Scenariju",
          "Scenario"
        ],
        scenarioOutline: [
          "Scenariju-obris",
          "Scenario-outline"
        ],
        then: [
          "* ",
          "Zatim "
        ],
        when: [
          "* ",
          "Kada "
        ]
      },
      ca: {
        and: [
          "* ",
          "I "
        ],
        background: [
          "Rerefons",
          "Antecedents"
        ],
        but: [
          "* ",
          "Per\xF2 "
        ],
        examples: [
          "Exemples"
        ],
        feature: [
          "Caracter\xEDstica",
          "Funcionalitat"
        ],
        given: [
          "* ",
          "Donat ",
          "Donada ",
          "At\xE8s ",
          "Atesa "
        ],
        name: "Catalan",
        native: "catal\xE0",
        rule: [
          "Rule"
        ],
        scenario: [
          "Exemple",
          "Escenari"
        ],
        scenarioOutline: [
          "Esquema de l'escenari"
        ],
        then: [
          "* ",
          "Aleshores ",
          "Cal "
        ],
        when: [
          "* ",
          "Quan "
        ]
      },
      cs: {
        and: [
          "* ",
          "A tak\xE9 ",
          "A "
        ],
        background: [
          "Pozad\xED",
          "Kontext"
        ],
        but: [
          "* ",
          "Ale "
        ],
        examples: [
          "P\u0159\xEDklady"
        ],
        feature: [
          "Po\u017Eadavek"
        ],
        given: [
          "* ",
          "Pokud ",
          "Za p\u0159edpokladu "
        ],
        name: "Czech",
        native: "\u010Cesky",
        rule: [
          "Pravidlo"
        ],
        scenario: [
          "P\u0159\xEDklad",
          "Sc\xE9n\xE1\u0159"
        ],
        scenarioOutline: [
          "N\xE1\u010Drt Sc\xE9n\xE1\u0159e",
          "Osnova sc\xE9n\xE1\u0159e"
        ],
        then: [
          "* ",
          "Pak "
        ],
        when: [
          "* ",
          "Kdy\u017E "
        ]
      },
      "cy-GB": {
        and: [
          "* ",
          "A "
        ],
        background: [
          "Cefndir"
        ],
        but: [
          "* ",
          "Ond "
        ],
        examples: [
          "Enghreifftiau"
        ],
        feature: [
          "Arwedd"
        ],
        given: [
          "* ",
          "Anrhegedig a "
        ],
        name: "Welsh",
        native: "Cymraeg",
        rule: [
          "Rule"
        ],
        scenario: [
          "Enghraifft",
          "Scenario"
        ],
        scenarioOutline: [
          "Scenario Amlinellol"
        ],
        then: [
          "* ",
          "Yna "
        ],
        when: [
          "* ",
          "Pryd "
        ]
      },
      da: {
        and: [
          "* ",
          "Og "
        ],
        background: [
          "Baggrund"
        ],
        but: [
          "* ",
          "Men "
        ],
        examples: [
          "Eksempler"
        ],
        feature: [
          "Egenskab"
        ],
        given: [
          "* ",
          "Givet "
        ],
        name: "Danish",
        native: "dansk",
        rule: [
          "Regel"
        ],
        scenario: [
          "Eksempel",
          "Scenarie"
        ],
        scenarioOutline: [
          "Abstrakt Scenario"
        ],
        then: [
          "* ",
          "S\xE5 "
        ],
        when: [
          "* ",
          "N\xE5r "
        ]
      },
      de: {
        and: [
          "* ",
          "Und "
        ],
        background: [
          "Grundlage",
          "Hintergrund",
          "Voraussetzungen",
          "Vorbedingungen"
        ],
        but: [
          "* ",
          "Aber "
        ],
        examples: [
          "Beispiele"
        ],
        feature: [
          "Funktionalit\xE4t",
          "Funktion"
        ],
        given: [
          "* ",
          "Angenommen ",
          "Gegeben sei ",
          "Gegeben seien "
        ],
        name: "German",
        native: "Deutsch",
        rule: [
          "Rule",
          "Regel"
        ],
        scenario: [
          "Beispiel",
          "Szenario"
        ],
        scenarioOutline: [
          "Szenariogrundriss",
          "Szenarien"
        ],
        then: [
          "* ",
          "Dann "
        ],
        when: [
          "* ",
          "Wenn "
        ]
      },
      el: {
        and: [
          "* ",
          "\u039A\u03B1\u03B9 "
        ],
        background: [
          "\u03A5\u03C0\u03CC\u03B2\u03B1\u03B8\u03C1\u03BF"
        ],
        but: [
          "* ",
          "\u0391\u03BB\u03BB\u03AC "
        ],
        examples: [
          "\u03A0\u03B1\u03C1\u03B1\u03B4\u03B5\u03AF\u03B3\u03BC\u03B1\u03C4\u03B1",
          "\u03A3\u03B5\u03BD\u03AC\u03C1\u03B9\u03B1"
        ],
        feature: [
          "\u0394\u03C5\u03BD\u03B1\u03C4\u03CC\u03C4\u03B7\u03C4\u03B1",
          "\u039B\u03B5\u03B9\u03C4\u03BF\u03C5\u03C1\u03B3\u03AF\u03B1"
        ],
        given: [
          "* ",
          "\u0394\u03B5\u03B4\u03BF\u03BC\u03AD\u03BD\u03BF\u03C5 "
        ],
        name: "Greek",
        native: "\u0395\u03BB\u03BB\u03B7\u03BD\u03B9\u03BA\u03AC",
        rule: [
          "Rule"
        ],
        scenario: [
          "\u03A0\u03B1\u03C1\u03AC\u03B4\u03B5\u03B9\u03B3\u03BC\u03B1",
          "\u03A3\u03B5\u03BD\u03AC\u03C1\u03B9\u03BF"
        ],
        scenarioOutline: [
          "\u03A0\u03B5\u03C1\u03B9\u03B3\u03C1\u03B1\u03C6\u03AE \u03A3\u03B5\u03BD\u03B1\u03C1\u03AF\u03BF\u03C5",
          "\u03A0\u03B5\u03C1\u03AF\u03B3\u03C1\u03B1\u03BC\u03BC\u03B1 \u03A3\u03B5\u03BD\u03B1\u03C1\u03AF\u03BF\u03C5"
        ],
        then: [
          "* ",
          "\u03A4\u03CC\u03C4\u03B5 "
        ],
        when: [
          "* ",
          "\u038C\u03C4\u03B1\u03BD "
        ]
      },
      em: {
        and: [
          "* ",
          "\u{1F602}"
        ],
        background: [
          "\u{1F4A4}"
        ],
        but: [
          "* ",
          "\u{1F614}"
        ],
        examples: [
          "\u{1F4D3}"
        ],
        feature: [
          "\u{1F4DA}"
        ],
        given: [
          "* ",
          "\u{1F610}"
        ],
        name: "Emoji",
        native: "\u{1F600}",
        rule: [
          "Rule"
        ],
        scenario: [
          "\u{1F952}",
          "\u{1F4D5}"
        ],
        scenarioOutline: [
          "\u{1F4D6}"
        ],
        then: [
          "* ",
          "\u{1F64F}"
        ],
        when: [
          "* ",
          "\u{1F3AC}"
        ]
      },
      en: {
        and: [
          "* ",
          "And "
        ],
        background: [
          "Background"
        ],
        but: [
          "* ",
          "But "
        ],
        examples: [
          "Examples",
          "Scenarios"
        ],
        feature: [
          "Feature",
          "Business Need",
          "Ability"
        ],
        given: [
          "* ",
          "Given "
        ],
        name: "English",
        native: "English",
        rule: [
          "Rule"
        ],
        scenario: [
          "Example",
          "Scenario"
        ],
        scenarioOutline: [
          "Scenario Outline",
          "Scenario Template"
        ],
        then: [
          "* ",
          "Then "
        ],
        when: [
          "* ",
          "When "
        ]
      },
      "en-Scouse": {
        and: [
          "* ",
          "An "
        ],
        background: [
          "Dis is what went down"
        ],
        but: [
          "* ",
          "Buh "
        ],
        examples: [
          "Examples"
        ],
        feature: [
          "Feature"
        ],
        given: [
          "* ",
          "Givun ",
          "Youse know when youse got "
        ],
        name: "Scouse",
        native: "Scouse",
        rule: [
          "Rule"
        ],
        scenario: [
          "The thing of it is"
        ],
        scenarioOutline: [
          "Wharrimean is"
        ],
        then: [
          "* ",
          "Dun ",
          "Den youse gotta "
        ],
        when: [
          "* ",
          "Wun ",
          "Youse know like when "
        ]
      },
      "en-au": {
        and: [
          "* ",
          "Too right "
        ],
        background: [
          "First off"
        ],
        but: [
          "* ",
          "Yeah nah "
        ],
        examples: [
          "You'll wanna"
        ],
        feature: [
          "Pretty much"
        ],
        given: [
          "* ",
          "Y'know "
        ],
        name: "Australian",
        native: "Australian",
        rule: [
          "Rule"
        ],
        scenario: [
          "Awww, look mate"
        ],
        scenarioOutline: [
          "Reckon it's like"
        ],
        then: [
          "* ",
          "But at the end of the day I reckon "
        ],
        when: [
          "* ",
          "It's just unbelievable "
        ]
      },
      "en-lol": {
        and: [
          "* ",
          "AN "
        ],
        background: [
          "B4"
        ],
        but: [
          "* ",
          "BUT "
        ],
        examples: [
          "EXAMPLZ"
        ],
        feature: [
          "OH HAI"
        ],
        given: [
          "* ",
          "I CAN HAZ "
        ],
        name: "LOLCAT",
        native: "LOLCAT",
        rule: [
          "Rule"
        ],
        scenario: [
          "MISHUN"
        ],
        scenarioOutline: [
          "MISHUN SRSLY"
        ],
        then: [
          "* ",
          "DEN "
        ],
        when: [
          "* ",
          "WEN "
        ]
      },
      "en-old": {
        and: [
          "* ",
          "Ond ",
          "7 "
        ],
        background: [
          "Aer",
          "\xC6r"
        ],
        but: [
          "* ",
          "Ac "
        ],
        examples: [
          "Se the",
          "Se \xFEe",
          "Se \xF0e"
        ],
        feature: [
          "Hwaet",
          "Hw\xE6t"
        ],
        given: [
          "* ",
          "Thurh ",
          "\xDEurh ",
          "\xD0urh "
        ],
        name: "Old English",
        native: "Englisc",
        rule: [
          "Rule"
        ],
        scenario: [
          "Swa"
        ],
        scenarioOutline: [
          "Swa hwaer swa",
          "Swa hw\xE6r swa"
        ],
        then: [
          "* ",
          "Tha ",
          "\xDEa ",
          "\xD0a ",
          "Tha the ",
          "\xDEa \xFEe ",
          "\xD0a \xF0e "
        ],
        when: [
          "* ",
          "B\xE6\xFEsealf ",
          "B\xE6\xFEsealfa ",
          "B\xE6\xFEsealfe ",
          "Ciric\xE6w ",
          "Ciric\xE6we ",
          "Ciric\xE6wa "
        ]
      },
      "en-pirate": {
        and: [
          "* ",
          "Aye "
        ],
        background: [
          "Yo-ho-ho"
        ],
        but: [
          "* ",
          "Avast! "
        ],
        examples: [
          "Dead men tell no tales"
        ],
        feature: [
          "Ahoy matey!"
        ],
        given: [
          "* ",
          "Gangway! "
        ],
        name: "Pirate",
        native: "Pirate",
        rule: [
          "Rule"
        ],
        scenario: [
          "Heave to"
        ],
        scenarioOutline: [
          "Shiver me timbers"
        ],
        then: [
          "* ",
          "Let go and haul "
        ],
        when: [
          "* ",
          "Blimey! "
        ]
      },
      "en-tx": {
        and: [
          "Come hell or high water "
        ],
        background: [
          "Lemme tell y'all a story"
        ],
        but: [
          "Well now hold on, I'll you what "
        ],
        examples: [
          "Now that's a story longer than a cattle drive in July"
        ],
        feature: [
          "This ain\u2019t my first rodeo",
          "All gussied up"
        ],
        given: [
          "Fixin' to ",
          "All git out "
        ],
        name: "Texas",
        native: "Texas",
        rule: [
          "Rule "
        ],
        scenario: [
          "All hat and no cattle"
        ],
        scenarioOutline: [
          "Serious as a snake bite",
          "Busy as a hound in flea season"
        ],
        then: [
          "There\u2019s no tree but bears some fruit "
        ],
        when: [
          "Quick out of the chute "
        ]
      },
      eo: {
        and: [
          "* ",
          "Kaj "
        ],
        background: [
          "Fono"
        ],
        but: [
          "* ",
          "Sed "
        ],
        examples: [
          "Ekzemploj"
        ],
        feature: [
          "Trajto"
        ],
        given: [
          "* ",
          "Donita\u0135o ",
          "Komence "
        ],
        name: "Esperanto",
        native: "Esperanto",
        rule: [
          "Regulo"
        ],
        scenario: [
          "Ekzemplo",
          "Scenaro",
          "Kazo"
        ],
        scenarioOutline: [
          "Konturo de la scenaro",
          "Skizo",
          "Kazo-skizo"
        ],
        then: [
          "* ",
          "Do "
        ],
        when: [
          "* ",
          "Se "
        ]
      },
      es: {
        and: [
          "* ",
          "Y ",
          "E "
        ],
        background: [
          "Antecedentes"
        ],
        but: [
          "* ",
          "Pero "
        ],
        examples: [
          "Ejemplos"
        ],
        feature: [
          "Caracter\xEDstica",
          "Necesidad del negocio",
          "Requisito"
        ],
        given: [
          "* ",
          "Dado ",
          "Dada ",
          "Dados ",
          "Dadas "
        ],
        name: "Spanish",
        native: "espa\xF1ol",
        rule: [
          "Regla",
          "Regla de negocio"
        ],
        scenario: [
          "Ejemplo",
          "Escenario"
        ],
        scenarioOutline: [
          "Esquema del escenario"
        ],
        then: [
          "* ",
          "Entonces "
        ],
        when: [
          "* ",
          "Cuando "
        ]
      },
      et: {
        and: [
          "* ",
          "Ja "
        ],
        background: [
          "Taust"
        ],
        but: [
          "* ",
          "Kuid "
        ],
        examples: [
          "Juhtumid"
        ],
        feature: [
          "Omadus"
        ],
        given: [
          "* ",
          "Eeldades "
        ],
        name: "Estonian",
        native: "eesti keel",
        rule: [
          "Reegel"
        ],
        scenario: [
          "Juhtum",
          "Stsenaarium"
        ],
        scenarioOutline: [
          "Raamjuhtum",
          "Raamstsenaarium"
        ],
        then: [
          "* ",
          "Siis "
        ],
        when: [
          "* ",
          "Kui "
        ]
      },
      fa: {
        and: [
          "* ",
          "\u0648 "
        ],
        background: [
          "\u0632\u0645\u06CC\u0646\u0647"
        ],
        but: [
          "* ",
          "\u0627\u0645\u0627 "
        ],
        examples: [
          "\u0646\u0645\u0648\u0646\u0647 \u0647\u0627"
        ],
        feature: [
          "\u0648\u0650\u06CC\u0698\u06AF\u06CC"
        ],
        given: [
          "* ",
          "\u0628\u0627 \u0641\u0631\u0636 "
        ],
        name: "Persian",
        native: "\u0641\u0627\u0631\u0633\u06CC",
        rule: [
          "Rule"
        ],
        scenario: [
          "\u0645\u062B\u0627\u0644",
          "\u0633\u0646\u0627\u0631\u06CC\u0648"
        ],
        scenarioOutline: [
          "\u0627\u0644\u06AF\u0648\u06CC \u0633\u0646\u0627\u0631\u06CC\u0648"
        ],
        then: [
          "* ",
          "\u0622\u0646\u06AF\u0627\u0647 "
        ],
        when: [
          "* ",
          "\u0647\u0646\u06AF\u0627\u0645\u06CC "
        ]
      },
      fi: {
        and: [
          "* ",
          "Ja "
        ],
        background: [
          "Tausta"
        ],
        but: [
          "* ",
          "Mutta "
        ],
        examples: [
          "Tapaukset"
        ],
        feature: [
          "Ominaisuus"
        ],
        given: [
          "* ",
          "Oletetaan "
        ],
        name: "Finnish",
        native: "suomi",
        rule: [
          "Rule"
        ],
        scenario: [
          "Tapaus"
        ],
        scenarioOutline: [
          "Tapausaihio"
        ],
        then: [
          "* ",
          "Niin "
        ],
        when: [
          "* ",
          "Kun "
        ]
      },
      fr: {
        and: [
          "* ",
          "Et que ",
          "Et qu'",
          "Et "
        ],
        background: [
          "Contexte"
        ],
        but: [
          "* ",
          "Mais que ",
          "Mais qu'",
          "Mais "
        ],
        examples: [
          "Exemples"
        ],
        feature: [
          "Fonctionnalit\xE9"
        ],
        given: [
          "* ",
          "Soit ",
          "Sachant que ",
          "Sachant qu'",
          "Sachant ",
          "Etant donn\xE9 que ",
          "Etant donn\xE9 qu'",
          "Etant donn\xE9 ",
          "Etant donn\xE9e ",
          "Etant donn\xE9s ",
          "Etant donn\xE9es ",
          "\xC9tant donn\xE9 que ",
          "\xC9tant donn\xE9 qu'",
          "\xC9tant donn\xE9 ",
          "\xC9tant donn\xE9e ",
          "\xC9tant donn\xE9s ",
          "\xC9tant donn\xE9es "
        ],
        name: "French",
        native: "fran\xE7ais",
        rule: [
          "R\xE8gle"
        ],
        scenario: [
          "Exemple",
          "Sc\xE9nario"
        ],
        scenarioOutline: [
          "Plan du sc\xE9nario",
          "Plan du Sc\xE9nario"
        ],
        then: [
          "* ",
          "Alors ",
          "Donc "
        ],
        when: [
          "* ",
          "Quand ",
          "Lorsque ",
          "Lorsqu'"
        ]
      },
      ga: {
        and: [
          "* ",
          "Agus "
        ],
        background: [
          "C\xFAlra"
        ],
        but: [
          "* ",
          "Ach "
        ],
        examples: [
          "Sampla\xED"
        ],
        feature: [
          "Gn\xE9"
        ],
        given: [
          "* ",
          "Cuir i gc\xE1s go ",
          "Cuir i gc\xE1s nach ",
          "Cuir i gc\xE1s gur ",
          "Cuir i gc\xE1s n\xE1r "
        ],
        name: "Irish",
        native: "Gaeilge",
        rule: [
          "Riail"
        ],
        scenario: [
          "Sampla",
          "C\xE1s"
        ],
        scenarioOutline: [
          "C\xE1s Achomair"
        ],
        then: [
          "* ",
          "Ansin "
        ],
        when: [
          "* ",
          "Nuair a ",
          "Nuair nach ",
          "Nuair ba ",
          "Nuair n\xE1r "
        ]
      },
      gj: {
        and: [
          "* ",
          "\u0A85\u0AA8\u0AC7 "
        ],
        background: [
          "\u0AAC\u0AC7\u0A95\u0A97\u0ACD\u0AB0\u0ABE\u0A89\u0AA8\u0ACD\u0AA1"
        ],
        but: [
          "* ",
          "\u0AAA\u0AA3 "
        ],
        examples: [
          "\u0A89\u0AA6\u0ABE\u0AB9\u0AB0\u0AA3\u0ACB"
        ],
        feature: [
          "\u0AB2\u0A95\u0ACD\u0AB7\u0AA3",
          "\u0AB5\u0ACD\u0AAF\u0ABE\u0AAA\u0ABE\u0AB0 \u0A9C\u0AB0\u0AC2\u0AB0",
          "\u0A95\u0ACD\u0AB7\u0AAE\u0AA4\u0ABE"
        ],
        given: [
          "* ",
          "\u0A86\u0AAA\u0AC7\u0AB2 \u0A9B\u0AC7 "
        ],
        name: "Gujarati",
        native: "\u0A97\u0AC1\u0A9C\u0AB0\u0ABE\u0AA4\u0AC0",
        rule: [
          "\u0AA8\u0ABF\u0AAF\u0AAE"
        ],
        scenario: [
          "\u0A89\u0AA6\u0ABE\u0AB9\u0AB0\u0AA3",
          "\u0AB8\u0ACD\u0AA5\u0ABF\u0AA4\u0ABF"
        ],
        scenarioOutline: [
          "\u0AAA\u0AB0\u0ABF\u0AA6\u0ACD\u0AA6\u0AB6\u0ACD\u0AAF \u0AB0\u0AC2\u0AAA\u0AB0\u0AC7\u0A96\u0ABE",
          "\u0AAA\u0AB0\u0ABF\u0AA6\u0ACD\u0AA6\u0AB6\u0ACD\u0AAF \u0AA2\u0ABE\u0A82\u0A9A\u0ACB"
        ],
        then: [
          "* ",
          "\u0AAA\u0A9B\u0AC0 "
        ],
        when: [
          "* ",
          "\u0A95\u0ACD\u0AAF\u0ABE\u0AB0\u0AC7 "
        ]
      },
      gl: {
        and: [
          "* ",
          "E "
        ],
        background: [
          "Contexto"
        ],
        but: [
          "* ",
          "Mais ",
          "Pero "
        ],
        examples: [
          "Exemplos"
        ],
        feature: [
          "Caracter\xEDstica"
        ],
        given: [
          "* ",
          "Dado ",
          "Dada ",
          "Dados ",
          "Dadas "
        ],
        name: "Galician",
        native: "galego",
        rule: [
          "Rule"
        ],
        scenario: [
          "Exemplo",
          "Escenario"
        ],
        scenarioOutline: [
          "Esbozo do escenario"
        ],
        then: [
          "* ",
          "Ent\xF3n ",
          "Logo "
        ],
        when: [
          "* ",
          "Cando "
        ]
      },
      he: {
        and: [
          "* ",
          "\u05D5\u05D2\u05DD "
        ],
        background: [
          "\u05E8\u05E7\u05E2"
        ],
        but: [
          "* ",
          "\u05D0\u05D1\u05DC "
        ],
        examples: [
          "\u05D3\u05D5\u05D2\u05DE\u05D0\u05D5\u05EA"
        ],
        feature: [
          "\u05EA\u05DB\u05D5\u05E0\u05D4"
        ],
        given: [
          "* ",
          "\u05D1\u05D4\u05D9\u05E0\u05EA\u05DF "
        ],
        name: "Hebrew",
        native: "\u05E2\u05D1\u05E8\u05D9\u05EA",
        rule: [
          "\u05DB\u05DC\u05DC"
        ],
        scenario: [
          "\u05D3\u05D5\u05D2\u05DE\u05D0",
          "\u05EA\u05E8\u05D7\u05D9\u05E9"
        ],
        scenarioOutline: [
          "\u05EA\u05D1\u05E0\u05D9\u05EA \u05EA\u05E8\u05D7\u05D9\u05E9"
        ],
        then: [
          "* ",
          "\u05D0\u05D6 ",
          "\u05D0\u05D6\u05D9 "
        ],
        when: [
          "* ",
          "\u05DB\u05D0\u05E9\u05E8 "
        ]
      },
      hi: {
        and: [
          "* ",
          "\u0914\u0930 ",
          "\u0924\u0925\u093E "
        ],
        background: [
          "\u092A\u0943\u0937\u094D\u0920\u092D\u0942\u092E\u093F"
        ],
        but: [
          "* ",
          "\u092A\u0930 ",
          "\u092A\u0930\u0928\u094D\u0924\u0941 ",
          "\u0915\u093F\u0928\u094D\u0924\u0941 "
        ],
        examples: [
          "\u0909\u0926\u093E\u0939\u0930\u0923"
        ],
        feature: [
          "\u0930\u0942\u092A \u0932\u0947\u0916"
        ],
        given: [
          "* ",
          "\u0905\u0917\u0930 ",
          "\u092F\u0926\u093F ",
          "\u091A\u0942\u0902\u0915\u093F "
        ],
        name: "Hindi",
        native: "\u0939\u093F\u0902\u0926\u0940",
        rule: [
          "\u0928\u093F\u092F\u092E"
        ],
        scenario: [
          "\u092A\u0930\u093F\u0926\u0943\u0936\u094D\u092F"
        ],
        scenarioOutline: [
          "\u092A\u0930\u093F\u0926\u0943\u0936\u094D\u092F \u0930\u0942\u092A\u0930\u0947\u0916\u093E"
        ],
        then: [
          "* ",
          "\u0924\u092C ",
          "\u0924\u0926\u093E "
        ],
        when: [
          "* ",
          "\u091C\u092C ",
          "\u0915\u0926\u093E "
        ]
      },
      hr: {
        and: [
          "* ",
          "I "
        ],
        background: [
          "Pozadina"
        ],
        but: [
          "* ",
          "Ali "
        ],
        examples: [
          "Primjeri",
          "Scenariji"
        ],
        feature: [
          "Osobina",
          "Mogu\u0107nost",
          "Mogucnost"
        ],
        given: [
          "* ",
          "Zadan ",
          "Zadani ",
          "Zadano ",
          "Ukoliko "
        ],
        name: "Croatian",
        native: "hrvatski",
        rule: [
          "Rule"
        ],
        scenario: [
          "Primjer",
          "Scenarij"
        ],
        scenarioOutline: [
          "Skica",
          "Koncept"
        ],
        then: [
          "* ",
          "Onda "
        ],
        when: [
          "* ",
          "Kada ",
          "Kad "
        ]
      },
      ht: {
        and: [
          "* ",
          "Ak ",
          "Epi ",
          "E "
        ],
        background: [
          "Kont\xE8ks",
          "Istorik"
        ],
        but: [
          "* ",
          "Men "
        ],
        examples: [
          "Egzanp"
        ],
        feature: [
          "Karakteristik",
          "Mak",
          "Fonksyonalite"
        ],
        given: [
          "* ",
          "Sipoze ",
          "Sipoze ke ",
          "Sipoze Ke "
        ],
        name: "Creole",
        native: "krey\xF2l",
        rule: [
          "Rule"
        ],
        scenario: [
          "Senaryo"
        ],
        scenarioOutline: [
          "Plan senaryo",
          "Plan Senaryo",
          "Senaryo deskripsyon",
          "Senaryo Deskripsyon",
          "Dyagram senaryo",
          "Dyagram Senaryo"
        ],
        then: [
          "* ",
          "L\xE8 sa a ",
          "Le sa a "
        ],
        when: [
          "* ",
          "L\xE8 ",
          "Le "
        ]
      },
      hu: {
        and: [
          "* ",
          "\xC9s "
        ],
        background: [
          "H\xE1tt\xE9r"
        ],
        but: [
          "* ",
          "De "
        ],
        examples: [
          "P\xE9ld\xE1k"
        ],
        feature: [
          "Jellemz\u0151"
        ],
        given: [
          "* ",
          "Amennyiben ",
          "Adott "
        ],
        name: "Hungarian",
        native: "magyar",
        rule: [
          "Szab\xE1ly"
        ],
        scenario: [
          "P\xE9lda",
          "Forgat\xF3k\xF6nyv"
        ],
        scenarioOutline: [
          "Forgat\xF3k\xF6nyv v\xE1zlat"
        ],
        then: [
          "* ",
          "Akkor "
        ],
        when: [
          "* ",
          "Majd ",
          "Ha ",
          "Amikor "
        ]
      },
      id: {
        and: [
          "* ",
          "Dan "
        ],
        background: [
          "Dasar",
          "Latar Belakang"
        ],
        but: [
          "* ",
          "Tapi ",
          "Tetapi "
        ],
        examples: [
          "Contoh",
          "Misal"
        ],
        feature: [
          "Fitur"
        ],
        given: [
          "* ",
          "Dengan ",
          "Diketahui ",
          "Diasumsikan ",
          "Bila ",
          "Jika "
        ],
        name: "Indonesian",
        native: "Bahasa Indonesia",
        rule: [
          "Rule",
          "Aturan"
        ],
        scenario: [
          "Skenario"
        ],
        scenarioOutline: [
          "Skenario konsep",
          "Garis-Besar Skenario"
        ],
        then: [
          "* ",
          "Maka ",
          "Kemudian "
        ],
        when: [
          "* ",
          "Ketika "
        ]
      },
      is: {
        and: [
          "* ",
          "Og "
        ],
        background: [
          "Bakgrunnur"
        ],
        but: [
          "* ",
          "En "
        ],
        examples: [
          "D\xE6mi",
          "Atbur\xF0ar\xE1sir"
        ],
        feature: [
          "Eiginleiki"
        ],
        given: [
          "* ",
          "Ef "
        ],
        name: "Icelandic",
        native: "\xCDslenska",
        rule: [
          "Rule"
        ],
        scenario: [
          "Atbur\xF0ar\xE1s"
        ],
        scenarioOutline: [
          "L\xFDsing Atbur\xF0ar\xE1sar",
          "L\xFDsing D\xE6ma"
        ],
        then: [
          "* ",
          "\xDE\xE1 "
        ],
        when: [
          "* ",
          "\xDEegar "
        ]
      },
      it: {
        and: [
          "* ",
          "E ",
          "Ed "
        ],
        background: [
          "Contesto"
        ],
        but: [
          "* ",
          "Ma "
        ],
        examples: [
          "Esempi"
        ],
        feature: [
          "Funzionalit\xE0",
          "Esigenza di Business",
          "Abilit\xE0"
        ],
        given: [
          "* ",
          "Dato ",
          "Data ",
          "Dati ",
          "Date "
        ],
        name: "Italian",
        native: "italiano",
        rule: [
          "Regola"
        ],
        scenario: [
          "Esempio",
          "Scenario"
        ],
        scenarioOutline: [
          "Schema dello scenario"
        ],
        then: [
          "* ",
          "Allora "
        ],
        when: [
          "* ",
          "Quando "
        ]
      },
      ja: {
        and: [
          "* ",
          "\u4E14\u3064",
          "\u304B\u3064"
        ],
        background: [
          "\u80CC\u666F"
        ],
        but: [
          "* ",
          "\u7136\u3057",
          "\u3057\u304B\u3057",
          "\u4F46\u3057",
          "\u305F\u3060\u3057"
        ],
        examples: [
          "\u4F8B",
          "\u30B5\u30F3\u30D7\u30EB"
        ],
        feature: [
          "\u30D5\u30A3\u30FC\u30C1\u30E3",
          "\u6A5F\u80FD"
        ],
        given: [
          "* ",
          "\u524D\u63D0"
        ],
        name: "Japanese",
        native: "\u65E5\u672C\u8A9E",
        rule: [
          "\u30EB\u30FC\u30EB"
        ],
        scenario: [
          "\u30B7\u30CA\u30EA\u30AA"
        ],
        scenarioOutline: [
          "\u30B7\u30CA\u30EA\u30AA\u30A2\u30A6\u30C8\u30E9\u30A4\u30F3",
          "\u30B7\u30CA\u30EA\u30AA\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8",
          "\u30C6\u30F3\u30D7\u30EC",
          "\u30B7\u30CA\u30EA\u30AA\u30C6\u30F3\u30D7\u30EC"
        ],
        then: [
          "* ",
          "\u306A\u3089\u3070"
        ],
        when: [
          "* ",
          "\u3082\u3057"
        ]
      },
      jv: {
        and: [
          "* ",
          "Lan "
        ],
        background: [
          "Dasar"
        ],
        but: [
          "* ",
          "Tapi ",
          "Nanging ",
          "Ananging "
        ],
        examples: [
          "Conto",
          "Contone"
        ],
        feature: [
          "Fitur"
        ],
        given: [
          "* ",
          "Nalika ",
          "Nalikaning "
        ],
        name: "Javanese",
        native: "Basa Jawa",
        rule: [
          "Rule"
        ],
        scenario: [
          "Skenario"
        ],
        scenarioOutline: [
          "Konsep skenario"
        ],
        then: [
          "* ",
          "Njuk ",
          "Banjur "
        ],
        when: [
          "* ",
          "Manawa ",
          "Menawa "
        ]
      },
      ka: {
        and: [
          "* ",
          "\u10D3\u10D0 ",
          "\u10D0\u10E1\u10D4\u10D5\u10D4 "
        ],
        background: [
          "\u10D9\u10DD\u10DC\u10E2\u10D4\u10E5\u10E1\u10E2\u10D8"
        ],
        but: [
          "* ",
          "\u10DB\u10D0\u10D2\u10E0\u10D0\u10DB ",
          "\u10D7\u10E3\u10DB\u10EA\u10D0 "
        ],
        examples: [
          "\u10DB\u10D0\u10D2\u10D0\u10DA\u10D8\u10D7\u10D4\u10D1\u10D8"
        ],
        feature: [
          "\u10D7\u10D5\u10D8\u10E1\u10D4\u10D1\u10D0",
          "\u10DB\u10DD\u10D7\u10EE\u10DD\u10D5\u10DC\u10D0"
        ],
        given: [
          "* ",
          "\u10DB\u10DD\u10EA\u10D4\u10DB\u10E3\u10DA\u10D8 ",
          "\u10DB\u10DD\u10EA\u10D4\u10DB\u10E3\u10DA\u10D8\u10D0 ",
          "\u10D5\u10D7\u10E5\u10D5\u10D0\u10D7 "
        ],
        name: "Georgian",
        native: "\u10E5\u10D0\u10E0\u10D7\u10E3\u10DA\u10D8",
        rule: [
          "\u10EC\u10D4\u10E1\u10D8"
        ],
        scenario: [
          "\u10DB\u10D0\u10D2\u10D0\u10DA\u10D8\u10D7\u10D0\u10D3",
          "\u10DB\u10D0\u10D2\u10D0\u10DA\u10D8\u10D7\u10D8",
          "\u10DB\u10D0\u10D2",
          "\u10E1\u10EA\u10D4\u10DC\u10D0\u10E0\u10D8"
        ],
        scenarioOutline: [
          "\u10E1\u10EA\u10D4\u10DC\u10D0\u10E0\u10D8\u10E1 \u10DC\u10D8\u10DB\u10E3\u10E8\u10D8",
          "\u10E1\u10EA\u10D4\u10DC\u10D0\u10E0\u10D8\u10E1 \u10E8\u10D0\u10D1\u10DA\u10DD\u10DC\u10D8",
          "\u10DC\u10D8\u10DB\u10E3\u10E8\u10D8",
          "\u10E8\u10D0\u10D1\u10DA\u10DD\u10DC\u10D8"
        ],
        then: [
          "* ",
          "\u10DB\u10D0\u10E8\u10D8\u10DC "
        ],
        when: [
          "* ",
          "\u10E0\u10DD\u10D3\u10D4\u10E1\u10D0\u10EA ",
          "\u10E0\u10DD\u10EA\u10D0 ",
          "\u10E0\u10DD\u10D2\u10DD\u10E0\u10EA \u10D9\u10D8 ",
          "\u10D7\u10E3 "
        ]
      },
      kn: {
        and: [
          "* ",
          "\u0CAE\u0CA4\u0CCD\u0CA4\u0CC1 "
        ],
        background: [
          "\u0CB9\u0CBF\u0CA8\u0CCD\u0CA8\u0CC6\u0CB2\u0CC6"
        ],
        but: [
          "* ",
          "\u0C86\u0CA6\u0CB0\u0CC6 "
        ],
        examples: [
          "\u0C89\u0CA6\u0CBE\u0CB9\u0CB0\u0CA3\u0CC6\u0C97\u0CB3\u0CC1"
        ],
        feature: [
          "\u0CB9\u0CC6\u0C9A\u0CCD\u0C9A\u0CB3"
        ],
        given: [
          "* ",
          "\u0CA8\u0CBF\u0CD5\u0CA1\u0CBF\u0CA6 "
        ],
        name: "Kannada",
        native: "\u0C95\u0CA8\u0CCD\u0CA8\u0CA1",
        rule: [
          "Rule"
        ],
        scenario: [
          "\u0C89\u0CA6\u0CBE\u0CB9\u0CB0\u0CA3\u0CC6",
          "\u0C95\u0CA5\u0CBE\u0CB8\u0CBE\u0CB0\u0CBE\u0C82\u0CB6"
        ],
        scenarioOutline: [
          "\u0CB5\u0CBF\u0CB5\u0CB0\u0CA3\u0CC6"
        ],
        then: [
          "* ",
          "\u0CA8\u0C82\u0CA4\u0CB0 "
        ],
        when: [
          "* ",
          "\u0CB8\u0CCD\u0CA5\u0CBF\u0CA4\u0CBF\u0CAF\u0CA8\u0CCD\u0CA8\u0CC1 "
        ]
      },
      ko: {
        and: [
          "* ",
          "\uADF8\uB9AC\uACE0 "
        ],
        background: [
          "\uBC30\uACBD"
        ],
        but: [
          "* ",
          "\uD558\uC9C0\uB9CC ",
          "\uB2E8 "
        ],
        examples: [
          "\uC608"
        ],
        feature: [
          "\uAE30\uB2A5"
        ],
        given: [
          "* ",
          "\uC870\uAC74 ",
          "\uBA3C\uC800 "
        ],
        name: "Korean",
        native: "\uD55C\uAD6D\uC5B4",
        rule: [
          "\uADDC\uCE59"
        ],
        scenario: [
          "\uC2DC\uB098\uB9AC\uC624"
        ],
        scenarioOutline: [
          "\uC2DC\uB098\uB9AC\uC624 \uAC1C\uC694"
        ],
        then: [
          "* ",
          "\uADF8\uB7EC\uBA74 "
        ],
        when: [
          "* ",
          "\uB9CC\uC77C ",
          "\uB9CC\uC57D "
        ]
      },
      lt: {
        and: [
          "* ",
          "Ir "
        ],
        background: [
          "Kontekstas"
        ],
        but: [
          "* ",
          "Bet "
        ],
        examples: [
          "Pavyzd\u017Eiai",
          "Scenarijai",
          "Variantai"
        ],
        feature: [
          "Savyb\u0117"
        ],
        given: [
          "* ",
          "Duota "
        ],
        name: "Lithuanian",
        native: "lietuvi\u0173 kalba",
        rule: [
          "Rule"
        ],
        scenario: [
          "Pavyzdys",
          "Scenarijus"
        ],
        scenarioOutline: [
          "Scenarijaus \u0161ablonas"
        ],
        then: [
          "* ",
          "Tada "
        ],
        when: [
          "* ",
          "Kai "
        ]
      },
      lu: {
        and: [
          "* ",
          "an ",
          "a "
        ],
        background: [
          "Hannergrond"
        ],
        but: [
          "* ",
          "awer ",
          "m\xE4 "
        ],
        examples: [
          "Beispiller"
        ],
        feature: [
          "Funktionalit\xE9it"
        ],
        given: [
          "* ",
          "ugeholl "
        ],
        name: "Luxemburgish",
        native: "L\xEBtzebuergesch",
        rule: [
          "Rule"
        ],
        scenario: [
          "Beispill",
          "Szenario"
        ],
        scenarioOutline: [
          "Plang vum Szenario"
        ],
        then: [
          "* ",
          "dann "
        ],
        when: [
          "* ",
          "wann "
        ]
      },
      lv: {
        and: [
          "* ",
          "Un "
        ],
        background: [
          "Konteksts",
          "Situ\u0101cija"
        ],
        but: [
          "* ",
          "Bet "
        ],
        examples: [
          "Piem\u0113ri",
          "Paraugs"
        ],
        feature: [
          "Funkcionalit\u0101te",
          "F\u012B\u010Da"
        ],
        given: [
          "* ",
          "Kad "
        ],
        name: "Latvian",
        native: "latvie\u0161u",
        rule: [
          "Rule"
        ],
        scenario: [
          "Piem\u0113rs",
          "Scen\u0101rijs"
        ],
        scenarioOutline: [
          "Scen\u0101rijs p\u0113c parauga"
        ],
        then: [
          "* ",
          "Tad "
        ],
        when: [
          "* ",
          "Ja "
        ]
      },
      "mk-Cyrl": {
        and: [
          "* ",
          "\u0418 "
        ],
        background: [
          "\u041A\u043E\u043D\u0442\u0435\u043A\u0441\u0442",
          "\u0421\u043E\u0434\u0440\u0436\u0438\u043D\u0430"
        ],
        but: [
          "* ",
          "\u041D\u043E "
        ],
        examples: [
          "\u041F\u0440\u0438\u043C\u0435\u0440\u0438",
          "\u0421\u0446\u0435\u043D\u0430\u0440\u0438\u0458\u0430"
        ],
        feature: [
          "\u0424\u0443\u043D\u043A\u0446\u0438\u043E\u043D\u0430\u043B\u043D\u043E\u0441\u0442",
          "\u0411\u0438\u0437\u043D\u0438\u0441 \u043F\u043E\u0442\u0440\u0435\u0431\u0430",
          "\u041C\u043E\u0436\u043D\u043E\u0441\u0442"
        ],
        given: [
          "* ",
          "\u0414\u0430\u0434\u0435\u043D\u043E ",
          "\u0414\u0430\u0434\u0435\u043D\u0430 "
        ],
        name: "Macedonian",
        native: "\u041C\u0430\u043A\u0435\u0434\u043E\u043D\u0441\u043A\u0438",
        rule: [
          "Rule"
        ],
        scenario: [
          "\u041F\u0440\u0438\u043C\u0435\u0440",
          "\u0421\u0446\u0435\u043D\u0430\u0440\u0438\u043E",
          "\u041D\u0430 \u043F\u0440\u0438\u043C\u0435\u0440"
        ],
        scenarioOutline: [
          "\u041F\u0440\u0435\u0433\u043B\u0435\u0434 \u043D\u0430 \u0441\u0446\u0435\u043D\u0430\u0440\u0438\u0458\u0430",
          "\u0421\u043A\u0438\u0446\u0430",
          "\u041A\u043E\u043D\u0446\u0435\u043F\u0442"
        ],
        then: [
          "* ",
          "\u0422\u043E\u0433\u0430\u0448 "
        ],
        when: [
          "* ",
          "\u041A\u043E\u0433\u0430 "
        ]
      },
      "mk-Latn": {
        and: [
          "* ",
          "I "
        ],
        background: [
          "Kontekst",
          "Sodrzhina"
        ],
        but: [
          "* ",
          "No "
        ],
        examples: [
          "Primeri",
          "Scenaria"
        ],
        feature: [
          "Funkcionalnost",
          "Biznis potreba",
          "Mozhnost"
        ],
        given: [
          "* ",
          "Dadeno ",
          "Dadena "
        ],
        name: "Macedonian (Latin)",
        native: "Makedonski (Latinica)",
        rule: [
          "Rule"
        ],
        scenario: [
          "Scenario",
          "Na primer"
        ],
        scenarioOutline: [
          "Pregled na scenarija",
          "Skica",
          "Koncept"
        ],
        then: [
          "* ",
          "Togash "
        ],
        when: [
          "* ",
          "Koga "
        ]
      },
      mn: {
        and: [
          "* ",
          "\u041C\u04E9\u043D ",
          "\u0422\u044D\u0433\u044D\u044D\u0434 "
        ],
        background: [
          "\u0410\u0433\u0443\u0443\u043B\u0433\u0430"
        ],
        but: [
          "* ",
          "\u0413\u044D\u0445\u0434\u044D\u044D ",
          "\u0425\u0430\u0440\u0438\u043D "
        ],
        examples: [
          "\u0422\u0443\u0445\u0430\u0439\u043B\u0431\u0430\u043B"
        ],
        feature: [
          "\u0424\u0443\u043D\u043A\u0446",
          "\u0424\u0443\u043D\u043A\u0446\u0438\u043E\u043D\u0430\u043B"
        ],
        given: [
          "* ",
          "\u04E8\u0433\u04E9\u0433\u0434\u0441\u04E9\u043D \u043D\u044C ",
          "\u0410\u043D\u0445 "
        ],
        name: "Mongolian",
        native: "\u043C\u043E\u043D\u0433\u043E\u043B",
        rule: [
          "Rule"
        ],
        scenario: [
          "\u0421\u0446\u0435\u043D\u0430\u0440"
        ],
        scenarioOutline: [
          "\u0421\u0446\u0435\u043D\u0430\u0440\u044B\u043D \u0442\u04E9\u043B\u04E9\u0432\u043B\u04E9\u0433\u04E9\u04E9"
        ],
        then: [
          "* ",
          "\u0422\u044D\u0433\u044D\u0445\u044D\u0434 ",
          "\u04AE\u04AF\u043D\u0438\u0439 \u0434\u0430\u0440\u0430\u0430 "
        ],
        when: [
          "* ",
          "\u0425\u044D\u0440\u044D\u0432 "
        ]
      },
      ne: {
        and: [
          "* ",
          "\u0930 ",
          "\u0905\u0928\u093F "
        ],
        background: [
          "\u092A\u0943\u0937\u094D\u0920\u092D\u0942\u092E\u0940"
        ],
        but: [
          "* ",
          "\u0924\u0930 "
        ],
        examples: [
          "\u0909\u0926\u093E\u0939\u0930\u0923",
          "\u0909\u0926\u093E\u0939\u0930\u0923\u0939\u0930\u0941"
        ],
        feature: [
          "\u0938\u0941\u0935\u093F\u0927\u093E",
          "\u0935\u093F\u0936\u0947\u0937\u0924\u093E"
        ],
        given: [
          "* ",
          "\u0926\u093F\u0907\u090F\u0915\u094B ",
          "\u0926\u093F\u090F\u0915\u094B ",
          "\u092F\u0926\u093F "
        ],
        name: "Nepali",
        native: "\u0928\u0947\u092A\u093E\u0932\u0940",
        rule: [
          "\u0928\u093F\u092F\u092E"
        ],
        scenario: [
          "\u092A\u0930\u093F\u0926\u0943\u0936\u094D\u092F"
        ],
        scenarioOutline: [
          "\u092A\u0930\u093F\u0926\u0943\u0936\u094D\u092F \u0930\u0942\u092A\u0930\u0947\u0916\u093E"
        ],
        then: [
          "* ",
          "\u0924\u094D\u092F\u0938\u092A\u091B\u093F ",
          "\u0905\u0928\u0940 "
        ],
        when: [
          "* ",
          "\u091C\u092C "
        ]
      },
      nl: {
        and: [
          "* ",
          "En "
        ],
        background: [
          "Achtergrond"
        ],
        but: [
          "* ",
          "Maar "
        ],
        examples: [
          "Voorbeelden"
        ],
        feature: [
          "Functionaliteit"
        ],
        given: [
          "* ",
          "Gegeven ",
          "Stel "
        ],
        name: "Dutch",
        native: "Nederlands",
        rule: [
          "Regel"
        ],
        scenario: [
          "Voorbeeld",
          "Scenario"
        ],
        scenarioOutline: [
          "Abstract Scenario"
        ],
        then: [
          "* ",
          "Dan "
        ],
        when: [
          "* ",
          "Als ",
          "Wanneer "
        ]
      },
      no: {
        and: [
          "* ",
          "Og "
        ],
        background: [
          "Bakgrunn"
        ],
        but: [
          "* ",
          "Men "
        ],
        examples: [
          "Eksempler"
        ],
        feature: [
          "Egenskap"
        ],
        given: [
          "* ",
          "Gitt "
        ],
        name: "Norwegian",
        native: "norsk",
        rule: [
          "Regel"
        ],
        scenario: [
          "Eksempel",
          "Scenario"
        ],
        scenarioOutline: [
          "Scenariomal",
          "Abstrakt Scenario"
        ],
        then: [
          "* ",
          "S\xE5 "
        ],
        when: [
          "* ",
          "N\xE5r "
        ]
      },
      pa: {
        and: [
          "* ",
          "\u0A05\u0A24\u0A47 "
        ],
        background: [
          "\u0A2A\u0A3F\u0A1B\u0A4B\u0A15\u0A5C"
        ],
        but: [
          "* ",
          "\u0A2A\u0A30 "
        ],
        examples: [
          "\u0A09\u0A26\u0A3E\u0A39\u0A30\u0A28\u0A3E\u0A02"
        ],
        feature: [
          "\u0A16\u0A3E\u0A38\u0A40\u0A05\u0A24",
          "\u0A2E\u0A41\u0A39\u0A3E\u0A02\u0A26\u0A30\u0A3E",
          "\u0A28\u0A15\u0A36 \u0A28\u0A41\u0A39\u0A3E\u0A30"
        ],
        given: [
          "* ",
          "\u0A1C\u0A47\u0A15\u0A30 ",
          "\u0A1C\u0A3F\u0A35\u0A47\u0A02 \u0A15\u0A3F "
        ],
        name: "Panjabi",
        native: "\u0A2A\u0A70\u0A1C\u0A3E\u0A2C\u0A40",
        rule: [
          "Rule"
        ],
        scenario: [
          "\u0A09\u0A26\u0A3E\u0A39\u0A30\u0A28",
          "\u0A2A\u0A1F\u0A15\u0A25\u0A3E"
        ],
        scenarioOutline: [
          "\u0A2A\u0A1F\u0A15\u0A25\u0A3E \u0A22\u0A3E\u0A02\u0A1A\u0A3E",
          "\u0A2A\u0A1F\u0A15\u0A25\u0A3E \u0A30\u0A42\u0A2A \u0A30\u0A47\u0A16\u0A3E"
        ],
        then: [
          "* ",
          "\u0A24\u0A26 "
        ],
        when: [
          "* ",
          "\u0A1C\u0A26\u0A4B\u0A02 "
        ]
      },
      pl: {
        and: [
          "* ",
          "Oraz ",
          "I "
        ],
        background: [
          "Za\u0142o\u017Cenia"
        ],
        but: [
          "* ",
          "Ale "
        ],
        examples: [
          "Przyk\u0142ady"
        ],
        feature: [
          "W\u0142a\u015Bciwo\u015B\u0107",
          "Funkcja",
          "Aspekt",
          "Potrzeba biznesowa"
        ],
        given: [
          "* ",
          "Zak\u0142adaj\u0105c ",
          "Maj\u0105c ",
          "Zak\u0142adaj\u0105c, \u017Ce "
        ],
        name: "Polish",
        native: "polski",
        rule: [
          "Zasada",
          "Regu\u0142a"
        ],
        scenario: [
          "Przyk\u0142ad",
          "Scenariusz"
        ],
        scenarioOutline: [
          "Szablon scenariusza"
        ],
        then: [
          "* ",
          "Wtedy "
        ],
        when: [
          "* ",
          "Je\u017Celi ",
          "Je\u015Bli ",
          "Gdy ",
          "Kiedy "
        ]
      },
      pt: {
        and: [
          "* ",
          "E "
        ],
        background: [
          "Contexto",
          "Cen\xE1rio de Fundo",
          "Cenario de Fundo",
          "Fundo"
        ],
        but: [
          "* ",
          "Mas "
        ],
        examples: [
          "Exemplos",
          "Cen\xE1rios",
          "Cenarios"
        ],
        feature: [
          "Funcionalidade",
          "Caracter\xEDstica",
          "Caracteristica"
        ],
        given: [
          "* ",
          "Dado ",
          "Dada ",
          "Dados ",
          "Dadas "
        ],
        name: "Portuguese",
        native: "portugu\xEAs",
        rule: [
          "Regra"
        ],
        scenario: [
          "Exemplo",
          "Cen\xE1rio",
          "Cenario"
        ],
        scenarioOutline: [
          "Esquema do Cen\xE1rio",
          "Esquema do Cenario",
          "Delinea\xE7\xE3o do Cen\xE1rio",
          "Delineacao do Cenario"
        ],
        then: [
          "* ",
          "Ent\xE3o ",
          "Entao "
        ],
        when: [
          "* ",
          "Quando "
        ]
      },
      ro: {
        and: [
          "* ",
          "Si ",
          "\u0218i ",
          "\u015Ei "
        ],
        background: [
          "Context"
        ],
        but: [
          "* ",
          "Dar "
        ],
        examples: [
          "Exemple"
        ],
        feature: [
          "Functionalitate",
          "Func\u021Bionalitate",
          "Func\u0163ionalitate"
        ],
        given: [
          "* ",
          "Date fiind ",
          "Dat fiind ",
          "Dat\u0103 fiind",
          "Dati fiind ",
          "Da\u021Bi fiind ",
          "Da\u0163i fiind "
        ],
        name: "Romanian",
        native: "rom\xE2n\u0103",
        rule: [
          "Rule"
        ],
        scenario: [
          "Exemplu",
          "Scenariu"
        ],
        scenarioOutline: [
          "Structura scenariu",
          "Structur\u0103 scenariu"
        ],
        then: [
          "* ",
          "Atunci "
        ],
        when: [
          "* ",
          "Cand ",
          "C\xE2nd "
        ]
      },
      ru: {
        and: [
          "* ",
          "\u0418 ",
          "\u041A \u0442\u043E\u043C\u0443 \u0436\u0435 ",
          "\u0422\u0430\u043A\u0436\u0435 "
        ],
        background: [
          "\u041F\u0440\u0435\u0434\u044B\u0441\u0442\u043E\u0440\u0438\u044F",
          "\u041A\u043E\u043D\u0442\u0435\u043A\u0441\u0442"
        ],
        but: [
          "* ",
          "\u041D\u043E ",
          "\u0410 ",
          "\u0418\u043D\u0430\u0447\u0435 "
        ],
        examples: [
          "\u041F\u0440\u0438\u043C\u0435\u0440\u044B",
          "\u0417\u043D\u0430\u0447\u0435\u043D\u0438\u044F"
        ],
        feature: [
          "\u0424\u0443\u043D\u043A\u0446\u0438\u044F",
          "\u0424\u0443\u043D\u043A\u0446\u0438\u043E\u043D\u0430\u043B\u044C\u043D\u043E\u0441\u0442\u044C",
          "\u0424\u0443\u043D\u043A\u0446\u0438\u043E\u043D\u0430\u043B",
          "\u0421\u0432\u043E\u0439\u0441\u0442\u0432\u043E",
          "\u0424\u0438\u0447\u0430"
        ],
        given: [
          "* ",
          "\u0414\u043E\u043F\u0443\u0441\u0442\u0438\u043C ",
          "\u0414\u0430\u043D\u043E ",
          "\u041F\u0443\u0441\u0442\u044C "
        ],
        name: "Russian",
        native: "\u0440\u0443\u0441\u0441\u043A\u0438\u0439",
        rule: [
          "\u041F\u0440\u0430\u0432\u0438\u043B\u043E"
        ],
        scenario: [
          "\u041F\u0440\u0438\u043C\u0435\u0440",
          "\u0421\u0446\u0435\u043D\u0430\u0440\u0438\u0439"
        ],
        scenarioOutline: [
          "\u0421\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u0430 \u0441\u0446\u0435\u043D\u0430\u0440\u0438\u044F",
          "\u0428\u0430\u0431\u043B\u043E\u043D \u0441\u0446\u0435\u043D\u0430\u0440\u0438\u044F"
        ],
        then: [
          "* ",
          "\u0422\u043E ",
          "\u0417\u0430\u0442\u0435\u043C ",
          "\u0422\u043E\u0433\u0434\u0430 "
        ],
        when: [
          "* ",
          "\u041A\u043E\u0433\u0434\u0430 ",
          "\u0415\u0441\u043B\u0438 "
        ]
      },
      sk: {
        and: [
          "* ",
          "A ",
          "A tie\u017E ",
          "A taktie\u017E ",
          "A z\xE1rove\u0148 "
        ],
        background: [
          "Pozadie"
        ],
        but: [
          "* ",
          "Ale "
        ],
        examples: [
          "Pr\xEDklady"
        ],
        feature: [
          "Po\u017Eiadavka",
          "Funkcia",
          "Vlastnos\u0165"
        ],
        given: [
          "* ",
          "Pokia\u013E ",
          "Za predpokladu "
        ],
        name: "Slovak",
        native: "Slovensky",
        rule: [
          "Rule"
        ],
        scenario: [
          "Pr\xEDklad",
          "Scen\xE1r"
        ],
        scenarioOutline: [
          "N\xE1\u010Drt Scen\xE1ru",
          "N\xE1\u010Drt Scen\xE1ra",
          "Osnova Scen\xE1ra"
        ],
        then: [
          "* ",
          "Tak ",
          "Potom "
        ],
        when: [
          "* ",
          "Ke\u010F ",
          "Ak "
        ]
      },
      sl: {
        and: [
          "In ",
          "Ter "
        ],
        background: [
          "Kontekst",
          "Osnova",
          "Ozadje"
        ],
        but: [
          "Toda ",
          "Ampak ",
          "Vendar "
        ],
        examples: [
          "Primeri",
          "Scenariji"
        ],
        feature: [
          "Funkcionalnost",
          "Funkcija",
          "Mo\u017Enosti",
          "Moznosti",
          "Lastnost",
          "Zna\u010Dilnost"
        ],
        given: [
          "Dano ",
          "Podano ",
          "Zaradi ",
          "Privzeto "
        ],
        name: "Slovenian",
        native: "Slovenski",
        rule: [
          "Rule"
        ],
        scenario: [
          "Primer",
          "Scenarij"
        ],
        scenarioOutline: [
          "Struktura scenarija",
          "Skica",
          "Koncept",
          "Oris scenarija",
          "Osnutek"
        ],
        then: [
          "Nato ",
          "Potem ",
          "Takrat "
        ],
        when: [
          "Ko ",
          "Ce ",
          "\u010Ce ",
          "Kadar "
        ]
      },
      "sr-Cyrl": {
        and: [
          "* ",
          "\u0418 "
        ],
        background: [
          "\u041A\u043E\u043D\u0442\u0435\u043A\u0441\u0442",
          "\u041E\u0441\u043D\u043E\u0432\u0430",
          "\u041F\u043E\u0437\u0430\u0434\u0438\u043D\u0430"
        ],
        but: [
          "* ",
          "\u0410\u043B\u0438 "
        ],
        examples: [
          "\u041F\u0440\u0438\u043C\u0435\u0440\u0438",
          "\u0421\u0446\u0435\u043D\u0430\u0440\u0438\u0458\u0438"
        ],
        feature: [
          "\u0424\u0443\u043D\u043A\u0446\u0438\u043E\u043D\u0430\u043B\u043D\u043E\u0441\u0442",
          "\u041C\u043E\u0433\u0443\u045B\u043D\u043E\u0441\u0442",
          "\u041E\u0441\u043E\u0431\u0438\u043D\u0430"
        ],
        given: [
          "* ",
          "\u0417\u0430 \u0434\u0430\u0442\u043E ",
          "\u0417\u0430 \u0434\u0430\u0442\u0435 ",
          "\u0417\u0430 \u0434\u0430\u0442\u0438 "
        ],
        name: "Serbian",
        native: "\u0421\u0440\u043F\u0441\u043A\u0438",
        rule: [
          "\u041F\u0440\u0430\u0432\u0438\u043B\u043E"
        ],
        scenario: [
          "\u0421\u0446\u0435\u043D\u0430\u0440\u0438\u043E",
          "\u041F\u0440\u0438\u043C\u0435\u0440"
        ],
        scenarioOutline: [
          "\u0421\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u0430 \u0441\u0446\u0435\u043D\u0430\u0440\u0438\u0458\u0430",
          "\u0421\u043A\u0438\u0446\u0430",
          "\u041A\u043E\u043D\u0446\u0435\u043F\u0442"
        ],
        then: [
          "* ",
          "\u041E\u043D\u0434\u0430 "
        ],
        when: [
          "* ",
          "\u041A\u0430\u0434\u0430 ",
          "\u041A\u0430\u0434 "
        ]
      },
      "sr-Latn": {
        and: [
          "* ",
          "I "
        ],
        background: [
          "Kontekst",
          "Osnova",
          "Pozadina"
        ],
        but: [
          "* ",
          "Ali "
        ],
        examples: [
          "Primeri",
          "Scenariji"
        ],
        feature: [
          "Funkcionalnost",
          "Mogu\u0107nost",
          "Mogucnost",
          "Osobina"
        ],
        given: [
          "* ",
          "Za dato ",
          "Za date ",
          "Za dati "
        ],
        name: "Serbian (Latin)",
        native: "Srpski (Latinica)",
        rule: [
          "Pravilo"
        ],
        scenario: [
          "Scenario",
          "Primer"
        ],
        scenarioOutline: [
          "Struktura scenarija",
          "Skica",
          "Koncept"
        ],
        then: [
          "* ",
          "Onda "
        ],
        when: [
          "* ",
          "Kada ",
          "Kad "
        ]
      },
      sv: {
        and: [
          "* ",
          "Och "
        ],
        background: [
          "Bakgrund"
        ],
        but: [
          "* ",
          "Men "
        ],
        examples: [
          "Exempel"
        ],
        feature: [
          "Egenskap"
        ],
        given: [
          "* ",
          "Givet "
        ],
        name: "Swedish",
        native: "Svenska",
        rule: [
          "Regel"
        ],
        scenario: [
          "Scenario"
        ],
        scenarioOutline: [
          "Abstrakt Scenario",
          "Scenariomall"
        ],
        then: [
          "* ",
          "S\xE5 "
        ],
        when: [
          "* ",
          "N\xE4r "
        ]
      },
      ta: {
        and: [
          "* ",
          "\u0BAE\u0BC7\u0BB2\u0BC1\u0BAE\u0BCD ",
          "\u0BAE\u0BB1\u0BCD\u0BB1\u0BC1\u0BAE\u0BCD "
        ],
        background: [
          "\u0BAA\u0BBF\u0BA9\u0BCD\u0BA9\u0BA3\u0BBF"
        ],
        but: [
          "* ",
          "\u0B86\u0BA9\u0BBE\u0BB2\u0BCD "
        ],
        examples: [
          "\u0B8E\u0B9F\u0BC1\u0BA4\u0BCD\u0BA4\u0BC1\u0B95\u0BCD\u0B95\u0BBE\u0B9F\u0BCD\u0B9F\u0BC1\u0B95\u0BB3\u0BCD",
          "\u0B95\u0BBE\u0B9F\u0BCD\u0B9A\u0BBF\u0B95\u0BB3\u0BCD",
          "\u0BA8\u0BBF\u0BB2\u0BC8\u0BAE\u0BC8\u0B95\u0BB3\u0BBF\u0BB2\u0BCD"
        ],
        feature: [
          "\u0B85\u0BAE\u0BCD\u0B9A\u0BAE\u0BCD",
          "\u0BB5\u0BA3\u0BBF\u0B95 \u0BA4\u0BC7\u0BB5\u0BC8",
          "\u0BA4\u0BBF\u0BB1\u0BA9\u0BCD"
        ],
        given: [
          "* ",
          "\u0B95\u0BC6\u0BBE\u0B9F\u0BC1\u0B95\u0BCD\u0B95\u0BAA\u0BCD\u0BAA\u0B9F\u0BCD\u0B9F "
        ],
        name: "Tamil",
        native: "\u0BA4\u0BAE\u0BBF\u0BB4\u0BCD",
        rule: [
          "Rule"
        ],
        scenario: [
          "\u0B89\u0BA4\u0BBE\u0BB0\u0BA3\u0BAE\u0BBE\u0B95",
          "\u0B95\u0BBE\u0B9F\u0BCD\u0B9A\u0BBF"
        ],
        scenarioOutline: [
          "\u0B95\u0BBE\u0B9F\u0BCD\u0B9A\u0BBF \u0B9A\u0BC1\u0BB0\u0BC1\u0B95\u0BCD\u0B95\u0BAE\u0BCD",
          "\u0B95\u0BBE\u0B9F\u0BCD\u0B9A\u0BBF \u0BB5\u0BBE\u0BB0\u0BCD\u0BAA\u0BCD\u0BAA\u0BC1\u0BB0\u0BC1"
        ],
        then: [
          "* ",
          "\u0B85\u0BAA\u0BCD\u0BAA\u0BC6\u0BBE\u0BB4\u0BC1\u0BA4\u0BC1 "
        ],
        when: [
          "* ",
          "\u0B8E\u0BAA\u0BCD\u0BAA\u0BC7\u0BBE\u0BA4\u0BC1 "
        ]
      },
      th: {
        and: [
          "* ",
          "\u0E41\u0E25\u0E30 "
        ],
        background: [
          "\u0E41\u0E19\u0E27\u0E04\u0E34\u0E14"
        ],
        but: [
          "* ",
          "\u0E41\u0E15\u0E48 "
        ],
        examples: [
          "\u0E0A\u0E38\u0E14\u0E02\u0E2D\u0E07\u0E15\u0E31\u0E27\u0E2D\u0E22\u0E48\u0E32\u0E07",
          "\u0E0A\u0E38\u0E14\u0E02\u0E2D\u0E07\u0E40\u0E2B\u0E15\u0E38\u0E01\u0E32\u0E23\u0E13\u0E4C"
        ],
        feature: [
          "\u0E42\u0E04\u0E23\u0E07\u0E2B\u0E25\u0E31\u0E01",
          "\u0E04\u0E27\u0E32\u0E21\u0E15\u0E49\u0E2D\u0E07\u0E01\u0E32\u0E23\u0E17\u0E32\u0E07\u0E18\u0E38\u0E23\u0E01\u0E34\u0E08",
          "\u0E04\u0E27\u0E32\u0E21\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16"
        ],
        given: [
          "* ",
          "\u0E01\u0E33\u0E2B\u0E19\u0E14\u0E43\u0E2B\u0E49 "
        ],
        name: "Thai",
        native: "\u0E44\u0E17\u0E22",
        rule: [
          "Rule"
        ],
        scenario: [
          "\u0E40\u0E2B\u0E15\u0E38\u0E01\u0E32\u0E23\u0E13\u0E4C"
        ],
        scenarioOutline: [
          "\u0E2A\u0E23\u0E38\u0E1B\u0E40\u0E2B\u0E15\u0E38\u0E01\u0E32\u0E23\u0E13\u0E4C",
          "\u0E42\u0E04\u0E23\u0E07\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E02\u0E2D\u0E07\u0E40\u0E2B\u0E15\u0E38\u0E01\u0E32\u0E23\u0E13\u0E4C"
        ],
        then: [
          "* ",
          "\u0E14\u0E31\u0E07\u0E19\u0E31\u0E49\u0E19 "
        ],
        when: [
          "* ",
          "\u0E40\u0E21\u0E37\u0E48\u0E2D "
        ]
      },
      te: {
        and: [
          "* ",
          "\u0C2E\u0C30\u0C3F\u0C2F\u0C41 "
        ],
        background: [
          "\u0C28\u0C47\u0C2A\u0C25\u0C4D\u0C2F\u0C02"
        ],
        but: [
          "* ",
          "\u0C15\u0C3E\u0C28\u0C3F "
        ],
        examples: [
          "\u0C09\u0C26\u0C3E\u0C39\u0C30\u0C23\u0C32\u0C41"
        ],
        feature: [
          "\u0C17\u0C41\u0C23\u0C2E\u0C41"
        ],
        given: [
          "* ",
          "\u0C1A\u0C46\u0C2A\u0C4D\u0C2A\u0C2C\u0C21\u0C3F\u0C28\u0C26\u0C3F "
        ],
        name: "Telugu",
        native: "\u0C24\u0C46\u0C32\u0C41\u0C17\u0C41",
        rule: [
          "Rule"
        ],
        scenario: [
          "\u0C09\u0C26\u0C3E\u0C39\u0C30\u0C23",
          "\u0C38\u0C28\u0C4D\u0C28\u0C3F\u0C35\u0C47\u0C36\u0C02"
        ],
        scenarioOutline: [
          "\u0C15\u0C25\u0C28\u0C02"
        ],
        then: [
          "* ",
          "\u0C05\u0C2A\u0C4D\u0C2A\u0C41\u0C21\u0C41 "
        ],
        when: [
          "* ",
          "\u0C08 \u0C2A\u0C30\u0C3F\u0C38\u0C4D\u0C25\u0C3F\u0C24\u0C3F\u0C32\u0C4B "
        ]
      },
      tlh: {
        and: [
          "* ",
          "'ej ",
          "latlh "
        ],
        background: [
          "mo'"
        ],
        but: [
          "* ",
          "'ach ",
          "'a "
        ],
        examples: [
          "ghantoH",
          "lutmey"
        ],
        feature: [
          "Qap",
          "Qu'meH 'ut",
          "perbogh",
          "poQbogh malja'",
          "laH"
        ],
        given: [
          "* ",
          "ghu' noblu' ",
          "DaH ghu' bejlu' "
        ],
        name: "Klingon",
        native: "tlhIngan",
        rule: [
          "Rule"
        ],
        scenario: [
          "lut"
        ],
        scenarioOutline: [
          "lut chovnatlh"
        ],
        then: [
          "* ",
          "vaj "
        ],
        when: [
          "* ",
          "qaSDI' "
        ]
      },
      tr: {
        and: [
          "* ",
          "Ve ",
          "Hem de ",
          "Bir de ",
          "Ayr\u0131ca ",
          "\u0130laveten ",
          "Buna ek olarak "
        ],
        background: [
          "Ge\xE7mi\u015F",
          "Arka Plan",
          "\xD6n Ko\u015Ful",
          "\xD6nko\u015Ful",
          "\xD6nceki Durum",
          "Giri\u015F",
          "Mukaddime",
          "Mevcut Durum"
        ],
        but: [
          "* ",
          "Fakat ",
          "Ama ",
          "Ancak ",
          "Yaln\u0131z ",
          "Lakin ",
          "Me\u011Fer ki ",
          "Buna mukabil ",
          "Aksi halde "
        ],
        examples: [
          "\xD6rnekler",
          "De\u011Ferler"
        ],
        feature: [
          "\xD6zellik",
          "\u0130\u015F Gereksinimi",
          "Gereksinim",
          "\u0130\u015Flev",
          "Kullan\u0131c\u0131 Hikayesi",
          "Yetenek",
          "Teknik Gereksinim"
        ],
        given: [
          "* ",
          "Mevcut ",
          "\xD6nceden ",
          "Ge\xE7mi\u015Fte ",
          "Daha \xF6nce ",
          "Halihaz\u0131rda ",
          "Zaten ",
          "Sistemde ",
          "Diyelim ki ",
          "Varsayal\u0131m ki ",
          "Farz edelim ki ",
          "Kabul edelim ki ",
          "Ba\u015Flang\u0131\xE7ta ",
          "Varsay\u0131lan olarak ",
          "Biliniyor ki "
        ],
        name: "Turkish",
        native: "T\xFCrk\xE7e",
        rule: [
          "Kural",
          "\u0130\u015F Kural\u0131",
          "Kaide",
          "H\xFCk\xFCm",
          "Madde"
        ],
        scenario: [
          "\xD6rnek",
          "Senaryo",
          "Durum",
          "Vaka"
        ],
        scenarioOutline: [
          "Senaryo tasla\u011F\u0131",
          "Senaryo \u015Fablonu"
        ],
        then: [
          "* ",
          "Beklenen ",
          "O zaman ",
          "Sonu\xE7 olarak ",
          "B\xF6ylece ",
          "Bunun \xFCzerine ",
          "Bu durumda ",
          "O takdirde ",
          "\u015Eu halde ",
          "Netice itibariyle ",
          "Buna binaen "
        ],
        when: [
          "* ",
          "E\u011Fer ",
          "E\u011Fer ki ",
          "Ne zaman ",
          "Ne zaman ki ",
          "\u015Eayet "
        ]
      },
      tt: {
        and: [
          "* ",
          "\u04BA\u04D9\u043C ",
          "\u0412\u04D9 "
        ],
        background: [
          "\u041A\u0435\u0440\u0435\u0448"
        ],
        but: [
          "* ",
          "\u041B\u04D9\u043A\u0438\u043D ",
          "\u04D8\u043C\u043C\u0430 "
        ],
        examples: [
          "\u04AE\u0440\u043D\u04D9\u043A\u043B\u04D9\u0440",
          "\u041C\u0438\u0441\u0430\u043B\u043B\u0430\u0440"
        ],
        feature: [
          "\u041C\u04E9\u043C\u043A\u0438\u043D\u043B\u0435\u043A",
          "\u04AE\u0437\u0435\u043D\u0447\u04D9\u043B\u0435\u043A\u043B\u0435\u043B\u0435\u043A"
        ],
        given: [
          "* ",
          "\u04D8\u0439\u0442\u0438\u043A "
        ],
        name: "Tatar",
        native: "\u0422\u0430\u0442\u0430\u0440\u0447\u0430",
        rule: [
          "Rule"
        ],
        scenario: [
          "\u0421\u0446\u0435\u043D\u0430\u0440\u0438\u0439"
        ],
        scenarioOutline: [
          "\u0421\u0446\u0435\u043D\u0430\u0440\u0438\u0439\u043D\u044B\u04A3 \u0442\u04E9\u0437\u0435\u043B\u0435\u0448\u0435"
        ],
        then: [
          "* ",
          "\u041D\u04D9\u0442\u0438\u0497\u04D9\u0434\u04D9 "
        ],
        when: [
          "* ",
          "\u04D8\u0433\u04D9\u0440 "
        ]
      },
      uk: {
        and: [
          "* ",
          "\u0406 ",
          "\u0410 \u0442\u0430\u043A\u043E\u0436 ",
          "\u0422\u0430 "
        ],
        background: [
          "\u041F\u0435\u0440\u0435\u0434\u0443\u043C\u043E\u0432\u0430"
        ],
        but: [
          "* ",
          "\u0410\u043B\u0435 "
        ],
        examples: [
          "\u041F\u0440\u0438\u043A\u043B\u0430\u0434\u0438"
        ],
        feature: [
          "\u0424\u0443\u043D\u043A\u0446\u0456\u043E\u043D\u0430\u043B"
        ],
        given: [
          "* ",
          "\u041F\u0440\u0438\u043F\u0443\u0441\u0442\u0438\u043C\u043E ",
          "\u041F\u0440\u0438\u043F\u0443\u0441\u0442\u0438\u043C\u043E, \u0449\u043E ",
          "\u041D\u0435\u0445\u0430\u0439 ",
          "\u0414\u0430\u043D\u043E "
        ],
        name: "Ukrainian",
        native: "\u0423\u043A\u0440\u0430\u0457\u043D\u0441\u044C\u043A\u0430",
        rule: [
          "Rule"
        ],
        scenario: [
          "\u041F\u0440\u0438\u043A\u043B\u0430\u0434",
          "\u0421\u0446\u0435\u043D\u0430\u0440\u0456\u0439"
        ],
        scenarioOutline: [
          "\u0421\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u0430 \u0441\u0446\u0435\u043D\u0430\u0440\u0456\u044E"
        ],
        then: [
          "* ",
          "\u0422\u043E ",
          "\u0422\u043E\u0434\u0456 "
        ],
        when: [
          "* ",
          "\u042F\u043A\u0449\u043E ",
          "\u041A\u043E\u043B\u0438 "
        ]
      },
      ur: {
        and: [
          "* ",
          "\u0627\u0648\u0631 "
        ],
        background: [
          "\u067E\u0633 \u0645\u0646\u0638\u0631"
        ],
        but: [
          "* ",
          "\u0644\u06CC\u06A9\u0646 "
        ],
        examples: [
          "\u0645\u062B\u0627\u0644\u06CC\u06BA"
        ],
        feature: [
          "\u0635\u0644\u0627\u062D\u06CC\u062A",
          "\u06A9\u0627\u0631\u0648\u0628\u0627\u0631 \u06A9\u06CC \u0636\u0631\u0648\u0631\u062A",
          "\u062E\u0635\u0648\u0635\u06CC\u062A"
        ],
        given: [
          "* ",
          "\u0627\u06AF\u0631 ",
          "\u0628\u0627\u0644\u0641\u0631\u0636 ",
          "\u0641\u0631\u0636 \u06A9\u06CC\u0627 "
        ],
        name: "Urdu",
        native: "\u0627\u0631\u062F\u0648",
        rule: [
          "Rule"
        ],
        scenario: [
          "\u0645\u0646\u0638\u0631\u0646\u0627\u0645\u06C1"
        ],
        scenarioOutline: [
          "\u0645\u0646\u0638\u0631 \u0646\u0627\u0645\u06D2 \u06A9\u0627 \u062E\u0627\u06A9\u06C1"
        ],
        then: [
          "* ",
          "\u067E\u06BE\u0631 ",
          "\u062A\u0628 "
        ],
        when: [
          "* ",
          "\u062C\u0628 "
        ]
      },
      uz: {
        and: [
          "* ",
          "\u0412\u0430 "
        ],
        background: [
          "\u0422\u0430\u0440\u0438\u0445"
        ],
        but: [
          "* ",
          "\u041B\u0435\u043A\u0438\u043D ",
          "\u0411\u0438\u0440\u043E\u043A ",
          "\u0410\u043C\u043C\u043E "
        ],
        examples: [
          "\u041C\u0438\u0441\u043E\u043B\u043B\u0430\u0440"
        ],
        feature: [
          "\u0424\u0443\u043D\u043A\u0446\u0438\u043E\u043D\u0430\u043B"
        ],
        given: [
          "* ",
          "Belgilangan "
        ],
        name: "Uzbek",
        native: "\u0423\u0437\u0431\u0435\u043A\u0447\u0430",
        rule: [
          "Rule"
        ],
        scenario: [
          "\u0421\u0446\u0435\u043D\u0430\u0440\u0438\u0439"
        ],
        scenarioOutline: [
          "\u0421\u0446\u0435\u043D\u0430\u0440\u0438\u0439 \u0441\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u0430\u0441\u0438"
        ],
        then: [
          "* ",
          "\u0423\u043D\u0434\u0430 "
        ],
        when: [
          "* ",
          "\u0410\u0433\u0430\u0440 "
        ]
      },
      vi: {
        and: [
          "* ",
          "V\xE0 "
        ],
        background: [
          "B\u1ED1i c\u1EA3nh"
        ],
        but: [
          "* ",
          "Nh\u01B0ng "
        ],
        examples: [
          "D\u1EEF li\u1EC7u"
        ],
        feature: [
          "T\xEDnh n\u0103ng"
        ],
        given: [
          "* ",
          "Bi\u1EBFt ",
          "Cho "
        ],
        name: "Vietnamese",
        native: "Ti\u1EBFng Vi\u1EC7t",
        rule: [
          "Quy t\u1EAFc"
        ],
        scenario: [
          "T\xECnh hu\u1ED1ng",
          "K\u1ECBch b\u1EA3n"
        ],
        scenarioOutline: [
          "Khung t\xECnh hu\u1ED1ng",
          "Khung k\u1ECBch b\u1EA3n"
        ],
        then: [
          "* ",
          "Th\xEC "
        ],
        when: [
          "* ",
          "Khi "
        ]
      },
      "zh-CN": {
        and: [
          "* ",
          "\u800C\u4E14",
          "\u5E76\u4E14",
          "\u540C\u65F6"
        ],
        background: [
          "\u80CC\u666F"
        ],
        but: [
          "* ",
          "\u4F46\u662F"
        ],
        examples: [
          "\u4F8B\u5B50"
        ],
        feature: [
          "\u529F\u80FD"
        ],
        given: [
          "* ",
          "\u5047\u5982",
          "\u5047\u8BBE",
          "\u5047\u5B9A"
        ],
        name: "Chinese simplified",
        native: "\u7B80\u4F53\u4E2D\u6587",
        rule: [
          "Rule",
          "\u89C4\u5219"
        ],
        scenario: [
          "\u573A\u666F",
          "\u5267\u672C"
        ],
        scenarioOutline: [
          "\u573A\u666F\u5927\u7EB2",
          "\u5267\u672C\u5927\u7EB2"
        ],
        then: [
          "* ",
          "\u90A3\u4E48"
        ],
        when: [
          "* ",
          "\u5F53"
        ]
      },
      ml: {
        and: [
          "* ",
          "\u0D12\u0D2A\u0D4D\u0D2A\u0D02"
        ],
        background: [
          "\u0D2A\u0D36\u0D4D\u0D1A\u0D3E\u0D24\u0D4D\u0D24\u0D32\u0D02"
        ],
        but: [
          "* ",
          "\u0D2A\u0D15\u0D4D\u0D37\u0D47"
        ],
        examples: [
          "\u0D09\u0D26\u0D3E\u0D39\u0D30\u0D23\u0D19\u0D4D\u0D19\u0D7E"
        ],
        feature: [
          "\u0D38\u0D35\u0D3F\u0D36\u0D47\u0D37\u0D24"
        ],
        given: [
          "* ",
          "\u0D28\u0D7D\u0D15\u0D3F\u0D2F\u0D24\u0D4D"
        ],
        name: "Malayalam",
        native: "\u0D2E\u0D32\u0D2F\u0D3E\u0D33\u0D02",
        rule: [
          "\u0D28\u0D3F\u0D2F\u0D2E\u0D02"
        ],
        scenario: [
          "\u0D30\u0D02\u0D17\u0D02"
        ],
        scenarioOutline: [
          "\u0D38\u0D3E\u0D39\u0D1A\u0D30\u0D4D\u0D2F\u0D24\u0D4D\u0D24\u0D3F\u0D28\u0D4D\u0D31\u0D46 \u0D30\u0D42\u0D2A\u0D30\u0D47\u0D16"
        ],
        then: [
          "* ",
          "\u0D2A\u0D3F\u0D28\u0D4D\u0D28\u0D46"
        ],
        when: [
          "\u0D0E\u0D2A\u0D4D\u0D2A\u0D47\u0D3E\u0D7E"
        ]
      },
      "zh-TW": {
        and: [
          "* ",
          "\u800C\u4E14",
          "\u4E26\u4E14",
          "\u540C\u6642"
        ],
        background: [
          "\u80CC\u666F"
        ],
        but: [
          "* ",
          "\u4F46\u662F"
        ],
        examples: [
          "\u4F8B\u5B50"
        ],
        feature: [
          "\u529F\u80FD"
        ],
        given: [
          "* ",
          "\u5047\u5982",
          "\u5047\u8A2D",
          "\u5047\u5B9A"
        ],
        name: "Chinese traditional",
        native: "\u7E41\u9AD4\u4E2D\u6587",
        rule: [
          "Rule"
        ],
        scenario: [
          "\u5834\u666F",
          "\u5287\u672C"
        ],
        scenarioOutline: [
          "\u5834\u666F\u5927\u7DB1",
          "\u5287\u672C\u5927\u7DB1"
        ],
        then: [
          "* ",
          "\u90A3\u9EBC"
        ],
        when: [
          "* ",
          "\u7576"
        ]
      },
      mr: {
        and: [
          "* ",
          "\u0906\u0923\u093F ",
          "\u0924\u0938\u0947\u091A "
        ],
        background: [
          "\u092A\u093E\u0930\u094D\u0936\u094D\u0935\u092D\u0942\u092E\u0940"
        ],
        but: [
          "* ",
          "\u092A\u0923 ",
          "\u092A\u0930\u0902\u0924\u0941 "
        ],
        examples: [
          "\u0909\u0926\u093E\u0939\u0930\u0923"
        ],
        feature: [
          "\u0935\u0948\u0936\u093F\u0937\u094D\u091F\u094D\u092F",
          "\u0938\u0941\u0935\u093F\u0927\u093E"
        ],
        given: [
          "* ",
          "\u091C\u0930",
          "\u0926\u093F\u0932\u0947\u0932\u094D\u092F\u093E \u092A\u094D\u0930\u092E\u093E\u0923\u0947 "
        ],
        name: "Marathi",
        native: "\u092E\u0930\u093E\u0920\u0940",
        rule: [
          "\u0928\u093F\u092F\u092E"
        ],
        scenario: [
          "\u092A\u0930\u093F\u0926\u0943\u0936\u094D\u092F"
        ],
        scenarioOutline: [
          "\u092A\u0930\u093F\u0926\u0943\u0936\u094D\u092F \u0930\u0942\u092A\u0930\u0947\u0916\u093E"
        ],
        then: [
          "* ",
          "\u092E\u0917 ",
          "\u0924\u0947\u0935\u094D\u0939\u093E "
        ],
        when: [
          "* ",
          "\u091C\u0947\u0935\u094D\u0939\u093E "
        ]
      },
      amh: {
        and: [
          "* ",
          "\u12A5\u1293 "
        ],
        background: [
          "\u1245\u12F5\u1218 \u1201\u1294\u1273",
          "\u1218\u1290\u123B",
          "\u1218\u1290\u123B \u1200\u1233\u1265"
        ],
        but: [
          "* ",
          "\u130D\u1295 "
        ],
        examples: [
          "\u121D\u1233\u120C\u12CE\u127D",
          "\u1201\u1293\u1274\u12CE\u127D"
        ],
        feature: [
          "\u1235\u122B",
          "\u12E8\u1270\u1348\u1208\u1308\u12CD \u1235\u122B",
          "\u12E8\u121A\u1348\u1208\u1308\u12CD \u12F5\u122D\u130A\u1275"
        ],
        given: [
          "* ",
          "\u12E8\u1270\u1230\u1320 "
        ],
        name: "Amharic",
        native: "\u12A0\u121B\u122D\u129B",
        rule: [
          "\u1205\u130D"
        ],
        scenario: [
          "\u121D\u1233\u120C",
          "\u1201\u1293\u1274"
        ],
        scenarioOutline: [
          "\u1201\u1293\u1274 \u12DD\u122D\u12DD\u122D",
          "\u1201\u1293\u1274 \u12A0\u1265\u1290\u1275"
        ],
        then: [
          "* ",
          "\u12A8\u12DA\u12EB "
        ],
        when: [
          "* ",
          "\u1218\u127C "
        ]
      }
    };
  }
});

// node_modules/@cucumber/gherkin/dist/src/GherkinClassicTokenMatcher.js
var require_GherkinClassicTokenMatcher = __commonJS({
  "node_modules/@cucumber/gherkin/dist/src/GherkinClassicTokenMatcher.js"(exports) {
    "use strict";
    var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports && exports.__importStar || /* @__PURE__ */ (function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    })();
    var __importDefault = exports && exports.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    var messages = __importStar(require_src());
    var compareStepKeywords_1 = require_compareStepKeywords();
    var countSymbols_1 = __importDefault(require_countSymbols());
    var Errors_1 = require_Errors();
    var gherkin_languages_json_1 = __importDefault(require_gherkin_languages());
    var Parser_1 = require_Parser();
    var DIALECT_DICT = gherkin_languages_json_1.default;
    var LANGUAGE_PATTERN = /^\s*#\s*language\s*:\s*([a-zA-Z\-_]+)\s*$/;
    function addKeywordTypeMappings(h, keywords, keywordType) {
      for (const k of keywords) {
        if (!(k in h)) {
          h[k] = [];
        }
        h[k].push(keywordType);
      }
    }
    var GherkinClassicTokenMatcher2 = class {
      constructor(defaultDialectName = "en") {
        this.defaultDialectName = defaultDialectName;
        this.reset();
      }
      changeDialect(newDialectName, location) {
        const newDialect = DIALECT_DICT[newDialectName];
        if (!newDialect) {
          throw Errors_1.NoSuchLanguageException.create(newDialectName, location);
        }
        this.dialectName = newDialectName;
        this.dialect = newDialect;
        this.initializeKeywordTypes();
        this.initializeSortedStepKeywords();
      }
      reset() {
        if (this.dialectName !== this.defaultDialectName) {
          this.changeDialect(this.defaultDialectName);
        }
        this.activeDocStringSeparator = null;
        this.indentToRemove = 0;
      }
      initializeKeywordTypes() {
        this.keywordTypesMap = {};
        addKeywordTypeMappings(this.keywordTypesMap, this.dialect.given, messages.StepKeywordType.CONTEXT);
        addKeywordTypeMappings(this.keywordTypesMap, this.dialect.when, messages.StepKeywordType.ACTION);
        addKeywordTypeMappings(this.keywordTypesMap, this.dialect.then, messages.StepKeywordType.OUTCOME);
        addKeywordTypeMappings(this.keywordTypesMap, [].concat(this.dialect.and).concat(this.dialect.but), messages.StepKeywordType.CONJUNCTION);
      }
      initializeSortedStepKeywords() {
        this.sortedStepKeywords = [].concat(this.dialect.given).concat(this.dialect.when).concat(this.dialect.then).concat(this.dialect.and).concat(this.dialect.but).sort(compareStepKeywords_1.compareStepKeywords);
      }
      match_TagLine(token) {
        if (token.line.startsWith("@")) {
          this.setTokenMatched(token, Parser_1.TokenType.TagLine, null, null, null, null, this.getTags(token.line));
          return true;
        }
        return false;
      }
      match_FeatureLine(token) {
        return this.matchTitleLine(token, Parser_1.TokenType.FeatureLine, this.dialect.feature);
      }
      match_ScenarioLine(token) {
        return this.matchTitleLine(token, Parser_1.TokenType.ScenarioLine, this.dialect.scenario) || this.matchTitleLine(token, Parser_1.TokenType.ScenarioLine, this.dialect.scenarioOutline);
      }
      match_BackgroundLine(token) {
        return this.matchTitleLine(token, Parser_1.TokenType.BackgroundLine, this.dialect.background);
      }
      match_ExamplesLine(token) {
        return this.matchTitleLine(token, Parser_1.TokenType.ExamplesLine, this.dialect.examples);
      }
      match_RuleLine(token) {
        return this.matchTitleLine(token, Parser_1.TokenType.RuleLine, this.dialect.rule);
      }
      match_TableRow(token) {
        if (token.line.startsWith("|")) {
          this.setTokenMatched(token, Parser_1.TokenType.TableRow, null, null, null, null, token.line.getTableCells());
          return true;
        }
        return false;
      }
      match_Empty(token) {
        if (token.line.isEmpty) {
          this.setTokenMatched(token, Parser_1.TokenType.Empty, null, null, 0);
          return true;
        }
        return false;
      }
      match_Comment(token) {
        if (token.line.startsWith("#")) {
          const text = token.line.getLineText(0);
          this.setTokenMatched(token, Parser_1.TokenType.Comment, text, null, 0);
          return true;
        }
        return false;
      }
      match_Language(token) {
        const match = token.line.trimmedLineText.match(LANGUAGE_PATTERN);
        if (match) {
          const newDialectName = match[1];
          this.setTokenMatched(token, Parser_1.TokenType.Language, newDialectName);
          this.changeDialect(newDialectName, token.location);
          return true;
        }
        return false;
      }
      match_DocStringSeparator(token) {
        return this.activeDocStringSeparator == null ? (
          // open
          this._match_DocStringSeparator(token, '"""', true) || this._match_DocStringSeparator(token, "```", true)
        ) : (
          // close
          this._match_DocStringSeparator(token, this.activeDocStringSeparator, false)
        );
      }
      _match_DocStringSeparator(token, separator, isOpen) {
        if (token.line.startsWith(separator)) {
          let mediaType = null;
          if (isOpen) {
            mediaType = token.line.getRestTrimmed(separator.length);
            this.activeDocStringSeparator = separator;
            this.indentToRemove = token.line.indent;
          } else {
            this.activeDocStringSeparator = null;
            this.indentToRemove = 0;
          }
          this.setTokenMatched(token, Parser_1.TokenType.DocStringSeparator, mediaType, separator);
          return true;
        }
        return false;
      }
      match_EOF(token) {
        if (token.isEof) {
          this.setTokenMatched(token, Parser_1.TokenType.EOF);
          return true;
        }
        return false;
      }
      match_StepLine(token) {
        for (const keyword of this.sortedStepKeywords) {
          if (token.line.startsWith(keyword)) {
            const title = token.line.getRestTrimmed(keyword.length);
            const keywordTypes = this.keywordTypesMap[keyword];
            let keywordType = keywordTypes[0];
            if (keywordTypes.length > 1) {
              keywordType = messages.StepKeywordType.UNKNOWN;
            }
            this.setTokenMatched(token, Parser_1.TokenType.StepLine, title, keyword, null, keywordType);
            return true;
          }
        }
        return false;
      }
      match_Other(token) {
        const text = token.line.getLineText(this.indentToRemove);
        this.setTokenMatched(token, Parser_1.TokenType.Other, this.unescapeDocString(text), null, 0);
        return true;
      }
      getTags(line) {
        const uncommentedLine = line.trimmedLineText.split(/\s#/g, 2)[0];
        let column = line.indent + 1;
        const items = uncommentedLine.split("@");
        const tags = [];
        for (let i = 0; i < items.length; i++) {
          const item = items[i].trimRight();
          if (item.length === 0) {
            continue;
          }
          if (!item.match(/^\S+$/)) {
            throw Errors_1.ParserException.create("A tag may not contain whitespace", line.lineNumber, column);
          }
          const span = { column, text: `@${item}` };
          tags.push(span);
          column += (0, countSymbols_1.default)(items[i]) + 1;
        }
        return tags;
      }
      matchTitleLine(token, tokenType, keywords) {
        for (const keyword of keywords) {
          if (token.line.startsWithTitleKeyword(keyword)) {
            const title = token.line.getRestTrimmed(keyword.length + ":".length);
            this.setTokenMatched(token, tokenType, title, keyword);
            return true;
          }
        }
        return false;
      }
      setTokenMatched(token, matchedType, text, keyword, indent, keywordType, items) {
        token.matchedType = matchedType;
        token.matchedText = text;
        token.matchedKeyword = keyword;
        token.matchedKeywordType = keywordType;
        token.matchedIndent = typeof indent === "number" ? indent : token.line == null ? 0 : token.line.indent;
        token.matchedItems = items || [];
        token.location.column = token.matchedIndent + 1;
        token.matchedGherkinDialect = this.dialectName;
      }
      unescapeDocString(text) {
        if (this.activeDocStringSeparator === '"""') {
          return text.replace('\\"\\"\\"', '"""');
        }
        if (this.activeDocStringSeparator === "```") {
          return text.replace("\\`\\`\\`", "```");
        }
        return text;
      }
    };
    exports.default = GherkinClassicTokenMatcher2;
  }
});

// node_modules/@cucumber/gherkin/dist/src/GherkinInMarkdownTokenMatcher.js
var require_GherkinInMarkdownTokenMatcher = __commonJS({
  "node_modules/@cucumber/gherkin/dist/src/GherkinInMarkdownTokenMatcher.js"(exports) {
    "use strict";
    var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports && exports.__importStar || /* @__PURE__ */ (function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    })();
    var __importDefault = exports && exports.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    var messages = __importStar(require_src());
    var compareStepKeywords_1 = require_compareStepKeywords();
    var Errors_1 = require_Errors();
    var gherkin_languages_json_1 = __importDefault(require_gherkin_languages());
    var Parser_1 = require_Parser();
    var DIALECT_DICT = gherkin_languages_json_1.default;
    var DEFAULT_DOC_STRING_SEPARATOR = /^(```[`]*)(.*)/;
    function addKeywordTypeMappings(h, keywords, keywordType) {
      for (const k of keywords) {
        if (!(k in h)) {
          h[k] = [];
        }
        h[k].push(keywordType);
      }
    }
    var GherkinInMarkdownTokenMatcher = class {
      constructor(defaultDialectName = "en") {
        this.defaultDialectName = defaultDialectName;
        this.dialect = DIALECT_DICT[defaultDialectName];
        this.nonStarStepKeywords = [].concat(this.dialect.given).concat(this.dialect.when).concat(this.dialect.then).concat(this.dialect.and).concat(this.dialect.but).filter((value, index, self2) => value !== "* " && self2.indexOf(value) === index).sort(compareStepKeywords_1.compareStepKeywords);
        this.initializeKeywordTypes();
        this.stepRegexp = new RegExp(`${KeywordPrefix.BULLET}(${this.nonStarStepKeywords.map(escapeRegExp).join("|")})`);
        const headerKeywords = [].concat(this.dialect.feature).concat(this.dialect.background).concat(this.dialect.rule).concat(this.dialect.scenarioOutline).concat(this.dialect.scenario).concat(this.dialect.examples).filter((value, index, self2) => self2.indexOf(value) === index);
        this.headerRegexp = new RegExp(`${KeywordPrefix.HEADER}(${headerKeywords.map(escapeRegExp).join("|")})`);
        this.reset();
      }
      changeDialect(newDialectName, location) {
        const newDialect = DIALECT_DICT[newDialectName];
        if (!newDialect) {
          throw Errors_1.NoSuchLanguageException.create(newDialectName, location);
        }
        this.dialectName = newDialectName;
        this.dialect = newDialect;
        this.initializeKeywordTypes();
      }
      initializeKeywordTypes() {
        this.keywordTypesMap = {};
        addKeywordTypeMappings(this.keywordTypesMap, this.dialect.given, messages.StepKeywordType.CONTEXT);
        addKeywordTypeMappings(this.keywordTypesMap, this.dialect.when, messages.StepKeywordType.ACTION);
        addKeywordTypeMappings(this.keywordTypesMap, this.dialect.then, messages.StepKeywordType.OUTCOME);
        addKeywordTypeMappings(this.keywordTypesMap, [].concat(this.dialect.and).concat(this.dialect.but), messages.StepKeywordType.CONJUNCTION);
      }
      // We've made a deliberate choice not to support `# language: [ISO 639-1]` headers or similar
      // in Markdown. Users should specify a language globally. This can be done in
      // cucumber-js using the --language [ISO 639-1] option.
      match_Language(token) {
        if (!token)
          throw new Error("no token");
        return false;
      }
      match_Empty(token) {
        let result = false;
        if (token.line.isEmpty) {
          result = true;
        }
        if (!this.match_TagLine(token) && !this.match_FeatureLine(token) && !this.match_ScenarioLine(token) && !this.match_BackgroundLine(token) && !this.match_ExamplesLine(token) && !this.match_RuleLine(token) && !this.match_TableRow(token) && !this.match_Comment(token) && !this.match_Language(token) && !this.match_DocStringSeparator(token) && !this.match_EOF(token) && !this.match_StepLine(token)) {
          result = true;
        }
        if (result) {
          token.matchedType = Parser_1.TokenType.Empty;
        }
        return this.setTokenMatched(token, null, result);
      }
      match_Other(token) {
        const text = token.line.getLineText(this.indentToRemove);
        token.matchedType = Parser_1.TokenType.Other;
        token.matchedText = text;
        token.matchedIndent = 0;
        return this.setTokenMatched(token, null, true);
      }
      match_Comment(token) {
        let result = false;
        if (token.line.startsWith("|")) {
          const tableCells = token.line.getTableCells();
          if (this.isGfmTableSeparator(tableCells))
            result = true;
        }
        return this.setTokenMatched(token, null, result);
      }
      match_DocStringSeparator(token) {
        const match = token.line.trimmedLineText.match(this.activeDocStringSeparator);
        const [, newSeparator, mediaType] = match || [];
        let result = false;
        if (newSeparator) {
          if (this.activeDocStringSeparator === DEFAULT_DOC_STRING_SEPARATOR) {
            this.activeDocStringSeparator = new RegExp(`^(${newSeparator})$`);
            this.indentToRemove = token.line.indent;
          } else {
            this.activeDocStringSeparator = DEFAULT_DOC_STRING_SEPARATOR;
          }
          token.matchedKeyword = newSeparator;
          token.matchedType = Parser_1.TokenType.DocStringSeparator;
          token.matchedText = mediaType || "";
          result = true;
        }
        return this.setTokenMatched(token, null, result);
      }
      match_EOF(token) {
        let result = false;
        if (token.isEof) {
          token.matchedType = Parser_1.TokenType.EOF;
          result = true;
        }
        return this.setTokenMatched(token, null, result);
      }
      match_FeatureLine(token) {
        if (this.matchedFeatureLine) {
          return this.setTokenMatched(token, null, false);
        }
        let result = this.matchTitleLine(KeywordPrefix.HEADER, this.dialect.feature, ":", token, Parser_1.TokenType.FeatureLine);
        if (!result) {
          token.matchedType = Parser_1.TokenType.FeatureLine;
          token.matchedText = token.line.trimmedLineText;
          result = this.setTokenMatched(token, null, true);
        }
        this.matchedFeatureLine = result;
        return result;
      }
      match_BackgroundLine(token) {
        return this.matchTitleLine(KeywordPrefix.HEADER, this.dialect.background, ":", token, Parser_1.TokenType.BackgroundLine);
      }
      match_RuleLine(token) {
        return this.matchTitleLine(KeywordPrefix.HEADER, this.dialect.rule, ":", token, Parser_1.TokenType.RuleLine);
      }
      match_ScenarioLine(token) {
        return this.matchTitleLine(KeywordPrefix.HEADER, this.dialect.scenario, ":", token, Parser_1.TokenType.ScenarioLine) || this.matchTitleLine(KeywordPrefix.HEADER, this.dialect.scenarioOutline, ":", token, Parser_1.TokenType.ScenarioLine);
      }
      match_ExamplesLine(token) {
        return this.matchTitleLine(KeywordPrefix.HEADER, this.dialect.examples, ":", token, Parser_1.TokenType.ExamplesLine);
      }
      match_StepLine(token) {
        return this.matchTitleLine(KeywordPrefix.BULLET, this.nonStarStepKeywords, "", token, Parser_1.TokenType.StepLine);
      }
      matchTitleLine(prefix, keywords, keywordSuffix, token, matchedType) {
        const regexp = new RegExp(`${prefix}(${keywords.map(escapeRegExp).join("|")})${keywordSuffix}(.*)`);
        const match = token.line.match(regexp);
        let indent = token.line.indent;
        let result = false;
        if (match) {
          token.matchedType = matchedType;
          token.matchedKeyword = match[2];
          if (match[2] in this.keywordTypesMap) {
            if (this.keywordTypesMap[match[2]].length > 1) {
              token.matchedKeywordType = messages.StepKeywordType.UNKNOWN;
            } else {
              token.matchedKeywordType = this.keywordTypesMap[match[2]][0];
            }
          }
          token.matchedText = match[3].trim();
          indent += match[1].length;
          result = true;
        }
        return this.setTokenMatched(token, indent, result);
      }
      setTokenMatched(token, indent, matched) {
        token.matchedGherkinDialect = this.dialectName;
        token.matchedIndent = indent !== null ? indent : token.line == null ? 0 : token.line.indent;
        token.location.column = token.matchedIndent + 1;
        return matched;
      }
      match_TableRow(token) {
        if (token.line.lineText.match(/^\s\s\s?\s?\s?\|/)) {
          const tableCells = token.line.getTableCells();
          if (this.isGfmTableSeparator(tableCells))
            return false;
          token.matchedKeyword = "|";
          token.matchedType = Parser_1.TokenType.TableRow;
          token.matchedItems = tableCells;
          return true;
        }
        return false;
      }
      isGfmTableSeparator(tableCells) {
        const separatorValues = tableCells.map((item) => item.text).filter((value) => value.match(/^:?-+:?$/));
        return separatorValues.length > 0;
      }
      match_TagLine(token) {
        const tags = [];
        let m;
        const re = /`(@[^`]+)`/g;
        do {
          m = re.exec(token.line.trimmedLineText);
          if (m) {
            tags.push({
              column: token.line.indent + m.index + 2,
              text: m[1]
            });
          }
        } while (m);
        if (tags.length === 0)
          return false;
        token.matchedType = Parser_1.TokenType.TagLine;
        token.matchedItems = tags;
        return true;
      }
      reset() {
        if (this.dialectName !== this.defaultDialectName) {
          this.changeDialect(this.defaultDialectName);
        }
        this.activeDocStringSeparator = DEFAULT_DOC_STRING_SEPARATOR;
      }
    };
    exports.default = GherkinInMarkdownTokenMatcher;
    var KeywordPrefix;
    (function(KeywordPrefix2) {
      KeywordPrefix2["BULLET"] = "^(\\s*[*+-]\\s*)";
      KeywordPrefix2["HEADER"] = "^(#{1,6}\\s)";
    })(KeywordPrefix || (KeywordPrefix = {}));
    function escapeRegExp(text) {
      return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
    }
  }
});

// node_modules/@cucumber/gherkin/dist/src/makeSourceEnvelope.js
var require_makeSourceEnvelope = __commonJS({
  "node_modules/@cucumber/gherkin/dist/src/makeSourceEnvelope.js"(exports) {
    "use strict";
    var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports && exports.__importStar || /* @__PURE__ */ (function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    })();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = makeSourceEnvelope;
    var messages = __importStar(require_src());
    function makeSourceEnvelope(data, uri) {
      let mediaType;
      if (uri.endsWith(".feature")) {
        mediaType = messages.SourceMediaType.TEXT_X_CUCUMBER_GHERKIN_PLAIN;
      } else if (uri.endsWith(".md")) {
        mediaType = messages.SourceMediaType.TEXT_X_CUCUMBER_GHERKIN_MARKDOWN;
      }
      if (!mediaType)
        throw new Error(`The uri (${uri}) must end with .feature or .md`);
      return {
        source: {
          data,
          uri,
          mediaType
        }
      };
    }
  }
});

// node_modules/@cucumber/gherkin/dist/src/pickles/compile.js
var require_compile = __commonJS({
  "node_modules/@cucumber/gherkin/dist/src/pickles/compile.js"(exports) {
    "use strict";
    var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports && exports.__importStar || /* @__PURE__ */ (function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    })();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = compile;
    var messages = __importStar(require_src());
    var pickleStepTypeFromKeyword = {
      [messages.StepKeywordType.UNKNOWN]: messages.PickleStepType.UNKNOWN,
      [messages.StepKeywordType.CONTEXT]: messages.PickleStepType.CONTEXT,
      [messages.StepKeywordType.ACTION]: messages.PickleStepType.ACTION,
      [messages.StepKeywordType.OUTCOME]: messages.PickleStepType.OUTCOME,
      [messages.StepKeywordType.CONJUNCTION]: null
    };
    function compile(gherkinDocument, uri, newId) {
      const pickles = [];
      if (gherkinDocument.feature == null) {
        return pickles;
      }
      const feature = gherkinDocument.feature;
      const language = feature.language;
      const featureTags = feature.tags;
      let featureBackgroundSteps = [];
      feature.children.forEach((stepsContainer) => {
        if (stepsContainer.background) {
          featureBackgroundSteps = [].concat(stepsContainer.background.steps);
        } else if (stepsContainer.rule) {
          compileRule(featureTags, featureBackgroundSteps, stepsContainer.rule, language, pickles, uri, newId);
        } else if (stepsContainer.scenario.examples.length === 0) {
          compileScenario(featureTags, featureBackgroundSteps, stepsContainer.scenario, language, pickles, uri, newId);
        } else {
          compileScenarioOutline(featureTags, featureBackgroundSteps, stepsContainer.scenario, language, pickles, uri, newId);
        }
      });
      return pickles;
    }
    function compileRule(featureTags, featureBackgroundSteps, rule, language, pickles, uri, newId) {
      let ruleBackgroundSteps = [].concat(featureBackgroundSteps);
      const tags = [].concat(featureTags).concat(rule.tags);
      rule.children.forEach((stepsContainer) => {
        if (stepsContainer.background) {
          ruleBackgroundSteps = ruleBackgroundSteps.concat(stepsContainer.background.steps);
        } else if (stepsContainer.scenario.examples.length === 0) {
          compileScenario(tags, ruleBackgroundSteps, stepsContainer.scenario, language, pickles, uri, newId);
        } else {
          compileScenarioOutline(tags, ruleBackgroundSteps, stepsContainer.scenario, language, pickles, uri, newId);
        }
      });
    }
    function compileScenario(inheritedTags, backgroundSteps, scenario, language, pickles, uri, newId) {
      let lastKeywordType = messages.StepKeywordType.UNKNOWN;
      const steps = [];
      if (scenario.steps.length !== 0) {
        backgroundSteps.forEach((step) => {
          lastKeywordType = step.keywordType === messages.StepKeywordType.CONJUNCTION ? lastKeywordType : step.keywordType;
          steps.push(pickleStep(step, [], null, newId, lastKeywordType));
        });
      }
      const tags = [].concat(inheritedTags).concat(scenario.tags);
      scenario.steps.forEach((step) => {
        lastKeywordType = step.keywordType === messages.StepKeywordType.CONJUNCTION ? lastKeywordType : step.keywordType;
        steps.push(pickleStep(step, [], null, newId, lastKeywordType));
      });
      const pickle = {
        id: newId(),
        uri,
        location: scenario.location,
        astNodeIds: [scenario.id],
        tags: pickleTags(tags),
        name: scenario.name,
        language,
        steps
      };
      pickles.push(pickle);
    }
    function compileScenarioOutline(inheritedTags, backgroundSteps, scenario, language, pickles, uri, newId) {
      scenario.examples.filter((e) => e.tableHeader).forEach((examples) => {
        const variableCells = examples.tableHeader.cells;
        examples.tableBody.forEach((valuesRow) => {
          let lastKeywordType = messages.StepKeywordType.UNKNOWN;
          const steps = [];
          if (scenario.steps.length !== 0) {
            backgroundSteps.forEach((step) => {
              lastKeywordType = step.keywordType === messages.StepKeywordType.CONJUNCTION ? lastKeywordType : step.keywordType;
              steps.push(pickleStep(step, [], null, newId, lastKeywordType));
            });
          }
          scenario.steps.forEach((scenarioOutlineStep) => {
            lastKeywordType = scenarioOutlineStep.keywordType === messages.StepKeywordType.CONJUNCTION ? lastKeywordType : scenarioOutlineStep.keywordType;
            const step = pickleStep(scenarioOutlineStep, variableCells, valuesRow, newId, lastKeywordType);
            steps.push(step);
          });
          const id = newId();
          const tags = pickleTags([].concat(inheritedTags).concat(scenario.tags).concat(examples.tags));
          pickles.push({
            id,
            uri,
            location: valuesRow.location,
            astNodeIds: [scenario.id, valuesRow.id],
            name: interpolate(scenario.name, variableCells, valuesRow.cells),
            language,
            steps,
            tags
          });
        });
      });
    }
    function createPickleArguments(step, variableCells, valueCells) {
      if (step.dataTable) {
        const argument = step.dataTable;
        const table = {
          rows: argument.rows.map((row) => {
            return {
              cells: row.cells.map((cell) => {
                return {
                  value: interpolate(cell.value, variableCells, valueCells)
                };
              })
            };
          })
        };
        return { dataTable: table };
      } else if (step.docString) {
        const argument = step.docString;
        const docString = {
          content: interpolate(argument.content, variableCells, valueCells)
        };
        if (argument.mediaType) {
          docString.mediaType = interpolate(argument.mediaType, variableCells, valueCells);
        }
        return { docString };
      }
    }
    function interpolate(name, variableCells, valueCells) {
      variableCells.forEach((variableCell, n) => {
        const valueCell = valueCells[n];
        const valuePattern = `<${variableCell.value}>`;
        const escapedPattern = valuePattern.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
        const regexp = new RegExp(escapedPattern, "g");
        const replacement = valueCell.value.replace(/\$/g, "$$$$");
        name = name.replace(regexp, replacement);
      });
      return name;
    }
    function pickleStep(step, variableCells, valuesRow, newId, keywordType) {
      const astNodeIds = [step.id];
      if (valuesRow) {
        astNodeIds.push(valuesRow.id);
      }
      const valueCells = valuesRow ? valuesRow.cells : [];
      return {
        id: newId(),
        text: interpolate(step.text, variableCells, valueCells),
        type: pickleStepTypeFromKeyword[keywordType],
        argument: createPickleArguments(step, variableCells, valueCells),
        astNodeIds
      };
    }
    function pickleTags(tags) {
      return tags.map(pickleTag);
    }
    function pickleTag(tag) {
      return {
        name: tag.name,
        astNodeId: tag.id
      };
    }
  }
});

// node_modules/@cucumber/gherkin/dist/src/generateMessages.js
var require_generateMessages = __commonJS({
  "node_modules/@cucumber/gherkin/dist/src/generateMessages.js"(exports) {
    "use strict";
    var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports && exports.__importStar || /* @__PURE__ */ (function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    })();
    var __importDefault = exports && exports.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = generateMessages;
    var messages = __importStar(require_src());
    var AstBuilder_1 = __importDefault(require_AstBuilder());
    var GherkinClassicTokenMatcher_1 = __importDefault(require_GherkinClassicTokenMatcher());
    var GherkinInMarkdownTokenMatcher_1 = __importDefault(require_GherkinInMarkdownTokenMatcher());
    var makeSourceEnvelope_1 = __importDefault(require_makeSourceEnvelope());
    var Parser_1 = __importDefault(require_Parser());
    var compile_1 = __importDefault(require_compile());
    function generateMessages(data, uri, mediaType, options) {
      let tokenMatcher;
      switch (mediaType) {
        case messages.SourceMediaType.TEXT_X_CUCUMBER_GHERKIN_PLAIN:
          tokenMatcher = new GherkinClassicTokenMatcher_1.default(options.defaultDialect);
          break;
        case messages.SourceMediaType.TEXT_X_CUCUMBER_GHERKIN_MARKDOWN:
          tokenMatcher = new GherkinInMarkdownTokenMatcher_1.default(options.defaultDialect);
          break;
        default:
          throw new Error(`Unsupported media type: ${mediaType}`);
      }
      const result = [];
      try {
        if (options.includeSource) {
          result.push((0, makeSourceEnvelope_1.default)(data, uri));
        }
        if (!options.includeGherkinDocument && !options.includePickles) {
          return result;
        }
        const parser = new Parser_1.default(new AstBuilder_1.default(options.newId), tokenMatcher);
        parser.stopAtFirstError = false;
        const gherkinDocument = parser.parse(data);
        if (options.includeGherkinDocument) {
          result.push({
            gherkinDocument: { ...gherkinDocument, uri }
          });
        }
        if (options.includePickles) {
          const pickles = (0, compile_1.default)(gherkinDocument, uri, options.newId);
          for (const pickle of pickles) {
            result.push({
              pickle
            });
          }
        }
      } catch (err) {
        const errors = err.errors || [err];
        for (const error of errors) {
          if (!error.location) {
            throw error;
          }
          result.push({
            parseError: {
              source: {
                uri,
                location: {
                  line: error.location.line,
                  column: error.location.column
                }
              },
              message: error.message
            }
          });
        }
      }
      return result;
    }
  }
});

// node_modules/@cucumber/gherkin/dist/src/index.js
var require_src2 = __commonJS({
  "node_modules/@cucumber/gherkin/dist/src/index.js"(exports) {
    "use strict";
    var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports && exports.__importStar || /* @__PURE__ */ (function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    })();
    var __importDefault = exports && exports.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.TokenScanner = exports.Parser = exports.makeSourceEnvelope = exports.generateMessages = exports.GherkinInMarkdownTokenMatcher = exports.GherkinClassicTokenMatcher = exports.Errors = exports.dialects = exports.compile = exports.AstBuilder = void 0;
    var AstBuilder_1 = __importDefault(require_AstBuilder());
    exports.AstBuilder = AstBuilder_1.default;
    var Errors = __importStar(require_Errors());
    exports.Errors = Errors;
    var GherkinClassicTokenMatcher_1 = __importDefault(require_GherkinClassicTokenMatcher());
    exports.GherkinClassicTokenMatcher = GherkinClassicTokenMatcher_1.default;
    var GherkinInMarkdownTokenMatcher_1 = __importDefault(require_GherkinInMarkdownTokenMatcher());
    exports.GherkinInMarkdownTokenMatcher = GherkinInMarkdownTokenMatcher_1.default;
    var generateMessages_1 = __importDefault(require_generateMessages());
    exports.generateMessages = generateMessages_1.default;
    var gherkin_languages_json_1 = __importDefault(require_gherkin_languages());
    var makeSourceEnvelope_1 = __importDefault(require_makeSourceEnvelope());
    exports.makeSourceEnvelope = makeSourceEnvelope_1.default;
    var Parser_1 = __importDefault(require_Parser());
    exports.Parser = Parser_1.default;
    var compile_1 = __importDefault(require_compile());
    exports.compile = compile_1.default;
    var TokenScanner_1 = __importDefault(require_TokenScanner());
    exports.TokenScanner = TokenScanner_1.default;
    var dialects = gherkin_languages_json_1.default;
    exports.dialects = dialects;
  }
});

// node_modules/@cucumber/messages/dist/esm/src/TimeConversion.js
var init_TimeConversion = __esm({
  "node_modules/@cucumber/messages/dist/esm/src/TimeConversion.js"() {
  }
});

// node_modules/@cucumber/messages/dist/esm/src/IdGenerator.js
var IdGenerator_exports = {};
__export(IdGenerator_exports, {
  incrementing: () => incrementing,
  uuid: () => uuid
});
function uuid() {
  return () => crypto.randomUUID();
}
function incrementing() {
  let next = 0;
  return () => (next++).toString();
}
var init_IdGenerator = __esm({
  "node_modules/@cucumber/messages/dist/esm/src/IdGenerator.js"() {
  }
});

// node_modules/@cucumber/messages/dist/esm/src/messages.js
var import_class_transformer, import_reflect_metadata, __decorate, Attachment, Duration, Envelope, Exception, ExternalAttachment, GherkinDocument, Background, Comment, DataTable, DocString, Examples, Feature, FeatureChild, Rule, RuleChild, Scenario, Step, TableCell, TableRow, Tag, Hook, Location, Meta, Ci, Git, Product, ParameterType, ParseError, Pickle, PickleDocString, PickleStep, PickleStepArgument, PickleTable, PickleTableCell, PickleTableRow, PickleTag, Source, SourceReference, JavaMethod, JavaStackTraceElement, StepDefinition, StepDefinitionPattern, Suggestion, Snippet, TestCase, Group, StepMatchArgument, StepMatchArgumentsList, TestStep, TestCaseFinished, TestCaseStarted, TestRunFinished, TestRunHookFinished, TestRunHookStarted, TestRunStarted, TestStepFinished, TestStepResult, TestStepStarted, Timestamp, UndefinedParameterType, AttachmentContentEncoding, HookType, PickleStepType, SourceMediaType, StepDefinitionPatternType, StepKeywordType, TestStepResultStatus;
var init_messages = __esm({
  "node_modules/@cucumber/messages/dist/esm/src/messages.js"() {
    import_class_transformer = __toESM(require_cjs(), 1);
    import_reflect_metadata = __toESM(require_Reflect(), 1);
    __decorate = function(decorators, target, key, desc) {
      var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
      if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
      else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
      return c > 3 && r && Object.defineProperty(target, key, r), r;
    };
    Attachment = class {
      constructor() {
        this.body = "";
        this.contentEncoding = AttachmentContentEncoding.IDENTITY;
        this.mediaType = "";
      }
    };
    __decorate([
      (0, import_class_transformer.Type)(() => Source)
    ], Attachment.prototype, "source", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => Timestamp)
    ], Attachment.prototype, "timestamp", void 0);
    Duration = class {
      constructor() {
        this.seconds = 0;
        this.nanos = 0;
      }
    };
    Envelope = class {
    };
    __decorate([
      (0, import_class_transformer.Type)(() => Attachment)
    ], Envelope.prototype, "attachment", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => ExternalAttachment)
    ], Envelope.prototype, "externalAttachment", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => GherkinDocument)
    ], Envelope.prototype, "gherkinDocument", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => Hook)
    ], Envelope.prototype, "hook", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => Meta)
    ], Envelope.prototype, "meta", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => ParameterType)
    ], Envelope.prototype, "parameterType", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => ParseError)
    ], Envelope.prototype, "parseError", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => Pickle)
    ], Envelope.prototype, "pickle", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => Suggestion)
    ], Envelope.prototype, "suggestion", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => Source)
    ], Envelope.prototype, "source", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => StepDefinition)
    ], Envelope.prototype, "stepDefinition", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => TestCase)
    ], Envelope.prototype, "testCase", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => TestCaseFinished)
    ], Envelope.prototype, "testCaseFinished", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => TestCaseStarted)
    ], Envelope.prototype, "testCaseStarted", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => TestRunFinished)
    ], Envelope.prototype, "testRunFinished", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => TestRunStarted)
    ], Envelope.prototype, "testRunStarted", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => TestStepFinished)
    ], Envelope.prototype, "testStepFinished", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => TestStepStarted)
    ], Envelope.prototype, "testStepStarted", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => TestRunHookStarted)
    ], Envelope.prototype, "testRunHookStarted", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => TestRunHookFinished)
    ], Envelope.prototype, "testRunHookFinished", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => UndefinedParameterType)
    ], Envelope.prototype, "undefinedParameterType", void 0);
    Exception = class {
      constructor() {
        this.type = "";
      }
    };
    ExternalAttachment = class {
      constructor() {
        this.url = "";
        this.mediaType = "";
      }
    };
    __decorate([
      (0, import_class_transformer.Type)(() => Timestamp)
    ], ExternalAttachment.prototype, "timestamp", void 0);
    GherkinDocument = class {
      constructor() {
        this.comments = [];
      }
    };
    __decorate([
      (0, import_class_transformer.Type)(() => Feature)
    ], GherkinDocument.prototype, "feature", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => Comment)
    ], GherkinDocument.prototype, "comments", void 0);
    Background = class {
      constructor() {
        this.location = new Location();
        this.keyword = "";
        this.name = "";
        this.description = "";
        this.steps = [];
        this.id = "";
      }
    };
    __decorate([
      (0, import_class_transformer.Type)(() => Location)
    ], Background.prototype, "location", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => Step)
    ], Background.prototype, "steps", void 0);
    Comment = class {
      constructor() {
        this.location = new Location();
        this.text = "";
      }
    };
    __decorate([
      (0, import_class_transformer.Type)(() => Location)
    ], Comment.prototype, "location", void 0);
    DataTable = class {
      constructor() {
        this.location = new Location();
        this.rows = [];
      }
    };
    __decorate([
      (0, import_class_transformer.Type)(() => Location)
    ], DataTable.prototype, "location", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => TableRow)
    ], DataTable.prototype, "rows", void 0);
    DocString = class {
      constructor() {
        this.location = new Location();
        this.content = "";
        this.delimiter = "";
      }
    };
    __decorate([
      (0, import_class_transformer.Type)(() => Location)
    ], DocString.prototype, "location", void 0);
    Examples = class {
      constructor() {
        this.location = new Location();
        this.tags = [];
        this.keyword = "";
        this.name = "";
        this.description = "";
        this.tableBody = [];
        this.id = "";
      }
    };
    __decorate([
      (0, import_class_transformer.Type)(() => Location)
    ], Examples.prototype, "location", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => Tag)
    ], Examples.prototype, "tags", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => TableRow)
    ], Examples.prototype, "tableHeader", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => TableRow)
    ], Examples.prototype, "tableBody", void 0);
    Feature = class {
      constructor() {
        this.location = new Location();
        this.tags = [];
        this.language = "";
        this.keyword = "";
        this.name = "";
        this.description = "";
        this.children = [];
      }
    };
    __decorate([
      (0, import_class_transformer.Type)(() => Location)
    ], Feature.prototype, "location", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => Tag)
    ], Feature.prototype, "tags", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => FeatureChild)
    ], Feature.prototype, "children", void 0);
    FeatureChild = class {
    };
    __decorate([
      (0, import_class_transformer.Type)(() => Rule)
    ], FeatureChild.prototype, "rule", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => Background)
    ], FeatureChild.prototype, "background", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => Scenario)
    ], FeatureChild.prototype, "scenario", void 0);
    Rule = class {
      constructor() {
        this.location = new Location();
        this.tags = [];
        this.keyword = "";
        this.name = "";
        this.description = "";
        this.children = [];
        this.id = "";
      }
    };
    __decorate([
      (0, import_class_transformer.Type)(() => Location)
    ], Rule.prototype, "location", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => Tag)
    ], Rule.prototype, "tags", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => RuleChild)
    ], Rule.prototype, "children", void 0);
    RuleChild = class {
    };
    __decorate([
      (0, import_class_transformer.Type)(() => Background)
    ], RuleChild.prototype, "background", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => Scenario)
    ], RuleChild.prototype, "scenario", void 0);
    Scenario = class {
      constructor() {
        this.location = new Location();
        this.tags = [];
        this.keyword = "";
        this.name = "";
        this.description = "";
        this.steps = [];
        this.examples = [];
        this.id = "";
      }
    };
    __decorate([
      (0, import_class_transformer.Type)(() => Location)
    ], Scenario.prototype, "location", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => Tag)
    ], Scenario.prototype, "tags", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => Step)
    ], Scenario.prototype, "steps", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => Examples)
    ], Scenario.prototype, "examples", void 0);
    Step = class {
      constructor() {
        this.location = new Location();
        this.keyword = "";
        this.text = "";
        this.id = "";
      }
    };
    __decorate([
      (0, import_class_transformer.Type)(() => Location)
    ], Step.prototype, "location", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => DocString)
    ], Step.prototype, "docString", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => DataTable)
    ], Step.prototype, "dataTable", void 0);
    TableCell = class {
      constructor() {
        this.location = new Location();
        this.value = "";
      }
    };
    __decorate([
      (0, import_class_transformer.Type)(() => Location)
    ], TableCell.prototype, "location", void 0);
    TableRow = class {
      constructor() {
        this.location = new Location();
        this.cells = [];
        this.id = "";
      }
    };
    __decorate([
      (0, import_class_transformer.Type)(() => Location)
    ], TableRow.prototype, "location", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => TableCell)
    ], TableRow.prototype, "cells", void 0);
    Tag = class {
      constructor() {
        this.location = new Location();
        this.name = "";
        this.id = "";
      }
    };
    __decorate([
      (0, import_class_transformer.Type)(() => Location)
    ], Tag.prototype, "location", void 0);
    Hook = class {
      constructor() {
        this.id = "";
        this.sourceReference = new SourceReference();
      }
    };
    __decorate([
      (0, import_class_transformer.Type)(() => SourceReference)
    ], Hook.prototype, "sourceReference", void 0);
    Location = class {
      constructor() {
        this.line = 0;
      }
    };
    Meta = class {
      constructor() {
        this.protocolVersion = "";
        this.implementation = new Product();
        this.runtime = new Product();
        this.os = new Product();
        this.cpu = new Product();
      }
    };
    __decorate([
      (0, import_class_transformer.Type)(() => Product)
    ], Meta.prototype, "implementation", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => Product)
    ], Meta.prototype, "runtime", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => Product)
    ], Meta.prototype, "os", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => Product)
    ], Meta.prototype, "cpu", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => Ci)
    ], Meta.prototype, "ci", void 0);
    Ci = class {
      constructor() {
        this.name = "";
      }
    };
    __decorate([
      (0, import_class_transformer.Type)(() => Git)
    ], Ci.prototype, "git", void 0);
    Git = class {
      constructor() {
        this.remote = "";
        this.revision = "";
      }
    };
    Product = class {
      constructor() {
        this.name = "";
      }
    };
    ParameterType = class {
      constructor() {
        this.name = "";
        this.regularExpressions = [];
        this.preferForRegularExpressionMatch = false;
        this.useForSnippets = false;
        this.id = "";
      }
    };
    __decorate([
      (0, import_class_transformer.Type)(() => SourceReference)
    ], ParameterType.prototype, "sourceReference", void 0);
    ParseError = class {
      constructor() {
        this.source = new SourceReference();
        this.message = "";
      }
    };
    __decorate([
      (0, import_class_transformer.Type)(() => SourceReference)
    ], ParseError.prototype, "source", void 0);
    Pickle = class {
      constructor() {
        this.id = "";
        this.uri = "";
        this.name = "";
        this.language = "";
        this.steps = [];
        this.tags = [];
        this.astNodeIds = [];
      }
    };
    __decorate([
      (0, import_class_transformer.Type)(() => Location)
    ], Pickle.prototype, "location", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => PickleStep)
    ], Pickle.prototype, "steps", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => PickleTag)
    ], Pickle.prototype, "tags", void 0);
    PickleDocString = class {
      constructor() {
        this.content = "";
      }
    };
    PickleStep = class {
      constructor() {
        this.astNodeIds = [];
        this.id = "";
        this.text = "";
      }
    };
    __decorate([
      (0, import_class_transformer.Type)(() => PickleStepArgument)
    ], PickleStep.prototype, "argument", void 0);
    PickleStepArgument = class {
    };
    __decorate([
      (0, import_class_transformer.Type)(() => PickleDocString)
    ], PickleStepArgument.prototype, "docString", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => PickleTable)
    ], PickleStepArgument.prototype, "dataTable", void 0);
    PickleTable = class {
      constructor() {
        this.rows = [];
      }
    };
    __decorate([
      (0, import_class_transformer.Type)(() => PickleTableRow)
    ], PickleTable.prototype, "rows", void 0);
    PickleTableCell = class {
      constructor() {
        this.value = "";
      }
    };
    PickleTableRow = class {
      constructor() {
        this.cells = [];
      }
    };
    __decorate([
      (0, import_class_transformer.Type)(() => PickleTableCell)
    ], PickleTableRow.prototype, "cells", void 0);
    PickleTag = class {
      constructor() {
        this.name = "";
        this.astNodeId = "";
      }
    };
    Source = class {
      constructor() {
        this.uri = "";
        this.data = "";
        this.mediaType = SourceMediaType.TEXT_X_CUCUMBER_GHERKIN_PLAIN;
      }
    };
    SourceReference = class {
    };
    __decorate([
      (0, import_class_transformer.Type)(() => JavaMethod)
    ], SourceReference.prototype, "javaMethod", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => JavaStackTraceElement)
    ], SourceReference.prototype, "javaStackTraceElement", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => Location)
    ], SourceReference.prototype, "location", void 0);
    JavaMethod = class {
      constructor() {
        this.className = "";
        this.methodName = "";
        this.methodParameterTypes = [];
      }
    };
    JavaStackTraceElement = class {
      constructor() {
        this.className = "";
        this.fileName = "";
        this.methodName = "";
      }
    };
    StepDefinition = class {
      constructor() {
        this.id = "";
        this.pattern = new StepDefinitionPattern();
        this.sourceReference = new SourceReference();
      }
    };
    __decorate([
      (0, import_class_transformer.Type)(() => StepDefinitionPattern)
    ], StepDefinition.prototype, "pattern", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => SourceReference)
    ], StepDefinition.prototype, "sourceReference", void 0);
    StepDefinitionPattern = class {
      constructor() {
        this.source = "";
        this.type = StepDefinitionPatternType.CUCUMBER_EXPRESSION;
      }
    };
    Suggestion = class {
      constructor() {
        this.id = "";
        this.pickleStepId = "";
        this.snippets = [];
      }
    };
    __decorate([
      (0, import_class_transformer.Type)(() => Snippet)
    ], Suggestion.prototype, "snippets", void 0);
    Snippet = class {
      constructor() {
        this.language = "";
        this.code = "";
      }
    };
    TestCase = class {
      constructor() {
        this.id = "";
        this.pickleId = "";
        this.testSteps = [];
      }
    };
    __decorate([
      (0, import_class_transformer.Type)(() => TestStep)
    ], TestCase.prototype, "testSteps", void 0);
    Group = class {
    };
    __decorate([
      (0, import_class_transformer.Type)(() => Group)
    ], Group.prototype, "children", void 0);
    StepMatchArgument = class {
      constructor() {
        this.group = new Group();
      }
    };
    __decorate([
      (0, import_class_transformer.Type)(() => Group)
    ], StepMatchArgument.prototype, "group", void 0);
    StepMatchArgumentsList = class {
      constructor() {
        this.stepMatchArguments = [];
      }
    };
    __decorate([
      (0, import_class_transformer.Type)(() => StepMatchArgument)
    ], StepMatchArgumentsList.prototype, "stepMatchArguments", void 0);
    TestStep = class {
      constructor() {
        this.id = "";
      }
    };
    __decorate([
      (0, import_class_transformer.Type)(() => StepMatchArgumentsList)
    ], TestStep.prototype, "stepMatchArgumentsLists", void 0);
    TestCaseFinished = class {
      constructor() {
        this.testCaseStartedId = "";
        this.timestamp = new Timestamp();
        this.willBeRetried = false;
      }
    };
    __decorate([
      (0, import_class_transformer.Type)(() => Timestamp)
    ], TestCaseFinished.prototype, "timestamp", void 0);
    TestCaseStarted = class {
      constructor() {
        this.attempt = 0;
        this.id = "";
        this.testCaseId = "";
        this.timestamp = new Timestamp();
      }
    };
    __decorate([
      (0, import_class_transformer.Type)(() => Timestamp)
    ], TestCaseStarted.prototype, "timestamp", void 0);
    TestRunFinished = class {
      constructor() {
        this.success = false;
        this.timestamp = new Timestamp();
      }
    };
    __decorate([
      (0, import_class_transformer.Type)(() => Timestamp)
    ], TestRunFinished.prototype, "timestamp", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => Exception)
    ], TestRunFinished.prototype, "exception", void 0);
    TestRunHookFinished = class {
      constructor() {
        this.testRunHookStartedId = "";
        this.result = new TestStepResult();
        this.timestamp = new Timestamp();
      }
    };
    __decorate([
      (0, import_class_transformer.Type)(() => TestStepResult)
    ], TestRunHookFinished.prototype, "result", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => Timestamp)
    ], TestRunHookFinished.prototype, "timestamp", void 0);
    TestRunHookStarted = class {
      constructor() {
        this.id = "";
        this.testRunStartedId = "";
        this.hookId = "";
        this.timestamp = new Timestamp();
      }
    };
    __decorate([
      (0, import_class_transformer.Type)(() => Timestamp)
    ], TestRunHookStarted.prototype, "timestamp", void 0);
    TestRunStarted = class {
      constructor() {
        this.timestamp = new Timestamp();
      }
    };
    __decorate([
      (0, import_class_transformer.Type)(() => Timestamp)
    ], TestRunStarted.prototype, "timestamp", void 0);
    TestStepFinished = class {
      constructor() {
        this.testCaseStartedId = "";
        this.testStepId = "";
        this.testStepResult = new TestStepResult();
        this.timestamp = new Timestamp();
      }
    };
    __decorate([
      (0, import_class_transformer.Type)(() => TestStepResult)
    ], TestStepFinished.prototype, "testStepResult", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => Timestamp)
    ], TestStepFinished.prototype, "timestamp", void 0);
    TestStepResult = class {
      constructor() {
        this.duration = new Duration();
        this.status = TestStepResultStatus.UNKNOWN;
      }
    };
    __decorate([
      (0, import_class_transformer.Type)(() => Duration)
    ], TestStepResult.prototype, "duration", void 0);
    __decorate([
      (0, import_class_transformer.Type)(() => Exception)
    ], TestStepResult.prototype, "exception", void 0);
    TestStepStarted = class {
      constructor() {
        this.testCaseStartedId = "";
        this.testStepId = "";
        this.timestamp = new Timestamp();
      }
    };
    __decorate([
      (0, import_class_transformer.Type)(() => Timestamp)
    ], TestStepStarted.prototype, "timestamp", void 0);
    Timestamp = class {
      constructor() {
        this.seconds = 0;
        this.nanos = 0;
      }
    };
    UndefinedParameterType = class {
      constructor() {
        this.expression = "";
        this.name = "";
      }
    };
    (function(AttachmentContentEncoding2) {
      AttachmentContentEncoding2["IDENTITY"] = "IDENTITY";
      AttachmentContentEncoding2["BASE64"] = "BASE64";
    })(AttachmentContentEncoding || (AttachmentContentEncoding = {}));
    (function(HookType2) {
      HookType2["BEFORE_TEST_RUN"] = "BEFORE_TEST_RUN";
      HookType2["AFTER_TEST_RUN"] = "AFTER_TEST_RUN";
      HookType2["BEFORE_TEST_CASE"] = "BEFORE_TEST_CASE";
      HookType2["AFTER_TEST_CASE"] = "AFTER_TEST_CASE";
      HookType2["BEFORE_TEST_STEP"] = "BEFORE_TEST_STEP";
      HookType2["AFTER_TEST_STEP"] = "AFTER_TEST_STEP";
    })(HookType || (HookType = {}));
    (function(PickleStepType2) {
      PickleStepType2["UNKNOWN"] = "Unknown";
      PickleStepType2["CONTEXT"] = "Context";
      PickleStepType2["ACTION"] = "Action";
      PickleStepType2["OUTCOME"] = "Outcome";
    })(PickleStepType || (PickleStepType = {}));
    (function(SourceMediaType2) {
      SourceMediaType2["TEXT_X_CUCUMBER_GHERKIN_PLAIN"] = "text/x.cucumber.gherkin+plain";
      SourceMediaType2["TEXT_X_CUCUMBER_GHERKIN_MARKDOWN"] = "text/x.cucumber.gherkin+markdown";
    })(SourceMediaType || (SourceMediaType = {}));
    (function(StepDefinitionPatternType2) {
      StepDefinitionPatternType2["CUCUMBER_EXPRESSION"] = "CUCUMBER_EXPRESSION";
      StepDefinitionPatternType2["REGULAR_EXPRESSION"] = "REGULAR_EXPRESSION";
    })(StepDefinitionPatternType || (StepDefinitionPatternType = {}));
    (function(StepKeywordType2) {
      StepKeywordType2["UNKNOWN"] = "Unknown";
      StepKeywordType2["CONTEXT"] = "Context";
      StepKeywordType2["ACTION"] = "Action";
      StepKeywordType2["OUTCOME"] = "Outcome";
      StepKeywordType2["CONJUNCTION"] = "Conjunction";
    })(StepKeywordType || (StepKeywordType = {}));
    (function(TestStepResultStatus2) {
      TestStepResultStatus2["UNKNOWN"] = "UNKNOWN";
      TestStepResultStatus2["PASSED"] = "PASSED";
      TestStepResultStatus2["SKIPPED"] = "SKIPPED";
      TestStepResultStatus2["PENDING"] = "PENDING";
      TestStepResultStatus2["UNDEFINED"] = "UNDEFINED";
      TestStepResultStatus2["AMBIGUOUS"] = "AMBIGUOUS";
      TestStepResultStatus2["FAILED"] = "FAILED";
    })(TestStepResultStatus || (TestStepResultStatus = {}));
  }
});

// node_modules/@cucumber/messages/dist/esm/src/parseEnvelope.js
var init_parseEnvelope = __esm({
  "node_modules/@cucumber/messages/dist/esm/src/parseEnvelope.js"() {
    init_messages();
  }
});

// node_modules/@cucumber/messages/dist/esm/src/getWorstTestStepResult.js
var init_getWorstTestStepResult = __esm({
  "node_modules/@cucumber/messages/dist/esm/src/getWorstTestStepResult.js"() {
    init_messages();
    init_TimeConversion();
  }
});

// node_modules/@cucumber/messages/dist/esm/src/version.js
var init_version = __esm({
  "node_modules/@cucumber/messages/dist/esm/src/version.js"() {
  }
});

// node_modules/@cucumber/messages/dist/esm/src/index.js
var init_src = __esm({
  "node_modules/@cucumber/messages/dist/esm/src/index.js"() {
    init_TimeConversion();
    init_IdGenerator();
    init_parseEnvelope();
    init_getWorstTestStepResult();
    init_version();
    init_messages();
  }
});

// tools/spec-graph/parsers/gherkin.ts
import fs3 from "node:fs";
import path3 from "node:path";
function slugifyName(name) {
  return name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unnamed";
}
function parseGherkin(source, relativePath) {
  const idGen = IdGenerator_exports.incrementing();
  const builder = new import_gherkin.AstBuilder(idGen);
  const matcher = new import_gherkin.GherkinClassicTokenMatcher();
  const parser = new import_gherkin.Parser(builder, matcher);
  let doc;
  try {
    doc = parser.parse(source);
  } catch {
    return { nodes: [], edges: [], anchors: [] };
  }
  if (!doc.feature) {
    return { nodes: [], edges: [], anchors: [] };
  }
  const featureTags = (doc.feature.tags ?? []).map((t) => t.name);
  const slug = specOf(relativePath);
  const qualify = (id) => slug ? `${slug}:${id}` : id;
  const nodes = [];
  const edges = [];
  const edgeSeen = /* @__PURE__ */ new Set();
  const pushEdge = (e) => {
    const key = `${e.from}|${e.to}|${e.type}`;
    if (edgeSeen.has(key)) return;
    edgeSeen.add(key);
    edges.push(e);
  };
  const anchors = [];
  const seenIds = /* @__PURE__ */ new Map();
  const entries = [];
  for (const child of doc.feature.children) {
    if (child.scenario) {
      entries.push({ scenario: child.scenario, ruleTags: [] });
    } else if (child.rule?.children) {
      const ruleTags = (child.rule.tags ?? []).map((t) => t.name);
      for (const rc of child.rule.children) {
        if (rc.scenario) entries.push({ scenario: rc.scenario, ruleTags });
      }
    }
  }
  for (const { scenario, ruleTags } of entries) {
    const scenarioTags = (scenario.tags ?? []).map((t) => t.name);
    const tags = [...featureTags, ...ruleTags, ...scenarioTags];
    let baseId = `SCEN-${slugifyName(scenario.name)}`;
    const seen = seenIds.get(baseId) ?? 0;
    seenIds.set(baseId, seen + 1);
    const bareScenarioId = seen === 0 ? baseId : `${baseId}-${seen + 1}`;
    const scenarioId = qualify(bareScenarioId);
    const line = scenario.location.line;
    const steps = (scenario.steps ?? []).map((s) => ({
      keyword: s.keyword.trim(),
      text: s.text
    }));
    const node = {
      id: scenarioId,
      type: "Scenario",
      // The raw Gherkin scenario name, kept verbatim (not slugified into the id)
      // so a test result can be reconciled BY NAME when the executed feature and
      // the spec's canonical feature live at different paths/lines — the case
      // where the `${uri}:${line}` join alone silently drops every result.
      title: scenario.name,
      file: relativePath,
      line,
      tags,
      steps
    };
    if (slug) node.spec = slug;
    nodes.push(node);
    anchors.push({
      alias: bareScenarioId,
      canonicalId: bareScenarioId,
      location: { file: relativePath, line }
    });
    for (const tag of tags) {
      const m = tag.match(SPEC_TAG_RE2);
      if (m) {
        pushEdge({ from: qualify(m[1]), to: scenarioId, type: "tested-by" });
        continue;
      }
      const f = tag.match(FEATURE_TAG_RE);
      if (f && slug) {
        pushEdge({ from: `${slug}:FR-${f[1]}`, to: scenarioId, type: "tested-by" });
      }
    }
  }
  return { nodes, edges, anchors };
}
function parseGherkinFile(absPath, repoRoot) {
  const source = fs3.readFileSync(absPath, "utf-8");
  const relative = path3.relative(repoRoot, absPath).split(path3.sep).join("/");
  return parseGherkin(source, relative);
}
var import_gherkin, SPEC_TAG_RE2, FEATURE_TAG_RE;
var init_gherkin = __esm({
  "tools/spec-graph/parsers/gherkin.ts"() {
    "use strict";
    import_gherkin = __toESM(require_src2(), 1);
    init_src();
    init_coverage();
    SPEC_TAG_RE2 = /^@((?:FR|NFR|AC)[A-Za-z0-9._-]+)$/;
    FEATURE_TAG_RE = /^@feature(\d+)$/i;
  }
});

// tools/spec-graph/parsers/ndjson.ts
import fs4 from "node:fs";
function normalizeStatus(raw) {
  if (typeof raw !== "string") return "UNKNOWN";
  const upper = raw.toUpperCase();
  if (upper === "PASSED" || upper === "FAILED" || upper === "SKIPPED" || upper === "PENDING" || upper === "UNDEFINED" || upper === "AMBIGUOUS") {
    return upper;
  }
  return "UNKNOWN";
}
function statusSeverity(s) {
  switch (s) {
    case "FAILED":
      return 6;
    case "AMBIGUOUS":
      return 5;
    case "UNDEFINED":
      return 4;
    case "PENDING":
      return 3;
    case "SKIPPED":
      return 2;
    case "PASSED":
      return 1;
    default:
      return 0;
  }
}
function parseNdjson(source) {
  const lines = source.split(/\r?\n/);
  const pickles = /* @__PURE__ */ new Map();
  const testCaseToPickle = /* @__PURE__ */ new Map();
  const startedToTestCase = /* @__PURE__ */ new Map();
  const astLineByNodeId = /* @__PURE__ */ new Map();
  const pickleStepText = /* @__PURE__ */ new Map();
  const testStepToPickleStep = /* @__PURE__ */ new Map();
  const byLocation = /* @__PURE__ */ new Map();
  const testCaseResult = /* @__PURE__ */ new Map();
  for (const line of lines) {
    if (!line.trim()) continue;
    let env;
    try {
      env = JSON.parse(line);
    } catch {
      continue;
    }
    const doc = env.gherkinDocument;
    if (doc?.feature?.children) {
      const indexScenario = (sc) => {
        if (sc?.id && typeof sc.location?.line === "number") astLineByNodeId.set(sc.id, sc.location.line);
      };
      for (const ch of doc.feature.children) {
        indexScenario(ch.scenario);
        if (ch.rule?.children) for (const rc of ch.rule.children) indexScenario(rc.scenario);
      }
      continue;
    }
    const pickle = env.pickle;
    if (pickle?.id) {
      const astLine = (pickle.astNodeIds ?? []).map((nid) => astLineByNodeId.get(nid)).find((l) => typeof l === "number");
      pickles.set(pickle.id, {
        name: pickle.name ?? "",
        // Cucumber on Windows emits backslash uris (`.specs\\foo.feature`); the
        // SpecGraph keys scenarios by POSIX path, so normalise here or the
        // `${uri}:${line}` join never matches and every result is dropped.
        uri: (pickle.uri ?? "").replace(/\\/g, "/"),
        astLine,
        tags: (pickle.tags ?? []).map((t) => t.name)
      });
      for (const step of pickle.steps ?? []) {
        if (step.id && typeof step.text === "string") {
          pickleStepText.set(step.id, step.text);
        }
      }
      continue;
    }
    const testCase = env.testCase;
    if (testCase?.id && testCase.pickleId) {
      testCaseToPickle.set(testCase.id, testCase.pickleId);
      for (const ts of testCase.testSteps ?? []) {
        if (ts.id && ts.pickleStepId) {
          testStepToPickleStep.set(ts.id, ts.pickleStepId);
        }
      }
      continue;
    }
    const tcStarted = env.testCaseStarted;
    if (tcStarted?.id && tcStarted.testCaseId) {
      startedToTestCase.set(tcStarted.id, tcStarted.testCaseId);
      const ts = tcStarted.timestamp;
      const iso = ts ? new Date((ts.seconds ?? 0) * 1e3 + Math.round((ts.nanos ?? 0) / 1e6)).toISOString() : void 0;
      const acc = testCaseResult.get(tcStarted.testCaseId) ?? { lastResult: "UNKNOWN" };
      acc.startTs = iso;
      testCaseResult.set(tcStarted.testCaseId, acc);
      continue;
    }
    const stepFinished = env.testStepFinished;
    if (stepFinished?.testCaseStartedId && stepFinished.testStepResult) {
      const tcId = startedToTestCase.get(stepFinished.testCaseStartedId);
      if (tcId) {
        const acc = testCaseResult.get(tcId) ?? { lastResult: "UNKNOWN" };
        const status = normalizeStatus(stepFinished.testStepResult.status);
        if (statusSeverity(status) > statusSeverity(acc.lastResult)) acc.lastResult = status;
        if (status === "FAILED" && !acc.failingStep) {
          let stepText = "";
          if (stepFinished.testStepId) {
            const pickleStepId = testStepToPickleStep.get(stepFinished.testStepId);
            if (pickleStepId) {
              stepText = pickleStepText.get(pickleStepId) ?? "";
            }
          }
          acc.failingStep = {
            step: stepText,
            errorMessage: stepFinished.testStepResult.message ?? ""
          };
        }
        testCaseResult.set(tcId, acc);
      }
      continue;
    }
    const tcFinished = env.testCaseFinished;
    if (tcFinished?.testCaseStartedId) {
      const tcId = startedToTestCase.get(tcFinished.testCaseStartedId);
      if (tcId) {
        const acc = testCaseResult.get(tcId) ?? { lastResult: "UNKNOWN" };
        const explicit = normalizeStatus(env.testCaseFinished.testStepResult?.status);
        if (explicit !== "UNKNOWN" && statusSeverity(explicit) > statusSeverity(acc.lastResult)) {
          acc.lastResult = explicit;
        } else if (acc.lastResult === "UNKNOWN") {
          acc.lastResult = "PASSED";
        }
        if (tcFinished.timestamp && acc.startTs) {
          const endMs = (tcFinished.timestamp.seconds ?? 0) * 1e3 + Math.round((tcFinished.timestamp.nanos ?? 0) / 1e6);
          const startMs = new Date(acc.startTs).getTime();
          if (Number.isFinite(startMs)) acc.durationMs = Math.max(0, endMs - startMs);
        }
        testCaseResult.set(tcId, acc);
      }
      continue;
    }
  }
  const byName = /* @__PURE__ */ new Map();
  for (const [tcId, acc] of testCaseResult) {
    const pickleId = testCaseToPickle.get(tcId);
    if (!pickleId) continue;
    const info = pickles.get(pickleId);
    if (!info || typeof info.astLine !== "number" || !info.uri) continue;
    const key = `${info.uri}:${info.astLine}`;
    const fields = {
      lastResult: acc.lastResult,
      lastRunAt: acc.startTs,
      durationMs: acc.durationMs,
      failingStep: acc.failingStep ?? null
    };
    const prev = byLocation.get(key);
    if (!prev || statusSeverity(fields.lastResult) > statusSeverity(prev.lastResult)) {
      byLocation.set(key, fields);
    }
    if (info.name) {
      if (!byName.has(info.name)) {
        byName.set(info.name, fields);
      } else {
        const seen = byName.get(info.name);
        if (seen && seen.lastResult !== fields.lastResult) byName.set(info.name, null);
      }
    }
  }
  return { byLocation, byName };
}
function parseNdjsonFile(absPath) {
  if (!fs4.existsSync(absPath)) return { byLocation: /* @__PURE__ */ new Map(), byName: /* @__PURE__ */ new Map() };
  return parseNdjson(fs4.readFileSync(absPath, "utf-8"));
}
function applyTestResults(scenarios, patch) {
  let applied = 0;
  let keys = null;
  for (const s of scenarios) {
    const exactKey = `${s.file}:${s.line}`;
    let fields = patch.byLocation.get(exactKey);
    if (!fields) {
      if (keys === null) keys = [...patch.byLocation.keys()];
      const suffix = `/${s.file}:${s.line}`;
      const hit = keys.find((k) => k.endsWith(suffix));
      if (hit) fields = patch.byLocation.get(hit);
    }
    if (!fields && s.title) {
      const named = patch.byName.get(s.title);
      if (named) fields = named;
    }
    if (!fields) continue;
    s.lastResult = fields.lastResult;
    s.lastRunAt = fields.lastRunAt;
    s.canonicalResult = fields.lastResult;
    s.canonicalRunAt = fields.lastRunAt;
    s.resultStale = false;
    s.trace = void 0;
    s.durationMs = fields.durationMs;
    s.failingStep = fields.failingStep;
    applied++;
  }
  return applied;
}
var init_ndjson = __esm({
  "tools/spec-graph/parsers/ndjson.ts"() {
    "use strict";
  }
});

// tools/spec-graph/parsers/scenario-overlay.ts
import fs5 from "node:fs";
import path4 from "node:path";
import { fileURLToPath } from "node:url";
function normalizeStatus2(raw) {
  if (typeof raw !== "string") return "UNKNOWN";
  const upper = raw.toUpperCase();
  return STATUSES.has(upper) ? upper : "UNKNOWN";
}
function parseTimeMs(raw) {
  if (typeof raw !== "string" || raw.length === 0) return void 0;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : void 0;
}
function normalizeUri(raw) {
  if (typeof raw !== "string" || raw.length === 0) return void 0;
  return raw.replace(/\\/g, "/");
}
function locationKey(uri, line) {
  if (!uri || typeof line !== "number") return void 0;
  return `${uri}:${line}`;
}
function keepNewest(map, key, row) {
  if (!key) return;
  const prev = map.get(key);
  if (!prev || row.timeMs >= prev.timeMs) map.set(key, row);
}
function parseScenarioOverlay(source) {
  const byScenarioKey = /* @__PURE__ */ new Map();
  const byLocation = /* @__PURE__ */ new Map();
  for (const line of source.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let raw;
    try {
      raw = JSON.parse(line);
    } catch {
      continue;
    }
    const scenarioId = typeof raw.scenario_id === "string" ? raw.scenario_id : "";
    const timeMs = parseTimeMs(raw.time);
    if (!scenarioId || timeMs === void 0) continue;
    const row = {
      scenarioId,
      result: normalizeStatus2(raw.result),
      time: raw.time,
      timeMs,
      uri: normalizeUri(raw.uri),
      line: typeof raw.line === "number" ? raw.line : void 0,
      runId: typeof raw.run_id === "string" ? raw.run_id : void 0,
      source: typeof raw.source === "string" ? raw.source : void 0,
      gitSha: typeof raw.git_sha === "string" ? raw.git_sha : void 0,
      failingStep: raw.failing_step && typeof raw.failing_step === "object" ? raw.failing_step : void 0,
      traceId: typeof raw.trace_id === "string" ? raw.trace_id : void 0,
      traceFile: normalizeUri(raw.trace_file),
      testCaseStartedId: typeof raw.test_case_started_id === "string" ? raw.test_case_started_id : void 0
    };
    keepNewest(byScenarioKey, scenarioKey(scenarioId) ?? scenarioId.toLowerCase(), row);
    keepNewest(byLocation, locationKey(row.uri, row.line), row);
  }
  return { byScenarioKey, byLocation };
}
function parseScenarioOverlayFile(absPath) {
  if (!fs5.existsSync(absPath)) return { byScenarioKey: /* @__PURE__ */ new Map(), byLocation: /* @__PURE__ */ new Map() };
  return parseScenarioOverlay(fs5.readFileSync(absPath, "utf-8"));
}
function resolvePath(repoRoot, p) {
  if (p.startsWith("file://")) return fileURLToPath(p);
  return path4.isAbsolute(p) ? p : path4.resolve(repoRoot, p);
}
function mtimeMs(absPath) {
  try {
    return fs5.statSync(absPath).mtimeMs;
  } catch {
    return void 0;
  }
}
function traceIndex(repoRoot, traceFile) {
  if (!traceFile) return null;
  const abs = resolvePath(repoRoot, traceFile);
  const cached = traceCache.get(abs);
  if (cached !== void 0) return cached;
  if (!fs5.existsSync(abs)) {
    traceCache.set(abs, null);
    return null;
  }
  const stepDefinitionUri = /* @__PURE__ */ new Map();
  const testCaseStepDefs = /* @__PURE__ */ new Map();
  const startedToCase = /* @__PURE__ */ new Map();
  for (const line of fs5.readFileSync(abs, "utf-8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    let env;
    try {
      env = JSON.parse(line);
    } catch {
      continue;
    }
    const stepDefinition = env.stepDefinition;
    if (stepDefinition?.id && typeof stepDefinition.sourceReference?.uri === "string") {
      stepDefinitionUri.set(stepDefinition.id, stepDefinition.sourceReference.uri.replace(/\\/g, "/"));
      continue;
    }
    const testCase = env.testCase;
    if (testCase?.id) {
      const ids = [];
      for (const step of testCase.testSteps ?? []) {
        for (const id of step.stepDefinitionIds ?? []) ids.push(id);
      }
      testCaseStepDefs.set(testCase.id, ids);
      continue;
    }
    const started = env.testCaseStarted;
    if (started?.id && started.testCaseId) {
      startedToCase.set(started.id, started.testCaseId);
      continue;
    }
  }
  const stepDefinitionUrisByStartedId = /* @__PURE__ */ new Map();
  for (const [startedId2, testCaseId] of startedToCase) {
    const uris = [...new Set((testCaseStepDefs.get(testCaseId) ?? []).map((id) => stepDefinitionUri.get(id)).filter((u) => typeof u === "string" && u.length > 0))];
    if (uris.length > 0) stepDefinitionUrisByStartedId.set(startedId2, uris);
  }
  const index = { stepDefinitionUrisByStartedId };
  traceCache.set(abs, index);
  return index;
}
function startedId(row) {
  if (row.testCaseStartedId) return row.testCaseStartedId;
  const m = row.traceId?.match(/#([^#]+)$/);
  return m?.[1];
}
function applyTraceRef(scenario, row) {
  if (!row.traceId) {
    scenario.trace = void 0;
    return;
  }
  scenario.trace = {
    traceId: row.traceId,
    traceFile: row.traceFile,
    testCaseStartedId: startedId(row),
    runId: row.runId,
    source: row.source,
    gitSha: row.gitSha
  };
}
function freshnessThresholdMs(repoRoot, scenario, row) {
  const candidates = [];
  const featureMtime = mtimeMs(resolvePath(repoRoot, scenario.file));
  if (featureMtime !== void 0) candidates.push(featureMtime);
  const trace = traceIndex(repoRoot, row.traceFile);
  const start = startedId(row);
  for (const uri of start && trace ? trace.stepDefinitionUrisByStartedId.get(start) ?? [] : []) {
    const ms = mtimeMs(resolvePath(repoRoot, uri));
    if (ms !== void 0) candidates.push(ms);
  }
  return candidates.length > 0 ? Math.max(...candidates) : void 0;
}
function findByLocation(patch, scenario) {
  const exactKey = `${scenario.file}:${scenario.line}`;
  const exact = patch.byLocation.get(exactKey);
  if (exact) return exact;
  const suffix = `/${scenario.file}:${scenario.line}`;
  for (const [key, row] of patch.byLocation) {
    if (key.endsWith(suffix)) return row;
  }
  return void 0;
}
function applyScenarioOverlayResults(scenarios, patch, opts) {
  let applied = 0;
  for (const scenario of scenarios) {
    const key = scenarioKey(scenario.id);
    const byId = key ? patch.byScenarioKey.get(key) : void 0;
    const byLocation = findByLocation(patch, scenario);
    const row = byId && byLocation ? byId.timeMs >= byLocation.timeMs ? byId : byLocation : byId ?? byLocation;
    if (!row) continue;
    const currentMs = parseTimeMs(scenario.lastRunAt);
    const overlayWins = currentMs === void 0 || row.timeMs > currentMs;
    const overlayEffective = overlayWins || row.timeMs === currentMs;
    if (overlayWins) {
      scenario.lastResult = row.result;
      scenario.lastRunAt = row.time;
      applyTraceRef(scenario, row);
      scenario.durationMs = void 0;
      scenario.failingStep = row.failingStep ?? null;
      applied++;
    } else if (overlayEffective && row.traceId) {
      applyTraceRef(scenario, row);
    }
    if (overlayEffective && row.result === "PASSED") {
      const threshold = freshnessThresholdMs(opts.repoRoot, scenario, row);
      const sourceStale = threshold !== void 0 && row.timeMs < threshold;
      const commitStale = Boolean(opts.currentGitSha) && row.gitSha !== opts.currentGitSha;
      scenario.resultStale = sourceStale || commitStale || Boolean(opts.currentGitSha) && !row.gitSha;
    } else if (overlayEffective) {
      scenario.resultStale = false;
    }
  }
  return applied;
}
var STATUSES, traceCache;
var init_scenario_overlay = __esm({
  "tools/spec-graph/parsers/scenario-overlay.ts"() {
    "use strict";
    init_coverage();
    STATUSES = /* @__PURE__ */ new Set([
      "PASSED",
      "FAILED",
      "SKIPPED",
      "PENDING",
      "UNDEFINED",
      "AMBIGUOUS",
      "UNKNOWN"
    ]);
    traceCache = /* @__PURE__ */ new Map();
  }
});

// tools/specs-validator/spec-form-parsers.ts
import fs6 from "fs";
function parseUserStoryBlocks(content) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!US_HEADING.test(line)) continue;
    let j = i + 1;
    for (; j < lines.length; j++) {
      if (US_HEADING.test(lines[j])) break;
      if (/^##\s/.test(lines[j])) break;
    }
    const body = lines.slice(i, j).join("\n");
    const hasPriority = US_PRIORITY.test(line);
    const hasWhy = /\*\*Why:\*\*/.test(body);
    const hasIndependentTest = /\*\*Independent Test:\*\*/.test(body);
    const hasAcceptanceScenarios = /\*\*Acceptance Scenarios:\*\*/.test(body);
    const missingFirst = !hasPriority && "Priority" || !hasWhy && "Why" || !hasIndependentTest && "Independent Test" || !hasAcceptanceScenarios && "Acceptance Scenarios" || null;
    blocks.push({
      lineNumber: i + 1,
      heading: line.replace(/^###\s+/, ""),
      hasPriority,
      hasWhy,
      hasIndependentTest,
      hasAcceptanceScenarios,
      missingFirst
    });
  }
  return blocks;
}
function parseTaskBlocks(content) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let currentPhase = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const phaseMatch = line.match(PHASE_HEADING);
    if (phaseMatch) {
      currentPhase = phaseMatch[1].trim();
      continue;
    }
    const bulletMatch = line.match(TASK_BULLET);
    const headingMatch = line.match(TASK_HEADING);
    if (!bulletMatch && !headingMatch) continue;
    const title = bulletMatch ? bulletMatch[1] : headingMatch[1];
    let j = i + 1;
    for (; j < lines.length; j++) {
      const nextLine = lines[j];
      if (PHASE_HEADING.test(nextLine)) break;
      if (bulletMatch && TASK_BULLET.test(nextLine) && !/^\s/.test(nextLine)) break;
      if (headingMatch && TASK_HEADING.test(nextLine)) break;
      if (bulletMatch && /^\s*$/.test(nextLine) && j + 1 < lines.length && TASK_BULLET.test(lines[j + 1])) break;
    }
    const body = lines.slice(i, j).join("\n");
    const hasStatus = STATUS_TAG.test(body);
    const badStatusValue = hasStatus ? null : body.match(STATUS_PRESENT)?.[1] ?? null;
    const hasEst = EST_TAG.test(body);
    const hasDoneWhen = /\*\*Done When:\*\*/.test(body);
    const waived = WAIVED_RE.test(body);
    let doneWhenCheckboxes = 0;
    if (hasDoneWhen) {
      const [, afterDoneWhen = ""] = body.split(/\*\*Done When:\*\*/);
      doneWhenCheckboxes = (afterDoneWhen.match(/^\s*-\s+\[[ x]\]/gm) || []).length;
    }
    const isPhaseMinusOne = /Phase\s+-1/i.test(currentPhase);
    const missingFirst = waived ? null : isPhaseMinusOne ? null : !hasDoneWhen && "Done When block" || hasDoneWhen && doneWhenCheckboxes === 0 && "Done When checkbox (at least one - [ ])" || !hasStatus && (badStatusValue ? `valid Status value (got "${badStatusValue}", expected TODO|READY|IN_PROGRESS|DONE|BLOCKED)` : "Status tag") || !hasEst && "Est tag" || null;
    blocks.push({
      lineNumber: i + 1,
      title: title.slice(0, 160),
      phase: currentPhase,
      hasStatus,
      hasEst,
      hasDoneWhen,
      doneWhenCheckboxes,
      waived,
      missingFirst
    });
  }
  return blocks;
}
function parseDecisionBlocks(content) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!DECISION_HEADING.test(line)) continue;
    let j = i + 1;
    for (; j < lines.length; j++) {
      if (/^###?\s/.test(lines[j])) break;
    }
    const body = lines.slice(i, j).join("\n");
    const hasRationale = /\*\*Rationale:\*\*/.test(body);
    const hasTradeoff = /\*\*Trade-?off:\*\*/.test(body);
    const hasAlternatives = /\*\*Alternatives considered:\*\*/.test(body);
    let alternativesCount = 0;
    if (hasAlternatives) {
      const [, after = ""] = body.split(/\*\*Alternatives considered:\*\*/);
      alternativesCount = (after.match(/^\s*-\s+/gm) || []).length;
    }
    const missingFirst = !hasRationale && "Rationale" || !hasTradeoff && "Trade-off" || !hasAlternatives && "Alternatives considered" || hasAlternatives && alternativesCount < 2 && "Alternatives bullets (\u22652 required)" || null;
    blocks.push({
      lineNumber: i + 1,
      heading: line.replace(/^###\s+/, ""),
      hasRationale,
      hasTradeoff,
      hasAlternatives,
      alternativesCount,
      missingFirst
    });
  }
  return blocks;
}
function parseChkRows(content) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith("|")) continue;
    if (/^\|[\s-:|]+\|$/.test(line)) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 5) continue;
    const [id, requirement, tracesTo, verificationMethod, status, notes = ""] = cells;
    if (!/^CHK-/.test(id)) continue;
    if (id === "CHK-ID") continue;
    const idValid = CHK_ID_VALID.test(id);
    const tracesValid = /\bFR-\d+/.test(tracesTo) && /(AC-\d+|@feature\d+|UC-\d+)/.test(tracesTo);
    const methodValid = ALLOWED_METHODS.has(verificationMethod);
    const statusValid = ALLOWED_STATUSES.has(status);
    const missingFirst = !idValid && `CHK-ID format must match CHK-FR{n}-{nn} (got "${id}")` || !tracesValid && "Traces To must include FR-N + (AC-N | @featureN | UC-N)" || !verificationMethod && "Verification Method (empty)" || !methodValid && `Verification Method must be one of: ${[...ALLOWED_METHODS].join(", ")} (got "${verificationMethod}")` || !statusValid && `Status must be one of: ${[...ALLOWED_STATUSES].join(", ")} (got "${status}")` || null;
    rows.push({
      lineNumber: i + 1,
      id,
      requirement,
      tracesTo,
      verificationMethod,
      status,
      notes,
      idValid,
      tracesValid,
      methodValid,
      statusValid,
      missingFirst
    });
  }
  return rows;
}
function parseRiskRows(content) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  let headingLineNumber = null;
  let tableStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (RISK_HEADING.test(lines[i])) {
      headingLineNumber = i + 1;
      for (let j = i + 1; j < lines.length; j++) {
        if (/^\|/.test(lines[j].trim())) {
          tableStart = j;
          break;
        }
        if (/^##\s/.test(lines[j])) break;
      }
      break;
    }
  }
  if (headingLineNumber === null) {
    return { headingLineNumber: null, rows: [], validRowCount: 0 };
  }
  const rows = [];
  if (tableStart >= 0) {
    for (let i = tableStart; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line.startsWith("|")) break;
      if (/^\|[\s-:|]+\|$/.test(line)) continue;
      const cells = line.split("|").slice(1, -1).map((c) => c.trim());
      if (cells.length < 4) continue;
      const [risk, likelihood, impact, mitigation] = cells;
      if (risk === "Risk" && likelihood === "Likelihood") continue;
      const isPlaceholder = PLACEHOLDER_MARKERS.test(risk) || PLACEHOLDER_MARKERS.test(mitigation) || /\{[^}]*\}/.test(risk) || /\{[^}]*\}/.test(mitigation);
      const likelihoodValid = ALLOWED_LEVELS.has(likelihood);
      const impactValid = ALLOWED_LEVELS.has(impact);
      const mitigationValid = !!mitigation && !PLACEHOLDER_MARKERS.test(mitigation) && !/\{[^}]*\}/.test(mitigation);
      rows.push({
        lineNumber: i + 1,
        risk,
        likelihood,
        impact,
        mitigation,
        isPlaceholder,
        likelihoodValid,
        impactValid,
        mitigationValid
      });
    }
  }
  const validRowCount = rows.filter(
    (r) => !r.isPlaceholder && r.likelihoodValid && r.impactValid && r.mitigationValid
  ).length;
  return { headingLineNumber, rows, validRowCount };
}
function runCheckCli(argv) {
  const [flag, kind, file] = argv;
  const usage = "usage: spec-form-parsers.ts --check <user-stories|tasks|decisions|chk-rows|risks> <file>";
  if (flag !== "--check" || !kind || !file) return { output: usage, exitCode: 2 };
  let content;
  try {
    content = fs6.readFileSync(file, "utf-8");
  } catch (e) {
    return { output: `cannot read ${file}: ${e instanceof Error ? e.message : e}`, exitCode: 2 };
  }
  const violations = [];
  switch (kind) {
    case "user-stories":
      for (const b of parseUserStoryBlocks(content)) {
        if (b.missingFirst) violations.push(`${file}:${b.lineNumber} [${b.heading}] missing: ${b.missingFirst}`);
      }
      break;
    case "tasks":
      for (const b of parseTaskBlocks(content)) {
        if (!b.waived && b.missingFirst) violations.push(`${file}:${b.lineNumber} [${b.title}] missing: ${b.missingFirst}`);
      }
      break;
    case "decisions":
      for (const b of parseDecisionBlocks(content)) {
        if (b.missingFirst) violations.push(`${file}:${b.lineNumber} [${b.heading}] missing: ${b.missingFirst}`);
      }
      break;
    case "chk-rows":
      for (const r of parseChkRows(content)) {
        if (r.missingFirst) violations.push(`${file}:${r.lineNumber} [${r.id}] invalid: ${r.missingFirst}`);
      }
      break;
    case "risks": {
      const assessment = parseRiskRows(content);
      if (assessment.headingLineNumber === null) {
        violations.push(`${file}:1 [Risk Assessment] missing: heading`);
      } else if (assessment.validRowCount < 2) {
        violations.push(`${file}:${assessment.headingLineNumber} [Risk Assessment] invalid: expected \u22652 populated risk rows, got ${assessment.validRowCount}`);
      }
      break;
    }
    default:
      return { output: usage, exitCode: 2 };
  }
  if (violations.length === 0) return { output: `OK \u2014 0 violations (${kind})`, exitCode: 0 };
  return { output: violations.join("\n") + `
${violations.length} violation(s) (${kind})`, exitCode: 1 };
}
var US_HEADING, US_PRIORITY, PHASE_HEADING, TASK_BULLET, TASK_HEADING, STATUS_TAG, STATUS_PRESENT, EST_TAG, WAIVED_RE, DECISION_HEADING, CHK_ID_VALID, ALLOWED_METHODS, ALLOWED_STATUSES, RISK_HEADING, ALLOWED_LEVELS, PLACEHOLDER_MARKERS, isDirectRunFormParsers;
var init_spec_form_parsers = __esm({
  "tools/specs-validator/spec-form-parsers.ts"() {
    "use strict";
    US_HEADING = /^###\s+User Story\s+\d+\b/;
    US_PRIORITY = /\(Priority:\s*P[123]\)/;
    PHASE_HEADING = /^(?:##|###)\s+(Phase\s+[-\d]+\S*.*?)$/i;
    TASK_BULLET = /^-\s+\[[ x]\]\s+(.+)$/;
    TASK_HEADING = /^###\s+📋\s+`([^`]+)`/;
    STATUS_TAG = /Status:\s*(TODO|READY|IN_PROGRESS|DONE|BLOCKED)/;
    STATUS_PRESENT = /Status:\s*([^\s|]+)/;
    EST_TAG = /Est:\s*\d+\s*m/i;
    WAIVED_RE = /^[ \t]*_waived:[ \t]*([^_\n]+)_[ \t]*$/m;
    DECISION_HEADING = /^###\s+Decision:/;
    CHK_ID_VALID = /^CHK-FR\d+-\d{2}$/;
    ALLOWED_METHODS = /* @__PURE__ */ new Set([
      "BDD scenario",
      "Unit test",
      "Manual review",
      "Integration test",
      "N/A"
    ]);
    ALLOWED_STATUSES = /* @__PURE__ */ new Set(["Draft", "In Progress", "Verified", "Blocked"]);
    RISK_HEADING = /^##\s+Risk Assessment\b/;
    ALLOWED_LEVELS = /* @__PURE__ */ new Set(["Low", "Medium", "High"]);
    PLACEHOLDER_MARKERS = /^\{.*\}$|^—$|^-$|^TBD$|^\?+$/;
    isDirectRunFormParsers = process.argv[1]?.endsWith("spec-form-parsers.ts") || process.argv[1]?.endsWith("spec-form-parsers.js");
    if (isDirectRunFormParsers) {
      const { output, exitCode } = runCheckCli(process.argv.slice(2));
      console.log(output);
      process.exit(exitCode);
    }
  }
});

// tools/spec-graph/parsers/tasks.ts
import fs7 from "node:fs";
import path5 from "node:path";
function headerOf(line) {
  if (!/^\s*-\s*\[[ xX~]\]/.test(line)) return null;
  const id = line.match(/\bid:\s*([\w.\-]+)/);
  const status = line.match(/\bStatus:\s*(TODO|READY|IN_PROGRESS|DONE|BLOCKED)\b/);
  if (!id || !status) return null;
  return { id: id[1], status: status[1] };
}
function parseTasks(content, file) {
  const lines = content.split(/\r?\n/);
  const out = [];
  let cur = null;
  let curPhase;
  const flush = () => {
    if (!cur) return;
    const body = cur.body.join("\n").trim();
    cur.node.doneWhen = body || void 0;
    const wm = body.match(WAIVED_RE);
    if (wm) cur.node.waived = wm[1].trim();
    const comment = body.match(/^\s*\*\*(?:Comment|Комментарий):\*\*\s*(.+?)\s*$/im);
    if (comment) cur.node.comment = comment[1].trim();
    const blocker = body.match(/^\s*\*\*(?:Blocker|Блокер):\*\*\s*(.+?)\s*$/im);
    if (blocker) cur.node.blocker = blocker[1].trim();
    const issueRefs = [...body.matchAll(/https?:\/\/github\.com\/[^\s/]+\/[^\s/]+\/issues\/(\d+)/gi)].map((match) => Number(match[1])).filter((issue, index, all) => Number.isInteger(issue) && all.indexOf(issue) === index);
    if (issueRefs.length > 0) cur.node.issueRefs = issueRefs;
    out.push(cur.node);
    cur = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ph = line.match(/^#{2,3}\s+(Phase\s.*?)\s*$/);
    if (ph) {
      curPhase = ph[1];
      flush();
      continue;
    }
    const h = headerOf(line);
    if (h) {
      flush();
      const title = line.match(/\[[ xX~]\]\s+(.*?)\s+—\s*id:/);
      cur = {
        node: {
          id: h.id,
          type: "Task",
          file,
          line: i + 1,
          status: STATUS_MAP[h.status] ?? "todo",
          refs: [],
          title: title ? title[1] : void 0,
          phase: curPhase
        },
        body: [line]
      };
      continue;
    }
    if (/^-\s*\[[ xX~]\]/.test(line) && /\bid:\s*[\w.\-]+/.test(line)) {
      flush();
      continue;
    }
    if (!cur) continue;
    if (/^#{1,6}\s/.test(line) || /^---\s*$/.test(line) || /^\s*<!--/.test(line)) {
      flush();
      continue;
    }
    cur.body.push(line);
    const noCode = line.replace(/`[^`]*`/g, "");
    for (const m of noCode.matchAll(/\b(?:FR|NFR)-\d+\b/g)) {
      if (!cur.node.refs.includes(m[0])) cur.node.refs.push(m[0]);
    }
  }
  flush();
  return out;
}
function parseTasksFile(abs, repoRoot) {
  const content = fs7.readFileSync(abs, "utf8");
  const file = path5.relative(repoRoot, abs).replace(/\\/g, "/");
  const slice = { nodes: parseTasks(content, file), edges: [] };
  qualifySlice(slice, specOf(file));
  return { nodes: slice.nodes, edges: [], anchors: [] };
}
var STATUS_MAP;
var init_tasks = __esm({
  "tools/spec-graph/parsers/tasks.ts"() {
    "use strict";
    init_coverage();
    init_spec_form_parsers();
    STATUS_MAP = {
      TODO: "todo",
      READY: "ready",
      IN_PROGRESS: "in-progress",
      DONE: "done",
      BLOCKED: "blocked"
    };
  }
});

// tools/spec-graph/parsers/file-changes.ts
import fs8 from "node:fs";
function isGlob(p) {
  return /[*?\[]/.test(p);
}
function cleanCell(cell) {
  const trimmed = cell.trim();
  if (trimmed.startsWith("`") && trimmed.endsWith("`") && trimmed.length >= 2) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}
function parseFileChanges(mdSource, opts = {}) {
  const rows = [];
  const lines = mdSource.split(/\r?\n/);
  let inTable = false;
  let pathIdx = -1;
  let actionIdx = -1;
  let reasonIdx = -1;
  const parseRow = (raw) => {
    let trimmed = raw.trim();
    if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
    if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
    return trimmed.split("|");
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const stripped = line.trim();
    if (!stripped.startsWith("|")) {
      inTable = false;
      pathIdx = actionIdx = reasonIdx = -1;
      continue;
    }
    const cells = parseRow(line);
    const isSeparator = cells.every((c) => /^\s*:?-+:?\s*$/.test(c));
    if (isSeparator) {
      if (pathIdx >= 0 && actionIdx >= 0 && reasonIdx >= 0) {
        inTable = true;
      }
      continue;
    }
    if (!inTable) {
      const headers = cells.map((c) => c.trim().toLowerCase());
      const pi = headers.indexOf("path");
      const ai = headers.indexOf("action");
      const ri = headers.indexOf("reason");
      if (pi >= 0 && ai >= 0 && ri >= 0) {
        pathIdx = pi;
        actionIdx = ai;
        reasonIdx = ri;
      } else {
        pathIdx = actionIdx = reasonIdx = -1;
      }
      continue;
    }
    if (cells.length <= Math.max(pathIdx, actionIdx, reasonIdx)) continue;
    const rawPath = cleanCell(cells[pathIdx]);
    const rawAction = cleanCell(cells[actionIdx]).toLowerCase();
    const rawReason = cells[reasonIdx];
    if (!rawPath) continue;
    if (isGlob(rawPath)) {
      if (opts.warnOnceState && !opts.warnOnceState.warned) {
        console.warn(
          `[spec-graph] FILE_CHANGES.md contains glob path(s); implements edges skipped (first: ${rawPath})`
        );
        opts.warnOnceState.warned = true;
      }
      continue;
    }
    if (!ALLOWED_ACTIONS.has(rawAction)) continue;
    const frMatches = rawReason.match(FR_CITATION_RE) ?? [];
    const seen = /* @__PURE__ */ new Set();
    const frs = [];
    for (const m of frMatches) {
      if (!seen.has(m)) {
        seen.add(m);
        frs.push(m);
      }
    }
    rows.push({ file_path: rawPath, action: rawAction, frs });
  }
  return rows;
}
function parseFileChangesFile(absPath, opts = {}) {
  let source;
  try {
    source = fs8.readFileSync(absPath, "utf-8");
  } catch {
    return [];
  }
  return parseFileChanges(source, opts);
}
var ALLOWED_ACTIONS, FR_CITATION_RE;
var init_file_changes = __esm({
  "tools/spec-graph/parsers/file-changes.ts"() {
    "use strict";
    ALLOWED_ACTIONS = /* @__PURE__ */ new Set([
      "create",
      "edit",
      "delete",
      "rename",
      "move",
      "replace"
    ]);
    FR_CITATION_RE = /\bFR-\d+\b/g;
  }
});

// tools/spec-graph/parsers/design.ts
import fs9 from "node:fs";
function looksLikePath(s) {
  if (!s || s.length > 256) return false;
  if (/\s/.test(s)) return false;
  if (/[<>|;&$()]/.test(s)) return false;
  if (!/[/.]/.test(s)) return false;
  if (/^https?:/.test(s)) return false;
  if (s.startsWith("#")) return false;
  return true;
}
function isGlob2(p) {
  return /[*?\[]/.test(p);
}
function parseDesign(mdSource, _relativePath) {
  const lines = mdSource.split(/\r?\n/);
  const scopes = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{1,6})\s+(.*?)\s*$/);
    if (headingMatch) {
      const headingText = headingMatch[2].replace(/[#*`]/g, "").trim();
      if (SECTION_HEADING_RE.test(headingText)) {
        const level = headingMatch[1].length;
        let end = lines.length;
        for (let j = i + 1; j < lines.length; j++) {
          const next = lines[j].match(/^(#{1,6})\s+/);
          if (next && next[1].length <= level) {
            end = j;
            break;
          }
        }
        scopes.push({ start: i, end });
        continue;
      }
    }
    const bulletMatch = line.match(BULLET_LABEL_RE);
    if (bulletMatch) {
      const label = bulletMatch[1].trim();
      if (SECTION_HEADING_RE.test(label + ":") || SECTION_HEADING_RE.test(label)) {
        scopes.push({ start: i, end: i + 1, bulletExtras: [bulletMatch[2]] });
      }
    }
  }
  if (scopes.length === 0) return [];
  const refsByPath = /* @__PURE__ */ new Map();
  for (const scope of scopes) {
    const slice = lines.slice(scope.start, scope.end).join("\n");
    const frsInScope = /* @__PURE__ */ new Set();
    for (const m of slice.match(FR_CITATION_RE2) ?? []) {
      frsInScope.add(m);
    }
    const harvest = (text) => {
      BACKTICK_PATH_RE.lastIndex = 0;
      let m;
      while ((m = BACKTICK_PATH_RE.exec(text)) !== null) {
        const candidate = m[1].trim();
        if (!looksLikePath(candidate)) continue;
        if (isGlob2(candidate)) continue;
        let set = refsByPath.get(candidate);
        if (!set) {
          set = /* @__PURE__ */ new Set();
          refsByPath.set(candidate, set);
        }
        for (const fr of frsInScope) set.add(fr);
      }
    };
    harvest(slice);
    if (scope.bulletExtras) {
      for (const extra of scope.bulletExtras) harvest(extra);
    }
  }
  const result = [];
  for (const [file_path, frSet] of refsByPath) {
    result.push({ file_path, frs: Array.from(frSet) });
  }
  return result;
}
function parseDesignFile(absPath, repoRoot) {
  let source;
  try {
    source = fs9.readFileSync(absPath, "utf-8");
  } catch {
    return [];
  }
  return parseDesign(source, repoRoot);
}
var SECTION_HEADING_RE, BULLET_LABEL_RE, BACKTICK_PATH_RE, FR_CITATION_RE2;
var init_design = __esm({
  "tools/spec-graph/parsers/design.ts"() {
    "use strict";
    SECTION_HEADING_RE = /^(?:где\s+лежит\s+реализаци[яи]|где\s+код|app[-\s]?код)\s*:?\s*$/i;
    BULLET_LABEL_RE = /^[-*+]\s+(?:\*\*)?([^:*]+?)(?:\*\*)?:\s*(.*)$/;
    BACKTICK_PATH_RE = /`([^`\n]+)`/g;
    FR_CITATION_RE2 = /\bFR-\d+\b/g;
  }
});

// tools/spec-graph/builder.ts
var builder_exports = {};
__export(builder_exports, {
  buildGraph: () => buildGraph,
  buildGraphFromCwd: () => buildGraphFromCwd,
  rebuildBacklinks: () => rebuildBacklinks,
  testedBySourceMap: () => testedBySourceMap,
  verifiesEdgesFor: () => verifiesEdgesFor
});
import fs10 from "node:fs";
import { execFileSync } from "node:child_process";
import path6 from "node:path";
import { createHash } from "node:crypto";
function walkDir(absDir, suffixes) {
  if (!fs10.existsSync(absDir)) return [];
  const out = [];
  const skipDirs = /* @__PURE__ */ new Set([
    "node_modules",
    ".git",
    "dist",
    ".dev-pomogator-tmp",
    ".stryker-tmp",
    "__pycache__",
    "archive"
    // FR-43c: `.specs/archive/` holds human-confirmed retired specs — out of the live graph
  ]);
  const stack = [absDir];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs10.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const abs = path6.join(current, entry.name);
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) continue;
        stack.push(abs);
      } else if (entry.isFile()) {
        if (suffixes.some((s) => entry.name.endsWith(s))) out.push(abs);
      }
    }
  }
  return out;
}
function buildGraph(opts) {
  const { repoRoot } = opts;
  let currentGitSha;
  try {
    currentGitSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8", timeout: 5e3 }).trim() || void 0;
  } catch {
    const isRuntimeCorpus = path6.resolve(repoRoot) === path6.resolve(process.cwd());
    currentGitSha = isRuntimeCorpus ? process.env.DEV_POMOGATOR_GIT_SHA || void 0 : void 0;
  }
  const mdRoots = (opts.mdRoots ?? [".specs"]).map((r) => path6.resolve(repoRoot, r));
  const featureRoots = (opts.featureRoots ?? [".specs", "tests/features"]).map(
    (r) => path6.resolve(repoRoot, r)
  );
  const ndjsonPath = path6.resolve(
    repoRoot,
    opts.ndjsonPath ?? ".dev-pomogator/.last-test-run.ndjson"
  );
  const scenarioOverlayPath = path6.resolve(
    repoRoot,
    opts.scenarioOverlayPath ?? ".dev-pomogator/.scenario-results.ndjson"
  );
  const nodes = /* @__PURE__ */ new Map();
  const edges = [];
  const definitions = /* @__PURE__ */ new Map();
  const backlinks = /* @__PURE__ */ new Map();
  const pushBacklink = (anchorId, entry) => {
    let list = backlinks.get(anchorId);
    if (!list) {
      list = [];
      backlinks.set(anchorId, list);
    }
    list.push(entry);
  };
  let totalRawNodes = 0;
  const rawCollisionList = [];
  const normalizationCollisionList = [];
  const identitiesByKey = /* @__PURE__ */ new Map();
  const mergeNode = (node) => {
    totalRawNodes++;
    const existing = nodes.get(node.id);
    if (existing) {
      rawCollisionList.push({ id: node.id, firstFile: existing.file, secondFile: node.file });
      return;
    }
    const normalizedKey = identityCollisionKey({ namespace: node.spec, localId: localIdOf(node.id) });
    const normalizedExisting = identitiesByKey.get(normalizedKey);
    const kind = normalizedExisting ? classifyIdentityCollision(normalizedExisting.id, node.id) : null;
    if (normalizedExisting && kind && kind !== "EXACT") {
      normalizationCollisionList.push({
        kind,
        normalizedKey,
        firstId: normalizedExisting.id,
        secondId: node.id,
        firstFile: normalizedExisting.file,
        secondFile: node.file
      });
    } else if (!normalizedExisting) {
      identitiesByKey.set(normalizedKey, node);
    }
    nodes.set(node.id, node);
  };
  const ingestSlice = (slice) => {
    for (const node of slice.nodes) mergeNode(node);
    for (const e of slice.edges) edges.push(e);
    for (const a of slice.anchors) {
      if (!definitions.has(a.alias)) definitions.set(a.alias, a.location);
    }
  };
  const mdFiles = mdRoots.flatMap((root) => walkDir(root, [".md"]));
  for (const abs of mdFiles) {
    let slice;
    try {
      slice = parseMarkdownFile(abs, repoRoot);
    } catch {
      continue;
    }
    ingestSlice(slice);
  }
  for (const abs of mdFiles) {
    if (path6.basename(abs) !== "TASKS.md") continue;
    let taskSlice;
    try {
      taskSlice = parseTasksFile(abs, repoRoot);
    } catch {
      continue;
    }
    for (const node of taskSlice.nodes) mergeNode(node);
  }
  const featureFiles = [...new Set(featureRoots.flatMap((root) => walkDir(root, [".feature"])))];
  for (const abs of featureFiles) {
    let slice;
    try {
      slice = parseGherkinFile(abs, repoRoot);
    } catch {
      continue;
    }
    ingestSlice(slice);
  }
  const specDirs = /* @__PURE__ */ new Set();
  for (const abs of mdFiles) {
    const base = path6.basename(abs);
    if (base === "FILE_CHANGES.md" || base === "DESIGN.md") {
      specDirs.add(path6.dirname(abs));
    }
  }
  const fileNodeIdByPath = /* @__PURE__ */ new Map();
  const implementsSeen = /* @__PURE__ */ new Set();
  const warnOnceState = { warned: false };
  const makeFileId = (filePath) => {
    const cached = fileNodeIdByPath.get(filePath);
    if (cached) return cached;
    const sha = createHash("sha256").update(filePath).digest("hex").slice(0, 12);
    const id = `FILE-${sha}`;
    fileNodeIdByPath.set(filePath, id);
    return id;
  };
  const ensureFileNode = (filePath, sourceFile, line) => {
    const id = makeFileId(filePath);
    if (!nodes.has(id)) {
      const node = {
        id,
        type: "File",
        file: sourceFile,
        line,
        path: filePath
      };
      nodes.set(id, node);
    }
    return id;
  };
  const ALLOWED_ACTIONS2 = /* @__PURE__ */ new Set([
    "create",
    "edit",
    "delete",
    "rename",
    "move",
    "replace"
  ]);
  const emitImplements = (fr, filePath, sourceSection, sourceFile, line, action) => {
    const key = `${fr}|${filePath}`;
    if (implementsSeen.has(key)) return;
    implementsSeen.add(key);
    const fileId = ensureFileNode(filePath, sourceFile, line);
    const edge = {
      from: fr,
      to: fileId,
      type: "implements",
      metadata: {
        file_path: filePath,
        source_section: sourceSection
      }
    };
    if (action && ALLOWED_ACTIONS2.has(action)) {
      edge.metadata.action = action;
    }
    edges.push(edge);
  };
  for (const specDir of specDirs) {
    const relDir = path6.relative(repoRoot, specDir).split(path6.sep).join("/");
    const slug = specOf(`${relDir}/FILE_CHANGES.md`);
    const qualifyFr = (fr) => slug ? `${slug}:${fr}` : fr;
    const fcAbs = path6.join(specDir, "FILE_CHANGES.md");
    if (fs10.existsSync(fcAbs)) {
      let rows = [];
      try {
        rows = parseFileChangesFile(fcAbs, { warnOnceState });
      } catch {
        rows = [];
      }
      const relFile = `${relDir}/FILE_CHANGES.md`;
      for (const row of rows) {
        if (row.frs.length === 0) continue;
        for (const fr of row.frs) {
          emitImplements(qualifyFr(fr), row.file_path, "FILE_CHANGES", relFile, 1, row.action);
        }
      }
    }
    const dAbs = path6.join(specDir, "DESIGN.md");
    if (fs10.existsSync(dAbs)) {
      let refs = [];
      try {
        refs = parseDesignFile(dAbs);
      } catch {
        refs = [];
      }
      const relFile = `${relDir}/DESIGN.md`;
      for (const ref of refs) {
        if (ref.frs.length === 0) continue;
        for (const fr of ref.frs) {
          emitImplements(qualifyFr(fr), ref.file_path, "DESIGN", relFile, 1);
        }
      }
    }
  }
  {
    const byLocalId = /* @__PURE__ */ new Map();
    for (const n of nodes.values()) {
      if (!n.spec) continue;
      const localId = localIdOf(n.id);
      byLocalId.set(localId, byLocalId.has(localId) ? null : n.id);
    }
    const resolveBare = (id) => {
      if (nodes.has(id)) return id;
      const unique = byLocalId.get(id);
      return unique ?? id;
    };
    for (const e of edges) {
      e.from = resolveBare(e.from);
      e.to = resolveBare(e.to);
    }
  }
  if (!opts.skipNdjson) {
    const patch = parseNdjsonFile(ndjsonPath);
    const overlay = parseScenarioOverlayFile(scenarioOverlayPath);
    const scenarioIter = [];
    for (const n of nodes.values()) {
      if (n.type === "Scenario") scenarioIter.push(n);
    }
    const applied = applyTestResults(scenarioIter, patch);
    const overlayApplied = applyScenarioOverlayResults(scenarioIter, overlay, { repoRoot, currentGitSha });
    if (applied > 0 || overlayApplied > 0) {
      for (const s of scenarioIter) {
        if (s.lastResult) {
          edges.push({ from: s.id, to: `RESULT-${s.id}-${s.lastResult}`, type: "last-result" });
        }
        if (s.trace?.traceId) {
          edges.push({ from: s.id, to: `TRACE-${s.trace.traceId}`, type: "runtime-trace" });
        }
      }
      edges.push(...verifiesEdgesFor(scenarioIter, testedBySourceMap(edges), (id) => nodes.get(id)?.type));
    }
  }
  for (const e of edges) {
    pushBacklink(e.from, { file: "", line: 0, type: e.type });
  }
  const graph = {
    version: 1,
    builtAt: (/* @__PURE__ */ new Date()).toISOString(),
    nodes,
    edges,
    definitions,
    backlinks,
    // File nodes (2b) and ndjson patches are EXCLUDED by construction —
    // mergeNode wraps only the parser-slice population, mirroring
    // collision-probe's rawCollisionScan scope.
    rawCollisions: {
      totalRawNodes,
      uniqueIds: totalRawNodes - rawCollisionList.length,
      collisions: rawCollisionList,
      normalizationCollisions: normalizationCollisionList
    },
    endpointViolations: []
  };
  refreshEndpointViolations(graph);
  return graph;
}
function rebuildBacklinks(graph) {
  graph.backlinks.clear();
  for (const e of graph.edges) {
    let list = graph.backlinks.get(e.from);
    if (!list) {
      list = [];
      graph.backlinks.set(e.from, list);
    }
    list.push({ file: "", line: 0, type: e.type });
  }
}
function testedBySourceMap(edges) {
  const byScenario = /* @__PURE__ */ new Map();
  for (const e of edges) {
    if (e.type !== "tested-by") continue;
    const list = byScenario.get(e.to) ?? [];
    list.push(e.from);
    byScenario.set(e.to, list);
  }
  return byScenario;
}
function verifiesEdgesFor(scenarios, testedBySources, nodeType) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const s of scenarios) {
    if (s.lastResult !== "PASSED") continue;
    const metadata = s.trace?.source || s.trace?.gitSha ? { producer: s.trace?.source, version: s.trace?.gitSha } : void 0;
    for (const reqId of testedBySources.get(s.id) ?? []) {
      const reqType = nodeType(reqId);
      if (reqType !== "FR" && reqType !== "NFR") continue;
      const key = `${s.id}\0${reqId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ from: s.id, to: reqId, type: "verifies", ...metadata ? { metadata } : {} });
    }
  }
  return out;
}
function buildGraphFromCwd(cwd = process.cwd(), opts = {}) {
  return buildGraph({ ...opts, repoRoot: cwd, skipNdjson: opts.skipNdjson ?? false });
}
var init_builder = __esm({
  "tools/spec-graph/builder.ts"() {
    "use strict";
    init_identity();
    init_md();
    init_gherkin();
    init_ndjson();
    init_scenario_overlay();
    init_tasks();
    init_file_changes();
    init_design();
    init_coverage();
    init_edge_schema();
  }
});

// tools/_shared/stdin.ts
async function readStdin() {
  let buf = "";
  for await (const chunk of process.stdin) buf += chunk.toString();
  return buf;
}
async function readStdinJson() {
  const raw = await readStdin();
  return raw.trim() ? JSON.parse(raw) : {};
}
async function readStdinJsonSafe() {
  try {
    return await readStdinJson();
  } catch {
    return {};
  }
}

// tools/spec-graph/test_quality_gate_stop.ts
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// tools/spec-graph/conformance.ts
init_coverage();

// tools/spec-graph/legs.ts
function buildLegIndices(graph) {
  const acCovers = /* @__PURE__ */ new Set();
  const designCovers = /* @__PURE__ */ new Set();
  const storyCovers = /* @__PURE__ */ new Set();
  const directlyTested = /* @__PURE__ */ new Set();
  for (const e of graph.edges) {
    if (e.type === "covers") {
      const toType = graph.nodes.get(e.to)?.type;
      if (toType === "Decision") designCovers.add(e.from);
      else if (toType === "Story") storyCovers.add(e.from);
      else acCovers.add(e.from);
    } else if (e.type === "tested-by") directlyTested.add(e.from);
  }
  return { acCovers, designCovers, storyCovers, directlyTested };
}
function frLegsOf(graph, frId, frsWithoutResearch) {
  const idx = buildLegIndices(graph);
  return {
    hasAc: idx.acCovers.has(frId),
    hasScenario: idx.directlyTested.has(frId),
    hasDesign: idx.designCovers.has(frId),
    hasStory: idx.storyCovers.has(frId),
    hasResearch: !(frsWithoutResearch?.has(frId) ?? false)
  };
}

// tools/spec-graph/task-lifecycle.ts
var WORKING_STATUSES = ["ready", "in-progress"];
function chainAssembledFor(graph, frId, frsWithoutResearch) {
  const legs = frLegsOf(graph, frId, frsWithoutResearch);
  const missing = [];
  if (!legs.hasAc) missing.push("AC");
  if (!legs.hasScenario) missing.push("scenario");
  if (!legs.hasDesign) missing.push("design");
  if (!legs.hasStory) missing.push("story");
  return { assembled: missing.length === 0, missing };
}
var SPEC_PHASE_MARKER = /\[spec-phase\]/i;
function isSpecAuthoringPhase(task) {
  return SPEC_PHASE_MARKER.test(task.doneWhen ?? "") || SPEC_PHASE_MARKER.test(task.phase ?? "");
}
function canEnterWorkingStatus(graph, task, frsWithoutResearch) {
  if (isSpecAuthoringPhase(task)) return { allowed: true, missing: [], specPhase: true };
  const missing = [];
  for (const fr of task.refs ?? []) {
    const r = chainAssembledFor(graph, fr, frsWithoutResearch);
    if (!r.assembled) missing.push(...r.missing.map((m) => `${fr}:${m}`));
  }
  return { allowed: missing.length === 0, missing, specPhase: false };
}

// tools/spec-graph/conformance.ts
init_identity();

// tools/spec-graph/delivery-demands.ts
function evidenceState(fr, demand, graph) {
  if (demand.state) return demand.state;
  if (demand.obligation === "not-applicable") return "NOT_APPLICABLE";
  const refs = demand.evidenceRefs ?? [];
  if (refs.length > 0) return refs.every((ref) => graph.nodes.has(ref) || graph.nodes.has(`${fr.spec}:${ref}`)) ? "PRESENT" : "MISSING";
  if (demand.type === "implementation") return graph.edges.some((edge) => edge.from === fr.id && edge.type === "implements") ? "PRESENT" : "MISSING";
  if (demand.type === "integration-test") {
    const scenarios = graph.edges.filter((edge) => edge.to === fr.id && edge.type === "tested-by").map((edge) => graph.nodes.get(edge.from));
    return scenarios.some((node) => node?.type === "Scenario" && node.lastResult === "PASSED" && node.resultStale !== true) ? "PRESENT" : "MISSING";
  }
  return "MISSING";
}
function satisfied(demand) {
  if (demand.obligation === "optional") return true;
  if (demand.state === "PRESENT") return true;
  if (demand.state === "NOT_APPLICABLE") return demand.obligation === "not-applicable" && Boolean(demand.rationale);
  return demand.state === "WAIVED" && Boolean(demand.rationale && demand.actor && demand.auditRef);
}
function evaluateDelivery(fr, graph) {
  const metadata = fr.metadata;
  if (!metadata) return { overall: "NOT_DECLARED", demands: [], missing: [], issues: [] };
  const inherited = forwardedDemands(graph).get(fr.id);
  const merged = new Map((inherited?.demands ?? []).map((demand) => [demand.type, demand]));
  for (const demand of metadata.demands) merged.set(demand.type, demand);
  const demands = [...merged.values()].map((demand) => ({ ...demand, state: evidenceState(fr, demand, graph) }));
  const required = demands.filter((demand) => demand.obligation !== "optional");
  const complete = required.length > 0 && required.every(satisfied);
  return {
    overall: complete ? "DELIVERED" : "INCOMPLETE",
    demands,
    missing: required.filter((demand) => !satisfied(demand)).map((demand) => demand.type),
    issues: [...fr.metadataIssues ?? [], ...inherited?.issues ?? []]
  };
}
var obligationRank = { "not-applicable": 0, optional: 1, required: 2 };
function forwardedDemands(graph) {
  const out = /* @__PURE__ */ new Map();
  const ensure = (id) => {
    const current = out.get(id);
    if (current) return current;
    const created = { demands: /* @__PURE__ */ new Map(), issues: [] };
    out.set(id, created);
    return created;
  };
  for (const node of graph.nodes.values()) {
    if (node.type !== "FR" || !node.metadata) continue;
    for (const demand of node.metadata.demands) for (const rawTarget of demand.forwardTo ?? []) {
      const target = graph.nodes.has(rawTarget) ? rawTarget : node.spec ? `${node.spec}:${rawTarget}` : rawTarget;
      const bucket = ensure(target);
      const existing = bucket.demands.get(demand.type);
      const targetNode = graph.nodes.get(target);
      const targetDemand = targetNode?.type === "FR" ? targetNode.metadata?.demands.find((item) => item.type === demand.type) : void 0;
      const candidates = [existing, targetDemand].filter((item) => Boolean(item));
      if (candidates.some((item) => item.obligation === "required") && [demand, ...candidates].some((item) => item.obligation === "not-applicable")) {
        bucket.issues.push({ code: "FR_DEMAND_CONFLICT", path: `${node.id}->${target}:${demand.type}`, message: `required and not-applicable conflict for ${demand.type}` });
      }
      const strongest = [demand, ...candidates].sort((a, b) => obligationRank[b.obligation] - obligationRank[a.obligation])[0];
      bucket.demands.set(demand.type, strongest);
    }
  }
  return new Map([...out].map(([id, value]) => [id, { demands: [...value.demands.values()], issues: value.issues }]));
}

// tools/spec-graph/conformance.ts
init_edge_schema();
var SPEC_TAG_RE = /^@((?:FR|NFR|AC)[A-Za-z0-9._-]+)$/;
function tagResolves(graph, scenSpec, ref, specLocalIds) {
  if (scenSpec && graph.nodes.has(`${scenSpec}:${ref}`)) return true;
  if (graph.nodes.has(ref)) return true;
  return !scenSpec && specLocalIds.has(ref);
}
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}
function topSimilarIds(target, ids, n) {
  return [...ids].map((id) => ({ id, d: levenshtein(target, id) })).sort((a, b) => a.d - b.d || a.id.localeCompare(b.id)).slice(0, n).map((x) => x.id);
}
function checkConformance(graph, opts = {}) {
  const findings = [];
  const tagOrphanSeverity = opts.orphanPolicy?.scenario_tag_orphan === "block" ? "error" : "warning";
  const specNodes = [...graph.nodes.values()].filter(
    (n) => n.type === "FR" || n.type === "NFR" || n.type === "AC"
  );
  const specLocalIds = new Set(specNodes.map((n) => localIdOf(n)));
  const acCovers = /* @__PURE__ */ new Set();
  const decisionCovers = /* @__PURE__ */ new Set();
  const storyCovers = /* @__PURE__ */ new Set();
  const scenarioTests = /* @__PURE__ */ new Set();
  const scenarioVerifies = /* @__PURE__ */ new Set();
  const scenarioVerifiesAc = /* @__PURE__ */ new Set();
  let resultsLoaded = false;
  for (const e of graph.edges) {
    if (e.type === "covers") {
      const toType = graph.nodes.get(e.to)?.type;
      if (toType === "Decision") decisionCovers.add(e.from);
      else if (toType === "Story") storyCovers.add(e.from);
      else acCovers.add(e.from);
    }
    if (e.type === "tested-by") scenarioTests.add(e.from);
    if (e.type === "verifies") {
      const source = graph.nodes.get(e.from);
      const currentPassing = source?.type === "Scenario" && source.lastResult === "PASSED" && source.resultStale !== true;
      if (currentPassing) {
        scenarioVerifies.add(e.to);
        if (graph.nodes.get(e.to)?.type === "AC") scenarioVerifiesAc.add(e.to);
      }
    }
    if (e.type === "last-result") resultsLoaded = true;
  }
  for (const node of graph.nodes.values()) {
    if (node.type !== "FR") continue;
    if (acCovers.has(node.id)) continue;
    if (scenarioTests.has(node.id)) continue;
    const bareTag = localIdOf(node);
    findings.push({
      code: "UNCOVERED_FR",
      severity: "warning",
      location: { file: node.file, line: node.line },
      message: `FR ${node.id} has no Acceptance Criteria and no @${bareTag}-tagged Scenario.`,
      nodeId: node.id,
      suggestions: [
        { action: "create_ac", reason: "Add an AC heading `## AC-N (FR-N)` covering this FR.", confidence: "high" },
        { action: "tag_scenario", reason: `Add @${bareTag} to an existing Scenario in any \`.feature\` file.`, confidence: "medium" }
      ]
    });
  }
  if (resultsLoaded) {
    for (const node of graph.nodes.values()) {
      if (node.type !== "FR" && node.type !== "NFR") continue;
      if (!scenarioTests.has(node.id)) continue;
      if (scenarioVerifies.has(node.id)) continue;
      const bareTag = localIdOf(node);
      findings.push({
        code: "UNVERIFIED_FR",
        severity: "warning",
        location: { file: node.file, line: node.line },
        message: `FR ${node.id} is tagged by a Scenario but no run produced a passing verifies edge (@${bareTag} tests exist but none is green).`,
        nodeId: node.id
      });
    }
  }
  if (opts.readinessOwnership) for (const node of graph.nodes.values()) {
    if (node.type === "AC") {
      const ownScenario = scenarioTests.has(node.id);
      if (!ownScenario) findings.push({
        code: "UNCOVERED_AC",
        severity: "error",
        location: { file: node.file, line: node.line },
        nodeId: node.id,
        message: `AC ${node.id} has no own tested-by Scenario; parent requirement evidence cannot complete the criterion.`,
        suggestions: [{ action: "tag_own_scenario", reason: "Add a behavior-specific @AC tag and tested-by edge for this criterion.", confidence: "high" }]
      });
      else if (!scenarioVerifiesAc.has(node.id)) findings.push({
        code: "UNVERIFIED_AC",
        severity: "error",
        location: { file: node.file, line: node.line },
        nodeId: node.id,
        message: `AC ${node.id} has own scenarios but no current passing verifies edge.`,
        suggestions: [{ action: "run_own_scenario", reason: "Run the owning scenario and retain a current passing verifies edge.", confidence: "high" }]
      });
    }
    if (node.type === "NFR") {
      const required = node.metadata?.demands.some((demand) => demand.obligation === "required") ?? false;
      if (!required) continue;
      const ownScenario = scenarioTests.has(node.id);
      if (!ownScenario) findings.push({
        code: "UNCOVERED_NFR",
        severity: "error",
        location: { file: node.file, line: node.line },
        nodeId: node.id,
        message: `Required NFR ${node.id} has no own tested-by Scenario.`,
        suggestions: [{ action: "tag_own_scenario", reason: "Add a method-appropriate scenario or evidence path for this required NFR.", confidence: "high" }]
      });
      else if (!scenarioVerifies.has(node.id)) findings.push({
        code: "UNVERIFIED_NFR",
        severity: "error",
        location: { file: node.file, line: node.line },
        nodeId: node.id,
        message: `Required NFR ${node.id} has scenarios but no current passing verifies edge.`,
        suggestions: [{ action: "verify_nfr", reason: "Produce current passing evidence using the declared verification method.", confidence: "high" }]
      });
    }
  }
  const inheritedDemands = forwardedDemands(graph);
  for (const node of graph.nodes.values()) {
    if (node.type !== "FR" && node.type !== "NFR") continue;
    for (const issue of node.metadataIssues ?? []) findings.push({
      code: issue.code,
      severity: "error",
      location: { file: node.file, line: node.line },
      nodeId: node.id,
      message: `${issue.path}: ${issue.message}`,
      suggestions: [{ action: "fix_requirement_metadata", reason: "Fix the FR-local ```yaml metadata block through the spec door.", confidence: "high" }]
    });
    if (node.type !== "FR" || !node.metadata || (node.metadataIssues?.length ?? 0) > 0) continue;
    const delivery = evaluateDelivery(node, graph);
    for (const issue of inheritedDemands.get(node.id)?.issues ?? []) findings.push({
      code: "FR_DEMAND_CONFLICT",
      severity: "error",
      location: { file: node.file, line: node.line },
      nodeId: node.id,
      message: issue.message,
      suggestions: [{ action: "resolve_demand_conflict", reason: "Resolve contradictory forwarded demand obligations.", confidence: "high" }]
    });
    for (const type of delivery.missing) findings.push({
      code: "FR_DEMAND_MISSING",
      severity: "error",
      location: { file: node.file, line: node.line },
      nodeId: node.id,
      message: `${node.id} requires ${type}, but its delivery evidence is missing or unjustified.`,
      suggestions: [{ action: "attach_delivery_evidence", reason: `Attach graph-verifiable evidence for ${type}, or record a justified/audited exception.`, confidence: "high" }]
    });
  }
  for (const node of graph.nodes.values()) {
    if (node.type !== "FR") continue;
    if (decisionCovers.has(node.id)) continue;
    findings.push({
      code: "FR_NO_DESIGN",
      severity: "warning",
      location: { file: node.file, line: node.line },
      message: `FR ${node.id} has no design Decision covering it \u2014 no \`### Decision:\` block declares \`**\u0422\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u0435:** [${localIdOf(node)}]\` (FR-47: the design leg of the trace web).`,
      nodeId: node.id,
      suggestions: [
        { action: "add_decision", reason: "Add a `### Decision:` block in DESIGN.md with a `**\u0422\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u0435:** [FR-N]` line, OR", confidence: "medium" },
        { action: "link_existing_decision", reason: "add the `**\u0422\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u0435:**` line to the existing decision that motivated this FR.", confidence: "medium" }
      ]
    });
  }
  for (const node of graph.nodes.values()) {
    if (node.type !== "FR") continue;
    if (storyCovers.has(node.id)) continue;
    findings.push({
      code: "FR_NO_STORY",
      severity: "warning",
      location: { file: node.file, line: node.line },
      message: `FR ${node.id} has no user Story covering it \u2014 no \`### User Story\` block declares \`**\u0422\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u0435:** [${localIdOf(node)}]\` (FR-47: the story leg of the trace web).`,
      nodeId: node.id,
      suggestions: [
        { action: "link_story", reason: "Add a `**\u0422\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u0435:** [FR-N]` line to the User Story that motivates this FR.", confidence: "medium" }
      ]
    });
  }
  for (const node of graph.nodes.values()) {
    if (node.type !== "Decision" && node.type !== "Story") continue;
    if (node.parentFr) continue;
    const isDecision = node.type === "Decision";
    findings.push({
      code: isDecision ? "TOOTHLESS_DECISION" : "TOOTHLESS_STORY",
      severity: "warning",
      location: { file: node.file, line: node.line },
      message: `${isDecision ? "Decision" : "User Story"} ${node.id} declares no \`**\u0422\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u0435:** [FR-N]\` line \u2014 it covers no requirement, so the ${isDecision ? "design" : "story"} leg dangles (FR-47d). The covers edge is built ONLY from that line.`,
      nodeId: node.id,
      suggestions: [
        {
          action: isDecision ? "link_decision_requirement" : "link_story_requirement",
          reason: "Add a `**\u0422\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u0435:** [FR-N]` line inside the block, pointing at the requirement it serves.",
          confidence: "high"
        }
      ]
    });
  }
  for (const node of graph.nodes.values()) {
    if (node.type !== "Task") continue;
    const task = node;
    if (!WORKING_STATUSES.includes(task.status)) continue;
    const gate = canEnterWorkingStatus(graph, task);
    if (gate.allowed) continue;
    findings.push({
      code: "TASK_STARTED_WITHOUT_CHAIN",
      severity: "warning",
      location: { file: task.file, line: task.line },
      message: `Task ${task.id} is ${task.status} but its requirement chain is not assembled \u2014 missing ${gate.missing.join(", ")}. Assemble the legs (or mark the task \`[spec-phase]\` if it authors them) before starting \u2014 run /task-status (FR-48b).`,
      nodeId: task.id,
      suggestions: [
        { action: "assemble_chain", reason: `Author the missing legs (${gate.missing.join(", ")}) for the requirement, OR`, confidence: "high" },
        { action: "mark_spec_phase", reason: "add a `[spec-phase]` marker if this task itself authors those legs (anti-deadlock exemption).", confidence: "medium" }
      ]
    });
  }
  for (const node of graph.nodes.values()) {
    if (node.type !== "Task") continue;
    const task = node;
    if (!task.waived || task.status !== "done") continue;
    findings.push({
      code: "TASK_WAIVED_CLOSED",
      severity: "error",
      location: { file: task.file, line: task.line },
      message: `Task ${task.id} is marked DONE but carries a _waived:_ marker ("${task.waived}") \u2014 a deliberately-waived task must not be closed (soft fake-DONE, FR-50c). Remove the _waived: marker in a deliberate edit to un-waive before closing.`,
      nodeId: task.id,
      suggestions: [
        { action: "keep_waived_open", reason: "A waived task is kept open on purpose \u2014 restore its prior Status and leave the _waived: marker in place.", confidence: "high" },
        { action: "unwaive_then_close", reason: "If the waiver no longer applies, remove the _waived: marker line first, THEN close \u2014 closing must be a deliberate un-waive.", confidence: "medium" }
      ]
    });
  }
  for (const node of graph.nodes.values()) {
    if (node.type !== "Task") continue;
    const task = node;
    for (const ref of task.refs) {
      if (graph.nodes.has(ref)) continue;
      findings.push({
        code: "ORPHAN_TASK",
        severity: "warning",
        location: { file: task.file, line: task.line },
        message: `Task ${task.id} references FR ${ref} which does not exist in any spec file.`,
        nodeId: task.id,
        relatedId: ref,
        suggestions: [
          { action: "create_fr", reason: `Create ## ${ref} heading in a FR.md file, OR`, confidence: "medium" },
          { action: "remove_ref", reason: `remove the stale reference from the task.`, confidence: "medium" }
        ]
      });
    }
  }
  for (const node of graph.nodes.values()) {
    if (node.type !== "Task") continue;
    const task = node;
    if (task.refs.length > 0) continue;
    if (/\bFR-\d+|SPECGEN\d+_\d+|@feature\d+/i.test(task.doneWhen ?? "")) continue;
    findings.push({
      code: "TASK_NO_REQUIREMENT",
      severity: "info",
      location: { file: task.file, line: task.line },
      message: `Task ${task.id} references NO requirement \u2014 empty refs and its Done-When names no FR-N / SPECGEN id / @feature tag. A task with no upstream requirement cannot be traced (reverse-traceability gap, FR-44/GT-3).`,
      nodeId: task.id,
      suggestions: [
        { action: "add_requirement_ref", reason: "Add a _Requirements: [FR-N](FR.md#fr-n)_ line, or reference a SPECGEN id / @feature tag in Done-When.", confidence: "high" }
      ]
    });
  }
  const scenarioLikes = [];
  const taskLikes = [];
  for (const node of graph.nodes.values()) {
    if (node.type === "Scenario") {
      const s = node;
      scenarioLikes.push({ id: s.id, tags: s.tags, result: s.lastResult, stale: s.resultStale, spec: specOf(s.file), source: s.trace?.source, canonicalResult: s.canonicalResult, canonicalRunAt: s.canonicalRunAt });
    } else if (node.type === "Task") {
      const t = node;
      taskLikes.push({ id: t.id, doneWhen: t.doneWhen ?? "", refs: t.refs, spec: specOf(t.file), status: t.status });
    }
  }
  const cov = taskLikes.length > 0 ? computeCoverage(taskLikes, scenarioLikes, opts.testQualityByTask) : null;
  const bucketById = /* @__PURE__ */ new Map();
  if (cov) {
    for (const b of Object.keys(cov.buckets)) for (const id of cov.buckets[b]) bucketById.set(id, b);
    for (const node of graph.nodes.values()) {
      if (node.type !== "Task") continue;
      const task = node;
      if (task.status !== "done") continue;
      const entry = cov.tasks[task.id];
      if (!entry) continue;
      if (entry.scenarios.length === 0) {
        findings.push({
          code: "UNVERIFIED_COMPLETION",
          severity: "error",
          location: { file: task.file, line: task.line },
          message: `Task ${task.id} is marked DONE but has ZERO linked scenarios \u2014 no test backs the claim.`,
          nodeId: task.id,
          relatedId: "NO_SCENARIO",
          suggestions: [
            { action: "write_test_or_downgrade", reason: "Add a linked BDD scenario or set Status back to IN_PROGRESS.", confidence: "high" }
          ]
        });
        findings.push({
          code: "TASK_UNTESTED",
          severity: "warning",
          location: { file: task.file, line: task.line },
          message: `Task ${task.id} is marked DONE but has ZERO linked scenarios \u2014 no test backs the claim (Done-When references no SPECGEN id / @feature tag, and refs map to no scenario).`,
          nodeId: task.id,
          suggestions: [
            { action: "write_test", reason: "Add a BDD scenario and reference its SPECGEN id (or @feature tag) in Done-When, so the DONE claim is backed by a real test.", confidence: "high" },
            { action: "downgrade", reason: "Or set Status back to IN_PROGRESS until a test exists \u2014 a DONE task with no test is unverifiable.", confidence: "high" }
          ]
        });
      } else if (entry.verified_status === "IN_PROGRESS") {
        const allGreen = entry.scenarios.length > 0 && entry.scenarios.every((id) => bucketById.get(id) === "passed");
        if (allGreen && (entry.test_quality === "WEAK" || entry.test_quality === "FAKE-POSITIVE-RISK")) {
          findings.push({
            code: "TASK_TEST_QUALITY",
            severity: "warning",
            location: { file: task.file, line: task.line },
            message: `Task ${task.id} is marked DONE and its scenarios are green, but the test body audits as ${entry.test_quality} \u2014 a passing-but-${entry.test_quality} test cannot verify DONE.`,
            nodeId: task.id,
            relatedId: entry.test_quality,
            suggestions: [
              { action: "strengthen_test", reason: "Strengthen the test (real assertions, no over-mocking) until strong-tests reports STRONG, or set Status back to IN_PROGRESS.", confidence: "high" }
            ]
          });
        } else {
          const offenders = entry.scenarios.filter((id) => bucketById.get(id) !== "passed");
          findings.push({
            code: "TASK_STATUS_UNVERIFIED",
            severity: "warning",
            location: { file: task.file, line: task.line },
            message: `Task ${task.id} is marked DONE but ${offenders.length}/${entry.scenarios.length} mapped scenarios are not green (e.g. ${offenders.slice(0, 3).map((id) => `${id}=${bucketById.get(id)}`).join(", ")}).`,
            nodeId: task.id,
            suggestions: [
              { action: "make_green_or_downgrade", reason: "Make the mapped scenarios pass, or set Status back to IN_PROGRESS \u2014 a DONE task must have every mapped scenario green.", confidence: "high" }
            ]
          });
        }
      }
    }
  }
  for (const node of graph.nodes.values()) {
    if (node.type !== "Task") continue;
    const task = node;
    if (task.status !== "done") continue;
    if (scenarioKey(task.doneWhen ?? "")) continue;
    const entry = cov?.tasks[task.id];
    const greenScenarioCount = entry?.scenarios.filter((id) => bucketById.get(id) === "passed").length ?? 0;
    if (greenScenarioCount > 0) continue;
    findings.push({
      code: "TASK_NO_OWN_SCENARIO",
      severity: "warning",
      location: { file: task.file, line: task.line },
      message: `Task ${task.id} is marked DONE but its Done-When cites no explicit scenario id of its OWN and no mapped covering scenario has passed; FR-wide refs alone are not proof for THIS task (FR-46a/FR-52 F7).`,
      nodeId: task.id,
      suggestions: [
        { action: "cite_own_scenario", reason: "Reference this task's own SPECGEN004_NN / TESTQUAL001_NN scenario in Done-When when it has a dedicated proof.", confidence: "high" },
        { action: "accept_consolidated_scenario", reason: "For migrated many\u2192few consolidation, map the task to at least one passing covering scenario via @feature/FR so the shared proof is explicit in the graph.", confidence: "medium" },
        { action: "downgrade", reason: "Or set Status back to IN_PROGRESS until a dedicated or consolidated covering scenario is green.", confidence: "high" }
      ]
    });
  }
  for (const node of graph.nodes.values()) {
    if (node.type !== "Scenario") continue;
    const scen = node;
    let hasSpecTag = false;
    const scenSpec = scen.spec ?? specOf(scen.file);
    for (const tag of scen.tags) {
      const f = tag.match(/^@feature(\d+)$/i);
      if (f && tagResolves(graph, scenSpec, `FR-${f[1]}`, specLocalIds)) {
        hasSpecTag = true;
        continue;
      }
      const m = tag.match(SPEC_TAG_RE);
      if (!m) continue;
      hasSpecTag = true;
      const referenced = m[1];
      if (!tagResolves(graph, scenSpec, referenced, specLocalIds)) {
        const similar = topSimilarIds(referenced, [...specLocalIds], 3);
        findings.push({
          code: "SCENARIO_TAG_ORPHAN",
          severity: tagOrphanSeverity,
          location: { file: scen.file, line: scen.line },
          message: `Scenario ${scen.id} carries tag @${referenced} but no FR/NFR/AC with that id exists.`,
          nodeId: scen.id,
          relatedId: referenced,
          suggestions: [
            {
              action: "rename_tag",
              reason: similar.length ? `Did you mean ${similar.map((s) => `@${s}`).join(" / ")}? (top-3 closest existing ids)` : `No similar spec id exists \u2014 verify the tag.`,
              confidence: "medium"
            },
            { action: "remove_tag", reason: `Strip the stale tag from the Scenario.`, confidence: "medium" }
          ]
        });
      }
    }
    if (!hasSpecTag && !scen.tags.some((tag) => tag.toLowerCase() === "@historical")) {
      findings.push({
        code: "UNTAGGED_SCENARIO",
        severity: "info",
        location: { file: scen.file, line: scen.line },
        message: `Scenario ${scen.id} has no @FR / @NFR / @AC tag \u2014 it tests nothing the spec claims to require.`,
        nodeId: scen.id,
        suggestions: [
          { action: "tag_scenario", reason: `Add the relevant @FR-N / @AC-N tag.`, confidence: "high" }
        ]
      });
    }
  }
  {
    const BULK_THRESHOLD = 10;
    const byFileTag = /* @__PURE__ */ new Map();
    for (const node of graph.nodes.values()) {
      if (node.type !== "Scenario") continue;
      const scen = node;
      for (const tag of scen.tags) {
        if (!SPEC_TAG_RE.test(tag)) continue;
        const key = `${scen.file}|${tag}`;
        const cur = byFileTag.get(key);
        if (cur) cur.count++;
        else byFileTag.set(key, { count: 1, file: scen.file, line: scen.line, tag });
      }
    }
    for (const { count, file, line, tag } of byFileTag.values()) {
      if (count < BULK_THRESHOLD) continue;
      findings.push({
        code: "TAG_BULK_SUSPECT",
        severity: "info",
        location: { file, line },
        message: `Tag ${tag} blankets ${count} scenarios in one file \u2014 verify the semantic fit per scenario (run the FR-8 judge); a blanket tag that clears UNTAGGED without testing the requirement is tag-gaming.`,
        nodeId: tag,
        suggestions: [
          { action: "run_semantic_judge", reason: `spec-verdict.ts with semantic ON will judge each ${tag}\u2194scenario pair.`, confidence: "high" },
          { action: "retag_per_scenario", reason: "Map each scenario to the requirement it actually tests.", confidence: "medium" }
        ]
      });
    }
  }
  for (const collision of graph.rawCollisions?.normalizationCollisions ?? []) {
    findings.push({
      code: "ID_NORMALIZATION_COLLISION",
      severity: "error",
      location: { file: collision.secondFile, line: 1 },
      nodeId: collision.secondId,
      relatedId: collision.firstId,
      message: `${collision.kind} identity collision: ${collision.firstId} (${collision.firstFile}) conflicts with ${collision.secondId} (${collision.secondFile}) after normalization key ${collision.normalizedKey}.`
    });
  }
  for (const violation of refreshEndpointViolations(graph)) {
    const source = graph.nodes.get(violation.edge.from);
    findings.push({
      code: "ENDPOINT_VIOLATION",
      severity: "error",
      location: { file: source.file, line: source.line },
      nodeId: violation.edge.from,
      relatedId: violation.edge.to,
      message: `${violation.edge.from} --${violation.edge.type}--> ${violation.edge.to} has endpoints ${violation.actualSource} -> ${violation.actualTarget}; allowed ${violation.allowedSources.join("|")} -> ${violation.allowedTargets.join("|")}.`
    });
  }
  return findings;
}

// tools/spec-graph/test-quality-gate.ts
import fs from "node:fs";
import path from "node:path";
function readVerdicts(repoRoot) {
  try {
    const raw = fs.readFileSync(path.join(repoRoot, ".dev-pomogator", ".test-quality.json"), "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
var BLOCKING_CODES = /* @__PURE__ */ new Set(["UNVERIFIED_COMPLETION", "TASK_TEST_QUALITY", "TASK_UNTESTED"]);
function escapeReason(text) {
  const m = text.match(/\[skip-test-quality:\s*([^\]]+)\]/i);
  return m ? m[1].trim() : null;
}
function escapeHonoured(reason) {
  return !!reason && reason.length >= 8;
}
function evaluateTestQualityGate(findings, opts = {}) {
  const blockers = findings.filter((f) => BLOCKING_CODES.has(f.code));
  if (blockers.length === 0) return { decision: "approve" };
  const reason = opts.escape ?? null;
  if (escapeHonoured(reason)) {
    return { decision: "approve", escapeUsed: reason.trim() };
  }
  return {
    decision: "block",
    reason: `${blockers.length} task(s) marked DONE without a strong test: ${blockers.map((b) => `${b.nodeId} (${b.code})`).join(", ")}. Strengthen the test until strong-tests reports STRONG (or write one), or escape with [skip-test-quality: <reason \u22658 chars>].`
  };
}
function logEscape(repoRoot, reason, sessionId) {
  const file = path.join(repoRoot, ".claude", "logs", "test-quality-escapes.jsonl");
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify({ reason, session_id: sessionId ?? null, cwd: repoRoot }) + "\n");
  } catch {
  }
  return file;
}

// tools/spec-graph/test_quality_gate_stop.ts
function approve() {
  process.exit(0);
}
function block(reason) {
  process.stdout.write(JSON.stringify({ decision: "block", reason }));
  process.exit(0);
}
function parseModifiedSpecSlugs(porcelain) {
  const slugs = /* @__PURE__ */ new Set();
  for (const line of porcelain.split("\n")) {
    if (line.startsWith("??")) continue;
    const m = line.match(/\.specs\/([^/]+)\//);
    if (m) slugs.add(m[1]);
  }
  return [...slugs];
}
function modifiedSpecSlugs(repoRoot) {
  const r = spawnSync("git", ["status", "--porcelain", "--", ".specs"], { cwd: repoRoot, encoding: "utf8" });
  if (r.status !== 0 || !r.stdout) return [];
  return parseModifiedSpecSlugs(r.stdout);
}
function escapeFromCommit(repoRoot) {
  const r = spawnSync("git", ["log", "-1", "--format=%B"], { cwd: repoRoot, encoding: "utf8" });
  return r.status === 0 && r.stdout ? escapeReason(r.stdout) : null;
}
async function main() {
  const mode = process.env.TEST_QUALITY_GATE_ENABLED ?? "true";
  if (mode === "false") return approve();
  const input = await readStdinJsonSafe();
  if (input.stop_hook_active === true) return approve();
  const repoRoot = process.env.CLAUDE_PROJECT_DIR || process.env.DEV_POMOGATOR_REPO_ROOT || process.cwd();
  const slugs = new Set(modifiedSpecSlugs(repoRoot));
  if (slugs.size === 0) return approve();
  let findings;
  try {
    const { buildGraphFromCwd: buildGraphFromCwd2 } = await Promise.resolve().then(() => (init_builder(), builder_exports));
    findings = checkConformance(buildGraphFromCwd2(repoRoot), { testQualityByTask: readVerdicts(repoRoot) });
  } catch (err) {
    process.stderr.write(`[test-quality-gate] graph deps unavailable \u2014 degraded to PASS/FAIL (fail-open): ${err instanceof Error ? err.message : String(err)}
`);
    return approve();
  }
  const scoped = findings.filter((f) => {
    const m = f.location.file.replace(/\\/g, "/").match(/\.specs\/([^/]+)\//);
    return m ? slugs.has(m[1]) : false;
  });
  const escape = process.env.TEST_QUALITY_GATE_SKIP === "1" ? "env TEST_QUALITY_GATE_SKIP=1" : escapeFromCommit(repoRoot);
  const decision = evaluateTestQualityGate(scoped, { escape });
  if (decision.decision === "approve") {
    if (decision.escapeUsed) logEscape(repoRoot, decision.escapeUsed, input.session_id);
    return approve();
  }
  if (mode === "shadow") {
    process.stderr.write(`[test-quality-gate] shadow: would block \u2014 ${decision.reason}
`);
    return approve();
  }
  block(decision.reason);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    process.stderr.write(`[test-quality-gate] soft-tier error: ${err instanceof Error ? err.message : String(err)}
`);
    process.exit(0);
  });
}
export {
  modifiedSpecSlugs,
  parseModifiedSpecSlugs
};
/*! Bundled license information:

reflect-metadata/Reflect.js:
  (*! *****************************************************************************
  Copyright (C) Microsoft. All rights reserved.
  Licensed under the Apache License, Version 2.0 (the "License"); you may not use
  this file except in compliance with the License. You may obtain a copy of the
  License at http://www.apache.org/licenses/LICENSE-2.0
  
  THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
  KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
  WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
  MERCHANTABLITY OR NON-INFRINGEMENT.
  
  See the Apache Version 2.0 License for specific language governing permissions
  and limitations under the License.
  ***************************************************************************** *)
*/
