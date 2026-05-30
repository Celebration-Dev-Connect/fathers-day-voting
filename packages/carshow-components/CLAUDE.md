# carshow-components — ATOMIC Design Standard

This package is the shared component library for all carshow React apps. Every component lives at exactly one ATOMIC level. Follow these rules when adding or modifying components.

## ATOMIC Levels

### Atom (`src/atoms/`)
The smallest possible UI unit.

- Renders a single HTML element or wraps a single icon
- **No** child components from this package
- **No** API calls or data fetching
- **No** local state beyond cosmetic concerns (hover, focus)
- Props are primitive values or simple callbacks
- Examples: `Button`, `Badge`, `Alert`, `Metric`

### Molecule (`src/molecules/`)
Two to four atoms composed together.

- May have minimal local state (e.g. scan in progress, input focused)
- **No** API calls or data fetching
- All data comes in as props
- Examples: `SearchBox`, `PageHeader`, `RegistrationRow`, `AuditRow`

### Organism (`src/organisms/` — shared package)
A self-contained, reusable section.

- **Must be pure (props-only).** If it calls the API, it does NOT belong here — it belongs in `apps/<app>/src/organisms/` instead.
- May manage async state for things it owns (e.g. generating a QR code image)
- Receives all business data via props
- Examples: `LoginCard`, `QrPrintCard`, `TallyCard`

### Template (`src/templates/`)
A layout shell with no business logic.

- Defines regions/slots using `children` or named render props
- Zero knowledge of data models
- Examples: `AdminShell`

---

## App-level organisms (`apps/<app>/src/organisms/`)
Organisms that call the API live here, NOT in the shared package. They wire up API calls and pass data + callbacks down to shared molecules/atoms.

Examples: `RegistrationEditor`, `QrAssignment`, `VotingSettings`, `Sidebar`

## Views (`apps/<app>/src/views/`)
One file per route section. Composes organisms + molecules with page-level state (search, selected item, refresh key). Fetches initial data. One view per navigation destination.

---

## Decision Flowchart

```
Does it call the API or fetch data?
  YES → app organisms/ or views/ (never in this package)
  NO ↓

Does it compose more than one component?
  NO → atom
  YES ↓

Does it manage significant async state or contain a form?
  YES → organism (if pure) or app organism (if API-coupled)
  NO → molecule
```

---

## Naming Conventions

- **Files:** PascalCase, one component per file (`Button.tsx`, not `buttons.tsx`)
- **Exports:** named exports only — no default exports
- **Barrel imports:** always import from `@carshow/carshow-components`, never from a deep path like `@carshow/carshow-components/dist/atoms/Button`
- **CSS:** global class names from `styles.css` — no CSS modules, no inline styles

## CSS Import

Consuming apps must import the stylesheet once at their entry point:

```typescript
// apps/<app>/src/main.tsx
import "@carshow/carshow-components/styles.css";
```

## Adding a New Component

1. Decide its ATOMIC level using the flowchart above
2. Create `src/<level>/ComponentName.tsx` with a named export
3. Add the export to `src/<level>/index.ts`
4. The root `src/index.ts` barrel re-exports all levels — no changes needed there
