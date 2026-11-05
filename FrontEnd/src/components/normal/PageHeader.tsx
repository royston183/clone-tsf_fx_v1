// The top of every Normal page, as its own surface (LAS components/PageHeader.jsx): the page's icon in a blue tile,
// breadcrumb, title, one line on what the page is for, its actions and its illustration.
import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import type { CatalogNode } from '@/config/catalog';
import { NodeIcon } from '@/components/ui/icons';
import { Illustration, type IllustrationName } from './Illustration';

export function PageHeader({ trail, title, description, illustration, actions }: { trail: CatalogNode[]; title: string; description?: string; illustration: IllustrationName; actions?: ReactNode }) {
  const crumbs = ['Workspace', ...trail.map(n => n.title)];
  // The page's own catalogue icon, the one the sidebar shows for it (none on a page that is not in the catalogue).
  const node = trail.at(-1);
  return (
    <header className="nt-page-heading">
      <div className="nt-surface-arches" aria-hidden="true" />
      {node && <span className="nt-page-icon" aria-hidden="true"><NodeIcon node={node} size={22} /></span>}
      <div className="nt-page-heading-text">
        <nav className="nt-breadcrumb" aria-label="Breadcrumb">
          <ol>{crumbs.map((crumb, i) => (
            <li key={i}>{i === crumbs.length - 1 ? <span aria-current="page">{crumb}</span> : <><span>{crumb}</span><ChevronRight size={13} aria-hidden="true" /></>}</li>
          ))}</ol>
        </nav>
        <h1 className="nt-page-title">{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="nt-heading-actions">{actions}</div>}
      <div className="nt-page-illustration"><Illustration name={illustration} size={88} /></div>
    </header>
  );
}
