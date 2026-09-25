/**
 * Runs every probe in ci/findings.probes.mjs and reports, per finding:
 *   still-broken   -- every expected error is present
 *   possibly-fixed -- the build succeeded, or an expected error is gone
 *   probe-error    -- timeout, crash, or a failure unrelated to the finding
 *
 * Informational only: always exits 0 and never touches FINDINGS.md.
 * Writes autorecorder/videos/PROBES.json and PROBES.md (next to RUN_REPORT,
 * so CI uploads them), and appends the markdown to $GITHUB_STEP_SUMMARY.
 *
 *   node ci/run-probes.mjs [--no-summary] [--only=1,2]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { FRONTEND_DIR, VIDEOS_DIR } from './lib/config.mjs';
import { PROBES } from './findings.probes.mjs';

const PACKAGES = [
  '@copilotkit/angular',
  '@copilotkit/core',
  '@copilotkit/a2ui-renderer',
  'typescript',
  '@angular/core',
];

export function installedVersions(dir = FRONTEND_DIR) {
  const out = {};
  for (const name of PACKAGES) {
    try {
      const f = path.join(dir, 'node_modules', ...name.split('/'), 'package.json');
      out[name] = JSON.parse(fs.readFileSync(f, 'utf8')).version;
    } catch {
      out[name] = 'not installed';
    }
  }
  return out;
}

const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
const tail = (s, n = 15) => s.trimEnd().split(/\r?\n/).slice(-n).join('\n');

function run(command, cwd, timeoutMs) {
  return new Promise((resolve) => {
    // Build into a scratch dir so a successful probe never overwrites dist/.
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-'));
    const child = spawn(`${command} --output-path "${outDir}"`, {
      cwd,
      shell: true,
      env: { ...process.env, NG_CLI_ANALYTICS: 'false', FORCE_COLOR: '0' },
    });
    let output = '';
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
      else child.kill('SIGKILL');
    }, timeoutMs);
    let settled = false;
    const done = (code, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fs.rmSync(outDir, { recursive: true, force: true });
      resolve({ code, output: stripAnsi(output), timedOut, error });
    };
    child.on('error', (e) => done(null, e.message));
    child.on('close', (code) => done(code));
  });
}

export function classify(probe, { code, output, timedOut, error }) {
  if (timedOut) return { status: 'probe-error', reason: `timed out after ${probe.timeoutMs} ms` };
  if (error) return { status: 'probe-error', reason: `could not start: ${error}` };
  if (code === 0) {
    return { status: 'possibly-fixed', reason: `build succeeded; ${probe.code} no longer reported` };
  }
  const missing = probe.expect.filter((re) => !re.test(output)).map(String);
  if (missing.length === 0) return { status: 'still-broken', reason: `${probe.code} still reported` };
  // Failed, but not with the finding's evidence. Only call that "fixed" when
  // it is still a compile failure; anything else is the probe's own problem.
  if (/error TS\d+/.test(output) || /\[ERROR\]/.test(output)) {
    return {
      status: 'possibly-fixed',
      reason: `${probe.code} no longer reported (missing ${missing.join(', ')}); build fails for another reason`,
    };
  }
  return { status: 'probe-error', reason: `build exited ${code} without compiler errors` };
}

function evidence(probe, output) {
  const lines = output.split(/\r?\n/);
  const hits = probe.expect.map((re) => lines.find((l) => re.test(l))?.trim()).filter(Boolean);
  return [...new Set(hits)];
}

export async function runProbes({ only } = {}) {
  const versions = installedVersions();
  const results = [];
  for (const probe of Object.values(PROBES)) {
    if (only && !only.includes(String(probe.id))) continue;
    console.log(`▶ [Probe #${probe.id}] ${probe.command}`);
    const started = Date.now();
    const res = await run(probe.command, probe.cwd, probe.timeoutMs);
    const { status, reason } = classify(probe, res);
    results.push({
      id: probe.id,
      title: probe.title,
      page: probe.page,
      command: probe.command,
      status,
      reason,
      exitCode: res.code,
      durationSec: Math.round((Date.now() - started) / 100) / 10,
      evidence: evidence(probe, res.output),
      ...(status === 'still-broken' ? {} : { lastLines: tail(res.output) }),
    });
    console.log(`  ${status}: ${reason}`);
  }
  return { timestamp: new Date().toISOString(), versions, results };
}

const ICON = {
  'still-broken': '🔴 still-broken',
  'possibly-fixed': '🟢 **possibly-fixed**',
  'probe-error': '⚠️ probe-error',
};

export function probesMarkdown(report, heading = '## 🧪 Finding probes') {
  const v = report.versions;
  const lines = [heading, ''];
  for (const r of report.results.filter((x) => x.status === 'possibly-fixed')) {
    lines.push(
      `> [!WARNING]\n> **#${r.id} possibly fixed** — ${r.reason} (@copilotkit/angular ${v['@copilotkit/angular']}).` +
        ' Re-check by hand before removing it from FINDINGS.md.',
      '',
    );
  }
  lines.push('| # | Finding | Status | Evidence |', '|---|---|---|---|');
  for (const r of report.results) {
    const detail = (r.evidence.length ? r.evidence.map((e) => `\`${e}\``).join('<br>') : r.reason).replace(/\|/g, '\\|');
    lines.push(`| ${r.id} | ${r.title} | ${ICON[r.status]} | ${detail} |`);
  }
  lines.push('', 'Versions: ' + Object.entries(v).map(([k, x]) => `\`${k}@${x}\``).join(', '));
  for (const r of report.results.filter((x) => x.lastLines)) {
    lines.push('', `<details><summary>#${r.id} last output lines</summary>\n\n\`\`\`\n${r.lastLines}\n\`\`\`\n</details>`);
  }
  return lines.join('\n') + '\n';
}

export function writeProbeReport(report, { summary = true } = {}) {
  fs.mkdirSync(VIDEOS_DIR, { recursive: true });
  const md = probesMarkdown(report);
  fs.writeFileSync(path.join(VIDEOS_DIR, 'PROBES.json'), JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(path.join(VIDEOS_DIR, 'PROBES.md'), md, 'utf8');
  if (summary && process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  return md;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  try {
    const report = await runProbes({ only: onlyArg?.slice('--only='.length).split(',') });
    console.log('\n' + writeProbeReport(report, { summary: !process.argv.includes('--no-summary') }));
  } catch (err) {
    console.error('Probe runner failed:', err?.message || err);
  }
  process.exit(0);
}
