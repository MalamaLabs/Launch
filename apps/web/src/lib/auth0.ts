import { Auth0Client } from '@auth0/nextjs-auth0/server'

/**
 * Server-side Auth0 session (Regular Web Application).
 * Routes: /auth/login, /auth/logout, /auth/callback, /auth/profile, /auth/access-token (see proxy).
 * Env: AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, AUTH0_SECRET, APP_BASE_URL (optional).
 */
export const auth0 = new Auth0Client({
  signInReturnToPath: '/dashboard',
  ...(process.env.AUTH0_DOMAIN ? {} : {
    domain: 'dummy.auth0.com',
    clientId: 'dummy_client_id',
    clientSecret: 'dummy_client_secret',
    secret: 'dummy_secret_required_to_be_32_characters_long',
  })
})
