// REGRAS DO NEGÓCIO
// Quanto mais perto do vencimento, maior o desconto (precificação dinâmica).
// Assim o lote é vendido antes de virar desperdício.

// Situação do lote de acordo com os dias que faltam para vencer
function calcularSituacao(dias) {
  if (dias < 0) return "vencido";
  if (dias <= 3) return "critico";
  if (dias <= 7) return "atencao";
  return "normal";
}

// Desconto (%) de acordo com os dias que faltam para vencer
function calcularDesconto(dias) {
  if (dias < 0) return 0; // vencido: não pode ser vendido
  if (dias === 0) return 60; // vence hoje
  if (dias <= 3) return 40;
  if (dias <= 7) return 20;
  return 0;
}

// Preço com desconto, arredondado em 2 casas
function calcularPrecoPromocional(preco, dias) {
  const desconto = calcularDesconto(dias);
  const precoFinal = preco - (preco * desconto) / 100;
  return Math.round(precoFinal * 100) / 100;
}

// Recebe um lote vindo do banco e acrescenta os campos calculados
function completarLote(lote) {
  const dias = Number(lote.dias_para_vencer);
  const preco = Number(lote.preco_unitario);

  return {
    ...lote,
    preco_unitario: preco,
    dias_para_vencer: dias,
    disponivel:
      lote.quantidade - lote.quantidade_vendida - lote.quantidade_descartada,
    situacao: calcularSituacao(dias),
    desconto_percentual: calcularDesconto(dias),
    preco_promocional: calcularPrecoPromocional(preco, dias),
  };
}

module.exports = {
  calcularSituacao,
  calcularDesconto,
  calcularPrecoPromocional,
  completarLote,
};
