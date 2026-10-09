"""Transaction boundary around authorized application commands."""
from collections.abc import Callable
from erp.application.ports import StateRepository


class Operations:
    def __init__(self, repository: StateRepository, command: Callable):
        self.repository = repository
        self.command = command

    def execute(self, user: dict, action: str, data: dict) -> dict:
        return self.repository.transact(lambda state: self.command(state, user, action, data))
