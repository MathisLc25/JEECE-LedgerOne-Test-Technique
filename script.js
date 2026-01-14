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
            throw new Error('Erreur de connexion API'); 
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
        displayOverruns(alerts);
        fetchAndDisplayTransactions(); 

    } catch (error) { 
        console.error("Erreur d'initialisation:", error); 
        document.getElementById('kpi-container').innerHTML = `<p style="color:red;">ERREUR FATALE: Connexion API échouée. Vérifiez le port 8001.</p>`; 
    } 
} 

async function fetchAndDisplayTransactions() { 
    try { 
        const response = await fetch(`${API_BASE_URL}/api/transactions/`); 
        if (!response.ok) throw new Error('Erreur transactions'); 
        
        const transactions = await response.json(); 
        const tableBody = document.querySelector('#transactions-table tbody'); 
        tableBody.innerHTML = ''; 

        transactions.forEach(tx => { 
            const row = tableBody.insertRow(); 
            row.insertCell().textContent = tx.date; 
            row.insertCell().textContent = tx.description; 
            const amountCell = row.insertCell(); 
            amountCell.textContent = `${tx.amount.toFixed(2)} €`; 
            if (tx.amount < 0) amountCell.classList.add('transaction-income'); 
            row.insertCell().textContent = categoriesMap[tx.category_id] || 'Non classé'; 
            row.insertCell().innerHTML = `<button onclick="deleteTransaction(${tx.id})">Supprimer</button>`; 
        }); 
    } catch (error) { 
        console.error(error); 
    } 
} 

async function deleteTransaction(id) { 
    if (confirm(`Supprimer la transaction ${id} ?`)) { 
        try { 
            const response = await fetch(`${API_BASE_URL}/api/transactions/${id}`, { method: 'DELETE' }); 
            if (response.status === 204) initDashboard(); 
        } catch (error) { 
            console.error(error); 
        } 
    } 
} 

async function handleImport() { 
    const fileInput = document.getElementById('csv-file-input'); 
    const file = fileInput.files[0]; 
    const reportDiv = document.getElementById('import-report'); 
    if (!file) return; 

    const formData = new FormData(); 
    formData.append('file', file); 
    reportDiv.textContent = 'Importation...'; 

    try { 
        const response = await fetch(`${API_BASE_URL}/api/import/csv`, { method: 'POST', body: formData }); 
        const result = await response.json(); 
        if (response.ok) { 
            reportDiv.textContent = `SUCCESS: ${result.inserted} inséré(s)`; 
            reportDiv.style.color = 'green'; 
            initDashboard(); 
        } 
    } catch (error) { 
        reportDiv.textContent = `Erreur de connexion.`; 
    } 
} 

function drawCategoryChart(categories) { 
    const canvas = document.getElementById('category-chart'); 
    if (!canvas) return; 
    if (charts.categoryChart) charts.categoryChart.destroy(); 

    const expenseCategories = categories.filter(c => c.spent_amount > 0); 
    charts.categoryChart = new Chart(canvas.getContext('2d'), { 
        type: 'doughnut',
        data: { 
            labels: expenseCategories.map(c => c.category_name), 
            datasets: [{ 
                data: expenseCategories.map(c => c.spent_amount), 
                backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF'], 
            }] 
        }, 
        options: { responsive: true } 
    }); 
} 

function drawTrendChart(trends) { 
    const canvas = document.getElementById('trend-chart'); 
    if (!canvas) return; 
    if (charts.trendChart) charts.trendChart.destroy(); 

    charts.trendChart = new Chart(canvas.getContext('2d'), { 
        type: 'line', 
        data: { 
            labels: trends.map(t => t.month), 
            datasets: [
                { 
                    label: 'Dépenses Réelles', 
                    data: trends.map(t => t.total_spent), 
                    borderColor: 'rgb(54, 60, 235)', 
                    backgroundColor: 'rgba(54, 60, 235, 0.1)',
                    fill: true,
                    tension: 0.2 
                },
                { 
                    label: 'Moyenne Glissante (3M)', 
                    data: trends.map(t => t.moving_average_3m), 
                    borderColor: 'rgba(255, 99, 132, 1)', 
                    borderDash: [5, 5], 
                    fill: false, 
                    tension: 0.2 
                }
            ] 
        },
        options: {
            responsive: true,
            scales: { y: { beginAtZero: false } }
        }
    }); 
} 

function displayOverruns(alerts) {
    const container = document.getElementById('overruns-container');
    if (!container) return;
    if (alerts.length === 0) {
        container.innerHTML = '<p>✓ Aucun dépassement de budget ce mois-ci.</p>';
        return;
    }
    
    container.innerHTML = alerts.map((overrun, index) => {
        const progress = Math.min(((overrun.actual_spent / overrun.budget) * 100), 100);
        return `
            <div class="overrun-card">
                <h3>#${index + 1} ${overrun.category_name}</h3>
                <p>Budget : ${overrun.budget.toFixed(2)}€ | Dépensé : ${overrun.actual_spent.toFixed(2)}€</p>
                <p style="color: #e74c3c; font-weight: bold;">Dépassement de : +${overrun.delta.toFixed(2)}€</p>
                <div class="overrun-progress" style="background: #eee; border-radius: 5px; height: 10px; margin-top: 5px;">
                    <div class="overrun-progress-bar" style="width: ${progress}%; background: #e74c3c; height: 100%; border-radius: 5px;"></div>
                </div>
            </div>`;
    }).join('');
}

function initDashboard() { 
    const monthSelector = document.getElementById('month-selector'); 
    const currentMonth = monthSelector ? monthSelector.value : '2026-01'; 
    
    const startDate = '2024-06-01'; 
    const endDate = '2026-01-15'; 

    fetchSummaryAndAlerts(currentMonth, startDate, endDate); 
}

document.addEventListener('DOMContentLoaded', () => { 
    initDashboard(); 
});