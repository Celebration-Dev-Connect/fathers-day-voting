---
name: Velocity Strike
colors:
  surface: '#f9f9ff'
  surface-dim: '#d8dae2'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3fb'
  surface-container: '#ecedf6'
  surface-container-high: '#e6e8f0'
  surface-container-highest: '#e1e2ea'
  on-surface: '#191c21'
  on-surface-variant: '#5b403f'
  inverse-surface: '#2d3037'
  inverse-on-surface: '#eff0f9'
  outline: '#906f6e'
  outline-variant: '#e4bdbc'
  surface-tint: '#bc0f2b'
  primary: '#b90a29'
  on-primary: '#ffffff'
  primary-container: '#dd2d3e'
  on-primary-container: '#fffbff'
  inverse-primary: '#ffb3b1'
  secondary: '#5e5e5e'
  on-secondary: '#ffffff'
  secondary-container: '#e2e2e2'
  on-secondary-container: '#646464'
  tertiary: '#b8111c'
  on-tertiary: '#ffffff'
  tertiary-container: '#dc3031'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdad8'
  primary-fixed-dim: '#ffb3b1'
  on-primary-fixed: '#410007'
  on-primary-fixed-variant: '#92001d'
  secondary-fixed: '#e2e2e2'
  secondary-fixed-dim: '#c6c6c6'
  on-secondary-fixed: '#1b1b1b'
  on-secondary-fixed-variant: '#474747'
  tertiary-fixed: '#ffdad6'
  tertiary-fixed-dim: '#ffb3ac'
  on-tertiary-fixed: '#410003'
  on-tertiary-fixed-variant: '#930010'
  background: '#f9f9ff'
  on-background: '#191c21'
  surface-variant: '#e1e2ea'
  deep-red: '#CB1836'
  light-grey: '#F4F4F4'
  border-grey: '#D7D7D7'
  muted-grey: '#7D7D7D'
  pure-white: '#FFFFFF'
typography:
  headline-xl:
    fontFamily: Montserrat
    fontSize: 32px
    fontWeight: '800'
    lineHeight: '1.1'
    letterSpacing: 0.05em
  headline-lg:
    fontFamily: Montserrat
    fontSize: 24px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: 0.03em
  headline-md:
    fontFamily: Montserrat
    fontSize: 20px
    fontWeight: '700'
    lineHeight: '1.2'
  body-lg:
    fontFamily: Montserrat
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Montserrat
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  body-sm:
    fontFamily: Montserrat
    fontSize: 14px
    fontWeight: '500'
    lineHeight: '1.4'
  label-caps:
    fontFamily: Montserrat
    fontSize: 12px
    fontWeight: '700'
    lineHeight: '1'
    letterSpacing: 0.1em
  label-sm:
    fontFamily: Montserrat
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1'
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 8px
  touch-target-min: 48px
  gutter: 16px
  margin-mobile: 20px
  margin-desktop: 40px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
---

## Brand & Style

The design system is engineered for the high-octane environment of automotive exhibitions. It prioritizes energy, speed, and clarity, ensuring users can navigate and vote in bright outdoor conditions or crowded indoor venues. 

The aesthetic is **High-Contrast / Bold**, utilizing a striking "color-blocking" strategy inspired by high-performance racing liveries. By anchoring the interface in deep blacks and vibrant reds, the design system creates a sense of urgency and prestige. The visual DNA is defined by horizontal alignment, generous whitespace to prevent clutter, and a "modular" feel that treats every car entry as a high-value card.

## Colors

The palette is dominated by a "Triad of Power": Primary Red, Black, and White. 

- **Primary Red (`#F5404D`)** is reserved for high-priority actions like "Vote" or "Submit."
- **Deep Red (`#CB1836`)** provides depth for hover states or gradient accents.
- **Black and Near-Black** are used for structural blocking—headers, footers, and primary buttons—to provide a premium, authoritative grounding.
- **Light Grey (`#F4F4F4`)** serves as the primary canvas color, allowing white cards to pop with subtle elevation.

## Typography

This design system utilizes **Montserrat** across all levels to maintain a clean, architectural feel. 

Headlines must be rendered in **uppercase** with increased letter spacing (tracking) to evoke the spirit of automotive branding and signage. This ensures titles are legible even when overlaid on photography. Body text remains mixed-case for readability, focusing on a robust weight (400-500) to ensure the interface feels grounded and professional.

## Layout & Spacing

The layout follows a **fluid grid** model optimized for thumb-driven navigation. A base unit of **8px** governs all dimensions.

- **Mobile Viewport:** Uses a 2-column or 1-column layout with 20px side margins. 
- **Touch Targets:** All interactive elements (buttons, checkboxes, chips) must adhere to a minimum height/width of **48px** to accommodate fast-paced event interactions.
- **Alignment:** Strong left-alignment for text elements is required to maintain a structured, editorial look.

## Elevation & Depth

Hierarchy is achieved through **Tonal Layering** supplemented by subtle shadows. 

1.  **Background:** The lowest layer uses `light-grey`.
2.  **Surface:** Cards and content blocks use `pure-white`.
3.  **Elevation:** Standard cards utilize a "Soft Ambient Shadow" (0px 4px 12px, 5% opacity black). This keeps the UI feeling flat and modern while providing enough depth to distinguish clickable car entries from the background.
4.  **Interaction:** On-tap or active states should remove the shadow and introduce a `primary-red` or `black` 2px outline to simulate a tactile "press."

## Shapes

The shape language is primarily **Rectangular** to reinforce a masculine, structured aesthetic. 

- **Default (Soft):** Use a **4px** (`0.25rem`) radius for most UI components (buttons, input fields).
- **Cards:** Large containers and car image cards should use an **8px** radius to feel slightly more approachable.
- **Accents:** Smaller elements like tags or "category" chips may use the **2px** radius for a sharper, more technical appearance.

## Components

### Buttons
Buttons are the primary drivers of the voting experience.
- **Primary:** Solid `black` background with `white` uppercase text.
- **Action/Vote:** Solid `primary-red` background.
- **Secondary/Outlined:** `pure-white` background with a 2px `black` or `border-grey` outline.
- **Height:** Fixed at 48px or 56px for maximum mobile accessibility.

### Cards
Cards are the heart of the car show.
- **Structure:** 8px border radius, white background, and the "Soft Ambient Shadow."
- **Imagery:** Car photos should be top-aligned with 0px top-radius to sit flush with the card header.
- **Content:** Information is stacked vertically with 16px internal padding.

### Voting Inputs
- **Checkboxes/Radios:** Large, custom-styled 24px squares to ensure ease of use.
- **Input Fields:** Rectangular with 2px `border-grey` outlines. Focused states switch the outline to `primary-red`.

### Chips & Badges
- Used for car categories (e.g., "Muscle," "Classic").
- Small text (`label-caps`) with 2px border radius and a `light-grey` fill.