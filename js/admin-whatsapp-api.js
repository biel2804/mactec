(function () {
  const APP_CONFIG = window.APP_CONFIG || {};
  const SUPABASE_URL = APP_CONFIG.SUPABASE_URL || '';
  const SUPABASE_KEY = APP_CONFIG.SUPABASE_KEY || APP_CONFIG.SUPABASE_ANON_KEY || '';

  function ensureSupabaseClient() {
    if (window.supabaseClient && typeof window.supabaseClient.from === 'function') {
      return window.supabaseClient;
    }

    if (window.__adminWhatsAppSupabase && typeof window.__adminWhatsAppSupabase.from === 'function') {
      return window.__adminWhatsAppSupabase;
    }

    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      throw new Error('SDK do Supabase não carregado.');
    }

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      throw new Error('Configuração do Supabase ausente. Verifique app-config.js.');
    }

    window.__adminWhatsAppSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    return window.__adminWhatsAppSupabase;
  }

  function normalizeTerm(value) {
    return String(value || '').trim().toLowerCase();
  }

  async function fetchWhatsAppConversations(searchTerm = '', filter = 'all') {
    const client = ensureSupabaseClient();
    const { data, error } = await client
      .from('whatsapp_conversas')
      .select('id, telefone, nome_cliente, ultima_mensagem, ultima_interacao_em, modo_atendimento, criado_em, kanban_column_id, valor_negocio, prioridade, updated_at')
      .order('ultima_interacao_em', { ascending: false });

    if (error) throw error;

    const term = normalizeTerm(searchTerm);
    let rows = Array.isArray(data) ? data : [];

    if (term) {
      rows = rows.filter((row) => {
        const name = normalizeTerm(row.nome_cliente);
        const phone = normalizeTerm(row.telefone);
        return name.includes(term) || phone.includes(term);
      });
    }

    if (filter === 'waiting') {
      rows = rows.filter((row) => row.modo_atendimento === 'manual');
    }

    if (filter === 'unread') {
      // Estrutura visual preparada: sem coluna de não lidas no schema atual.
      rows = rows;
    }

    return rows;
  }

  async function fetchWhatsAppMessages(conversationId) {
    if (!conversationId) return [];
    const client = ensureSupabaseClient();
    const { data, error } = await client
      .from('whatsapp_mensagens')
      .select('id, conversa_id, telefone, mensagem, tipo, origem, criado_em')
      .eq('conversa_id', conversationId)
      .order('criado_em', { ascending: true });

    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  async function fetchConversationTags(conversationId) {
    if (!conversationId) return [];
    const client = ensureSupabaseClient();

    const { data, error } = await client
      .from('whatsapp_conversa_tags')
      .select('tag_id, whatsapp_tags(nome, cor, ativo)')
      .eq('conversa_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return (Array.isArray(data) ? data : []).map((row) => ({
      id: row.tag_id,
      nome: row.whatsapp_tags?.nome || '',
      cor: row.whatsapp_tags?.cor || null,
      ativo: row.whatsapp_tags?.ativo !== false
    })).filter((tag) => tag.nome);
  }

  async function fetchConversationNotes(conversationId) {
    if (!conversationId) return [];
    const client = ensureSupabaseClient();

    const { data, error } = await client
      .from('whatsapp_conversa_notas')
      .select('id, conversa_id, conteudo, criado_por, created_at, updated_at')
      .eq('conversa_id', conversationId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  async function saveConversationNote(conversationId, content) {
    const noteText = String(content || '').trim();
    if (!conversationId) throw new Error('Conversa inválida para salvar nota.');
    if (!noteText) throw new Error('Conteúdo da nota não pode ser vazio.');

    const client = ensureSupabaseClient();
    const { data, error } = await client
      .from('whatsapp_conversa_notas')
      .insert({
        conversa_id: conversationId,
        conteudo: noteText,
        criado_por: 'admin'
      })
      .select('id, conversa_id, conteudo, criado_por, created_at, updated_at')
      .single();

    if (error) throw error;
    return data;
  }

  async function updateConversationDealValue(conversationId, value) {
    if (!conversationId) throw new Error('Conversa inválida para atualizar valor.');

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue < 0) {
      throw new Error('Valor de negócio inválido.');
    }

    const client = ensureSupabaseClient();
    const { data, error } = await client
      .from('whatsapp_conversas')
      .update({
        valor_negocio: numericValue,
        updated_at: new Date().toISOString()
      })
      .eq('id', conversationId)
      .select('id, telefone, nome_cliente, ultima_mensagem, ultima_interacao_em, modo_atendimento, criado_em, kanban_column_id, valor_negocio, prioridade, updated_at')
      .single();

    if (error) throw error;
    return data;
  }

  async function updateConversationMode(conversationId, newMode) {
    const client = ensureSupabaseClient();
    const { data, error } = await client
      .from('whatsapp_conversas')
      .update({ modo_atendimento: newMode })
      .eq('id', conversationId)
      .select('id, telefone, nome_cliente, ultima_mensagem, ultima_interacao_em, modo_atendimento, criado_em, kanban_column_id, valor_negocio, prioridade, updated_at')
      .single();

    if (error) throw error;
    return data;
  }

  async function fetchKanbanColumns() {
    const client = ensureSupabaseClient();
    const { data, error } = await client
      .from('whatsapp_kanban_columns')
      .select('id, nome, slug, ordem, cor, ativo, fixa_sistema')
      .eq('ativo', true)
      .order('ordem', { ascending: true });

    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  async function fetchKanbanBoardData(searchTerm = '', filter = 'all') {
    const conversations = await fetchWhatsAppConversations(searchTerm, filter);
    const conversationIds = conversations.map((item) => item.id).filter(Boolean);

    if (!conversationIds.length) {
      return { conversations: [], tagsByConversationId: {} };
    }

    const client = ensureSupabaseClient();
    const { data, error } = await client
      .from('whatsapp_conversa_tags')
      .select('conversa_id, tag_id, whatsapp_tags(nome, cor, ativo)')
      .in('conversa_id', conversationIds)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const tagsByConversationId = {};
    (Array.isArray(data) ? data : []).forEach((row) => {
      const conversationId = row.conversa_id;
      if (!conversationId) return;

      if (!Array.isArray(tagsByConversationId[conversationId])) {
        tagsByConversationId[conversationId] = [];
      }

      const tagName = row.whatsapp_tags?.nome;
      if (!tagName) return;

      tagsByConversationId[conversationId].push({
        id: row.tag_id,
        nome: tagName,
        cor: row.whatsapp_tags?.cor || null,
        ativo: row.whatsapp_tags?.ativo !== false
      });
    });

    return { conversations, tagsByConversationId };
  }

  async function updateConversationKanbanColumn(conversationId, columnId) {
    if (!conversationId) throw new Error('Conversa inválida para atualizar etapa.');
    if (!columnId) throw new Error('Coluna inválida para atualizar etapa.');

    const client = ensureSupabaseClient();
    const { data, error } = await client
      .from('whatsapp_conversas')
      .update({
        kanban_column_id: columnId,
        updated_at: new Date().toISOString()
      })
      .eq('id', conversationId)
      .select('id, telefone, nome_cliente, ultima_mensagem, ultima_interacao_em, modo_atendimento, criado_em, kanban_column_id, valor_negocio, prioridade, updated_at')
      .single();

    if (error) throw error;
    return data;
  }

  async function saveManualMessage(conversationId, phone, text) {
    const client = ensureSupabaseClient();
    const payloadText = String(text || '').trim();

    const { data: inserted, error: insertError } = await client
      .from('whatsapp_mensagens')
      .insert({
        conversa_id: conversationId,
        telefone: phone,
        mensagem: payloadText,
        tipo: 'saida',
        origem: 'admin'
      })
      .select('id, conversa_id, telefone, mensagem, tipo, origem, criado_em')
      .single();

    if (insertError) throw insertError;

    const { data: updatedConversation, error: updateError } = await client
      .from('whatsapp_conversas')
      .update({
        ultima_mensagem: payloadText,
        ultima_interacao_em: new Date().toISOString(),
        modo_atendimento: 'manual'
      })
      .eq('id', conversationId)
      .select('id, telefone, nome_cliente, ultima_mensagem, ultima_interacao_em, modo_atendimento, criado_em, kanban_column_id, valor_negocio, prioridade, updated_at')
      .single();

    if (updateError) throw updateError;

    return { message: inserted, conversation: updatedConversation };
  }

  async function sendManualWhatsAppMessage(conversationId, phone, text) {
    const result = await saveManualMessage(conversationId, phone, text);

    const endpoint = APP_CONFIG.WHATSAPP_ADMIN_SEND_ENDPOINT || APP_CONFIG.WHATSAPP_SEND_ENDPOINT || '';
    if (!endpoint) {
      console.warn('WhatsApp manual send endpoint não configurado.');
      return { ...result, delivery: { status: 'not_configured' } };
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(SUPABASE_KEY ? { apikey: SUPABASE_KEY } : {})
        },
        body: JSON.stringify({
          conversa_id: conversationId,
          telefone: phone,
          mensagem: text,
          origem: 'admin'
        })
      });

      const rawText = await response.text();
      let payload = null;

      try {
        payload = rawText ? JSON.parse(rawText) : null;
      } catch (_parseError) {
        payload = rawText || null;
      }

      return {
        ...result,
        delivery: {
          status: response.ok ? 'sent' : 'failed',
          httpStatus: response.status,
          payload
        }
      };
    } catch (error) {
      console.error('Falha no envio manual do WhatsApp:', error);
      return {
        ...result,
        delivery: {
          status: 'error',
          error: error?.message || 'Falha desconhecida no envio manual'
        }
      };
    }
  }

  window.WhatsAppAdminApi = {
    fetchWhatsAppConversations,
    fetchWhatsAppMessages,
    fetchConversationTags,
    fetchConversationNotes,
    saveConversationNote,
    updateConversationDealValue,
    updateConversationMode,
    fetchKanbanColumns,
    fetchKanbanBoardData,
    updateConversationKanbanColumn,
    saveManualMessage,
    sendManualWhatsAppMessage
  };
})();
