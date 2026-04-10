(function () {
  function toNumber(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function calculateOrderFinancials(order) {
    const valor_servico = toNumber(order.valor_servico ?? order.valor_total);
    const custo_peca = toNumber(order.custo_peca);
    const custo_mao_obra = toNumber(order.custo_mao_obra);
    const valor_frete = toNumber(order.valor_frete);
    const lucro_bruto = valor_servico - (custo_peca + custo_mao_obra);
    const margem = valor_servico > 0 ? (lucro_bruto / valor_servico) * 100 : 0;
    return { valor_servico, custo_peca, custo_mao_obra, valor_frete, lucro_bruto, margem };
  }

  function recalculateOrderFinance() {
    const input = {
      valor_servico: document.getElementById('orderTotal')?.value,
      custo_peca: document.getElementById('orderPartCost')?.value,
      custo_mao_obra: document.getElementById('orderLaborCost')?.value,
      valor_frete: document.getElementById('orderFreightCost')?.value
    };
    const result = calculateOrderFinancials(input);
    const el = document.getElementById('orderFinancePreview');
    if (el) {
      el.textContent = `Lucro bruto: R$ ${result.lucro_bruto.toFixed(2)} | Margem: ${result.margem.toFixed(1)}%`;
      el.className = result.lucro_bruto >= 0 ? 'text-profit' : 'text-expense';
    }
    return result;
  }

  async function loadExpensesTable(filters = {}) {
    const tbody = document.getElementById('expensesTable');
    if (!tbody || !window.ensureSupabaseClient) return;
    const client = window.ensureSupabaseClient(true);
    if (!client) return;

    let query = client.from('despesas').select('*').order('data', { ascending: false });
    if (filters.start) query = query.gte('data', filters.start);
    if (filters.end) query = query.lte('data', filters.end);

    const { data, error } = await query;
    if (error) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--error);">${error.message}</td></tr>`;
      return;
    }
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-secondary);">Nenhuma despesa encontrada</td></tr>';
      return;
    }

    tbody.innerHTML = data.map((d) => `
      <tr>
        <td>${d.tipo || '-'}</td>
        <td class="text-expense">R$ ${toNumber(d.valor).toFixed(2)}</td>
        <td>${d.descricao || '-'}</td>
        <td>${d.data ? new Date(d.data).toLocaleDateString('pt-BR') : '-'}</td>
        <td>${d.pedido_id || '-'}</td>
      </tr>
    `).join('');
  }

  async function handleExpenseSubmit(event) {
    event.preventDefault();
    const client = window.ensureSupabaseClient?.(true);
    if (!client) return;

    const payload = {
      tipo: document.getElementById('expenseType').value,
      valor: toNumber(document.getElementById('expenseValue').value),
      descricao: document.getElementById('expenseDescription').value.trim() || null,
      data: document.getElementById('expenseDate').value || new Date().toISOString().slice(0, 10),
      pedido_id: document.getElementById('expenseOrderId').value.trim() || null
    };

    const { error } = await client.from('despesas').insert([payload]);
    if (error) {
      window.showAlert?.(`Erro ao salvar despesa: ${error.message}`, 'error');
      return;
    }

    window.showAlert?.('Despesa adicionada com sucesso!', 'success');
    event.target.reset();
    await loadExpensesTable();
    await window.refreshFinancialDashboard?.();
  }

  function filterExpensesByDate() {
    loadExpensesTable({
      start: document.getElementById('expenseFilterStart').value || null,
      end: document.getElementById('expenseFilterEnd').value || null
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('expenseForm')?.addEventListener('submit', handleExpenseSubmit);
  });

  window.loadExpensesTable = loadExpensesTable;
  window.filterExpensesByDate = filterExpensesByDate;
  window.recalculateOrderFinance = recalculateOrderFinance;
  window.FinanceiroModule = { calculateOrderFinancials, recalculateOrderFinance, loadExpensesTable };
})();
