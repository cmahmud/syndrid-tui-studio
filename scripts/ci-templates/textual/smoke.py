#!/usr/bin/env python3
"""Mount the generated Textual app under its headless test driver and confirm
it comes up and tears down cleanly. Content assertions live in the
exporter's own vitest snapshot/regression tests — this only proves the file
the exporter emits parses and runs against real textual.

Usage: python smoke.py <path-to-generated-app.py>
"""

import asyncio
import importlib.util
import sys


def load_app_module(path: str):
    spec = importlib.util.spec_from_file_location("generated_app", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


async def main(path: str) -> None:
    module = load_app_module(path)
    app = module.MyApp()
    async with app.run_test() as pilot:
        await pilot.pause()
    print("Textual app mounted and unmounted cleanly")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1]))
