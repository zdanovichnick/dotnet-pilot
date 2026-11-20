# States and UX copy

## From contract to states

Each line of the API contract is a state to design.

| Contract says | UI answer |
|---------------|-----------|
| `200` with items | Success view. Check one item, many items, and the longest plausible value |
| `200` with an empty list | Empty state: what this place is for and the action that fills it. Filtered-to-nothing is a different message with a `Clear filters` action |
| `201` / `204` after a mutation | Confirmation where the user is looking (inline, or the app's toast), and the list or detail updated |
| `400` + `errors` | Field-level messages; focus the first invalid field; input preserved |
| `401` | The app's existing sign-in redirect. Do not design a new one |
| `403` | Say the user lacks permission and who can grant it. Hide or disable the action up front when the permission is known |
| `404` | The item is gone or never existed: say so, and offer the way back to the list |
| `409` | Explain the conflict in the user's terms (`This order is closed`) and the next step (reload, pick another) |
| `5xx`, network failure | A retry action. Keep the user's work. Never show a stack trace or raw `detail` from an unknown error |

## Loading

- Under about 300 ms, show nothing; a flash of spinner is worse than none.
- Prefer a skeleton with the final layout's dimensions, so content does not jump when it lands.
- Keep already-loaded data visible while refreshing; mark it as updating.
- A pending mutation disables its own control and shows progress on it. It does not block the page.
- Optimistic updates only when the project already does them, and always with a rollback path.

## Destructive and irreversible actions

Prefer undo to a confirmation dialog when the API can support it. When it cannot, the dialog
names the object and the consequence (`Delete note "Call back Friday"? This cannot be undone.`)
and its confirm button repeats the verb (`Delete note`), not `OK`.

## Copy rules

- **Buttons**: verb + object, the same words as the result (`Add note` → "Note added").
- **Errors**: what happened, then what to do. No blame, no codes, no "invalid". `Text is required`
  → `Enter the note text`. `Error 409` → `This order is closed. Notes can no longer be added.`
- **Empty states**: one sentence on what will appear here and one action. No jokes in places a
  user reaches after a failure.
- **Labels**: nouns, sentence case, no trailing colon unless the app uses one. Placeholders are
  examples, never the label.
- **Consistency**: use the app's existing term for a thing. If the nav says "Orders", the new
  screen does not say "Purchases".
- **Numbers, dates, money**: format with the app's locale helper or `Intl`, not string
  concatenation. Show the time zone when the API value carries one that differs from the user's.
- When the app is localised, every new string goes through its translation function and into
  its message files; no literals in JSX.
