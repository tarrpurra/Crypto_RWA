export type RouteMeta = {
  title: string;
  description: string;
  eyebrow: string;
};

const routeMeta: Array<{ match: RegExp; meta: RouteMeta }> = [
  {
    match: /^\/(?:dashboard)?$/,
    meta: {
      title: "Dashboard",
      description: "Portfolio state, risk posture, market freshness, and agent readiness.",
      eyebrow: "AIYield",
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
      title: "Allocation Studio",
      description: "Target profiles, recommendation rationale, operator controls, and rebalance intent.",
      eyebrow: "Allocation Engine",
    },
  },
  {
    match: /^\/(?:market|swap|trade)/,
    meta: {
      title: "Trade",
      description: "Proposals, routes, oracle freshness, prices, and ingestion health all in one view.",
      eyebrow: "Market & Trading",
    },
  },
  {
    match: /^\/approvals/,
    meta: {
      title: "Approvals",
      description: "Proposal queue, approval state, execution readiness, and onchain handoff.",
      eyebrow: "Trade Approval",
    },
  },
  {
    match: /^\/strategy-lab/,
    meta: {
      title: "Strategy Lab",
      description: "Risk, allocation, and portfolio signals for operator review.",
      eyebrow: "Strategy Lab",
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
  title: "AIYield",
  description: "AI-powered yield optimization and risk management for RWA portfolios.",
  eyebrow: "AIYield",
};

export function getRouteMeta(pathname: string): RouteMeta {
  return routeMeta.find((item) => item.match.test(pathname))?.meta ?? fallbackMeta;
}
