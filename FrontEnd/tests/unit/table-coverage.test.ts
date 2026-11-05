import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';

it('routes every data table through the shared controls and supplies column headers', () => {
  const walk = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)]);
  const bypasses: string[] = [], missingHeaders: string[] = [];
  let shared = 0;
  for (const file of walk('src').filter(file => file.endsWith('.tsx'))) {
    const ast = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node: ts.Node) => {
      if (ts.isJsxElement(node)) {
        const tag = node.openingElement.tagName.getText(ast);
        if (tag === 'table' && !file.replaceAll('\\', '/').endsWith('components/table/DataTable.tsx')) bypasses.push(file);
        if (tag === 'DataTable' || tag === 'UniversalTable') {
          shared++;
          let hasHead = false;
          const findHead = (child: ts.Node) => { if (ts.isJsxOpeningElement(child) && child.tagName.getText(ast) === 'thead') hasHead = true; ts.forEachChild(child, findHead); };
          ts.forEachChild(node, findHead);
          if (!hasHead) missingHeaders.push(file);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
  expect(bypasses).toEqual([]);
  expect(missingHeaders).toEqual([]);
  expect(shared).toBeGreaterThan(100);
});
