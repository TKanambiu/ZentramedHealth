import { describe, expect, it } from "bun:test";
import { isAdminBootstrapEmail } from "./admin-access";

describe("admin account eligibility", () => {
  it("only allows the designated admin email to begin account setup", () => {
    expect(isAdminBootstrapEmail("admin@zentramedhealth.co.ke")).toBe(true);
    expect(isAdminBootstrapEmail(" ADMIN@ZENTRAMEDHEALTH.CO.KE ")).toBe(true);
    expect(isAdminBootstrapEmail("staff@zentramedhealth.co.ke")).toBe(false);
  });
});