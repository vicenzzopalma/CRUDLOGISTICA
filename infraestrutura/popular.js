// Script para POPULAR o banco com dados de exemplo (para o dashboard ter o que mostrar).
//
// Como usar:
//   npm run popular              -> só insere se a tabela de lotes estiver vazia
//   npm run popular -- --limpar  -> APAGA todos os lotes e vendas e insere de novo
require("dotenv").config();

const conexao = require("./conexao");
const Tabelas = require("./tabelas");
const { criarDados } = require("./dadosExemplo");

const banco = conexao.promise();

async function popular() {
  try {
    const limpar = process.argv.includes("--limpar");
    const [[{ total }]] = await banco.query("SELECT COUNT(*) AS total FROM lotes");

    if (total > 0 && !limpar) {
      console.log(`O banco já tem ${total} lotes. Nada foi inserido.`);
      console.log("Para apagar tudo e inserir de novo: npm run popular -- --limpar");
      return;
    }

    if (limpar) {
      await banco.query("DELETE FROM vendas");
      await banco.query("DELETE FROM lotes");
      console.log("Lotes e vendas antigos apagados.");
    }

    const [[{ hoje }]] = await banco.query("SELECT CURDATE() AS hoje");
    const { lotes, vendas } = criarDados(hoje);

    // Os IDs dos lotes precisam começar em 1 (as vendas usam esses IDs)
    await banco.query("ALTER TABLE lotes AUTO_INCREMENT = 1");

    await banco.query(
      `INSERT INTO lotes (id, codigo_lote, produto, categoria, estabelecimento, fornecedor,
        quantidade, quantidade_vendida, quantidade_descartada, preco_unitario,
        data_fabricacao, data_validade, data_entrada, data_descarte, status) VALUES ?`,
      [lotes],
    );

    await banco.query(
      `INSERT INTO vendas (lote_id, quantidade, preco_unitario, desconto_percentual,
        valor_total, data_venda) VALUES ?`,
      [vendas],
    );

    console.log(`Pronto! ${lotes.length} lotes e ${vendas.length} vendas inseridos.`);
  } catch (erro) {
    console.error("Erro ao popular o banco:", erro.message);
  } finally {
    conexao.end();
  }
}

// Garante que as tabelas existem antes de inserir
Tabelas.init(conexao, popular);
