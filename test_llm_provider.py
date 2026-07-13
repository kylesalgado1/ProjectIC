from __future__ import annotations

import unittest

from llm_provider import (
    DisabledLLMProvider,
    LLMProvider,
    get_default_llm_provider,
)


class DisabledLLMProviderTests(unittest.TestCase):
    def test_generate_raises_not_implemented_error(self) -> None:
        provider = DisabledLLMProvider()
        with self.assertRaises(NotImplementedError):
            provider.generate("What packages do you offer?", "Location: Downtown")

    def test_is_llm_provider_compatible(self) -> None:
        self.assertIsInstance(DisabledLLMProvider(), LLMProvider)


class GetDefaultLLMProviderTests(unittest.TestCase):
    def test_returns_disabled_llm_provider(self) -> None:
        self.assertIsInstance(get_default_llm_provider(), DisabledLLMProvider)

    def test_returns_llm_provider_compatible_object(self) -> None:
        self.assertIsInstance(get_default_llm_provider(), LLMProvider)

    def test_default_provider_generate_raises_not_implemented_error(self) -> None:
        with self.assertRaises(NotImplementedError):
            get_default_llm_provider().generate("question", "context")


if __name__ == "__main__":
    unittest.main()
