const { spawnSync } = require('child_process');

console.error("Running TypeScript compiler (Agent Mode)...");
const result = spawnSync('npx', ['tsc', '--noEmit', '--pretty', 'false'], {
    encoding: 'utf-8',
    shell: process.platform === 'win32'
});

if (result.error) {
    console.log(JSON.stringify({
        status: 'ERROR',
        message: `Failed to start TypeScript compiler: ${result.error.message}`
    }, null, 2));
    process.exit(1);
}

if (result.status === 0) {
    console.log(JSON.stringify({ status: 'SUCCESS', message: 'No TypeScript errors found.' }));
    process.exit(0);
}

const stdout = result.stdout || '';
const stderr = result.stderr || '';
const lines = stdout.split('\n');
const errors = [];
let currentError = null;

for (const line of lines) {
    // Match standard tsc output: src/path/to/file.ts(line,col): error TS1234: message...
    const match = line.match(/^(.+?)\((\d+),(\d+)\):\s+(error\s+TS\d+):\s+(.*)/);
    
    if (match) {
        if (currentError) errors.push(currentError);
        currentError = {
            file: match[1],
            line: parseInt(match[2], 10),
            column: parseInt(match[3], 10),
            code: match[4],
            message: match[5],
            details: []
        };
    } else if (currentError && line.trim()) {
        currentError.details.push(line.trim());
    }
}
if (currentError) errors.push(currentError);

// Flatten deeply nested generic constraints for the agent
const flattenedErrors = errors.map(err => {
    // Often, React/Zod type errors cascade for 50+ lines. We cap it to 5 lines for context window sanity.
    const essentialDetails = err.details.slice(0, 5); 
    return {
        ...err,
        simplified_message: err.message.length > 200 ? err.message.substring(0, 200) + '...' : err.message,
        details: essentialDetails,
        fullContextOmitted: err.details.length > 5 ? true : undefined
    };
});

console.log(JSON.stringify({ 
    status: 'FAIL', 
    code: result.status, 
    total_errors: flattenedErrors.length,
    errors: flattenedErrors,
    stderr: stderr.trim() || undefined
}, null, 2));

process.exit(result.status || 1);
