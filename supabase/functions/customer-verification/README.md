# customer-verification

Edge Function para OTP (WhatsApp/SMS) no fluxo de identificação de clientes.

## Ações

- `action: "send"` → gera código de 6 dígitos, invalida códigos anteriores, aplica cooldown e envia por canal configurado.
- `action: "verify"` → valida OTP, limita tentativas e retorna cadastro completo apenas após sucesso.

## Variáveis de ambiente

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OTP_SECRET` (obrigatório em produção)
- `OTP_PROVIDER` (`mock` por padrão)
