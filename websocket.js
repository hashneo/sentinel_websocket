'use strict';
require('array.prototype.find');

function WebSocket(config) {

    if ( !(this instanceof WebSocket) ){
        return new WebSocket(config);
    }

    const messageHandler = require('./messageHandler')();

    const uuid = require('uuid');

    let wsClients = {};

    global.app.ws('/', function (ws, req) {

        ws['id'] = ws.upgradeReq.cookies['connect.sid'] || uuid.v4();
        wsClients[ws.id] = ws;

        console.log('websocket opened, active connections => ' + Object.keys(wsClients).length);

        ws.on('message', function (msg) {
            //console.log(msg);
        });
        ws.on('close', function () {
            delete wsClients[this.id];
            console.log('websocket closed, active connections => ' + Object.keys(wsClients).length);
        });
    });

    messageHandler.on('automation.log', (data) => {
        if (wsClients[data.target])
            wsClients[data.target].send( JSON.stringify( {log: data.log} ) );
    });

    messageHandler.on('device.update', (data) => {
        for (let i in wsClients) {
            wsClients[i].send( JSON.stringify( {device: data.id, status: data.value} ) );
        }
    });

}

module.exports = WebSocket;