# Customer app languages and return navigation

English, Luganda and Swahili are available offline in the app. The remaining
listed languages are disabled until translations are bundled. The preference
uses the existing `kuula_lang` browser storage key and updates the document's
language for accessibility.

Existing keyed translations remain in `src/i18n/locales/`. Customer UI copy
that previously bypassed them is in `src/i18n/source-ui.json`, with matching
English, Luganda and Swahili entries. `UiText` subscribes to language changes;
`uiText` handles placeholders, accessibility labels and interpolated copy.
Translate new copy in all three catalogues and retain interpolation variables.

Keep user-entered text, names, IDs, references and message content as provided.
Translate option labels, not their values. Every translated HTML option must
have an explicit canonical `value` so persisted enums and server validation do
not change with the display language. Loan-purpose summaries translate known
purpose labels while retaining custom descriptions.

Internal screen navigation records its originating pathname in React Router
state. `useReturnNavigation` returns through that history, including after a
refresh. Direct links use a local fallback and never navigate to an external
URL. Settings subpages and the language picker share this behavior.

Verification:

- `npm test` checks catalogue parity, interpolation, canonical data and safe
  return paths.
- `npm run typecheck` checks the frontend.
- `node scripts/language-navigation-check.mjs http://127.0.0.1:5176` checks a
  local packaged build at phone and desktop sizes with synthetic accounts and
  mocked APIs. It checks signed-in and signed-out navigation, persistence,
  translations across customer screens and unchanged form values.
