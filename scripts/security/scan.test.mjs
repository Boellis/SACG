// @vitest-environment node
//
// Tests for the repo / bundle scanners. This repo is PUBLIC, so this file must
// itself pass `npm run security:scan` (and gitleaks): every sample secret, email
// and phone number below is assembled at runtime instead of written as a literal.
import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  scanText,
  scanPath,
  firebaseWebKey,
  SECRET_RULES,
  PII_RULES,
  ALLOWED_EMAIL_DOMAINS,
  ALLOWED_EMAILS,
  FORBIDDEN_PATHS,
} from './patterns.mjs';

const cat = (...parts) => parts.join('');
const at = (local, domain) => `${local}@${domain}`;
const ruleIds = (findings) => findings.map((f) => f.rule);

describe('policy tables', () => {
  it('expose the reviewed allowlists exactly (widening them is a security decision)', () => {
    expect(ALLOWED_EMAIL_DOMAINS).toEqual([
      'example.com',
      'example.org',
      'example.net',
      'test.com',
      'x.com',
      'sacg.test',
      'test',
      'sacg-garden-app.web.app',
    ]);
    expect(ALLOWED_EMAILS).toEqual([
      'southatxgarden@gmail.com',
      'bellis.swe@gmail.com',
      'noreply@anthropic.com',
    ]);
  });

  it('keep stable rule ids so CI output and docs can refer to them', () => {
    expect(SECRET_RULES.map((r) => r.id).sort()).toEqual(
      [
        'anthropic',
        'private-key-block',
        'service-account-private-key',
        'service-account-type',
        'github-token',
        'aws-access-key',
        'slack-token',
        'google-api-key',
      ].sort(),
    );
    expect(PII_RULES.map((r) => r.id).sort()).toEqual(['email', 'phone']);
    expect(FORBIDDEN_PATHS.every((re) => re instanceof RegExp)).toBe(true);
  });

  it('rule regexes are not stateful, so callers can .test() them repeatedly', () => {
    const anthropic = SECRET_RULES.find((r) => r.id === 'anthropic').re;
    const sample = cat('sk-ant-api03-', 'a'.repeat(40));
    expect(anthropic.test(sample)).toBe(true);
    expect(anthropic.test(sample)).toBe(true);
  });
});

describe('scanText: secrets', () => {
  it('flags an anthropic key', () => {
    const findings = scanText('k=sk-ant-api03-' + 'a'.repeat(40), 'x.ts');
    expect(ruleIds(findings)).toContain('anthropic');
  });

  it.each([
    ['private-key-block', cat('-----BEGIN ', 'RSA PRIVATE KEY-----')],
    ['private-key-block', cat('-----BEGIN ', 'PRIVATE KEY-----')],
    ['private-key-block', cat('-----BEGIN ', 'OPENSSH PRIVATE KEY-----')],
    ['service-account-private-key', cat('  "private', '_key": "x"')],
    ['service-account-type', cat('"type": "service', '_account",')],
    ['github-token', cat('ghp_', 'A'.repeat(36))],
    ['github-token', cat('gho_', 'b1'.repeat(18))],
    ['aws-access-key', cat('AKIA', 'ABCDEFGHIJKLMNOP')],
    ['slack-token', cat('xoxb', '-123456789012-abcdef')],
  ])('flags %s: %#', (rule, sample) => {
    expect(ruleIds(scanText(`value = ${sample}`, 'x.txt'))).toContain(rule);
  });

  it('does not flag lookalikes that are too short', () => {
    expect(scanText(cat('sk-ant-', 'short'), 'x.txt')).toEqual([]);
    expect(scanText(cat('AKIA', 'TOOSHORT'), 'x.txt')).toEqual([]);
    expect(scanText(cat('ghp_', 'A'.repeat(10)), 'x.txt')).toEqual([]);
  });

  it('allows only the Firebase web key', () => {
    const key = cat('AIza', 'Sy', 'A'.repeat(33)); // AIza + 35 chars
    const other = cat('AIza', 'Sy', 'B'.repeat(33));
    const line = `apiKey:"${key}"`;

    expect(ruleIds(scanText(line, 'x.js'))).toContain('google-api-key');
    expect(scanText(line, 'x.js', { allowedGoogleKeys: [key] })).toEqual([]);
    // allowing one key must not allow a different one
    expect(ruleIds(scanText(`apiKey:"${other}"`, 'x.js', { allowedGoogleKeys: [key] }))).toContain('google-api-key');
    // a longer token that merely starts with the allowed key is a different token
    expect(ruleIds(scanText(`apiKey:"${key}EXTRA"`, 'x.js', { allowedGoogleKeys: [key] }))).toContain('google-api-key');
  });
});

describe('scanText: member PII', () => {
  it('flags a real-looking member email but not allowlisted ones', () => {
    expect(ruleIds(scanText(at('jane', 'gmail.com'), 'x.ts'))).toContain('email');
    expect(scanText(at('a', 'x.com'), 'x.ts')).toEqual([]);
    expect(scanText(at('southatxgarden', 'gmail.com'), 'x.ts')).toEqual([]);
    expect(scanText(at('x', 'example.com'), 'x.ts')).toEqual([]);
  });

  it('matches email addresses case-insensitively', () => {
    expect(scanText(at('SouthATXGarden', 'GMAIL.com'), 'x.ts')).toEqual([]);
    expect(ruleIds(scanText(at('Jane.Doe', 'Gmail.COM'), 'x.ts'))).toContain('email');
  });

  it('allows subdomains of allowlisted domains but not lookalike domains', () => {
    expect(scanText(at('a', 'mail.example.com'), 'x.ts')).toEqual([]);
    expect(scanText(at('admin', 'sacg.test'), 'x.ts')).toEqual([]);
    expect(scanText(at('anyone', 'garden.test'), 'x.ts')).toEqual([]);
    expect(ruleIds(scanText(at('a', 'notexample.com'), 'x.ts'))).toContain('email');
    expect(ruleIds(scanText(at('a', 'example.com.evil.io'), 'x.ts'))).toContain('email');
  });

  it('sees through percent-encoded @, which hides addresses in URLs and mailto links', () => {
    expect(ruleIds(scanText(`mailto:jane%40${'gmail.com'}`, 'x.md'))).toContain('email');
    // the garden SMTP account as written in the extension config is the org address, so it is fine
    expect(scanText('SMTP_CONNECTION_URI=smtps://southatxgarden%40gmail.com@smtp.gmail.com:465', 'x.env')).toEqual([]);
  });

  it('does not mistake version pins and action refs for emails', () => {
    const text = [
      'react@18.3.1',
      'firebase-tools@14.9.0',
      'uses: actions/checkout@v4',
      'google-github-actions/auth@v2',
      "import x from '@vitejs/plugin-react'",
    ].join('\n');
    expect(scanText(text, 'x.yml')).toEqual([]);
  });

  it('flags a phone number but not 555 numbers', () => {
    const real = ['512', '867', '5309'].join('-');
    expect(ruleIds(scanText(`call ${real}`, 'x.ts'))).toContain('phone');
    expect(scanText('call 555-123-4567', 'x.ts')).toEqual([]);
    expect(scanText('call (212) 555-0100', 'x.ts')).toEqual([]);
  });

  // A=area code, B=exchange, C=line number. Filled in at runtime (see file header).
  const phoneFrom = (template) => template.replace('AAA', '512').replace('BBB', '867').replace('CCCC', '5309');
  it.each([
    ['(AAA) BBB-CCCC'],
    ['(AAA)BBB-CCCC'],
    ['AAA.BBB.CCCC'],
    ['AAA BBB CCCC'],
    ['+1 AAA BBB CCCC'],
    ['1-AAA-BBB-CCCC'],
  ])('flags the phone format %s', (template) => {
    expect(ruleIds(scanText(`Phone: ${phoneFrom(template)}`, 'x.md'))).toContain('phone');
  });

  it('does not flag ids, dates, versions and other digit runs', () => {
    const text = [
      'VITE_FB_MESSAGING_SENDER_ID=6842066844',
      'const stamp = 1698765432123;',
      'released 2026-11-07 09:00',
      'ip 192.168.100.1234',
      'version 10.14.1 build 2024-10-10',
      'placeholder 123-456-7890',
    ].join('\n');
    expect(scanText(text, 'x.ts')).toEqual([]);
  });
});

describe('scanText: reporting', () => {
  it('reports 1-based line numbers for LF and CRLF text', () => {
    const secret = cat('AKIA', 'ABCDEFGHIJKLMNOP');
    const lf = scanText(`one\ntwo\nkey ${secret}\n`, 'a.txt');
    const crlf = scanText(`one\r\ntwo\r\nkey ${secret}\r\n`, 'a.txt');
    expect(lf).toEqual([{ path: 'a.txt', line: 3, rule: 'aws-access-key', excerpt: 'AKIA…' }]);
    expect(crlf).toEqual(lf);
  });

  it('returns several findings from one line', () => {
    const line = `${cat('AKIA', 'ABCDEFGHIJKLMNOP')} ${at('jane', 'gmail.com')}`;
    expect(ruleIds(scanText(line, 'a.txt')).sort()).toEqual(['aws-access-key', 'email']);
  });

  it('redacts excerpts', () => {
    const secrets = [
      cat('sk-ant-api03-', 'a'.repeat(40)),
      cat('ghp_', 'Z'.repeat(36)),
      at('jane.doe', 'gmail.com'),
      ['512', '867', '5309'].join('-'),
    ];
    const findings = secrets.flatMap((s) => scanText(`v=${s}`, 'x.ts'));
    expect(findings).toHaveLength(secrets.length);
    for (const finding of findings) {
      expect(finding.excerpt).toMatch(/^.{4}…$/u);
      for (const secret of secrets) expect(finding.excerpt).not.toContain(secret);
    }
  });

  it('scans a multi-megabyte minified line without catastrophic backtracking', () => {
    const runs = [
      'a'.repeat(2_000_000), // one giant local-part-looking run with no @
      'a.'.repeat(1_000_000),
      '1 '.repeat(1_000_000),
      ('x@'.repeat(200_000)),
    ];
    const started = Date.now();
    for (const run of runs) scanText(run, 'bundle.js');
    expect(Date.now() - started).toBeLessThan(5000);
  });
});

describe('scanPath', () => {
  it('flags forbidden paths', () => {
    expect(scanPath('members_list.txt')).not.toHaveLength(0);
    expect(scanPath('a/serviceAccount.json')).not.toHaveLength(0);
    expect(scanPath('.env')).not.toHaveLength(0);
  });

  it('allows the env files that are safe to commit', () => {
    expect(scanPath('.env.production')).toEqual([]);
    expect(scanPath('.env.example')).toEqual([]);
  });

  it.each([
    ['data/members_list_2026.xlsx'],
    ['export/roster.csv'],
    ['export/ROSTER.CSV'],
    ['member-cleanup/serviceAccount.json'],
    ['member-cleanup/serviceAccount-prod.json'],
    ['sacg-garden-app-firebase-adminsdk-abc12-0123456789.json'],
    ['certs/server.pem'],
    ['certs/bundle.p12'],
    ['deploy.key'],
    ['functions/.env'],
    ['.env.local'],
    ['.env.production.local'],
    ['extensions/firestore-send-email.secret.local'],
    ['backup-2026-10-31.json'],
    ['member-cleanup/report-2026-10-31.json'],
    ['nested\\windows\\serviceAccount.json'],
  ])('flags %s', (path) => {
    const findings = scanPath(path);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ rule: 'forbidden-path', line: 0 });
  });

  it('only allows csv files inside the scanner fixtures directory', () => {
    expect(scanPath('scripts/security/fixtures/sample.csv')).toEqual([]);
    expect(scanPath('scripts/other/sample.csv')).not.toHaveLength(0);
  });

  it.each([
    ['src/App.tsx'],
    ['package-lock.json'],
    ['.gitignore'],
    ['extensions/firestore-send-email.env'],
    ['src/features/members/membersApi.ts'],
    ['docs/DEVELOPMENT.md'],
    ['bin/monkey'], // ends in "key" but has no ".key" extension
  ])('allows %s', (path) => {
    expect(scanPath(path)).toEqual([]);
  });
});

describe('firebaseWebKey', () => {
  const dirs = [];
  afterEach(() => {
    while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true, maxRetries: 3 });
  });
  const envFile = (content) => {
    const dir = mkdtempSync(join(tmpdir(), 'sacg-env-'));
    dirs.push(dir);
    const file = join(dir, '.env.production');
    writeFileSync(file, content);
    return file;
  };

  it('reads the public web key from .env.production', () => {
    const key = firebaseWebKey();
    expect(key).toMatch(/^AIza[0-9A-Za-z_-]{35}$/);
  });

  it('makes the committed .env.production pass the scanner when its key is allowed', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const text = readFileSync(join(here, '..', '..', '.env.production'), 'utf8');
    expect(ruleIds(scanText(text, '.env.production'))).toEqual(['google-api-key']);
    expect(scanText(text, '.env.production', { allowedGoogleKeys: [firebaseWebKey()] })).toEqual([]);
  });

  it('parses comments, CRLF line endings, spacing and quotes', () => {
    const key = cat('AIza', 'Sy', 'C'.repeat(33));
    expect(firebaseWebKey(envFile(`# comment\r\nVITE_FB_API_KEY = "${key}"\r\nOTHER=1\r\n`))).toBe(key);
    expect(firebaseWebKey(envFile(`VITE_FB_API_KEY='${key}'\n`))).toBe(key);
  });

  it('returns an empty string (so nothing is allowed) when the file or key is missing', () => {
    expect(firebaseWebKey(join(tmpdir(), 'sacg-does-not-exist', '.env.production'))).toBe('');
    expect(firebaseWebKey(envFile('VITE_FB_PROJECT_ID=sacg-garden-app\n'))).toBe('');
  });
});

// ---------------------------------------------------------------------------
// CLI behaviour. These spawn the real scripts the way CI does.
// ---------------------------------------------------------------------------
const here = dirname(fileURLToPath(import.meta.url));
const SCAN_REPO = join(here, 'scan-repo.mjs');
const SCAN_DIST = join(here, 'scan-dist.mjs');

const tmpRoots = [];
afterEach(() => {
  while (tmpRoots.length) rmSync(tmpRoots.pop(), { recursive: true, force: true, maxRetries: 3 });
});
const makeTree = (files) => {
  const root = mkdtempSync(join(tmpdir(), 'sacg-scan-'));
  tmpRoots.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
};
const run = (script, args, cwd) =>
  spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8', timeout: 30_000 });
const output = (result) => `${result.stdout}${result.stderr}`;

describe('scan-dist CLI', { timeout: 30_000 }, () => {
  const leak = cat('sk-ant-api03-', 'q'.repeat(40));

  it('passes on a clean bundle that only contains the public Firebase web key', () => {
    const root = makeTree({
      'dist/index.html': '<div id="root"></div>',
      'dist/assets/app.js': `const c={apiKey:"${firebaseWebKey()}",projectId:"sacg-garden-app"};`,
    });
    const result = run(SCAN_DIST, ['dist'], root);
    expect(result.status).toBe(0);
  });

  it('fails on any source map, even an innocent one', () => {
    const root = makeTree({
      'dist/index.html': '<div id="root"></div>',
      'dist/assets/app.js': 'console.log(1)',
      'dist/assets/app.js.map': '{"version":3}',
    });
    const result = run(SCAN_DIST, ['dist'], root);
    expect(result.status).toBe(1);
    expect(output(result)).toContain('dist/assets/app.js.map');
    expect(output(result)).toContain('source-map');
  });

  it('fails on a leaked secret and never prints it in full', () => {
    const root = makeTree({
      'dist/index.html': '<div id="root"></div>',
      'dist/assets/app.js': `var a=1;\nvar k="${leak}";`,
    });
    const result = run(SCAN_DIST, ['dist'], root);
    expect(result.status).toBe(1);
    expect(output(result)).toContain('dist/assets/app.js:2 anthropic');
    expect(output(result)).not.toContain(leak);
  });

  it('flags member email addresses baked into the bundle', () => {
    const root = makeTree({ 'dist/assets/app.js': `var m="${at('jane.doe', 'gmail.com')}";` });
    const result = run(SCAN_DIST, ['dist'], root);
    expect(result.status).toBe(1);
    expect(output(result)).toContain('email');
  });

  it('flags a Google API key that is not the Firebase web key', () => {
    const stranger = cat('AIza', 'Sy', 'D'.repeat(33));
    const root = makeTree({ 'dist/assets/app.js': `var k="${stranger}";` });
    const result = run(SCAN_DIST, ['dist'], root);
    expect(result.status).toBe(1);
    expect(output(result)).toContain('google-api-key');
  });

  it('fails loudly when the directory does not exist', () => {
    const root = makeTree({ 'README.txt': 'no build here' });
    const result = run(SCAN_DIST, ['dist'], root);
    expect(result.status).toBe(1);
    expect(output(result)).toMatch(/dist/);
  });
});

describe('scan-repo CLI', () => {
  const git = (cwd, ...args) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    expect(result.status, `git ${args.join(' ')}: ${result.stderr}`).toBe(0);
  };
  const repoWith = (files, { untracked = {} } = {}) => {
    const root = makeTree(files);
    git(root, 'init', '-q');
    git(root, 'add', '-A');
    for (const [rel, content] of Object.entries(untracked)) {
      const abs = join(root, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content);
    }
    return root;
  };

  // Each scenario shells out to git several times (slow on Windows), so every
  // scenario packs many expectations into one repository.
  const phone = ['512', '867', '5309'].join('-');
  const awsKey = cat('AKIA', 'ABCDEFGHIJKLMNOP');

  it('passes on a clean tree: skips lockfiles, svg, binaries, fixtures and untracked files', () => {
    const noisy = `${at('jane', 'gmail.com')} ${phone} ${awsKey}`;
    const root = repoWith(
      {
        'src/a.ts': 'export const a = 1;\n',
        'package-lock.json': noisy,
        'functions/package-lock.json': noisy,
        'public/logo.svg': noisy,
        'scripts/security/fixtures/leaky.txt': noisy,
        'assets/blob.bin': Buffer.concat([Buffer.from([0, 1, 2, 0]), Buffer.from(noisy)]),
      },
      { untracked: { 'scratch.txt': cat('sk-ant-api03-', 'z'.repeat(40)) } },
    );
    const result = run(SCAN_REPO, [], root);
    expect(result.status).toBe(0);
    expect(output(result)).toMatch(/scanned 1 file,/);
  }, 60_000);

  it('reports findings as path:line rule excerpt, from any subdirectory, without printing secrets', () => {
    const root = repoWith({
      'src/a.ts': 'export const a = 1;\n',
      'docs/notes.md': `fine\nkey ${awsKey}\n`,
      'src/x.ts': `// ${at('donna', 'gmail.com')} ${phone}\n`,
      'members_list.txt': 'nothing sensitive in here\n',
    });
    // started inside src/, it must still scan the whole repository
    const result = run(SCAN_REPO, [], join(root, 'src'));
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('docs/notes.md:2 aws-access-key AKIA…');
    expect(result.stdout).toContain('src/x.ts:1 email');
    expect(result.stdout).toContain('src/x.ts:1 phone');
    // a forbidden path is reported even though its content is harmless
    expect(result.stdout).toContain('members_list.txt:0 forbidden-path');
    expect(output(result)).not.toContain(awsKey);
    expect(output(result)).not.toContain(phone);
  }, 60_000);
});
