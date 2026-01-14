const API_BASE_URL = 'http://127.0.0.1:8001'; 
let categoriesMap = {}; 
let charts = {}; 


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
                borderColor: 'rgb(54, 60, 235)', 
                backgroundColor: 'rgba(72, 235, 54, 0.2)', 
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


function initDashboard() { 
    const monthSelector = document.getElementById('month-selector'); 
    const currentMonth = monthSelector ? monthSelector.value : '2024-11'; 
    
    const startDate = '2024-06-01'; 
    const endDate = '2026-01-15'; 

    fetchSummaryAndAlerts(currentMonth, startDate, endDate); 
} 


document.addEventListener('DOMContentLoaded', (event) => { 
    initDashboard(); 
});
// Ajoute cette fonction après fetchSummaryAndAlerts
async function fetchAndDisplayOverruns(month) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/alerts?month=${month}`);
        if (!response.ok) throw new Error('Erreur lors du chargement des alertes.');
        
        const alerts = await response.json();
        
        // Trier par montant de dépassement décroissant et prendre les 3 premiers
        const top3 = alerts
            .sort((a, b) => b.overrun_amount - a.overrun_amount)
            .slice(0, 3);
        
        displayOverruns(top3);
        
    } catch (error) {
        console.error("Erreur de chargement des dépassements:", error);
        document.getElementById('overruns-container').innerHTML = 
            '<p style="color: var(--color-alert);">Erreur de chargement des dépassements.</p>';
    }
}

function displayOverruns(overruns) {
    const container = document.getElementById('overruns-container');
    
    if (overruns.length === 0) {
        container.innerHTML = `
            <div class="no-overruns">
                <p>✓ Aucun dépassement de budget</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = overruns.map((overrun, index) => {
        const percentage = ((overrun.overrun_amount / overrun.budget_limit) * 100).toFixed(1);
        const progressPercentage = Math.min(((overrun.spent_amount / overrun.budget_limit) * 100), 200);
        
        return `
            <div class="overrun-card">
                <div class="overrun-header">
                    <div class="overrun-rank">#${index + 1}</div>
                    <div class="overrun-category">
                        <h3>${overrun.category_name}</h3>
                        <p>Budget: ${overrun.budget_limit.toFixed(2)}€ | Dépensé: ${overrun.spent_amount.toFixed(2)}€</p>
                    </div>
                </div>
                <div class="overrun-amount">
                    <span class="overrun-value">+${overrun.overrun_amount.toFixed(2)}€</span>
                    <span class="overrun-percent">+${percentage}%</span>
                </div>
                <div class="overrun-progress">
                    <div class="overrun-progress-bar" style="width: ${progressPercentage}%"></div>
                </div>
            </div>
        `;
    }).join('');
}

// Modifie la fonction fetchSummaryAndAlerts pour inclure l'appel aux dépassements
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
        
        // AJOUTE CETTE LIGNE
        fetchAndDisplayOverruns(month);
        
        fetchAndDisplayTransactions(); 

    } catch (error) { 
        console.error("Erreur critique d'initialisation:", error); 
        document.getElementById('kpi-container').innerHTML = `<p style="color:red;">ERREUR FATALE: Connexion API échouée. Veuillez vérifier que le serveur tourne sur le port 8001.</p>`; 
    } 
}