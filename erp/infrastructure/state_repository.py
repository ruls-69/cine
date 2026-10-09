"""SQL adapter for the existing singleton aggregate, preserving row locking."""
import json
from collections.abc import Callable
from erp.application.ports import Result


class SqlStateRepository:
    def __init__(self, connection_factory: Callable):
        self.connection_factory = connection_factory

    def read_serialized(self) -> str:
        with self.connection_factory() as connection:
            row = connection.execute('SELECT body FROM state WHERE id=1').fetchone()
            if row is None:
                raise RuntimeError('Uninitialized')
            return row[0]

    def read(self) -> dict:
        return json.loads(self.read_serialized())

    def transact(self, operation: Callable[[dict], Result]) -> Result:
        with self.connection_factory() as connection:
            connection.execute('BEGIN IMMEDIATE')
            row = connection.execute('SELECT body FROM state WHERE id=1').fetchone()
            if row is None:
                raise RuntimeError('Uninitialized')
            state = json.loads(row[0])
            result = operation(state)
            connection.execute('UPDATE state SET body=? WHERE id=1',
                               (json.dumps(state, ensure_ascii=False),))
            return result
