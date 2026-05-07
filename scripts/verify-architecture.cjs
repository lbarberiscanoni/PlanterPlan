const { existsSync, readdirSync, readFileSync } = require('fs');
const { join, relative } = require('path');

const root = process.cwd();
const srcRoot = join(root, 'src');
const agentMode = process.env.AGENT_MODE === 'true';

function walk(dir, files = []) {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'tests' || entry.name === 'test') continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }
    if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) files.push(fullPath);
  }
  return files;
}

function toRepoPath(file) {
  return relative(root, file).replace(/\\/g, '/');
}

function read(file) {
  return readFileSync(file, 'utf8');
}

function stripCodeComments(source) {
  const chars = source.split('');
  const stack = [{ type: 'code' }];
  const current = () => stack[stack.length - 1];
  const blank = (index) => {
    if (chars[index] !== '\n' && chars[index] !== '\r') chars[index] = ' ';
  };

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];
    const state = current();

    if (state.type === 'lineComment') {
      if (char === '\n' || char === '\r') stack.pop();
      else blank(i);
      continue;
    }

    if (state.type === 'blockComment') {
      blank(i);
      if (char === '*' && next === '/') {
        blank(i + 1);
        i += 1;
        stack.pop();
      }
      continue;
    }

    if (state.type === 'singleQuote' || state.type === 'doubleQuote') {
      if (char === '\\') {
        i += 1;
        continue;
      }
      if (
        (state.type === 'singleQuote' && char === "'") ||
        (state.type === 'doubleQuote' && char === '"')
      ) {
        stack.pop();
      }
      continue;
    }

    if (state.type === 'template') {
      if (char === '\\') {
        i += 1;
        continue;
      }
      if (char === '`') {
        stack.pop();
        continue;
      }
      if (char === '$' && next === '{') {
        i += 1;
        stack.push({ type: 'templateExpression', braceDepth: 1 });
      }
      continue;
    }

    if (state.type === 'templateExpression') {
      if (char === '{') {
        state.braceDepth += 1;
        continue;
      }
      if (char === '}') {
        state.braceDepth -= 1;
        if (state.braceDepth === 0) stack.pop();
        continue;
      }
    }

    if (char === '/' && next === '/') {
      blank(i);
      blank(i + 1);
      i += 1;
      stack.push({ type: 'lineComment' });
      continue;
    }

    if (char === '/' && next === '*') {
      blank(i);
      blank(i + 1);
      i += 1;
      stack.push({ type: 'blockComment' });
      continue;
    }

    if (char === "'") {
      stack.push({ type: 'singleQuote' });
      continue;
    }

    if (char === '"') {
      stack.push({ type: 'doubleQuote' });
      continue;
    }

    if (char === '`') {
      stack.push({ type: 'template' });
    }
  }

  return chars.join('');
}

function nonTestFile(file) {
  return !/\.test\.tsx?$/.test(file);
}

function findMatches(files, rule, predicate) {
  const matches = [];
  for (const file of files) {
    const source = read(file);
    const originalLines = source.split(/\r?\n/);
    const codeLines = stripCodeComments(source).split(/\r?\n/);
    codeLines.forEach((line, index) => {
      if (predicate(line, file)) {
        matches.push(`${toRepoPath(file)}:${index + 1}:${originalLines[index] ?? line}`);
      }
    });
  }
  return matches.length > 0 ? { rule, files: matches } : null;
}

function runNodeVerifier() {
  console.log('Running Architectural & NIH Sanity Checks...');

  const files = walk(srcRoot);
  const productionFiles = files.filter(nonTestFile);
  const violations = [];

  const typeMasking = findMatches(
    productionFiles,
    'Type Masking',
    (line) => /(as any|as unknown|: any\b)/.test(line)
  );
  if (typeMasking) violations.push(typeMasking);

  const upward = findMatches(
    walk(join(srcRoot, 'features')),
    'FSD Upward Dependency',
    (line) => /from ['"]@\/app\//.test(line)
  );
  if (upward) violations.push(upward);

  const featuresRoot = join(srcRoot, 'features');
  if (existsSync(featuresRoot)) {
    for (const entry of readdirSync(featuresRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const featureName = entry.name;
      const lateral = findMatches(
        walk(join(featuresRoot, featureName)),
        'FSD Lateral Dependency',
        (line) => /from ['"]@\/features\//.test(line) && !line.includes(`@/features/${featureName}`)
      );
      if (lateral) {
        lateral.detail = `Cross-feature imports detected in ${featureName}`;
        violations.push(lateral);
      }
    }
  }

  const dateMath = findMatches(
    productionFiles.filter((file) => !toRepoPath(file).includes('/date-engine/')),
    'Raw Date Math',
    (line) => /(new Date\(|\.toISOString\(\))/.test(line)
  );
  if (dateMath) violations.push(dateMath);

  const rawSupabaseFetch = findMatches(
    files,
    'NIH API Client',
    (line) => /rawSupabaseFetch\(/.test(line)
  );
  if (rawSupabaseFetch) violations.push(rawSupabaseFetch);

  const domHack = findMatches(
    files,
    'DOM Hacks (window.location)',
    (line) => /window\.location\.href\s*=/.test(line) && !line.includes('mailto:')
  );
  if (domHack) violations.push(domHack);

  if (agentMode) {
    const status = violations.length === 0 ? 'SUCCESS' : 'FAIL';
    console.log(JSON.stringify({
      status,
      code: violations.length === 0 ? 0 : 1,
      violations: violations.length === 0 ? undefined : violations,
      message: violations.length === 0 ? 'No structural violations found.' : undefined
    }, null, 2));
  } else if (violations.length === 0) {
    console.log('');
    console.log('Architecture verified. No structural violations found.');
  } else {
    for (const violation of violations) {
      console.log('');
      console.log(`ERROR: ${violation.rule}`);
      if (violation.detail) console.log(`   ${violation.detail}`);
      if (violation.files) violation.files.forEach((line) => console.log(line));
    }
    console.log('');
    console.log('BUILD FAILED. Remediate the architectural violations above.');
  }

  return violations.length === 0 ? 0 : 1;
}

process.exit(runNodeVerifier());
