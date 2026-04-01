export type LoginBody = {
  email: string;
  password: string;
  tenant_slug?: string;
  totp?: string;
  backup_code?: string;
};

export type RefreshBody = {
  refreshToken: string;
};

export type LogoutBody = {
  refreshToken: string;
};

export type TwoFactorSetupResponse = {
  secret: string;
  otpauth_url: string;
};

export type TwoFactorEnableBody = {
  totp: string;
};

export type TwoFactorDisableBody = {
  totp?: string;
  backup_code?: string;
};

export type BootstrapBody = {
  token: string;
  email: string;
  password: string;
  role?: string;
  tenant_slug?: string;
};
