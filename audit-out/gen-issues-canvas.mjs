import fs from "fs";

const slim = JSON.parse(
  fs.readFileSync("audit-out/gh-issues-canvas-slim.json", "utf8"),
);
const payload = JSON.parse(
  fs.readFileSync("audit-out/canvas-payload.json", "utf8"),
);

const DATA = {
  totals: slim.totals,
  domainRows: slim.domainRows,
  months: payload.months,
  monthCreated: payload.monthCreated,
  monthOpen: payload.monthOpen,
  monthClosed: payload.monthClosed,
  openSlimAll: slim.openSlim.map((i) => ({
    n: i.n,
    title: i.title.length > 110 ? i.title.slice(0, 107) + "..." : i.title,
    domain: i.domain,
    created: i.created,
    updated: i.updated,
    c: i.c,
    last: i.last ? i.last.slice(0, 130) : null,
    url: i.url,
  })),
  commented: slim.commented.map((i) => ({
    n: i.n,
    title: i.title.length > 90 ? i.title.slice(0, 87) + "..." : i.title,
    state: i.state,
    domain: i.domain,
    c: i.c,
    last: i.last ? i.last.slice(0, 120) : null,
  })),
};

const src = `import {
  BarChart,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Grid,
  H1,
  H2,
  H3,
  Link,
  Pill,
  Row,
  Select,
  Stack,
  Stat,
  Table,
  Text,
  useCanvasState,
  useHostTheme,
} from "cursor/canvas";

const DATA = ${JSON.stringify(DATA)} as const;

type DomainFilter = string;

export default function GitHubIssuesByDomain() {
  const theme = useHostTheme();
  const [domain, setDomain] = useCanvasState<DomainFilter>("domain", "all");

  const domainOptions = [
    { value: "all", label: \`Все открытые (\${DATA.totals.open})\` },
    ...DATA.domainRows
      .filter((d) => d.open > 0)
      .map((d) => ({
        value: d.domain,
        label: \`\${d.domain} (\${d.open})\`,
      })),
  ];

  const openIssues =
    domain === "all"
      ? [...DATA.openSlimAll]
      : DATA.openSlimAll.filter((i) => i.domain === domain);

  const domainTableRows = DATA.domainRows.map((d) => [
    d.domain,
    String(d.total),
    String(d.open),
    String(d.closed),
    String(d.comments),
    \`\${d.closeRate}%\`,
  ]);

  const openTableRows = openIssues.map((i) => [
    <Link key={"l" + i.n} href={i.url}>
      #{"{"}i.n{"}"}
    </Link>,
    i.domain,
    i.created,
    i.updated,
    String(i.c),
    i.title,
    i.last ?? "—",
  ]);

  const commentRows = DATA.commented.map((i) => [
    "#" + i.n,
    i.state === "OPEN" ? (
      <Pill key={"o" + i.n} tone="warning" size="sm">
        OPEN
      </Pill>
    ) : (
      <Pill key={"c" + i.n} tone="success" size="sm">
        CLOSED
      </Pill>
    ),
    i.domain,
    String(i.c),
    i.title,
    i.last ?? "—",
  ]);

  return (
    <Stack gap={24} style={{ padding: 24 }}>
      <Stack gap={8}>
        <H1>GitHub issues — домены и даты</H1>
        <Text tone="secondary" size="small">
          stgmt/dev-pomogator · все issues · снимок 2026-07-31 · классификация по
          title/labels (эвристика)
        </Text>
      </Stack>

      <Grid columns={4} gap={12}>
        <Stat value={String(DATA.totals.total)} label="Всего issues" />
        <Stat value={String(DATA.totals.open)} label="Open" tone="warning" />
        <Stat value={String(DATA.totals.closed)} label="Closed" tone="success" />
        <Stat
          value={String(DATA.totals.withComments)}
          label="С комментариями"
          tone="info"
        />
      </Grid>

      <Callout tone="info" title="Что бросается в глаза">
        Июль дал 79 новых issues (50 ещё open). Крупнейший домен — hooks/gates
        (31, 16 open). Больше всего обсуждения — headroom/proxy (34 комментария
        на 8 issues). 23 июля выгружен крупный backlog вокруг spec-generator
        (#162 + соседние FR). Plugin/install закрыт на 100%.
      </Callout>

      <Grid columns={2} gap={16}>
        <Card>
          <CardHeader>Issues по домену (open vs closed)</CardHeader>
          <CardBody>
            <BarChart
              categories={DATA.domainRows.map((d) =>
                d.domain.replace(" / ", "/").slice(0, 22),
              )}
              series={[
                {
                  name: "Open",
                  data: DATA.domainRows.map((d) => d.open),
                  tone: "warning",
                },
                {
                  name: "Closed",
                  data: DATA.domainRows.map((d) => d.closed),
                  tone: "success",
                },
              ]}
              height={340}
              horizontal
            />
            <Text tone="secondary" size="small">
              Source: gh issue list · all states · 2026-05 → 2026-07
            </Text>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>Создано по месяцам</CardHeader>
          <CardBody>
            <BarChart
              categories={[...DATA.months]}
              series={[
                { name: "Created", data: [...DATA.monthCreated], tone: "info" },
                {
                  name: "Still open",
                  data: [...DATA.monthOpen],
                  tone: "warning",
                },
                {
                  name: "Now closed",
                  data: [...DATA.monthClosed],
                  tone: "success",
                },
              ]}
              height={280}
            />
            <Text tone="secondary" size="small">
              Created = месяц создания; Still open / Now closed = текущий state
            </Text>
          </CardBody>
        </Card>
      </Grid>

      <Card>
        <CardHeader>Сводка по доменам</CardHeader>
        <CardBody style={{ padding: 0 }}>
          <Table
            headers={[
              "Домен",
              "Всего",
              "Open",
              "Closed",
              "Комменты",
              "Close %",
            ]}
            columnAlign={["left", "right", "right", "right", "right", "right"]}
            rows={domainTableRows}
          />
        </CardBody>
      </Card>

      <Divider />

      <Stack gap={12}>
        <Row gap={12} align="center" justify="space-between">
          <H2>Открытые issues</H2>
          <Select
            value={domain}
            onChange={(v) => setDomain(v)}
            options={domainOptions}
          />
        </Row>
        <Text tone="secondary" size="small">
          Показано {openIssues.length} из {DATA.totals.open} open · «Последний
          коммент» — preview последнего comment
        </Text>
        <Table
          headers={[
            "#",
            "Домен",
            "Created",
            "Updated",
            "C",
            "Title",
            "Последний коммент",
          ]}
          rows={openTableRows}
          rowTone={openIssues.map((i) =>
            i.c > 0 ? ("info" as const) : ("neutral" as const),
          )}
        />
      </Stack>

      <Divider />

      <Stack gap={12}>
        <H2>Топ по комментариям</H2>
        <Text tone="secondary" size="small">
          55 issues имеют хотя бы 1 comment; ниже топ-20
        </Text>
        <Table
          headers={["#", "State", "Домен", "C", "Title", "Последний коммент"]}
          rows={commentRows}
        />
      </Stack>

      <Stack gap={8}>
        <H3>Кластеры по датам</H3>
        <Text>
          <Text weight="semibold">2026-06</Text> — фундамент gates/hooks +
          test-runner/docker (39 issues, 25 уже closed).
        </Text>
        <Text>
          <Text weight="semibold">2026-07-03…21</Text> — headroom/context-mode
          umbrella (#84 → #139), CARL, claude-mem.
        </Text>
        <Text>
          <Text weight="semibold">2026-07-22…23</Text> — массовый
          spec-generator backlog (#153–#183, #162 closure program).
        </Text>
        <Text>
          <Text weight="semibold">2026-07-25…29</Text> — CARL cwd bugs,
          workflow orchestrator (#212) + PreToolUse enforcement (#215),
          context-mode orphan scan (#209).
        </Text>
      </Stack>

      <Text
        tone="secondary"
        size="small"
        style={{ color: theme.tokens.text.tertiary }}
      >
        Эвристика доменов по title/labels; «misc» и «spec backlog (jul23)» —
        остаток после keyword-match. Не GitHub Projects labels.
      </Text>
    </Stack>
  );
}
`;

// Fix the broken #{i.n} interpolation in the template above
const fixed = src.replace(
  `#{"{"}i.n{"}"}`,
  `#{i.n}`,
);

const out =
  "C:/Users/stigm/.cursor/projects/e-repos-dev-pomogator/canvases/github-issues-by-domain.canvas.tsx";
fs.writeFileSync(out, fixed, "utf8");
console.log("wrote", out, "bytes", fs.statSync(out).size);
