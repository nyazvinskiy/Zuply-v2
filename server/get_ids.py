import requests
import json

TOKEN = "8690599672:AAHSjFI50OLXxSnYv7cuAPyN5HDYM2Qi_qw"
URL = f"https://api.telegram.org/bot{TOKEN}/getUpdates"

try:
    print(f"Fetching from {URL}...")
    response = requests.get(URL, timeout=30)
    if response.status_code == 200:
        data = response.json()
        print(json.dumps(data, indent=2, ensure_ascii=False))
    else:
        print(f"Error: {response.status_code}")
        print(response.text)
except Exception as e:
    print(f"Exception: {e}")
