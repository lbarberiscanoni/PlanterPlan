#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { redactE2EEnvForLog, resolveE2EEnv } = require('./e2e-env.cjs');

function isVisionRun(args) {
  return args.some((arg, index) => {
    if (arg === '@vision' || arg.includes('@vision')) {
      return true;
    }

    if (arg.startsWith('--grep=')) {
      return arg.includes('@vision');
    }

    if (arg === '--grep') {
      const nextArg = args[index + 1];

      // PowerShell treats an unquoted @vision token as splatting syntax, so
      // `node scripts/run-e2e.cjs --grep @vision` arrives as only `--grep`.
      return !nextArg || nextArg.includes('@vision');
    }

    return false;
  });
}

function getNpxInvocation() {
  const npmExecPath = process.env.npm_execpath;
  const candidateNpxCliPaths = [];

  if (npmExecPath) {
    candidateNpxCliPaths.push(join(dirname(npmExecPath), 'npx-cli.js'));
  }

  candidateNpxCliPaths.push(join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js'));

  const npxCliPath = candidateNpxCliPaths.find((candidatePath) => existsSync(candidatePath));
  if (npxCliPath) {
    return { command: process.execPath, argsPrefix: [npxCliPath] };
  }

  return {
    command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    argsPrefix: [],
  };
}

function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(`[e2e] Failed to run ${command}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.signal) {
    console.error(`[e2e] ${command} was terminated by signal ${result.signal}`);
    process.exit(1);
  }

  if (result.status === null) {
    console.error(`[e2e] ${command} exited without a status code`);
    process.exit(1);
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status);
  }
}

function runNpx(args, env) {
  const { command, argsPrefix } = getNpxInvocation();

  run(command, [...argsPrefix, ...args], env);
}

const extraArgs = process.argv.slice(2);

if (isVisionRun(extraArgs) && !process.env.GEMINI_API_KEY) {
  console.log('[e2e] Vision E2E skipped: GEMINI_API_KEY is not configured (value redacted).');
  process.exit(0);
}

const e2eEnv = resolveE2EEnv();
const childEnv = {
  ...process.env,
  ...e2eEnv,
};

console.error('[e2e] Using local E2E environment:', JSON.stringify(redactE2EEnvForLog(e2eEnv)));

runNpx(['bddgen', '--config', 'Testing/e2e/playwright.config.ts'], childEnv);
runNpx(['playwright', 'test', '--config', 'Testing/e2e/playwright.config.ts', ...extraArgs], childEnv);
