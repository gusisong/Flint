from __future__ import annotations

import time
from collections import deque

RATE_INITIAL_DELAY = 1.0
RATE_MAX_DELAY = 10.0
RATE_MIN_DELAY = 0.1
THRESHOLD_421 = 3
WINDOW_421 = 60.0
COOLDOWN_SECONDS = 30.0
EMA_ALPHA = 0.3


class RateLimiter:
    def __init__(self) -> None:
        self.delay = RATE_INITIAL_DELAY
        self._errors_421: deque[float] = deque()
        self._success_streak = 0

    def before_send(self) -> None:
        time.sleep(self.delay)

    def on_success(self) -> None:
        self._success_streak += 1
        if self._success_streak >= 3:
            target = max(RATE_MIN_DELAY, self.delay * 0.9)
            self.delay = (EMA_ALPHA * target) + ((1 - EMA_ALPHA) * self.delay)
            self._success_streak = 0

    def on_421(self) -> None:
        now = time.time()
        self._errors_421.append(now)
        self._success_streak = 0

        while self._errors_421 and now - self._errors_421[0] > WINDOW_421:
            self._errors_421.popleft()

        if len(self._errors_421) >= THRESHOLD_421:
            time.sleep(COOLDOWN_SECONDS)
            self.delay = min(RATE_MAX_DELAY, self.delay * 2)
            self._errors_421.clear()

    def on_generic_error(self) -> None:
        self._success_streak = 0
        self.delay = min(RATE_MAX_DELAY, self.delay * 1.2)
