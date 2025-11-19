from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from datetime import datetime, date, timedelta
from sqlmodel import SQLModel, create_engine, Field, Session, select
from typing import Optional, Annotated, List
from pydantic import BaseModel
import csv
from io import StringIO
from dateutil import parser as date_parser
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.sql import func 

# --- 1. DÉFINITION DES MODÈLES DE DONNÉES ---

class CategoryBase(SQLModel):
    name: str = Field(index=True, unique=True, min_length=1)
    color: Optional[str] = None
    monthly_budget: Optional[float] = Field(default=0.0, ge=0)

class Category(CategoryBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)

class TransactionBase(SQLModel):
    date: date
    description: str = Field(min_length=1)
    amount: float
    category_id: Optional[int] = Field(default=None, foreign_key="category.id", index=True)

class Transaction(TransactionBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)

# Suppression de CategoryCreate car la route utilisera CategoryBase
# class CategoryCreate(CategoryBase):
#     pass

class CategoryUpdate(SQLModel):
    name: Optional[str] = None
    color: Optional[str] = None
    monthly_budget: Optional[float] = Field(default=None, ge=0)

class TransactionCreate(TransactionBase):
    pass

class TransactionUpdate(SQLModel):
    date: Optional[date] = None
    description: Optional[str] = None
    amount: Optional[float] = None
    category_id: Optional[int] = None

# --- NOUVEAUX MODÈLES D'INSIGHTS ---

class CategorySummary(BaseModel):
    category_name: str
    spent_amount: float
    budget_limit: Optional[float] = None
    budget_remaining: Optional[float] = None

class MonthlySummary(BaseModel):
    month: str
    total_spent: float
    categories: List[CategorySummary]
    global_alerts: int = 0
    
class MonthlyTrend(BaseModel):
    month: str 
    total_spent: float
    moving_average_3m: Optional[float] = None
    
class TrendResponse(BaseModel):
    start_date: date
    end_date: date
    trends: List[MonthlyTrend]

class AlertDetail(BaseModel):
    scope: str
    category_name: Optional[str] = None
    budget: float
    actual_spent: float
    delta: float 

# --- 2. GESTION DE LA BASE DE DONNÉES (SQLite) ---

sqlite_file_name = "database.db"
sqlite_url = f"sqlite:///{sqlite_file_name}"

engine = create_engine(sqlite_url, echo=True) 

def create_db_and_tables():
    SQLModel.metadata.create_all(engine)

def get_session():
    with Session(engine) as session:
        yield session

DBSession = Annotated[Session, Depends(get_session)]

# --- 3. DÉFINITION DE L'APPLICATION FASTAPI ---

app = FastAPI(
    title="LedgerOne API",
    version="1.0.0",
    description="API REST pour la gestion financière LedgerOne.",
)

# Configuration du middleware CORS
origins = [
    "*", 
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"], 
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    create_db_and_tables()

# --- 4. ROUTES POUR LES CATÉGORIES (CRUD COMPLET) ---

@app.get("/")
def read_root():
    return {"message": "API LedgerOne démarrée avec succès. Consultez /docs pour la documentation."}


@app.post("/api/categories/", response_model=Category, status_code=201)
def create_category(category: CategoryBase, db: DBSession): # CORRIGÉ : UTILISE CategoryBase
    
    existing_category = db.exec(
        select(Category).where(Category.name == category.name)
    ).first()

    if existing_category:
        raise HTTPException(status_code=400, detail="Category with this name already exists")
    
    db_category = Category.model_validate(category)
    db.add(db_category)
    db.commit()
    db.refresh(db_category) 
    
    return db_category

@app.get("/api/categories/", response_model=List[Category])
def read_categories(db: DBSession):
    categories = db.exec(select(Category)).all()
    return categories

@app.patch("/api/categories/{category_id}", response_model=Category)
def update_category(category_id: int, category: CategoryUpdate, db: DBSession):
    db_category = db.get(Category, category_id)
    if not db_category:
        raise HTTPException(status_code=404, detail="Category not found")
        
    update_data = category.model_dump(exclude_unset=True)
    
    if 'name' in update_data and update_data['name'] != db_category.name:
         existing_category = db.exec(
             select(Category).where(Category.name == update_data['name'])
         ).first()
         if existing_category:
             raise HTTPException(status_code=400, detail="Category with this new name already exists")

    db_category.sqlmodel_update(update_data)
    
    db.add(db_category)
    db.commit()
    db.refresh(db_category)
    return db_category

@app.delete("/api/categories/{category_id}", status_code=204)
def delete_category(category_id: int, db: DBSession):
    db_category = db.get(Category, category_id)
    if not db_category:
        raise HTTPException(status_code=404, detail="Category not found")
        
    db.delete(db_category)
    db.commit()
    return 


# --- 5. ROUTES POUR LES TRANSACTIONS (CRUD COMPLET) ---

@app.post("/api/transactions/", response_model=Transaction, status_code=201)
def create_transaction(transaction: TransactionCreate, db: DBSession):
    
    if transaction.category_id is not None:
        existing_category = db.get(Category, transaction.category_id)
        if not existing_category:
            raise HTTPException(status_code=422, detail="Category ID not found")
    
    db_transaction = Transaction.model_validate(transaction)
    db.add(db_transaction)
    db.commit()
    db.refresh(db_transaction) 
    
    return db_transaction


@app.get("/api/transactions/", response_model=List[Transaction])
def read_transactions(
    db: DBSession,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    category_id: Optional[int] = None,
    q: Optional[str] = None,
    limit: int = 100,
    offset: int = 0
):
    
    statement = select(Transaction)

    if from_date:
        statement = statement.where(Transaction.date >= from_date)
    if to_date:
        statement = statement.where(Transaction.date <= to_date)
    if category_id is not None:
        statement = statement.where(Transaction.category_id == category_id)
    if q:
        statement = statement.where(Transaction.description.like(f"%{q}%"))

    statement = statement.order_by(Transaction.date.desc()).offset(offset).limit(limit)
    
    transactions = db.exec(statement).all()
    return transactions


@app.patch("/api/transactions/{transaction_id}", response_model=Transaction)
def update_transaction(transaction_id: int, transaction: TransactionUpdate, db: DBSession):
    db_transaction = db.get(Transaction, transaction_id)
    if not db_transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
        
    update_data = transaction.model_dump(exclude_unset=True)
    
    if 'category_id' in update_data and update_data['category_id'] is not None:
         existing_category = db.get(Category, update_data['category_id'])
         if not existing_category:
             raise HTTPException(status_code=422, detail="Category ID not found")

    db_transaction.sqlmodel_update(update_data)
    
    db.add(db_transaction)
    db.commit()
    db.refresh(db_transaction)
    return db_transaction

@app.delete("/api/transactions/{transaction_id}", status_code=204)
def delete_transaction(transaction_id: int, db: DBSession):
    db_transaction = db.get(Transaction, transaction_id)
    if not db_transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
        
    db.delete(db_transaction)
    db.commit()
    return

# --- 6. ROUTE D'IMPORT CSV ---

@app.post("/api/import/csv")
async def import_csv(
    db: DBSession, 
    file: UploadFile = File(...) 
):
    inserted = 0
    skipped = 0
    errors = []

    content = await file.read()
    content = content.decode("utf-8")
    
    csv_file = StringIO(content)
    reader = csv.DictReader(csv_file)
    
    required_fields = ['date', 'description', 'amount']
    if not all(field in reader.fieldnames for field in required_fields):
        raise HTTPException(
            status_code=400, 
            detail=f"CSV must contain the following columns: {', '.join(required_fields)}"
        )

    for i, row in enumerate(reader, 1):
        try:
            category_id = None
            category_name = row.get('category', '').strip()
            
            if category_name:
                existing_category = db.exec(select(Category).where(Category.name == category_name)).first()
                if not existing_category:
                    new_category = Category(name=category_name)
                    db.add(new_category)
                    db.commit()
                    db.refresh(new_category)
                    category_id = new_category.id
                else:
                    category_id = existing_category.id
            
            transaction_date = date_parser.isoparse(row['date']).date() 
            amount = float(row['amount']) 
            
            db_transaction = TransactionCreate(
                date=transaction_date,
                description=row['description'],
                amount=amount,
                category_id=category_id
            )
            
            db_transaction_full = Transaction.model_validate(db_transaction)
            db.add(db_transaction_full)
            db.commit()
            db.refresh(db_transaction_full)
            inserted += 1

        except (ValueError, KeyError, TypeError, date_parser.ParserError) as e:
            errors.append({"line": i, "data": row, "error": str(e)})
            db.rollback() 
            skipped += 1
        
    return {"inserted": inserted, "skipped": skipped, "errors": errors}

# --- FONCTION DE CALCUL POUR LA MOYENNE GLISSANTE ---

def calculate_moving_average(monthly_data: List[MonthlyTrend], window: int = 3):
    """Calcule la moyenne glissante (Simple Moving Average - SMA) sur une fenêtre de 3 mois."""
    
    data_points = [m.total_spent for m in monthly_data]
    
    for i in range(len(data_points)):
        # Définir la fenêtre de 3 mois: (i), (i-1), (i-2)
        start_index = max(0, i - window + 1)
        
        # Récupérer les montants dans la fenêtre
        window_slice = data_points[start_index : i + 1]
        
        # Calculer la moyenne uniquement si la fenêtre est pleine (3 mois)
        if len(window_slice) == window:
            avg = sum(window_slice) / window
            monthly_data[i].moving_average_3m = avg
        
    return monthly_data


# --- 7. ROUTES POUR LES INSIGHTS (Phase 4) ---

@app.get("/api/insights/summary", response_model=MonthlySummary)
def get_monthly_summary(month: str, db: DBSession):
    """
    Calcule le total dépensé et le total par catégorie pour le mois spécifié (YYYY-MM).
    """
    
    # 1. Définir la période et valider le format YYYY-MM
    try:
        date.fromisoformat(f"{month}-01") 
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid month format. Use YYYY-MM.")

    # 2. Requête d'agrégation : Somme des montants par catégorie
    stats = db.exec(
        select(
            Category.name,
            Category.monthly_budget,
            func.sum(Transaction.amount).label("spent_amount")
        )
        .join(Category, isouter=True) 
        .where(func.strftime('%Y-%m', Transaction.date) == month)
        .group_by(Category.name, Category.monthly_budget)
    ).all()

    # 3. Formater les résultats
    summary_categories = []
    total_spent_all = 0.0
    global_alerts_count = 0
    
    for name, budget, spent in stats:
        spent = spent if spent is not None else 0.0 
        actual_spent = spent 
        total_spent_all += actual_spent 
        
        # Calculer le budget restant
        budget_remaining = (budget or 0) - spent # Correction du budget restant (budget - spent)
        
        if budget is not None and budget_remaining < 0:
             global_alerts_count += 1
        
        summary_categories.append(CategorySummary(
            category_name=name,
            spent_amount=actual_spent,
            budget_limit=budget,
            budget_remaining=budget_remaining
        ))

    # 4. Renvoyer le résumé mensuel
    return MonthlySummary(
        month=month,
        total_spent=total_spent_all,
        categories=summary_categories,
        global_alerts=global_alerts_count
    )


@app.get("/api/insights/trend", response_model=TrendResponse)
def get_monthly_trend(
    db: DBSession,
    from_date: date,
    to_date: date
):
    
    # 1. Requête SQL d'agrégation : Somme par YYYY-MM sur la période
    stats = db.exec(
        select(
            func.strftime('%Y-%m', Transaction.date).label("month"),
            func.sum(Transaction.amount).label("total_spent")
        )
        .where(Transaction.date >= from_date)
        .where(Transaction.date <= to_date)
        .group_by(func.strftime('%Y-%m', Transaction.date))
        .order_by(func.strftime('%Y-%m', Transaction.date)) 
    ).all()

    # 2. Convertir les résultats SQL en objets Pydantic (MonthlyTrend)
    monthly_data = []
    for month, spent in stats:
        monthly_data.append(MonthlyTrend(
            month=month,
            total_spent=spent if spent is not None else 0.0
        ))
        
    # 3. Calculer la Moyenne Glissante
    monthly_data = calculate_moving_average(monthly_data, window=3)

    # 4. Renvoyer la réponse
    return TrendResponse(
        start_date=from_date,
        end_date=to_date,
        trends=monthly_data
    )

@app.get("/api/alerts", response_model=List[AlertDetail])
def get_alerts(month: str, db: DBSession):
    
    # 1. Obtenir le résumé agrégé pour le mois (même logique que get_monthly_summary)
    try:
        # 1.1. Définir la période et valider le format YYYY-MM
        date.fromisoformat(f"{month}-01") 
        
        # 1.2. Requête d'agrégation : Somme des montants par catégorie
        stats = db.exec(
            select(
                Category.name,
                Category.monthly_budget,
                func.sum(Transaction.amount).label("spent_amount")
            )
            .join(Category, isouter=True) 
            .where(func.strftime('%Y-%m', Transaction.date) == month)
            .group_by(Category.name, Category.monthly_budget)
        ).all()
        
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid month format. Use YYYY-MM.")
        
    alerts = []
    
    # 2. Parcourir les résultats et générer les alertes
    for name, budget, spent in stats:
        
        spent = spent if spent is not None else 0.0 
        
        # On ne vérifie que les catégories avec un budget défini (> 0)
        if budget is not None and budget > 0:
            
            # Si la dépense réelle (spent) est supérieure au budget
            if spent > budget: 
                alerts.append(AlertDetail(
                    scope="category",
                    category_name=name,
                    budget=budget,
                    actual_spent=spent,
                    delta=spent - budget 
                ))
                
    return alerts