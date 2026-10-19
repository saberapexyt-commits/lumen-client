/**
 * The Microsoft (Entra) application client ID this build signs users in with.
 *
 * Other launchers ship one of these so users just click "Sign in". A client ID is public (there is no
 * secret), but it must be registered by whoever distributes the launcher AND approved by Mojang for the
 * Minecraft services API (https://aka.ms/AppRegistrationForm). Put yours here once, rebuild, and
 * users never see or enter it. Never reuse another launcher's ID.
 */
export const BUILTIN_CLIENT_ID = '';
