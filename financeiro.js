(function () {
  function toNumber(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function roundMoney(value) {
    return Number(toNumber(value).toFixed(2));
  }

  const JUROS_PARCELAMENTO = {
    1: 0,
    2: 0,
    3: 0,
    4: 4.97,
    5: 5.97,
    6: 6.97,
    7: 7.97,
    8: 7.97,
    9: 7.97,
    10: 7.97,
    11: 7.97,
    12: 7.97
  };

  function normalizeInstallments(parcelas) {
    return Math.max(1, Math.min(12, Math.trunc(toNumber(parcelas) || 1)));
  }

  function getInstallmentInterest(parcelas) {
    const normalized = normalizeInstallments(parcelas);
    return toNumber(JUROS_PARCELAMENTO[normalized]);
  }

  function calculateInstallments(valorFinal, parcelas) {
    const valorBase = Math.max(0, toNumber(valorFinal));
    const parcelasNormalizadas = normalizeInstallments(parcelas);
    const percentual_juros = getInstallmentInterest(parcelasNormalizadas);
    const valor_total_com_juros = roundMoney(valorBase * (1 + percentual_juros / 100));
    const valor_parcela = roundMoney(valor_total_com_juros / parcelasNormalizadas);

    return {
      parcelas: parcelasNormalizadas,
      percentual_juros,
      valor_total_com_juros,
      valor_parcela
    };
  }

  function getItemFreight(item) {
    return toNumber(item?.valor_frete ?? item?.freightCost);
  }

  function getItemSubtotal(item, itemFreight) {
    const subtotalExplicit =
      item?.subtotal ??
      item?.valor_subtotal ??
      item?.valor_total_sem_frete ??
      item?.subtotal_sem_frete ??
      item?.valor_sem_frete ??
      item?.valor;
    if (subtotalExplicit !== undefined && subtotalExplicit !== null) return toNumber(subtotalExplicit);

    const itemTotal = item?.valor_total ?? item?.totalPrice;
    if (itemTotal !== undefined && itemTotal !== null) {
      return Math.max(0, toNumber(itemTotal) - toNumber(itemFreight));
    }

    return 0;
  }

  function sumOrderItems(items = []) {
    return items.reduce((acc, item) => {
      const itemFreight = getItemFreight(item);
      const itemSubtotal = getItemSubtotal(item, itemFreight);
      acc.subtotal_itens += itemSubtotal;
      acc.valor_frete += itemFreight;
      acc.custo_peca += toNumber(item?.custo_peca ?? item?.valor_peca ?? item?.baseCost);
      acc.custo_mao_obra += toNumber(item?.custo_mao_obra ?? item?.mao_de_obra ?? item?.laborCost);
      return acc;
    }, { subtotal_itens: 0, valor_frete: 0, custo_peca: 0, custo_mao_obra: 0 });
  }

  function calculateCanonicalOrderFinancials(order = {}) {
    const items = Array.isArray(order.itens) ? order.itens : [];
    const itemSums = sumOrderItems(items);
    const subtotal_itens = roundMoney(order.subtotal_itens ?? (items.length ? itemSums.subtotal_itens : toNumber(order.valor_total ?? order.valor_servico) - toNumber(order.valor_frete)));
    const valor_frete = roundMoney(order.valor_frete ?? (items.length ? itemSums.valor_frete : 0));
    const desconto = roundMoney(order.desconto);
    const valor_total = roundMoney(subtotal_itens + valor_frete);
    const valor_final = roundMoney(Math.max(valor_total - desconto, 0));
    const parcelas = normalizeInstallments(order.parcelas);
    const percentual_juros = toNumber(order.percentual_juros ?? getInstallmentInterest(parcelas));
    const valor_total_com_juros = roundMoney(valor_final * (1 + percentual_juros / 100));
    const valor_parcela = roundMoney(valor_total_com_juros / parcelas);
    const custo_peca = roundMoney(order.custo_peca ?? (items.length ? itemSums.custo_peca : 0));
    const custo_mao_obra = roundMoney(order.custo_mao_obra ?? (items.length ? itemSums.custo_mao_obra : 0));
    const valor_servico = valor_final;
    const despesa_direta = custo_peca;
    const lucro_bruto = roundMoney(valor_servico - despesa_direta);
    const margem = valor_servico > 0 ? (lucro_bruto / valor_servico) * 100 : 0;

    return {
      subtotal_itens,
      valor_frete,
      desconto,
      valor_total,
      valor_final,
      parcelas,
      percentual_juros: roundMoney(percentual_juros),
      valor_total_com_juros,
      valor_parcela,
      valor_servico,
      custo_peca,
      custo_mao_obra,
      lucro_bruto,
      margem: roundMoney(margem)
    };
  }

  function calculateOrderFinancials(order) {
    return calculateCanonicalOrderFinancials(order);
  }

  function recalculateOrderFinance() {
    const input = {
      valor_total: document.getElementById('orderTotal')?.value,
      custo_peca: document.getElementById('orderPartCost')?.value,
      custo_mao_obra: document.getElementById('orderLaborCost')?.value,
      valor_frete: document.getElementById('orderFreightCost')?.value,
      desconto: 0,
      parcelas: 1
    };
    const result = calculateOrderFinancials(input);
    const el = document.getElementById('orderFinancePreview');
    if (el) {
      el.textContent = `Lucro bruto: R$ ${result.lucro_bruto.toFixed(2)} | Margem: ${result.margem.toFixed(1)}%`;
      el.className = result.lucro_bruto >= 0 ? 'text-profit' : 'text-expense';
    }
    return result;
  }

  async function loadExpenses(filters = {}) {
    const client = window.ensureSupabaseClient?.(true);
    if (!client) return [];

    let query = client.from('despesas').select('*').order('data', { ascending: false });
    if (filters.start) query = query.gte('data', filters.start);
    if (filters.end) query = query.lte('data', filters.end);

    const { data, error } = await query;
    if (error) {
      const message = String(error.message || '');
      if (error.code === '42P01' || error.status === 404 || message.includes('404')) {
        console.warn('Tabela despesas indisponível ou não criada ainda:', message || error);
        return [];
      }
      console.warn('Falha ao carregar despesas:', message || error);
      return [];
    }

    return Array.isArray(data) ? data : [];
  }

  async function loadExpensesTable(filters = {}) {
    const tbody = document.getElementById('expensesTable');
    if (!tbody || !window.ensureSupabaseClient) return;
    const data = await loadExpenses(filters);
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
  window.FinanceiroModule = {
    JUROS_PARCELAMENTO,
    calculateInstallments,
    calculateCanonicalOrderFinancials,
    calculateOrderFinancials,
    recalculateOrderFinance,
    loadExpenses,
    loadExpensesTable
  };
})();
