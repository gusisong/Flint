from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass
from typing import Callable


TaskCallable = Callable[[threading.Event], None]


@dataclass
class TaskState:
    task_id: str
    module_id: str
    status: str
    progress: float
    message: str
    updated_at: float


class TaskManager:
    def __init__(self, global_stop_event: threading.Event) -> None:
        self.global_stop_event = global_stop_event
        self._lock = threading.RLock()
        self._states: dict[str, TaskState] = {}
        self._task_stop_events: dict[str, threading.Event] = {}
        self._threads: dict[str, threading.Thread] = {}

    def submit(self, module_id: str, target: TaskCallable) -> str:
        task_id = str(uuid.uuid4())
        stop_event = threading.Event()

        with self._lock:
            self._task_stop_events[task_id] = stop_event
            self._states[task_id] = TaskState(
                task_id=task_id,
                module_id=module_id,
                status="RUNNING",
                progress=0.0,
                message="Task started",
                updated_at=time.time(),
            )

        thread = threading.Thread(
            target=self._run_task,
            args=(task_id, target, stop_event),
            daemon=True,
        )
        with self._lock:
            self._threads[task_id] = thread
        thread.start()
        return task_id

    def _run_task(self, task_id: str, target: TaskCallable, local_stop_event: threading.Event) -> None:
        try:
            target(local_stop_event)
            if local_stop_event.is_set() or self.global_stop_event.is_set():
                self.update(task_id, "CANCELED", 0.0, "Task canceled")
            else:
                self.update(task_id, "SUCCESS", 1.0, "Task completed")
        except Exception as exc:  # noqa: BLE001
            self.update(task_id, "FAILED", 0.0, str(exc))
        finally:
            with self._lock:
                self._threads.pop(task_id, None)
                self._task_stop_events.pop(task_id, None)

    def update(self, task_id: str, status: str, progress: float, message: str) -> None:
        with self._lock:
            if task_id not in self._states:
                return
            self._states[task_id] = TaskState(
                task_id=task_id,
                module_id=self._states[task_id].module_id,
                status=status,
                progress=progress,
                message=message,
                updated_at=time.time(),
            )

    def cancel(self, task_id: str) -> None:
        with self._lock:
            stop_event = self._task_stop_events.get(task_id)
        if stop_event:
            stop_event.set()

    def cancel_all(self) -> None:
        self.global_stop_event.set()
        with self._lock:
            events = list(self._task_stop_events.values())
        for event in events:
            event.set()

    def wait_for_all(self, timeout_seconds: float | None = None) -> None:
        with self._lock:
            threads = list(self._threads.values())
        for thread in threads:
            thread.join(timeout=timeout_seconds)

    def reset_global_stop(self) -> None:
        self.global_stop_event.clear()

    def list_states(self) -> list[TaskState]:
        with self._lock:
            return list(self._states.values())
