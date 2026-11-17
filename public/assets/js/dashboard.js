// =========================================================
// DASHBOARD: busca os números no servidor (rota /dashboard/resumo)
// e desenha os indicadores e gráficos com a biblioteca Chart.js
// =========================================================

const filtroEstabelecimento = document.getElementById("filtro-estabelecimento");
const botoesPeriodo = document.querySelectorAll("#periodos button");
const btnAtualizar = document.getElementById("btn-atualizar");
const textoAtualizacao = document.getElementById("texto-atualizacao");
const conteudo = document.getElementById("conteudo-dashboard");
const mensagemErro = document.getElementById("mensagem-erro");

let diasSelecionados = 30;

// Guardamos os gráficos para poder atualizar depois
let graficoReceita = null;
let graficoCategoria = null;
let graficoEstabelecimento = null;

// Lê uma cor definida no CSS (:root)
function corDoCss(nome) {
  return getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
}

const CORES = {
  serie1: corDoCss("--serie-1"),
  serie2: corDoCss("--serie-2"),
  grade: corDoCss("--grade"),
  eixo: corDoCss("--eixo"),
  normal: corDoCss("--cor-normal"),
  atencao: corDoCss("--cor-atencao"),
  critico: corDoCss("--cor-critico"),
  vencido: corDoCss("--cor-vencido"),
};

const SITUACOES = [
  { chave: "normal", nome: "No prazo (mais de 7 dias)", icone: "check_circle" },
  { chave: "atencao", nome: "Atenção (4 a 7 dias)", icone: "schedule" },
  { chave: "critico", nome: "Crítico (0 a 3 dias)", icone: "warning" },
  { chave: "vencido", nome: "Vencido (descartar)", icone: "block" },
];

const NOMES_SITUACAO = {
  normal: "No prazo",
  atencao: "Atenção",
  critico: "Crítico",
  vencido: "Vencido",
};

// Configuração visual padrão de todos os gráficos
Chart.defaults.font.family = "Arial, Helvetica, sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.color = CORES.eixo;

// ---------- Funções de apoio ----------

function criarElemento(tag, classe, texto) {
  const elemento = document.createElement(tag);
  elemento.className = classe;
  elemento.textContent = texto;
  return elemento;
}

function formatarDinheiro(valor) {
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

// Versão curta para os eixos: 1500 -> R$ 1,5 mil
function formatarDinheiroCurto(valor) {
  if (valor >= 1000) {
    return "R$ " + (valor / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil";
  }
  return "R$ " + valor.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function formatarNumero(valor) {
  return Number(valor).toLocaleString("pt-BR");
}

function formatarData(data) {
  const partes = data.split("-");
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

// "2026-11-17" -> "17/11"
function formatarDiaMes(data) {
  const partes = data.split("-");
  return `${partes[2]}/${partes[1]}`;
}

function textoDias(dias) {
  if (dias < 0) return "venceu há " + Math.abs(dias) + (dias === -1 ? " dia" : " dias");
  if (dias === 0) return "vence hoje";
  if (dias === 1) return "vence amanhã";
  return "em " + dias + " dias";
}

// Eixos com grade bem clarinha (o destaque fica nos dados)
function eixoValores(formatar) {
  return {
    beginAtZero: true,
    grid: { color: CORES.grade },
    border: { display: false },
    ticks: { callback: formatar, maxTicksLimit: 6 },
  };
}

function eixoCategorias() {
  return {
    grid: { display: false },
    border: { color: CORES.grade },
  };
}

// ---------- Busca os dados no servidor ----------

async function carregarDashboard() {
  conteudo.classList.add("carregando");

  const url =
    "/dashboard/resumo?dias=" +
    diasSelecionados +
    "&estabelecimento=" +
    encodeURIComponent(filtroEstabelecimento.value);

  try {
    const resposta = await fetch(url);
    const dados = await resposta.json();

    if (!resposta.ok) {
      throw new Error(dados.erro || "Erro no servidor.");
    }

    mensagemErro.hidden = true;
    conteudo.hidden = false;

    mostrarKpis(dados.kpis, dados.periodo_dias);
    mostrarGraficoReceita(dados.receita_diaria);
    mostrarSituacao(dados.situacao);
    mostrarGraficoCategoria(dados.risco_por_categoria);
    mostrarGraficoEstabelecimento(dados.por_estabelecimento);
    mostrarAlertas(dados.alertas);

    const agora = new Date();
    textoAtualizacao.textContent =
      "Atualizado às " + agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch (erro) {
    conteudo.hidden = true;
    mensagemErro.hidden = false;
    mensagemErro.textContent =
      "Não foi possível carregar o dashboard. Verifique se o servidor e o banco de dados estão funcionando.";
  } finally {
    conteudo.classList.remove("carregando");
  }
}

async function carregarEstabelecimentos() {
  try {
    const resposta = await fetch("/dashboard/estabelecimentos");
    const nomes = await resposta.json();

    nomes.forEach(function (nome) {
      const opcao = document.createElement("option");
      opcao.value = nome;
      opcao.textContent = nome;
      filtroEstabelecimento.append(opcao);
    });
  } catch (erro) {
    // Se falhar, o filtro fica só com "Todos"
  }
}

// ---------- KPIs ----------

function mostrarKpis(kpis, dias) {
  document.getElementById("kpi-receita").textContent = formatarDinheiro(kpis.receita_recuperada);
  document.getElementById("kpi-receita-detalhe").textContent =
    formatarNumero(kpis.unidades_vendidas) +
    " un. vendidas em " +
    dias +
    " dias · " +
    formatarDinheiro(kpis.economia_consumidor) +
    " de economia para o consumidor";

  // Taxa de liquidação = vendido / (vendido + descartado)
  const taxa = kpis.taxa_liquidacao;
  document.getElementById("kpi-taxa").textContent =
    taxa === null ? "-" : taxa.toLocaleString("pt-BR") + "%";
  document.getElementById("kpi-taxa-barra").style.width = (taxa || 0) + "%";
  document.getElementById("kpi-taxa-detalhe").textContent =
    taxa === null
      ? "Sem vendas ou descartes no período"
      : taxa >= 80
        ? "Acima da meta de 80% do BSC"
        : "Abaixo da meta de 80% do BSC";

  document.getElementById("kpi-risco").textContent = formatarDinheiro(kpis.valor_em_risco);
  document.getElementById("kpi-risco-detalhe").textContent =
    formatarNumero(kpis.unidades_em_risco) +
    " un. de " +
    formatarNumero(kpis.unidades_estoque) +
    " em estoque (" +
    kpis.lotes_ativos +
    " lotes ativos)";

  document.getElementById("kpi-descarte").textContent =
    formatarNumero(kpis.unidades_descartadas) + " un.";
  let detalheDescarte = formatarDinheiro(kpis.valor_descartado) + " perdidos no período";
  if (kpis.lotes_vencidos > 0) {
    detalheDescarte +=
      " · " +
      kpis.lotes_vencidos +
      (kpis.lotes_vencidos === 1 ? " lote vencido aguardando" : " lotes vencidos aguardando") +
      " descarte";
  }
  document.getElementById("kpi-descarte-detalhe").textContent = detalheDescarte;
}

// ---------- Gráfico de linha: receita por dia ----------

function mostrarGraficoReceita(receitaDiaria) {
  const rotulos = receitaDiaria.map((item) => formatarDiaMes(item.dia));
  const valores = receitaDiaria.map((item) => item.valor);

  if (graficoReceita) {
    graficoReceita.data.labels = rotulos;
    graficoReceita.data.datasets[0].data = valores;
    graficoReceita.update();
  } else {
    graficoReceita = new Chart(document.getElementById("grafico-receita"), {
      type: "line",
      data: {
        labels: rotulos,
        datasets: [
          {
            label: "Receita recuperada",
            data: valores,
            borderColor: CORES.serie1,
            backgroundColor: CORES.serie1 + "1f",
            borderWidth: 2,
            fill: true,
            tension: 0.25,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHoverBackgroundColor: CORES.serie1,
            pointHoverBorderColor: "#ffffff",
            pointHoverBorderWidth: 2,
          },
        ],
      },
      options: {
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (contexto) => " " + formatarDinheiro(contexto.parsed.y),
            },
          },
        },
        scales: {
          x: { ...eixoCategorias(), ticks: { maxTicksLimit: 10, maxRotation: 0 } },
          y: eixoValores(formatarDinheiroCurto),
        },
      },
    });
  }

  // Tabela com os mesmos dados (acessibilidade)
  const tabela = document.createElement("table");
  tabela.className = "tabela";
  tabela.innerHTML =
    "<thead><tr><th>Dia</th><th class='numero'>Unidades</th><th class='numero'>Receita</th></tr></thead>";
  const corpo = document.createElement("tbody");
  receitaDiaria
    .filter((item) => item.unidades > 0)
    .reverse()
    .forEach(function (item) {
      const linha = document.createElement("tr");
      linha.append(
        criarElemento("td", "", formatarData(item.dia)),
        criarElemento("td", "numero", formatarNumero(item.unidades)),
        criarElemento("td", "numero", formatarDinheiro(item.valor)),
      );
      corpo.append(linha);
    });
  tabela.append(corpo);

  const caixa = document.getElementById("tabela-receita");
  caixa.className = "tabela-rolagem tabela-mini";
  caixa.replaceChildren(tabela);
}

// ---------- Barras em HTML: situação da validade ----------

function mostrarSituacao(situacao) {
  const caixa = document.getElementById("situacao-estoque");
  caixa.replaceChildren();

  let totalUnidades = 0;
  let totalLotes = 0;
  SITUACOES.forEach(function (item) {
    totalUnidades += situacao[item.chave].unidades;
    totalLotes += situacao[item.chave].lotes;
  });

  SITUACOES.forEach(function (item) {
    const dados = situacao[item.chave];
    const percentual = totalUnidades > 0 ? (dados.unidades / totalUnidades) * 100 : 0;

    const linha = criarElemento("div", "situacao-linha", "");

    const info = criarElemento("div", "situacao-info", "");
    const nome = criarElemento("span", "situacao-nome", "");
    nome.append(
      criarElemento("span", "material-symbols-outlined icone-" + item.chave, item.icone),
      document.createTextNode(item.nome),
    );
    const numeros = criarElemento(
      "span",
      "situacao-numeros",
      formatarNumero(dados.unidades) +
        " un. · " +
        dados.lotes +
        (dados.lotes === 1 ? " lote" : " lotes"),
    );
    info.append(nome, numeros);

    const barra = criarElemento("div", "situacao-barra", "");
    const preenchimento = document.createElement("div");
    preenchimento.style.width = percentual + "%";
    preenchimento.style.background = CORES[item.chave];
    barra.append(preenchimento);

    linha.append(info, barra);
    caixa.append(linha);
  });

  document.getElementById("situacao-total").textContent =
    "Total: " + formatarNumero(totalUnidades) + " unidades em " + totalLotes + " lotes ativos.";
}

// ---------- Barras horizontais: valor em risco por categoria ----------

function mostrarGraficoCategoria(riscoPorCategoria) {
  const vazio = riscoPorCategoria.length === 0;
  document.getElementById("vazio-categoria").hidden = !vazio;
  document.getElementById("area-categoria").hidden = vazio;

  const rotulos = riscoPorCategoria.map((item) => item.categoria);
  const valores = riscoPorCategoria.map((item) => item.valor);
  const unidades = riscoPorCategoria.map((item) => item.unidades);

  if (graficoCategoria) {
    graficoCategoria.data.labels = rotulos;
    graficoCategoria.data.datasets[0].data = valores;
    graficoCategoria.unidades = unidades;
    graficoCategoria.update();
    return;
  }

  graficoCategoria = new Chart(document.getElementById("grafico-categoria"), {
    type: "bar",
    data: {
      labels: rotulos,
      datasets: [
        {
          label: "Valor em risco",
          data: valores,
          backgroundColor: CORES.serie1,
          borderRadius: 4,
          borderSkipped: "start",
          maxBarThickness: 22,
        },
      ],
    },
    options: {
      indexAxis: "y",
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (contexto) =>
              " " +
              formatarDinheiro(contexto.parsed.x) +
              " (" +
              formatarNumero(graficoCategoria.unidades[contexto.dataIndex]) +
              " un.)",
          },
        },
      },
      scales: {
        x: eixoValores(formatarDinheiroCurto),
        y: { ...eixoCategorias(), ticks: { color: "#52514e" } },
      },
    },
  });
  graficoCategoria.unidades = unidades;
}

// ---------- Barras agrupadas: vendido x descartado ----------

function mostrarGraficoEstabelecimento(porEstabelecimento) {
  const vazio = porEstabelecimento.length === 0;
  document.getElementById("vazio-estabelecimento").hidden = !vazio;
  document.getElementById("area-estabelecimento").hidden = vazio;

  const rotulos = porEstabelecimento.map((item) => item.estabelecimento);
  const vendidas = porEstabelecimento.map((item) => item.vendidas);
  const descartadas = porEstabelecimento.map((item) => item.descartadas);

  if (graficoEstabelecimento) {
    graficoEstabelecimento.data.labels = rotulos;
    graficoEstabelecimento.data.datasets[0].data = vendidas;
    graficoEstabelecimento.data.datasets[1].data = descartadas;
    graficoEstabelecimento.update();
    return;
  }

  graficoEstabelecimento = new Chart(document.getElementById("grafico-estabelecimento"), {
    type: "bar",
    data: {
      labels: rotulos,
      datasets: [
        {
          label: "Vendido",
          data: vendidas,
          backgroundColor: CORES.serie1,
          borderRadius: 4,
          borderSkipped: "start",
          maxBarThickness: 16,
        },
        {
          label: "Descartado",
          data: descartadas,
          backgroundColor: CORES.serie2,
          borderRadius: 4,
          borderSkipped: "start",
          maxBarThickness: 16,
        },
      ],
    },
    options: {
      indexAxis: "y",
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          position: "top",
          align: "start",
          labels: { boxWidth: 10, boxHeight: 10, useBorderRadius: true, borderRadius: 2, color: "#52514e" },
        },
        tooltip: {
          callbacks: {
            label: (contexto) =>
              " " + contexto.dataset.label + ": " + formatarNumero(contexto.parsed.x) + " un.",
          },
        },
      },
      scales: {
        x: eixoValores((valor) => formatarNumero(valor)),
        y: { ...eixoCategorias(), ticks: { color: "#52514e" } },
      },
    },
  });
}

// ---------- Tabela de alertas ----------

function mostrarAlertas(alertas) {
  const corpo = document.getElementById("tabela-alertas");
  corpo.replaceChildren();
  document.getElementById("vazio-alertas").hidden = alertas.length > 0;

  alertas.forEach(function (lote) {
    const linha = document.createElement("tr");

    const celulaCodigo = document.createElement("td");
    celulaCodigo.append(criarElemento("span", "lote-codigo", lote.codigo_lote));

    const celulaSituacao = document.createElement("td");
    celulaSituacao.append(
      criarElemento("span", "etiqueta " + lote.situacao, NOMES_SITUACAO[lote.situacao]),
      criarElemento("span", "kpi-detalhe", " " + textoDias(lote.dias_para_vencer)),
    );

    const celulaPreco = document.createElement("td");
    celulaPreco.className = "numero";
    if (lote.situacao === "vencido") {
      celulaPreco.textContent = "não vender";
    } else {
      celulaPreco.textContent = formatarDinheiro(lote.preco_promocional);
      if (lote.desconto_percentual > 0) {
        celulaPreco.append(criarElemento("span", "desconto", "-" + lote.desconto_percentual + "%"));
      }
    }

    linha.append(
      celulaCodigo,
      criarElemento("td", "", lote.produto),
      criarElemento("td", "", lote.estabelecimento),
      criarElemento("td", "", formatarData(lote.data_validade)),
      celulaSituacao,
      criarElemento("td", "numero", formatarNumero(lote.disponivel) + " un."),
      celulaPreco,
    );
    corpo.append(linha);
  });
}

// ---------- Eventos dos filtros ----------

filtroEstabelecimento.addEventListener("change", carregarDashboard);

botoesPeriodo.forEach(function (botao) {
  botao.addEventListener("click", function () {
    botoesPeriodo.forEach((b) => b.classList.remove("ativo"));
    botao.classList.add("ativo");
    diasSelecionados = Number(botao.dataset.dias);
    carregarDashboard();
  });
});

btnAtualizar.addEventListener("click", carregarDashboard);

// Atualiza sozinho a cada 1 minuto (monitoramento em tempo real)
setInterval(carregarDashboard, 60000);

// Inicializa a página
carregarEstabelecimentos();
carregarDashboard();
