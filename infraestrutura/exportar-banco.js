// Gera os arquivos do BANCO DE DADOS com os dados de exemplo:
//   banco.sql                       -> MySQL (Workbench, XAMPP ou Aiven)
//   public/dados/banco-exemplo.sql  -> SQLite (usado pelo site online, no GitHub Pages)
//
// Como usar:
//   npm run exportar                -> usa a data de hoje
//   npm run exportar -- 2026-11-17  -> usa uma data fixa
const fs = require("fs");
const path = require("path");
const { criarDados } = require("./dadosExemplo");

function dataDeHoje() {
  const agora = new Date();
  agora.setMinutes(agora.getMinutes() - agora.getTimezoneOffset());
  return agora.toISOString().slice(0, 10);
}

const hoje = process.argv[2] || dataDeHoje();
const { lotes, vendas } = criarDados(hoje);

// Transforma um valor JavaScript em texto SQL
function valorSql(valor) {
  if (valor === null) return "NULL";
  if (typeof valor === "number") return String(valor);
  return "'" + String(valor).split("'").join("''") + "'";
}

// Monta as linhas do INSERT: (1, 'abc', ...), (2, 'def', ...)
function linhas(registros) {
  return registros.map((r) => "  (" + r.map(valorSql).join(", ") + ")").join(",\n");
}

// O SQLite aceita no máximo 500 linhas por INSERT, então dividimos em partes
function emPartes(lista, tamanho) {
  const partes = [];
  for (let i = 0; i < lista.length; i += tamanho) {
    partes.push(lista.slice(i, i + tamanho));
  }
  return partes;
}

const COLUNAS_LOTES = `id, codigo_lote, produto, categoria, estabelecimento, fornecedor,
  quantidade, quantidade_vendida, quantidade_descartada, preco_unitario,
  data_fabricacao, data_validade, data_entrada, data_descarte, status`;
const COLUNAS_VENDAS =
  "lote_id, quantidade, preco_unitario, desconto_percentual, valor_total, data_venda";

// ---------------------------------------------------------
// 1) MySQL
// ---------------------------------------------------------
const mysql = `-- =========================================================
-- BANCO DE DADOS COMPLETO: gestao_lotes (MySQL)
-- Estrutura (tabelas) + dados de exemplo (${lotes.length} lotes e ${vendas.length} vendas)
-- Dados gerados com a data de referência ${hoje}.
--
-- Como usar:
--   MySQL Workbench: File > Open SQL Script > banco.sql > executar (raio)
--   Aiven: conecte no Workbench com os dados do Aiven (SSL: Require) e rode
--          este script. Ele cria o banco "gestao_lotes"; no .env use
--          DB_NAME=gestao_lotes
--
-- Observação: as datas são fixas. Com o passar dos dias os lotes vão
-- "vencendo". Para gerar dados novos com base na data de HOJE, rode:
--   npm run popular -- --limpar
-- =========================================================

create database if not exists gestao_lotes;
use gestao_lotes;

drop table if exists vendas;
drop table if exists lotes;

create table lotes (
  id int not null auto_increment primary key,
  codigo_lote varchar(30) not null unique,
  produto varchar(100) not null,
  categoria varchar(50) not null,
  estabelecimento varchar(100) not null,
  fornecedor varchar(100),
  quantidade int not null,
  quantidade_vendida int not null default 0,
  quantidade_descartada int not null default 0,
  preco_unitario decimal(10,2) not null,
  data_fabricacao date,
  data_validade date not null,
  data_entrada date not null,
  data_descarte date,
  status enum("ativo","vendido","descartado","inativo") default "ativo",
  criado_em timestamp default current_timestamp
);

create table vendas (
  id int not null auto_increment primary key,
  lote_id int not null,
  quantidade int not null,
  preco_unitario decimal(10,2) not null,
  desconto_percentual int not null default 0,
  valor_total decimal(10,2) not null,
  data_venda datetime default current_timestamp,
  foreign key (lote_id) references lotes(id)
);

-- Dados: lotes
insert into lotes (${COLUNAS_LOTES}) values
${linhas(lotes)};

-- Dados: vendas (liquidações)
insert into vendas (${COLUNAS_VENDAS}) values
${linhas(vendas)};

-- ---------------------------------------------------------
-- Consultas úteis para conferir os dados
-- ---------------------------------------------------------

-- Lotes ativos com os dias que faltam para vencer
-- select codigo_lote, produto, estabelecimento, data_validade,
--        datediff(data_validade, curdate()) as dias_para_vencer,
--        quantidade - quantidade_vendida - quantidade_descartada as disponivel
-- from lotes where status = 'ativo' order by data_validade;

-- Receita recuperada por dia
-- select date(data_venda) as dia, sum(valor_total) as receita
-- from vendas group by date(data_venda) order by dia desc;
`;

// ---------------------------------------------------------
// 2) SQLite (site online)
// ---------------------------------------------------------
const sqlite = `-- =========================================================
-- BANCO DE DADOS COMPLETO: gestao_lotes (SQLite)
-- Usado pela versão online do site (GitHub Pages).
-- O navegador carrega este arquivo, cria o banco e ajusta as datas
-- para que a data de referência abaixo vire "hoje".
-- =========================================================

create table sobre_banco (data_referencia text not null);
insert into sobre_banco values ('${hoje}');

create table lotes (
  id integer primary key autoincrement,
  codigo_lote text not null unique,
  produto text not null,
  categoria text not null,
  estabelecimento text not null,
  fornecedor text,
  quantidade integer not null,
  quantidade_vendida integer not null default 0,
  quantidade_descartada integer not null default 0,
  preco_unitario real not null,
  data_fabricacao text,
  data_validade text not null,
  data_entrada text not null,
  data_descarte text,
  status text not null default 'ativo'
    check (status in ('ativo', 'vendido', 'descartado', 'inativo')),
  criado_em text default current_timestamp
);

create table vendas (
  id integer primary key autoincrement,
  lote_id integer not null references lotes(id),
  quantidade integer not null,
  preco_unitario real not null,
  desconto_percentual integer not null default 0,
  valor_total real not null,
  data_venda text default current_timestamp
);

${emPartes(lotes, 200)
  .map((parte) => `insert into lotes (${COLUNAS_LOTES}) values\n${linhas(parte)};`)
  .join("\n\n")}

${emPartes(vendas, 200)
  .map((parte) => `insert into vendas (${COLUNAS_VENDAS}) values\n${linhas(parte)};`)
  .join("\n\n")}
`;

const raiz = path.join(__dirname, "..");
fs.writeFileSync(path.join(raiz, "banco.sql"), mysql);
fs.mkdirSync(path.join(raiz, "public", "dados"), { recursive: true });
fs.writeFileSync(path.join(raiz, "public", "dados", "banco-exemplo.sql"), sqlite);

console.log(`Data de referência: ${hoje}`);
console.log(`${lotes.length} lotes e ${vendas.length} vendas exportados para:`);
console.log("  banco.sql");
console.log("  public/dados/banco-exemplo.sql");
