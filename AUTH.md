# Autenticação com Google (conta de e-mail comum)

Este guia mostra, passo a passo, como configurar uma conta **comum do Google
(Gmail)** — sem Google Workspace, sem domínio corporativo — para autenticar a
publicação de posts neste blog.

> **Resumo do que você vai precisar criar:** um *OAuth Client ID* do tipo
> *Web application* no Google Cloud Console. Ele lhe dá um **Client ID** e um
> **Client Secret**, que você cola no arquivo `.env`. Só isso. Não há custo e
> não é necessário verificação do app pelo Google.

---

## 1. Como a autenticação funciona neste blog

Antes de configurar, entenda o fluxo (implementado em
[`src/lib/auth.ts`](src/lib/auth.ts) e [`src/routes/auth.ts`](src/routes/auth.ts)):

1. O visitante clica em **"Continue with Google"** na página `/login`.
2. O blog redireciona para o Google (`/auth/google`), pedindo apenas os escopos
   `openid`, `email` e `profile` (dados básicos, **não sensíveis**).
3. O Google autentica a pessoa e volta para
   **`<SITE_URL>/auth/google/callback`** com um código.
4. O blog troca o código pelo perfil verificado e checa o e-mail.
5. **Só o e-mail configurado em `ADMIN_EMAIL` é aceito.** Qualquer outra conta
   Google consegue *fazer login no Google*, mas é rejeitada na porta do blog
   (`/login?error=unauthorized`).

Pontos importantes que simplificam a configuração:

- Os escopos usados são **não sensíveis**, então o Google **não exige
  verificação** do aplicativo.
- Usamos `access_type: online` (sem *refresh tokens*), então **não há** o limite
  de expiração de 7 dias que afeta apps em modo de teste com tokens de longa
  duração.
- Como apenas **uma** conta usa o sistema, você pode deixar o app em modo
  **"Testing"** para sempre e simplesmente adicionar seu Gmail como *test user*.

---

## 2. Pré-requisitos

- Uma conta Google comum (ex.: `fabiano.weimar@gmail.com`) — a **mesma** que
  você vai usar para publicar.
- Saber qual será a URL pública do site (`SITE_URL`). Para desenvolvimento
  local, será `http://localhost:3000`.

---

## 3. Criar um projeto no Google Cloud

1. Acesse o **Google Cloud Console**: <https://console.cloud.google.com/>.
2. No topo, clique no seletor de projetos → **"New Project"** (Novo projeto).
3. Dê um nome, ex.: `plain-blog`. Organização/local podem ficar como estão.
4. Clique em **"Create"** e aguarde. Depois, selecione o projeto recém-criado
   no seletor do topo.

> Você **não precisa** ativar nenhuma API extra. O login via OpenID Connect
> funciona sem habilitar serviços adicionais.

---

## 4. Configurar a tela de consentimento (OAuth consent screen)

No console novo isto aparece como **"Google Auth Platform"**; no console clássico
fica em **APIs & Services → OAuth consent screen**. Os passos são equivalentes.

1. No menu lateral, vá em **APIs & Services → OAuth consent screen**
   (ou **Google Auth Platform → Branding/Audience**).
2. Em **User Type**, escolha **External** (Externo) e clique em **Create**.
   - *External* é o correto para contas Gmail comuns. *Internal* só existe em
     contas Google Workspace.
3. Preencha as informações de **Branding / App information**:
   - **App name:** ex.: `Fabiano Weimar Blog`
   - **User support email:** seu Gmail
   - **Developer contact information:** seu Gmail
   - Logo e links são **opcionais** — deixe em branco.
4. Em **Scopes / Data Access**: **não adicione nada**. Os escopos
   `openid`, `email` e `profile` são solicitados automaticamente pelo app e não
   precisam ser declarados aqui. Avance.
5. Em **Audience / Test users**:
   - Mantenha o status do app como **"Testing"** (Teste).
   - Clique em **"Add users"** e adicione o **mesmo Gmail** que será o
     `ADMIN_EMAIL` (ex.: `fabiano.weimar@gmail.com`).
   - Isso autoriza essa conta a usar o app enquanto ele está em modo de teste.
6. Salve.

> **Por que deixar em "Testing"?** Como só você usa o blog, não há motivo para
> publicar o app. Em modo de teste, apenas os *test users* listados conseguem
> autenticar — exatamente o que queremos. Você **não** precisa passar pelo
> processo de verificação do Google.
>
> Se um dia quiser permitir qualquer conta Google (não recomendado aqui, pois o
> `ADMIN_EMAIL` já restringe o acesso), você poderia clicar em **"Publish app"**.
> Mesmo publicado, o blog continua bloqueando todos exceto o `ADMIN_EMAIL`.

---

## 5. Criar as credenciais (OAuth Client ID)

1. No menu lateral, vá em **APIs & Services → Credentials**
   (ou **Google Auth Platform → Clients**).
2. Clique em **"Create Credentials" → "OAuth client ID"**.
3. Em **Application type**, escolha **Web application**.
4. **Name:** ex.: `plain-blog web`.
5. Em **Authorized JavaScript origins**, adicione a origem do site (sem caminho):
   - Local: `http://localhost:3000`
   - Produção: `https://seu-dominio.com`
6. Em **Authorized redirect URIs**, adicione a URL de callback — **isto precisa
   bater exatamente** com `<SITE_URL>/auth/google/callback`:
   - Local: `http://localhost:3000/auth/google/callback`
   - Produção: `https://seu-dominio.com/auth/google/callback`

   > Você pode cadastrar **vários** redirect URIs no mesmo client (ex.: um para
   > local e outro para produção). Adicione todos os que for usar.
7. Clique em **"Create"**. O console mostrará o **Client ID** e o
   **Client Secret**. Copie os dois (o secret também pode ser baixado depois,
   mas guarde-o com segurança).

### ⚠️ A regra de ouro do redirect URI

O valor cadastrado no Google **precisa ser idêntico**, caractere por caractere,
ao que o blog gera. O blog monta a URL assim
([`src/app.ts`](src/app.ts)):

```
redirectUri = `${SITE_URL}/auth/google/callback`
```

Logo:

| Se `SITE_URL` for…              | O redirect URI no Google deve ser…                  |
| ------------------------------- | --------------------------------------------------- |
| `http://localhost:3000`         | `http://localhost:3000/auth/google/callback`        |
| `https://blog.example.com`      | `https://blog.example.com/auth/google/callback`     |

Atenção a `http` vs `https`, à porta (`:3000`), e a **não** ter barra final
extra. A maioria dos erros de login vem de uma divergência aqui
(`redirect_uri_mismatch`).

---

## 6. Preencher o arquivo `.env`

Copie o exemplo e preencha:

```bash
cp .env.example .env
```

Edite as variáveis relacionadas à autenticação:

```dotenv
# URL pública do site — usada para montar o redirect do OAuth.
SITE_URL=http://localhost:3000

# A ÚNICA conta autorizada a publicar.
ADMIN_EMAIL=fabiano.weimar@gmail.com

# Credenciais copiadas do passo 5.
GOOGLE_CLIENT_ID=1234567890-xxxxxxxxxxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxx

# Segredo para assinar o cookie de sessão — gere um valor aleatório longo.
SESSION_SECRET=cole-aqui-uma-string-aleatoria-bem-longa
```

### Gerar um `SESSION_SECRET` seguro

Use qualquer string aleatória longa. Por exemplo:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Cole a saída em `SESSION_SECRET`.

> **`ADMIN_EMAIL` é o que de fato restringe o acesso.** Mesmo que outra pessoa
> consiga entrar no Google e seu app esteja publicado, ela será recusada se o
> e-mail não bater (comparação *case-insensitive*, veja `isAuthorized` em
> [`src/lib/auth.ts`](src/lib/auth.ts)). A conta que você colocar aqui **deve**
> ser a mesma adicionada como *test user* no passo 4.5.

---

## 7. Testar o login

1. Suba o blog:
   ```bash
   npm run dev          # ou: docker compose up --build
   ```
2. Abra `http://localhost:3000/login`.
3. Clique em **"Continue with Google"**.
4. Faça login com o Gmail configurado em `ADMIN_EMAIL`.
5. Você será redirecionado para **`/admin`** (o painel). ✅

Se entrar com **outra** conta Google, verá a mensagem
*"That Google account is not authorized to edit this blog."* — comportamento
esperado.

---

## 8. Configuração para produção

Ao publicar em um domínio real:

1. Defina `SITE_URL=https://seu-dominio.com` no ambiente (ou no
   `docker-compose.yml`).
2. No Google Cloud Console → **Credentials → seu OAuth client**, adicione:
   - **Authorized JavaScript origin:** `https://seu-dominio.com`
   - **Authorized redirect URI:** `https://seu-dominio.com/auth/google/callback`
3. Use **HTTPS** em produção (o cookie de sessão é `httpOnly` + `sameSite=lax`;
   um proxy/terminador TLS na frente é o recomendado).
4. Mantenha o app em **"Testing"** com seu Gmail como *test user* — continua
   funcionando indefinidamente para os escopos não sensíveis usados aqui.

---

## 9. Solução de problemas

| Sintoma / mensagem do Google | Causa provável | Como resolver |
| --- | --- | --- |
| `Error 400: redirect_uri_mismatch` | O redirect URI cadastrado não bate com `<SITE_URL>/auth/google/callback`. | Confira `http`/`https`, porta, e barra final. O valor no Google deve ser idêntico ao gerado pelo app. |
| `Error 403: access_denied` / "App não verificado" / "esta conta não tem acesso" | A conta usada não está na lista de *test users*. | Em **OAuth consent screen → Test users**, adicione o Gmail; use exatamente essa conta no login. |
| Login funciona, mas o blog mostra *"not authorized"* (`/login?error=unauthorized`) | A conta autenticada ≠ `ADMIN_EMAIL`. | Entre com a conta correta ou ajuste `ADMIN_EMAIL` no `.env` e reinicie. |
| Volta para `/login?error=auth_failed` | Falha na troca do código (Client ID/Secret errados ou expirados). | Reconfira `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` no `.env`; gere um novo secret se necessário. |
| `/login?error=missing_code` | O Google não retornou o parâmetro `code` (acesso direto à URL de callback). | Inicie o fluxo pelo botão em `/login`, não acessando o callback diretamente. |
| Sessão "não gruda" / pede login a cada vez | `SESSION_SECRET` ausente/instável, ou cookie bloqueado. | Defina um `SESSION_SECRET` fixo; em produção use HTTPS e o mesmo domínio do `SITE_URL`. |

---

## 10. Boas práticas de segurança

- **Nunca** faça commit do arquivo `.env` (já está no `.gitignore`).
- Trate o **Client Secret** e o **`SESSION_SECRET`** como senhas.
- Se um secret vazar, gere outro em **Credentials** (rotacione o Client Secret)
  e atualize o `.env`.
- O acesso de escrita depende de **duas** barreiras: estar na lista de *test
  users* do Google **e** o e-mail ser igual a `ADMIN_EMAIL`. Mantenha as duas
  consistentes.
