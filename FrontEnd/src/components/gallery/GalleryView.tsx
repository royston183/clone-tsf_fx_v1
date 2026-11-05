// src/components/gallery/GalleryView.tsx
import { DashboardSection } from './DashboardSection';
import { DialogsSection } from './DialogsSection';
import { FeedbackSection } from './FeedbackSection';
import { FieldsSection } from './FieldsSection';
import { LayoutsSection } from './LayoutsSection';
import { ReportsSection } from './ReportsSection';
import { TemplatesSection } from './TemplatesSection';

/** Developer-only catalogue of approved UI pieces. Designs refer to items by their ID (F-amount, D-form, B-toast). */
export function GalleryView() {
  return (
    <div className="kit-gallery">
      <section className="panel" style={{ padding: 16 }}>
        <h2>UI Gallery</h2>
        <p className="muted">Every field, dialog and feedback piece this template offers, with sample data (never SAP). New screens are designed from these IDs and approved here before any SAP work.</p>
      </section>
      <FieldsSection />
      <DialogsSection />
      <FeedbackSection />
      <ReportsSection />
      <LayoutsSection />
      <DashboardSection />
      <TemplatesSection />
    </div>
  );
}
