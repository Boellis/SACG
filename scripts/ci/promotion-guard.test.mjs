// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPromotion } from './promotion-guard.mjs';

describe('checkPromotion: the dev -> test -> prod flow', () => {
  it('lets only dev (or a hotfix) into test', () => {
    expect(checkPromotion('test', 'dev').ok).toBe(true);
    expect(checkPromotion('test', 'feature/x').ok).toBe(false);
    expect(checkPromotion('test', 'prod').ok).toBe(false);
    expect(checkPromotion('test', 'hotfix/fix-login').ok).toBe(true);
  });

  it('lets only test (or a hotfix) into prod', () => {
    expect(checkPromotion('prod', 'test').ok).toBe(true);
    expect(checkPromotion('prod', 'dev').ok).toBe(false);
    expect(checkPromotion('prod', 'feature/x').ok).toBe(false);
    expect(checkPromotion('prod', 'hotfix/fix-login').ok).toBe(true);
  });

  it('lets anything except test and prod into dev', () => {
    expect(checkPromotion('dev', 'feature/x').ok).toBe(true);
    expect(checkPromotion('dev', 'hotfix/fix-login').ok).toBe(true); // hotfix back-merge
    expect(checkPromotion('dev', 'prod').ok).toBe(false);
    expect(checkPromotion('dev', 'test').ok).toBe(false);
  });

  it.each([
    ['hotfix'], // no slash: just a branch that happens to be called hotfix
    ['hotfix/'], // empty name
    ['hotfixes/x'],
    ['Hotfix/x'], // branch names are case-sensitive
    ['feature/hotfix/x'], // must be the prefix, not anywhere in the name
    ['hotfix-x'],
  ])('does not treat %s as a hotfix branch', (head) => {
    expect(checkPromotion('prod', head).ok).toBe(false);
    expect(checkPromotion('test', head).ok).toBe(false);
  });

  it('matches dev and test exactly, not by prefix or case', () => {
    expect(checkPromotion('test', 'dev-2').ok).toBe(false);
    expect(checkPromotion('test', 'Dev').ok).toBe(false);
    expect(checkPromotion('prod', 'test-fixes').ok).toBe(false);
    expect(checkPromotion('prod', 'TEST').ok).toBe(false);
    expect(checkPromotion('dev', 'prod/x').ok).toBe(true); // only the bare names are protected sources
  });

  it('explains every outcome, naming the branches involved', () => {
    for (const [base, head] of [['test', 'dev'], ['test', 'feature/x'], ['prod', 'dev'], ['dev', 'prod']]) {
      const { reason } = checkPromotion(base, head);
      expect(reason).toEqual(expect.any(String));
      expect(reason).toContain(base);
      expect(reason).toContain(head);
    }
    expect(checkPromotion('prod', 'dev').reason).toMatch(/test/); // tells you where the PR should come from
  });

  it('has no opinion about other base branches', () => {
    expect(checkPromotion('main', 'feature/x').ok).toBe(true);
  });
});

describe('promotion-guard CLI', { timeout: 30_000 }, () => {
  const script = join(dirname(fileURLToPath(import.meta.url)), 'promotion-guard.mjs');
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

  it('exits 0 for an allowed promotion', () => {
    const result = run('prod', 'test');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('test');
  });

  it('exits 1 with the reason for a blocked promotion', () => {
    const result = run('prod', 'feature/x');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('feature/x');
    expect(result.stderr).toContain('prod');
  });

  it('treats a hostile branch name as plain data', () => {
    const hostile = 'x"; echo pwned; #$(id)';
    const result = run('prod', hostile);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(hostile);
  });

  it('exits 2 with usage when called without both branches', () => {
    expect(run().status).toBe(2);
    expect(run('prod').status).toBe(2);
    expect(run('prod', '').status).toBe(2);
    expect(run().stderr).toMatch(/usage/i);
  });
});
