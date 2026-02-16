#!/usr/bin/env node
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Get git commit info
let commit = 'unknown';
let commitShort = 'unknown';
try {
  // Try to get from environment (GitHub Actions) first
  commit = process.env.GITHUB_SHA || execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  commitShort = commit.slice(0, 7);
} catch (error) {
  console.warn('Warning: Could not determine git commit, using "unknown"');
}

// Get build date
const buildDate = new Date().toISOString();

// Generate version.ts
const versionFileContent = `// Auto-generated during build - DO NOT EDIT
export const BUILD_INFO = {
  commit: "${commit}",
  commitShort: "${commitShort}",
  buildDate: "${buildDate}",
} as const;
`;

const versionFilePath = join(__dirname, '../src/version.ts');
writeFileSync(versionFilePath, versionFileContent, 'utf-8');

console.log(`✓ Generated version.ts: ${commitShort} at ${buildDate}`);
