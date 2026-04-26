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
    currentWorkspaceView: 'conversas',
    kanban: {
      columns: [],
      tagsByConversationId: {}
    },
    context: {
      tags: [],
      notes: [],
      tasks: [],
      reminders: [],
      activities: []
    },
    drag: {
      conversationId: null
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

  function formatDateTimeInput(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${d}T${hh}:${mm}`;
  }

  function isOverdue(value) {
    if (!value) return false;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;
    return date.getTime() < Date.now();
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

  const VIEW_IDS = {
    conversas: 'waViewConversas',
    kanban: 'waViewKanban',
    contatos: 'waViewContatos',
    etiquetas: 'waViewEtiquetas',
    tarefas: 'waViewTarefas',
    lembretes: 'waViewLembretes',
    relatorios: 'waViewRelatorios',
    automacao: 'waViewAutomacao',
    configuracoes: 'waViewConfiguracoes',
    ajuda: 'waViewAjuda'
  };

  function renderWorkspaceView() {
    Object.entries(VIEW_IDS).forEach(([viewName, id]) => {
      const section = document.getElementById(id);
      if (!section) return;
      section.hidden = viewName !== state.currentWorkspaceView;
    });

    const shell = document.querySelector('.wa-shell');
    if (shell) {
      shell.dataset.currentView = state.currentWorkspaceView;
    }
  }

  function setWorkspaceView(viewName) {
    const nextView = VIEW_IDS[viewName] ? viewName : 'conversas';
    state.currentWorkspaceView = nextView;

    document.querySelectorAll('[data-workspace-view]').forEach((button) => {
      button.classList.toggle('active', button.dataset.workspaceView === nextView);
    });

    renderWorkspaceView();
    renderAuxiliaryViews();

    if (nextView === 'kanban') {
      loadKanbanBoard().catch((error) => {
        console.error(error);
        showStatus(`Falha ao carregar Kanban: ${error?.message || error}`, 'error');
      });
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
        boardContainer.innerHTML = '<div class="wa-kanban-empty">Kanban indisponível no momento. A lista de conversas segue ativa.</div>';
      }
      showStatus(`Kanban com falha parcial: ${error?.message || error}`, 'error');
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

    boardContainer.innerHTML = `
      <section class="wa-kanban-admin-tools">
        <div class="wa-kanban-column-create">
          <input id="waNewKanbanColumnInput" type="text" class="wa-context-input" placeholder="Nova coluna (ex: Pós-venda)" />
          <button id="waCreateKanbanColumnBtn" class="wa-btn wa-btn-secondary" type="button">Criar coluna</button>
        </div>
      </section>
      ${columns.map((column, index) => {
        const cards = cardsByColumnId[column.id] || [];
        const totalValue = cards.reduce((acc, item) => acc + Number(item.valor_negocio || 0), 0);
        const body = cards.length
          ? cards.map((conversation) => renderKanbanCard(conversation, columns)).join('')
          : '<div class="wa-kanban-empty">Sem conversas nesta etapa.</div>';

        return `
          <article class="wa-kanban-column" data-column-id="${column.id}">
            <header class="wa-kanban-column-header">
              <div class="wa-kanban-column-title-wrap">
                <strong>${escapeHtml(column.nome || 'Sem nome')}</strong>
                ${column.fixa_sistema ? '<span class="wa-fixed-badge">Fixa</span>' : '<button class="wa-column-toggle-btn" type="button" data-column-toggle="'+column.id+'">Inativar</button>'}
              </div>
              <div class="wa-kanban-column-meta">
                <span>${cards.length} cards</span>
                <span>${formatCurrency(totalValue)}</span>
              </div>
            </header>
            <div class="wa-kanban-column-actions">
              <button class="wa-btn wa-btn-secondary" type="button" data-column-up="${column.id}" ${index === 0 ? 'disabled' : ''}>↑</button>
              <button class="wa-btn wa-btn-secondary" type="button" data-column-down="${column.id}" ${index === (columns.length - 1) ? 'disabled' : ''}>↓</button>
            </div>
            <div class="wa-kanban-column-body" data-kanban-dropzone="${column.id}">${body}</div>
          </article>
        `;
      }).join('')}
    `;

    document.getElementById('waCreateKanbanColumnBtn')?.addEventListener('click', handleCreateKanbanColumn);

    boardContainer.querySelectorAll('[data-kanban-card-id]').forEach((cardButton) => {
      cardButton.addEventListener('click', () => {
        handleKanbanCardClick(cardButton.dataset.kanbanCardId);
      });

      cardButton.addEventListener('dragstart', (event) => {
        const conversationId = cardButton.dataset.kanbanCardId;
        state.drag.conversationId = conversationId;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', conversationId);
      });

      cardButton.addEventListener('dragend', () => {
        state.drag.conversationId = null;
      });
    });

    boardContainer.querySelectorAll('[data-kanban-dropzone]').forEach((dropzone) => {
      dropzone.addEventListener('dragover', (event) => {
        event.preventDefault();
        dropzone.classList.add('is-drag-over');
      });

      dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('is-drag-over');
      });

      dropzone.addEventListener('drop', async (event) => {
        event.preventDefault();
        dropzone.classList.remove('is-drag-over');
        const conversationId = event.dataTransfer.getData('text/plain') || state.drag.conversationId;
        const columnId = dropzone.dataset.kanbanDropzone;
        await handleConversationCardDrop(conversationId, columnId);
      });
    });

    boardContainer.querySelectorAll('[data-kanban-move-id]').forEach((selectEl) => {
      selectEl.addEventListener('change', async (event) => {
        const conversationId = selectEl.dataset.kanbanMoveId;
        const columnId = event.target.value;
        await handleConversationCardDrop(conversationId, columnId);
      });
    });

    boardContainer.querySelectorAll('[data-column-up]').forEach((button) => {
      button.addEventListener('click', async () => {
        await handleShiftColumnOrder(button.dataset.columnUp, -1);
      });
    });

    boardContainer.querySelectorAll('[data-column-down]').forEach((button) => {
      button.addEventListener('click', async () => {
        await handleShiftColumnOrder(button.dataset.columnDown, 1);
      });
    });

    boardContainer.querySelectorAll('[data-column-toggle]').forEach((button) => {
      button.addEventListener('click', async () => {
        await handleToggleKanbanColumn(button.dataset.columnToggle);
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
      <button class="wa-kanban-card" draggable="true" data-kanban-card-id="${conversation.id}" type="button">
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
    state.activeConversationId = conversationId;
    state.activeConversation = state.filteredConversations.find((item) => item.id === conversationId) || null;
    renderConversationList(state.filteredConversations);
    if (state.activeConversation?.id) {
      await loadConversationContext(state.activeConversation.id);
      renderAuxiliaryViews();
    }
    showStatus('Card selecionado no Kanban.', 'success');
  }

  async function handleConversationCardDrop(conversationId, columnId) {
    if (!conversationId || !columnId) return;

    try {
      const updated = await window.WhatsAppAdminApi.updateConversationKanbanColumn(conversationId, columnId);

      state.filteredConversations = state.filteredConversations.map((item) => item.id === updated.id ? updated : item);
      state.conversations = state.conversations.map((item) => item.id === updated.id ? updated : item);
      if (state.activeConversationId === updated.id) {
        state.activeConversation = updated;
        renderConversationContextPanel(updated);
        await loadConversationContext(updated.id);
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

  async function handleCreateKanbanColumn() {
    const input = document.getElementById('waNewKanbanColumnInput');
    if (!input) return;
    const nome = input.value.trim();

    if (!nome) {
      showStatus('Informe o nome da nova coluna.', 'error');
      return;
    }

    try {
      await window.WhatsAppAdminApi.createKanbanColumn({ nome });
      input.value = '';
      await loadKanbanBoard();
      showStatus('Coluna criada com sucesso.', 'success');
    } catch (error) {
      console.error(error);
      showStatus(`Erro ao criar coluna: ${error.message || error}`, 'error');
    }
  }

  async function handleShiftColumnOrder(columnId, direction) {
    const columns = state.kanban.columns || [];
    const index = columns.findIndex((item) => item.id === columnId);
    if (index < 0) return;

    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= columns.length) return;

    const current = columns[index];
    const target = columns[targetIndex];

    try {
      await Promise.all([
        window.WhatsAppAdminApi.updateKanbanColumn(current.id, { ordem: target.ordem }),
        window.WhatsAppAdminApi.updateKanbanColumn(target.id, { ordem: current.ordem })
      ]);
      await loadKanbanBoard();
      showStatus('Ordem das colunas atualizada.', 'success');
    } catch (error) {
      console.error(error);
      showStatus(`Erro ao reordenar colunas: ${error.message || error}`, 'error');
    }
  }

  async function handleToggleKanbanColumn(columnId) {
    const column = (state.kanban.columns || []).find((item) => item.id === columnId);
    if (!column || column.fixa_sistema) return;

    try {
      await window.WhatsAppAdminApi.updateKanbanColumn(columnId, { ativo: false });
      await loadKanbanBoard();
      showStatus('Coluna inativada com sucesso.', 'success');
    } catch (error) {
      console.error(error);
      showStatus(`Erro ao inativar coluna: ${error.message || error}`, 'error');
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
          state.context.tasks = [];
          state.context.reminders = [];
          state.context.activities = [];
          renderEmptyChatState();
          renderConversationContextPanel(null);
          renderAuxiliaryViews();
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
      renderAuxiliaryViews();

      if (state.currentWorkspaceView === 'kanban') {
        loadKanbanBoard().catch((error) => {
          console.error(error);
          showStatus(`Falha ao atualizar Kanban: ${error?.message || error}`, 'error');
        });
      }
    } catch (error) {
      console.error(error);
      state.filteredConversations = [];
      renderConversationList([]);
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
      const [tags, notes, tasks, reminders, activities] = await Promise.all([
        window.WhatsAppAdminApi.fetchConversationTags(conversationId),
        window.WhatsAppAdminApi.fetchConversationNotes(conversationId),
        window.WhatsAppAdminApi.fetchConversationTasks(conversationId),
        window.WhatsAppAdminApi.fetchConversationReminders(conversationId),
        window.WhatsAppAdminApi.fetchConversationActivities(conversationId)
      ]);

      state.context.tags = Array.isArray(tags) ? tags : [];
      state.context.notes = Array.isArray(notes) ? notes : [];
      state.context.tasks = Array.isArray(tasks) ? tasks : [];
      state.context.reminders = Array.isArray(reminders) ? reminders : [];
      state.context.activities = Array.isArray(activities) ? activities : [];

      renderConversationTags(state.context.tags);
      renderConversationNotes(state.context.notes);
      renderConversationTasks(state.context.tasks);
      renderConversationReminders(state.context.reminders);
      renderConversationActivities(state.context.activities);
      renderAuxiliaryViews();
    } catch (error) {
      console.error(error);
      showStatus(`Erro ao carregar contexto CRM: ${error.message || error}`, 'error');
      state.context.tags = [];
      state.context.notes = [];
      state.context.tasks = [];
      state.context.reminders = [];
      state.context.activities = [];
      renderConversationTags([]);
      renderConversationNotes([]);
      renderConversationTasks([]);
      renderConversationReminders([]);
      renderConversationActivities([]);
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

      <div class="wa-context-grid">
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

        <div class="wa-context-block">
          <label for="waTaskTitleInput">Tarefas</label>
          <div class="wa-context-inline wa-context-inline-wide">
            <input id="waTaskTitleInput" class="wa-context-input" type="text" placeholder="Título da tarefa" />
            <input id="waTaskDueInput" class="wa-context-input" type="datetime-local" />
          </div>
          <textarea id="waTaskDescriptionInput" class="wa-context-textarea" placeholder="Descrição da tarefa (opcional)"></textarea>
          <div class="wa-context-note-actions">
            <button id="waSaveTaskBtn" class="wa-btn wa-btn-secondary" type="button">Adicionar tarefa</button>
          </div>
          <div id="waContextTasks" class="wa-context-list"></div>
        </div>

        <div class="wa-context-block">
          <label for="waReminderTitleInput">Lembretes</label>
          <div class="wa-context-inline wa-context-inline-wide">
            <input id="waReminderTitleInput" class="wa-context-input" type="text" placeholder="Título do lembrete" />
            <input id="waReminderDateInput" class="wa-context-input" type="datetime-local" />
          </div>
          <div class="wa-context-note-actions">
            <button id="waSaveReminderBtn" class="wa-btn wa-btn-secondary" type="button">Adicionar lembrete</button>
          </div>
          <div id="waContextReminders" class="wa-context-list"></div>
        </div>

        <div class="wa-context-block">
          <label>Atividade recente</label>
          <div id="waContextActivities" class="wa-context-list"></div>
        </div>
      </div>
    `;

    renderConversationTags(state.context.tags);
    renderConversationNotes(state.context.notes);
    renderConversationTasks(state.context.tasks);
    renderConversationReminders(state.context.reminders);
    renderConversationActivities(state.context.activities);

    document.getElementById('waSaveNoteBtn')?.addEventListener('click', handleSaveConversationNote);
    document.getElementById('waSaveDealValueBtn')?.addEventListener('click', handleUpdateDealValue);
    document.getElementById('waSaveTaskBtn')?.addEventListener('click', handleSaveConversationTask);
    document.getElementById('waSaveReminderBtn')?.addEventListener('click', handleSaveConversationReminder);
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

  function renderConversationTasks(tasks) {
    const tasksContainer = document.getElementById('waContextTasks');
    if (!tasksContainer) return;

    if (!Array.isArray(tasks) || !tasks.length) {
      tasksContainer.innerHTML = '<div class="wa-context-empty-inline">Sem tarefas.</div>';
      return;
    }

    tasksContainer.innerHTML = tasks.map((task) => {
      const isDone = task.status === 'concluida';
      const overdue = !isDone && isOverdue(task.vencimento_em);
      return `
        <article class="wa-note-item ${overdue ? 'is-overdue' : ''}">
          <p><strong>${escapeHtml(task.titulo)}</strong></p>
          ${task.descricao ? `<p>${escapeHtml(task.descricao)}</p>` : ''}
          <footer>
            <span>Status: ${isDone ? 'Concluída' : 'Pendente'}</span>
            <span>${task.vencimento_em ? ` · Vence em ${formatMessageDate(task.vencimento_em)}` : ''}</span>
            ${overdue ? '<span class="wa-overdue-badge">Vencida</span>' : ''}
          </footer>
          ${isDone ? '' : `<div class="wa-context-note-actions"><button class="wa-btn wa-btn-secondary" type="button" data-task-complete="${task.id}">Marcar concluída</button></div>`}
        </article>
      `;
    }).join('');

    tasksContainer.querySelectorAll('[data-task-complete]').forEach((button) => {
      button.addEventListener('click', async () => {
        try {
          await window.WhatsAppAdminApi.updateConversationTask(button.dataset.taskComplete, { status: 'concluida' });
          const selected = getSelectedConversation();
          if (selected?.id) await loadConversationContext(selected.id);
          showStatus('Tarefa marcada como concluída.', 'success');
        } catch (error) {
          console.error(error);
          showStatus(`Erro ao concluir tarefa: ${error.message || error}`, 'error');
        }
      });
    });
  }

  function renderConversationReminders(reminders) {
    const remindersContainer = document.getElementById('waContextReminders');
    if (!remindersContainer) return;

    if (!Array.isArray(reminders) || !reminders.length) {
      remindersContainer.innerHTML = '<div class="wa-context-empty-inline">Sem lembretes.</div>';
      return;
    }

    remindersContainer.innerHTML = reminders.map((reminder) => {
      const overdue = reminder.status === 'ativo' && isOverdue(reminder.lembrar_em);
      return `
        <article class="wa-note-item ${overdue ? 'is-overdue' : ''}">
          <p><strong>${escapeHtml(reminder.titulo)}</strong></p>
          <footer>
            ${formatMessageDate(reminder.lembrar_em)} · ${escapeHtml(reminder.status || 'ativo')}
            ${overdue ? '<span class="wa-overdue-badge">Atrasado</span>' : ''}
          </footer>
        </article>
      `;
    }).join('');
  }

  function renderConversationActivities(activities) {
    const activitiesContainer = document.getElementById('waContextActivities');
    if (!activitiesContainer) return;

    if (!Array.isArray(activities) || !activities.length) {
      activitiesContainer.innerHTML = '<div class="wa-context-empty-inline">Sem atividades recentes.</div>';
      return;
    }

    activitiesContainer.innerHTML = activities.map((activity) => `
      <article class="wa-note-item">
        <p>${escapeHtml(activity.descricao || activity.tipo || 'Atividade')}</p>
        <footer>${formatMessageDate(activity.created_at)} · ${escapeHtml(activity.tipo || 'evento')}</footer>
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

  async function handleSaveConversationTask() {
    const selected = getSelectedConversation();
    const titleInput = document.getElementById('waTaskTitleInput');
    const descInput = document.getElementById('waTaskDescriptionInput');
    const dueInput = document.getElementById('waTaskDueInput');

    if (!selected || !titleInput || !descInput || !dueInput) return;

    const titulo = titleInput.value.trim();
    if (!titulo) {
      showStatus('Informe um título para a tarefa.', 'error');
      return;
    }

    try {
      await window.WhatsAppAdminApi.saveConversationTask(selected.id, {
        titulo,
        descricao: descInput.value.trim() || null,
        vencimento_em: dueInput.value ? new Date(dueInput.value).toISOString() : null
      });
      titleInput.value = '';
      descInput.value = '';
      dueInput.value = '';
      await loadConversationContext(selected.id);
      await loadConversations({ keepSource: true });
      showStatus('Tarefa salva com sucesso.', 'success');
    } catch (error) {
      console.error(error);
      showStatus(`Erro ao salvar tarefa: ${error.message || error}`, 'error');
    }
  }

  async function handleSaveConversationReminder() {
    const selected = getSelectedConversation();
    const titleInput = document.getElementById('waReminderTitleInput');
    const dateInput = document.getElementById('waReminderDateInput');

    if (!selected || !titleInput || !dateInput) return;

    const titulo = titleInput.value.trim();
    const lembrarEm = dateInput.value;

    if (!titulo) {
      showStatus('Informe um título para o lembrete.', 'error');
      return;
    }

    if (!lembrarEm) {
      showStatus('Informe data e hora para o lembrete.', 'error');
      return;
    }

    try {
      await window.WhatsAppAdminApi.saveConversationReminder(selected.id, {
        titulo,
        lembrar_em: new Date(lembrarEm).toISOString()
      });
      titleInput.value = '';
      dateInput.value = '';
      await loadConversationContext(selected.id);
      showStatus('Lembrete salvo com sucesso.', 'success');
    } catch (error) {
      console.error(error);
      showStatus(`Erro ao salvar lembrete: ${error.message || error}`, 'error');
    }
  }

  async function handleSaveTaskFromModuleView() {
    const selected = getSelectedConversation();
    const titleInput = document.getElementById('waTasksModuleTitleInput');
    const descInput = document.getElementById('waTasksModuleDescriptionInput');
    const dueInput = document.getElementById('waTasksModuleDueInput');
    if (!selected || !titleInput || !descInput || !dueInput) {
      showStatus('Selecione uma conversa para adicionar tarefa.', 'error');
      return;
    }

    const titulo = titleInput.value.trim();
    if (!titulo) {
      showStatus('Informe um título para a tarefa.', 'error');
      return;
    }

    try {
      await window.WhatsAppAdminApi.saveConversationTask(selected.id, {
        titulo,
        descricao: descInput.value.trim() || null,
        vencimento_em: dueInput.value ? new Date(dueInput.value).toISOString() : null
      });
      titleInput.value = '';
      descInput.value = '';
      dueInput.value = '';
      await loadConversationContext(selected.id);
      renderAuxiliaryViews();
      showStatus('Tarefa adicionada no módulo de tarefas.', 'success');
    } catch (error) {
      console.error(error);
      showStatus(`Erro ao salvar tarefa: ${error.message || error}`, 'error');
    }
  }

  async function handleSaveReminderFromModuleView() {
    const selected = getSelectedConversation();
    const titleInput = document.getElementById('waRemindersModuleTitleInput');
    const dateInput = document.getElementById('waRemindersModuleDateInput');
    if (!selected || !titleInput || !dateInput) {
      showStatus('Selecione uma conversa para adicionar lembrete.', 'error');
      return;
    }

    const titulo = titleInput.value.trim();
    if (!titulo || !dateInput.value) {
      showStatus('Informe título e data para o lembrete.', 'error');
      return;
    }

    try {
      await window.WhatsAppAdminApi.saveConversationReminder(selected.id, {
        titulo,
        lembrar_em: new Date(dateInput.value).toISOString()
      });
      titleInput.value = '';
      dateInput.value = '';
      await loadConversationContext(selected.id);
      renderAuxiliaryViews();
      showStatus('Lembrete adicionado no módulo de lembretes.', 'success');
    } catch (error) {
      console.error(error);
      showStatus(`Erro ao salvar lembrete: ${error.message || error}`, 'error');
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
      await loadConversationContext(updatedConversation.id);
      if (state.currentWorkspaceView === 'kanban') await loadKanbanBoard();
      showStatus('Valor do negócio atualizado com sucesso.', 'success');
    } catch (error) {
      console.error(error);
      showStatus(`Erro ao atualizar valor: ${error.message || error}`, 'error');
    }
  }

  function renderAuxiliaryViews() {
    const selected = getSelectedConversation();
    const name = selected ? getConversationName(selected) : 'Nenhum contato selecionado';

    const contactsList = document.getElementById('waContactsListView');
    if (contactsList) {
      if (!state.filteredConversations.length) {
        contactsList.innerHTML = '<div class="wa-empty-module">Nenhum contato disponível.</div>';
      } else {
        contactsList.innerHTML = `
          <h3 class="wa-module-title">Contatos disponíveis</h3>
          <div class="wa-context-list">
            ${state.filteredConversations.map((conversation) => `
              <article class="wa-note-item">
                <p><strong>${escapeHtml(getConversationName(conversation))}</strong></p>
                <footer>${escapeHtml(formatPhone(conversation.telefone))}</footer>
              </article>
            `).join('')}
          </div>
        `;
      }
    }

    const contactDetail = document.getElementById('waContactDetailPanel');
    if (contactDetail) {
      contactDetail.innerHTML = selected ? `
        <h3 class="wa-module-title">Contato selecionado</h3>
        <article class="wa-note-item">
          <p><strong>${escapeHtml(name)}</strong></p>
          <footer>${escapeHtml(formatPhone(selected.telefone))} · ${escapeHtml(getConversationStageLabel(selected))}</footer>
        </article>
      ` : '<div class="wa-empty-module">Selecione uma conversa para exibir detalhes.</div>';
    }

    const tagsModule = document.getElementById('waTagsModuleList');
    if (tagsModule) {
      const tags = state.context.tags || [];
      tagsModule.innerHTML = `
        <h3 class="wa-module-title">Etiquetas de ${escapeHtml(name)}</h3>
        <div class="wa-context-tags">
          ${tags.length ? tags.map((tag) => `<span class="wa-tag-chip" style="border-color:${escapeHtml(safeText(tag.cor).trim() || '#22c55e')};color:${escapeHtml(safeText(tag.cor).trim() || '#22c55e')};">${escapeHtml(tag.nome)}</span>`).join('') : '<span class="wa-context-empty-inline">Sem etiquetas vinculadas.</span>'}
        </div>
      `;
    }

    const tasksModule = document.getElementById('waTasksModuleList');
    if (tasksModule) {
      tasksModule.innerHTML = `
        <h3 class="wa-module-title">Tarefas de ${escapeHtml(name)}</h3>
        <div class="wa-context-list">${(state.context.tasks || []).length ? (state.context.tasks || []).map((task) => `
          <article class="wa-note-item">
            <p><strong>${escapeHtml(task.titulo)}</strong></p>
            <footer>${escapeHtml(task.status || 'pendente')} ${task.vencimento_em ? `· ${escapeHtml(formatMessageDate(task.vencimento_em))}` : ''}</footer>
          </article>
        `).join('') : '<div class="wa-context-empty-inline">Sem tarefas cadastradas.</div>'}</div>
      `;
    }

    const remindersModule = document.getElementById('waRemindersModuleList');
    if (remindersModule) {
      remindersModule.innerHTML = `
        <h3 class="wa-module-title">Lembretes de ${escapeHtml(name)}</h3>
        <div class="wa-context-list">${(state.context.reminders || []).length ? (state.context.reminders || []).map((reminder) => `
          <article class="wa-note-item">
            <p><strong>${escapeHtml(reminder.titulo)}</strong></p>
            <footer>${escapeHtml(formatMessageDate(reminder.lembrar_em))} · ${escapeHtml(reminder.status || 'ativo')}</footer>
          </article>
        `).join('') : '<div class="wa-context-empty-inline">Sem lembretes cadastrados.</div>'}</div>
      `;
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

  function bindSidebarWorkspaceNavigation() {
    document.querySelectorAll('[data-workspace-view]').forEach((button) => {
      button.addEventListener('click', () => {
        setWorkspaceView(button.dataset.workspaceView || 'conversas');
      });
    });
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
    bindSidebarWorkspaceNavigation();
    document.getElementById('waTasksModuleSaveBtn')?.addEventListener('click', handleSaveTaskFromModuleView);
    document.getElementById('waRemindersModuleSaveBtn')?.addEventListener('click', handleSaveReminderFromModuleView);
  }

  async function initAdminWhatsAppPage() {
    bindEvents();
    setWorkspaceView('conversas');
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
  window.renderConversationTasks = renderConversationTasks;
  window.renderConversationReminders = renderConversationReminders;
  window.renderConversationActivities = renderConversationActivities;
  window.handleSaveConversationNote = handleSaveConversationNote;
  window.handleSaveConversationTask = handleSaveConversationTask;
  window.handleSaveConversationReminder = handleSaveConversationReminder;
  window.handleUpdateDealValue = handleUpdateDealValue;
  window.renderMessages = renderMessages;
  window.renderEmptyChatState = renderEmptyChatState;
  window.toggleConversationMode = toggleConversationMode;
  window.sendManualReply = sendManualReply;
  window.setWorkspaceView = setWorkspaceView;
  window.renderWorkspaceView = renderWorkspaceView;
  window.bindSidebarWorkspaceNavigation = bindSidebarWorkspaceNavigation;
  window.loadKanbanBoard = loadKanbanBoard;
  window.renderKanbanBoard = renderKanbanBoard;
  window.handleKanbanCardClick = handleKanbanCardClick;
  window.handleConversationCardDrop = handleConversationCardDrop;
  window.handleCreateKanbanColumn = handleCreateKanbanColumn;
  window.refreshConversations = refreshConversations;
  window.startWhatsAppPolling = startWhatsAppPolling;
  window.stopWhatsAppPolling = stopWhatsAppPolling;
  window.goBackToAdmin = goBackToAdmin;
  window.goHome = goHome;
  window.logoutAdmin = logoutAdmin;
})();
