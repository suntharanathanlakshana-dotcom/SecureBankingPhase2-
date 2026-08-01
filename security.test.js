const request = require("supertest");
const { freshApp, loginAs } = require("./helpers/freshApp");

describe("Admin freeze takes effect on an already-issued session", () => {
  let app, teardown, adminToken, customerToken, customerId;

  beforeAll(async () => {
    ({ app, teardown } = freshApp("security-freeze"));
    ({ token: adminToken } = await loginAs(app, "admin", "AdminPass123!"));
    ({ token: customerToken } = await loginAs(app, "nimasha", "Password123!"));

    const users = await request(app).get("/api/admin/users").set("Authorization", `Bearer ${adminToken}`);
    customerId = users.body.users.find((u) => u.username === "nimasha").id;
  });

  afterAll(() => teardown());

  test("customer's existing token works before the freeze", async () => {
    const res = await request(app).get("/api/accounts").set("Authorization", `Bearer ${customerToken}`);
    expect(res.status).toBe(200);
  });

  test("admin can freeze the customer's account", async () => {
    const res = await request(app)
      .post(`/api/admin/users/${customerId}/freeze`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  test("the customer's PRE-EXISTING token is now rejected, without needing to log in again", async () => {
    const res = await request(app).get("/api/accounts").set("Authorization", `Bearer ${customerToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/frozen/i);
  });

  test("a frozen customer cannot initiate a transfer either", async () => {
    const res = await request(app)
      .post("/api/transfers/initiate")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ fromAccountId: "irrelevant", toAccountNumber: "SB-0000-0000", amount: 10 });
    expect(res.status).toBe(403);
  });

  test("unfreezing restores access on a freshly issued token", async () => {
    await request(app).post(`/api/admin/users/${customerId}/unfreeze`).set("Authorization", `Bearer ${adminToken}`);
    const { token } = await loginAs(app, "nimasha", "Password123!");
    const res = await request(app).get("/api/accounts").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe("Role-based access control", () => {
  let app, teardown, customerToken;

  beforeAll(async () => {
    ({ app, teardown } = freshApp("security-rbac"));
    ({ token: customerToken } = await loginAs(app, "nimasha", "Password123!"));
  });

  afterAll(() => teardown());

  test("a customer token cannot reach admin-only routes", async () => {
    const res = await request(app).get("/api/admin/overview").set("Authorization", `Bearer ${customerToken}`);
    expect(res.status).toBe(403);
  });

  test("admin routes reject requests with no token at all", async () => {
    const res = await request(app).get("/api/admin/overview");
    expect(res.status).toBe(401);
  });
});
