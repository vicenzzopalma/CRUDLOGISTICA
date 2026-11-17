// Carrega as variáveis do arquivo .env (dados do banco)
require("dotenv").config();

const express = require("express");
const app = express();
const port = process.env.PORTA || 3000;
const router = require("./routers/index");
const conexao = require("./infraestrutura/conexao");
const Tabelas = require("./infraestrutura/tabelas");

// Permite receber JSON no corpo das requisições (POST e PUT)
app.use(express.json());

// Entrega os arquivos da pasta "public" (HTML, CSS e JS do site)
app.use(express.static("public"));

Tabelas.init(conexao);

router(app);

app.listen(port, (error) => {
  if (error) {
    console.log("Erro na conexão:");
    return;
  }
  console.log("Servidor Subiu");
  console.log("Acesse: http://localhost:" + port);
});
