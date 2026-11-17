const mysql = require("mysql2");
const fs = require("fs");
const path = require("path");

// Configuração SSL: bancos online (como o Aiven) exigem conexão segura.
// Se você baixar o certificado "CA certificate" do Aiven e salvar como
// infraestrutura/ca.pem, ele será usado para validar o servidor.
let ssl = undefined;

if (process.env.DB_SSL === "true") {
  const caminhoCertificado = path.join(__dirname, "ca.pem");

  if (fs.existsSync(caminhoCertificado)) {
    ssl = { ca: fs.readFileSync(caminhoCertificado) };
  } else {
    ssl = { rejectUnauthorized: false };
  }
}

// Usamos createPool (e não createConnection) porque o pool reabre
// a conexão sozinho caso o banco online desconecte por inatividade.
// O uso é o mesmo: conexao.query(sql, callback)
const conexao = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "gestao_lotes",
  ssl: ssl,
  // Devolve as datas como texto "2026-11-17" (evita erro de fuso horário)
  dateStrings: true,
  connectionLimit: 5,
});

// Todo o sistema trabalha no horário de Brasília
conexao.on("connection", function (con) {
  con.query("SET time_zone = '-03:00'");
});

module.exports = conexao;
