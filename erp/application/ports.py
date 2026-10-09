"""Ports for an atomic ERP state aggregate; no SQL or HTTP types."""
from collections.abc import Callable
from typing import Protocol, TypeVar

Result = TypeVar('Result')


class StateRepository(Protocol):
    def read(self) -> dict: ...
    def read_serialized(self) -> str: ...
    def transact(self, operation: Callable[[dict], Result]) -> Result: ...


class BiometricReader(Protocol):
    def __call__(self, data: dict) -> tuple[str, list[list[str]], str]: ...
