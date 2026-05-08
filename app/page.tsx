// Root page just redirects via middleware (logged-out -> /login, logged-in -> /dashboard).
// This file exists so Next has a `/` route. Middleware handles the redirect.
export default function Root() {
  return null;
}
