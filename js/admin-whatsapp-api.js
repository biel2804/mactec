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
      .select('id, telefone, nome_cliente, ultima_mensagem, ultima_interacao_em, modo_atendimento, criado_em')
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

  async function updateConversationMode(conversationId, newMode) {
    const client = ensureSupabaseClient();
    const { data, error } = await client
      .from('whatsapp_conversas')
      .update({ modo_atendimento: newMode })
      .eq('id', conversationId)
      .select('id, telefone, nome_cliente, ultima_mensagem, ultima_interacao_em, modo_atendimento, criado_em')
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
      .select('id, telefone, nome_cliente, ultima_mensagem, ultima_interacao_em, modo_atendimento, criado_em')
      .single();

    if (updateError) throw updateError;

    return { message: inserted, conversation: updatedConversation };
  }

  async function sendManualWhatsAppMessage(conversationId, phone, text) {
    const result = await saveManualMessage(conversationId, phone, text);

    const endpoint = APP_CONFIG.WHATSAPP_ADMIN_SEND_ENDPOINT || APP_CONFIG.WHATSAPP_SEND_ENDPOINT || '';
    if (!endpoint) {
      return { ...result, delivery: { status: 'not_configured' } };
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(SUPABASE_KEY ? { apikey: SUPABASE_KEY } : {})
        },
        body: JSON.stringify({ conversationId, phone, text })
      });

      const payload = await response.json().catch(() => null);
      return {
        ...result,
        delivery: {
          status: response.ok ? 'sent' : 'failed',
          httpStatus: response.status,
          payload
        }
      };
    } catch (error) {
      console.warn('Falha no disparo externo do WhatsApp:', error);
      return {
        ...result,
        delivery: {
          status: 'failed',
          error: error?.message || 'Erro desconhecido'
        }
      };
    }
  }

  window.WhatsAppAdminApi = {
    fetchWhatsAppConversations,
    fetchWhatsAppMessages,
    updateConversationMode,
    saveManualMessage,
    sendManualWhatsAppMessage
  };
})();
