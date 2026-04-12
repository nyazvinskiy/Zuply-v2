
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
import os, base64, sqlite3
from pydantic import BaseModel
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware
from database import save_lead, DB_PATH

load_dotenv()
app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
UPLOAD_DIR = "uploads"

class LeadForm(BaseModel):
    name: str = ""
    phone: str = ""
    telegram: str = ""
    material: str = ""
    qty: str = ""
    comment: str = ""
    file: str = ""
    file_content: str = ""
    file_name: str = ""

class StatusUpdate(BaseModel):
    status: str

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def ensure_status_column():
    conn = get_db()
    try:
        conn.execute("ALTER TABLE leads ADD COLUMN status TEXT DEFAULT 'new'")
        conn.commit()
    except:
        pass
    finally:
        conn.close()

ensure_status_column()

@app.post("/submit")
async def submit_lead(form: LeadForm):
    if not os.path.exists(UPLOAD_DIR):
        os.makedirs(UPLOAD_DIR)
    lead_id = 0
    try:
        lead_id = save_lead(name=form.name, phone=form.phone, telegram=form.telegram, material=form.material, qty=form.qty, comment=form.comment, file_name=form.file_name)
        if form.file_content and form.file_name:
            file_bytes = base64.b64decode(form.file_content.split(",")[-1])
            file_path = f"{UPLOAD_DIR}/{lead_id}_{form.file_name}"
            with open(file_path, "wb") as f:
                f.write(file_bytes)
            conn = get_db()
            conn.execute("UPDATE leads SET file_path = ? WHERE id = ?", (file_path, lead_id))
            conn.commit()
            conn.close()
    except Exception as e:
        print(f"Error: {e}")
    return {"status": "ok", "message": "Lead received", "id": lead_id}

@app.get("/leads")
def list_leads():
    conn = get_db()
    rows = conn.execute("SELECT id, name, phone, telegram, material, qty, comment, file_name, file_path, status, created_at FROM leads ORDER BY id DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.put("/leads/{lead_id}/status")
def update_status(lead_id: int, body: StatusUpdate):
    if body.status not in ("new", "work", "closed"):
        raise HTTPException(status_code=400, detail="Invalid status")
    conn = get_db()
    cur = conn.execute("UPDATE leads SET status = ? WHERE id = ?", (body.status, lead_id))
    if cur.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Not found")
    conn.commit()
    conn.close()
    return {"status": "ok"}

@app.delete("/leads/{lead_id}")
def delete_lead(lead_id: int):
    conn = get_db()
    row = conn.execute("SELECT file_path FROM leads WHERE id = ?", (lead_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Not found")
    conn.execute("DELETE FROM leads WHERE id = ?", (lead_id,))
    conn.commit()
    conn.close()
    if row["file_path"] and os.path.exists(row["file_path"]):
        os.remove(row["file_path"])
    return {"status": "ok"}

@app.get("/leads/{lead_id}/file")
def download_file(lead_id: int):
    conn = get_db()
    row = conn.execute("SELECT file_path, file_name FROM leads WHERE id = ?", (lead_id,)).fetchone()
    conn.close()
    if not row or not row["file_path"] or not os.path.exists(row["file_path"]):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path=row["file_path"], filename=row["file_name"], media_type="application/octet-stream")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
