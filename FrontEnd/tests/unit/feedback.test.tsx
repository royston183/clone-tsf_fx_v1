import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Loading } from '@/components/ui/Loading';
import { Notice } from '@/components/ui/Notice';

describe('feedback components', () => {
  it('Notice keeps the legacy error flag and adds kinds and an action', () => {
    expect(renderToStaticMarkup(<Notice error>x</Notice>)).toContain('class="notice error" role="alert"');
    expect(renderToStaticMarkup(<Notice kind="warn">x</Notice>)).toContain('class="notice td-warn" role="status"');
    expect(renderToStaticMarkup(<Notice action={{ label: 'Retry', onClick: () => {} }}>x</Notice>)).toContain('class="text-button"');
  });
  it('status badges use labelled traffic-light tags', () => {
    expect(renderToStaticMarkup(<Badge tone="green">On track</Badge>)).toContain('kit-status green');
    expect(renderToStaticMarkup(<Badge tone="neutral">Mock</Badge>)).toContain('class="pill"');
    expect(renderToStaticMarkup(<StatusBadge status="invalid" />)).toContain('kit-status red');
  });
  it('empty and loading states', () => {
    expect(renderToStaticMarkup(<EmptyState title="No entries" text="Add the first one." />)).toContain('class="empty"');
    expect(renderToStaticMarkup(<Loading text="Loading from SAP…" />)).toContain('role="status"');
    expect(renderToStaticMarkup(<Loading shimmer />)).toContain('ov-info-shimmer');
  });
});
