# Resource Allocation

Sistema colaborativo de **Gestão de Recursos, Projetos e Alocações** construído com React + TypeScript + Firebase. Suporta autenticação Google, controle de papéis (admin/manager/viewer), tempo real, importação/exportação CSV/XLSX, detecção de conflitos de FTE e dashboards.

---

## Stack

- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui, Recharts
- **State**: Zustand + TanStack Query (com listeners em tempo real do Firestore)
- **Backend**: Firebase Auth (Google), Firestore, Cloud Functions (Node 20)
- **Deploy**: Firebase Hosting (recomendado) ou Google Cloud Run (Dockerfile incluído)

---

## Estrutura do projeto

```
.
├── src/                      # Aplicação React (Vite)
│   ├── components/
│   ├── hooks/
│   ├── lib/                  # firebase, csv, utils, logger
│   ├── pages/                # Dashboard, Resources, Projects, Allocations, Settings, Auth
│   ├── services/             # Camada de acesso ao Firestore
│   ├── store/                # Zustand (auth + UI)
│   └── types/
├── functions/                # Cloud Functions (v2, callable)
├── firebase.json
├── firestore.rules
├── firestore.indexes.json
├── Dockerfile                # Cloud Run / qualquer host de container
├── nginx.conf                # Servidor estático SPA para o container
├── cloudbuild.yaml           # Pipeline opcional Google Cloud Build → Cloud Run
└── .env.example
```

---

## Pré-requisitos

- Node.js **20.x** (LTS)
- npm 10+
- Conta Google Cloud / Firebase
- Firebase CLI: `npm install -g firebase-tools`

---

## 1. Configuração inicial

```bash
# 1. Clone o repositório
git clone <seu-repo> resource-allocation
cd resource-allocation

# 2. Instale dependências (front + functions)
npm install
cd functions && npm install && cd ..

# 3. Crie seu .env a partir do exemplo
cp .env.example .env
```

Edite `.env` preenchendo as variáveis do Firebase (Console Firebase → Configurações do projeto → SDK config):

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=seu-projeto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=seu-projeto
VITE_FIREBASE_STORAGE_BUCKET=seu-projeto.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...

# Esse e-mail vira admin automaticamente no 1º login
VITE_BOOTSTRAP_ADMIN_EMAIL=leopetretti@gmail.com

# Modo emulador local (opcional)
VITE_USE_EMULATORS=false
```

Edite também `.firebaserc` com o ID do seu projeto:

```json
{ "projects": { "default": "seu-projeto-firebase" } }
```

---

## 2. Configuração do Firebase

No [Console Firebase](https://console.firebase.google.com):

1. **Criar projeto** (ou usar existente).
2. **Authentication** → habilitar provedor **Google**.
3. **Firestore Database** → criar banco em modo **Produção**.
4. **Cloud Functions** → habilitar (requer plano Blaze para deploy).
5. **Login no CLI**:
   ```bash
   firebase login
   firebase use seu-projeto-firebase
   ```
6. **Deploy das regras e índices**:
   ```bash
   firebase deploy --only firestore:rules,firestore:indexes
   ```

---

## 3. Desenvolvimento local

```bash
# App em http://localhost:5173
npm run dev
```

### Com emuladores Firebase (sem custos / offline):

```bash
# Em um terminal
firebase emulators:start

# No .env:
VITE_USE_EMULATORS=true

# Em outro terminal
npm run dev
```

UI dos emuladores: http://localhost:4000

---

## 4. Build de produção

```bash
npm run build       # gera dist/
npm run preview     # serve dist/ localmente em http://localhost:4173
```

---

## 5. Deploy

### Opção A — Firebase Hosting (recomendado)

Tudo já está configurado em `firebase.json` (hosting + rules + functions).

```bash
# Deploy completo
npm run deploy

# Ou em partes:
npm run deploy:hosting       # apenas a SPA
npm run deploy:rules         # apenas regras do Firestore
npm run deploy:functions     # apenas Cloud Functions
```

A aplicação ficará disponível em `https://<seu-projeto>.web.app`.

### Opção B — Google Cloud Run (container)

O `Dockerfile` faz multi-stage build (Node → Nginx) e serve a SPA estática.

```bash
# 1. Habilite as APIs (uma vez)
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com

# 2. Build da imagem (passando as variáveis do .env como build-args)
PROJECT_ID=$(gcloud config get-value project)
REGION=southamerica-east1   # ou us-central1

gcloud builds submit \
  --tag $REGION-docker.pkg.dev/$PROJECT_ID/apps/resource-allocation:latest \
  --substitutions=_REGION=$REGION

# 3. Deploy no Cloud Run
gcloud run deploy resource-allocation \
  --image $REGION-docker.pkg.dev/$PROJECT_ID/apps/resource-allocation:latest \
  --region $REGION \
  --allow-unauthenticated \
  --port 8080
```

> **Importante**: como as variáveis `VITE_*` são embutidas no bundle em build-time, você precisa
> exportá-las antes do `gcloud builds submit` ou passá-las como `--build-arg`. Veja o
> `cloudbuild.yaml` para um pipeline completo.

#### Pipeline CI/CD (Cloud Build):

```bash
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_FIREBASE_API_KEY="...",_FIREBASE_PROJECT_ID="..."
```

### Opção C — Qualquer servidor estático

A pasta `dist/` gerada pelo `npm run build` contém apenas arquivos estáticos. Pode ser servida em:
**Vercel, Netlify, AWS S3+CloudFront, Azure Static Web Apps, Nginx, Apache, GitHub Pages**, etc.

Configure o servidor para **fallback de SPA** (todas as rotas → `index.html`).

---

## 6. Primeiro acesso

1. Acesse a URL implantada.
2. Faça login com a conta Google cujo e-mail foi colocado em `VITE_BOOTSTRAP_ADMIN_EMAIL`.
3. Esse usuário vira **admin** automaticamente.
4. Outros usuários que fizerem login entram como **viewer** inativo e precisam ser ativados pelo admin em **Configurações → Usuários**.

---

## 7. Modelo de permissões

| Coleção       | viewer | manager | admin |
| ------------- | :----: | :-----: | :---: |
| resources     | leitura | CRUD (sem delete) | CRUD |
| projects      | leitura | CRUD (sem delete) | CRUD |
| allocations   | leitura | CRUD | CRUD |
| users         | só o próprio | só o próprio | CRUD |
| logs          | — | — | leitura |

Regras completas em `firestore.rules`.

---

## 8. Importação/Exportação

Cada página (Recursos, Projetos, Alocações) suporta:

- **Importar CSV/XLSX** (delimitador automático, headers tolerantes a acento/caixa, datas pt-BR ou ISO).
- **Exportar CSV** (com BOM para abrir no Excel BR).

Templates de campos:

- **resources**: `nome`, `cargo`, `area`, `skills` (separado por `;`), `capacidade` (0-1 ou %)
- **projects**: `nome`, `area`, `cliente`, `prioridade`, `status`, `inicio`, `fim`
- **allocations**: `recurso`, `projeto`, `fase`, `fte`, `inicio`, `fim`

---

## 9. Scripts disponíveis

```bash
npm run dev              # Vite dev server
npm run build            # Build de produção (tsc + vite)
npm run preview          # Servir build localmente
npm run lint             # ESLint
npm run test             # Vitest (one-shot)
npm run emulators        # Firebase emulators
npm run deploy           # Build + deploy completo Firebase
npm run deploy:hosting   # Deploy apenas hosting
npm run deploy:rules     # Deploy apenas regras Firestore
npm run deploy:functions # Deploy apenas Cloud Functions
```

---

## 10. Troubleshooting

- **Tela em branco após deploy** → conferir se o `index.html` tem `<base href="/">` (Vite gera caminhos relativos por padrão, ok).
- **Permission denied no Firestore** → o admin bootstrap só funciona se o e-mail no `.env` for o mesmo do login. Confira em **Authentication → Users**.
- **CORS em Cloud Functions** → use `onCall` (já feito) ou configure `cors` em `onRequest`.
- **Cloud Run 502** → verifique o `PORT` no `nginx.conf` (deve ser `8080`).

---

## Licença

Uso interno. Adapte conforme necessário.
