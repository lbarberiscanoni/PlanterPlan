import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const playwrightConfig = readFileSync('Testing/e2e/playwright.config.ts', 'utf8');
const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };

describe('Playwright E2E config', () => {
 it('uses cross-platform webServer env configuration', () => {
  expect(playwrightConfig).toContain("command: 'npm run dev'");
  expect(playwrightConfig).toContain('env:');
  expect(playwrightConfig).toContain("VITE_E2E_MODE: 'true'");
  expect(playwrightConfig).toContain("VITE_TEST_EMAIL: 'test@example.com'");
  expect(playwrightConfig).toContain("VITE_TEST_PASSWORD: 'password123'");
  expect(playwrightConfig).not.toContain('VITE_E2E_MODE=true npm run dev');
 });

 it('uses feature and step globs relative to the E2E config directory', () => {
  expect(playwrightConfig).toContain("features: 'features/**/*.feature'");
  expect(playwrightConfig).toContain("steps: 'steps/**/*.steps.ts'");
  expect(playwrightConfig).not.toContain("missingSteps: 'skip-scenario'");
  expect(playwrightConfig).not.toContain("features: 'Testing/e2e/features/**/*.feature'");
  expect(playwrightConfig).not.toContain("steps: 'Testing/e2e/steps/**/*.steps.ts'");
 });

 it('does not use POSIX inline environment assignment in package scripts', () => {
  expect(packageJson.scripts['test:e2e:vision']).not.toMatch(/GEMINI_API_KEY=\$\{GEMINI_API_KEY\}/);
 });
});
