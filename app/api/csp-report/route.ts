import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// CSP violation collector. Browsers POST here when a directive fires —
// either the legacy `application/csp-report` shape (report-uri) or the
// newer `application/reports+json` envelope wrapping a `csp-violation`
// (Reporting API / report-to).
//
// We surface violations to Sentry as a categorical message so dashboards
// can group by directive (`script-src`, `frame-src`, etc.) and filter by
// the blocked origin. Tagging by violatedDirective is intentionally
// low-cardinality; the URLs and document path go in extras.
//
// Without this endpoint, CSP failures are silent — operators can't see
// what new third-party origins broke after a deploy. The cost is a
// handful of extra ingest events per day at most; spam from automated
// scanners is rate-limited at Sentry.

type LegacyReport = {
  'csp-report'?: {
    'document-uri'?: string;
    referrer?: string;
    'violated-directive'?: string;
    'effective-directive'?: string;
    'original-policy'?: string;
    disposition?: string;
    'blocked-uri'?: string;
    'status-code'?: number;
    'script-sample'?: string;
  };
};

type ModernReport = {
  type?: string;
  age?: number;
  url?: string;
  user_agent?: string;
  body?: {
    documentURL?: string;
    referrer?: string;
    blockedURL?: string;
    effectiveDirective?: string;
    originalPolicy?: string;
    sourceFile?: string;
    sample?: string;
    disposition?: 'enforce' | 'report';
    statusCode?: number;
    lineNumber?: number;
    columnNumber?: number;
  };
};

type Normalized = {
  directive: string;
  blocked: string;
  document: string;
  disposition: string;
  sample?: string;
};

function normalizeModern(envelope: ModernReport): Normalized | null {
  if (envelope.type !== 'csp-violation' || !envelope.body) return null;
  return {
    directive: envelope.body.effectiveDirective ?? 'unknown',
    blocked: envelope.body.blockedURL ?? 'unknown',
    document: envelope.body.documentURL ?? 'unknown',
    disposition: envelope.body.disposition ?? 'enforce',
    sample: envelope.body.sample,
  };
}

function normalize(payload: LegacyReport | ModernReport[] | ModernReport): Normalized[] {
  // Modern Reporting API batches multiple report envelopes per POST.
  // Extract every csp-violation in the batch — losing all-but-first is
  // a bug because a single page can fire many violations at once.
  if (Array.isArray(payload)) {
    return payload.map(normalizeModern).filter((r): r is Normalized => r !== null);
  }
  if ('type' in payload) {
    const single = normalizeModern(payload);
    return single ? [single] : [];
  }
  if ('csp-report' in payload && payload['csp-report']) {
    const r = payload['csp-report'];
    return [
      {
        directive: r['effective-directive'] ?? r['violated-directive'] ?? 'unknown',
        blocked: r['blocked-uri'] ?? 'unknown',
        document: r['document-uri'] ?? 'unknown',
        disposition: r.disposition ?? 'enforce',
        sample: r['script-sample'],
      },
    ];
  }
  return [];
}

export async function POST(req: Request) {
  // try/finally ensures the captureMessage below ships before serverless
  // freeze. CSP reports have no retry loop — if we drop them, we never
  // see what's breaking. flush() is a no-op when nothing is queued, so
  // the malformed-payload path pays no latency.
  try {
    let payload: unknown;
    try {
      payload = await req.json();
    } catch {
      // Some browsers send malformed JSON for very early violations.
      // Ignore — we'd just spam Sentry with parse errors.
      return new NextResponse(null, { status: 204 });
    }

    const reports = normalize(payload as LegacyReport | ModernReport | ModernReport[]);
    for (const report of reports) {
      Sentry.captureMessage(`[csp] ${report.directive} blocked ${report.blocked}`, {
        level: report.disposition === 'enforce' ? 'warning' : 'info',
        tags: {
          kind: 'csp-violation',
          directive: report.directive,
          disposition: report.disposition,
        },
        extra: {
          blocked: report.blocked,
          document: report.document,
          sample: report.sample,
        },
      });
    }

    // 204 because the spec says to return No Content for report endpoints.
    return new NextResponse(null, { status: 204 });
  } finally {
    await Sentry.flush(2000);
  }
}
