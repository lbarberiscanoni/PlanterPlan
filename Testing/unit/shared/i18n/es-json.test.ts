import { describe, it, expect } from 'vitest';
import { SUPPORTED_LOCALES } from '@/shared/i18n';
import en from '@/shared/i18n/locales/en.json';
import es from '@/shared/i18n/locales/es.json';

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
interface JsonObject {
  [key: string]: JsonValue;
}

describe('es.json', () => {
  it('has every namespace and key from en.json', () => {
    const walk = (a: JsonObject, b: JsonObject, path: string[] = []): void => {
      for (const k of Object.keys(a)) {
        if (k === '_meta') continue;
        const fullPath = [...path, k].join('.');
        expect(b, fullPath).toHaveProperty(k);
        const av = a[k];
        const bv = b[k];
        expect(typeof bv, `${fullPath} type mismatch`).toBe(typeof av);
        if (av && typeof av === 'object' && !Array.isArray(av)) {
          walk(av as JsonObject, bv as JsonObject, [...path, k]);
        }
      }
    };
    walk(en as JsonObject, es as JsonObject);
  });

  it('has _meta with review_required_before_marketing flag', () => {
    const esRoot = es as JsonObject;
    expect(esRoot._meta).toBeDefined();
    const meta = esRoot._meta as JsonObject;
    expect(meta.review_required_before_marketing).toBe(true);
    expect(typeof meta.status).toBe('string');
    expect(typeof meta.translated_against_en_version).toBe('string');
  });

  it('keeps Spanish runtime metadata gated until human review clears marketing readiness', () => {
    const meta = (es as JsonObject)._meta as JsonObject;
    const spanishLocale = SUPPORTED_LOCALES.find((locale) => locale.code === 'es');

    expect(spanishLocale).toMatchObject({
      code: 'es',
      launchStatus: 'review_required',
      marketingReady: false,
      reviewRequiredBeforeMarketing: meta.review_required_before_marketing,
    });
  });

  it('no empty string values outside _meta', () => {
    const walk = (obj: JsonObject, path: string[] = []): void => {
      for (const [k, v] of Object.entries(obj)) {
        if (path.length === 0 && k === '_meta') continue;
        const keyPath = [...path, k].join('.');
        if (typeof v === 'string') {
          expect(v.length, keyPath).toBeGreaterThan(0);
        } else if (v && typeof v === 'object' && !Array.isArray(v)) {
          walk(v as JsonObject, [...path, k]);
        }
      }
    };
    walk(es as JsonObject);
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
    walk(es as JsonObject);
  });

  it('preserves interpolation markers and HTML tags from en.json', () => {
    const walk = (enObj: JsonObject, esObj: JsonObject): void => {
      for (const k of Object.keys(enObj)) {
        if (k === '_meta') continue;
        const enVal = enObj[k];
        const esVal = esObj[k];
        if (typeof enVal === 'string' && typeof esVal === 'string') {
          const interpolations = enVal.match(/\{\{[^}]+\}\}/g) ?? [];
          for (const marker of interpolations) {
            expect(esVal, `${k}: missing ${marker}`).toContain(marker);
          }
          const htmlTags = enVal.match(/<\/?[a-z][^>]*>/gi) ?? [];
          for (const tag of htmlTags) {
            expect(esVal, `${k}: missing ${tag}`).toContain(tag);
          }
        } else if (enVal && typeof enVal === 'object' && !Array.isArray(enVal)) {
          walk(enVal as JsonObject, esVal as JsonObject);
        }
      }
    };
    walk(en as JsonObject, es as JsonObject);
  });
});
