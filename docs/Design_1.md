# Design Plan: AIYield Landing Page

## Design Read

**Page kind:** Landing page (SaaS / DeFi protocol intro) for AIYield RWA platform.
**Audience:** Crypto-native DeFi investors, institutional treasury teams, technical evaluators.
**Vibe:** Dark-tech minimalism with a restrained cyan accent, leaning toward Linear-style clarity with premium consumer polish.
**Dial values:** `VARIANCE: 6, MOTION: 5, DENSITY: 3` — clean asymmetric layouts, restrained motion, airy spacing.

## 1. Color Scheme Map

Extracted from `docs/lP.html` (dark-tech/blue reference) and mapped to the existing project's `index.css` CSS variable tokens (cyan primary, dark mode only for the landing page):

| Token | Light | Dark |
|---|---|---|
| background | — | `222 54% 5%` (near-black) |
| foreground | — | `222 100% 97%` |
| primary (accent) | — | `195 100% 50%` (cyan) |
| muted foreground | — | `220 13% 64%` |
| surface cards | — | `221 42% 9%` |
| border | — | `216 49% 20%` |
| glass bg | — | `rgb(11 18 33 / 0.82)` |

Landing page is **dark-only** — a deliberate choice for the marketing/hero surface. The existing light/dark toggle remains on the dashboard routes.

## 2. Typography

- **Display/Headlines:** Space Grotesk (already in the project via `font-display`)
- **Body/UI:** Inter (already in the project via `font-sans`)
- **Code/Numbers:** JetBrains Mono (already in project via `font-mono`)
- **Serif discipline:** Zero serif fonts. Not justified for this brief.
- **Italic descender clearance:** Audit all italic words with `y g j p q` — apply `leading-[1.1]` + `pb-1`.

## 3. Architecture

### Route
- Landing page at `/` (replace the current Index dashboard)
- Dashboard moves to `/dashboard` (confirm existing route `/dashboard` already points to `Index.tsx`)
- All other dashboard routes remain unchanged (`/risk`, `/trade`, `/allocation`, `/approvals`, `/strategy-lab`, `/settings`)

### Component Tree
```
pages/Landing.tsx                    # "use client" entry (scroll listeners)
├── sections/HeroSection.tsx         # Asymmetric split: left copy + right live mini chart card
├── sections/MetricsBar.tsx          # 4 stat pills, each with inline area sparkline
├── sections/FeatureGrid.tsx         # Asymmetric bento layout with chart-driven feature cells
├── sections/PerformanceChart.tsx    # Full-width protocol performance graph (area chart + annotations)
├── sections/Testimonial.tsx         # Single quote, glass container
├── sections/FinalCta.tsx            # Full-width card with gradient background
├── sections/Footer.tsx              # Simple link row
└── components/WaitlistModal.tsx     # Dialog with form
```

### Stack Decisions
- **Framework:** React 18 (keep existing, no Next.js migration)
- **Styling:** Tailwind v3 (existing project constraint) + CSS variables (existing tokens)
- **Animation:** framer-motion (already a dependency at v12)
- **Icons:** lucide-react (already a dependency — acceptable since project already uses it)
- **Fonts:** Already loaded via Google Fonts in `index.css` — keep existing `@import` but audit for unused weights

**No new packages needed.** The project already has all dependencies. `recharts` (already in `package.json`) will be used for all chart/visual graph components — real rendered SVG charts, not div-based fakes.

## 4. Layout Specifications

### 4.1 Navigation
- Fixed top bar, separate from the dashboard `TopBar`
- 72px height, glass background on scroll
- Left: AIYield wordmark (Space Grotesk)
- Right: nav links (Product, Solutions, Docs) + Login + "Get started" CTA
- Single line at desktop, hamburger below `md:`

### 4.2 Hero Section
- **Layout:** Asymmetric split — 7/12 left (copy) + 5/12 right (visual asset)
- **Max elements:** 4 total in hero — eyebrow + headline + subtext + CTAs
- **No** version labels, no avatar social proof row, no "Joined today" counter
- **Headline:** "AI-powered yield for real-world assets" (single line)
- **Subtext:** max 20 words, max 3 lines
- **CTAs:** "Start 14-day trial" (primary) + "Watch demo" (secondary, ghost)
- **Visual:** Glass card containing a **live-rendered area chart** (recharts `AreaChart`) showing protocol TVL / yield growth over 12 months — gradient fill with cyan, animated on scroll-into-view. This is a real SVG chart, not a div-based fake.
- **Chart details:** Smooth curve (`type="monotone"`), gradient fill under the line, subtle grid lines, axis-free (clean chart, no labels on axes — the curve IS the visual). Tooltip on hover shows mock values.
- **Top padding:** `pt-20` max
- **Mobile:** Stacks to single column, CTA stack vertical

### 4.3 Trust Bar (Below Hero)
- Real SVG logos using `simple-icons` or inline SVG marks for partner brands
- NO "Featured in" label, NO industry labels below logos
- Logos only, opacity 0.6-0.75, horizontal scroll on mobile

### 4.4 Metrics Row
- 4 metric items in a 2x2 grid on mobile, single row on desktop
- Glass / dark card containers with `border` separation, no generic cards
- Values in `font-display` large, labels in small uppercase
- **Each metric card includes a mini inline sparkline** (recharts `AreaChart` at ~120x40px, no axes, no grid, pure cyan gradient curve) — shows a 24-data-point trend for that metric. The sparkline sits to the right of the value or below it on mobile.
- The 4 metrics are: Total Value Locked, Active Strategies, Yield Generated (30d), and Countries Served

### 4.5 Features Section
- **Banned:** 3 equal feature cards
- **Instead:** Asymmetric bento grid (2 large + 1 small, or 1 hero + 3 smaller)
- Each cell has visual variation: at least 2 cells use tinted gradient backgrounds or icon fills
- Feature cards with distinct icon treatments, not all same
- **One feature cell contains a live bar chart** (recharts `BarChart`) comparing something like "yield vs traditional finance" or "allocation across asset classes" — grouped vertical bars with cyan fill, transparent grid, light labels. This replaces the "text-only" feature cell with a real data visualization that communicates the value proposition visually.

### 4.6 Performance Chart Section
- **Purpose:** A full-width visual section between features and testimonial that uses a **large area chart** (recharts `AreaChart`) to communicate protocol momentum.
- **Layout:** Two-column split — left column has a short headline ("Protocol growth") + key annotation callouts (3 milestones with small dot markers on the chart), right column has the full-width chart.
- **Chart spec:** 500px height on desktop, 300px on mobile. Smooth `monotone` curve with cyan gradient fill from `hsla(var(--primary) / 0.3)` to transparent. Subtle horizontal reference lines at key price/yield levels. No vertical grid lines. X-axis shows month labels (Jan, Feb, Mar...) in small muted type.
- **Annotation layer:** 3 SVG circle markers on the curve at key inflection points (protocol launch, first $1M TVL, cross-chain expansion) with subtle connecting lines and small type labels.
- **Tooltip:** Custom recharts tooltip — dark glass container with monospace values.
- **Entry animation:** The chart draws in from left to right on scroll (framer-motion `initial={{ clipPath: ... }}` or recharts animation).

### 4.7 Testimonial Section
- Single strong quote, max 3 lines
- Attribution: name + role + company (no em-dash)
- Glass container with `rounded-[3rem]` inner card
- Attribution uses "—" (hyphen), not em-dash

### 4.8 Final CTA
- Gradient card background using brand colors
- Headline + subtext + single CTA
- "No credit card required" microcopy below CTA (one line)

### 4.9 Footer
- Simple row: copyright + link row (Privacy, Legal, Terms)
- Min text, no heavy blocks

## 5. Design Engineering Directives

### 5.1 What to remove from the lP.html reference (anti-slops)

| Bad Pattern | Replacement |
|---|---|
| Gradient text on headline (`gradient-text`) | Solid white headline, or regular weight contrast |
| Version label in hero ("v4.8 · Now available") | Drop entirely |
| Avatar row + "12,483 designers joined today" | Remove entirely (moves social proof below hero or not at all) |
| Fake dashboard card with `0.8ms`, `99.7%` metrics | Real-feeling mock metrics or actual product preview |
| Three equal feature cards | Asymmetric bento grid |
| Generic company names (Stripe, OpenAI etc.) | Real or invented-but-contextual brand names |
| Em-dash in testimonial attribution | Hyphen |
| `window.addEventListener('scroll')` | framer-motion `useScroll()` / IntersectionObserver |
| Font Awesome (icon library) | lucide-react (already in project) |
| CDN-loaded Tailwind | Project's existing build pipeline |
| Google Fonts `<link>` in HTML | Existing `@import` in `index.css` |
| `#0A0A0A` / `#3B82F6` hardcoded colors | CSS variable tokens from existing theme |
| `h-screen` | `min-h-[100dvh]` everywhere |
| `border-t` + `border-b` on every spec row | Grouped or card-based spec layout |

### 5.2 What to preserve from lP.html (the vibe)
- Dark, premium, tech-forward atmosphere
- Glassmorphism with restraint (single hero card, testimonial)
- Bold typographic hierarchy
- CTA buttons with physical feedback (scale on active)
- Clean section rhythm

### 5.3 Interactive states (mandatory)
- **Loading:** Skeleton shimmer matching final layout (motion skeleton)
- **Empty/Error:** Graceful fallback text for any async content
- **CTAs:** `scale-[0.98]` on `:active`, `translateY(-1px)` on hover
- **Reduced motion:** `useReducedMotion()` from framer-motion — collapse all entry animations to instant

### 5.4 Color consistency lock
- Cyan accent (`hsl(var(--primary))`) is the ONE accent color
- No warm grays mixed with cool grays — stick to the existing `zinc`/`slate` family
- No blue accent next to cyan — use the existing primary token everywhere

### 5.5 Shape consistency lock
- All interactive elements (buttons, inputs, pills): `rounded-3xl`
- All cards/containers: `rounded-[2rem]` or `rounded-[3rem]`
- All icons in icon boxes: `rounded-2xl`
- Document this: buttons=pill, cards=2rem, icon-box=1rem

### 5.6 Eyebrow discipline
- Max 1 eyebrow per 3 sections. Hero counts as 1.
- The features section and final CTA section will NOT get eyebrows.
- Pre-flight mechanical count: if page has 7 sections, max 2 eyebrows.

### 5.7 Copy self-audit (pre-flight)
- Every visible string re-read before ship
- No AI-hallucinated phrases, no fake-humble copy, no "quietly in use at" type social proof headers
- Fake-precise numbers either come from real data or are labeled as mock — no invented "99.3% accuracy" for features the product doesn't have

## 6. File Generation Order

1. `frontend/src/pages/Landing.tsx` — Main page component composing all sections
2. `frontend/src/components/landing/LandingNav.tsx` — Fixed top nav
3. `frontend/src/components/landing/charts/AreaChartCard.tsx` — Reusable filled-area chart component (used by hero + performance section)
4. `frontend/src/components/landing/charts/Sparkline.tsx` — Tiny sparkline component for metrics bar
5. `frontend/src/components/landing/charts/BarChartCard.tsx` — Reusable bar chart component for features section
6. `frontend/src/components/landing/HeroSection.tsx` — Asymmetric split hero (uses AreaChartCard)
7. `frontend/src/components/landing/MetricsBar.tsx` — 4 stat pills with inline sparklines
8. `frontend/src/components/landing/FeatureGrid.tsx` — Bento feature grid (uses BarChartCard in one cell)
9. `frontend/src/components/landing/PerformanceChart.tsx` — Full-width protocol growth chart (uses AreaChartCard with annotation overlay)
10. `frontend/src/components/landing/Testimonial.tsx` — Quote section
11. `frontend/src/components/landing/FinalCta.tsx` — Bottom CTA card
12. `frontend/src/components/landing/Footer.tsx` — Footer
13. `frontend/src/components/landing/WaitlistModal.tsx` — Dialog form

## 7. App.tsx Route Changes

```tsx
// Keep existing routes but swap:
// <Route path="/" element={<Index />} />
// →
// <Route path="/" element={<Landing />} />
// <Route path="/dashboard" element={<Index />} />
```

The existing `DashboardLayout` wraps all routes. The landing page needs special treatment — either:
- A wrapper that hides the TopBar (simplest: `Landing` page handles its own nav), or
- The `DashboardLayout` conditionally renders the TopBar based on route

Current `DashboardLayout.scss` already has `useDocumentScroll` logic for pathname === "/" — extend this to skip the TopBar on the landing route.

## 8. Pre-Flight Checklist

- [ ] ZERO em-dashes (`—`) in any visible string
- [ ] ZERO serif fonts (not justified for this brief)
- [ ] Color consistency: one accent (cyan), one hue family (cool/cobalt, not warm)
- [ ] Shape consistency: pill buttons, 2rem/3rem card radii, 1rem icon-box radii
- [ ] Hero fits viewport: headline ≤ 2 lines, subtext ≤ 20 words, CTA visible without scroll
- [ ] Hero top padding ≤ `pt-24`
- [ ] Eyebrow count ≤ ceil(sectionCount / 3)
- [ ] No split-header pattern (left headline + right explainer float)
- [ ] No three equal feature cards (bento instead)
- [ ] No zigzag alternation beyond 2 consecutive image-text sections
- [ ] No duplicate CTA intent (one "Get started" label everywhere)
- [ ] Navigation on one line at 1024px, height ≤ 80px
- [ ] Logo wall = logos only (no industry labels)
- [ ] Bento has exact cell count (N items → N cells, no empty cells)
- [ ] Testimonial quote ≤ 3 lines, attribution with hyphen not em-dash
- [ ] Real images/gen or explicit placeholder slots — no div-based fake screenshots
- [ ] All graphs are real recharts SVG components, not div-based fakes or static images
- [ ] Charts use `type="monotone"` (smooth curves), not sharp linear interpolation
- [ ] Chart gradients use the cyan primary token (`hsl(var(--primary))`), not hardcoded hex
- [ ] All charts have responsive containers (`aspect-ratio` or `width: 100%` + resize observer)
- [ ] All charts dark-mode tested: grid lines, tooltips, axis labels readable against dark background
- [ ] Tooltips styled as dark glass containers with monospace values — not recharts default white
- [ ] Sparklines are lean (no axes, no grid, no labels, ~120x40px viewBox)
- [ ] Chart animations respect reduced-motion (disable animate on `prefers-reduced-motion`)
- [ ] No version labels, no section numbering eyebrows, no decorative status dots
- [ ] No pills/labels overlaid on images
- [ ] No scroll cues (`Scroll`, `↓ scroll`)
- [ ] No decoration text strip at hero bottom
- [ ] No locale/city-name strips
- [ ] Reduced-motion wrapper for all animations
- [ ] Dark mode defined and tested
- [ ] Mobile collapse explicit for every section
- [ ] `min-h-[100dvh]` (never `h-screen`)
- [ ] Button contrast check: WCAG AA 4.5:1
- [ ] Form contrast check: inputs, placeholders, focus rings, errors all pass WCAG AA
- [ ] CTA label wraps to one line at desktop
- [ ] Motion claimed = motion shown (if MOTION > 4, scroll-reveals and hover physics exist)
- [ ] No `window.addEventListener('scroll')` — use framer-motion `useScroll()` or IntersectionObserver
- [ ] font-display (Space Grotesk) for display, font-sans (Inter) for UI, font-mono (JetBrains Mono) for numbers
- [ ] One design system (shadcn + existing tailwind config)
