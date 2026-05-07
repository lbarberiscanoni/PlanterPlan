import { describe, it, expect } from 'vitest';
import en from '@/shared/i18n/locales/en.json';

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
interface JsonObject {
  [key: string]: JsonValue;
}

const REQUIRED_NAMESPACES = [
  'common',
  'nav',
  'onboarding',
  'auth',
  'tasks',
  'activity',
  'projects',
  'library',
  'settings',
  'notifications',
  'errors',
  'ics',
  'gantt',
  'admin',
] as const;

describe('en.json', () => {
  it('has every required namespace', () => {
    for (const ns of REQUIRED_NAMESPACES) {
      expect(en).toHaveProperty(ns);
    }
  });

  it('no empty string values', () => {
    const walk = (obj: JsonObject, path: string[] = []): void => {
      for (const [k, v] of Object.entries(obj)) {
        const keyPath = [...path, k].join('.');
        if (typeof v === 'string') {
          expect(v.length, keyPath).toBeGreaterThan(0);
        } else if (v && typeof v === 'object' && !Array.isArray(v)) {
          walk(v as JsonObject, [...path, k]);
        }
      }
    };
    walk(en as JsonObject);
  });

  it('does not expose stale Gantt coming soon copy', () => {
    const root = en as JsonObject;
    const projectGantt = (root.projects as JsonObject).gantt as JsonObject;
    const routeGantt = root.gantt as JsonObject;

    expect(projectGantt).not.toHaveProperty('pdf_coming_soon');
    expect(JSON.stringify(projectGantt).toLowerCase()).not.toContain('coming soon');
    expect(JSON.stringify(routeGantt).toLowerCase()).not.toContain('coming soon');
    expect(JSON.stringify(root).toLowerCase()).not.toContain('coming soon');
  });

  it('every plural `_one` key has a matching `_other` sibling', () => {
    const walk = (obj: JsonObject): void => {
      const keys = Object.keys(obj);
      for (const k of keys) {
        if (k.endsWith('_one')) {
          const stem = k.slice(0, -'_one'.length);
          expect(keys, `${stem}_other`).toContain(`${stem}_other`);
        }
        const v = obj[k];
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          walk(v as JsonObject);
        }
      }
    };
    walk(en as JsonObject);
  });
});
