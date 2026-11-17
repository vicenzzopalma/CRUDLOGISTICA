// =========================================================
// SERVIDOR DENTRO DO NAVEGADOR (versão online no GitHub Pages)
// =========================================================
// O GitHub Pages só hospeda arquivos (HTML, CSS, JS). Ele não roda Node.js
// nem MySQL. Para o site funcionar online, este arquivo faz o papel do
// servidor: ele responde as mesmas rotas do Express (/lotes, /dashboard...)
// usando um banco de dados SQLite que roda no próprio navegador (sql.js).
//
// - O banco começa com os dados de public/dados/banco-exemplo.sql
// - Tudo que você cadastra, vende ou descarta fica salvo neste navegador
// - Rodando com "npm run dev" (Node + MySQL), este arquivo NÃO faz nada
// =========================================================

(function () {
  const MODO_ONLINE = location.hostname.endsWith("github.io");

  if (!MODO_ONLINE) return;

  const CHAVE_BANCO = "gestao_lotes_banco_v1";
  const SQLJS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/";

  let db = null;
  const fetchOriginal = window.fetch.bind(window);

  // ---------- Regras de negócio (as mesmas de regras/precificacao.js) ----------

  function calcularSituacao(dias) {
    if (dias < 0) return "vencido";
    if (dias <= 3) return "critico";
    if (dias <= 7) return "atencao";
    return "normal";
  }

  function calcularDesconto(dias) {
    if (dias < 0) return 0;
    if (dias === 0) return 60;
    if (dias <= 3) return 40;
    if (dias <= 7) return 20;
    return 0;
  }

  function calcularPrecoPromocional(preco, dias) {
    const desconto = calcularDesconto(dias);
    return Math.round((preco - (preco * desconto) / 100) * 100) / 100;
  }

  function completarLote(lote) {
    const dias = Number(lote.dias_para_vencer);
    const preco = Number(lote.preco_unitario);
    return {
      ...lote,
      preco_unitario: preco,
      dias_para_vencer: dias,
      disponivel: lote.quantidade - lote.quantidade_vendida - lote.quantidade_descartada,
      situacao: calcularSituacao(dias),
      desconto_percentual: calcularDesconto(dias),
      preco_promocional: calcularPrecoPromocional(preco, dias),
    };
  }

  // ---------- Datas ----------

  function dataDeHoje() {
    const agora = new Date();
    agora.setMinutes(agora.getMinutes() - agora.getTimezoneOffset());
    return agora.toISOString().slice(0, 10);
  }

  function agoraTexto() {
    const agora = new Date();
    agora.setMinutes(agora.getMinutes() - agora.getTimezoneOffset());
    return agora.toISOString().slice(0, 19).replace("T", " ");
  }

  function somarDias(data, dias) {
    const d = new Date(data + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10);
  }

  function diferencaDias(inicio, fim) {
    return Math.round(
      (new Date(fim + "T12:00:00Z") - new Date(inicio + "T12:00:00Z")) / 86400000,
    );
  }

  // Trecho SQL: dias que faltam para vencer (o "?" recebe a data de hoje)
  const CAMPO_DIAS =
    "CAST(julianday(data_validade) - julianday(?) AS INTEGER) AS dias_para_vencer";

  // ---------- Banco de dados (sql.js) ----------

  function carregarScript(url) {
    return new Promise(function (resolve, reject) {
      const script = document.createElement("script");
      script.src = url;
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });
  }

  // SELECT: devolve uma lista de objetos
  function consultar(sql, valores) {
    const comando = db.prepare(sql);
    comando.bind(valores || []);
    const linhas = [];
    while (comando.step()) {
      linhas.push(comando.getAsObject());
    }
    comando.free();
    return linhas;
  }

  // INSERT / UPDATE / DELETE: devolve quantas linhas foram alteradas
  function executar(sql, valores) {
    db.run(sql, valores || []);
    return db.getRowsModified();
  }

  // Salva o banco inteiro no navegador (localStorage)
  function salvarBanco() {
    try {
      const bytes = db.export();
      let texto = "";
      for (let i = 0; i < bytes.length; i += 8192) {
        texto += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
      }
      localStorage.setItem(CHAVE_BANCO, btoa(texto));
    } catch (erro) {
      console.warn("Não foi possível salvar o banco no navegador:", erro);
    }
  }

  function lerBancoSalvo() {
    try {
      const texto = localStorage.getItem(CHAVE_BANCO);
      if (!texto) return null;
      const binario = atob(texto);
      const bytes = new Uint8Array(binario.length);
      for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
      return bytes;
    } catch (erro) {
      return null;
    }
  }

  // Cria o banco a partir do arquivo de exemplo e "traz as datas para hoje"
  async function criarBancoExemplo(SQL) {
    const resposta = await fetchOriginal("dados/banco-exemplo.sql");
    const script = await resposta.text();

    db = new SQL.Database();
    db.exec(script);

    const referencia = consultar("SELECT data_referencia FROM sobre_banco")[0].data_referencia;
    const deslocamento = diferencaDias(referencia, dataDeHoje());
    const mais = (deslocamento >= 0 ? "+" : "") + deslocamento + " days";

    executar(
      `UPDATE lotes SET
        data_fabricacao = date(data_fabricacao, ?),
        data_validade = date(data_validade, ?),
        data_entrada = date(data_entrada, ?),
        data_descarte = date(data_descarte, ?)`,
      [mais, mais, mais, mais],
    );
    executar("UPDATE vendas SET data_venda = datetime(data_venda, ?)", [mais]);
    executar("UPDATE sobre_banco SET data_referencia = ?", [dataDeHoje()]);

    salvarBanco();
  }

  async function iniciar() {
    await carregarScript(SQLJS_CDN + "sql-wasm.js");
    const SQL = await initSqlJs({ locateFile: (arquivo) => SQLJS_CDN + arquivo });

    const salvo = lerBancoSalvo();
    if (salvo) {
      try {
        db = new SQL.Database(salvo);
        consultar("SELECT COUNT(*) AS total FROM lotes");
        return;
      } catch (erro) {
        // Banco salvo com problema: recria a partir do exemplo
      }
    }
    await criarBancoExemplo(SQL);
  }

  const pronto = iniciar();

  // ---------- Rotas (as mesmas do Express) ----------

  function resposta(status, corpo) {
    return new Response(JSON.stringify(corpo), {
      status: status,
      headers: { "Content-Type": "application/json" },
    });
  }

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

  function montarLote(dados) {
    return [
      dados.codigo_lote.trim().toUpperCase(),
      dados.produto.trim(),
      dados.categoria,
      dados.estabelecimento.trim(),
      dados.fornecedor ? dados.fornecedor.trim() : null,
      Number(dados.quantidade),
      Number(dados.preco_unitario),
      dados.data_fabricacao || null,
      dados.data_validade,
      dados.data_entrada,
    ];
  }

  function buscarLote(id) {
    const linhas = consultar(`SELECT *, ${CAMPO_DIAS} FROM lotes WHERE id = ?`, [
      dataDeHoje(),
      id,
    ]);
    return linhas.length ? completarLote(linhas[0]) : null;
  }

  function erroCodigoDuplicado(erro, codigo) {
    if (String(erro.message).includes("UNIQUE")) {
      return resposta(400, { erro: "Já existe um lote com o código " + codigo });
    }
    throw erro;
  }

  // GET /lotes
  function listarLotes(params) {
    const status = params.get("status") || "ativo";
    const busca = params.get("busca") || "";

    let sql = `SELECT *, ${CAMPO_DIAS} FROM lotes WHERE 1 = 1`;
    const valores = [dataDeHoje()];

    if (status !== "todos") {
      sql += " AND status = ?";
      valores.push(status);
    }
    if (busca) {
      sql += " AND (produto LIKE ? OR codigo_lote LIKE ? OR estabelecimento LIKE ?)";
      valores.push("%" + busca + "%", "%" + busca + "%", "%" + busca + "%");
    }
    sql += " ORDER BY data_validade ASC, id ASC";

    return resposta(200, consultar(sql, valores).map(completarLote));
  }

  // POST /lotes
  function cadastrarLote(dados) {
    const mensagemErro = validarLote(dados);
    if (mensagemErro) return resposta(400, { erro: mensagemErro });

    const valores = montarLote(dados);
    try {
      executar(
        `INSERT INTO lotes (codigo_lote, produto, categoria, estabelecimento, fornecedor,
          quantidade, preco_unitario, data_fabricacao, data_validade, data_entrada)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        valores,
      );
    } catch (erro) {
      return erroCodigoDuplicado(erro, valores[0]);
    }
    const id = consultar("SELECT last_insert_rowid() AS id")[0].id;
    salvarBanco();
    return resposta(201, { id: id });
  }

  // PUT /lotes/:id
  function atualizarLote(id, dados) {
    const mensagemErro = validarLote(dados);
    if (mensagemErro) return resposta(400, { erro: mensagemErro });

    const atual = buscarLote(id);
    if (!atual) return resposta(404, { erro: "Lote não encontrado." });

    const valores = montarLote(dados);
    const jaSaiu = atual.quantidade_vendida + atual.quantidade_descartada;
    if (valores[5] < jaSaiu) {
      return resposta(400, {
        erro: `A quantidade não pode ser menor que ${jaSaiu} (já vendido/descartado).`,
      });
    }

    try {
      executar(
        `UPDATE lotes SET codigo_lote = ?, produto = ?, categoria = ?, estabelecimento = ?,
          fornecedor = ?, quantidade = ?, preco_unitario = ?, data_fabricacao = ?,
          data_validade = ?, data_entrada = ?
         WHERE id = ?`,
        [...valores, id],
      );
    } catch (erro) {
      return erroCodigoDuplicado(erro, valores[0]);
    }
    salvarBanco();
    return resposta(200, { mensagem: "Lote atualizado com sucesso." });
  }

  // POST /lotes/:id/vendas
  function registrarVenda(id, dados) {
    const quantidade = Number(dados.quantidade);
    if (!Number.isInteger(quantidade) || quantidade <= 0) {
      return resposta(400, { erro: "Informe uma quantidade válida." });
    }

    const lote = buscarLote(id);
    if (!lote) return resposta(404, { erro: "Lote não encontrado." });
    if (lote.status !== "ativo") {
      return resposta(400, { erro: "Só é possível vender lotes ativos." });
    }
    if (lote.dias_para_vencer < 0) {
      return resposta(400, { erro: "Lote vencido não pode ser vendido. Faça o descarte." });
    }
    if (quantidade > lote.disponivel) {
      return resposta(400, { erro: `Só existem ${lote.disponivel} unidades disponíveis.` });
    }

    const desconto = calcularDesconto(lote.dias_para_vencer);
    const precoVenda = calcularPrecoPromocional(lote.preco_unitario, lote.dias_para_vencer);
    const valorTotal = Math.round(precoVenda * quantidade * 100) / 100;

    // No SQLite, todas as expressões do SET usam os valores ANTIGOS da linha
    executar(
      `UPDATE lotes
       SET quantidade_vendida = quantidade_vendida + ?,
           status = CASE WHEN quantidade_vendida + ? + quantidade_descartada >= quantidade
                         THEN 'vendido' ELSE status END
       WHERE id = ?`,
      [quantidade, quantidade, id],
    );
    executar(
      `INSERT INTO vendas (lote_id, quantidade, preco_unitario, desconto_percentual, valor_total, data_venda)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, quantidade, precoVenda, desconto, valorTotal, agoraTexto()],
    );
    salvarBanco();

    return resposta(201, {
      mensagem: "Venda registrada com sucesso.",
      lote_id: id,
      quantidade: quantidade,
      preco_unitario: precoVenda,
      desconto_percentual: desconto,
      valor_total: valorTotal,
    });
  }

  // PUT /lotes/:id/descartar
  function descartarLote(id) {
    const alteradas = executar(
      `UPDATE lotes
       SET quantidade_descartada = quantidade - quantidade_vendida,
           data_descarte = ?,
           status = 'descartado'
       WHERE id = ? AND status = 'ativo'`,
      [dataDeHoje(), id],
    );
    if (alteradas === 0) {
      return resposta(400, { erro: "Só é possível descartar lotes ativos." });
    }
    salvarBanco();
    return resposta(200, { mensagem: "Lote descartado." });
  }

  // PUT /lotes/:id/desativar
  function desativarLote(id) {
    const alteradas = executar("UPDATE lotes SET status = 'inativo' WHERE id = ?", [id]);
    if (alteradas === 0) return resposta(404, { erro: "Lote não encontrado." });
    salvarBanco();
    return resposta(200, { mensagem: "Lote desativado." });
  }

  // GET /dashboard/estabelecimentos
  function listarEstabelecimentos() {
    const linhas = consultar(
      "SELECT DISTINCT estabelecimento FROM lotes WHERE status <> 'inativo' ORDER BY estabelecimento",
    );
    return resposta(
      200,
      linhas.map((linha) => linha.estabelecimento),
    );
  }

  // GET /dashboard/resumo
  function montarResumo(params) {
    const dias = [7, 30, 90].includes(Number(params.get("dias"))) ? Number(params.get("dias")) : 30;
    const estabelecimento = params.get("estabelecimento") || "";
    const hoje = dataDeHoje();
    const inicio = somarDias(hoje, -(dias - 1));

    const filtro = estabelecimento ? " AND l.estabelecimento = ?" : "";
    const valorFiltro = estabelecimento ? [estabelecimento] : [];

    const ativos = consultar(
      `SELECT l.*, CAST(julianday(l.data_validade) - julianday(?) AS INTEGER) AS dias_para_vencer
       FROM lotes l WHERE l.status = 'ativo'${filtro}
       ORDER BY l.data_validade ASC`,
      [hoje, ...valorFiltro],
    ).map(completarLote);

    const vendasDia = consultar(
      `SELECT date(v.data_venda) AS dia, SUM(v.valor_total) AS valor,
              SUM(v.quantidade) AS unidades,
              SUM(v.quantidade * l.preco_unitario) AS valor_sem_desconto
       FROM vendas v JOIN lotes l ON l.id = v.lote_id
       WHERE v.data_venda >= ?${filtro}
       GROUP BY date(v.data_venda)`,
      [inicio, ...valorFiltro],
    );

    const vendasEstab = consultar(
      `SELECT l.estabelecimento, SUM(v.quantidade) AS vendidas
       FROM vendas v JOIN lotes l ON l.id = v.lote_id
       WHERE v.data_venda >= ?${filtro}
       GROUP BY l.estabelecimento`,
      [inicio, ...valorFiltro],
    );

    const descartesEstab = consultar(
      `SELECT l.estabelecimento, SUM(l.quantidade_descartada) AS descartadas,
              SUM(l.quantidade_descartada * l.preco_unitario) AS valor
       FROM lotes l
       WHERE l.data_descarte >= ?${filtro}
       GROUP BY l.estabelecimento`,
      [inicio, ...valorFiltro],
    );

    const arredondar = (valor) => Math.round(Number(valor || 0) * 100) / 100;

    const receitaDiaria = [];
    for (let i = 0; i < dias; i++) {
      const dia = somarDias(inicio, i);
      const linha = vendasDia.find((item) => item.dia === dia);
      receitaDiaria.push({
        dia: dia,
        valor: linha ? arredondar(linha.valor) : 0,
        unidades: linha ? Number(linha.unidades) : 0,
      });
    }

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

    const nomes = new Set();
    vendasEstab.forEach((l) => nomes.add(l.estabelecimento));
    descartesEstab.forEach((l) => nomes.add(l.estabelecimento));
    const porEstabelecimento = Array.from(nomes)
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

    const alertas = ativos
      .filter((lote) => lote.situacao !== "normal" && lote.disponivel > 0)
      .slice(0, 12);

    return resposta(200, {
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
  }

  // Decide qual rota atende cada endereço
  function rotear(caminho, metodo, params, dados) {
    let partes;

    if (caminho === "/lotes" && metodo === "GET") return listarLotes(params);
    if (caminho === "/lotes" && metodo === "POST") return cadastrarLote(dados);

    if ((partes = caminho.match(/^\/lotes\/(\d+)$/))) {
      const id = Number(partes[1]);
      if (metodo === "GET") {
        const lote = buscarLote(id);
        return lote ? resposta(200, lote) : resposta(404, { erro: "Lote não encontrado." });
      }
      if (metodo === "PUT") return atualizarLote(id, dados);
    }

    if ((partes = caminho.match(/^\/lotes\/(\d+)\/vendas$/)) && metodo === "POST") {
      return registrarVenda(Number(partes[1]), dados);
    }
    if ((partes = caminho.match(/^\/lotes\/(\d+)\/descartar$/)) && metodo === "PUT") {
      return descartarLote(Number(partes[1]));
    }
    if ((partes = caminho.match(/^\/lotes\/(\d+)\/desativar$/)) && metodo === "PUT") {
      return desativarLote(Number(partes[1]));
    }

    if (caminho === "/dashboard/estabelecimentos") return listarEstabelecimentos();
    if (caminho === "/dashboard/resumo") return montarResumo(params);

    return resposta(404, { erro: "Rota não encontrada." });
  }

  // Intercepta o fetch: as rotas da API são respondidas aqui mesmo
  window.fetch = async function (endereco, opcoes) {
    const texto = typeof endereco === "string" ? endereco : "";

    if (!texto.startsWith("/lotes") && !texto.startsWith("/dashboard")) {
      return fetchOriginal(endereco, opcoes);
    }

    try {
      await pronto;
    } catch (erro) {
      return resposta(500, { erro: "Não foi possível carregar o banco de dados." });
    }

    const url = new URL(texto, "http://local");
    const metodo = ((opcoes && opcoes.method) || "GET").toUpperCase();
    const dados = opcoes && opcoes.body ? JSON.parse(opcoes.body) : {};

    try {
      return rotear(url.pathname, metodo, url.searchParams, dados);
    } catch (erro) {
      console.error(erro);
      return resposta(500, { erro: "Erro no banco de dados." });
    }
  };

  // ---------- Aviso no topo da página ----------

  function mostrarAviso() {
    const container = document.querySelector(".container");
    if (!container) return;

    const aviso = document.createElement("div");
    aviso.className = "aviso-online";

    const texto = document.createElement("p");
    texto.textContent =
      "Versão online: o banco de dados (SQLite) roda dentro do site e o que você " +
      "cadastrar, vender ou descartar fica salvo neste navegador.";

    const botao = document.createElement("button");
    botao.type = "button";
    botao.textContent = "Restaurar dados de exemplo";
    botao.addEventListener("click", function () {
      if (!confirm("Apagar suas alterações e voltar aos dados de exemplo?")) return;
      try {
        localStorage.removeItem(CHAVE_BANCO);
      } catch (erro) {
        // sem localStorage: o banco já é recriado a cada visita
      }
      location.reload();
    });

    aviso.append(texto, botao);
    container.prepend(aviso);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mostrarAviso);
  } else {
    mostrarAviso();
  }
})();
