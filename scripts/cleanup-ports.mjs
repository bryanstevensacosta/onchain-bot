#!/usr/bin/env node
/**
 * Kills stale processes bound to the dev ports (3030 NestJS, 5173 Vite)
 * to prevent the EADDRINUSE race that `nest --watch` triggers on file
 * reloads. Only kills PIDs that are at least `minUptimeSec` old, so a
 * race with `concurrently` (which spawns the new server right after
 * this script finishes) doesn't accidentally take down the fresh
 * processes.
 *
 * Usage: node scripts/cleanup-ports.mjs [port ...]
 *        node scripts/cleanup-ports.mjs --force [port ...]
 *        node scripts/cleanup-ports.mjs -f 3030
 */
import { execSync } from 'node:child_process';

const args = process.argv.slice(2);
const FORCE_MODE = args.includes('--force') || args.includes('-f');
const MIN_UPTIME_SEC = FORCE_MODE ? 0 : 2;
const SAFE_NAMES = new Set(['node']);
const SAFE_CMD_FRAGMENTS = [
  'nest start',
  'vite',
  'apps/backend/dist/main',
  'apps/frontend',
  'node /Users/bryanstevens/dev/alpha-meta-token-scanner/node_modules/.bin/vite',
];
const PORTS = args.filter((a) => !a.startsWith('-')).map((p) => parseInt(p, 10)).filter(Boolean);
const DEFAULT_PORTS = [3030, 5173];
const targets = PORTS.length > 0 ? PORTS : DEFAULT_PORTS;

function listListeners(port) {
  try {
    const out = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, {
      encoding: 'utf8',
    });
    return out
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((pid) => parseInt(pid, 10));
  } catch {
    return [];
  }
}

function describe(pid) {
  try {
    const out = execSync(`ps -p ${pid} -o etime=,command=`, { encoding: 'utf8' }).trim();
    // etime format: [[DD-]HH:]MM:SS
    const [etime, ...cmdParts] = out.split(/\s+/);
    const command = cmdParts.join(' ');
    return { etime, command, uptimeSec: etimeToSeconds(etime) };
  } catch {
    return null;
  }
}

function etimeToSeconds(etime) {
  const parts = etime.split('-');
  let days = 0;
  let hms = etime;
  if (parts.length === 2) {
    days = parseInt(parts[0], 10) || 0;
    hms = parts[1];
  }
  const [h, m, s] = hms.split(':').map((p) => parseInt(p, 10) || 0);
  return days * 86400 + h * 3600 + m * 60 + s;
}

function shouldKill({ command, uptimeSec }) {
  if (uptimeSec < MIN_UPTIME_SEC) return false;
  const exe = command.split(/\s+/)[0]?.split('/').pop();
  if (!SAFE_NAMES.has(exe)) return false;
  // In force mode, kill ANY node process on the port.
  if (FORCE_MODE) return true;
  return SAFE_CMD_FRAGMENTS.some((frag) => command.includes(frag));
}

function killOne(pid) {
  try {
    process.kill(pid, 'SIGTERM');
    return true;
  } catch {
    return false;
  }
}

let killed = 0;
for (const port of targets) {
  const pids = listListeners(port);
  for (const pid of pids) {
    const info = describe(pid);
    if (!info || !shouldKill(info)) continue;
    if (killOne(pid)) {
      console.log(
        `[cleanup] SIGTERM PID ${pid} (port ${port}, up ${info.etime}): ${info.command.slice(0, 60)}`,
      );
      killed += 1;
    }
  }
}

// Wait for ports to be free. Poll every 200ms up to 10s total.
// Force-kill anything still holding the port mid-wait.
async function waitForFree() {
  const start = Date.now();
  while (Date.now() - start < 10_000) {
    let anyBusy = false;
    for (const port of targets) {
      const pids = listListeners(port);
      if (pids.length === 0) continue;
      anyBusy = true;
      // Force-kill stragglers.
      for (const pid of pids) {
        const info = describe(pid);
        if (!info || (FORCE_MODE ? !info.command : !shouldKill(info))) continue;
        try {
          process.kill(pid, 'SIGKILL');
          console.log(`[cleanup] SIGKILL PID ${pid} (port ${port}, stuck)`);
          killed += 1;
        } catch {
          /* gone */
        }
      }
    }
    if (!anyBusy) {
      if (killed > 0) console.log(`[cleanup] all ports free`);
      return;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  console.warn(`[cleanup] timed out waiting for ports to free`);
}

await waitForFree();
process.exit(0);