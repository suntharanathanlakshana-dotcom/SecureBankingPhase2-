const request = require("supertest");
const { freshApp, loginAs } = require("./helpers/freshApp");

describe("Auth service", () => {
  let app, teardown;

  beforeAll(() => {
    ({ app, teardown } = freshApp("auth"));
  });

  afterAll(() => teardown());

  test("rejects login with a wrong password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "nimasha", password: "wrong-password" });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid/i);
  });

  test("logs in with the seeded demo customer via password + OTP", async () => {
    const { token, user } = await loginAs(app, "nimasha", "Password123!");
    expect(token).toBeTruthy();
    expect(user.username).toBe("nimasha");
    expect(user.role).toBe("customer");
  });

  test("rejects a stale/reused OTP code", async () => {
    const step1 = await request(app)
      .post("/api/auth/login")
      .send({ username: "nimasha", password: "Password123!" });
    // consume it once
    await request(app)
      .post("/api/auth/login/verify-otp")
      .send({ preAuthToken: step1.body.preAuthToken, code: step1.body.demoOtp });
    // try to reuse the same code again
    const replay = await request(app)
      .post("/api/auth/login/verify-otp")
      .send({ preAuthToken: step1.body.preAuthToken, code: step1.body.demoOtp });
    expect(replay.status).toBe(401);
  });

  test("blocks registration when required fields are missing", async () => {
    const res = await request(app).post("/api/auth/register").send({ username: "incomplete" });
    expect(res.status).toBe(400);
  });

  test("blocks registration with a duplicate username", async () => {
    const res = await request(app).post("/api/auth/register").send({
      fullName: "Nimasha Duplicate",
      username: "nimasha", // already seeded
      email: "someoneelse@example.com",
      phone: "+94770000001",
      nic: "199900000000",
      password: "SomePassword123!",
    });
    expect(res.status).toBe(409);
  });

  test("registers a new customer and opens a zero-balance account", async () => {
    const res = await request(app).post("/api/auth/register").send({
      fullName: "New Customer",
      username: "newcustomer1",
      email: "newcustomer1@example.com",
      phone: "+94770000002",
      nic: "199900000001",
      password: "GoodPassword123!",
    });
    expect(res.status).toBe(201);
    expect(res.body.accountNumber).toMatch(/^SB-/);
  });

  test("GET /api/auth/me requires a bearer token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  test("GET /api/auth/me returns the authenticated user's profile", async () => {
    const { token } = await loginAs(app, "nimasha", "Password123!");
    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe("nimasha");
  });

  test("a pre-MFA token cannot be used as a full session token", async () => {
    const step1 = await request(app)
      .post("/api/auth/login")
      .send({ username: "nimasha", password: "Password123!" });
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${step1.body.preAuthToken}`);
    expect(res.status).toBe(401);
  });
});
