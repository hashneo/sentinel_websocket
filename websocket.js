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

    let wsClients = [];

    global.app.ws('/api/ws', function (ws, req) {

        ws['id'] = uuid.v4();
        wsClients.push(ws);

        console.log('websocket opened, active connections => ' + wsClients.length);

        ws.on('message', function (msg) {
            //console.log(msg);
        });
        ws.on('close', function () {
            let removeIndex = -1;
            for (let i in wsClients) {
                if (this.id === wsClients[i].id) {
                    removeIndex = i;
                    break;
                }
            }

            if (removeIndex != -1)
                wsClients.splice(removeIndex, 1);

            console.log('websocket closed, active connections => ' + wsClients.length);
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

            case 'sentinel.device.update':

                // Ignore from server
                if ( data.module === 'server'){

                    for (let i in wsClients) {
                        wsClients[i].send( JSON.stringify( {'device': data.id, 'status': data.value} ) );
                    }
                }

                break;
        }
    });

    sub.psubscribe("sentinel.*");

}

module.exports = websocket;