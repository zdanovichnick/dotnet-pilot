---
name: ui-ux-design
description: UI/UX design for a screen, form or component in an existing React app — build from the app's design system, design every data state the API contract creates, meet WCAG 2.1 AA, and report the design decision before the code.
when_to_use: The task designs something visible — a new screen, page, component, form or layout, or a visible change to an existing one. Not for wiring data into UI that already exists.
---

# UI/UX Design

Design work here means deciding layout, states, interaction and wording for a feature inside an
app that already has a look. The result must read as part of that app.

## 1. Find the design system first

| Look for | Where |
|----------|-------|
| Tokens | `tailwind.config.*` / `@theme` block, CSS custom properties (`--color-…`), a `theme.ts`, a tokens package |
| Component library | shadcn/ui (`components/ui/`, `components.json`), MUI, Mantine, Ant Design, Radix, an in-house `ui` package |
| Shared building blocks | Existing `Button`, `Dialog`, `Table`, `EmptyState`, `Skeleton`, `Toast`, form field wrappers |
| The nearest sibling screen | A page with the same job (another list, another edit form). Copy its structure |
| A design source | A mockup, Figma link or screenshot named in the brief. It outranks everything in this file |

Build from what exists. A new colour, spacing value, font size or component variant needs a
stated reason; "none of the existing variants fits because …" is a reason, taste is not.

## 2. Design every state

A data view is four screens, not one. Decide each before writing the component.

| State | Design question |
|-------|-----------------|
| Loading | Skeleton that keeps the layout stable, or a spinner? What stays usable meanwhile? |
| Empty | Why is it empty (nothing yet, or filtered out), and what is the next action? |
| Error | One designed answer per error case in the API contract: which message, where, and how the user recovers |
| Success | The normal view, including the long, the short and the many (truncation, wrapping, pagination) |

A mutation adds: pending (control disabled, progress shown), success confirmation, and failure
with the user's input preserved. Detail is in `references/states-and-copy.md`.

## 3. Forms mirror the contract

- Client validation states the same rules as the contract (required, length, range, format). It
  improves feedback; it never replaces the server's check.
- A `400` with `errors` maps each entry to its field. An error that names no field goes in a form
  summary.
- Never clear the form on a failed submit.

## 4. Accessibility: WCAG 2.1 AA

Minimum bar for anything new. The checklist with the criterion numbers is in
`references/accessibility.md`. The four that are missed most often:

1. Everything works with the keyboard alone, in a sensible focus order, with a visible focus ring.
2. Every input has a programmatic label; every icon-only button has an accessible name.
3. Text contrast is at least 4.5:1 (3:1 for large text and for UI component boundaries).
4. Errors and async results are announced, not only coloured.

Prefer the library's accessible primitive (dialog, menu, combobox) to a hand-built `div`.

## 5. Responsive

Use the breakpoints the project already defines. Decide what the narrowest one does with each
region: stack, collapse, scroll or hide. A table needs an explicit answer. Content must work at
320 CSS px wide without two-direction scrolling.

## 6. The design note

Put this first in the report, before the code summary, so the decision can be reviewed:

```
## Design note
Layout:      <regions and their order; what the narrow breakpoint does>
Components:  <reused: …>  <new: … and why nothing existing fits>
States:      loading … | empty … | error (per contract case) … | success …
Interaction: <primary action, keyboard path, what is confirmed or undoable>
Copy:        <labels, empty-state and error text>
Open:        <a design choice only the user can make, if any>
```

Keep it to what was decided. A choice that changes the feature's scope, or that the design
source contradicts, is a question for the user, not a default to pick silently.

## Do / Don't

| Do | Don't |
|----|-------|
| Match the nearest sibling screen | Introduce a new visual style for one feature |
| Design the empty and error states with the same care as success | Ship a spinner and a `Something went wrong` |
| Name the action on the button (`Add note`) | `OK`, `Submit`, `Click here` |
| Use semantic elements (`button`, `label`, `table`, headings in order) | Attach `onClick` to a `div` |
| Show destructive actions as destructive and confirm or allow undo | Put `Delete` next to `Save` with equal weight |
