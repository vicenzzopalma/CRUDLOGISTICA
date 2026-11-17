class Tabelas {
  // "aoTerminar" é opcional: uma função chamada quando as tabelas estiverem prontas
  init(conexao, aoTerminar) {
    this.conexao = conexao;
    this.aoTerminar = aoTerminar;
    this.criarTabelaLotes();
  }

  // Cada linha da tabela "lotes" é um LOTE de um produto:
  // mesmo produto, mesma data de validade, mesma entrada no estoque.
  criarTabelaLotes() {
    const sql = `create table if not exists lotes (
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
    )`;

    this.conexao.query(sql, (erro) => {
      if (erro) {
        console.error("Erro ao criar tabela de lotes:", erro.message);
      } else {
        console.log("Tabela de lotes criada com sucesso.");
        // A tabela de vendas depende da tabela de lotes,
        // por isso só é criada depois.
        this.criarTabelaVendas();
      }
    });
  }

  // Cada venda (liquidação) feita a partir de um lote
  criarTabelaVendas() {
    const sql = `create table if not exists vendas (
      id int not null auto_increment primary key,
      lote_id int not null,
      quantidade int not null,
      preco_unitario decimal(10,2) not null,
      desconto_percentual int not null default 0,
      valor_total decimal(10,2) not null,
      data_venda datetime default current_timestamp,
      foreign key (lote_id) references lotes(id)
    )`;

    this.conexao.query(sql, (erro) => {
      if (erro) {
        console.error("Erro ao criar tabela de vendas:", erro.message);
      } else {
        console.log("Tabela de vendas criada com sucesso.");
        if (this.aoTerminar) this.aoTerminar();
      }
    });
  }
}

module.exports = new Tabelas();
