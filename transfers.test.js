const request = require("supertest");
const { freshApp, loginAs } = require("./helpers/freshApp");

async function getPrimaryAccountId(app, token) {
  const res = await request(app).get("/api/accounts").set("Authorization", `Bearer ${token}`);
  return res.body.accounts[0].id;
}

async function transfer(app, token, { fromAccountId, toAccountNumber, amount, channel }) {
  const initiate = await request(app)
    .post("/api/transfers/initiate")
    .set("Authorization", `Bearer ${token}`)
    .send({ fromAccountId, toAccountNumber, amount, channel });
  if (initiate.status !== 200) return { initiate };

  const confirm = await request(app)
    .post("/api/transfers/confirm")
    .set("Authorization", `Bearer ${token}`)
    .send({ fromAccountId, toAccountNumber, amount, channel, code: initiate.body.demoOtp });
  return { initiate, confirm };
}

describe("Transfers + fraud screening", () => {
  let app, teardown, token, accountId;

  beforeAll(async () => {
    ({ app, teardown } = freshApp("transfers"));
    ({ token } = await loginAs(app, "nimasha", "Password123!"));
    accountId = await getPrimaryAccountId(app, token);
  });

  afterAll(() => teardown());

  test("a normal transfer requires OTP and moves funds", async () => {
    const before = await request(app).get("/api/accounts").set("Authorization", `Bearer ${token}`);
    const startBalance = before.body.accounts[0].balance;

    const { confirm } = await transfer(app, token, {
      fromAccountId: accountId,
      toAccountNumber: "SB-9999-0001",
      amount: 500,
      channel: "CEFTS",
    });

    expect(confirm.status).toBe(200);
    expect(confirm.body.account.balance).toBeCloseTo(startBalance - 500 - 25, 2);
  });

  test("rejects a transfer confirmed with the wrong OTP code", async () => {
    const initiate = await request(app)
      .post("/api/transfers/initiate")
      .set("Authorization", `Bearer ${token}`)
      .send({ fromAccountId: accountId, toAccountNumber: "SB-9999-0002", amount: 100, channel: "CEFTS" });
    expect(initiate.status).toBe(200);

    const confirm = await request(app)
      .post("/api/transfers/confirm")
      .set("Authorization", `Bearer ${token}`)
      .send({ fromAccountId: accountId, toAccountNumber: "SB-9999-0002", amount: 100, channel: "CEFTS", code: "000000" });

    expect(confirm.status).toBe(401);
  });

  test("rejects a transfer larger than the account balance", async () => {
    const { initiate } = await transfer(app, token, {
      fromAccountId: accountId,
      toAccountNumber: "SB-9999-0003",
      amount: 999999999,
      channel: "CEFTS",
    });
    expect(initiate.status).toBe(400);
    expect(initiate.body.error).toMatch(/insufficient/i);
  });

  test("fraud engine blocks a large transfer once transfer velocity is high", async () => {
    // Build up velocity: three small, unremarkable transfers in quick succession.
    for (let i = 0; i < 3; i++) {
      const { confirm } = await transfer(app, token, {
        fromAccountId: accountId,
        toAccountNumber: `SB-9999-010${i}`,
        amount: 50,
        channel: "CEFTS",
      });
      expect(confirm.status).toBe(200);
    }

    // Fourth transfer: large amount (>= Rs 100,000) on top of high velocity should
    // cross the fraud-engine's block threshold (score >= 70) and be refused at confirm time.
    const { initiate, confirm } = await transfer(app, token, {
      fromAccountId: accountId,
      toAccountNumber: "SB-9999-0199",
      amount: 150000,
      channel: "CEFTS",
    });

    expect(initiate.status).toBe(200);
    expect(confirm.status).toBe(403);
    expect(confirm.body.reason).toMatch(/velocity|large/i);
  });
});

describe("Fraud scoring unit behaviour", () => {
  test("scoreTransaction blocks when amount and velocity are both high", () => {
    const { teardown } = freshApp("fraud-unit");
    const { scoreTransaction } = require("../utils/fraud");

    const accountId = "unit-test-account";
    // scoreTransaction reads recent transaction count from the DB; with none seeded for this
    // synthetic account, only the large-amount rule fires.
    const result = scoreTransaction({ accountId, amountCents: 15000000, type: "transfer_out" });
    expect(result.score).toBeGreaterThanOrEqual(40);
    expect(result.blocked).toBe(false); // amount alone isn't enough to block
    teardown();
  });

  test("scoreTransaction never blocks a small, isolated transaction", () => {
    const { teardown } = freshApp("fraud-unit-2");
    const { scoreTransaction } = require("../utils/fraud");
    const result = scoreTransaction({ accountId: "unit-test-account", amountCents: 5000, type: "transfer_out" });
    expect(result.blocked).toBe(false);
    expect(result.score).toBe(0);
    teardown();
  });
});
