import os
from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uvicorn
import base64

app = FastAPI(title="EV Tracking Server")

# ── In-memory stores (only latest record per EV is kept) ──────────────────────
# { ev_id: {"ev_id": ..., "lat": ..., "lng": ..., "timestamp": ...} }
ev_locations: dict = {}

# { ev_id: {"message": ..., "timestamp": ..., "read": bool} }
ev_messages: dict = {}
# ─────────────────────────────────────────────────────────────────────────────

# Allow CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Authentication dictionary (EV Admins)
VALID_USERS = {
    "admin1:pass123": True,
    "admin2:pass456": True
}

class LocationData(BaseModel):
    ev_id: str
    lat: float
    lng: float
    timestamp: Optional[str] = None

class MessageData(BaseModel):
    ev_id: str
    message: str

class LoginData(BaseModel):
    username: str
    password: str


# ── Helper: verify Basic auth from request header ─────────────────────────────
def verify_auth(req: Request):
    auth_header = req.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Basic "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    try:
        encoded_creds = auth_header.replace("Basic ", "")
        credentials = base64.b64decode(encoded_creds).decode("utf-8")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid credentials format")
    if not VALID_USERS.get(credentials):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return credentials


# ── Login endpoint ────────────────────────────────────────────────────────────
@app.post("/api/login")
async def login(data: LoginData):
    creds = f"{data.username}:{data.password}"
    if not VALID_USERS.get(creds):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return {"status": "success", "user": data.username}


@app.post("/api/location")
async def update_location(data: LocationData):
    if not data.timestamp:
        data.timestamp = datetime.utcnow().isoformat()
    # Overwrite with latest coordinate — no history kept
    ev_locations[data.ev_id] = data.model_dump()
    return {"status": "success"}


@app.get("/api/evs")
async def get_all_evs(req: Request):
    verify_auth(req)
    # Return the latest position for every EV
    return list(ev_locations.values())


@app.post("/api/message")
async def send_message(data: MessageData, req: Request):
    verify_auth(req)
    ev_messages[data.ev_id] = {
        "message": data.message,
        "timestamp": datetime.utcnow().isoformat(),
        "read": False,
    }
    return {"status": "Message sent!"}


@app.get("/api/message/{ev_id}")
async def get_message(ev_id: str):
    msg = ev_messages.get(ev_id)
    if msg and not msg.get("read", True):
        # Mark as read
        ev_messages[ev_id]["read"] = True
        return {"message": msg["message"]}
    return {"message": ""}


# Mount static frontend
frontend_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
if os.path.exists(frontend_path):
    app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
