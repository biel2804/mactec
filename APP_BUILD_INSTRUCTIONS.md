# MacTec Messenger — Instruções de empacotamento Android

## Objetivo
Empacotar a **Central de Conversas WhatsApp** da MacTec Support como app Android chamado **MacTec Messenger**, sem criar backend novo.

## Entrada principal do app
- URL/Tela principal web: `/mactec-messenger.html?appMode=1`
- Fallback web atual preservado: `/admin-whatsapp.html`

## Requisitos funcionais
1. Abrir diretamente a Central de Conversas WhatsApp.
2. Manter login/autenticação web já existente.
3. Navegação simples, estável e mobile-first (sem barras extras desnecessárias).
4. Respeitar tema dark da MacTec.
5. Configurar nome, ícone e splash screen.

## Estratégia recomendada
- **Opção A (preferida):** Android WebView wrapper (ou Trusted Web Activity quando aplicável).
- **Opção B:** Capacitor/Cordova como contêiner nativo mínimo.

## Arquivos de apoio já preparados
- `manifest.webmanifest`
- `service-worker.js`
- `assets/app-icons/*` (placeholders para substituir)
- `APK_WRAP_PROMPT.txt`
- `APP_ASSETS_CHECKLIST.md`

## Observações
- Não alterar backend.
- Não remover suporte web em navegador.
- Garantir que a URL inicial carregue corretamente mesmo em primeira abertura.
