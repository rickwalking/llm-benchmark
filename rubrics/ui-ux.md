# Rubric — UI/UX Quality

## Definition

Measures the quality of the user interface and interaction design **as experienced by
the librarian using the app**. Covers: visual hierarchy, scannability, affordance
clarity (does it look clickable when it is, and not when it isn't), error and empty
states, feedback on async actions, form quality (labels, validation, errors), and
consistency of patterns across pages.

This rubric does **not** measure: code structure (see `architecture.md`), accessibility
violations (objective metric via axe-core), Lighthouse performance score (objective
metric), framework choice, or styling technology.

## Evidence the judge receives

- Screenshots of every page in three states: empty, populated, error.
- A short screen-capture (or step-by-step screenshots) of the 3-step checkout flow.
- A short capture of one modal interaction (return confirmation or pay-fine).
- The rendered HTML of two representative pages (catalog, member profile).
- The objective axe + Lighthouse summaries (for context only — they have their own weight).

## Anchored rubric

### 1 — Unusable
- Pages render but core flows are broken or confusing enough that a new librarian could not complete a checkout without instruction.
- Missing labels on form inputs OR placeholder-only labels.
- Empty states are blank screens or generic "no data" with no call-to-action.
- Errors are alert() boxes, raw stack traces, or silent failures.
- No loading indication on async actions; users see frozen UI.
- No consistent layout or nav across pages.

### 2 — Functional but rough
- All flows complete, but the layout is haphazard: inconsistent spacing, mixed font sizes, no clear primary action per page.
- Inputs have labels but error messages are generic ("Invalid input").
- Empty states exist but are perfunctory ("No books").
- Modals open and close but do not trap focus or close on ESC.
- The 3-step checkout is implemented but the step indicator is unclear or back-navigation is missing.
- Reservation countdown is shown as a raw timestamp, not a human-readable countdown.

### 3 — Competent
- Visual hierarchy is clear: each page has one obvious primary action.
- Consistent layout, spacing scale, and typography across pages.
- Loading skeletons or spinners on async; success and error toasts/inline messages.
- Empty states explain what the page is for and offer the primary action ("No books yet — add your first one").
- Modals trap focus, ESC closes, overlay click closes, focus returns to trigger on close.
- Form fields have labels, inline validation, and specific error messages ("ISBN must be 10 or 13 digits").
- Checkout step indicator shows current step, allows back-navigation, and confirms before submission.

### 4 — Polished
- Everything in 3, plus:
- Microcopy reads like it was written by someone who thought about it: "All copies on loan — 3 people waiting" beats "0 available".
- Overdue loans, notified reservations, and unpaid fines are visually emphasized (color + icon, not just color).
- Reservation countdown is a live HH:MM:SS that updates without page reload.
- Confirm-destructive actions use a clearly distinct "danger" treatment.
- The catalog supports at least one secondary affordance (sort or filter) wired through to the API or implemented client-side.

### 5 — Considered design
- Everything in 4, plus:
- The UI surfaces non-obvious information that the librarian would need: e.g., the 3-step checkout shows a warning at the confirm step when this is the member's 5th active loan.
- Visual hierarchy adapts to data: a member with no active loans gets a different (welcoming) profile layout than one with 5 overdue loans.
- Patterns are consistent enough that a second-time user predicts where things are.
- Error recovery is easy: "Loan limit reached" includes a link or hint to view the member's active loans.
- Empty states for new members or new books include genuinely helpful next-step copy.

## Notes for judges

- Score what is *there*, not what could be there. A perfectly competent app that lacks polish is a 3, not a 2.
- Ignore the model's framework or styling choice. A plain-CSS app can score 5; a Tailwind app can score 1.
- Visible jank in async (flash of unstyled content, layout shift on load) caps the score at 3.
- Implementation that ships an off-the-shelf admin dashboard template caps the score at 2 — it is not the model's design.
