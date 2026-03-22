import os
import asyncio
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command
from aiogram.types import ReplyKeyboardMarkup, KeyboardButton, InlineKeyboardMarkup, InlineKeyboardButton, FSInputFile
from aiogram.client.session.aiohttp import AiohttpSession
from dotenv import load_dotenv
from database import get_all_leads, get_stats, DB_PATH
import sqlite3
from datetime import datetime, timedelta

# Load env variables
load_dotenv()
BOT_TOKEN = os.getenv("BOT_TOKEN")
ADMIN_IDS = os.getenv("ADMIN_IDS", "").split(",")
PROXY_URL = os.getenv("PROXY_URL")

if not BOT_TOKEN:
    print("Error: BOT_TOKEN not found in .env file")
    exit(1)

session = AiohttpSession(proxy=PROXY_URL) if PROXY_URL else None
bot = Bot(token=BOT_TOKEN, session=session)
dp = Dispatcher()

# Admin Keyboard
admin_kb = ReplyKeyboardMarkup(
    keyboard=[
        [KeyboardButton(text="📋 Список заявок"), KeyboardButton(text="📊 Статистика")]
    ],
    resize_keyboard=True
)

def is_admin(user_id: int):
    return str(user_id) in [id.strip() for id in ADMIN_IDS]

@dp.message(Command("start"))
async def cmd_start(message: types.Message):
    if is_admin(message.from_user.id):
        await message.answer(
            f"🛠 <b>Панель управления Zuply</b>\n\n"
            f"Добро пожаловать, администратор! Используйте меню ниже для работы с заявками.",
            reply_markup=admin_kb,
            parse_mode="HTML"
        )
    else:
        await message.answer(
            f"👋 Привет! Я бот Zuply.\n\n"
            f"Твой Chat ID: `{message.chat.id}`\n"
            f"Скопируй его и вставь в .env файл в поле ADMIN_IDS."
        )

@dp.message(F.text == "📊 Статистика")
async def show_stats(message: types.Message):
    if not is_admin(message.from_user.id): return
    
    stats = get_stats()
    await message.answer(
        f"📈 <b>Статистика заявок</b>\n\n"
        f"✅ Всего заявок: <b>{stats['total']}</b>\n"
        f"📅 За сегодня: <b>{stats['today']}</b>",
        parse_mode="HTML"
    )

@dp.message(F.text == "📋 Список заявок")
async def list_leads(message: types.Message):
    if not is_admin(message.from_user.id): return
    
    leads = get_all_leads(limit=50) # Increased limit
    if not leads:
        await message.answer("📭 Заявок пока нет.")
        return

    await message.answer("📋 <b>Полный список заявок:</b>", parse_mode="HTML")

    for lead in leads:
        # Time adjustment
        try:
            dt = datetime.strptime(lead['created_at'], '%Y-%m-%d %H:%M:%S')
            dt_moscow = dt + timedelta(hours=3)
            time_str = dt_moscow.strftime('%d.%m %H:%M')
        except:
            time_str = lead['created_at']
        
        caption = (
            f"🆔 <b>Заявка №{lead['id']}</b> | 🕒 {time_str}\n"
            f"👤 <b>Имя:</b> {lead['name'] or '—'}\n"
            f"📞 <b>Тел:</b> {lead['phone'] or '—'}\n"
            f"📱 <b>TG:</b> {lead['telegram'] or '—'}\n"
            f"🛠 <b>Мат:</b> {lead['material']}\n"
            f"📦 <b>Тир:</b> {lead['qty']} шт.\n"
            f"📝 <b>Комм:</b> {lead['comment'] or '—'}\n"
        )
        
        kb = None
        if lead['file_path'] and os.path.exists(lead['file_path']):
            kb = InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(text=f"📂 Файл (№{lead['id']})", callback_data=f"file_{lead['id']}")]
            ])
            
        await message.answer(caption, reply_markup=kb, parse_mode="HTML")

@dp.callback_query(F.data.startswith("file_"))
async def send_lead_file(callback: types.CallbackQuery):
    if not is_admin(callback.from_user.id): return
    
    lead_id = callback.data.split("_")[1]
    
    # Get from DB
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute('SELECT file_path, file_name FROM leads WHERE id = ?', (lead_id,))
    lead = cursor.fetchone()
    conn.close()
    
    if lead and lead['file_path'] and os.path.exists(lead['file_path']):
        await callback.message.answer_document(
            document=FSInputFile(lead['file_path'], filename=lead['file_name']),
            caption=f"📂 Файл для заявки №{lead_id}"
        )
        await callback.answer()
    else:
        await callback.answer("❌ Файл не найден на сервере", show_alert=True)

async def main():
    print("Bot is starting...")
    try:
        await dp.start_polling(bot)
    except Exception as e:
        print(f"\n❌ Ошибка сети: {e}")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nБот остановлен.")
