// src/components/gallery/FeedbackSection.tsx
import { useState } from 'react';
import { AlertCircle, Info } from 'lucide-react';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Loading } from '@/components/ui/Loading';
import { Notice } from '@/components/ui/Notice';
import { Toast, useToast } from '@/components/ui/Toast';
import { galleryItem } from './ids';

export function FeedbackSection() {
  const [toast, notify] = useToast();
  const [retried, setRetried] = useState(0);
  return (
    <section className="kit-gallery" aria-labelledby="g-feedback"><h2 id="g-feedback">Feedback</h2>
      <div className="kit-gallery-grid">
        <article className="panel kit-gallery-item" data-gallery-id="B-toast"><h3><span className="kit-id">B-toast</span>{galleryItem('B-toast').title}</h3>
          <div className="kit-row"><button className="button" onClick={() => notify('3 entries saved', 'success')}>Success</button><button className="button secondary" onClick={() => notify('SAP rejected the changes', 'error')}>Error</button></div></article>
        <article className="panel kit-gallery-item" data-gallery-id="B-notice"><h3><span className="kit-id">B-notice</span>{galleryItem('B-notice').title}</h3>
          <Notice><Info size={16} />Showing period 04-2026.</Notice>
          <Notice kind="warn">Two rows were skipped.</Notice>
          <Notice error action={{ label: `Retry${retried ? ` (${retried})` : ''}`, onClick: () => setRetried(n => n + 1) }}><AlertCircle size={16} />SAP is not reachable.</Notice></article>
        <article className="panel kit-gallery-item" data-gallery-id="B-empty"><h3><span className="kit-id">B-empty</span>{galleryItem('B-empty').title}</h3><EmptyState title="No entries yet" text="Add the first entry or paste rows from Excel." action={<button className="button">Add</button>} /></article>
        <article className="panel kit-gallery-item" data-gallery-id="B-loading"><h3><span className="kit-id">B-loading</span>{galleryItem('B-loading').title}</h3><Loading text="Loading from SAP…" /><Loading shimmer /></article>
        <article className="panel kit-gallery-item" data-gallery-id="B-badges"><h3><span className="kit-id">B-badges</span>{galleryItem('B-badges').title}</h3>
          <div className="kit-row"><Badge tone="neutral">Mock mode</Badge><Badge tone="green">Within limit</Badge><Badge tone="amber">Near limit</Badge><Badge tone="red">Breach</Badge><Badge tone="info">Info</Badge></div>
          <div className="kit-row"><StatusBadge status="create" /><StatusBadge status="update" /><StatusBadge status="invalid" /><StatusBadge status="rejected" /></div></article>
      </div>
      <Toast toast={toast} />
    </section>
  );
}
