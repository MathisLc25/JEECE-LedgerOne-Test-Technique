import requests
from faker import Faker
from datetime import date, timedelta
import random

API_URL = "http://127.0.0.1:8001/api/transactions/" 
NUM_TRANSACTIONS = 1500  
CATEGORY_IDS = [1, 2, 3, 4] 

fake = Faker()

def generate_random_date(start_date, end_date):
    return start_date + timedelta(days=random.randint(0, (end_date - start_date).days))

def seed_data():
    print(f"--- Début de l'insertion de {NUM_TRANSACTIONS} transactions ---")

    end_date = date.today()
    start_date = end_date - timedelta(days=18 * 30) 

    for i in range(NUM_TRANSACTIONS):
        amount = round(random.uniform(5.0, 500.0), 2)
        
        if random.random() < 0.2:
            amount *= -1 
        
        transaction_data = {
            "date": generate_random_date(start_date, end_date).isoformat(),
            "description": fake.sentence(nb_words=5),
            "amount": amount,
            "category_id": random.choice(CATEGORY_IDS) if CATEGORY_IDS else None
        }

        try:
            response = requests.post(API_URL, json=transaction_data)
            response.raise_for_status() 

            if (i + 1) % 100 == 0:
                print(f"Inséré {i + 1} transactions...")
        except requests.exceptions.RequestException as e:
            print(f"Erreur d'insertion à la transaction {i + 1}: {e}")
            break 
            
    print("--- Insertion terminée ---")

if __name__ == "__main__":
    seed_data()