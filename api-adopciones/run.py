import os
import sys
import uvicorn
from dotenv import load_dotenv

# Cargar .env de api-adopciones específicamente
load_dotenv(override=True)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8002))
    print("================================================================")
    print(f"🚀 Iniciando API 2 (Adopciones) en http://localhost:{port}")
    print(f"📖 Documentación Swagger UI: http://localhost:{port}/docs")
    print("================================================================")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)

