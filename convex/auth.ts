import { components, internal } from "./_generated/api";
import { setupCore } from "@convex-dev/auth/core/setup";
import { setupUsernamePassword } from "@convex-dev/auth/providers/password/setup";
import { setupAnonymous } from "@convex-dev/auth/providers/anonymous/setup";

const core = setupCore({ component: components.auth });
export const { signOut, refreshSession, isAuthenticated } = core;

// Board creators: username + password account.
export const { signUpWithPassword, signInWithPassword } =
  setupUsernamePassword(core, {
    component: components.authPasswordProvider,
    usernameComponent: components.authUsername,
  }).attachUserCallbacks({ createUser: internal.users.createCreator });

// Participants: anonymous, one fresh account per sign-in, random display name.
export const { signInAnonymous } = setupAnonymous(core, {
  component: components.authAnonymous,
}).attachUserCallbacks({ createUser: internal.users.createParticipant });
