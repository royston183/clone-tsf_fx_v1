import { Suspense } from 'react';
import { CUSTOM_PAGES, type CustomPageProps } from '@/pages/registry';

export function CustomPageView({ node, trail }: CustomPageProps) {
  const Page = node.page && Object.hasOwn(CUSTOM_PAGES, node.page) ? CUSTOM_PAGES[node.page] : undefined;
  if (!Page) return (
    <section className="panel empty">
      <h2>This page is not available yet</h2>
      <p>No custom page is registered for “{node.title}”. Register it in src/pages/registry.ts.</p>
    </section>
  );
  return <Suspense fallback={<section className="panel empty" role="status">Loading page…</section>}><Page node={node} trail={trail} /></Suspense>;
}
