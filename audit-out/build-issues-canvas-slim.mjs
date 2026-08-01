import fs from "fs";

const out = JSON.parse(
  fs.readFileSync("audit-out/gh-issues-canvas-data.json", "utf8"),
);

const openSlim = [];
for (const [d, list] of Object.entries(out.openByDomain)) {
  for (const i of list) {
    const last = (i.comments || []).slice(-1)[0] || null;
    openSlim.push({
      n: i.number,
      title: i.title,
      domain: d,
      created: i.created,
      updated: i.updated,
      c: i.commentCount,
      last: last ? String(last).slice(0, 160) : null,
      url: i.url,
    });
  }
}
openSlim.sort(
  (a, b) => a.domain.localeCompare(b.domain) || b.updated.localeCompare(a.updated),
);

const commented = out.commented.map((i) => {
  const lc = (i.lastComments || []).slice(-1)[0];
  return {
    n: i.number,
    title: i.title,
    state: i.state,
    domain: i.domain,
    c: i.commentCount,
    updated: i.updated,
    last: lc
      ? `@${lc.author} ${lc.date}: ${(lc.preview || "").slice(0, 140)}`
      : null,
  };
});

const slim = {
  totals: out.totals,
  domainRows: out.domainRows,
  months: out.months,
  byMonthDomain: out.byMonthDomain,
  openSlim,
  commented,
};
fs.writeFileSync("audit-out/gh-issues-canvas-slim.json", JSON.stringify(slim));

const by = {};
for (const i of openSlim) (by[i.domain] ||= []).push(i);
for (const [d, list] of Object.entries(by).sort(
  (a, b) => b[1].length - a[1].length,
)) {
  console.log(`\n### ${d} (${list.length})`);
  for (const i of list) {
    console.log(`#${i.n} ${i.created} c=${i.c} | ${i.title.slice(0, 110)}`);
    if (i.last) console.log(`    ${i.last}`);
  }
}
console.log("\nTOP COMMENTED");
for (const i of commented.slice(0, 15)) {
  console.log(`#${i.n} [${i.state}] ${i.domain} c=${i.c} | ${i.title.slice(0, 90)}`);
  if (i.last) console.log(`    ${i.last}`);
}
