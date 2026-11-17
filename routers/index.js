const routerLote = require("./loteRoute");
const routerDashboard = require("./dashboardRoute");

module.exports = (app) => {
  app.use(routerLote);
  app.use(routerDashboard);
};
