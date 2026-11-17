const formulario = document.getElementById("form-lote");
const listaLotes = document.getElementById("lista-lotes");
const mensagemVazia = document.getElementById("mensagem-vazia");
const contador = document.getElementById("contador");
const tituloFormulario = document.getElementById("titulo-formulario");
const btnSalvar = document.getElementById("btn-salvar");
const btnCancelar = document.getElementById("btn-cancelar");
const alertaVencimento = document.getElementById("alerta-vencimento");
const filtroStatus = document.getElementById("filtro-status");
const filtroBusca = document.getElementById("filtro-busca");
const listaEstabelecimentos = document.getElementById("lista-estabelecimentos");

// Agora os lotes NÃO ficam mais no localStorage:
// eles vêm do banco de dados, através das rotas do servidor (Node + Express).
let lotes = [];

// Guarda o ID do lote que está sendo editado
let idEmEdicao = null;

// Textos de cada situação de validade
const NOMES_SITUACAO = {
  normal: "No prazo",
  atencao: "Atenção",
  critico: "Crítico",
  vencido: "Vencido",
};

// ---------- Funções de apoio ----------

// Cria elementos HTML usando texto seguro
function criarElemento(tag, classe, texto) {
  const elemento = document.createElement(tag);
  elemento.className = classe;
  elemento.textContent = texto;
  return elemento;
}

// Formata a data para o padrão brasileiro
function formatarData(data) {
  if (!data) return "-";
  const partes = data.split("-");
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

// Formata um número como dinheiro: 5.5 -> R$ 5,50
function formatarDinheiro(valor) {
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

// Data de hoje no formato do input date (AAAA-MM-DD)
function dataDeHoje() {
  const hoje = new Date();
  hoje.setMinutes(hoje.getMinutes() - hoje.getTimezoneOffset());
  return hoje.toISOString().slice(0, 10);
}

// Texto amigável dos dias para vencer
function textoDias(dias) {
  if (dias < 0) return "Venceu há " + Math.abs(dias) + (dias === -1 ? " dia" : " dias");
  if (dias === 0) return "Vence hoje";
  if (dias === 1) return "Vence amanhã";
  return "Vence em " + dias + " dias";
}

// Faz a requisição para o servidor e devolve a resposta em JSON.
// Se o servidor responder com erro, mostra a mensagem.
async function chamarServidor(url, metodo, dados) {
  const opcoes = {
    method: metodo || "GET",
    headers: { "Content-Type": "application/json" },
  };

  if (dados) {
    opcoes.body = JSON.stringify(dados);
  }

  const resposta = await fetch(url, opcoes);
  const json = await resposta.json();

  if (!resposta.ok) {
    throw new Error(json.erro || "Erro no servidor.");
  }
  return json;
}

// ---------- READ: buscar e listar os lotes ----------

async function carregarLotes() {
  const status = filtroStatus.value;
  const busca = filtroBusca.value.trim();

  try {
    lotes = await chamarServidor(
      "/lotes?status=" + status + "&busca=" + encodeURIComponent(busca),
    );
    renderizarLotes();
  } catch (erro) {
    listaLotes.replaceChildren();
    mensagemVazia.hidden = false;
    mensagemVazia.textContent =
      "Não foi possível conectar ao banco de dados. Verifique se o servidor está rodando.";
  }
}

function renderizarLotes() {
  listaLotes.replaceChildren();

  lotes.forEach(function (lote) {
    const card = document.createElement("article");
    card.className = "lote-card";

    // Lotes ativos ganham a cor da situação de validade
    if (lote.status === "ativo") {
      card.classList.add("borda-" + lote.situacao);
    }

    // Cabeçalho
    const topo = document.createElement("div");
    topo.className = "lote-topo";

    const identificacao = document.createElement("div");
    identificacao.className = "lote-identificacao";

    const codigo = criarElemento("span", "lote-codigo", lote.codigo_lote);
    const produto = criarElemento("h3", "", lote.produto);
    const categoria = criarElemento("span", "lote-categoria", lote.categoria);
    identificacao.append(codigo, produto, categoria);

    // Etiqueta: situação de validade (ativos) ou status (demais)
    let etiqueta;
    if (lote.status === "ativo") {
      etiqueta = criarElemento(
        "span",
        "etiqueta " + lote.situacao,
        NOMES_SITUACAO[lote.situacao],
      );
    } else {
      etiqueta = criarElemento("span", "etiqueta status-" + lote.status, lote.status);
    }

    topo.append(identificacao, etiqueta);

    // Informações
    const dados = document.createElement("div");
    dados.className = "lote-dados";

    function adicionarDado(rotulo, valor, classe) {
      const linha = document.createElement("div");
      linha.className = "dado";
      const label = criarElemento("span", "", rotulo);
      const valorElemento = criarElemento("strong", classe || "", String(valor));
      linha.append(label, valorElemento);
      dados.append(linha);
    }

    adicionarDado("Estabelecimento", lote.estabelecimento);
    adicionarDado("Fornecedor", lote.fornecedor || "-");
    adicionarDado("Entrada", formatarData(lote.data_entrada));
    adicionarDado("Validade", formatarData(lote.data_validade));

    if (lote.status === "ativo") {
      adicionarDado("Prazo", textoDias(lote.dias_para_vencer), "texto-" + lote.situacao);
    }

    adicionarDado("Disponível", lote.disponivel + " de " + lote.quantidade + " un.");

    if (lote.quantidade_descartada > 0) {
      adicionarDado("Descartado", lote.quantidade_descartada + " un.");
    }

    // Preço: mostra o desconto quando existir
    if (lote.status === "ativo" && lote.desconto_percentual > 0) {
      adicionarDado(
        "Preço",
        formatarDinheiro(lote.preco_promocional) + " (-" + lote.desconto_percentual + "%)",
        "texto-promocao",
      );
      adicionarDado("Preço original", formatarDinheiro(lote.preco_unitario), "riscado");
    } else {
      adicionarDado("Preço", formatarDinheiro(lote.preco_unitario));
    }

    // Botões (só lotes ativos podem ser alterados)
    const acoes = document.createElement("div");
    acoes.className = "lote-acoes";

    if (lote.status === "ativo") {
      if (lote.dias_para_vencer >= 0 && lote.disponivel > 0) {
        acoes.append(criarBotao("Vender", "btn-vender", "vender", lote.id));
      }
      acoes.append(criarBotao("Editar", "btn-editar", "editar", lote.id));
      acoes.append(criarBotao("Descartar", "btn-descartar", "descartar", lote.id));
      acoes.append(criarBotao("Desativar", "btn-desativar", "desativar", lote.id));
    }

    card.append(topo, dados);
    if (acoes.children.length > 0) {
      card.append(acoes);
    }
    listaLotes.append(card);
  });

  // Atualiza o contador
  const quantidade = lotes.length;
  contador.textContent = quantidade + (quantidade === 1 ? " lote" : " lotes");
  mensagemVazia.textContent = "Nenhum lote encontrado.";
  mensagemVazia.hidden = quantidade > 0;

  atualizarAlerta();
}

function criarBotao(texto, classe, acao, id) {
  const botao = criarElemento("button", classe, texto);
  botao.type = "button";
  botao.dataset.acao = acao;
  botao.dataset.id = id;
  return botao;
}

// ALERTA PREDITIVO: avisa quantos lotes vencem nos próximos 3 dias
function atualizarAlerta() {
  if (filtroStatus.value !== "ativo") {
    alertaVencimento.hidden = true;
    return;
  }

  const criticos = lotes.filter(function (lote) {
    return lote.situacao === "critico" && lote.disponivel > 0;
  });
  const vencidos = lotes.filter(function (lote) {
    return lote.situacao === "vencido" && lote.disponivel > 0;
  });

  if (criticos.length === 0 && vencidos.length === 0) {
    alertaVencimento.hidden = true;
    return;
  }

  let texto = "";
  if (criticos.length > 0) {
    texto +=
      criticos.length +
      (criticos.length === 1 ? " lote vence" : " lotes vencem") +
      " em até 3 dias. Eles já estão com desconto para venda rápida. ";
  }
  if (vencidos.length > 0) {
    texto +=
      vencidos.length +
      (vencidos.length === 1 ? " lote vencido precisa" : " lotes vencidos precisam") +
      " ser descartados.";
  }

  alertaVencimento.replaceChildren(
    criarElemento("span", "material-symbols-outlined", "warning"),
    criarElemento("p", "", texto),
  );
  alertaVencimento.hidden = false;
}

// Preenche as sugestões do campo "Estabelecimento"
async function carregarEstabelecimentos() {
  try {
    const nomes = await chamarServidor("/dashboard/estabelecimentos");
    listaEstabelecimentos.replaceChildren();
    nomes.forEach(function (nome) {
      const opcao = document.createElement("option");
      opcao.value = nome;
      listaEstabelecimentos.append(opcao);
    });
  } catch (erro) {
    // Sem sugestões, o campo continua funcionando normalmente
  }
}

// ---------- CREATE e UPDATE ----------

formulario.addEventListener("submit", async function (event) {
  event.preventDefault();

  const dadosLote = {
    codigo_lote: document.getElementById("input-codigo").value.trim(),
    produto: document.getElementById("input-produto").value.trim(),
    categoria: document.getElementById("input-categoria").value,
    estabelecimento: document.getElementById("input-estabelecimento").value.trim(),
    fornecedor: document.getElementById("input-fornecedor").value.trim(),
    quantidade: Number(document.getElementById("input-quantidade").value),
    preco_unitario: Number(document.getElementById("input-preco").value),
    data_entrada: document.getElementById("input-entrada").value,
    data_fabricacao: document.getElementById("input-fabricacao").value,
    data_validade: document.getElementById("input-validade").value,
  };

  if (
    !dadosLote.codigo_lote ||
    !dadosLote.produto ||
    !dadosLote.categoria ||
    !dadosLote.estabelecimento ||
    !dadosLote.data_entrada ||
    !dadosLote.data_validade ||
    !Number.isInteger(dadosLote.quantidade) ||
    dadosLote.quantidade <= 0 ||
    dadosLote.preco_unitario <= 0
  ) {
    alert("Preencha todos os campos obrigatórios corretamente.");
    return;
  }

  try {
    if (idEmEdicao !== null) {
      // UPDATE
      await chamarServidor("/lotes/" + idEmEdicao, "PUT", dadosLote);
      alert("Lote atualizado com sucesso!");
    } else {
      // CREATE
      await chamarServidor("/lotes", "POST", dadosLote);
      alert("Lote cadastrado com sucesso!");
    }

    formulario.reset();
    cancelarEdicao();
    carregarLotes();
    carregarEstabelecimentos();
  } catch (erro) {
    alert(erro.message);
  }
});

// ---------- Botões dos cards ----------

listaLotes.addEventListener("click", function (event) {
  const botao = event.target.closest("button[data-acao]");
  if (!botao) return;

  const id = Number(botao.dataset.id);
  const acao = botao.dataset.acao;

  if (acao === "editar") editarLote(id);
  if (acao === "vender") venderLote(id);
  if (acao === "descartar") descartarLote(id);
  if (acao === "desativar") desativarLote(id);
});

function buscarLote(id) {
  return lotes.find(function (item) {
    return item.id === id;
  });
}

// Carrega os dados no formulário
function editarLote(id) {
  const lote = buscarLote(id);
  if (!lote) return;

  idEmEdicao = lote.id;

  document.getElementById("input-codigo").value = lote.codigo_lote;
  document.getElementById("input-produto").value = lote.produto;
  document.getElementById("input-categoria").value = lote.categoria;
  document.getElementById("input-estabelecimento").value = lote.estabelecimento;
  document.getElementById("input-fornecedor").value = lote.fornecedor || "";
  document.getElementById("input-quantidade").value = lote.quantidade;
  document.getElementById("input-preco").value = lote.preco_unitario;
  document.getElementById("input-entrada").value = lote.data_entrada;
  document.getElementById("input-fabricacao").value = lote.data_fabricacao || "";
  document.getElementById("input-validade").value = lote.data_validade;

  tituloFormulario.textContent = "Editar lote " + lote.codigo_lote;
  btnSalvar.textContent = "Salvar alterações";
  btnCancelar.hidden = false;

  formulario.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

// LIQUIDAÇÃO: registra a venda com o preço promocional do dia
async function venderLote(id) {
  const lote = buscarLote(id);
  if (!lote) return;

  const resposta = prompt(
    `Vender unidades do lote ${lote.codigo_lote} (${lote.produto})\n\n` +
      `Disponível: ${lote.disponivel} un.\n` +
      `Preço de hoje: ${formatarDinheiro(lote.preco_promocional)}` +
      (lote.desconto_percentual > 0 ? ` (-${lote.desconto_percentual}%)` : "") +
      "\n\nQuantas unidades foram vendidas?",
  );

  if (resposta === null) return; // clicou em cancelar

  const quantidade = Number(resposta);
  if (!Number.isInteger(quantidade) || quantidade <= 0) {
    alert("Digite um número inteiro maior que zero.");
    return;
  }

  try {
    const venda = await chamarServidor("/lotes/" + id + "/vendas", "POST", {
      quantidade: quantidade,
    });
    alert(
      "Venda registrada!\n" +
        quantidade +
        " un. x " +
        formatarDinheiro(venda.preco_unitario) +
        " = " +
        formatarDinheiro(venda.valor_total),
    );
    carregarLotes();
  } catch (erro) {
    alert(erro.message);
  }
}

// DESCARTE: baixa de tudo que sobrou no lote
async function descartarLote(id) {
  const lote = buscarLote(id);
  if (!lote) return;

  const confirmar = confirm(
    `Descartar as ${lote.disponivel} unidades restantes do lote ${lote.codigo_lote}?\n` +
      "Isso será contado como desperdício no dashboard.",
  );
  if (!confirmar) return;

  try {
    await chamarServidor("/lotes/" + id + "/descartar", "PUT");
    carregarLotes();
  } catch (erro) {
    alert(erro.message);
  }
}

// DESATIVAR: o registro não é apagado do banco (mantém o histórico)
async function desativarLote(id) {
  const lote = buscarLote(id);
  if (!lote) return;

  const confirmar = confirm(
    `Deseja realmente desativar o lote ${lote.codigo_lote}?\n` +
      "Use para lotes cadastrados por engano.",
  );
  if (!confirmar) return;

  try {
    await chamarServidor("/lotes/" + id + "/desativar", "PUT");

    // Cancela a edição se o lote desativado estava no formulário
    if (idEmEdicao === id) {
      formulario.reset();
      cancelarEdicao();
    }
    carregarLotes();
  } catch (erro) {
    alert(erro.message);
  }
}

// Cancela a edição
function cancelarEdicao() {
  idEmEdicao = null;
  tituloFormulario.textContent = "Cadastrar lote";
  btnSalvar.textContent = "Cadastrar lote";
  btnCancelar.hidden = true;
  document.getElementById("input-entrada").value = dataDeHoje();
}

btnCancelar.addEventListener("click", function () {
  formulario.reset();
  cancelarEdicao();
});

// Filtros: recarrega a lista quando mudar
filtroStatus.addEventListener("change", carregarLotes);

// Na busca, espera a pessoa parar de digitar (300 ms) antes de buscar
let tempoBusca = null;
filtroBusca.addEventListener("input", function () {
  clearTimeout(tempoBusca);
  tempoBusca = setTimeout(carregarLotes, 300);
});

// Inicializa a página
document.getElementById("input-entrada").value = dataDeHoje();
carregarLotes();
carregarEstabelecimentos();
