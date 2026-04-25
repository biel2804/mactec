(function () {
  const state = {
    conversations: [],
    filteredConversations: [],
    activeConversationId: null,
    activeConversation: null,
    messages: [],
    currentFilter: 'all',
    currentSearch: '',
    pollingConversationsTimer: null,
    pollingMessagesTimer: null,
    isLoadingConversations: false,
    isLoadingMessages: false,
    isLoadingKanban: false,
    viewMode: 'conversations',
    kanban: {
      columns: [],
      tagsByConversationId: {}
    },
    context: {
      tags: [],
      notes: []
    }
  };

  function safeText(value, fallback = '') {
    return String(value ?? fallback);
  }

  function formatPhone(phone) {
    const digits = safeText(phone).replace(/\D/g, '');
    if (digits.length === 13 && digits.startsWith('55')) {
      return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
    }
    if (digits.length === 11) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    }
    return safeText(phone, 'Não informado');
  }

  function formatTime(value) {
    if (!value) return '--:--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--:--';
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function formatMessageDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatCurrency(value) {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric)) return 'R$ 0,00';
    return numeric.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function parseCurrencyInput(value) {
    const sanitized = safeText(value).replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
    const numeric = Number(sanitized);
    if (!Number.isFinite(numeric) || numeric < 0) {
      return null;
    }
    return Number(numeric.toFixed(2));
  }

  function getConversationName(conversation) {
    const name = safeText(conversation?.nome_cliente).trim();
    if (name) return name;
    return formatPhone(conversation?.telefone);
  }

  function getInitial(name) {
    return safeText(name).trim().charAt(0).toUpperCase() || 'C';
  }

  function getModeLabel(mode) {
    return mode === 'manual' ? 'Manual' : 'Automático';
  }

  function getConversationStageLabel(conversation) {
    if (!conversation?.kanban_column_id) return 'Sem etapa definida';
    const column = state.kanban.columns.find((item) => item.id === conversation.kanban_column_id);
    return column?.nome || 'Etapa não encontrada';
  }

  function escapeHtml(value) {
    return safeText(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function showStatus(message, type = 'info') {
    const statusEl = document.getElementById('waPageStatus');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.dataset.type = type;
  }

  function setWhatsAppViewMode(mode) {
    const nextMode = mode === 'kanban' ? 'kanban' : 'conversations';
    state.viewMode = nextMode;

    const conversationsPanel = document.getElementById('waConversationsView');
    const kanbanPanel = document.getElementById('waKanbanView');
    const conversationsBtn = document.getElementById('waViewConversationsBtn');
    const kanbanBtn = document.getElementById('waViewKanbanBtn');

    const isKanban = nextMode === 'kanban';

    if (conversationsPanel) conversationsPanel.hidden = isKanban;
    if (kanbanPanel) kanbanPanel.hidden = !isKanban;

    conversationsBtn?.classList.toggle('active', !isKanban);
    kanbanBtn?.classList.toggle('active', isKanban);

    if (isKanban) {
      loadKanbanBoard();
    }
  }

  async function loadKanbanBoard() {
    if (state.isLoadingKanban) return;
    state.isLoadingKanban = true;

    const boardContainer = document.getElementById('waKanbanBoard');
    if (boardContainer) {
      boardContainer.innerHTML = '<div class="wa-kanban-empty">Carregando board...</div>';
    }

    try {
      const [columns, boardData] = await Promise.all([
        window.WhatsAppAdminApi.fetchKanbanColumns(),
        window.WhatsAppAdminApi.fetchKanbanBoardData(state.currentSearch, state.currentFilter)
      ]);

      state.kanban.columns = Array.isArray(columns) ? columns : [];
      state.kanban.tagsByConversationId = boardData?.tagsByConversationId || {};

      renderKanbanBoard(state.kanban.columns, boardData?.conversations || []);
    } catch (error) {
      console.error(error);
      if (boardContainer) {
        boardContainer.innerHTML = `<div class="wa-kanban-empty">Erro ao carregar Kanban: ${escapeHtml(error?.message || String(error))}</div>`;
      }
    } finally {
      state.isLoadingKanban = false;
    }
  }

  function renderKanbanBoard(columns, conversations) {
    const boardContainer = document.getElementById('waKanbanBoard');
    if (!boardContainer) return;

    if (!Array.isArray(columns) || !columns.length) {
      boardContainer.innerHTML = '<div class="wa-kanban-empty">Nenhuma coluna Kanban ativa.</div>';
      return;
    }

    const cardsByColumnId = {};
    columns.forEach((column) => {
      cardsByColumnId[column.id] = [];
    });

    const fallbackColumnId = columns[0]?.id || null;
    (Array.isArray(conversations) ? conversations : []).forEach((conversation) => {
      const targetColumnId = conversation.kanban_column_id && cardsByColumnId[conversation.kanban_column_id]
        ? conversation.kanban_column_id
        : fallbackColumnId;
      if (!targetColumnId) return;
      cardsByColumnId[targetColumnId].push(conversation);
    });

    boardContainer.innerHTML = columns.map((column) => {
      const cards = cardsByColumnId[column.id] || [];
      const totalValue = cards.reduce((acc, item) => acc + Number(item.valor_negocio || 0), 0);
      const body = cards.length
        ? cards.map((conversation) => renderKanbanCard(conversation, columns)).join('')
        : '<div class="wa-kanban-empty">Sem conversas nesta etapa.</div>';

      return `
        <article class="wa-kanban-column" data-column-id="${column.id}">
          <header class="wa-kanban-column-header">
            <strong>${escapeHtml(column.nome || 'Sem nome')}</strong>
            <div class="wa-kanban-column-meta">
              <span>${cards.length} cards</span>
              <span>${formatCurrency(totalValue)}</span>
            </div>
          </header>
          <div class="wa-kanban-column-body">${body}</div>
        </article>
      `;
    }).join('');

    boardContainer.querySelectorAll('[data-kanban-card-id]').forEach((cardButton) => {
      cardButton.addEventListener('click', () => {
        handleKanbanCardClick(cardButton.dataset.kanbanCardId);
      });
    });

    boardContainer.querySelectorAll('[data-kanban-move-id]').forEach((selectEl) => {
      selectEl.addEventListener('change', (event) => {
        const conversationId = selectEl.dataset.kanbanMoveId;
        const columnId = event.target.value;
        handleConversationMoveToColumn(conversationId, columnId);
      });
    });
  }

  function renderKanbanCard(conversation, columns) {
    const name = getConversationName(conversation);
    const tags = state.kanban.tagsByConversationId[conversation.id] || [];
    const tagsHtml = tags.length
      ? tags.map((tag) => {
        const color = safeText(tag.cor).trim() || '#22c55e';
        return `<span class="wa-kanban-tag" style="border-color:${escapeHtml(color)};color:${escapeHtml(color)};">${escapeHtml(tag.nome)}</span>`;
      }).join('')
      : '<span class="wa-kanban-tag">Sem etiqueta</span>';

    const optionsHtml = columns.map((column) => `
      <option value="${column.id}" ${column.id === conversation.kanban_column_id ? 'selected' : ''}>
        ${escapeHtml(column.nome)}
      </option>
    `).join('');

    const modeBadge = conversation.modo_atendimento === 'manual'
      ? '<span class="wa-item-badge waiting">Manual</span>'
      : '<span class="wa-item-badge">Auto</span>';

    return `
      <button class="wa-kanban-card" data-kanban-card-id="${conversation.id}" type="button">
        <div class="wa-kanban-card-head">
          <div class="wa-avatar">${getInitial(name)}</div>
          <div class="wa-kanban-card-main">
            <strong class="wa-kanban-card-title">${escapeHtml(name)}</strong>
            <span class="wa-kanban-card-phone">${escapeHtml(formatPhone(conversation.telefone))}</span>
            <span class="wa-kanban-card-preview">${escapeHtml(safeText(conversation.ultima_mensagem, 'Sem mensagens'))}</span>
          </div>
        </div>
        <div class="wa-kanban-tags">${tagsHtml}</div>
        <div class="wa-kanban-card-footer">
          <span class="wa-kanban-value">${formatCurrency(conversation.valor_negocio || 0)}</span>
          ${modeBadge}
        </div>
      </button>
      <select class="wa-kanban-move-select" data-kanban-move-id="${conversation.id}">
        ${optionsHtml}
      </select>
    `;
  }

  async function handleKanbanCardClick(conversationId) {
    if (!conversationId) return;
    await selectConversation(conversationId);
    setWhatsAppViewMode('conversations');
    showStatus('Conversa selecionada a partir do Kanban.', 'success');
  }

  async function handleConversationMoveToColumn(conversationId, columnId) {
    if (!conversationId || !columnId) return;

    try {
      const updated = await window.WhatsAppAdminApi.updateConversationKanbanColumn(conversationId, columnId);

      state.filteredConversations = state.filteredConversations.map((item) => item.id === updated.id ? updated : item);
      state.conversations = state.conversations.map((item) => item.id === updated.id ? updated : item);
      if (state.activeConversationId === updated.id) {
        state.activeConversation = updated;
        renderConversationContextPanel(updated);
      }

      await loadKanbanBoard();
      renderConversationList(state.filteredConversations);
      showStatus('Etapa da conversa atualizada com sucesso.', 'success');
    } catch (error) {
      console.error(error);
      showStatus(`Erro ao mover conversa: ${error.message || error}`, 'error');
      await loadKanbanBoard();
    }
  }

  async function loadConversations(options = {}) {
    if (state.isLoadingConversations) return;
    state.isLoadingConversations = true;

    try {
      const list = await window.WhatsAppAdminApi.fetchWhatsAppConversations(state.currentSearch, state.currentFilter);
      state.filteredConversations = list;

      if (!options.keepSource || !state.conversations.length) {
        state.conversations = list;
      } else {
        state.conversations = list;
      }

      renderConversationList(list);

      const hasActive = list.some((item) => item.id === state.activeConversationId);
      if (!state.activeConversationId || !hasActive) {
        if (list.length > 0) {
          await selectConversation(list[0].id);
        } else {
          state.activeConversationId = null;
          state.activeConversation = null;
          state.context.tags = [];
          state.context.notes = [];
          renderEmptyChatState();
          renderConversationContextPanel(null);
        }
      } else {
        state.activeConversation = list.find((item) => item.id === state.activeConversationId) || null;
        if (state.activeConversation) {
          renderChatHeader(state.activeConversation);
          renderConversationContextPanel(state.activeConversation);
        }
      }

      const totalLabel = document.getElementById('waTotalConversations');
      if (totalLabel) totalLabel.textContent = `${list.length} conversas`;
      const updatedLabel = document.getElementById('waUpdatedAt');
      if (updatedLabel) updatedLabel.textContent = 'Atualizado agora';

      if (state.viewMode === 'kanban') {
        loadKanbanBoard();
      }
    } catch (error) {
      console.error(error);
      showStatus(`Erro ao carregar conversas: ${error.message || error}`, 'error');
    } finally {
      state.isLoadingConversations = false;
    }
  }

  function renderConversationList(conversations) {
    const listEl = document.getElementById('waConversationList');
    if (!listEl) return;

    if (!conversations.length) {
      listEl.innerHTML = '<div class="wa-empty-list">Nenhuma conversa encontrada.</div>';
      return;
    }

    listEl.innerHTML = conversations.map((conversation) => {
      const name = getConversationName(conversation);
      const activeClass = conversation.id === state.activeConversationId ? ' active' : '';
      const waitingBadge = conversation.modo_atendimento === 'manual'
        ? '<span class="wa-item-badge waiting">Aguardando</span>'
        : '';
      return `
        <button class="wa-conversation-item${activeClass}" data-id="${conversation.id}">
          <div class="wa-avatar">${getInitial(name)}</div>
          <div class="wa-item-main">
            <div class="wa-item-top">
              <strong>${name}</strong>
              <span class="wa-time">${formatTime(conversation.ultima_interacao_em || conversation.criado_em)}</span>
            </div>
            <div class="wa-item-phone">${formatPhone(conversation.telefone)}</div>
            <div class="wa-item-bottom">
              <span class="wa-item-preview">${safeText(conversation.ultima_mensagem, 'Sem mensagens')}</span>
              ${waitingBadge}
            </div>
          </div>
        </button>
      `;
    }).join('');

    listEl.querySelectorAll('.wa-conversation-item').forEach((button) => {
      button.addEventListener('click', () => selectConversation(button.dataset.id));
    });
  }

  async function selectConversation(conversationId) {
    if (!conversationId) return;
    state.activeConversationId = conversationId;
    state.activeConversation = state.filteredConversations.find((item) => item.id === conversationId) || null;

    renderConversationList(state.filteredConversations);
    if (state.activeConversation) {
      renderChatHeader(state.activeConversation);
      renderConversationContextPanel(state.activeConversation);
      await Promise.all([
        loadMessages(conversationId),
        loadConversationContext(conversationId)
      ]);
    }
  }

  async function loadMessages(conversationId) {
    if (!conversationId || state.isLoadingMessages) return;
    state.isLoadingMessages = true;
    try {
      const messages = await window.WhatsAppAdminApi.fetchWhatsAppMessages(conversationId);
      state.messages = messages;
      renderMessages(messages);
    } catch (error) {
      console.error(error);
      showStatus(`Erro ao carregar mensagens: ${error.message || error}`, 'error');
    } finally {
      state.isLoadingMessages = false;
    }
  }

  async function loadConversationContext(conversationId) {
    if (!conversationId) return;

    try {
      const [tags, notes] = await Promise.all([
        window.WhatsAppAdminApi.fetchConversationTags(conversationId),
        window.WhatsAppAdminApi.fetchConversationNotes(conversationId)
      ]);

      state.context.tags = Array.isArray(tags) ? tags : [];
      state.context.notes = Array.isArray(notes) ? notes : [];

      renderConversationTags(state.context.tags);
      renderConversationNotes(state.context.notes);
    } catch (error) {
      console.error(error);
      showStatus(`Erro ao carregar contexto CRM: ${error.message || error}`, 'error');
      state.context.tags = [];
      state.context.notes = [];
      renderConversationTags([]);
      renderConversationNotes([]);
    }
  }

  function renderChatHeader(conversation) {
    const container = document.getElementById('waChatHeader');
    if (!container || !conversation) return;

    const name = getConversationName(conversation);
    const mode = conversation.modo_atendimento || 'auto';
    const isManual = mode === 'manual';

    container.innerHTML = `
      <div class="wa-chat-contact">
        <div class="wa-avatar">${getInitial(name)}</div>
        <div>
          <strong>${name}</strong>
          <p>${formatPhone(conversation.telefone)}</p>
        </div>
      </div>
      <div class="wa-chat-actions">
        <span class="wa-status-badge ${isManual ? 'manual' : 'auto'}">${getModeLabel(mode)}</span>
        <button class="wa-btn wa-btn-secondary" id="waToggleModeBtn">Modo automático: ${isManual ? 'OFF' : 'ON'}</button>
        <button class="wa-btn wa-btn-primary" id="waQuickModeBtn">${isManual ? 'Reativar automático' : 'Assumir manualmente'}</button>
      </div>
    `;

    document.getElementById('waToggleModeBtn')?.addEventListener('click', () => {
      const nextMode = isManual ? 'auto' : 'manual';
      toggleConversationMode(nextMode);
    });

    document.getElementById('waQuickModeBtn')?.addEventListener('click', () => {
      const nextMode = isManual ? 'auto' : 'manual';
      toggleConversationMode(nextMode);
    });
  }

  function renderConversationContextPanel(conversation) {
    const panel = document.getElementById('waConversationContextPanel');
    if (!panel) return;

    if (!conversation) {
      panel.innerHTML = '<div class="wa-context-empty">Selecione uma conversa para visualizar contexto CRM.</div>';
      return;
    }

    panel.innerHTML = `
      <div class="wa-context-header">
        <strong>Contexto da conversa</strong>
        <span class="wa-context-stage">Etapa: ${getConversationStageLabel(conversation)}</span>
      </div>

      <div class="wa-context-block">
        <label for="waDealValueInput">Valor do negócio</label>
        <div class="wa-context-inline">
          <input id="waDealValueInput" class="wa-context-input" type="text" inputmode="decimal" value="${Number(conversation.valor_negocio || 0).toFixed(2).replace('.', ',')}" />
          <button id="waSaveDealValueBtn" class="wa-btn wa-btn-secondary" type="button">Salvar</button>
        </div>
        <small class="wa-context-help">Atual: ${formatCurrency(conversation.valor_negocio || 0)}</small>
      </div>

      <div class="wa-context-block">
        <label>Etiquetas</label>
        <div id="waContextTags" class="wa-context-tags"></div>
      </div>

      <div class="wa-context-block">
        <label for="waInternalNoteInput">Notas internas</label>
        <textarea id="waInternalNoteInput" class="wa-context-textarea" placeholder="Registrar observação interna..."></textarea>
        <div class="wa-context-note-actions">
          <button id="waSaveNoteBtn" class="wa-btn wa-btn-secondary" type="button">Salvar nota</button>
        </div>
        <div id="waContextNotes" class="wa-context-notes"></div>
      </div>
    `;

    renderConversationTags(state.context.tags);
    renderConversationNotes(state.context.notes);

    document.getElementById('waSaveNoteBtn')?.addEventListener('click', handleSaveConversationNote);
    document.getElementById('waSaveDealValueBtn')?.addEventListener('click', handleUpdateDealValue);
  }

  function renderConversationTags(tags) {
    const tagsContainer = document.getElementById('waContextTags');
    if (!tagsContainer) return;

    if (!Array.isArray(tags) || !tags.length) {
      tagsContainer.innerHTML = '<span class="wa-context-empty-inline">Sem etiquetas.</span>';
      return;
    }

    tagsContainer.innerHTML = tags.map((tag) => {
      const color = safeText(tag.cor).trim() || '#22c55e';
      return `<span class="wa-tag-chip" style="border-color:${color};color:${color};">${safeText(tag.nome)}</span>`;
    }).join('');
  }

  function renderConversationNotes(notes) {
    const notesContainer = document.getElementById('waContextNotes');
    if (!notesContainer) return;

    if (!Array.isArray(notes) || !notes.length) {
      notesContainer.innerHTML = '<div class="wa-context-empty-inline">Sem notas internas.</div>';
      return;
    }

    notesContainer.innerHTML = notes.map((note) => `
      <article class="wa-note-item">
        <p>${safeText(note.conteudo)}</p>
        <footer>${safeText(note.criado_por, 'admin')} · ${formatMessageDate(note.created_at)}</footer>
      </article>
    `).join('');
  }

  async function handleSaveConversationNote() {
    const selected = getSelectedConversation();
    const noteInput = document.getElementById('waInternalNoteInput');
    if (!selected || !noteInput) return;

    const content = noteInput.value.trim();
    if (!content) {
      showStatus('Digite uma nota antes de salvar.', 'error');
      return;
    }

    try {
      await window.WhatsAppAdminApi.saveConversationNote(selected.id, content);
      noteInput.value = '';
      await loadConversationContext(selected.id);
      showStatus('Nota interna salva com sucesso.', 'success');
    } catch (error) {
      console.error(error);
      showStatus(`Erro ao salvar nota: ${error.message || error}`, 'error');
    }
  }

  async function handleUpdateDealValue() {
    const selected = getSelectedConversation();
    const valueInput = document.getElementById('waDealValueInput');
    if (!selected || !valueInput) return;

    const parsedValue = parseCurrencyInput(valueInput.value);
    if (parsedValue === null) {
      showStatus('Informe um valor de negócio válido.', 'error');
      return;
    }

    try {
      const updatedConversation = await window.WhatsAppAdminApi.updateConversationDealValue(selected.id, parsedValue);
      state.activeConversation = updatedConversation;
      state.filteredConversations = state.filteredConversations.map((item) => item.id === updatedConversation.id ? updatedConversation : item);
      state.conversations = state.conversations.map((item) => item.id === updatedConversation.id ? updatedConversation : item);
      renderConversationContextPanel(updatedConversation);
      showStatus('Valor do negócio atualizado com sucesso.', 'success');
    } catch (error) {
      console.error(error);
      showStatus(`Erro ao atualizar valor: ${error.message || error}`, 'error');
    }
  }

  function renderMessages(messages) {
    const historyEl = document.getElementById('waMessageHistory');
    if (!historyEl) return;

    if (!messages.length) {
      historyEl.innerHTML = '<div class="wa-empty-chat">Nenhuma mensagem nesta conversa.</div>';
      return;
    }

    historyEl.innerHTML = messages.map((message) => {
      const isIncoming = message.origem === 'cliente' || message.tipo === 'entrada';
      return `
        <div class="wa-message-row ${isIncoming ? 'incoming' : 'outgoing'}">
          <div class="wa-message-bubble">
            <p>${safeText(message.mensagem)}</p>
            <span>${formatMessageDate(message.criado_em)}</span>
          </div>
        </div>
      `;
    }).join('');

    historyEl.scrollTop = historyEl.scrollHeight;
  }

  function renderEmptyChatState() {
    const header = document.getElementById('waChatHeader');
    const history = document.getElementById('waMessageHistory');
    if (header) header.innerHTML = '<div class="wa-empty-chat">Selecione uma conversa para visualizar o histórico.</div>';
    if (history) history.innerHTML = '<div class="wa-empty-chat">Sem conversa selecionada.</div>';
  }

  async function toggleConversationMode(newMode) {
    if (!state.activeConversationId) return;
    try {
      const updated = await window.WhatsAppAdminApi.updateConversationMode(state.activeConversationId, newMode);
      state.activeConversation = updated;
      showStatus(`Modo de atendimento atualizado para ${getModeLabel(newMode)}.`, 'success');
      await refreshConversations({ keepSelection: true });
    } catch (error) {
      console.error(error);
      showStatus(`Erro ao atualizar modo: ${error.message || error}`, 'error');
    }
  }

  async function sendManualReply() {
    const input = document.getElementById('waReplyInput');
    const sendBtn = document.getElementById('waSendReplyBtn');
    if (!input || !sendBtn) return;

    const selected = getSelectedConversation();
    const conversationId = selected?.id;
    const phone = selected?.telefone || selected?.phone || '';
    const text = input.value.trim();

    if (!conversationId) {
      showWhatsAppFeedback('Nenhuma conversa selecionada.', 'error');
      return;
    }

    if (!phone) {
      showWhatsAppFeedback('Telefone da conversa não encontrado.', 'error');
      return;
    }

    if (!text) {
      showWhatsAppFeedback('Digite uma mensagem antes de enviar.', 'warning');
      return;
    }

    const originalBtnText = sendBtn.textContent;

    try {
      sendBtn.disabled = true;
      input.disabled = true;
      sendBtn.textContent = 'Enviando...';

      const result = await window.WhatsAppAdminApi.sendManualWhatsAppMessage(conversationId, phone, text);

      await loadMessages(conversationId);
      await loadConversations({ keepSource: true });

      input.value = '';

      const chatMessages = document.getElementById('waMessageHistory');
      if (chatMessages) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }

      const status = result?.delivery?.status;

      if (status === 'sent') {
        showWhatsAppFeedback('Mensagem enviada com sucesso.', 'success');
      } else if (status === 'not_configured') {
        showWhatsAppFeedback('Mensagem salva no painel, mas o envio real não está configurado.', 'warning');
      } else if (status === 'failed') {
        showWhatsAppFeedback('Mensagem salva, mas falhou no envio real.', 'error');
      } else if (status === 'error') {
        showWhatsAppFeedback('Mensagem salva, mas ocorreu erro no envio real.', 'error');
      } else {
        showWhatsAppFeedback('Mensagem registrada com sucesso.', 'success');
      }
    } catch (error) {
      console.error('Erro ao enviar resposta manual:', error);
      showWhatsAppFeedback('Não foi possível enviar a mensagem manual.', 'error');
    } finally {
      sendBtn.disabled = false;
      input.disabled = false;
      sendBtn.textContent = originalBtnText;
      input.focus();
    }
  }

  function getSelectedConversation() {
    if (!state.activeConversationId) return null;
    return state.filteredConversations.find((item) => item.id === state.activeConversationId)
      || state.conversations.find((item) => item.id === state.activeConversationId)
      || state.activeConversation
      || null;
  }

  function showWhatsAppFeedback(message, type = 'success') {
    const statusEl = document.getElementById('waPageStatus');
    if (!statusEl) return;
    const colorMap = {
      success: '#22c55e',
      warning: '#f59e0b',
      error: '#ef4444'
    };

    statusEl.textContent = message;
    statusEl.dataset.type = type;
    statusEl.style.color = colorMap[type] || colorMap.success;

    clearTimeout(showWhatsAppFeedback._timer);
    showWhatsAppFeedback._timer = setTimeout(() => {
      if (!statusEl) return;
      statusEl.textContent = '';
      statusEl.style.color = '';
      statusEl.dataset.type = 'info';
    }, 5000);
  }

  async function refreshConversations(options = {}) {
    const keepSelection = Boolean(options.keepSelection);
    await loadConversations({ keepSource: keepSelection });

    if (keepSelection && state.activeConversationId) {
      const stillExists = state.filteredConversations.find((item) => item.id === state.activeConversationId);
      if (stillExists) {
        state.activeConversation = stillExists;
        renderChatHeader(stillExists);
        renderConversationContextPanel(stillExists);
        if (options.refreshMessages !== false) {
          await loadMessages(state.activeConversationId);
        }
        await loadConversationContext(state.activeConversationId);
      }
    }
  }

  function startWhatsAppPolling() {
    stopWhatsAppPolling();

    state.pollingConversationsTimer = window.setInterval(() => {
      refreshConversations({ keepSelection: true, refreshMessages: false });
    }, 5000);

    state.pollingMessagesTimer = window.setInterval(() => {
      if (state.activeConversationId) {
        loadMessages(state.activeConversationId);
      }
    }, 3000);
  }

  function stopWhatsAppPolling() {
    if (state.pollingConversationsTimer) {
      clearInterval(state.pollingConversationsTimer);
      state.pollingConversationsTimer = null;
    }
    if (state.pollingMessagesTimer) {
      clearInterval(state.pollingMessagesTimer);
      state.pollingMessagesTimer = null;
    }
  }

  function goBackToAdmin() {
    window.location.href = '/orcamento.html?admin=1';
  }

  function goHome() {
    window.location.href = '/';
  }

  function logoutAdmin() {
    window.location.href = '/admin-login.html?status=logout';
  }

  function bindEvents() {
    document.getElementById('waSearchInput')?.addEventListener('input', (event) => {
      state.currentSearch = event.target.value || '';
      loadConversations({ keepSource: true });
    });

    document.querySelectorAll('.wa-filter-tab').forEach((button) => {
      button.addEventListener('click', () => {
        document.querySelectorAll('.wa-filter-tab').forEach((item) => item.classList.remove('active'));
        button.classList.add('active');
        state.currentFilter = button.dataset.filter || 'all';
        loadConversations({ keepSource: true });
      });
    });

    document.getElementById('waSendReplyBtn')?.addEventListener('click', sendManualReply);
    document.getElementById('waReplyInput')?.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        sendManualReply();
      }
    });

    document.getElementById('waBackToAdminBtn')?.addEventListener('click', goBackToAdmin);
    document.getElementById('waGoHomeBtn')?.addEventListener('click', goHome);
    document.getElementById('waLogoutBtn')?.addEventListener('click', logoutAdmin);

    document.querySelectorAll('[data-view-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        setWhatsAppViewMode(button.dataset.viewMode || 'conversations');
      });
    });
  }

  async function initAdminWhatsAppPage() {
    bindEvents();
    setWhatsAppViewMode('conversations');
    renderConversationContextPanel(null);
    await loadConversations();
    startWhatsAppPolling();
    showStatus('Central pronta para uso.', 'success');
  }

  window.addEventListener('beforeunload', stopWhatsAppPolling);

  window.initAdminWhatsAppPage = initAdminWhatsAppPage;
  window.loadConversations = loadConversations;
  window.renderConversationList = renderConversationList;
  window.selectConversation = selectConversation;
  window.loadMessages = loadMessages;
  window.loadConversationContext = loadConversationContext;
  window.renderChatHeader = renderChatHeader;
  window.renderConversationContextPanel = renderConversationContextPanel;
  window.renderConversationTags = renderConversationTags;
  window.renderConversationNotes = renderConversationNotes;
  window.handleSaveConversationNote = handleSaveConversationNote;
  window.handleUpdateDealValue = handleUpdateDealValue;
  window.renderMessages = renderMessages;
  window.renderEmptyChatState = renderEmptyChatState;
  window.toggleConversationMode = toggleConversationMode;
  window.sendManualReply = sendManualReply;
  window.setWhatsAppViewMode = setWhatsAppViewMode;
  window.loadKanbanBoard = loadKanbanBoard;
  window.renderKanbanBoard = renderKanbanBoard;
  window.handleKanbanCardClick = handleKanbanCardClick;
  window.handleConversationMoveToColumn = handleConversationMoveToColumn;
  window.refreshConversations = refreshConversations;
  window.startWhatsAppPolling = startWhatsAppPolling;
  window.stopWhatsAppPolling = stopWhatsAppPolling;
  window.goBackToAdmin = goBackToAdmin;
  window.goHome = goHome;
  window.logoutAdmin = logoutAdmin;
})();
