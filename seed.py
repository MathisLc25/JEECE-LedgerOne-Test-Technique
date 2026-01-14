import requests
from faker import Faker
from datetime import date, timedelta
import random

API_URL_BASE = "http://127.0.0.1:8001/api"
NUM_TRANSACTIONS = 1000 

fake = Faker()

def setup_categories():
    categories = [
        {"name": "Logement", "budget": 800.0},
        {"name": "Alimentation", "budget": 200.0},
        {"name": "Loisirs", "budget": 50.0},
        {"name": "Revenu", "budget": 0.0}
    ]
    created_ids = []
    print("--- Création des 4 Catégories ---")
    for cat in categories:
        try:
            resp = requests.post(f"{API_URL_BASE}/categories/", json=cat)
            if resp.status_code in [200, 201]:
                new_id = resp.json()["id"]
                created_ids.append(new_id)
                print(f"Catégorie '{cat['name']}' créée (ID: {new_id})")
        except:
            print(f"Erreur lors de la création de {cat['name']}")
    return created_ids

def seed_data():
    cat_ids = setup_categories()
    if len(cat_ids) < 4:
        print("Attention: Moins de 4 catégories ont été créées. Vérifiez si l'API est lancée.")
        return

    print(f"--- Insertion de {NUM_TRANSACTIONS} transactions ---")
    end_date = date.today()
    start_date = end_date - timedelta(days=18 * 30) 

    for i in range(NUM_TRANSACTIONS):
        chosen_cat_id = random.choice(cat_ids)
        
        if chosen_cat_id == cat_ids[3]: 
            amount = -abs(round(random.uniform(2000.0, 3500.0), 2))
        elif chosen_cat_id == cat_ids[0]: 
            amount = 900.0 if random.random() > 0.1 else 30.0
        else: 
            amount = round(random.uniform(10.0, 150.0), 2)

        transaction_data = {
            "date": (start_date + timedelta(days=random.randint(0, (end_date - start_date).days))).isoformat(),
            "description": fake.sentence(nb_words=3),
            "amount": amount,
            "category_id": chosen_cat_id
        }
        try:
            requests.post(f"{API_URL_BASE}/transactions/", json=transaction_data)
            if (i + 1) % 100 == 0:
                print(f"Progression: {i + 1} transactions insérées...")
        except:
            break
            
    print("--- TERMINÉ : Votre dashboard à 4 catégories est prêt ! ---")

if __name__ == "__main__":
    seed_data()