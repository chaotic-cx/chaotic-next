import { typeormAdapter } from '@hedystia/better-auth-typeorm';
import { betterAuth } from 'better-auth';
import { genericOAuth } from 'better-auth/plugins/generic-oauth';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { pgConnectionOptions } from '../data/pg-options';
import { Account } from './generated/entities/Account';
import { Session } from './generated/entities/Session';
import { User } from './generated/entities/User';
import { Verification } from './generated/entities/Verification';
import { CreateAccount1786779403609 } from './generated/migrations/1786779403609-create-account';
import { CreateSession1786779403609 } from './generated/migrations/1786779403609-create-session';
import { CreateUser1786779403609 } from './generated/migrations/1786779403609-create-user';
import { CreateVerification1786779403609 } from './generated/migrations/1786779403609-create-verification';

interface GitLabProfile {
  id: number;
  username: string;
  name: string;
  email: string;
  avatar_url: string;
  web_url: string;
}

const AUTH_GENERATED_DIR = 'backend/src/auth/generated';

type AuthDataSource = Parameters<typeof typeormAdapter>[0];

const authDataSource = new DataSource({
  ...pgConnectionOptions,
  cache: false,
  subscribers: [],
  entities: [User, Session, Account, Verification],
  migrations: [
    CreateUser1786779403609,
    CreateSession1786779403609,
    CreateAccount1786779403609,
    CreateVerification1786779403609,
  ],
  migrationsRun: true,
  migrationsTableName: 'auth_migrations',
} as DataSourceOptions) as unknown as AuthDataSource;

const gitlabClientId = process.env.GITLAB_CLIENT_ID;
const gitlabClientSecret = process.env.GITLAB_CLIENT_SECRET;

const plugins = gitlabClientId && gitlabClientSecret ? [gitlabOAuth(gitlabClientId, gitlabClientSecret)] : [];

function gitlabOAuth(clientId: string, clientSecret: string) {
  const defaultRedirectUri = `${process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'}/api/auth/oauth2/callback/gitlab`;

  return genericOAuth({
    config: [
      {
        providerId: 'gitlab',
        clientId,
        clientSecret,
        authorizationUrl: 'https://gitlab.com/oauth/authorize',
        tokenUrl: 'https://gitlab.com/oauth/token',
        userInfoUrl: 'https://gitlab.com/api/v4/user',
        redirectURI: process.env.GITLAB_REDIRECT_URI ?? defaultRedirectUri,
        scopes: ['read_user'],
        getUserInfo: async (tokens) => {
          const response = await fetch('https://gitlab.com/api/v4/user', {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
          });
          if (!response.ok) {
            throw new Error(`GitLab user info request failed with status ${response.status}`);
          }
          const profile = (await response.json()) as GitLabProfile;
          return {
            id: String(profile.id),
            name: profile.username || profile.name,
            email: profile.email,
            image: profile.avatar_url,
            emailVerified: true,
            webUrl: profile.web_url,
          };
        },
      },
    ],
  });
}

const envTrustedOrigins = process.env.BETTER_AUTH_TRUSTED_ORIGINS
  ? process.env.BETTER_AUTH_TRUSTED_ORIGINS.split(',').map((o) => o.trim())
  : [];

const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_REQUESTS = 100;
const SECONDS_PER_DAY = 60 * 60 * 24;
const SESSION_EXPIRES_IN_SECONDS = 7 * SECONDS_PER_DAY;
const SESSION_UPDATE_AGE_SECONDS = SECONDS_PER_DAY;

export const auth = betterAuth({
  appName: 'Chaotic-AUR',
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  secret: process.env.BETTER_AUTH_SECRET,
  database: typeormAdapter(authDataSource, { outputDir: AUTH_GENERATED_DIR }),
  trustedOrigins: Array.from(
    new Set(['http://localhost:4201', 'https://aur.chaotic.cx', ...envTrustedOrigins]),
  ),
  rateLimit: {
    enabled: true,
    storage: 'memory',
    window: RATE_LIMIT_WINDOW_SECONDS,
    max: RATE_LIMIT_MAX_REQUESTS,
  },
  session: {
    expiresIn: SESSION_EXPIRES_IN_SECONDS,
    updateAge: SESSION_UPDATE_AGE_SECONDS,
  },
  account: {
    encryptOAuthTokens: true,
    storeStateStrategy: 'cookie',
  },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === 'production',
    defaultCookieAttributes: {
      sameSite: 'lax',
    },
    ipAddress: {
      ipAddressHeaders: ['x-forwarded-for', 'x-real-ip'],
    },
  },
  plugins,
});

export type Auth = typeof auth;
