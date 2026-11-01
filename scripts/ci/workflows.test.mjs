// @vitest-environment node
//
// Guards invariants of the CI tooling that are expensive to get wrong and easy to break in an
// innocent-looking edit: what gets deployed, how rollback is spelled, which job names branch
// protection relies on, that untrusted values never reach a shell, and that the scripts stay
// loadable on Windows checkouts. (Syntax and schema are linted separately; see docs/DEVELOPMENT.md.)
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const workflowDir = join(scriptsDir, '..', '.github', 'workflows');
const read = (name) => readFileSync(join(workflowDir, name), 'utf8').replace(/\r\n/g, '\n');
// Comments are documentation, not behaviour.
const code = (text) =>
  text
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .map((line) => line.replace(/\s+#\s.*$/, ''))
    .join('\n');
const workflowFiles = readdirSync(workflowDir).filter((name) => name.endsWith('.yml'));

describe('scripts', () => {
  it('have no #! line: Vite only strips a hashbang before "\\n", so on a Windows (CRLF) checkout a test that imports one fails to load', () => {
    const scripts = readdirSync(scriptsDir, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.mjs'))
      .map((entry) => join(entry.parentPath ?? entry.path, entry.name));
    expect(scripts.length).toBeGreaterThanOrEqual(10);
    for (const file of scripts) expect(readFileSync(file, 'utf8').startsWith('#!'), file).toBe(false);
  });
});

describe('all workflows', () => {
  it('include the ones the pipeline needs', () => {
    expect(workflowFiles.sort()).toEqual(['ci.yml', 'codeql.yml', 'deploy-prod.yml', 'deploy-test.yml']);
  });

  it('pin every action to a major version tag (or call a local reusable workflow)', () => {
    for (const name of workflowFiles) {
      const uses = [...code(read(name)).matchAll(/^\s*(?:-\s+)?uses:\s*(\S+)/gm)].map((m) => m[1]);
      expect(uses.length, name).toBeGreaterThan(0);
      for (const ref of uses) {
        expect(ref, `${name}: ${ref}`).toMatch(/^(?:[\w.-]+\/[\w./-]+@v\d+|\.\/\.github\/workflows\/[\w.-]+\.yml)$/);
      }
    }
  });

  it('start from read-only token permissions', () => {
    for (const name of workflowFiles) expect(code(read(name)), name).toMatch(/^permissions:\n(?:  [\w-]+: (?:read|write)\n)+/m);
    expect(code(read('ci.yml'))).toMatch(/^permissions:\n  contents: read\n/m);
  });

  it('pin firebase-tools to the version the project was verified with', () => {
    for (const name of workflowFiles) {
      for (const [, version] of code(read(name)).matchAll(/firebase-tools@(\S+)/g)) expect(version, name).toBe('14.9.0');
    }
  });

  it('only let GitHub expressions with untrusted text reach a script through an env var', () => {
    const untrusted = /\$\{\{\s*github\.(?:head_ref|base_ref|event\.[^}]*)\s*\}\}/;
    for (const name of workflowFiles) {
      for (const line of code(read(name)).split('\n').filter((l) => untrusted.test(l))) {
        expect(line, `${name}: ${line.trim()}`).toMatch(/^\s+[A-Z][A-Z0-9_]*:\s+\$\{\{[^}]+\}\}\s*$/);
      }
    }
  });
});

describe('ci.yml', () => {
  const text = code(read('ci.yml'));
  const required = ['build-and-test', 'functions', 'firestore-rules', 'security-scan', 'bundle-scan', 'promotion-guard'];

  it('defines exactly the jobs that branch protection requires, each named after its id', () => {
    const jobsSection = text.slice(text.indexOf('\njobs:\n') + 7);
    const ids = [...jobsSection.matchAll(/^  ([a-z][\w-]*):\s*$/gm)].map((m) => m[1]);
    expect(ids.sort()).toEqual([...required].sort());
    for (const id of required) expect(text, id).toMatch(new RegExp(`^  ${id}:\\n    name: ${id}\\n`, 'm'));
  });

  it('can be called by the deploy workflows and runs on pull requests and pushes to all three branches', () => {
    expect(text).toMatch(/^on:\n  pull_request:\n    branches: \[dev, test, prod\]\n  push:\n    branches: \[dev, test, prod\]\n  workflow_call: \{\}\n/m);
  });
});

describe('deploy-test.yml', () => {
  const text = code(read('deploy-test.yml'));

  it('deploys Hosting only, to the test preview channel, never the production backend resources', () => {
    expect(text).toContain('hosting:channel:deploy test --expires 30d --project sacg-garden-app --non-interactive --json');
    expect(text).not.toMatch(/firebase-tools@14\.9\.0 deploy/);
    expect(text).not.toMatch(/extensions/i);
  });

  it('gates on CI and runs in the test environment with keyless auth', () => {
    expect(text).toMatch(/^  ci:\n    uses: \.\/\.github\/workflows\/ci\.yml\n/m);
    expect(text).toMatch(/needs: ci\n/);
    expect(text).toMatch(/environment: test\n/);
    expect(text).toMatch(/workload_identity_provider: \$\{\{ vars\.GCP_WIF_PROVIDER \}\}/);
    expect(text).toMatch(/service_account: \$\{\{ vars\.GCP_DEPLOY_SA \}\}/);
    expect(text).not.toMatch(/credentials_json|secrets\./);
  });

  it('is serialized and never cancelled mid-deploy', () => {
    expect(text).toMatch(/^concurrency:\n  group: deploy-test\n  cancel-in-progress: false\n/m);
    expect(text).toMatch(/^on:\n  push:\n    branches: \[test\]\n  workflow_dispatch: \{\}\n/m);
  });

  it('smoke-checks the preview URL it just deployed', () => {
    expect(text).toMatch(/node scripts\/smoke\/smoke\.mjs --url "\$PREVIEW_URL"/);
  });

  it('lets the first rollout skip the callable checks with a repository variable', () => {
    expect(text).toContain("vars.SMOKE_SKIP_FUNCTIONS == 'true' && '--skip-functions'");
  });

  it('only asks for the OIDC token in the deploy job', () => {
    expect(text.match(/id-token: write/g)).toHaveLength(1);
  });
});

describe('deploy-prod.yml', () => {
  const text = code(read('deploy-prod.yml'));

  it('deploys exactly hosting, firestore rules and indexes, storage and functions, and never extensions', () => {
    const deploys = text.match(/firebase-tools@14\.9\.0 deploy[^\n]*/g) ?? [];
    expect(deploys).toHaveLength(1);
    expect(deploys[0]).toBe('firebase-tools@14.9.0 deploy --only "hosting,firestore:rules,firestore:indexes,storage,functions" --project sacg-garden-app --non-interactive ${FORCE_FLAG}');
    expect(text).not.toMatch(/extensions/i);
  });

  it('passes --force only on a manual run that explicitly asks for it, never on a push', () => {
    expect(text).toContain("FORCE_FLAG: ${{ github.event_name == 'workflow_dispatch' && inputs.force && '--force' || '' }}");
    expect(text).toMatch(/      force:\n        description: [\s\S]*?\n        type: boolean\n        default: false\n/);
    // no run line hard-codes the flag: it can only arrive through FORCE_FLAG
    const runLines = text.split('\n').filter((l) => /^\s*run: /.test(l));
    expect(runLines.some((l) => l.includes('--force'))).toBe(false);
  });

  it('gates on CI and runs in the production environment with keyless auth', () => {
    expect(text).toMatch(/^  ci:\n    uses: \.\/\.github\/workflows\/ci\.yml\n/m);
    expect(text).toMatch(/needs: ci\n/);
    expect(text).toMatch(/environment:\n      name: production\n      url: https:\/\/sacg-garden-app\.web\.app\n/);
    expect(text).toMatch(/token_format: access_token/);
    expect(text).not.toMatch(/credentials_json|secrets\./);
    expect(text.match(/id-token: write/g)).toHaveLength(1);
  });

  it('is serialized and never cancelled mid-deploy', () => {
    expect(text).toMatch(/^concurrency:\n  group: deploy-prod\n  cancel-in-progress: false\n/m);
    expect(text).toMatch(/^on:\n  push:\n    branches: \[prod\]\n  workflow_dispatch:\n    inputs:\n      force:\n/m);
  });

  it('records the live Hosting version before deploying, and smoke-checks production after', () => {
    const iRecord = text.indexOf('channels/live');
    const iDeploy = text.indexOf('firebase-tools@14.9.0 deploy');
    const iSmoke = text.indexOf('node scripts/smoke/smoke.mjs --url https://sacg-garden-app.web.app');
    expect(iRecord).toBeGreaterThan(-1);
    expect(iRecord).toBeLessThan(iDeploy);
    expect(iDeploy).toBeLessThan(iSmoke);
    expect(text).toMatch(/\.release/);
    expect(text).toContain('prev_version=');
  });

  it('does not let the production smoke run skip the callable checks', () => {
    expect(text).not.toMatch(/skip-functions|SMOKE_SKIP_FUNCTIONS/);
  });

  it('rolls Hosting back when the run fails or is cancelled (a timeout included), and never after a success', () => {
    const rollback = text.slice(text.indexOf('- name: Roll Hosting back'));
    expect(rollback).toMatch(/^ {8}if: \(failure\(\) \|\| cancelled\(\)\) && steps\.prev\.outputs\.prev_version != ''\n/m);
    // always() or success() would undo a good deploy.
    expect(rollback).not.toMatch(/always\(\)|success\(\)/);
  });

  it('rolls Hosting back with the <site>@<version> form that firebase-tools 14.9.0 understands', () => {
    expect(text).toContain('hosting:clone "sacg-garden-app@${version_id}" sacg-garden-app:live --project sacg-garden-app --non-interactive');
    // "<site>:@<version>" would be read as a channel called "@<version>" and fail
    expect(text).not.toMatch(/sacg-garden-app:@/);
    // the rollback step is the last one, so it sees the outcome of everything before it
    expect(text.lastIndexOf('hosting:clone')).toBeGreaterThan(text.lastIndexOf('smoke.mjs'));
  });

  it('skips the rollback when the live version never changed (re-releasing it is an HTTP 400)', () => {
    const rollback = text.slice(text.indexOf('- name: Roll Hosting back'));
    const iCheck = rollback.indexOf('if [ "$current" = "$PREV_VERSION" ]; then');
    expect(iCheck).toBeGreaterThan(-1);
    expect(rollback.indexOf('exit 0')).toBeGreaterThan(iCheck);
    // the check reads the live channel again, and runs before the clone
    expect(rollback.indexOf('channels/live')).toBeLessThan(iCheck);
    expect(iCheck).toBeLessThan(rollback.indexOf('hosting:clone'));
    expect(rollback).toContain('TOKEN: ${{ steps.auth.outputs.access_token }}');
  });
});
