import sqlite3
import os

DB_PATH = "leads.db"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            phone TEXT,
            telegram TEXT,
            material TEXT,
            qty TEXT,
            comment TEXT,
            file_name TEXT,
            file_path TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()

# Ensure DB is initialized on import
init_db()

def save_lead(name, phone, telegram, material, qty, comment, file_name, file_path=""):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO leads (name, phone, telegram, material, qty, comment, file_name, file_path)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (name, phone, telegram, material, qty, comment, file_name, file_path))
    lead_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return lead_id

def get_all_leads(limit=10, offset=0):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM leads ORDER BY created_at DESC LIMIT ? OFFSET ?', (limit, offset))
    rows = cursor.fetchall()
    conn.close()
    return rows

def get_stats():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('SELECT COUNT(*) FROM leads')
    total = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM leads WHERE date(created_at) = date('now')")
    today = cursor.fetchone()[0]
    conn.close()
    return {"total": total, "today": today}

if __name__ == "__main__":
    init_db()
    print("Database initialized.")
