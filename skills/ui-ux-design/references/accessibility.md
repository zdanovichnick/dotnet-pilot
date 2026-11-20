# Accessibility checklist (WCAG 2.1, levels A and AA)

Numbers are WCAG success criteria. Check the ones the change touches.

## Keyboard and focus

| Check | Criterion |
|-------|-----------|
| Every action is reachable and operable with the keyboard alone | 2.1.1 |
| Focus can always leave a component; a modal traps focus only while open and returns it to the trigger on close | 2.1.2 |
| Focus order follows the visual and logical order | 2.4.3 |
| The focused element has a visible indicator (do not remove the outline without a replacement) | 2.4.7 |
| Content that appears on hover or focus can be dismissed, hovered and stays until dismissed | 1.4.13 |

## Names, roles and structure

| Check | Criterion |
|-------|-----------|
| Inputs have a visible label that is programmatically tied to them (`<label for>`, or the library's field wrapper) | 1.3.1, 3.3.2 |
| Icon-only buttons and links have an accessible name (`aria-label` or visually hidden text) | 4.1.2 |
| Custom controls expose role, state and value; prefer the native element or the library primitive | 4.1.2 |
| Headings are real headings and nest in order; lists and tables use list and table markup | 1.3.1 |
| Images that carry meaning have `alt`; decorative ones have `alt=""` | 1.1.1 |
| Link and button text makes sense out of context | 2.4.4 |
| Inputs for personal data set `autocomplete` | 1.3.5 |

## Colour and contrast

| Check | Criterion |
|-------|-----------|
| Text contrast ≥ 4.5:1; large text (≥ 24 px, or ≥ 18.66 px bold) ≥ 3:1 | 1.4.3 |
| UI component boundaries, focus indicators and meaningful graphics ≥ 3:1 against adjacent colours | 1.4.11 |
| Colour is never the only signal (error = colour + icon or text; status = colour + label) | 1.4.1 |

Check both themes when the app has a dark mode.

## Forms and errors

| Check | Criterion |
|-------|-----------|
| An error is identified in text and tied to its field (`aria-describedby`, `aria-invalid`) | 3.3.1 |
| The message says how to fix it when that is known | 3.3.3 |
| Legal, financial or data-deleting submissions can be reviewed, confirmed or reversed | 3.3.4 |
| Nothing unexpected happens on focus or on input (no auto-submit on select change) | 3.2.1, 3.2.2 |

## Dynamic content

| Check | Criterion |
|-------|-----------|
| Results of an async action (saved, failed, N results) are announced through a live region or the toast component's built-in one, without moving focus | 4.1.3 |
| After a route change or a dialog open, focus moves to the new content | 2.4.3 |
| Motion that starts automatically and lasts over 5 s can be paused; honour `prefers-reduced-motion` | 2.2.2 |

## Layout

| Check | Criterion |
|-------|-----------|
| Works at 320 CSS px width without horizontal scrolling (data tables excepted) | 1.4.10 |
| Text can be zoomed to 200 % without loss of content | 1.4.4 |
| Layout survives increased line, paragraph, letter and word spacing | 1.4.12 |
| Works in portrait and landscape | 1.3.4 |

## Target size

WCAG 2.1 has no AA criterion for target size: 44 × 44 CSS px is 2.5.5, level AAA. The 24 × 24
minimum (2.5.8) is level AA in WCAG 2.2. Use 24 px as the floor and 44 px for primary touch
actions unless the design system already sets a size.

## Tests that prove it

Query by role and accessible name in component tests (`getByRole('button', { name: 'Add note' })`).
A test that can only find the element by test id is evidence that the name or role is missing.
Run the project's axe check when it has one (`jest-axe`, `vitest-axe`, `@axe-core/playwright`).
