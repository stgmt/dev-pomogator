import { execSync } from "child_process";
import fs from "fs";

const raw = execSync(
  "gh issue list --limit 200 --state all --json number,title,state,createdAt,updatedAt,closedAt,labels,comments,url",
  { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 },
);
const issues = JSON.parse(raw);
fs.writeFileSync("audit-out/gh-issues-list.json", JSON.stringify(issues, null, 2), "utf8");

function classify(issue) {
  const t = issue.title || "";
  const labels = (issue.labels || []).map((l) => l.name || "").join(" ");
  const hay = `${t} ${labels}`;
  const rules = [
    ["headroom / proxy", /headroom|proxy.?up|sub2api|meridian|rate.?limit|supervised relaunch|bounded compression|ENABLE_TOOL_SEARCH|claude-context/i],
    ["context-mode", /context-mode|ctx_execute|ctx_search/i],
    ["spec-generator / specs", /spec[- ]?gen|spec-generator|\.specs|create-spec|spec-graph|spec-verdict|traceabilit|scaffold-spec|validate-spec|audit-spec|conformance|spec.?mcp|спек|форм|FR-|CHK-|ReqIF|planner задач/i],
    ["BDD / cucumber / tests", /bdd|cucumber|vitest|stryker|mutation|test.?quality|run-tests|docker-bdd|fake.?green|scenario|test-runner|testhost|trx\b|Reqnroll|Behave|JUnit|dotnet/i],
    ["hooks / gates", /hook|gate|pretooluse|posttooluse|stop.?judge|claim-evidence|escape.?hatch|guard|scopegate|score-diff|zombie-hunter|claim-sanity/i],
    ["plugin / install / migrate", /plugin|install|marketplace|migrate|v1.?to.?v2|uninstall|distribution|canonical|postinstall|winget/i],
    ["skills / rules", /skill|rule|suggest-rules|skills-rules|optimizer|self-improv|carl\b|rich-context|hyperv/i],
    ["doctor / diagnostics", /doctor|diagnos|pomogator-doctor/i],
    ["session-pilot / worktree / TUI", /session-pilot|tui|statusline|worktree|zellij|git-worktree|context-menu launcher/i],
    ["research / planning", /research|plan-pomogator|планир/i],
    ["MCP / providers / memory", /mcp|openrouter|claude-mem|provider|context7|octocode|memory|anchor-гейт/i],
    ["CI / docker / release", /\bci\b|release|github.?action|docker|devops|wsl-shim|docker-test/i],
    ["docs / onboarding", /onboard|docs|readme|glossary|documentation/i],
    ["pinator / pack", /pinator|npm.?pack|pack.?skill|пинатор/i],
    ["spec backlog (jul23)", /evidence-состояни|Fail-closed rollup|change-impact|инвариант|mutation|отпечат|тест-доказательств|source\/target|verifies\/covers/i],
  ];
  for (const [domain, re] of rules) {
    if (re.test(hay)) return domain;
  }
  if (/bug/i.test(labels)) return "misc / bug";
  if (/enhancement|feature/i.test(labels)) return "misc / enhancement";
  return "misc / other";
}

function authorOf(c) {
  if (!c) return "?";
  if (typeof c.author === "string") return c.author;
  return c.author?.login || c.user?.login || "?";
}

const reclass = issues.map((i) => {
  const comments = (i.comments || []).map((c) => ({
    author: authorOf(c),
    createdAt: (c.createdAt || "").slice(0, 10),
    preview: (c.body || "").replace(/\s+/g, " ").trim().slice(0, 180),
  }));
  return {
    number: i.number,
    title: i.title,
    state: i.state,
    created: (i.createdAt || "").slice(0, 10),
    updated: (i.updatedAt || "").slice(0, 10),
    closed: i.closedAt ? i.closedAt.slice(0, 10) : null,
    labels: (i.labels || []).map((l) => l.name),
    url: i.url,
    domain: classify(i),
    commentCount: comments.length,
    comments,
  };
});

const byDomain = {};
for (const i of reclass) {
  byDomain[i.domain] ||= { open: 0, closed: 0, total: 0, comments: 0 };
  byDomain[i.domain].total++;
  byDomain[i.domain][i.state === "OPEN" ? "open" : "closed"]++;
  byDomain[i.domain].comments += i.commentCount;
}

const byMonthDomain = {};
const months = {};
for (const i of reclass) {
  const m = i.created.slice(0, 7);
  byMonthDomain[m] ||= {};
  byMonthDomain[m][i.domain] = (byMonthDomain[m][i.domain] || 0) + 1;
  months[m] ||= { created: 0, openNow: 0, closedNow: 0 };
  months[m].created++;
  if (i.state === "OPEN") months[m].openNow++;
  else months[m].closedNow++;
}

const domainRows = Object.entries(byDomain)
  .map(([domain, s]) => ({
    domain,
    total: s.total,
    open: s.open,
    closed: s.closed,
    comments: s.comments,
    closeRate: s.total ? Math.round((100 * s.closed) / s.total) : 0,
  }))
  .sort((a, b) => b.total - a.total);

const openSlim = reclass
  .filter((i) => i.state === "OPEN")
  .map((i) => {
    const last = i.comments.slice(-1)[0];
    return {
      n: i.number,
      title: i.title,
      domain: i.domain,
      created: i.created,
      updated: i.updated,
      c: i.commentCount,
      last: last ? `@${last.author} ${last.createdAt}: ${last.preview}` : null,
      url: i.url,
    };
  })
  .sort(
    (a, b) =>
      a.domain.localeCompare(b.domain) || b.updated.localeCompare(a.updated),
  );

const commented = reclass
  .filter((i) => i.commentCount > 0)
  .sort(
    (a, b) =>
      b.commentCount - a.commentCount || b.updated.localeCompare(a.updated),
  )
  .slice(0, 20)
  .map((i) => {
    const lc = i.comments.slice(-1)[0];
    return {
      n: i.number,
      title: i.title,
      state: i.state,
      domain: i.domain,
      c: i.commentCount,
      updated: i.updated,
      last: lc
        ? `@${lc.author} ${lc.createdAt}: ${lc.preview.slice(0, 140)}`
        : null,
    };
  });

const slim = {
  totals: {
    total: reclass.length,
    open: reclass.filter((i) => i.state === "OPEN").length,
    closed: reclass.filter((i) => i.state === "CLOSED").length,
    withComments: reclass.filter((i) => i.commentCount > 0).length,
  },
  domainRows,
  months,
  byMonthDomain,
  openSlim,
  commented,
};

fs.writeFileSync(
  "audit-out/gh-issues-canvas-slim.json",
  JSON.stringify(slim, null, 2),
  "utf8",
);
fs.writeFileSync(
  "audit-out/gh-issues-reclass.json",
  JSON.stringify({ byDomain, byMonthDomain, issues: reclass }, null, 2),
  "utf8",
);

console.log(JSON.stringify(slim.totals));
console.log(
  domainRows
    .map(
      (r) =>
        `${r.domain}\t${r.total}\to=${r.open}\tc=${r.closed}\tcm=${r.comments}`,
    )
    .join("\n"),
);
console.log("sample title:", openSlim[0]?.title);
console.log("sample comment author ok:", commented[0]?.last?.slice(0, 80));
