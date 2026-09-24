from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path
from app.routes import router
from app.history.store import init_db
from app.measurement.store import init_measurements_table
from app.business.profile import init_profile_table
from app.knowledge.store import init_knowledge_tables

app = FastAPI(title="Roofing Quote Bot")

init_db()
init_measurements_table()
init_profile_table()
init_knowledge_tables()

app.include_router(router)

static_dir = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.get("/")
async def index():
    return FileResponse(static_dir / "index.html")
