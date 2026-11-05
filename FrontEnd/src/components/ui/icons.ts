import { createElement } from 'react';
import {
  AppWindow, ArrowLeftRight, BadgeCheck, Banknote, Bell, BookOpen, Building2, CalendarClock, ChartColumn, Coins, Database, FileBarChart2, FileText,
  FlaskConical, Folder, Gauge, HandCoins, Handshake, Landmark, LayoutDashboard, Network, Palette, Percent, PlugZap, Receipt, ReceiptIndianRupee,
  Scale, ScrollText, Server, Settings, ShieldCheck, Stamp, Table2, TrendingUp, Upload, UserPlus, Users, Vault, Wallet, Workflow, type LucideIcon
} from 'lucide-react';
import type { CatalogNode, IconName } from '@/config/catalog';
import { kindOf, MODULES } from '@/modules/registry';
import type { ModuleKind } from '@/modules/types';

/** Every catalogue icon (IconName) and its lucide icon; no two names share an icon. */
export const ICONS: Record<IconName, LucideIcon> = {
  overview: LayoutDashboard, dashboard: Gauge, reports: FileBarChart2, analytics: ChartColumn, trends: TrendingUp,
  database: Database, settings: Settings, connection: PlugZap, services: Server, appearance: Palette, integrations: Network, workflow: Workflow, notifications: Bell,
  customers: Users, onboarding: UserPlus, kyc: ShieldCheck, approvals: Stamp, verified: BadgeCheck,
  loans: HandCoins, drawdowns: Banknote, collateral: Vault, treasury: Landmark, deals: ArrowLeftRight, cashflow: Coins, collections: Receipt, payments: Wallet,
  fees: ReceiptIndianRupee, interest: Percent,
  accounting: BookOpen, journal: ScrollText, documents: FileText, entries: Table2, upload: Upload, facilities: Building2, counterparties: Handshake, limits: Scale,
  schedule: CalendarClock,
  folder: Folder, application: AppWindow, samples: FlaskConical
};

const BY_KIND: Record<ModuleKind, IconName> = { table: 'database', object: 'documents', items: 'entries', upload: 'upload', report: 'reports', dashboard: 'dashboard' };
const BY_TYPE: Record<CatalogNode['type'], IconName> = { overview: 'overview', folder: 'folder', application: 'application', settings: 'settings' };

/** A node's icon name: its own `icon`, else its module's kind, else its type. */
export function iconNameOf(node: CatalogNode): IconName {
  if (node.icon) return node.icon;
  const def = node.module && Object.hasOwn(MODULES, node.module) ? MODULES[node.module] : undefined;
  return def ? BY_KIND[kindOf(def)] : BY_TYPE[node.type];
}
/** A node's lucide icon. */
export const iconOf = (node: CatalogNode): LucideIcon => ICONS[iconNameOf(node)];
/** A node's icon as an element (rail, tiles, the unavailable-application notice). */
export const NodeIcon = ({ node, size }: { node: CatalogNode; size: number }) => createElement(iconOf(node), { size });
