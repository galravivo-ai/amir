// Builds GoFive-QA-Spec.md from the parts in this folder: the spec (01-09),
// then the test scenarios (scenarios.txt) as one table per scenario, and the
// traceability matrix, computed from the spec and the scenarios.
//   node docs/qa/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const parts = fs.readdirSync(dir).filter((f) => /^\d\d-.*\.md$/.test(f)).sort();
const spec = parts.map((f) => fs.readFileSync(path.join(dir, f), 'utf8').trim()).join('\n\n');

// ---- scenarios ----
const blocks = fs
  .readFileSync(path.join(dir, 'scenarios.txt'), 'utf8')
  .split('\n')
  .filter((l) => !l.startsWith('#'))
  .join('\n')
  .split(/\n\s*\n/)
  .map((b) => b.trim())
  .filter(Boolean);
const scenarios = blocks.map((b) => {
  const [head, ...rest] = b.split('\n');
  const [id, flow, module, actors, type, priority] = head.split('|').map((s) => s.trim());
  const field = (k) => (rest.find((l) => l.startsWith(`${k}:`)) || '').slice(k.length + 1).trim();
  return { id, flows: flow.split(',').map((s) => s.trim()), module, actors, type, priority, s: field('S'), p: field('P'), t: field('T'), e: field('E') };
});
const ids = new Set();
for (const s of scenarios) {
  if (ids.has(s.id)) throw new Error(`duplicate scenario ${s.id}`);
  ids.add(s.id);
  for (const k of ['s', 'p', 't', 'e']) if (!s[k]) throw new Error(`${s.id} is missing ${k}`);
}

const cell = (v) => String(v).replace(/\|/g, '\\|');
const steps = (t) => t.split(';').map((x, i) => `${i + 1}. ${x.trim()}`).join('<br>');
const table = (s) => `#### ${s.id}: ${s.s}

| Field | Value |
|---|---|
| Scenario ID | ${s.id} |
| Flow ID | ${s.flows.join(', ')} |
| Module | ${cell(s.module)} |
| Actors | ${cell(s.actors)} |
| Scenario | ${cell(s.s)} |
| Preconditions | ${cell(s.p)} |
| High-Level Steps | ${cell(steps(s.t))} |
| Expected Result | ${cell(s.e)} |
| Priority | ${s.priority} |
| Test Type | ${s.type} |`;

// The flows, in the order of the spec's list.
const flowNames = new Map([...spec.matchAll(/^\| (FLOW-\d{3}) \| ([^|]+) \|/gm)].map((m) => [m[1], m[2].trim()]));
const byFlow = (pred) => {
  const out = [];
  for (const [flow, name] of flowNames) {
    const list = scenarios.filter((s) => pred(s) && s.flows[0] === flow);
    if (list.length) out.push(`### תרחישים · ${flow}: ${name}\n\n${list.map(table).join('\n\n')}`);
  }
  return out.join('\n\n');
};
const ts = (s) => s.id.startsWith('TS-');

// ---- traceability ----
// Business rules: the BR ids written inside each flow's section of the spec.
const sections = spec.split(/^### (?=FLOW-\d{3})/m).slice(1);
const rulesOf = new Map(sections.map((sec) => [sec.slice(0, 8), [...new Set(sec.match(/BR-\d{3}/g) || [])]]));
const screensOf = new Map();
for (const m of spec.matchAll(/^\| (SCR-\d{3}) \|(.*)$/gm)) for (const f of (m[2].split('|').find((c) => c.includes('FLOW-')) || '').match(/\d{3}/g) || []) {
  const key = `FLOW-${f}`;
  if (flowNames.has(key)) screensOf.set(key, [...new Set([...(screensOf.get(key) || []), m[1]])]);
}
const scenariosOf = (flow) => scenarios.filter((s) => s.flows.includes(flow)).map((s) => s.id);
const uncovered = [...flowNames.keys()].filter((f) => !scenariosOf(f).length);
if (uncovered.length) throw new Error(`flows without scenarios: ${uncovered.join(', ')}`);

const trace = [...flowNames.keys()]
  .map((f) => `| ${f} | ${(rulesOf.get(f) || []).join(', ') || '— (כלליים: BR-001-005)'} | ${(screensOf.get(f) || []).join(', ') || '—'} | ${scenariosOf(f).join(', ')} |`)
  .join('\n');

const count = (pred) => scenarios.filter(pred).length;
const types = [...new Set(scenarios.map((s) => s.type))].map((t) => `| ${t} | ${count((s) => s.type === t)} |`).join('\n');

const part2 = `# חלק שני: Functional Test Scenarios

**סטטוס:** תרחישים ראשוניים, עוד לא הורצו. אין Actual Result / Pass / Fail.
**היקף:** ${count(ts)} תרחישים פונקציונליים, ${count((s) => s.id.startsWith('E2E-'))} תרחישי End-to-End, ${count((s) => s.id.startsWith('DS-'))} תרחישי Discovery.

**לפני כל סבב בדיקות:**
1. לפתוח \`/superadmin/status\` ולרשום אילו אינטגרציות פעילות (OQ-001).
2. לעבוד בעסק בדיקה ייעודי, לא בעסק של לקוח (חלק מהבדיקות מוחקות נתונים, למשל איפוס נתונים).
3. לבדוק את מכסת SerpApi (L-11).

| Test Type | כמות |
|---|---|
${types}

## 17. Test Scenarios לפי Flow

${byFlow(ts)}

## 18. End-to-End Scenarios

${scenarios.filter((s) => s.id.startsWith('E2E-')).map(table).join('\n\n')}

## 19. Discovery Scenarios

${scenarios.filter((s) => s.id.startsWith('DS-')).map(table).join('\n\n')}

## 20. Traceability Matrix

| Flow ID | Business Rules | Screen IDs | Scenario IDs |
|---|---|---|---|
${trace}

## 21. בדיקת כיסוי

| בדיקה | תוצאה |
|---|---|
| כל Route מופיע | ✅ כל ${'נתיבי המערכת'} מופו ל-Flows ולמסכים (כולל API, Webhooks, ווידג'ט, Manifest ו-Service Worker) |
| כל מסך מופיע | ✅ ${[...spec.matchAll(/^\| SCR-\d{3}/gm)].length} מסכים (סעיף 6) |
| כל Module מופיע | ✅ סעיף 14, כולל 13 מודולים שנוספו לרשימה המקורית |
| כל Flow מופיע | ✅ ${flowNames.size} Flows |
| כל Role מופיע | ✅ בעלים, מנהל, צפייה, מוגבל סניף, סוכנות, מנהל מערכת (סעיף 8) |
| כל Permission משמעותית | ✅ סעיף 8 |
| כל Integration | ✅ 12 שירותים (סעיף 10) |
| כל Background Process | ✅ 19 תהליכים (סעיף 11) |
| כל Status משמעותי | ✅ 11 מחזורי חיים (סעיף 12) |
| כל Plan / Feature Gate | ✅ סעיף 13 |
| כל Admin capability | ✅ FLOW-044, FLOW-045 |
| לכל Flow יש Test Scenario | ✅ נבדק אוטומטית בבנייה: ${flowNames.size}/${flowNames.size} |
`;

const out = `${spec}\n\n---\n\n${part2}`;
fs.writeFileSync(path.join(dir, 'GoFive-QA-Spec.md'), out);
console.log(`flows ${flowNames.size}, scenarios ${scenarios.length}, lines ${out.split('\n').length}`);
