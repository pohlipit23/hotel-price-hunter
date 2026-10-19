// Chromium for the browser checks: the newest local Windows Playwright build when one exists, otherwise
// undefined so Playwright uses its own installed browser (Linux CI).
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export function localChromium() {
  const cache = join(process.env.LOCALAPPDATA || join(homedir(), 'AppData/Local'), 'ms-playwright');
  if (!existsSync(cache)) return undefined;
  const builds = readdirSync(cache).filter(name => /^chromium-\d+$/.test(name)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  const path = builds.length ? join(cache, builds[0], 'chrome-win64/chrome.exe') : null;
  return path && existsSync(path) ? path : undefined;
}
