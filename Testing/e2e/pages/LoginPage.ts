import type { Page, Locator } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly toggleModeButton: Locator;
  readonly autoLoginButton: Locator;
  readonly emailError: Locator;
  readonly passwordError: Locator;
  readonly heading: Locator;
  readonly subtitle: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByLabel(/email/i);
    this.passwordInput = page.getByLabel(/password/i);
    this.submitButton = page.locator('form button[type="submit"]');
    this.toggleModeButton = page.getByText(/Already have an account|Need an account/);
    this.autoLoginButton = page.getByText('(Auto-Login as Test User)');
    this.emailError = page.locator('[data-testid="email-error"]');
    this.passwordError = page.locator('[data-testid="password-error"]');
    this.heading = page.getByText('PlanterPlan');
    this.subtitle = page.getByText(/church planting|plan your/i);
  }

  async goto() {
    await this.page.goto('/login');
  }

  async fillEmail(email: string) {
    await this.emailInput.fill(email);
  }

  async fillPassword(password: string) {
    await this.passwordInput.fill(password);
  }

  async clickSignIn() {
    await this.submitButton.click();
  }

  async clickSignUp() {
    await this.submitButton.click();
  }

  async clickAutoLogin() {
    await this.autoLoginButton.click();
  }

  async toggleSignUpMode() {
    await this.toggleModeButton.click();
  }

  async login(email: string, password: string) {
    await this.fillEmail(email);
    await this.fillPassword(password);
    await this.clickSignIn();
  }

  async getValidationError(field: 'email' | 'password') {
    return field === 'email' ? this.emailError : this.passwordError;
  }
}
