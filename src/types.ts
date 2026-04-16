export interface OAuthCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes: string[];
  subscriptionType?: string;
}

export interface CredentialsFile {
  claudeAiOauth: OAuthCredentials;
}

export type ProfileType = "oauth" | "api-key";

export interface ProfileData {
  type: ProfileType;
  apiKey?: string;
}

export interface ProfileInfo {
  name: string;
  type: ProfileType;
  label: string | null;
  isActive: boolean;
}
