const { readFileSync } = require('fs');
const { join } = require('path');

const rootDir = join(__dirname, '..');
const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
const packageLock = JSON.parse(readFileSync(join(rootDir, 'package-lock.json'), 'utf8'));
const lockRoot = packageLock.packages?.[''] ?? {};

const errors = [];

function fail(message) {
  errors.push(message);
}

function rootSpec(name, section = 'dependencies') {
  return packageJson[section]?.[name];
}

function lockRootSpec(name, section = 'dependencies') {
  return lockRoot[section]?.[name];
}

function lockPackageVersion(name) {
  return packageLock.packages?.[`node_modules/${name}`]?.version;
}

function major(versionOrRange) {
  const match = String(versionOrRange ?? '').match(/^\D*(\d+)/);
  return match ? Number(match[1]) : NaN;
}

function assertExactRuntimePin(name, version) {
  const pkgSpec = rootSpec(name);
  const lockSpec = lockRootSpec(name);
  const installedVersion = lockPackageVersion(name);

  if (pkgSpec !== version) fail(`${name} must be exact ${version} in package.json, got ${pkgSpec ?? '<missing>'}`);
  if (lockSpec !== version) fail(`${name} must be exact ${version} in package-lock root, got ${lockSpec ?? '<missing>'}`);
  if (installedVersion !== version) fail(`${name} lock package must resolve ${version}, got ${installedVersion ?? '<missing>'}`);
}

function assertMajorGuard(name, expectedMajor) {
  const pkgSpec = rootSpec(name);
  const lockSpec = lockRootSpec(name);
  const installedVersion = lockPackageVersion(name);

  if (major(pkgSpec) !== expectedMajor) fail(`${name} package.json must stay on major ${expectedMajor}, got ${pkgSpec ?? '<missing>'}`);
  if (lockSpec !== pkgSpec) fail(`${name} package-lock root must mirror package.json (${pkgSpec ?? '<missing>'}), got ${lockSpec ?? '<missing>'}`);
  if (major(installedVersion) !== expectedMajor) {
    fail(`${name} installed lock version must stay on major ${expectedMajor}, got ${installedVersion ?? '<missing>'}`);
  }
}

function assertDevMajorGuard(name, expectedMajor) {
  const pkgSpec = rootSpec(name, 'devDependencies');
  const lockSpec = lockRootSpec(name, 'devDependencies');
  const installedVersion = lockPackageVersion(name);

  if (major(pkgSpec) !== expectedMajor) fail(`${name} package.json must stay on major ${expectedMajor}, got ${pkgSpec ?? '<missing>'}`);
  if (lockSpec !== pkgSpec) fail(`${name} package-lock root must mirror package.json (${pkgSpec ?? '<missing>'}), got ${lockSpec ?? '<missing>'}`);
  if (major(installedVersion) !== expectedMajor) {
    fail(`${name} installed lock version must stay on major ${expectedMajor}, got ${installedVersion ?? '<missing>'}`);
  }
}

assertExactRuntimePin('react', '18.3.1');
assertExactRuntimePin('react-dom', '18.3.1');
assertExactRuntimePin('react-is', '18.3.1');
assertExactRuntimePin('gantt-task-react', '0.3.9');

assertDevMajorGuard('@types/react', 18);
assertDevMajorGuard('@types/react-dom', 18);

assertMajorGuard('@dnd-kit/core', 6);
assertMajorGuard('@dnd-kit/sortable', 10);
assertMajorGuard('@dnd-kit/utilities', 3);

if (errors.length > 0) {
  console.error('Dependency compatibility guardrails failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Dependency compatibility guardrails verified.');
