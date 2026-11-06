# Santorini · Quinta das Patroas · Lista VIP

Página de captura da Lista VIP da Quinta das Patroas, hospedada no Netlify.

- **Lista aberta:** segunda às 17h até quinta às 19h, no horário de Brasília. O servidor confere o horário em toda inscrição, então mudar o relógio do celular não adianta.
- **Lista fechada:** a página mostra "Lista fechada" e uma contagem regressiva até a próxima segunda às 17h.
- **Formulário:** nome, WhatsApp, Instagram (opcional) e acompanhantes, de 1 a 5, cada um com nome completo e WhatsApp opcional.
- **Google Sheets:** aba geral, uma aba por quinta (com checkbox de presença para a portaria) e a aba **Clientes**, sem repetição por WhatsApp.
- **Painel** em `/painel`, protegido por senha: lista por quinta, busca, CSV, impressão e base de clientes.
- **Meta:** Pixel (`PageView` e `Lead`) e API de Conversões (`Lead`) com o mesmo `event_id`, para a Meta não contar o lead duas vezes.

## Estrutura

```
public/                 site estático (o que o Netlify publica)
  index.html, styles.css, script.js
  config.js             configuração pública (ID do Pixel, links)
  painel/index.html     painel da equipe
  assets/emblem.svg     emblema provisório (troque pelo logo oficial)
netlify/functions/      backend
  status.mjs            GET  /api/status   → lista aberta/fechada
  lista.mjs             POST /api/lista    → grava na planilha + envia para a API de Conversões
  painel.mjs            GET  /api/painel   → leitura protegida por senha
netlify/lib/core.mjs    regra de horário (altere aqui o dia e a hora)
apps-script/Code.gs     script da planilha do Google
```

## Configuração passo a passo

### 1. Planilha do Google
1. Crie uma planilha no Google Sheets.
2. Abra **Extensões → Apps Script**, apague o conteúdo e cole o arquivo `apps-script/Code.gs`.
3. No topo do código, preencha `SECRET` com uma senha longa e aleatória. Se o script não estiver dentro da planilha, preencha também `SPREADSHEET_ID`.
4. Selecione a função `configurar` e clique em **Executar** para autorizar e criar as abas.
5. Clique em **Implantar → Nova implantação → Tipo: App da Web**.
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
6. Autorize e copie a URL que termina em `/exec`.

Se você alterar o script depois, use **Gerenciar implantações → Editar → Nova versão** para manter a mesma URL.

### 2. Netlify
Conecte este repositório ao Netlify. O `netlify.toml` já está configurado e não há etapa de build.
Depois, em **Site configuration → Environment variables**, cadastre:

| Variável | Valor |
|---|---|
| `SHEETS_WEBHOOK_URL` | URL `/exec` do Apps Script |
| `SHEETS_SECRET` | o mesmo valor de `SECRET` do Apps Script |
| `PAINEL_SENHA` | senha de acesso ao `/painel` |
| `META_PIXEL_ID` | ID do Pixel |
| `META_CAPI_TOKEN` | token da API de Conversões (Gerenciador de Eventos → Configurações → Gerar token de acesso) |
| `META_TEST_EVENT_CODE` | *(opcional)* código de teste, como `TEST12345`. Remova depois de validar. |
| `META_GRAPH_VERSION` | *(opcional)* padrão `v23.0` |
| `MAX_ACOMPANHANTES` | *(opcional)* padrão `5` |

Depois de cadastrar as variáveis, faça um novo deploy.

### 3. Pixel no navegador
Em `public/config.js`, o `metaPixelId` já está preenchido. Ele precisa ser igual a `META_PIXEL_ID` no Netlify. O ID é público. O token **nunca** vai nesse arquivo.

### 4. Testar
- Abra o site com `?demo=1` para testar o visual sem gravar nada. Para forçar um estado, acrescente `&preview=open` ou `&preview=closed`.
- Para validar a Meta, cadastre `META_TEST_EVENT_CODE` e confira em **Gerenciador de Eventos → Testar eventos**. Os eventos do Pixel e da API devem aparecer marcados como deduplicados.

## Mudar dias e horários
Edite `ABRE`, `FECHA` e `DIA_EVENTO` em `netlify/lib/core.mjs`. Se mudar, ajuste também os textos "segunda às 17h" e "quinta às 19h" em `public/index.html` e `public/script.js`.
