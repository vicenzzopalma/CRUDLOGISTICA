const { Router } = require("express");
const router = Router();
const conexao = require("../infraestrutura/conexao");
const {
  calcularDesconto,
  calcularPrecoPromocional,
  completarLote,
} = require("../regras/precificacao");

// Trecho de SQL que calcula quantos dias faltam para o lote vencer
const CAMPO_DIAS = "DATEDIFF(data_validade, CURDATE()) AS dias_para_vencer";

// Confere os dados enviados pelo formulário.
// Devolve uma mensagem de erro ou null se estiver tudo certo.
function validarLote(dados) {
  if (
    !dados.codigo_lote ||
    !dados.produto ||
    !dados.categoria ||
    !dados.estabelecimento ||
    !dados.data_validade ||
    !dados.data_entrada
  ) {
    return "Preencha todos os campos obrigatórios.";
  }

  const quantidade = Number(dados.quantidade);
  if (!Number.isInteger(quantidade) || quantidade <= 0) {
    return "A quantidade deve ser um número inteiro maior que zero.";
  }

  const preco = Number(dados.preco_unitario);
  if (isNaN(preco) || preco <= 0) {
    return "O preço unitário deve ser maior que zero.";
  }

  if (dados.data_fabricacao && dados.data_fabricacao > dados.data_validade) {
    return "A data de fabricação não pode ser depois da validade.";
  }

  return null;
}

// Monta o objeto que vai para o banco, só com os campos permitidos
function montarLote(dados) {
  return {
    codigo_lote: dados.codigo_lote.trim().toUpperCase(),
    produto: dados.produto.trim(),
    categoria: dados.categoria,
    estabelecimento: dados.estabelecimento.trim(),
    fornecedor: dados.fornecedor ? dados.fornecedor.trim() : null,
    quantidade: Number(dados.quantidade),
    preco_unitario: Number(dados.preco_unitario),
    data_fabricacao: dados.data_fabricacao || null,
    data_validade: dados.data_validade,
    data_entrada: dados.data_entrada,
  };
}

// READ: listar lotes (com filtros opcionais)
// Exemplo: /lotes?status=ativo&busca=leite
router.get("/lotes", (req, res) => {
  const status = req.query.status || "ativo";
  const busca = req.query.busca || "";

  let sql = `SELECT *, ${CAMPO_DIAS} FROM lotes WHERE 1 = 1`;
  const valores = [];

  if (status !== "todos") {
    sql += " AND status = ?";
    valores.push(status);
  }

  if (busca) {
    sql += " AND (produto LIKE ? OR codigo_lote LIKE ? OR estabelecimento LIKE ?)";
    valores.push("%" + busca + "%", "%" + busca + "%", "%" + busca + "%");
  }

  // Os que vencem primeiro aparecem primeiro (regra PVPS)
  sql += " ORDER BY data_validade ASC, id ASC";

  conexao.query(sql, valores, (erro, resultado) => {
    if (erro) {
      console.error(erro.message);
      return res.status(500).json({ erro: "Erro ao buscar os lotes." });
    }
    res.json(resultado.map(completarLote));
  });
});

// READ: buscar um lote pelo ID
router.get("/lotes/:id", (req, res) => {
  const { id } = req.params;
  const sql = `SELECT *, ${CAMPO_DIAS} FROM lotes WHERE id = ?`;

  conexao.query(sql, [id], (erro, resultado) => {
    if (erro) {
      return res.status(500).json({ erro: "Erro ao buscar o lote." });
    }
    if (resultado.length === 0) {
      return res.status(404).json({ erro: "Lote não encontrado." });
    }
    res.json(completarLote(resultado[0]));
  });
});

// CREATE: cadastrar lote
router.post("/lotes", (req, res) => {
  const mensagemErro = validarLote(req.body);
  if (mensagemErro) {
    return res.status(400).json({ erro: mensagemErro });
  }

  const lote = montarLote(req.body);
  const sql = "INSERT INTO lotes SET ?";

  conexao.query(sql, lote, (erro, resultado) => {
    if (erro) {
      if (erro.code === "ER_DUP_ENTRY") {
        return res
          .status(400)
          .json({ erro: "Já existe um lote com o código " + lote.codigo_lote });
      }
      console.error(erro.message);
      return res.status(500).json({ erro: "Erro ao cadastrar o lote." });
    }
    res.status(201).json({ id: resultado.insertId, ...lote });
  });
});

// UPDATE: atualizar os dados de um lote
router.put("/lotes/:id", (req, res) => {
  const { id } = req.params;

  const mensagemErro = validarLote(req.body);
  if (mensagemErro) {
    return res.status(400).json({ erro: mensagemErro });
  }

  const lote = montarLote(req.body);

  // Primeiro buscamos o lote para conferir o que já foi vendido/descartado
  conexao.query("SELECT * FROM lotes WHERE id = ?", [id], (erro, resultado) => {
    if (erro) {
      return res.status(500).json({ erro: "Erro ao buscar o lote." });
    }
    if (resultado.length === 0) {
      return res.status(404).json({ erro: "Lote não encontrado." });
    }

    const atual = resultado[0];
    const jaSaiu = atual.quantidade_vendida + atual.quantidade_descartada;

    if (lote.quantidade < jaSaiu) {
      return res.status(400).json({
        erro: `A quantidade não pode ser menor que ${jaSaiu} (já vendido/descartado).`,
      });
    }

    conexao.query("UPDATE lotes SET ? WHERE id = ?", [lote, id], (erro) => {
      if (erro) {
        if (erro.code === "ER_DUP_ENTRY") {
          return res
            .status(400)
            .json({ erro: "Já existe um lote com o código " + lote.codigo_lote });
        }
        return res.status(500).json({ erro: "Erro ao atualizar o lote." });
      }
      res.json({ mensagem: "Lote atualizado com sucesso." });
    });
  });
});

// LIQUIDAÇÃO: registrar uma venda de unidades do lote
router.post("/lotes/:id/vendas", (req, res) => {
  const { id } = req.params;
  const quantidade = Number(req.body.quantidade);

  if (!Number.isInteger(quantidade) || quantidade <= 0) {
    return res.status(400).json({ erro: "Informe uma quantidade válida." });
  }

  const sqlBusca = `SELECT *, ${CAMPO_DIAS} FROM lotes WHERE id = ?`;

  conexao.query(sqlBusca, [id], (erro, resultado) => {
    if (erro) {
      return res.status(500).json({ erro: "Erro ao buscar o lote." });
    }
    if (resultado.length === 0) {
      return res.status(404).json({ erro: "Lote não encontrado." });
    }

    const lote = completarLote(resultado[0]);

    if (lote.status !== "ativo") {
      return res.status(400).json({ erro: "Só é possível vender lotes ativos." });
    }
    if (lote.dias_para_vencer < 0) {
      return res
        .status(400)
        .json({ erro: "Lote vencido não pode ser vendido. Faça o descarte." });
    }
    if (quantidade > lote.disponivel) {
      return res
        .status(400)
        .json({ erro: `Só existem ${lote.disponivel} unidades disponíveis.` });
    }

    const desconto = calcularDesconto(lote.dias_para_vencer);
    const precoVenda = calcularPrecoPromocional(
      lote.preco_unitario,
      lote.dias_para_vencer,
    );
    const valorTotal = Math.round(precoVenda * quantidade * 100) / 100;

    // Soma a quantidade vendida. Se acabou o estoque, o lote vira "vendido".
    // O WHERE garante que não vamos vender mais do que existe.
    const sqlAtualiza = `UPDATE lotes
      SET quantidade_vendida = quantidade_vendida + ?,
          status = IF(quantidade_vendida + quantidade_descartada >= quantidade, 'vendido', status)
      WHERE id = ? AND status = 'ativo'
        AND quantidade - quantidade_vendida - quantidade_descartada >= ?`;

    conexao.query(sqlAtualiza, [quantidade, id, quantidade], (erro, atualizacao) => {
      if (erro) {
        return res.status(500).json({ erro: "Erro ao registrar a venda." });
      }
      if (atualizacao.affectedRows === 0) {
        return res
          .status(400)
          .json({ erro: "Estoque insuficiente. Atualize a página." });
      }

      const venda = {
        lote_id: Number(id),
        quantidade: quantidade,
        preco_unitario: precoVenda,
        desconto_percentual: desconto,
        valor_total: valorTotal,
      };

      conexao.query("INSERT INTO vendas SET ?", venda, (erro) => {
        if (erro) {
          return res.status(500).json({ erro: "Erro ao salvar a venda." });
        }
        res.status(201).json({
          mensagem: "Venda registrada com sucesso.",
          ...venda,
        });
      });
    });
  });
});

// DESCARTE: dá baixa em tudo que sobrou do lote (ex.: venceu ou estragou)
router.put("/lotes/:id/descartar", (req, res) => {
  const { id } = req.params;

  const sql = `UPDATE lotes
    SET quantidade_descartada = quantidade - quantidade_vendida,
        data_descarte = CURDATE(),
        status = 'descartado'
    WHERE id = ? AND status = 'ativo'`;

  conexao.query(sql, [id], (erro, resultado) => {
    if (erro) {
      return res.status(500).json({ erro: "Erro ao descartar o lote." });
    }
    if (resultado.affectedRows === 0) {
      return res.status(400).json({ erro: "Só é possível descartar lotes ativos." });
    }
    res.json({ mensagem: "Lote descartado." });
  });
});

// DESATIVAR: no banco não excluímos o registro (perderíamos o histórico).
// O lote apenas fica com status "inativo".
router.put("/lotes/:id/desativar", (req, res) => {
  const { id } = req.params;
  const sql = "UPDATE lotes SET status = 'inativo' WHERE id = ?";

  conexao.query(sql, [id], (erro, resultado) => {
    if (erro) {
      return res.status(500).json({ erro: "Erro ao desativar o lote." });
    }
    if (resultado.affectedRows === 0) {
      return res.status(404).json({ erro: "Lote não encontrado." });
    }
    res.json({ mensagem: "Lote desativado." });
  });
});

module.exports = router;
