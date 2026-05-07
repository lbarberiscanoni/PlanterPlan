import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const srcRoot = join(process.cwd(), 'src');
const allowedDateEngineRoot = join(srcRoot, 'shared', 'lib', 'date-engine');
const sourceFilePattern = /\.(ts|tsx)$/;
const directDateFnsImportPattern = /(?:(?:from|import)\s+['"]date-fns(?:\/[^'"]*)?['"]|import\s*\(\s*['"]date-fns(?:\/[^'"]*)?['"]\s*\))/;

function collectSourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const path = join(dir, entry);
        const stats = statSync(path);
        if (stats.isDirectory()) return collectSourceFiles(path);
        if (!stats.isFile() || !sourceFilePattern.test(entry)) return [];
        return [path];
    });
}

describe('date-fns architecture boundary', () => {
    it('keeps direct date-fns imports inside shared/lib/date-engine', () => {
        const offenders = collectSourceFiles(srcRoot)
            .filter((file) => !file.startsWith(`${allowedDateEngineRoot}${sep}`))
            .filter((file) => directDateFnsImportPattern.test(readFileSync(file, 'utf8')))
            .map((file) => relative(process.cwd(), file));

        expect(offenders).toEqual([]);
    });
});
