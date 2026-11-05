import { lazy, type ComponentType } from 'react';
import { refPage } from '@/ref/RefHost';
import type { CatalogNode } from '@/config/catalog';

export interface CustomPageProps {
  node: CatalogNode;
  trail: CatalogNode[];
}

/** Catalogue `page` id -> React component (including React.lazy components).
 * Register user-requested layouts here; the workspace still provides login, navigation and theme.
 * Page components can compose shared controls, module screens and their own scoped CSS.
 */
export const CUSTOM_PAGES: Record<string, ComponentType<CustomPageProps>> = {
  planned: lazy(() => import('./planned/PlannedPage')),
  'manage-tradeflows': lazy(() => import('./manage-tradeflows/ManageTradeflowsPage')),
  'fx-blotter': lazy(() => import('./fx-blotter/FxBlotterPage')),
  'trader-workbench': lazy(() => import('./trader-workbench/TraderWorkbenchPage')),
  'deal-confirmation': lazy(() => import('./deal-confirmation/DealConfirmationPage')),
  'execute-settlement': lazy(() => import('./execute-settlement/ExecuteSettlementPage')),
  'ref-limit-management': lazy(() => import('@/ref/features/limit-management/index.tsx').then(m => ({ default: refPage(m.default, { office: false }) }))),
  'ref-mo-confirm-master-contract': lazy(() => import('@/ref/features/mo-confirm-master-contract/index.tsx').then(m => ({ default: refPage(m.default, { office: false }) }))),
  'ref-mo-update-mc-expiry': lazy(() => import('@/ref/features/mo-update-mc-expiry/index.tsx').then(m => ({ default: refPage(m.default, { office: false }) }))),
  'ref-fo-mc-error-correction': lazy(() => import('@/ref/features/fo-mc-error-correction/index.tsx').then(m => ({ default: refPage(m.default, { office: false }) }))),
  'ref-mo-reject-mc-after-expiry': lazy(() => import('@/ref/features/mo-reject-mc-after-expiry/index.tsx').then(m => ({ default: refPage(m.default, { office: false }) }))),
  'ref-short-straddle-deal-id': lazy(() => import('@/ref/features/short-straddle-deal-id/index.tsx').then(m => ({ default: refPage(m.default, { office: false }) }))),
  'ref-fo-fx-error-correction': lazy(() => import('@/ref/features/fo-fx-error-correction/index.tsx').then(m => ({ default: refPage(m.default, { office: false }) }))),
  'ref-fo-change-deal-id': lazy(() => import('@/ref/features/fo-change-deal-id/index.tsx').then(m => ({ default: refPage(m.default, { office: false }) }))),
  'ref-fo-create-deal-id-manually': lazy(() => import('@/ref/features/fo-create-deal-id-manually/index.tsx').then(m => ({ default: refPage(m.default, { office: false }) }))),
  'ref-fo-early-delivery-unwind-rollover': lazy(() => import('@/ref/features/fo-early-delivery-unwind-rollover/index.tsx').then(m => ({ default: refPage(m.default, { office: false }) }))),
  'ref-fo-additional-spot-booking': lazy(() => import('@/ref/features/fo-additional-spot-booking/index.tsx').then(m => ({ default: refPage(m.default, { office: false }) }))),
  'ref-tsf-ndf-fixing': lazy(() => import('@/ref/features/tsf-ndf-fixing/index.tsx').then(m => ({ default: refPage(m.default, { office: false }) }))),
  'ref-fo-ndf-fixing-error-correction': lazy(() => import('@/ref/features/fo-ndf-fixing-error-correction/index.tsx').then(m => ({ default: refPage(m.default, { office: false }) }))),
  'ref-mo-confirm-ndf-fixing': lazy(() => import('@/ref/features/mo-confirm-ndf-fixing/index.tsx').then(m => ({ default: refPage(m.default, { office: true }) }))),
  'ref-mo-update-bank-reference': lazy(() => import('@/ref/features/mo-update-bank-reference/index.tsx').then(m => ({ default: refPage(m.default, { office: true }) }))),
  'ref-mo-view-deal-ids-for-confirmation': lazy(() => import('@/ref/features/mo-view-deal-ids-for-confirmation/index.tsx').then(m => ({ default: refPage(m.default, { office: true }) }))),
  'ref-mo-confirm-fx-deal-id': lazy(() => import('@/ref/features/mo-confirm-fx-deal-id/index.tsx').then(m => ({ default: refPage(m.default, { office: true }) }))),
  'ref-mo-confirm-fx-deal-id-ss': lazy(() => import('@/ref/features/mo-confirm-fx-deal-id-ss/index.tsx').then(m => ({ default: refPage(m.default, { office: true }) }))),
  'ref-mo-deal-id-invoice-status': lazy(() => import('@/ref/features/mo-deal-id-invoice-status/index.tsx').then(m => ({ default: refPage(m.default, { office: true }) }))),
  'ref-mo-deal-id-invoice-mark': lazy(() => import('@/ref/features/mo-deal-id-invoice-mark/index.tsx').then(m => ({ default: refPage(m.default, { office: true }) }))),
  'ref-mo-deal-id-invoicing': lazy(() => import('@/ref/features/mo-deal-id-invoicing/index.tsx').then(m => ({ default: refPage(m.default, { office: true }) }))),
  'ref-mo-generate-invoices-deal-id': lazy(() => import('@/ref/features/mo-generate-invoices-deal-id/index.tsx').then(m => ({ default: refPage(m.default, { office: true }) }))),
  'ref-inr-heads-up-reminder': lazy(() => import('@/ref/features/inr-heads-up-reminder/index.tsx').then(m => ({ default: refPage(m.default, { office: true }) }))),
  'ref-mo-view-deal-id-settlement-list': lazy(() => import('@/ref/features/mo-view-deal-id-settlement-list/index.tsx').then(m => ({ default: refPage(m.default, { office: true }) }))),
  'ref-mo-bank-settlement-fx-non-flow': lazy(() => import('@/ref/features/mo-bank-settlement-fx-non-flow/index.tsx').then(m => ({ default: refPage(m.default, { office: true }) }))),
  'ref-bo-post-accounting-settlement': lazy(() => import('@/ref/features/bo-post-accounting-settlement/index.tsx').then(m => ({ default: refPage(m.default, { office: true }) }))),
  'ref-bo-bank-settlement-fx-non-flow': lazy(() => import('@/ref/features/mo-bank-settlement-fx-non-flow/index.tsx').then(m => ({ default: refPage(m.default, { office: true }) }))),
  'ref-view-spot-forward-settlement': lazy(() => import('@/ref/features/view-spot-forward-settlement/index.tsx').then(m => ({ default: refPage(m.default, { office: true }) }))),
  'ref-tbb1-post-flows': lazy(() => import('@/ref/features/tbb1-post-flows/index.tsx').then(m => ({ default: refPage(m.default, { office: true }) }))),
  'ref-bo-deal-rejection': lazy(() => import('@/ref/features/bo-deal-rejection/index.tsx').then(m => ({ default: refPage(m.default, { office: true }) }))),
  'ref-fx-ndf-settlement': lazy(() => import('@/ref/features/fx-ndf-settlement/index.tsx').then(m => ({ default: refPage(m.default, { office: true }) }))),
  'ref-post-fx-mtm-oil-dmcc': lazy(() => import('@/ref/features/post-fx-mtm-oil-dmcc/index.tsx').then(m => ({ default: refPage(m.default, { office: true }) }))),
  'ref-post-fx-mtm-other-origins': lazy(() => import('@/ref/features/post-fx-mtm-other-origins/index.tsx').then(m => ({ default: refPage(m.default, { office: true }) }))),
  'ref-fx-mtm-external-tsf-deals': lazy(() => import('@/ref/features/fx-mtm-external-tsf-deals/index.tsx').then(m => ({ default: refPage(m.default, { office: true }) }))),
  'ref-bo-reverse-fx-mtm-oil-dmcc': lazy(() => import('@/ref/features/bo-reverse-fx-mtm-oil-dmcc/index.tsx').then(m => ({ default: refPage(m.default, { office: true }) }))),
  'ref-bo-reverse-fx-mtm-other-origins': lazy(() => import('@/ref/features/bo-reverse-fx-mtm-other-origins/index.tsx').then(m => ({ default: refPage(m.default, { office: true }) }))),
  'ref-bo-reverse-fx-mtm-india': lazy(() => import('@/ref/features/bo-reverse-fx-mtm-india/index.tsx').then(m => ({ default: refPage(m.default, { office: true }) }))),
  'ref-view-all-transactions': lazy(() => import('@/ref/features/view-all-transactions/index.tsx').then(m => ({ default: refPage(m.default, { office: false }) }))),
  'ref-deal-id-details': lazy(() => import('@/ref/features/fo-deal-id-details/index.tsx').then(m => ({ default: refPage(m.default, { office: false }) })))
};
