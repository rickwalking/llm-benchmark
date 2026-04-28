# Library Lending — Requirements

A small public library wants a system to manage book lending, returns, late fines, and
a reservation queue when books are unavailable. The system has two user roles in scope:

- **Librarian** — uses the UI to perform actions on behalf of any member.
- **Member** — represented in the system by a `member_id`. No authentication: the
  librarian selects which member they are acting for.

## Domain entities

### Book
- `id` (uuid)
- `title` (string, required)
- `author` (string, required)
- `isbn` (string, required, unique, 10 or 13 digits, hyphens allowed)
- `total_copies` (integer, ≥1)
- `available_copies` (integer, derived: `total_copies` minus active loans)

### Member
- `id` (uuid)
- `name` (string, required)
- `email` (string, required, unique, valid format)
- `member_since` (date)
- `status` (`active` | `suspended`, default `active`)

### Loan
- `id` (uuid)
- `book_id`, `member_id` (foreign keys)
- `borrowed_at` (timestamp)
- `due_at` (timestamp, = `borrowed_at` + 14 days)
- `returned_at` (timestamp, nullable)
- A loan is **active** while `returned_at IS NULL`.

### Reservation
- `id` (uuid)
- `book_id`, `member_id`
- `queued_at` (timestamp)
- `status` (`waiting` | `notified` | `expired` | `fulfilled` | `cancelled`)
- `notified_at` (timestamp, nullable)
- `expires_at` (timestamp, nullable; set to `notified_at` + 48 hours)

### Fine
- `id` (uuid)
- `member_id`, `loan_id`
- `amount_cents` (integer, ≥0)
- `paid_at` (timestamp, nullable)

## Business rules (the parts that must be testable)

These rules carry numeric/conditional logic that mutation testing will target. Do not
hard-code their values inline; centralize them in a `policy` module so they are
unit-testable.

| Rule | Value |
|---|---|
| Max active loans per member | **5** |
| Loan period | **14 days** |
| Late fine rate | **$0.50 per day late** |
| Late fine cap per loan | **$10.00** |
| Reservation notification window | **48 hours** |
| Borrow blocked if unpaid fines exceed | **$5.00** |

## User stories and acceptance criteria

User stories are numbered. Each AC must be implemented end-to-end (DB → API → UI) and
will be exercised by Playwright e2e tests. Negative ACs (marked **NEG**) test rejection
paths and are scored equally to positive ones.

### US-1 — As a librarian, I want to see the catalog
- **AC-1.1**: `GET /api/books` returns a list of all books with title, author, ISBN,
  total copies, and current available copies. List is sorted by title (case-insensitive).
- **AC-1.2**: `GET /api/books/:id` returns a single book including the current
  reservation queue depth (count of reservations with status `waiting` or `notified`).
- **AC-1.3**: The UI page `/books` lists every book and shows availability ("3 of 5
  available", or "All copies on loan — N waiting"). Clicking a book opens its detail page.
- **AC-1.4** **NEG**: `GET /api/books/:id` for a non-existent ID returns **404** with
  body `{"error": "Book not found"}`.

### US-2 — As a librarian, I want to add books and members
- **AC-2.1**: `POST /api/books` creates a book given title, author, ISBN, total_copies.
  Returns **201** with the created resource.
- **AC-2.2** **NEG**: `POST /api/books` with an ISBN that already exists returns **409**
  with body `{"error": "ISBN already exists"}`.
- **AC-2.3**: `POST /api/members` creates a member. Email must be syntactically valid
  and unique.
- **AC-2.4** **NEG**: `POST /api/members` with a duplicate email returns **409**.

### US-3 — As a librarian, I want to lend a book to a member
- **AC-3.1**: `POST /api/loans` with `{member_id, book_id}` creates an active loan if
  all preconditions pass. Returns **201** with the loan, including `due_at`. The book's
  `available_copies` decreases by 1.
- **AC-3.2** **NEG**: If the member already has 5 active loans, returns **409** with
  body `{"error": "Loan limit reached"}`.
- **AC-3.3** **NEG**: If the member's status is `suspended`, returns **403** with body
  `{"error": "Member is suspended"}`.
- **AC-3.4** **NEG**: If the member has unpaid fines totaling more than $5.00, returns
  **402** with body `{"error": "Outstanding fines exceed limit"}`.
- **AC-3.5** **NEG**: If `available_copies` is 0, returns **409** with body
  `{"error": "No copies available — reserve instead"}`. Exception: the member at the head
  of the reservation queue with status `notified` is allowed to borrow (this fulfils
  their reservation; see AC-5.4).
- **AC-3.6**: The UI provides a multi-step **checkout** flow at `/checkout`: step 1 pick
  member, step 2 pick book, step 3 confirm. The confirm step shows due date and any
  applicable warnings (e.g., "this is the member's 5th active loan").

### US-4 — As a librarian, I want to record returns and fines
- **AC-4.1**: `POST /api/loans/:id/return` marks the loan returned, sets
  `returned_at = now`, and increases `available_copies` by 1.
- **AC-4.2**: If returned after `due_at`, the system creates a `Fine` for that loan,
  computed as `min(days_late × $0.50, $10.00)` where `days_late = ceil((returned_at - due_at) / 1 day)`.
  No fine is created if `days_late <= 0`.
- **AC-4.3** **NEG**: Returning a loan whose `returned_at` is already set returns **409**
  with body `{"error": "Loan already returned"}`.
- **AC-4.4**: When a copy returns and there are reservations in the queue for that book,
  the **head** reservation (oldest `queued_at` with status `waiting`) transitions to
  `notified`, with `notified_at = now` and `expires_at = now + 48h`. The book's
  `available_copies` does **not** increase while a notified reservation is outstanding.
- **AC-4.5**: The member profile UI page shows active loans, due dates, overdue badges,
  reservations with queue position and notification countdown, and any unpaid fines.

### US-5 — As a librarian, I want members to reserve unavailable books
- **AC-5.1**: `POST /api/reservations` with `{member_id, book_id}` creates a reservation
  with status `waiting` and `queued_at = now`. Returns **201**.
- **AC-5.2** **NEG**: Returns **409** if the member already has an active loan for that
  book (`{"error": "Member already has this book on loan"}`).
- **AC-5.3** **NEG**: Returns **409** if the member already has a `waiting` or `notified`
  reservation for that book (`{"error": "Duplicate reservation"}`).
- **AC-5.4**: When the member with status `notified` posts to `/api/loans` for that
  book, the loan is created AND the reservation transitions to `fulfilled`. Other
  members attempting to borrow that book while it is in `notified` state get **409**
  with body `{"error": "Book is reserved for another member"}`.
- **AC-5.5**: A scheduled (or on-request) job transitions `notified` reservations whose
  `expires_at < now` to `expired`, and notifies the next `waiting` reservation. Implement
  this as an idempotent function `expireStaleReservations()` invoked on every relevant
  read endpoint (`GET /api/books/:id`, `GET /api/members/:id`) and exposed as
  `POST /api/reservations/expire` for the harness to trigger explicitly.
- **AC-5.6**: The UI book detail page shows current queue depth and, for the selected
  member, their queue position (or "you have a notification, expires in HH:MM:SS").

### US-6 — As a librarian, I want to collect fines
- **AC-6.1**: `GET /api/members/:id` includes an `unpaid_fines_cents` field summing all
  fines with `paid_at IS NULL`.
- **AC-6.2**: `POST /api/fines/:id/pay` sets `paid_at = now`. Returns **200**.
- **AC-6.3** **NEG**: Paying an already-paid fine returns **409**.
- **AC-6.4**: The member profile UI shows unpaid fines with a "Pay" button per fine.
  Clicking opens a confirmation modal.

## Non-functional requirements

- **Accessibility**: every interactive element must be reachable and operable by
  keyboard. All form inputs must have associated labels. Color contrast ≥ AA.
  Tested with axe-core.
- **Performance**: catalog page (~50 books) must achieve a Lighthouse Performance score
  ≥ 80 on a desktop run.
- **Errors**: every error path must surface a clear UI message. No raw stack traces, no
  silent failures.
- **Empty states**: every list page must render a meaningful empty state (not a blank
  white area).

## Out of scope (do not implement)

- Authentication, user accounts, password flows.
- Email/SMS notifications (the "notification" is a state in the DB).
- Payment processing for fines (paying a fine is a single button that just marks it paid).
- Pagination, search-as-you-type, infinite scroll.
- Internationalization. English only.
- Offline mode, PWA features.
