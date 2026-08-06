const request = require("supertest");
const { freshApp } = require("./helpers/freshApp");

describe("Platform smoke tests", () => {
  let app, teardown;

  beforeAll(() => {
    ({ app, teardown } = freshApp("health"));
  });

  afterAll(() => teardown());

  test("GET /api/health reports ok", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  test("unknown routes return 404 JSON, not an HTML error page", async () => {
    const res = await request(app).get("/api/this-route-does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Not found");
  });
});
