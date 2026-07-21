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
