import { expect, test } from "bun:test";
import { apiUrl, routes } from "./url";

test("apiUrl joins base, prefix and path without double slashes", () => {
  expect(apiUrl("http://localhost:8000/", "/health")).toBe("http://localhost:8000/api/health");
  expect(apiUrl("http://localhost:8000", "health")).toBe("http://localhost:8000/api/health");
});

test("routes encode identifiers", () => {
  expect(routes.events("R 1")).toBe("/runs/R%201/events");
});
