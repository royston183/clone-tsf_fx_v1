// tests/unit/gallery-ids.test.ts
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GALLERY_ITEMS, GALLERY_SECTIONS, galleryItem } from '@/components/gallery/ids';
import { FIELD_SAMPLES } from '@/components/gallery/samples';

const DIR = 'src/components/gallery';
const sources = readdirSync(DIR).filter(name => /\.tsx?$/.test(name) && name !== 'ids.ts').map(name => ({ file: name, text: readFileSync(join(DIR, name), 'utf8') }));
const PATTERNS = [/data-gallery-id="([^"]+)"/g, /<Item id="([^"]+)"/g, /\{ id: '([FDBT]-[\w-]+)'/g];
const idsIn = (text: string) => PATTERNS.flatMap(pattern => [...text.matchAll(pattern)].map(m => m[1]));

describe('Gallery id list', () => {
  it('lists every Gallery item in the sources, and nothing else', () => {
    const found = [...new Set(sources.flatMap(s => idsIn(s.text)))].sort();
    expect(found.length).toBeGreaterThan(40);
    expect(GALLERY_ITEMS.map(item => item.id).sort()).toEqual(found);
  });
  it('has unique ids, known sections and plain titles', () => {
    expect(new Set(GALLERY_ITEMS.map(item => item.id)).size).toBe(GALLERY_ITEMS.length);
    for (const item of GALLERY_ITEMS) {
      expect(item.id).toMatch(/^[FDBT]-[A-Za-z0-9-]+$/);
      expect(GALLERY_SECTIONS, item.id).toContain(item.section);
      expect(item.title, item.id).toMatch(/^[^'"\r\n]+$/);
    }
  });
  it('puts each item in the section that shows it', () => {
    for (const { file, text } of sources) {
      const heading = /<h2 id="g-[\w-]+">([^<]+)<\/h2>/.exec(text)?.[1];
      if (!heading) continue;
      expect(GALLERY_SECTIONS, file).toContain(heading);
      for (const id of idsIn(text)) expect(galleryItem(id).section, `${file} ${id}`).toBe(heading);
    }
    for (const sample of FIELD_SAMPLES) expect(galleryItem(sample.id).section).toBe('Fields');
  });
  it('fails loudly for an id that is not listed', () => {
    expect(() => galleryItem('F-unknown')).toThrow('F-unknown');
  });
});
