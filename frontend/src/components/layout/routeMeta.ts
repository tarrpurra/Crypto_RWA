export type RouteMeta = {
  title: string;
  description: string;
  eyebrow: string;
};

const routeMeta: Array<{ match: RegExp; meta: RouteMeta }> = [
  {
    match: /^\/$/,
    meta: {
      title: "Dashboard",
      description: "Portfolio state, risk posture, market freshness, and agent readiness.",
      eyebrow: "RWA Agent",
    },
  },
  {
    match: /^\/portfolio/,
    meta: {
      title: "Portfolio",
      description: "Current holdings, valuation quality, target drift, and snapshot history.",
      eyebrow: "Analytics",
    },
  },
  {
    match: /^\/risk/,
    meta: {
      title: "Risk Center",
      description: "Hard vetoes, score buckets, approval requirements, and recent assessments.",
      eyebrow: "Risk Engine",
    },
  },
  {
    match: /^\/allocation/,
    meta: {
      title: "Allocation",
      description: "Target profiles, recommendation rationale, and rebalance intent.",
      eyebrow: "Allocation Engine",
    },
  },
  {
    match: /^\/market/,
    meta: {
      title: "Market",
      description: "Oracle freshness, route quotes, ingestion health, and data provenance.",
      eyebrow: "Market Data",
    },
  },
  {
    match: /^\/approvals/,
    meta: {
      title: "Approvals",
      description: "Proposal queue, human review gates, and execution context.",
      eyebrow: "Human Review",
    },
  },
  {
    match: /^\/settings/,
    meta: {
      title: "Settings",
      description: "Manage environment visibility, diagnostics, and integration settings.",
      eyebrow: "Operations",
    },
  },
];

const fallbackMeta: RouteMeta = {
  title: "RWA Agent",
  description: "AIxRWA advisory dashboard",
  eyebrow: "RWA Agent",
};

export function getRouteMeta(pathname: string): RouteMeta {
  return routeMeta.find((item) => item.match.test(pathname))?.meta ?? fallbackMeta;
}
