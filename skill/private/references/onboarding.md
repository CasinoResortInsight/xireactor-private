# Invite Onboarding

New users join an organization through invite codes.

1. **Admin generates an invite** — via the web API (`POST /invitations`) or admin dashboard.
2. **Admin shares the code** — provides the invite code (`CTX-XXXX-XXXX`) and one-time
   token to the new user.
3. **New user redeems** — call `redeem_invite` with the code, token, email, and display
   name.
4. **Store the API key** — the response includes a one-time API key. Store it securely; it
   won't be shown again.

After redemption, the user has an account and API key. Future sessions authenticate
normally via the API key.

**Important:** Invite redemption is single-use on *attempt* — a failed attempt (wrong
token, expired) permanently invalidates the invite.
