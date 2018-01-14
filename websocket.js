'use strict';
require('array.prototype.find');

function websocket(config) {

    if ( !(this instanceof websocket) ){
        return new websocket(config);
    }

    const redis = require('redis');

    const uuid = require('uuid');

    let sub = redis.createClient(
        {
            host: process.env.REDIS || global.config.redis || '127.0.0.1',
            socket_keepalive: true,
            retry_unfulfilled_commands: true
        }
    );

    sub.on('end', function (e) {
        console.log('Redis hung up, committing suicide');
        process.exit(1);
    });

    let wsClients = {};

    global.app.ws('/api/ws', function (ws, req) {

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


    sub.on('pmessage', function (channel, pattern, message) {

        let data = JSON.parse(message);

        switch (pattern) {
            case 'sentinel.module.start':
            case 'sentinel.module.running':
                break;

            case 'sentinel.device.insert':
                break;
            case 'sentinel.automation.log':

                if (wsClients[data.target])
                    wsClients[data.target].send( JSON.stringify( {log: data.log} ) );

                break;
            case 'sentinel.device.update':

                // Accept only from server
                if ( data.module === 'server'){
                    for (let i in wsClients) {
                        wsClients[i].send( JSON.stringify( {device: data.id, status: data.value} ) );
                    }
                }

                break;
        }
    });

    sub.psubscribe("sentinel.*");

}

module.exports = websocket;