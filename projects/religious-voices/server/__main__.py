"""Allow running the server with `python -m server`.

Convenience entry point that forwards to uvicorn. Useful for IDEs and
process managers that prefer `python -m <module>` over a separate
uvicorn invocation.
"""

from __future__ import annotations

import os
import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "server.main:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 8000)),
        reload=os.environ.get("RELOAD", "0") == "1",
        log_level="info",
    )
