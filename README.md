# Desperdício Zero: gestão de alimentos por lote

Sistema web para **controle de estoque perecível por lote**, desenvolvido a partir do resumo expandido
*"Gestão da Tecnologia Aplicada ao Combate ao Desperdício Alimentar: Plataforma Integrada de
Monitoramento e Liquidação de Estoques Próximos ao Vencimento"* (UniSociesc, Campus Joinville).

**Grupo:** Vicenzzo Palma Mastronikolis, Fanthine Knopf Gomes, Larissa Fernandes Monteiro e Gabriel de Oliveira Ferri.

## O que o sistema faz

| Requisito do resumo | Como foi implementado |
|---|---|
| Rastreamento de itens em estoque | Cada **lote** tem código, produto, categoria, estabelecimento, fornecedor, quantidade, preço, fabricação, entrada e validade |
| Alertas preditivos de vencimento | Aviso no topo da página de lotes e tabela de alertas no dashboard (lotes que vencem em até 7 dias ou já venceram) |
| Precificação dinâmica | O desconto aumenta conforme o vencimento se aproxima (tabela abaixo) |
| Liquidação dos lotes | Botão **Vender** registra a venda com o preço do dia e baixa o estoque do lote |
| Relatórios / BSC (meta de 80%) | **Dashboard** com receita recuperada, taxa de liquidação x meta de 80%, valor em risco e desperdício |
| Não perder histórico | Lotes não são excluídos: são **desativados** (status `inativo`), como visto em aula |

### Regra de precificação dinâmica

| Dias para vencer | Situação | Desconto |
|---|---|---|
| mais de 7 | No prazo | 0% |
| 4 a 7 | Atenção | 20% |
| 1 a 3 | Crítico | 40% |
| 0 (vence hoje) | Crítico | 60% |
| vencido | Vencido | não pode vender: deve ser descartado |

A regra fica em um único lugar: `regras/precificacao.js`.

## Tecnologias

- **Front-end:** HTML, CSS e JavaScript puro (mesmo padrão do CRUD de usuários da aula)
- **Back-end:** Node.js + Express
- **Banco de dados:** MySQL (biblioteca `mysql2`), local ou online e gratuito no **Aiven**
- **Gráficos do dashboard:** Chart.js (via CDN)

## Estrutura de pastas

```
gestao_lotes/
├── index.js                  -> sobe o servidor (porta 3000)
├── package.json
├── .env.example              -> modelo com os dados do banco (copie para .env)
├── banco.sql                 -> BANCO COMPLETO: tabelas + 70 lotes + 856 vendas
├── node_modules/             -> dependências já incluídas (npm install é opcional)
├── infraestrutura/
│   ├── conexao.js            -> conexão com o MySQL
│   ├── tabelas.js            -> cria as tabelas "lotes" e "vendas"
│   └── popular.js            -> insere dados de exemplo
├── regras/
│   └── precificacao.js       -> situação de validade e desconto
├── routers/
│   ├── index.js
│   ├── loteRoute.js          -> CRUD de lotes, venda, descarte, desativar
│   └── dashboardRoute.js     -> números do dashboard
└── public/                   -> o site (entregue pelo Express)
    ├── index.html            -> gestão de lotes
    ├── dashboard.html        -> dashboard
    └── assets/
        ├── css/style.css, css/dashboard.css
        └── js/script.js, js/dashboard.js
```

## Como rodar

### 1. Dependências

A pasta `node_modules` já vem no repositório. Se der algum erro, rode:

```bash
npm install
```

### 2. Escolher o banco de dados

Copie o arquivo `.env.example` e renomeie a cópia para `.env`. Depois escolha **uma** opção:

#### Opção A: banco online e gratuito (Aiven), recomendado para o grupo todo usar o mesmo banco

1. Crie uma conta em <https://aiven.io> (plano **Free**, não pede cartão).
2. Clique em **Create service**, escolha **MySQL** e o plano **Free**.
3. Espere o status ficar **Running** (leva alguns minutos).
4. Na aba **Overview** do serviço, copie **Host**, **Port**, **User** e **Password**.
5. Preencha o `.env`:

   ```
   DB_HOST=mysql-xxxx-seuprojeto.aivencloud.com
   DB_PORT=12345
   DB_USER=avnadmin
   DB_PASSWORD=sua_senha
   DB_NAME=gestao_lotes
   DB_SSL=true
   ```

6. Conecte no **MySQL Workbench** com esses mesmos dados (aba SSL: *Require*) e rode o arquivo
   **`banco.sql`**. Ele cria o banco `gestao_lotes` com todas as tabelas e dados.
7. (Opcional, mais seguro) Baixe o **CA certificate** na mesma tela e salve como `infraestrutura/ca.pem`.

> O plano gratuito do Aiven tem 1 serviço MySQL por conta, com recursos pequenos. É suficiente para este projeto.
> **Não suba o `.env` para o GitHub**: o repositório é público e a senha do banco ficaria visível para qualquer pessoa.
> Passe a senha para o grupo por mensagem privada.

#### Opção B: MySQL local (Workbench / XAMPP)

1. No Workbench, abra e execute o arquivo **`banco.sql`** (cria o banco, as tabelas e os dados).
2. Deixe o `.env` como no exemplo (`localhost`, `root`, sem senha).

### 3. Dados de exemplo

O `banco.sql` já traz 70 lotes em 4 estabelecimentos e 856 vendas, com datas até **17/11/2026**.
Como as datas são fixas, com o passar dos dias os lotes vão vencendo. Para **gerar dados novos com base
na data de hoje** (apaga os lotes e vendas atuais e insere de novo):

```bash
npm run popular -- --limpar
```

Sem o `--limpar`, o comando só insere se a tabela estiver vazia.

### 4. Subir o servidor

```bash
npm run dev      # com nodemon (reinicia sozinho ao salvar)
# ou
npm start
```

Acesse **<http://localhost:3000>** (lotes) e **<http://localhost:3000/dashboard.html>** (dashboard).

## Rotas da API

| Método | Rota | O que faz |
|---|---|---|
| GET | `/lotes?status=ativo&busca=leite` | Lista os lotes (status: `ativo`, `vendido`, `descartado`, `inativo`, `todos`) |
| GET | `/lotes/:id` | Busca um lote |
| POST | `/lotes` | Cadastra um lote |
| PUT | `/lotes/:id` | Atualiza um lote |
| POST | `/lotes/:id/vendas` | Registra uma venda `{ "quantidade": 5 }` com o preço promocional do dia |
| PUT | `/lotes/:id/descartar` | Descarta o que sobrou do lote |
| PUT | `/lotes/:id/desativar` | Desativa o lote (não apaga do banco) |
| GET | `/dashboard/estabelecimentos` | Lista de estabelecimentos (filtro) |
| GET | `/dashboard/resumo?dias=30&estabelecimento=...` | Todos os números do dashboard (`dias`: 7, 30 ou 90) |

## Indicadores do dashboard

- **Receita recuperada:** soma das vendas de lotes no período e a economia gerada ao consumidor pelos descontos.
- **Taxa de liquidação:** `vendido / (vendido + descartado)`, comparada com a meta de 80% do BSC.
- **Em risco:** valor (preço cheio) das unidades que vencem em até 7 dias.
- **Desperdício:** unidades e valor descartados no período, e lotes vencidos aguardando descarte.
- **Gráficos:** receita por dia, validade do estoque ativo, valor em risco por categoria e vendido x descartado por estabelecimento.
- **Alertas de vencimento:** tabela com os lotes mais urgentes e o preço de hoje.

Os filtros de estabelecimento e período valem para a página inteira, e o dashboard se atualiza sozinho a cada 1 minuto.

## Referências

- BRASIL. Lei nº 14.016, de 23 de junho de 2020 (combate ao desperdício e doação de alimentos).
- ONU. Objetivos de Desenvolvimento Sustentável: Meta 12.3.
- PNUMA. Relatório do Índice de Desperdício de Alimentos 2024.
