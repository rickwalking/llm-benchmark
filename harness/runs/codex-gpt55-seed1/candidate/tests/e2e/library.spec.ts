import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

type Book = {
  id: string;
  title: string;
  isbn: string;
  available_copies: number;
};

type Member = {
  id: string;
  name: string;
  email: string;
};

type Loan = {
  id: string;
  book_id: string;
  member_id: string;
};

let isbnCounter = 2000000000000;

async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
  expect(serious).toEqual([]);
}

async function apiPost<T>(request: APIRequestContext, path: string, data: object): Promise<T> {
  const response = await request.post(`http://localhost:3001${path}`, { data });
  const text = await response.text();
  expect(response.ok(), text).toBeTruthy();
  return JSON.parse(text) as T;
}

async function createMember(request: APIRequestContext, name: string): Promise<Member> {
  return apiPost<Member>(request, "/api/members", {
    name,
    email: `${name.toLowerCase().replaceAll(" ", ".")}@e2e.example.com`
  });
}

async function createBook(request: APIRequestContext, title: string, copies = 1): Promise<Book> {
  isbnCounter += 1;
  const isbn = String(isbnCounter);
  return apiPost<Book>(request, "/api/books", {
    title,
    author: "E2E Author",
    isbn,
    total_copies: copies
  });
}

test.beforeEach(async ({ request }) => {
  await expect.poll(async () => (await request.get("http://localhost:3001/api/health")).status()).toBe(200);
});

test("AC-1.3 AC-2.1 AC-2.3 AC-3.6 AC-4.1 AC-4.5 AC-6.4: desk happy path is operable in the UI", async ({
  page
}) => {
  const suffix = Date.now();
  const memberName = `Zoe E2E ${suffix}`;
  const bookTitle = `E2E Lending ${suffix}`;
  const isbn = `9${String(suffix).slice(0, 12)}`;

  await page.goto("/members");
  await expectAccessible(page);
  await page.getByLabel("Name").fill(memberName);
  await page.getByLabel("Email").fill(`zoe.${suffix}@example.com`);
  await page.getByRole("button", { name: "Add member" }).click();
  await expect(page.getByText("Member created.")).toBeVisible();

  await page.goto("/books");
  await expectAccessible(page);
  await page.getByLabel("Title").fill(bookTitle);
  await page.getByLabel("Author").fill("E2E Author");
  await page.getByLabel("ISBN").fill(isbn);
  await page.getByLabel("Total copies").fill("1");
  await page.getByRole("button", { name: "Add book" }).click();
  await expect(page.getByText("Book added to the catalog.")).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(bookTitle) })).toBeVisible();

  await page.goto("/checkout");
  await expectAccessible(page);
  await page.getByLabel("Member").selectOption({ label: memberName });
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel(new RegExp(bookTitle)).check();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Due date")).toBeVisible();
  await page.getByRole("button", { name: "Confirm checkout" }).click();
  await expect(page.getByText("Checkout complete.")).toBeVisible();

  await page.goto("/books");
  await expect(page.getByRole("link", { name: new RegExp(`${bookTitle}[\\s\\S]*All copies on loan`) })).toBeVisible();

  await page.goto("/members");
  await page.getByRole("link", { name: new RegExp(memberName) }).click();
  await expectAccessible(page);
  await expect(page.getByText(bookTitle)).toBeVisible();
  await page.getByRole("button", { name: "Return" }).click();
  await expect(page.getByRole("dialog", { name: "Confirm return" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Loan returned.")).toBeVisible();
});

test("AC-5.1 AC-5.4 AC-5.5 AC-5.6: reservation notifications are visible and enforce queue ownership", async ({
  page,
  request
}) => {
  const suffix = Date.now();
  const book = await createBook(request, `E2E Reserved ${suffix}`);
  const borrower = await createMember(request, `Borrower ${suffix}`);
  const waiter = await createMember(request, `Waiter ${suffix}`);
  const other = await createMember(request, `Other ${suffix}`);
  const loan = await apiPost<Loan>(request, "/api/loans", { member_id: borrower.id, book_id: book.id });
  await apiPost(request, "/api/reservations", { member_id: waiter.id, book_id: book.id });
  await apiPost(request, "/api/reservations", { member_id: other.id, book_id: book.id });
  await apiPost(request, `/api/loans/${loan.id}/return`, {});

  await page.goto(`/books/${book.id}`);
  await page.getByLabel("Member").selectOption({ label: waiter.name });
  await expect(page.getByText(/notification, expires in/)).toBeVisible();
  await expectAccessible(page);

  const blocked = await request.post("http://localhost:3001/api/loans", {
    data: { member_id: other.id, book_id: book.id }
  });
  expect(blocked.status()).toBe(409);
  expect(await blocked.json()).toEqual({ error: "Book is reserved for another member" });

  const fulfilled = await request.post("http://localhost:3001/api/loans", {
    data: { member_id: waiter.id, book_id: book.id }
  });
  expect(fulfilled.status()).toBe(201);
});

test("AC-1.4 AC-2.2 AC-3.5: required rejection paths return clear API errors", async ({ request }) => {
  const missing = await request.get("http://localhost:3001/api/books/00000000-0000-4000-8000-000000000000");
  expect(missing.status()).toBe(404);
  expect(await missing.json()).toEqual({ error: "Book not found" });

  const book = await createBook(request, `E2E Negative ${Date.now()}`);
  const duplicate = await request.post("http://localhost:3001/api/books", {
    data: { title: "Duplicate", author: "E2E", isbn: book.isbn, total_copies: 1 }
  });
  expect(duplicate.status()).toBe(409);
  expect(await duplicate.json()).toEqual({ error: "ISBN already exists" });

  const borrower = await createMember(request, `Negative Borrower ${Date.now()}`);
  const blocked = await createMember(request, `Negative Blocked ${Date.now()}`);
  await apiPost<Loan>(request, "/api/loans", { member_id: borrower.id, book_id: book.id });
  const noCopies = await request.post("http://localhost:3001/api/loans", {
    data: { member_id: blocked.id, book_id: book.id }
  });
  expect(noCopies.status()).toBe(409);
  expect(await noCopies.json()).toEqual({ error: "No copies available — reserve instead" });
});
