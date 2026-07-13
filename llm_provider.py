from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class LLMProvider(Protocol):
    def generate(self, question: str, context: str) -> str: ...


class DisabledLLMProvider:
    def generate(self, question: str, context: str) -> str:
        raise NotImplementedError


def get_default_llm_provider() -> LLMProvider:
    return DisabledLLMProvider()
