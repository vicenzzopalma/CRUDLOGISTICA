-- Script opcional para rodar no MySQL Workbench.
-- (As tabelas também são criadas sozinhas pelo arquivo infraestrutura/tabelas.js
--  quando o servidor sobe. Aqui só precisamos criar o banco.)

create database if not exists gestao_lotes;

use gestao_lotes;

-- Consultas úteis para conferir os dados:

-- Lotes ativos com os dias que faltam para vencer
select codigo_lote, produto, estabelecimento, data_validade,
       datediff(data_validade, curdate()) as dias_para_vencer,
       quantidade - quantidade_vendida - quantidade_descartada as disponivel
from lotes
where status = 'ativo'
order by data_validade;

-- Receita recuperada por dia
select date(data_venda) as dia, sum(valor_total) as receita
from vendas
group by date(data_venda)
order by dia desc;
