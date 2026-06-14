---
name: Aurelian Institutional
colors:
  surface: '#18130b'
  surface-dim: '#18130b'
  surface-bright: '#3f3830'
  surface-container-lowest: '#120d07'
  surface-container-low: '#201b13'
  surface-container: '#241f17'
  surface-container-high: '#2f2921'
  surface-container-highest: '#3a342b'
  on-surface: '#ede1d4'
  on-surface-variant: '#d5c4b0'
  inverse-surface: '#ede1d4'
  inverse-on-surface: '#362f27'
  outline: '#9d8e7c'
  outline-variant: '#514535'
  surface-tint: '#feba4c'
  primary: '#feba4c'
  on-primary: '#442b00'
  primary-container: '#d4962a'
  on-primary-container: '#4e3300'
  inverse-primary: '#805600'
  secondary: '#e3c282'
  on-secondary: '#402d00'
  secondary-container: '#5c4611'
  on-secondary-container: '#d4b475'
  tertiary: '#95ccff'
  on-tertiary: '#003352'
  tertiary-container: '#59a8e8'
  on-tertiary-container: '#003b5e'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffddb0'
  primary-fixed-dim: '#feba4c'
  on-primary-fixed: '#291800'
  on-primary-fixed-variant: '#614000'
  secondary-fixed: '#ffdf9f'
  secondary-fixed-dim: '#e3c282'
  on-secondary-fixed: '#261a00'
  on-secondary-fixed-variant: '#59430f'
  tertiary-fixed: '#cde5ff'
  tertiary-fixed-dim: '#95ccff'
  on-tertiary-fixed: '#001d32'
  on-tertiary-fixed-variant: '#004a75'
  background: '#18130b'
  on-background: '#ede1d4'
  surface-variant: '#3a342b'
typography:
  display-lg:
    fontFamily: Bebas Neue
    fontSize: 64px
    fontWeight: '400'
    lineHeight: '1.1'
    letterSpacing: 0.02em
  headline-lg:
    fontFamily: Bebas Neue
    fontSize: 32px
    fontWeight: '400'
    lineHeight: '1.2'
    letterSpacing: 0.05em
  headline-md:
    fontFamily: Bebas Neue
    fontSize: 24px
    fontWeight: '400'
    lineHeight: '1.2'
    letterSpacing: 0.05em
  title-lg:
    fontFamily: Space Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Space Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Space Grotesk
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Space Grotesk
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.08em
  label-sm:
    fontFamily: Space Grotesk
    fontSize: 10px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.1em
  headline-lg-mobile:
    fontFamily: Bebas Neue
    fontSize: 28px
    fontWeight: '400'
    lineHeight: '1.2'
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 48px
  container-max: 1440px
---

## Brand & Style
The design system embodies a premium, institutional character that suggests permanence, high-value assets, and sophisticated technology. It is tailored for high-stakes environments—fintech, institutional trading, or sovereign-grade AI orchestration—where precision and authority are paramount.

The visual style is a blend of **Modern Minimalism** and **Tactile Luxury**. It utilizes deep, warm neutrals to create a "void" that allows gold accents and high-fidelity data visualizations to command attention. The aesthetic avoids the coldness of typical "dark mode" blue-tints, opting instead for a rich, amber-based darkness that feels like a private vault or a high-end command center. Elements are defined by razor-sharp borders and subtle tonal layering rather than aggressive shadows.

## Colors
The palette is centered around a "Dark Amber" spectrum, replacing standard greys and blues with ochre-tinted neutrals.

- **Foundations:** The background architecture uses 'Void' for the outermost canvas, with 'Surface' and 'Card' providing rhythmic depth. This creates a natural hierarchy of information containment.
- **Accents:** 'Gold' is reserved for primary actions and critical path indicators. 'Copper' serves as a secondary accent specifically for AI agents, automated statuses, or machine-learning insights, providing a distinct visual "lane" for non-human interactions.
- **Functional:** Status colors like 'Emerald' and 'Crimson' are adjusted in saturation to harmonize with the cream-and-gold environment without losing their semantic urgency.

## Typography
The typographic system utilizes a high-contrast pairing to reinforce the institutional feel.

- **Headlines:** Use **Bebas Neue** for dramatic, tall, and authoritative headers. Its condensed nature allows for impactful messaging and "ticker-tape" aesthetics common in high-fidelity dashboards.
- **Body & Data:** Use **Space Grotesk** for all functional text. Its geometric terminals and technical rhythm ensure high legibility in data-dense tables and complex interface states.
- **Labels:** Secondary metadata and labels should always use uppercase Space Grotesk with expanded letter-spacing to create a sense of organized, systematic categorization.

## Layout & Spacing
The layout follows a strict **12-column grid** on desktop and a **4-column grid** on mobile. The spacing rhythm is built on a 4px baseline unit, favoring "generous density"—the interface should feel information-rich but never cluttered.

Large dashboard views should utilize a fixed-width container centered within the 'Void' background, while secondary tool panels should emerge from the right or left with 'Surface' backgrounds. Horizontal gutters are kept at 24px to provide clear breathing room between data modules.

## Elevation & Depth
Depth is achieved through **Tonal Layering** and **Low-Contrast Outlines** rather than traditional shadows.

1.  **Level 0 (Root):** 'Void' (#0E0B06) – The furthest depth, used for the background behind the main content area.
2.  **Level 1 (Surface):** 'Surface' (#150F07) – The primary canvas for page content.
3.  **Level 2 (Containers):** 'Card' (#1E1509) – Used for grouping related information. Each card is defined by a 1px border of 'Border' (#3A2812).
4.  **Level 3 (Interactive):** 'Elevated' (#28190C) – Used for active states, dropdown menus, and tooltips. These elements may use a subtle, diffused glow (0 8px 32px rgba(0,0,0,0.5)) to separate from the cards beneath.

## Shapes
To maintain the institutional and technical look, the design system uses **Soft (0.25rem)** roundedness. This provides a professional edge that is less aggressive than sharp corners but avoids the playfulness of fully rounded components. Large containers (cards) use `rounded-lg` (0.5rem) to provide a structural frame for the sharper internal elements.

## Components

- **Buttons:** Primary buttons use a solid 'Gold' background with black text for maximum contrast. Secondary buttons use a 'Border' outline with 'Cream' text. AI-action buttons use a solid 'Copper' fill.
- **Input Fields:** Use 'Void' backgrounds with a 'Border' stroke. On focus, the border transitions to 'Gold'. Placeholders use 'Text sec'.
- **Chips/Status Tags:** Small, low-profile badges using 'Border' as a background with 'Text sec' for metadata. Semantic chips (Success/Danger) use a subtle 10% opacity fill of their respective color with a solid 1px border.
- **Lists & Tables:** Use thin 'Border' dividers between rows. Header rows use the 'Surface' background and 'Label-sm' typography.
- **Cards:** Each card must have a 1px 'Border'. For "High-Priority" cards, a 2px top-border of 'Gold' can be added to denote institutional importance.
- **AI Agent Indicators:** Elements managed by AI should be wrapped in a subtle 'Copper' glow or feature a 2px vertical 'Copper' accent bar on the left edge.

Black Ops One[YieldMind]
Archivo Black [Heading]
Literata [Body][Light 300]