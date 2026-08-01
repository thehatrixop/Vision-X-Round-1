import os
import sys
import uvicorn

if __name__ == "__main__":
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    root_dir = os.path.dirname(backend_dir)
    if root_dir not in sys.path:
        sys.path.insert(0, root_dir)
    if backend_dir not in sys.path:
        sys.path.insert(0, backend_dir)
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
