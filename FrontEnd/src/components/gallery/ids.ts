// src/components/gallery/ids.ts
// Every Gallery item: its ID, its title and the section that shows it. Screens are designed from these IDs. FS Sprint
// reads this list as data when it packs the template, so keep one item per line in exactly this form, with plain
// string literals (no quotes inside a title).

export const GALLERY_SECTIONS = ['Fields', 'Dialogs and panels', 'Feedback', 'Reports', 'Layouts', 'Dashboard', 'Templates'] as const;

export interface GalleryItem { id: string; title: string; section: string }

export const GALLERY_ITEMS: GalleryItem[] = [
  { id: 'F-text', title: 'text', section: 'Fields' },
  { id: 'F-code', title: 'code', section: 'Fields' },
  { id: 'F-integer', title: 'integer', section: 'Fields' },
  { id: 'F-amount', title: 'amount', section: 'Fields' },
  { id: 'F-decimal', title: 'decimal', section: 'Fields' },
  { id: 'F-date', title: 'date', section: 'Fields' },
  { id: 'F-dateRange', title: 'dateRange', section: 'Fields' },
  { id: 'F-period', title: 'period', section: 'Fields' },
  { id: 'F-select', title: 'select', section: 'Fields' },
  { id: 'F-suggest', title: 'suggest', section: 'Fields' },
  { id: 'F-multiSelect', title: 'multiSelect', section: 'Fields' },
  { id: 'F-flag', title: 'flag', section: 'Fields' },
  { id: 'F-toggle', title: 'toggle', section: 'Fields' },
  { id: 'F-segmented', title: 'segmented', section: 'Fields' },
  { id: 'F-textarea', title: 'textarea', section: 'Fields' },
  { id: 'F-file', title: 'file', section: 'Fields' },
  { id: 'F-display', title: 'display', section: 'Fields' },
  { id: 'D-form', title: 'Form dialog', section: 'Dialogs and panels' },
  { id: 'D-confirm', title: 'Confirm dialog', section: 'Dialogs and panels' },
  { id: 'D-delete', title: 'Delete confirm', section: 'Dialogs and panels' },
  { id: 'D-review', title: 'Review changes', section: 'Dialogs and panels' },
  { id: 'D-valuehelp', title: 'Value help (F4)', section: 'Dialogs and panels' },
  { id: 'D-object', title: 'Object dialog', section: 'Dialogs and panels' },
  { id: 'D-drawer', title: 'Side drawer', section: 'Dialogs and panels' },
  { id: 'D-popover', title: 'Popover', section: 'Dialogs and panels' },
  { id: 'D-upload', title: 'Upload and preview', section: 'Dialogs and panels' },
  { id: 'D-wizard', title: 'Wizard progress and sections', section: 'Dialogs and panels' },
  { id: 'D-transaction', title: 'TRM transaction link', section: 'Dialogs and panels' },
  { id: 'B-toast', title: 'Toast', section: 'Feedback' },
  { id: 'B-notice', title: 'Notice', section: 'Feedback' },
  { id: 'B-empty', title: 'Empty state', section: 'Feedback' },
  { id: 'B-loading', title: 'Loading', section: 'Feedback' },
  { id: 'B-badges', title: 'Badges and status', section: 'Feedback' },
  { id: 'F-row-styles', title: 'Report row styles', section: 'Reports' },
  { id: 'B-drill-from', title: 'Opened from', section: 'Reports' },
  { id: 'B-report-overview', title: 'Report flow overview', section: 'Reports' },
  { id: 'B-report-selection', title: 'Collapsible report selections', section: 'Reports' },
  { id: 'D-layout', title: 'ALV layout', section: 'Layouts' },
  { id: 'B-kpi-tile', title: 'KPI tile', section: 'Dashboard' },
  { id: 'B-charts', title: 'Charts', section: 'Dashboard' },
  { id: 'B-overview', title: 'Portfolio Overview', section: 'Dashboard' },
  { id: 'T-large-list', title: 'Large SAP list', section: 'Templates' },
  { id: 'T-object', title: 'Object page', section: 'Templates' },
  { id: 'T-items', title: 'Header and items', section: 'Templates' },
  { id: 'T-upload', title: 'Upload and preview', section: 'Templates' },
  { id: 'T-report', title: 'Formatted report', section: 'Templates' },
  { id: 'T-line-report', title: 'Line-item report', section: 'Templates' },
  { id: 'T-dashboard', title: 'Dashboard', section: 'Templates' },
  { id: 'T-normal-shell', title: 'Normal theme frame', section: 'Templates' },
  { id: 'T-normal-header', title: 'Normal page header', section: 'Templates' },
  { id: 'T-normal-illustrations', title: 'Normal illustrations', section: 'Templates' },
  { id: 'T-normal-bell', title: 'Normal notification bell', section: 'Templates' },
  { id: 'T-normal-login', title: 'Normal login page', section: 'Templates' },
  { id: 'T-normal-kpi', title: 'Normal KPI cards', section: 'Templates' }
];

/** The listed item for an ID. An ID that is not listed is a mistake in the Gallery sources. */
export function galleryItem(id: string): GalleryItem {
  const item = GALLERY_ITEMS.find(i => i.id === id);
  if (!item) throw new Error(`Gallery item ${id} is not listed in src/components/gallery/ids.ts`);
  return item;
}
