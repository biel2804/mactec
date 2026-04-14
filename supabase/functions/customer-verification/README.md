# customer-verification

Edge Function para OTP por e-mail no fluxo de identificação/cadastro de clientes.

## Ações

- `action: "start_verification"` → gera código de 6 dígitos, invalida códigos anteriores, aplica cooldown e envia por e-mail.
- `action: "resend_code"` → reenvia novo código por e-mail mantendo cooldown.
- `action: "verify_code"` → valida OTP, limita tentativas e retorna sessão temporária + cadastro completo quando existir.

> Compatibilidade mantida: `send` e `verify` continuam aceitos como aliases legados.

## Variáveis de ambiente

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OTP_SECRET` (obrigatório em produção)
- `EMAIL_PROVIDER` (`resend` por padrão, `mock` para logs)
- `EMAIL_PROVIDER_API_KEY` (obrigatória quando `EMAIL_PROVIDER=resend`)
- `EMAIL_FROM` (remetente validado no provedor)
