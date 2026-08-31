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
import { AddUserGroups1787411324082 } from './generated/migrations/1787411324082-add-user-groups';
import { AddAccountIssuer1787942324294 } from './generated/migrations/1787942324294-add-account-issuer';
import { GITLAB_LOGIN_GROUPS } from './gitlab-groups';

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
    AddUserGroups1787411324082,
    AddAccountIssuer1787942324294,
  ],
  migrationsRun: true,
  migrationsTableName: 'auth_migrations',
} as DataSourceOptions) as unknown as AuthDataSource;

const gitlabClientId = process.env.GITLAB_CLIENT_ID;
const gitlabClientSecret = process.env.GITLAB_CLIENT_SECRET;

const plugins = gitlabClientId && gitlabClientSecret ? [gitlabOAuth(gitlabClientId, gitlabClientSecret)] : [];

export async function checkGitLabGroupMembership(
  group: string,
  userId: number | string,
  token?: string,
  fetchFn = fetch,
): Promise<boolean> {
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetchFn(`https://gitlab.com/api/v4/groups/${encodeURIComponent(group)}/members/all/${userId}`, {
    headers,
  });
  return res.ok;
}

function gitlabOAuth(clientId: string, clientSecret: string) {
  const defaultRedirectUri = `${process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'}/api/auth/callback/gitlab`;
  const allowedGroup = process.env.GITLAB_ALLOWED_GROUP ?? 'chaotic-aur';

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
        overrideUserInfo: true,
        mapProfileToUser: (profile) => ({
          // getUserInfo below resolves the GitLab groups. This mapping
          // writes them to the user.groups column.
          groups: profile.groups as string[],
        }),
        getUserInfo: async (tokens) => {
          const response = await fetch('https://gitlab.com/api/v4/user', {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
          });
          if (!response.ok) {
            throw new Error(`GitLab user info request failed with status ${response.status}`);
          }
          const profile = (await response.json()) as GitLabProfile;

          const memberToken = process.env.GITLAB_TOKEN || process.env.CAUR_GITLAB_TOKEN || tokens.accessToken;
          if (allowedGroup && !(await checkGitLabGroupMembership(allowedGroup, profile.id, memberToken))) {
            return null;
          }

          const memberships = await Promise.all(
            GITLAB_LOGIN_GROUPS.map(async (group) =>
              (await checkGitLabGroupMembership(group, profile.id, memberToken)) ? group : null,
            ),
          );

          return {
            id: String(profile.id),
            name: profile.username || profile.name,
            email: profile.email,
            image: profile.avatar_url,
            emailVerified: true,
            webUrl: profile.web_url,
            groups: memberships.filter((group): group is (typeof GITLAB_LOGIN_GROUPS)[number] => group !== null),
          };
        },
      },
    ],
  });
}

const trustedOrigins = process.env.BETTER_AUTH_TRUSTED_ORIGINS
  ? process.env.BETTER_AUTH_TRUSTED_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean)
  : [];

const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_REQUESTS = 100;
const SECONDS_PER_DAY = 60 * 60 * 24;
const SESSION_EXPIRES_IN_SECONDS = 7 * SECONDS_PER_DAY;
const SESSION_UPDATE_AGE_SECONDS = SECONDS_PER_DAY;

const DISABLED_PATHS = [
  '/sign-up/email',
  '/sign-in/email',
  '/update-user',
  '/request-password-reset',
  '/reset-password/:token',
  '/reset-password',
  '/verify-password',
  '/change-password',
  '/set-password',
  '/change-email',
  '/send-verification-email',
  '/verify-email',
] as const;

const authBaseUrl = new URL(process.env.BETTER_AUTH_URL ?? 'http://localhost:3000');

export const auth = betterAuth({
  appName: 'Chaotic-AUR',
  baseURL: authBaseUrl.origin,
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: { enabled: false },
  disabledPaths: [...DISABLED_PATHS],
  database: typeormAdapter(authDataSource, { outputDir: AUTH_GENERATED_DIR }),
  trustedOrigins: [...new Set(trustedOrigins)],
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
  user: {
    additionalFields: {
      // Written from the GitLab profile at login (overrideUserInfo) and
      // consumed by RequireGroupGuard. '/update-user' is disabled below so
      // clients cannot forge memberships.
      groups: {
        type: 'string[]',
        defaultValue: [],
      },
    },
  },
  account: {
    encryptOAuthTokens: true,
    storeStateStrategy: 'cookie',
  },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === 'production',
    defaultCookieAttributes: {
      sameSite: 'none',
    },
    crossSubDomainCookies: {
      enabled: process.env.NODE_ENV === 'production',
      domain: process.env.AUTH_COOKIE_DOMAIN ?? '.chaotic.cx',
    },
    ipAddress: {
      ipAddressHeaders: ['cf-connecting-ip', 'x-forwarded-for', 'x-real-ip'],
    },
  },
  plugins,
});

export async function initializeAuthDataSource(): Promise<void> {
  if (!authDataSource.isInitialized) {
    await authDataSource.initialize();
  }
}
