// backend/config/agenda.js
const { Agenda } = require("agenda");

const mongoConnectionString = process.env.MONGO_URL;  // use this directly

const agenda = new Agenda({
  db: { address: mongoConnectionString, collection: "agendaJobs" },
});

module.exports = agenda;
