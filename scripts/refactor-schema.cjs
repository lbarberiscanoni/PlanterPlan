const fs = require('fs');

const schemaPath = 'docs/db/schema.sql';
let sql = fs.readFileSync(schemaPath, 'utf8');

// 1. Refactor RLS Policies
const rlsRegex = /CREATE POLICY [^;]+;/g;
sql = sql.replace(rlsRegex, (match) => {
    return match
        .replace(/\(\s*SELECT\s+"auth"\."uid"\(\)\s+AS\s+"uid"\s*\)/g, `(SELECT (auth.jwt() ->> 'sub')::uuid)`)
        .replace(/"auth"\."uid"\(\)/g, `(SELECT (auth.jwt() ->> 'sub')::uuid)`)
        .replace(/auth\.uid\(\)/g, `(SELECT (auth.jwt() ->> 'sub')::uuid)`);
});

// 2. Harden SECURITY DEFINER functions
const functionDefinitions = sql.split('CREATE OR REPLACE FUNCTION');
for (let i = 1; i < functionDefinitions.length; i++) {
    let func = functionDefinitions[i];
    if (func.includes('SECURITY DEFINER')) {
        // Replace existing public path
        func = func.replace(/SET\s+"search_path"\s+TO\s+'public'/g, `SET "search_path" TO ''`);
        func = func.replace(/SET\s+search_path\s+TO\s+'public'/g, `SET "search_path" TO ''`);
        
        // If it doesn't have the empty path now, inject it
        if (!func.includes(`SET "search_path" TO ''`) && !func.includes(`SET search_path TO ''`)) {
             func = func.replace(/SECURITY DEFINER/, `SECURITY DEFINER\n    SET "search_path" TO ''`);
        }
    }
    functionDefinitions[i] = func;
}
sql = functionDefinitions.join('CREATE OR REPLACE FUNCTION');

fs.writeFileSync(schemaPath, sql);
console.log('Schema refactoring complete.');
