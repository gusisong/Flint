from __future__ import annotations

from unittest import TestCase
from unittest.mock import patch

from modules.email_sender.rate_limiter import RateLimiter, RATE_INITIAL_DELAY


class TestRateLimiter(TestCase):
    def test_success_streak_reduces_delay(self) -> None:
        limiter = RateLimiter()
        self.assertEqual(limiter.delay, RATE_INITIAL_DELAY)

        limiter.on_success()
        limiter.on_success()
        limiter.on_success()

        self.assertLess(limiter.delay, RATE_INITIAL_DELAY)

    @patch("modules.email_sender.rate_limiter.time.sleep", return_value=None)
    def test_421_triggers_backoff(self, _sleep) -> None:
        limiter = RateLimiter()
        limiter.on_421()
        limiter.on_421()
        before = limiter.delay
        limiter.on_421()
        self.assertGreaterEqual(limiter.delay, before)
