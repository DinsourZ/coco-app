#!/usr/bin/env node
/**
 * Deterministic pre-publish & CI security scanner for CoCo App.
 *
 * Checks:
 * 1. Forbidden file names/extensions (.env, private keys, certificates, DBs, logs, backups).
 * 2. High-signal secret patterns (API keys, GitHub tokens, PEM private keys, hardcoded auth tokens).
 * 3. Private network endpoints (RFC1918 LAN IPs, Tailscale domains, hardcoded internal hosts).
 * 4. Dependency license allowlist verification for installed direct dependencies.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', '.expo', 'coverage']);

const FORBIDDEN_FILENAMES = [
  /^\.env(\..+)?$/i, // .env.example is explicitly allowed below
  /\.(pem|key|p12|p8|jks|mobileprovision|sqlite|sqlite3|db|bak|log)$/i,
  /\.tar(\.gz)?$/i,
];

const SECRET_AND_PRIVATE_PATTERNS = [
  { name: 'PEM Private Key', regex: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/ },
  { name: 'GitHub PAT / OAuth Token', regex: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/ },
  { name: 'OpenAI / Provider Secret Key', regex: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'AWS Access Key ID', regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Tailscale Private Hostname', regex: /\.[a-z0-9-]+\.ts\.net\b/i },
  {
    name: 'RFC1918 Private IPv4 Address',
    regex: /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/,
  },
  { name: 'Absolute Local Home Path', regex: /\/home\/[a-z0-9._-]+\//i },
];

const ALLOWED_DIRECT_LICENSES = new Set([
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  '0BSD',
]);

const findings = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(ROOT, fullPath);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(fullPath);
      continue;
    }

    if (entry.name !== '.env.example') {
      for (const pattern of FORBIDDEN_FILENAMES) {
        if (pattern.test(entry.name)) {
          findings.push(`FORBIDDEN FILE: ${relPath}`);
        }
      }
    }

    // Skip binary assets from text regex scanning
    if (/\.(png|jpg|jpeg|webp|ico|woff2?|ttf)$/i.test(entry.name)) continue;

    // Skip this scanner's own pattern definitions line check
    if (relPath === 'scripts/secret_scan.mjs') continue;

    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split(/\r?\n/);
    lines.forEach((line, idx) => {
      for (const rule of SECRET_AND_PRIVATE_PATTERNS) {
        if (rule.regex.test(line)) {
          findings.push(`${rule.name}: ${relPath}:${idx + 1}`);
        }
      }
    });
  }
}

function checkDirectDependencyLicenses() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const deps = {
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {}),
  };
  for (const depName of Object.keys(deps)) {
    const depPkgPath = path.join(ROOT, 'node_modules', depName, 'package.json');
    if (!fs.existsSync(depPkgPath)) {
      findings.push(`MISSING INSTALLED DEP FOR LICENSE CHECK: ${depName}`);
      continue;
    }
    const depPkg = JSON.parse(fs.readFileSync(depPkgPath, 'utf8'));
    const license = typeof depPkg.license === 'string' ? depPkg.license : 'UNKNOWN';
    if (!ALLOWED_DIRECT_LICENSES.has(license)) {
      findings.push(`DISALLOWED DIRECT LICENSE (${license}): ${depName}`);
    }
  }
}

walk(ROOT);
checkDirectDependencyLicenses();

if (findings.length > 0) {
  console.error('SECURITY / LICENSE SCAN FAILED:');
  for (const item of findings) {
    console.error(`  - ${item}`);
  }
  process.exit(1);
}

console.log('Secret, private-endpoint, forbidden-file, and direct dependency license scan PASSED.');
