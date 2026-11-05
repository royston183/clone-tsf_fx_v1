// src/components/gallery/TemplatesSection.tsx
import { Link } from '@/lib/client/nav';
import { resolveTrail } from '@/config/catalog';
import { ILLUSTRATIONS, Illustration } from '@/components/normal/Illustration';
import { NormalLoginView } from '@/components/normal/NormalLoginView';
import { KpiCard } from '@/components/normal/KpiCard';
import { NormalNavbar } from '@/components/normal/NormalNavbar';
import { NormalSidebar } from '@/components/normal/NormalSidebar';
import { NotificationBell } from '@/components/normal/NotificationBell';
import { PageHeader } from '@/components/normal/PageHeader';
import { galleryItem } from './ids';

const TEMPLATES = [
  { id: 'T-large-list', note: 'Server paging, search, typed filters and sorting by SAP (2,000 sample deals).', href: '/samples/deals', open: 'Open the list' },
  { id: 'T-object', note: 'A row opens as a pop-up: display, edit with items, create, delete and actions; ?open= links.', href: '/samples/deals?open=0000010001', open: 'Open deal 0000010001' },
  { id: 'T-items', note: 'A selection bar, an editable grid with paste and F4, totals per currency.', href: '/samples/monthly-amounts', open: 'Open monthly amounts' },
  { id: 'T-upload', note: 'An .xlsx or .csv file checked row by row on the server, then posted at once.', href: '/samples/budget-upload', open: 'Open budget upload' },
  { id: 'T-report', note: 'SAP builds the rows and their styles; breakdown pop-ups and drill to another screen, all in the URL.', href: '/samples/liquidity-statement?s.company=1000&s.month=01&s.year=2026', open: 'Open the Liquidity Statement' },
  { id: 'T-line-report', note: 'Flat SAP lines arranged by ALV layouts (shared and personal), subtotals per currency, Excel and CSV export.', href: '/samples/cash-flow-lines?s.month=01&s.year=2026', open: 'Open the Cash Flow Lines' },
  { id: 'T-dashboard', note: 'KPI tiles with limits and RAG, trend charts with a range switch, a summary with inline drill; tiles open the reports.', href: '/samples/treasury-overview?s.company=1000&s.month=01&s.year=2026', open: 'Open the Treasury Overview' }
];

const normalTitle = (id: string) => <h3><span className="kit-id">{id}</span>{galleryItem(id).title}</h3>;

/** The Normal theme's frame and page parts, drawn in its own look (Normal CSS applies under data-app-theme). */
function NormalTemplates() {
  const { page, trail } = resolveTrail(['settings', 'appearance']);
  return <>
    <article className="panel kit-gallery-item kit-gallery-wide" data-gallery-id="T-normal-shell">
      {normalTitle('T-normal-shell')}
      <p className="muted">APP_THEME 'normal': the LAS navbar, and the sidebar rail that opens on hover or keyboard focus (a menu button and backdrop at 750 px and below).</p>
      <div data-app-theme="normal" className="nt-preview">
        <NormalNavbar page={page} trail={trail} navOpen={false} onToggleNav={() => {}} />
        <div className="nt-app-body nt-nav-collapsed"><NormalSidebar activeId="settings/appearance" open={false} onNavigate={() => {}} onClose={() => {}} /></div>
      </div>
    </article>
    <article className="panel kit-gallery-item kit-gallery-wide" data-gallery-id="T-normal-header">
      {normalTitle('T-normal-header')}
      <p className="muted">Every Normal page opens with it: breadcrumb, title, description, actions and the node's illustration.</p>
      <div data-app-theme="normal" className="nt-preview">
        <PageHeader trail={trail} title="Appearance" description="Choose the light or dark workspace." illustration="processing" actions={<button className="button secondary">Action</button>} />
      </div>
    </article>
    <article className="panel kit-gallery-item kit-gallery-wide" data-gallery-id="T-normal-illustrations">
      {normalTitle('T-normal-illustrations')}
      <p className="muted">The 13 pictures a catalogue node can name as its illustration.</p>
      <div data-app-theme="normal" className="nt-preview nt-illo-grid">
        {ILLUSTRATIONS.map(name => <figure key={name}><Illustration name={name} size={120} /><figcaption>{name}</figcaption></figure>)}
      </div>
    </article>
    <article className="panel kit-gallery-item kit-gallery-wide" data-gallery-id="T-normal-bell">
      {normalTitle('T-normal-bell')}
      <p className="muted">The navbar's bell: a count on the icon and a panel of what the shell holds; an item with a link opens it. Sample entries here.</p>
      <div data-app-theme="normal" className="nt-preview nt-bell-preview">
        <NotificationBell defaultOpen items={[
          { id: 'g1', tone: 'pending', title: 'Upload is waiting for you', detail: 'Budget upload', at: '30 Oct' },
          { id: 'g2', tone: 'approved', title: 'Deal 0000010001 saved', at: '29 Oct' }
        ]} />
      </div>
    </article>
    <article className="panel kit-gallery-item kit-gallery-wide" data-gallery-id="T-normal-login">
      {normalTitle('T-normal-login')}
      <p className="muted">The sign-in page: blue pitch with the app's texts, and the card with captcha. Typing here does nothing.</p>
      <div data-app-theme="normal" className="nt-preview">
        <NormalLoginView footnote="Workspace login" initialCaptcha="AB3D5" />
      </div>
    </article>
    <article className="panel kit-gallery-item kit-gallery-wide" data-gallery-id="T-normal-kpi">
      {normalTitle('T-normal-kpi')}
      <p className="muted">A headline figure with its label, caption and icon; the tone colours the dot, the icon tile and the rail. One card can be featured.</p>
      <div data-app-theme="normal" className="nt-preview">
        <div className="nt-stats">
          <KpiCard title="Open deals" value="1,284" caption="Across 12 facilities" icon="deals" featured />
          <KpiCard title="Settled" value="₹ 4.2 Cr" caption="This month" icon="payments" tone="green" />
          <KpiCard title="Awaiting approval" value="17" caption="Oldest 3 days" icon="approvals" tone="amber" />
          <KpiCard title="Overdue" value="3" caption="Needs attention" icon="collections" tone="red" />
        </div>
      </div>
    </article>
  </>;
}

/** The page templates (sub-projects 2 and 3), each with a sample module on mock data, and the Normal theme's parts. */
export function TemplatesSection() {
  return (
    <section className="kit-gallery" aria-labelledby="g-templates"><h2 id="g-templates">Templates</h2>
      <div className="kit-gallery-grid">{TEMPLATES.map(t => (
        <article key={t.id} className="panel kit-gallery-item" data-gallery-id={t.id}>
          <h3><span className="kit-id">{t.id}</span>{galleryItem(t.id).title}</h3>
          <p className="muted">{t.note}</p>
          {import.meta.env.MODE === 'test' && <div className="kit-row"><Link className="button secondary" href={t.href}>{t.open}</Link></div>}
        </article>
      ))}<NormalTemplates /></div>
    </section>
  );
}
