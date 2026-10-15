# AI 连接凭证卡片设计 QA

- Source visual truth: `/Users/yinwenjing/Documents/ChatGPT/Fire as soon/reference-ai-connection.png`
- Implementation screenshot: `/Users/yinwenjing/Documents/ChatGPT/Fire as soon/implementation-settings-mobile.png`
- Source pixels: 1148 × 768
- Implementation pixels: 304 × 674
- CSS viewport: 304 × 674
- Density normalization: both captures reviewed at native 1× pixels; the source is a desktop component reference and the implementation is the responsive mobile state, so dimensions were not force-scaled.
- State: Settings page, OpenAI-compatible provider selected, API Key hidden, connection test idle.

## Full-view comparison evidence

The source and implementation were opened together in the same comparison pass. The implementation intentionally retains the FIRE 40 page header, navigation, warm-white palette and green brand tokens while reproducing the referenced connection card’s information order and control hierarchy.

## Focused region comparison evidence

- Typography: field labels, bilingual technical names and helper text preserve the source hierarchy; the application uses its existing serif display face only outside the card.
- Spacing/layout: provider is full width, Base URL and Model Name become two columns on desktop and one column on mobile, followed by the full-width secret field and test action.
- Colors/tokens: the source’s neutral borders and muted helper text are retained; purple accents are intentionally mapped to FIRE 40 green.
- Image/icon fidelity: no raster imagery is required. Standard interface icons use the existing Lucide library for provider settings, password visibility and connection testing.
- Copy/content: provider, Base URL, Model Name, API Key, compatibility note and unauthenticated-key guidance match the reference intent.

## Interaction checks

- Provider select renders with the OpenAI-compatible option.
- API Key visibility toggles between password and text states, with accessible labels.
- Base URL, model and API Key values are editable.
- Connection test has idle, loading, success and error states.
- Credentials are supplied to AI chat and retained only in `sessionStorage`.
- Mobile layout and persistent navigation remain usable.
- Production build and TypeScript validation pass.

## Findings

No actionable P0, P1 or P2 visual differences remain. The different page chrome and green accent are intentional integrations with the existing FIRE 40 product rather than reference drift.

## Comparison history

- Initial pass: the previous settings page exposed only environment-variable instructions and did not reproduce the reference form.
- Fixes: added the provider selector, two-column credential grid, password visibility control, helper copy, connection test states and responsive single-column behavior.
- Post-fix evidence: `implementation-settings-mobile.png`; verified against `reference-ai-connection.png` in the same comparison pass.

## Follow-up polish

- P3: capture a desktop-width implementation screenshot if a pixel-level desktop comparison is needed later.

final result: passed
