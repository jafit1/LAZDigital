# Shadcn UI Inspired Design Guidelines

When creating, editing, or styling user interfaces and web components, you must adhere to the design system rules inspired by shadcn/ui to ensure premium visual quality, clean layouts, and standard accessibility patterns.

## 🎨 Color Palette & HSL Semantic Variables
Always use semantic HSL CSS custom properties to manage colors, making light and dark themes seamless and unified. Avoid hardcoded hex/rgb color codes in style definitions. Use:
- `--background`, `--foreground`: Base canvas and body text.
- `--card`, `--card-foreground`: Card background and card text.
- `--popover`, `--popover-foreground`: Popovers, dropdown menus, and tooltips.
- `--primary`, `--primary-foreground`: Primary action elements.
- `--secondary`, `--secondary-foreground`: Secondary buttons/elements.
- `--muted`, `--muted-foreground`: Disabled or subtle text/backgrounds.
- `--accent`, `--accent-foreground`: Hover states and highlights.
- `--destructive`, `--destructive-foreground`: Errors and destructive operations.
- `--border`, `--input`, `--ring`: Outlines, input borders, and focus rings.

### Example Token Styles:
```css
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --card: 0 0% 100%;
  --card-foreground: 222.2 84% 4.9%;
  --popover: 0 0% 100%;
  --popover-foreground: 222.2 84% 4.9%;
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
  --secondary: 210 40% 96.1%;
  --secondary-foreground: 222.2 47.4% 11.2%;
  --muted: 210 40% 96.1%;
  --muted-foreground: 215.4 16.3% 46.9%;
  --accent: 210 40% 96.1%;
  --accent-foreground: 222.2 47.4% 11.2%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 210 40% 98%;
  --border: 214.3 31.8% 91.4%;
  --input: 214.3 31.8% 91.4%;
  --ring: 222.2 84% 4.9%;
  --radius: 0.5rem;
}
```

## 📐 Borders and Radius Constants
- Use a default thin border: `1px solid hsla(var(--border))` or `border: 1px solid var(--border)` if mapped directly.
- Use a default border-radius (`--radius`) of `8px` (`0.5rem`) for standard buttons/inputs, and `12px` (`0.75rem`) for cards and dialog containers.
- Avoid large, uneven rounded edges on elements that should be structured.

## ✍️ Typography
- Use modern sans-serif fonts (e.g., `Inter`, `Roboto`, `Geist Sans`, or browser defaults with a fallback).
- Apply slightly tighter line-heights: `line-height: 1.25` for headers, `line-height: 1.5` for body text.
- Use clean weights: `600` or `700` for headings, `500` for interactive text, and `400` for general labels.
- Set subtle letter-spacing for headings: `letter-spacing: -0.02em` or `-0.01em`.

## ✨ Animations & Transitions
- Interactive elements (buttons, links, inputs, dropdown items) must have transition effects on hover/focus: `transition: all 0.15s ease-in-out`.
- Transitions should cover background colors, border colors, transforms, and shadow changes.

## 🛡️ Focus and Accessibility rings
- Never hide focus rings entirely. Use a clean `:focus-visible` ring style using `--ring` and focus offset:
  `outline: 2px solid transparent; outline-offset: 2px; box-shadow: 0 0 0 2px hsl(var(--background)), 0 0 0 4px hsl(var(--ring));`

## 📊 Flexible Dashboard Layout & KPI Card Rules

To prevent dynamic data updates from breaking the dashboard layout, always follow these rules:

1. **Stable Widget Dimensions**:
   - Never let list-based or table-based widgets (like "Recent Transactions" or "Branch Offices") grow infinitely in height.
   - Always wrap lists and tables inside a container with a fixed `max-height` (e.g., `240px` to `280px`) and `overflow-y: auto`.
   - This ensures that when records are added or deleted, the overall card dimensions remain stable, and only the scrollable contents inside change.

2. **Symmetrical Grid Alignment**:
   - Arrange dashboard cards into structured horizontal rows or equal-height grids using CSS Flexbox or CSS Grid.
   - For rows, use `align-items: stretch` to ensure that all cards in the same row share the exact same height, preventing awkward vertical gaps.
   - Use explicit fractional widths (e.g., `flex: 1.5` for a primary card, `flex: 1` for a secondary card) to control sizing rather than letting content define width.

3. **Premium KPI Stats Cards**:
   - Visual Hierarchy: Place key stats (like Total Income/Expenditure) in a dedicated grid at the top. Use large bold values (e.g., `font-size: 26px`, `font-weight: 700`, `letter-spacing: -0.02em`).
   - Soft Backdrops & Shadows: Use custom backgrounds (`var(--surface2)`) with a very soft colored drop shadow corresponding to the metric (e.g., subtle green shadow for income, subtle red shadow for expense, subtle blue/purple for metadata).
   - Styled Trend Badges: Use pills with soft background colors and corresponding text colors (e.g., `background: rgba(16,185,129,0.12); color: #10b981` instead of plain raw text) for transaction count indicators.
