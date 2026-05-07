import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type PackageJson = {
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

type PackageLock = {
  packages: Record<string, {
    version?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }>;
};

const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as PackageJson;
const packageLock = JSON.parse(readFileSync('package-lock.json', 'utf8')) as PackageLock;
const ciWorkflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const lockRoot = packageLock.packages[''];

const lockedVersion = (name: string): string | undefined => packageLock.packages[`node_modules/${name}`]?.version;
const major = (value: string | undefined): number => Number(String(value ?? '').match(/^\D*(\d+)/)?.[1]);

describe('dependency compatibility guardrails', () => {
  it('keeps the React runtime stack pinned to exact 18.3.1 in package.json and lockfile', () => {
    for (const name of ['react', 'react-dom', 'react-is']) {
      expect(packageJson.dependencies[name], name).toBe('18.3.1');
      expect(lockRoot.dependencies?.[name], name).toBe('18.3.1');
      expect(lockedVersion(name), name).toBe('18.3.1');
    }
  });

  it('keeps dnd-kit packages on the known-compatible majors', () => {
    const expectedMajors = {
      '@dnd-kit/core': 6,
      '@dnd-kit/sortable': 10,
      '@dnd-kit/utilities': 3,
    } as const;

    for (const [name, expectedMajor] of Object.entries(expectedMajors)) {
      expect(major(packageJson.dependencies[name]), name).toBe(expectedMajor);
      expect(lockRoot.dependencies?.[name], name).toBe(packageJson.dependencies[name]);
      expect(major(lockedVersion(name)), name).toBe(expectedMajor);
    }
  });

  it('wires the dependency guard script into package scripts and CI', () => {
    expect(packageJson.scripts['verify-dependencies']).toBe('node scripts/verify-dependency-guardrails.cjs');
    expect(ciWorkflow).toContain('npm run verify-dependencies');
    expect(() => execFileSync('node', ['scripts/verify-dependency-guardrails.cjs'], { stdio: 'pipe' }))
      .not.toThrow();
  });
});
