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
    match: /^\/(?:market|swap|trade|approvals|decision-log)/,
    meta: {
      title: "Decision Log",
      description: "Proposal creation, guard checks, approvals, execution readiness, and operator activity in one view.",
      eyebrow: "Decision Control",
    },
  },
  {
    match: /^\/strategy-lab/,
    meta: {
      title: "Strategy Studio",
      description: "Risk, allocation, and portfolio signals for operator review.",
      eyebrow: "Strategy Studio",
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
