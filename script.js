// Fichier: script.js (Version Stable)

const API_BASE_URL = 'http://127.0.0.1:8001'; 
let categoriesMap = {}; 
let charts = {}; 

// --- 1. FONCTIONS DE CHARGEMENT ET D'AFFICHAGE DU DASHBOARD ---

async function fetchSummaryAndAlerts(month, startDate, endDate) { 
    try { 
        const [summaryRes, trendRes, alertRes, categoryRes] = await Promise.all([ 
            fetch(`${API_BASE_URL}/api/insights/summary?month=${month}`), 
            fetch(`${API_BASE_URL}/api/insights/trend?from_date=${startDate}&to_date=${endDate}`), 
            fetch(`${API_BASE_URL}/api/alerts?month=${month}`), 
            fetch(`${API_BASE_URL}/api/categories/`) 
        ]); 
        
        if (!summaryRes.ok || !trendRes.ok || !alertRes.ok || !categoryRes.ok) { 
            throw new Error('Erreur lors du chargement des Insights. Le serveur API est-il actif sur 8001 ?'); 
        } 

        const summary = await summaryRes.json(); 
        const trends = await trendRes.json(); 
        const alerts = await alertRes.json(); 
        const categories = await categoryRes.json(); 
        
        categoriesMap = categories.reduce((map, cat) => { 
            map[cat.id] = cat.name; 
            return map; 
        }, {}); 

        document.getElementById('total-spent-kpi').innerHTML =  
            `<h3>Total Net (${month})</h3><p>${summary.total_spent.toFixed(2)} €</p>`; 
        
        const alertBadgeElement = document.getElementById('alert-badge'); 
        alertBadgeElement.innerHTML =  
            `<h3>Alertes Budget</h3><p class="${alerts.length > 0 ? 'active-alert' : ''}"> 
            ${alerts.length} Dépassement(s) 
            </p>`; 

        drawCategoryChart(summary.categories); 
        drawTrendChart(trends.trends); 
        
        fetchAndDisplayTransactions(); 

    } catch (error) { 
        console.error("Erreur critique d'initialisation:", error); 
        document.getElementById('kpi-container').innerHTML = `<p style="color:red;">ERREUR FATALE: Connexion API échouée. Veuillez vérifier que le serveur tourne sur le port 8001.</p>`; 
    } 
} 


// --- 2. FONCTIONS DE GESTION DE DONNÉES (CRUD & Import) --- 

async function fetchAndDisplayTransactions() { 
    try { 
        const response = await fetch(`${API_BASE_URL}/api/transactions/`); 
        if (!response.ok) throw new Error('Erreur lors du chargement des transactions.'); 
        
        const transactions = await response.json(); 
        const tableBody = document.querySelector('#transactions-table tbody'); 
        tableBody.innerHTML = ''; 

        transactions.forEach(tx => { 
            const row = tableBody.insertRow(); 
            row.insertCell().textContent = tx.date; 
            row.insertCell().textContent = tx.description; 
            
            const amountCell = row.insertCell(); 
            amountCell.textContent = `${tx.amount.toFixed(2)} €`; 
            if (tx.amount < 0) { 
                amountCell.classList.add('transaction-income'); 
            } 
            
            row.insertCell().textContent = categoriesMap[tx.category_id] || 'Non classé'; 
            
            row.insertCell().innerHTML = 
                `<button data-id="${tx.id}">Modifier</button> 
                 <button data-id="${tx.id}" onclick="deleteTransaction(${tx.id})">Supprimer</button>`; 
        }); 

    } catch (error) { 
        console.error("Erreur de chargement transactions:", error); 
    } 
} 

async function deleteTransaction(id) { 
    if (confirm(`Êtes-vous sûr de vouloir supprimer la transaction ${id} ?`)) { 
        try { 
            const response = await fetch(`${API_BASE_URL}/api/transactions/${id}`, { 
                method: 'DELETE' 
            }); 

            if (response.status === 204) { 
                alert(`Transaction ${id} supprimée.`); 
                initDashboard(); 
            } else { 
                alert("Erreur lors de la suppression."); 
            } 
        } catch (error) { 
            console.error("Erreur de suppression:", error); 
        } 
    } 
} 

async function handleImport() { 
    const fileInput = document.getElementById('csv-file-input'); 
    const file = fileInput.files[0]; 
    const reportDiv = document.getElementById('import-report'); 

    if (!file) { 
        reportDiv.textContent = 'Veuillez sélectionner un fichier CSV.'; 
        reportDiv.style.color = 'orange'; 
        return; 
    } 

    const formData = new FormData(); 
    formData.append('file', file); 

    reportDiv.textContent = 'Importation en cours...'; 
    reportDiv.style.color = 'blue'; 

    try { 
        const response = await fetch(`${API_BASE_URL}/api/import/csv`, { 
            method: 'POST', 
            body: formData, 
        }); 

        const result = await response.json(); 
        
        if (response.ok) { 
            reportDiv.textContent = `SUCCESS: ${result.inserted} inséré(s), ${result.skipped} ignoré(s).`; 
            reportDiv.style.color = 'green'; 
            initDashboard(); 
        } else { 
            reportDiv.textContent = `ERREUR: ${result.detail || result.errors[0]?.error || 'Erreur inconnue'}`; 
            reportDiv.style.color = 'red'; 
        } 

    } catch (error) { 
        reportDiv.textContent = `Échec de la connexion API lors de l'import.`; 
        reportDiv.style.color = 'red'; 
    } 
} 


// --- 3. FONCTIONS DE DESSIN DE GRAPHIQUES --- 

function drawCategoryChart(categories) { 
    const canvas = document.getElementById('category-chart'); 
    if (!canvas) return; 

    if (charts.categoryChart) { 
        charts.categoryChart.destroy(); 
    } 

    const expenseCategories = categories.filter(c => c.spent_amount > 0); 
    
    charts.categoryChart = new Chart(canvas.getContext('2d'), { 
        type: 'doughnut',
        data: { 
            labels: expenseCategories.map(c => c.category_name), 
            datasets: [{ 
                label: 'Répartition des Dépenses', 
                data: expenseCategories.map(c => c.spent_amount), 
                backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'], 
            }] 
        }, 
        options: { responsive: true, plugins: { legend: { position: 'right' } } } 
    }); 
} 

function drawTrendChart(trends) { 
    const canvas = document.getElementById('trend-chart'); 
    if (!canvas) return; 
    
    if (charts.trendChart) { 
        charts.trendChart.destroy(); 
    } 

    charts.trendChart = new Chart(canvas.getContext('2d'), { 
        type: 'line', 
        data: { 
            labels: trends.map(t => t.month), 
            datasets: [{ 
                label: 'Dépenses Totales Mensuelles', 
                data: trends.map(t => t.total_spent), 
                borderColor: 'rgba(54, 162, 235, 1)', 
                backgroundColor: 'rgba(54, 162, 235, 0.2)', 
                fill: false, 
                tension: 0.2 
            }, 
            { 
                label: 'Moyenne Glissante (3M)', 
                data: trends.map(t => t.moving_average_3m), 
                borderColor: 'rgba(255, 99, 132, 1)', 
                backgroundColor: 'rgba(255, 99, 132, 0.2)', 
                fill: false, 
                borderDash: [5, 5], 
                tension: 0.2 
            }] 
        }, 
        options: { responsive: true, scales: { y: { beginAtZero: false } } } 
    }); 

} 

// --- INITIALISATION GLOBALE DE L'APPLICATION --- 

function initDashboard() { 
    // Lire le mois sélectionné par l'utilisateur (par défaut 2024-11) 
    const monthSelector = document.getElementById('month-selector'); 
    const currentMonth = monthSelector ? monthSelector.value : '2024-11'; 
    
    // Période de tendance pour la démo 
    const startDate = '2023-06-01'; 
    const endDate = '2024-12-31'; 

    // Lancement de tous les appels API 
    fetchSummaryAndAlerts(currentMonth, startDate, endDate); 
} 

// CORRECTION CRITIQUE : Lance la fonction seulement après que tout le HTML est chargé 
document.addEventListener('DOMContentLoaded', (event) => { 
    initDashboard(); 
});