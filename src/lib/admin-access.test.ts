import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { isAdminBootstrapEmail } from "./admin-access";

describe("admin account eligibility", () => {
  it("only allows the designated admin email to begin account setup", () => {
    assert.equal(isAdminBootstrapEmail("admin@zentramedhealth.co.ke"), true);
    assert.equal(isAdminBootstrapEmail(" ADMIN@ZENTRAMEDHEALTH.CO.KE "), true);
    assert.equal(isAdminBootstrapEmail("staff@zentramedhealth.co.ke"), false);
  });
});