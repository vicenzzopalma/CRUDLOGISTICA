// DADOS DE EXEMPLO
// Gera lotes e vendas "realistas" a partir de uma data (hoje).
// É usado por:
//   - popular.js        -> grava no MySQL
//   - exportar-banco.js -> gera os arquivos banco.sql (MySQL) e public/dados/banco-exemplo.sql (SQLite)
const { calcularDesconto, calcularPrecoPromocional } = require("../regras/precificacao");

const ESTABELECIMENTOS = [
  "Supermercado Centro",
  "Atacarejo Norte",
  "Padaria Pão Quente",
  "Restaurante Sabor Caseiro",
];

// Categorias de cada estabelecimento (os que não aparecem aqui vendem de tudo)
const CATEGORIAS_POR_TIPO = {
  "Padaria Pão Quente": ["Padaria", "Laticínios", "Frios", "Bebidas"],
  "Restaurante Sabor Caseiro": ["Carnes", "Hortifrúti", "Laticínios", "Mercearia", "Padaria"],
};

// produto, categoria, preço, dias de validade, fornecedor
const PRODUTOS = [
  ["Alface crespa", "Hortifrúti", 3.49, 6, "Horta Boa Vista"],
  ["Tomate italiano (bandeja 500g)", "Hortifrúti", 6.9, 9, "Horta Boa Vista"],
  ["Morango (bandeja 250g)", "Hortifrúti", 9.9, 5, "Sítio Serra Verde"],
  ["Leite integral 1L", "Laticínios", 5.49, 20, "Laticínios Vale Sul"],
  ["Iogurte natural 170g", "Laticínios", 3.29, 25, "Laticínios Vale Sul"],
  ["Queijo minas frescal 500g", "Laticínios", 24.9, 15, "Queijaria Joinville"],
  ["Requeijão cremoso 200g", "Laticínios", 8.99, 30, "Laticínios Vale Sul"],
  ["Peito de frango 1kg", "Carnes", 18.9, 7, "Frigorífico Catarinense"],
  ["Carne moída 500g", "Carnes", 22.5, 4, "Frigorífico Catarinense"],
  ["Linguiça toscana 1kg", "Carnes", 21.9, 12, "Frigorífico Catarinense"],
  ["Pão de forma integral", "Padaria", 9.49, 8, "Panificadora Norte"],
  ["Bolo de cenoura", "Padaria", 15.0, 4, "Produção própria"],
  ["Pão francês (pacote 10 un)", "Padaria", 8.0, 2, "Produção própria"],
  ["Suco de laranja integral 1L", "Bebidas", 11.9, 10, "Citrus Sul"],
  ["Massa fresca talharim 500g", "Mercearia", 12.9, 14, "Massas Nonna"],
  ["Presunto fatiado 200g", "Frios", 9.9, 10, "Frigorífico Catarinense"],
  ["Lasanha congelada 600g", "Congelados", 19.9, 45, "Massas Nonna"],
];

// Gerador de números "aleatórios" que sempre dá o mesmo resultado
// (assim todo mundo do grupo vê os mesmos dados)
let semente = 2026;
function aleatorio() {
  semente = (semente * 16807) % 2147483647;
  return (semente - 1) / 2147483646;
}
function inteiro(min, max) {
  return Math.floor(aleatorio() * (max - min + 1)) + min;
}

// Soma dias em uma data no formato "AAAA-MM-DD"
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

function criarDados(hoje) {
  semente = 2026; // recomeça a sequência: sempre os mesmos dados
  const lotes = [];
  const vendas = [];
  let sequencia = 1;

  for (let i = 0; i < 70; i++) {
    const estabelecimento = ESTABELECIMENTOS[inteiro(0, ESTABELECIMENTOS.length - 1)];
    // Cada estabelecimento só recebe produtos que fazem sentido para ele
    const permitidos = PRODUTOS.filter(
      (item) => !CATEGORIAS_POR_TIPO[estabelecimento] || CATEGORIAS_POR_TIPO[estabelecimento].includes(item[1]),
    );
    const [produto, categoria, preco, validadeDias, fornecedor] =
      permitidos[inteiro(0, permitidos.length - 1)];

    // Os primeiros lotes entram nos últimos dias para garantir
    // lotes ativos perto do vencimento (alertas)
    // Dois lotes já venceram e ainda não foram descartados (geram alerta)
    const vencidoAguardando = i === 4 || i === 13;

    let diasAtras = i < 22 ? inteiro(0, Math.min(validadeDias, 10)) : inteiro(5, 85);
    if (vencidoAguardando) diasAtras = validadeDias + inteiro(1, 2);
    const dataEntrada = somarDias(hoje, -diasAtras);
    const dataFabricacao = somarDias(dataEntrada, -inteiro(0, 2));
    const dataValidade = somarDias(dataEntrada, validadeDias);
    const quantidade = inteiro(20, 120);

    const id = lotes.length + 1;
    const codigo =
      "LT-" + dataEntrada.replace(/-/g, "").slice(2) + "-" + String(sequencia++).padStart(3, "0");

    const venceu = dataValidade < hoje;
    // Lotes já vencidos venderam bastante; lotes ativos venderam uma parte
    const percentualVenda = venceu ? 0.6 + aleatorio() * 0.38 : aleatorio() * 0.6;
    let vendida = Math.floor(quantidade * percentualVenda);
    // Parte dos lotes vencidos foi vendida por completo graças ao desconto
    if (venceu && !vencidoAguardando && aleatorio() < 0.4) vendida = quantidade;

    // Espalha as vendas entre a entrada e (validade ou hoje)
    const ultimoDiaVenda = venceu ? dataValidade : hoje;
    const diasDeVenda = Math.max(diferencaDias(dataEntrada, ultimoDiaVenda), 0);
    let restante = vendida;
    while (restante > 0) {
      // Lotes já fechados vendem mais perto do vencimento (quando o desconto aparece);
      // lotes ativos têm as vendas espalhadas até hoje
      const sorteio = venceu ? Math.sqrt(aleatorio()) : aleatorio();
      const posicao = Math.floor(sorteio * (diasDeVenda + 1));
      const diaVenda = somarDias(dataEntrada, Math.min(posicao, diasDeVenda));
      const qtd = Math.min(restante, inteiro(1, 8));
      const diasParaVencer = diferencaDias(diaVenda, dataValidade);
      const precoVenda = calcularPrecoPromocional(preco, diasParaVencer);

      vendas.push([
        id,
        qtd,
        precoVenda,
        calcularDesconto(diasParaVencer),
        Math.round(precoVenda * qtd * 100) / 100,
        diaVenda + " " + String(inteiro(8, 20)).padStart(2, "0") + ":" + String(inteiro(0, 59)).padStart(2, "0") + ":00",
      ]);
      restante -= qtd;
    }

    let status = "ativo";
    let descartada = 0;
    let dataDescarte = null;

    if (venceu) {
      if (vencidoAguardando) {
        status = "ativo";
      } else if (vendida === quantidade) {
        status = "vendido";
      } else {
        status = "descartado";
        descartada = quantidade - vendida;
        dataDescarte = somarDias(dataValidade, 1) > hoje ? hoje : somarDias(dataValidade, 1);
      }
    }

    lotes.push([
      id,
      codigo,
      produto,
      categoria,
      estabelecimento,
      fornecedor,
      quantidade,
      vendida,
      descartada,
      preco,
      dataFabricacao,
      dataValidade,
      dataEntrada,
      dataDescarte,
      status,
    ]);
  }

  return { lotes, vendas };
}

module.exports = { criarDados, somarDias, diferencaDias };
