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

  async function appendConversationActivity(conversationId, type, description, meta = null) {
    if (!conversationId || !type || !description) return;
    const client = ensureSupabaseClient();

    const payload = {
      conversa_id: conversationId,
      tipo: String(type).trim(),
      descricao: String(description).trim(),
      meta: meta && typeof meta === 'object' ? meta : null
    };

    const { error } = await client
      .from('whatsapp_conversa_atividades')
      .insert(payload);

    if (error) {
      console.warn('Falha ao registrar atividade operacional:', error);
    }
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

    const conversationIds = rows.map((row) => row.id).filter(Boolean);
    const [tagsRows, notesRows, openTaskRows, columnsRows] = conversationIds.length
      ? await Promise.all([
        client
          .from('whatsapp_conversa_tags')
          .select('conversa_id, whatsapp_tags(nome)')
          .in('conversa_id', conversationIds),
        client
          .from('whatsapp_conversa_notas')
          .select('conversa_id, conteudo')
          .in('conversa_id', conversationIds),
        client
          .from('whatsapp_conversa_tasks')
          .select('conversa_id, titulo')
          .in('conversa_id', conversationIds)
          .eq('status', 'pendente'),
        client
          .from('whatsapp_kanban_columns')
          .select('id, nome')
      ])
      : [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null }
      ];

    if (tagsRows.error) throw tagsRows.error;
    if (notesRows.error) throw notesRows.error;
    if (openTaskRows.error) throw openTaskRows.error;
    if (columnsRows.error) throw columnsRows.error;

    const columnNameById = {};
    (columnsRows.data || []).forEach((column) => {
      if (column?.id) columnNameById[column.id] = column.nome || '';
    });

    const tagsByConversation = {};
    (tagsRows.data || []).forEach((row) => {
      const id = row.conversa_id;
      if (!id) return;
      if (!Array.isArray(tagsByConversation[id])) tagsByConversation[id] = [];
      const tagName = row.whatsapp_tags?.nome;
      if (tagName) tagsByConversation[id].push(tagName);
    });

    const notesByConversation = {};
    (notesRows.data || []).forEach((row) => {
      const id = row.conversa_id;
      if (!id) return;
      if (!Array.isArray(notesByConversation[id])) notesByConversation[id] = [];
      if (row.conteudo) notesByConversation[id].push(row.conteudo);
    });

    const openTasksByConversation = {};
    (openTaskRows.data || []).forEach((row) => {
      const id = row.conversa_id;
      if (!id) return;
      if (!Array.isArray(openTasksByConversation[id])) openTasksByConversation[id] = [];
      if (row.titulo) openTasksByConversation[id].push(row.titulo);
    });

    rows = rows.map((row) => ({
      ...row,
      __searchMeta: {
        tags: tagsByConversation[row.id] || [],
        notes: notesByConversation[row.id] || [],
        openTasks: openTasksByConversation[row.id] || [],
        stageName: columnNameById[row.kanban_column_id] || ''
      }
    }));

    if (term) {
      rows = rows.filter((row) => {
        const fields = [
          normalizeTerm(row.nome_cliente),
          normalizeTerm(row.telefone),
          normalizeTerm(row.ultima_mensagem),
          normalizeTerm(row.__searchMeta.stageName),
          normalizeTerm(row.valor_negocio)
        ];

        const tagsJoined = normalizeTerm((row.__searchMeta.tags || []).join(' '));
        const notesJoined = normalizeTerm((row.__searchMeta.notes || []).join(' '));
        const tasksJoined = normalizeTerm((row.__searchMeta.openTasks || []).join(' '));

        return fields.some((field) => field.includes(term))
          || tagsJoined.includes(term)
          || notesJoined.includes(term)
          || tasksJoined.includes(term);
      });
    }

    if (filter === 'waiting') {
      rows = rows.filter((row) => row.modo_atendimento === 'manual');
    }

    if (filter === 'unread') {
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
    await appendConversationActivity(conversationId, 'nota_adicionada', 'Nota interna adicionada', {
      nota_id: data?.id || null
    });
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
    await appendConversationActivity(conversationId, 'valor_alterado', 'Valor de negócio atualizado', {
      valor_negocio: numericValue
    });
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
      .select('id, nome, slug, ordem, cor, ativo, fixa_sistema, descricao, pode_arquivar')
      .eq('ativo', true)
      .order('ordem', { ascending: true });

    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  async function createKanbanColumn(payload) {
    const client = ensureSupabaseClient();
    const columnName = String(payload?.nome || '').trim();
    if (!columnName) {
      throw new Error('Nome da coluna é obrigatório.');
    }

    const { data: maxOrderRows, error: maxOrderError } = await client
      .from('whatsapp_kanban_columns')
      .select('ordem')
      .order('ordem', { ascending: false })
      .limit(1);

    if (maxOrderError) throw maxOrderError;

    const nextOrder = Number(maxOrderRows?.[0]?.ordem || 0) + 10;

    const { data, error } = await client
      .from('whatsapp_kanban_columns')
      .insert({
        nome: columnName,
        slug: payload?.slug || null,
        ordem: payload?.ordem ?? nextOrder,
        cor: payload?.cor || null,
        ativo: payload?.ativo !== false,
        fixa_sistema: false,
        descricao: payload?.descricao || null,
        pode_arquivar: payload?.pode_arquivar === true
      })
      .select('id, nome, slug, ordem, cor, ativo, fixa_sistema, descricao, pode_arquivar')
      .single();

    if (error) throw error;
    return data;
  }

  async function updateKanbanColumn(columnId, payload) {
    if (!columnId) throw new Error('Coluna inválida para atualização.');

    const client = ensureSupabaseClient();
    const patch = {};

    if (Object.prototype.hasOwnProperty.call(payload, 'nome')) patch.nome = String(payload.nome || '').trim();
    if (Object.prototype.hasOwnProperty.call(payload, 'ordem')) patch.ordem = Number(payload.ordem || 0);
    if (Object.prototype.hasOwnProperty.call(payload, 'ativo')) patch.ativo = payload.ativo !== false;
    if (Object.prototype.hasOwnProperty.call(payload, 'cor')) patch.cor = payload.cor || null;
    if (Object.prototype.hasOwnProperty.call(payload, 'descricao')) patch.descricao = payload.descricao || null;

    const { data, error } = await client
      .from('whatsapp_kanban_columns')
      .update(patch)
      .eq('id', columnId)
      .select('id, nome, slug, ordem, cor, ativo, fixa_sistema, descricao, pode_arquivar')
      .single();

    if (error) throw error;
    return data;
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
    const { data: currentConversation, error: currentError } = await client
      .from('whatsapp_conversas')
      .select('id, kanban_column_id')
      .eq('id', conversationId)
      .single();

    if (currentError) throw currentError;

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

    await appendConversationActivity(conversationId, 'mudanca_coluna', 'Conversa movida no Kanban', {
      coluna_origem_id: currentConversation?.kanban_column_id || null,
      coluna_destino_id: columnId
    });

    return data;
  }

  async function fetchConversationTasks(conversationId) {
    if (!conversationId) return [];
    const client = ensureSupabaseClient();

    const { data, error } = await client
      .from('whatsapp_conversa_tasks')
      .select('id, conversa_id, titulo, descricao, status, vencimento_em, created_at, updated_at')
      .eq('conversa_id', conversationId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  async function saveConversationTask(conversationId, payload) {
    if (!conversationId) throw new Error('Conversa inválida para tarefa.');
    const title = String(payload?.titulo || '').trim();
    if (!title) throw new Error('Título da tarefa é obrigatório.');

    const client = ensureSupabaseClient();
    const { data, error } = await client
      .from('whatsapp_conversa_tasks')
      .insert({
        conversa_id: conversationId,
        titulo: title,
        descricao: payload?.descricao || null,
        status: payload?.status || 'pendente',
        vencimento_em: payload?.vencimento_em || null
      })
      .select('id, conversa_id, titulo, descricao, status, vencimento_em, created_at, updated_at')
      .single();

    if (error) throw error;

    await appendConversationActivity(conversationId, 'tarefa_criada', 'Tarefa criada', {
      task_id: data?.id || null,
      titulo: title
    });

    return data;
  }

  async function updateConversationTask(taskId, payload) {
    if (!taskId) throw new Error('Tarefa inválida para atualização.');

    const client = ensureSupabaseClient();
    const patch = {};
    if (Object.prototype.hasOwnProperty.call(payload, 'titulo')) patch.titulo = String(payload.titulo || '').trim();
    if (Object.prototype.hasOwnProperty.call(payload, 'descricao')) patch.descricao = payload.descricao || null;
    if (Object.prototype.hasOwnProperty.call(payload, 'status')) patch.status = payload.status;
    if (Object.prototype.hasOwnProperty.call(payload, 'vencimento_em')) patch.vencimento_em = payload.vencimento_em || null;

    const { data, error } = await client
      .from('whatsapp_conversa_tasks')
      .update(patch)
      .eq('id', taskId)
      .select('id, conversa_id, titulo, descricao, status, vencimento_em, created_at, updated_at')
      .single();

    if (error) throw error;

    if (patch.status === 'concluida') {
      await appendConversationActivity(data.conversa_id, 'tarefa_concluida', 'Tarefa concluída', {
        task_id: data.id,
        titulo: data.titulo
      });
    }

    return data;
  }

  async function fetchConversationReminders(conversationId) {
    if (!conversationId) return [];
    const client = ensureSupabaseClient();

    const { data, error } = await client
      .from('whatsapp_conversa_reminders')
      .select('id, conversa_id, titulo, lembrar_em, status, created_at, updated_at')
      .eq('conversa_id', conversationId)
      .order('lembrar_em', { ascending: true });

    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  async function saveConversationReminder(conversationId, payload) {
    if (!conversationId) throw new Error('Conversa inválida para lembrete.');
    const title = String(payload?.titulo || '').trim();
    if (!title) throw new Error('Título do lembrete é obrigatório.');
    if (!payload?.lembrar_em) throw new Error('Data/hora do lembrete é obrigatória.');

    const client = ensureSupabaseClient();
    const { data, error } = await client
      .from('whatsapp_conversa_reminders')
      .insert({
        conversa_id: conversationId,
        titulo: title,
        lembrar_em: payload.lembrar_em,
        status: payload?.status || 'ativo'
      })
      .select('id, conversa_id, titulo, lembrar_em, status, created_at, updated_at')
      .single();

    if (error) throw error;

    await appendConversationActivity(conversationId, 'lembrete_criado', 'Lembrete cadastrado', {
      reminder_id: data?.id || null,
      titulo: title,
      lembrar_em: data?.lembrar_em || payload.lembrar_em
    });

    return data;
  }

  async function fetchConversationActivities(conversationId) {
    if (!conversationId) return [];
    const client = ensureSupabaseClient();

    const { data, error } = await client
      .from('whatsapp_conversa_atividades')
      .select('id, conversa_id, tipo, descricao, meta, created_at')
      .eq('conversa_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    return Array.isArray(data) ? data : [];
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
    createKanbanColumn,
    updateKanbanColumn,
    fetchKanbanBoardData,
    updateConversationKanbanColumn,
    fetchConversationTasks,
    saveConversationTask,
    updateConversationTask,
    fetchConversationReminders,
    saveConversationReminder,
    fetchConversationActivities,
    saveManualMessage,
    sendManualWhatsAppMessage
  };
})();
