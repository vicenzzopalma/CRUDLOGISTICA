const { Router } = require("express");
const router = Router();
const conexao = require("../infraestrutura/conexao");
const { completarLote } = require("../regras/precificacao");

// O dashboard precisa de VÁRIAS consultas ao banco.
// Para não ficar com um callback dentro do outro, usamos a versão
// "promise" da conexão, que permite escrever com async/await:
//   const [linhas] = await banco.query(sql, valores);
const banco = conexao.promise();

// Gera a lista de dias do período: ["2026-11-01", "2026-11-02", ...]
function listarDias(hoje, quantidade) {
  const dias = [];
  const data = new Date(hoje + "T12:00:00Z");
  data.setUTCDate(data.getUTCDate() - (quantidade - 1));

  for (let i = 0; i < quantidade; i++) {
    dias.push(data.toISOString().slice(0, 10));
    data.setUTCDate(data.getUTCDate() + 1);
  }
  return dias;
}

function arredondar(valor) {
  return Math.round(Number(valor || 0) * 100) / 100;
}

// Lista de estabelecimentos para o filtro
router.get("/dashboard/estabelecimentos", async (req, res) => {
  try {
    const [linhas] = await banco.query(
      "SELECT DISTINCT estabelecimento FROM lotes WHERE status <> 'inativo' ORDER BY estabelecimento",
    );
    res.json(linhas.map((linha) => linha.estabelecimento));
  } catch (erro) {
    console.error(erro.message);
    res.status(500).json({ erro: "Erro ao buscar estabelecimentos." });
  }
});

// Todos os números do dashboard em uma única resposta
// Exemplo: /dashboard/resumo?dias=30&estabelecimento=Supermercado Centro
router.get("/dashboard/resumo", async (req, res) => {
  const periodosPermitidos = [7, 30, 90];
  const dias = periodosPermitidos.includes(Number(req.query.dias))
    ? Number(req.query.dias)
    : 30;
  const estabelecimento = req.query.estabelecimento || "";

  // Filtro opcional por estabelecimento (usado em todas as consultas)
  const filtroLote = estabelecimento ? " AND l.estabelecimento = ?" : "";
  const valorFiltro = estabelecimento ? [estabelecimento] : [];

  try {
    const [[{ hoje }]] = await banco.query("SELECT CURDATE() AS hoje");

    // 1) Lotes ativos (estoque atual)
    const [ativosBanco] = await banco.query(
      `SELECT l.*, DATEDIFF(l.data_validade, CURDATE()) AS dias_para_vencer
       FROM lotes l WHERE l.status = 'ativo'${filtroLote}
       ORDER BY l.data_validade ASC`,
      valorFiltro,
    );
    const ativos = ativosBanco.map(completarLote);

    // 2) Vendas por dia no período
    const [vendasDia] = await banco.query(
      `SELECT DATE(v.data_venda) AS dia,
              SUM(v.valor_total) AS valor,
              SUM(v.quantidade) AS unidades,
              SUM(v.quantidade * l.preco_unitario) AS valor_sem_desconto
       FROM vendas v JOIN lotes l ON l.id = v.lote_id
       WHERE v.data_venda >= CURDATE() - INTERVAL ? DAY${filtroLote}
       GROUP BY DATE(v.data_venda)`,
      [dias - 1, ...valorFiltro],
    );

    // 3) Unidades vendidas por estabelecimento no período
    const [vendasEstab] = await banco.query(
      `SELECT l.estabelecimento, SUM(v.quantidade) AS vendidas
       FROM vendas v JOIN lotes l ON l.id = v.lote_id
       WHERE v.data_venda >= CURDATE() - INTERVAL ? DAY${filtroLote}
       GROUP BY l.estabelecimento`,
      [dias - 1, ...valorFiltro],
    );

    // 4) Unidades descartadas por estabelecimento no período
    const [descartesEstab] = await banco.query(
      `SELECT l.estabelecimento,
              SUM(l.quantidade_descartada) AS descartadas,
              SUM(l.quantidade_descartada * l.preco_unitario) AS valor
       FROM lotes l
       WHERE l.data_descarte >= CURDATE() - INTERVAL ? DAY${filtroLote}
       GROUP BY l.estabelecimento`,
      [dias - 1, ...valorFiltro],
    );

    // ---------- Montando os indicadores ----------

    // Receita por dia (dias sem venda aparecem com zero)
    const receitaDiaria = listarDias(hoje, dias).map((dia) => {
      const linha = vendasDia.find((item) => item.dia === dia);
      return {
        dia: dia,
        valor: linha ? arredondar(linha.valor) : 0,
        unidades: linha ? Number(linha.unidades) : 0,
      };
    });

    let receita = 0;
    let unidadesVendidas = 0;
    let valorSemDesconto = 0;
    vendasDia.forEach((linha) => {
      receita += Number(linha.valor);
      unidadesVendidas += Number(linha.unidades);
      valorSemDesconto += Number(linha.valor_sem_desconto);
    });

    let unidadesDescartadas = 0;
    let valorDescartado = 0;
    descartesEstab.forEach((linha) => {
      unidadesDescartadas += Number(linha.descartadas);
      valorDescartado += Number(linha.valor);
    });

    const totalSaida = unidadesVendidas + unidadesDescartadas;
    const taxaLiquidacao =
      totalSaida > 0 ? Math.round((unidadesVendidas / totalSaida) * 1000) / 10 : null;

    // Estoque atual, valor em risco e situação de validade
    const situacao = {
      vencido: { lotes: 0, unidades: 0 },
      critico: { lotes: 0, unidades: 0 },
      atencao: { lotes: 0, unidades: 0 },
      normal: { lotes: 0, unidades: 0 },
    };
    const riscoCategoria = {};
    let unidadesEstoque = 0;
    let valorEstoque = 0;
    let unidadesRisco = 0;
    let valorRisco = 0;

    ativos.forEach((lote) => {
      unidadesEstoque += lote.disponivel;
      valorEstoque += lote.disponivel * lote.preco_unitario;

      situacao[lote.situacao].lotes++;
      situacao[lote.situacao].unidades += lote.disponivel;

      // "Em risco" = vence em até 7 dias (ainda dá para vender)
      if (lote.situacao === "critico" || lote.situacao === "atencao") {
        unidadesRisco += lote.disponivel;
        valorRisco += lote.disponivel * lote.preco_unitario;

        if (!riscoCategoria[lote.categoria]) {
          riscoCategoria[lote.categoria] = { unidades: 0, valor: 0 };
        }
        riscoCategoria[lote.categoria].unidades += lote.disponivel;
        riscoCategoria[lote.categoria].valor += lote.disponivel * lote.preco_unitario;
      }
    });

    // Vendido x descartado por estabelecimento
    const nomesEstab = new Set();
    vendasEstab.forEach((l) => nomesEstab.add(l.estabelecimento));
    descartesEstab.forEach((l) => nomesEstab.add(l.estabelecimento));

    const porEstabelecimento = Array.from(nomesEstab)
      .sort()
      .map((nome) => {
        const venda = vendasEstab.find((l) => l.estabelecimento === nome);
        const descarte = descartesEstab.find((l) => l.estabelecimento === nome);
        return {
          estabelecimento: nome,
          vendidas: venda ? Number(venda.vendidas) : 0,
          descartadas: descarte ? Number(descarte.descartadas) : 0,
        };
      });

    // Alertas: lotes que vencem em até 7 dias ou já venceram
    const alertas = ativos
      .filter((lote) => lote.situacao !== "normal" && lote.disponivel > 0)
      .slice(0, 12)
      .map((lote) => ({
        id: lote.id,
        codigo_lote: lote.codigo_lote,
        produto: lote.produto,
        estabelecimento: lote.estabelecimento,
        data_validade: lote.data_validade,
        dias_para_vencer: lote.dias_para_vencer,
        situacao: lote.situacao,
        disponivel: lote.disponivel,
        desconto_percentual: lote.desconto_percentual,
        preco_promocional: lote.preco_promocional,
      }));

    res.json({
      hoje: hoje,
      periodo_dias: dias,
      estabelecimento: estabelecimento || null,
      kpis: {
        lotes_ativos: ativos.length,
        unidades_estoque: unidadesEstoque,
        valor_estoque: arredondar(valorEstoque),
        unidades_em_risco: unidadesRisco,
        valor_em_risco: arredondar(valorRisco),
        lotes_vencidos: situacao.vencido.lotes,
        receita_recuperada: arredondar(receita),
        economia_consumidor: arredondar(valorSemDesconto - receita),
        unidades_vendidas: unidadesVendidas,
        unidades_descartadas: unidadesDescartadas,
        valor_descartado: arredondar(valorDescartado),
        taxa_liquidacao: taxaLiquidacao,
      },
      situacao: situacao,
      receita_diaria: receitaDiaria,
      risco_por_categoria: Object.keys(riscoCategoria)
        .map((categoria) => ({
          categoria: categoria,
          unidades: riscoCategoria[categoria].unidades,
          valor: arredondar(riscoCategoria[categoria].valor),
        }))
        .sort((a, b) => b.valor - a.valor),
      por_estabelecimento: porEstabelecimento,
      alertas: alertas,
    });
  } catch (erro) {
    console.error(erro.message);
    res.status(500).json({ erro: "Erro ao montar o dashboard." });
  }
});

module.exports = router;
