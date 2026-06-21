"""fastapi-users wiring: user manager, auth backend (cookie + JWT), OAuth."""
import os

from fastapi import Depends, Response
from fastapi.responses import RedirectResponse
from fastapi_users import BaseUserManager, FastAPIUsers, IntegerIDMixin
from fastapi_users.authentication import (
    AuthenticationBackend,
    CookieTransport,
    JWTStrategy,
)
from httpx_oauth.clients.google import GoogleOAuth2

from .db import User, get_user_db

# A stable SESSION_SECRET keeps logins valid across restarts/replicas; fall back
# to an ephemeral one for local dev (logins won't survive a restart then).
SESSION_SECRET = os.environ.get("SESSION_SECRET")
if not SESSION_SECRET:
    SESSION_SECRET = os.urandom(32).hex()
    print("WARNING: SESSION_SECRET not set; using an ephemeral secret. "
          "Logins will not survive a restart.")

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "false").lower() in ("1", "true", "yes")


class UserManager(IntegerIDMixin, BaseUserManager[User, int]):
    reset_password_token_secret = SESSION_SECRET
    verification_token_secret = SESSION_SECRET

    async def on_after_register(self, user: User, request=None):
        print(f"User registered: id={user.id} email={user.email}")


async def get_user_manager(user_db=Depends(get_user_db)):
    yield UserManager(user_db)


class RedirectCookieTransport(CookieTransport):
    """Cookie transport that 302-redirects to the app after login.

    The default returns 204, which shows a blank page when the Google OAuth
    callback is hit via a top-level browser navigation. We keep the Set-Cookie
    and turn the response into a redirect to "/".
    """

    async def get_login_response(self, token: str) -> Response:
        base = await super().get_login_response(token)
        redirect = RedirectResponse("/", status_code=302)
        cookie = base.headers.get("set-cookie")
        if cookie:
            redirect.headers["set-cookie"] = cookie
        return redirect


cookie_transport = RedirectCookieTransport(
    cookie_name="scratchlabauth",
    cookie_max_age=86400,
    cookie_secure=COOKIE_SECURE,
)


def get_jwt_strategy() -> JWTStrategy:
    return JWTStrategy(secret=SESSION_SECRET, lifetime_seconds=86400)


auth_backend = AuthenticationBackend(
    name="cookie",
    transport=cookie_transport,
    get_strategy=get_jwt_strategy,
)

google_oauth_client = GoogleOAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)

fastapi_users = FastAPIUsers[User, int](get_user_manager, [auth_backend])

current_active_user = fastapi_users.current_user(active=True)
