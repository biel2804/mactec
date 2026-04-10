(function () {
  let profitChart;
  let expenseChart;

  function money(v) {
    return `R$ ${Number(v || 0).toFixed(2)}`;
  }

  function inRange(date, range) {
    if (!range) return true;
    const d = new Date(date);
    const now = new Date();
    if (range === 'today') return d.toDateString() === now.toDateString();
    if (range === 'week') return d >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    if (range === 'month') return d >= new Date(now.getFullYear(), now.getMonth(), 1);
    return true;
  }

  function aggregateMonthlyProfit(orders) {
    const map = {};
    orders.forEach((order) => {
      const date = order.created_at ? new Date(order.created_at) : new Date();
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const fin = window.FinanceiroModule.calculateOrderFinancials(order);
      map[key] = (map[key] || 0) + fin.lucro_bruto;
    });
    const labels = Object.keys(map).sort();
    return { labels, values: labels.map((k) => map[k]) };
  }

  function aggregateExpenseCategory(expenses) {
    const map = {};
    expenses.forEach((e) => {
      map[e.tipo || 'outros'] = (map[e.tipo || 'outros'] || 0) + Number(e.valor || 0);
    });
    return { labels: Object.keys(map), values: Object.values(map) };
  }

  function renderCharts(orders, expenses) {
    if (typeof Chart === 'undefined') return;
    const profitCtx = document.getElementById('profitChart');
    const expenseCtx = document.getElementById('expenseChart');
    if (!profitCtx || !expenseCtx) return;

    const monthly = aggregateMonthlyProfit(orders);
    const byCategory = aggregateExpenseCategory(expenses);

    profitChart?.destroy();
    expenseChart?.destroy();

    profitChart = new Chart(profitCtx, {
      type: 'line',
      data: { labels: monthly.labels, datasets: [{ label: 'Lucro', data: monthly.values, borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,0.2)' }] },
      options: { responsive: true, maintainAspectRatio: false }
    });

    expenseChart = new Chart(expenseCtx, {
      type: 'doughnut',
      data: { labels: byCategory.labels, datasets: [{ data: byCategory.values, backgroundColor: ['#2563eb','#dc2626','#f59e0b','#16a34a'] }] },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  async function refreshFinancialDashboard(range = window.__dashboardRange || null) {
    const client = window.ensureSupabaseClient?.(true);
    if (!client) return;
    window.__dashboardRange = range;

    const { data: orders = [] } = await client.from('pedidos').select('*');
    const { data: expenses = [] } = await client.from('despesas').select('*');

    const filteredOrders = orders.filter((o) => inRange(o.created_at, range));
    const filteredExpenses = expenses.filter((e) => inRange(e.data, range));

    const faturamento = filteredOrders
      .filter((o) => ['finalizado', 'entregue'].includes((o.status || '').toLowerCase()))
      .reduce((sum, o) => sum + Number((o.valor_servico ?? o.valor_total) || 0), 0);
    const totalDespesas = filteredExpenses.reduce((sum, e) => sum + Number(e.valor || 0), 0);
    const lucroLiquido = faturamento - totalDespesas;

    document.getElementById('totalOrders').textContent = filteredOrders.length;
    document.getElementById('totalRevenue').textContent = money(faturamento);
    document.getElementById('totalExpenses').textContent = money(totalDespesas);
    document.getElementById('netProfit').textContent = money(lucroLiquido);

    renderCharts(filteredOrders, filteredExpenses);
  }

  function applyDashboardRange(range) {
    refreshFinancialDashboard(range);
  }

  window.refreshFinancialDashboard = refreshFinancialDashboard;
  window.applyDashboardRange = applyDashboardRange;
})();
