// Executa motor.js sobre testes/casos.json e imprime as saídas em JSON (usado pelo teste de paridade)
const M = require('../motor.js'), C = require('./casos.json');
process.stdout.write(JSON.stringify(C.map(c => M.decidir(c.entrada))));
