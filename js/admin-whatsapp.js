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
    isLoadingMessages: false
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

  function showStatus(message, type = 'info') {
    const statusEl = document.getElementById('waPageStatus');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.dataset.type = type;
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
          renderEmptyChatState();
        }
      } else {
        state.activeConversation = list.find((item) => item.id === state.activeConversationId) || null;
        if (state.activeConversation) {
          renderChatHeader(state.activeConversation);
        }
      }

      const totalLabel = document.getElementById('waTotalConversations');
      if (totalLabel) totalLabel.textContent = `${list.length} conversas`;
      const updatedLabel = document.getElementById('waUpdatedAt');
      if (updatedLabel) updatedLabel.textContent = 'Atualizado agora';
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
      await loadMessages(conversationId);
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
        if (options.refreshMessages !== false) {
          await loadMessages(state.activeConversationId);
        }
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
  }

  async function initAdminWhatsAppPage() {
    bindEvents();
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
  window.renderChatHeader = renderChatHeader;
  window.renderMessages = renderMessages;
  window.renderEmptyChatState = renderEmptyChatState;
  window.toggleConversationMode = toggleConversationMode;
  window.sendManualReply = sendManualReply;
  window.refreshConversations = refreshConversations;
  window.startWhatsAppPolling = startWhatsAppPolling;
  window.stopWhatsAppPolling = stopWhatsAppPolling;
  window.goBackToAdmin = goBackToAdmin;
  window.goHome = goHome;
  window.logoutAdmin = logoutAdmin;
})();
