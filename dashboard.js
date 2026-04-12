(function () {
  let profitChart;
  let expenseChart;

  function money(v) {
    return `R$ ${Number(v || 0).toFixed(2)}`;
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function toMoneyNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }

  function inRange(date, range) {
    if (!range) return true;
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return false;
    const now = new Date();
    if (range === 'today') return d.toDateString() === now.toDateString();
    if (range === 'week') return d >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    if (range === 'month') return d >= new Date(now.getFullYear(), now.getMonth(), 1);
    return true;
  }

  function isFinancialOrder(order) {
    const status = String(order?.status || '').toLowerCase();
    return ['finalizado', 'entregue'].includes(status);
  }

  function getServiceRevenue(order) {
    return toMoneyNumber(order?.valor_servico ?? order?.valor_total);
  }

  function getEffectiveCustomerCharge(order) {
    return toMoneyNumber(order?.valor_total_com_juros ?? order?.valor_total_final ?? order?.valor_servico ?? order?.valor_total);
  }

  function getOperationalProfit(order) {
    const persistedProfit = order?.lucro_bruto;
    if (persistedProfit !== null && persistedProfit !== undefined && persistedProfit !== '') {
      return toMoneyNumber(persistedProfit);
    }
    const serviceRevenue = getServiceRevenue(order);
    const partCost = toMoneyNumber(order?.custo_peca);
    return serviceRevenue - partCost;
  }

  function getNetResult(grossProfit, expensesTotal) {
    return toMoneyNumber(grossProfit) - toMoneyNumber(expensesTotal);
  }

  function aggregateMonthlyProfit(orders) {
    const map = {};
    asArray(orders).forEach((order) => {
      const date = order?.created_at ? new Date(order.created_at) : new Date();
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      map[key] = (map[key] || 0) + getOperationalProfit(order);
    });
    const labels = Object.keys(map).sort();
    return { labels, values: labels.map((k) => map[k]) };
  }

  function aggregateExpenseCategory(expenses) {
    const map = {};
    asArray(expenses).forEach((e) => {
      map[e?.tipo || 'outros'] = (map[e?.tipo || 'outros'] || 0) + toMoneyNumber(e?.valor);
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

  function setTextById(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  async function loadExpensesSafe(client) {
    const { data, error } = await client.from('despesas').select('*');
    if (error) {
      const message = String(error.message || '');
      if (error.code === '42P01' || error.status === 404 || message.includes('404')) {
        console.warn('Tabela despesas indisponível ou não criada ainda:', message || error);
        return [];
      }
      console.warn('Falha ao carregar despesas para o dashboard:', message || error);
      return [];
    }
    return asArray(data);
  }

  async function refreshFinancialDashboard(range = window.__dashboardRange || null) {
    const client = window.ensureSupabaseClient?.(true);
    if (!client) return;
    window.__dashboardRange = range;

    const { data: pedidosData, error: pedidosError } = await client.from('pedidos').select('*');
    if (pedidosError) {
      console.warn('Falha ao carregar pedidos para o dashboard:', pedidosError.message || pedidosError);
    }

    const orders = asArray(pedidosData);
    const expenses = await loadExpensesSafe(client);

    const filteredOrders = orders.filter((o) => inRange(o?.created_at, range));
    const financialOrders = filteredOrders.filter(isFinancialOrder);
    const filteredExpenses = expenses.filter((e) => inRange(e?.data, range));

    const serviceRevenue = financialOrders.reduce((sum, order) => sum + getServiceRevenue(order), 0);
    const totalCharged = financialOrders.reduce((sum, order) => sum + getEffectiveCustomerCharge(order), 0);
    const grossProfit = financialOrders.reduce((sum, order) => sum + getOperationalProfit(order), 0);
    const totalExpenses = filteredExpenses.reduce((sum, expense) => sum + toMoneyNumber(expense?.valor), 0);
    const netResult = getNetResult(grossProfit, totalExpenses);
    const validOrdersCount = financialOrders.length;
    const avgTicket = validOrdersCount > 0 ? (totalCharged / validOrdersCount) : 0;

    setTextById('serviceRevenue', money(serviceRevenue));
    setTextById('totalCharged', money(totalCharged));
    setTextById('totalExpenses', money(totalExpenses));
    setTextById('grossProfit', money(grossProfit));
    setTextById('netResult', money(netResult));
    setTextById('totalOrders', String(filteredOrders.length));
    setTextById('avgTicket', money(avgTicket));

    // Compatibilidade com IDs antigos
    setTextById('totalRevenue', money(serviceRevenue));
    setTextById('netProfit', money(netResult));

    renderCharts(financialOrders, filteredExpenses);
  }

  function applyDashboardRange(range) {
    refreshFinancialDashboard(range);
  }

  window.refreshFinancialDashboard = refreshFinancialDashboard;
  window.applyDashboardRange = applyDashboardRange;
  window.FinancialDashboardMetrics = {
    getEffectiveCustomerCharge,
    getServiceRevenue,
    getOperationalProfit,
    getNetResult
  };
})();
