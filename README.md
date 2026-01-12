  LedgerOne - Financial Dashboard & Data Analysis

> **Statut : Concept (POC) réalisée dans le cadre d'un test technique d'architecture logicielle.

Ce projet est un outil de gestion financière permettant de traiter, stocker et visualiser des flux de données bancaires. Il démontre ma capacité à créer une architecture complète, du traitement de données (Backend) à la visualisation interactive (Frontend).

Visualiton du dashboard dans la partie Assets.


° Fonctionnalités Clés
- **Data Visualization** : Dashboard interactif affichant l'évolution des dépenses et des revenus via Charts.js.
- **Traitement de Données** : Système d'importation et de parsing de fichiers CSV pour automatiser l'alimentation de la base de données.
- **Architecture API REST** : Backend performant utilisant FastAPI pour une communication fluide entre les données et l'interface.
- **Persistance des Données** : Utilisation de SQLModel (SQLAlchemy + Pydantic) pour une gestion rigoureuse et typée de la base SQL.

## 🛠️ Stack Technique
- **Backend** : Python 3.13, **FastAPI**, SQLModel.
- **Frontend** : HTML5, CSS3, JavaScript (ES6).
- **Serveur** : Uvicorn (ASGI).
- **Base de données** : SQLite / SQL.

## ⚙️ Installation et Lancement
1. **Activer l'environnement virtuel** :
   ```bash
   source env/Scripts/activate
