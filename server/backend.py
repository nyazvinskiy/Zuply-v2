from fastapi import FastAPI, HTTPException, BackgroundTasks
import os
from pydantic import BaseModel
from aiogram import Bot
from aiogram.types import BufferedInputFile
import base64
from aiogram.client.session.aiohttp import AiohttpSession
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import aiohttp
from database import save_lead

# Load env
load_dotenv()
BOT_TOKEN = os.getenv("BOT_TOKEN")
ADMIN_IDS = os.getenv("ADMIN_IDS", "").split(",")
PROXY_URL = os.getenv("PROXY_URL")

app = FastAPI()

# Allow CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class LeadForm(BaseModel):
    name: str = ""
    phone: str = ""
    telegram: str = ""
    material: str = ""
    qty: str = ""
    comment: str = ""
    file: str = ""
    file_content: str = "" # Base64
    file_name: str = ""

async def send_to_telegram(form: LeadForm, lead_id: int):
    """Background task to send notification via Proxy"""
    if not BOT_TOKEN:
        print("❌ Telegram Error: Token not configured")
        return

    # High timeout for proxy uploads
    timeout = aiohttp.ClientTimeout(total=120)
    session = AiohttpSession(proxy=PROXY_URL, timeout=timeout) if PROXY_URL else None
    bot = Bot(token=BOT_TOKEN, session=session)
    
    # Text formatting
    message = (
        f"🚀 <b>Заявка №{lead_id} на Zuply!</b>\n\n"
        f"👤 <b>Имя:</b> {form.name or 'Не указано'}\n"
        f"📞 <b>Телефон:</b> {form.phone or 'Не указано'}\n"
        f"📱 <b>Telegram:</b> {form.telegram or 'Не указано'}\n"
        f"🛠 <b>Материал:</b> {form.material}\n"
        f"📦 <b>Тираж:</b> {form.qty or 'Не указано'}\n"
        f"📝 <b>Комментарий:</b> {form.comment or '—'}\n"
    )

    document = None
    if form.file_content and form.file_name:
        try:
            file_bytes = base64.b64decode(form.file_content.split(",")[-1])
            document = BufferedInputFile(file_bytes, filename=form.file_name)
        except Exception as e:
            print(f"❌ Error decoding file: {e}")

    for admin_id in ADMIN_IDS:
        admin_id = admin_id.strip()
        if not admin_id or admin_id == "YOUR_CHAT_ID":
            continue
        try:
            if document:
                await bot.send_document(chat_id=admin_id, document=document, caption=message, parse_mode="HTML")
            else:
                await bot.send_message(chat_id=admin_id, text=message, parse_mode="HTML")
            print(f"✅ Telegram: Delivered to {admin_id}")
        except Exception as e:
            print(f"❌ Telegram Error for {admin_id}: {e}")

    await bot.session.close()

@app.post("/submit")
async def submit_lead(form: LeadForm, background_tasks: BackgroundTasks):
    print(f"📥 Received lead from {form.name}.")
    
    # Ensure uploads directory exists
    UPLOAD_DIR = "uploads"
    if not os.path.exists(UPLOAD_DIR):
        os.makedirs(UPLOAD_DIR)

    lead_id = 0
    file_path = ""
    
    # Save to database and store file locally
    try:
        # First save to DB to get ID
        lead_id = save_lead(
            name=form.name,
            phone=form.phone,
            telegram=form.telegram,
            material=form.material,
            qty=form.qty,
            comment=form.comment,
            file_name=form.file_name
        )
        
        # Save file if exists
        if form.file_content and form.file_name:
            file_bytes = base64.b64decode(form.file_content.split(",")[-1])
            file_path = f"{UPLOAD_DIR}/{lead_id}_{form.file_name}"
            with open(file_path, "wb") as f:
                f.write(file_bytes)
            
            # Update path in DB
            from database import DB_PATH
            import sqlite3
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute('UPDATE leads SET file_path = ? WHERE id = ?', (file_path, lead_id))
            conn.commit()
            conn.close()
            
        print(f"💾 Lead saved to database with ID: {lead_id}. File saved to: {file_path}")
    except Exception as e:
        print(f"❌ Storage error: {e}")

    background_tasks.add_task(send_to_telegram, form, lead_id)
    return {"status": "ok", "message": "Lead received", "id": lead_id}

class AdminIDs(BaseModel):
    ids: str

@app.post("/set-ids")
async def set_ids(data: AdminIDs):
    global ADMIN_IDS
    try:
        # Update .env file
        with open(".env", "r", encoding="utf-8") as f:
            lines = f.readlines()
        
        with open(".env", "w", encoding="utf-8") as f:
            for line in lines:
                if line.startswith("ADMIN_IDS="):
                    f.write(f"ADMIN_IDS={data.ids}\n")
                else:
                    f.write(line)
        
        # Reload in memory
        ADMIN_IDS = data.ids.split(",")
        return {"status": "ok", "message": f"IDs updated to: {data.ids}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
