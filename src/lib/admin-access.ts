export const ADMIN_BOOTSTRAP_EMAIL = "admin@zentramedhealth.co.ke";

export function isAdminBootstrapEmail(email: string): boolean {
  return email.trim().toLowerCase() === ADMIN_BOOTSTRAP_EMAIL;
}