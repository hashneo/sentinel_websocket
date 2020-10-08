'use strict';

const EventEmitter = require('events').EventEmitter;
const fs = require('fs');
const logger = require('sentinel-common').logger;

function MessageHandler() {

    if ( !(this instanceof MessageHandler) ){
        return new MessageHandler();
    }

    let that = this;

    EventEmitter.call(this);

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

    sub.on('pmessage', function (channel, pattern, message) {

        let data = JSON.parse(message);

        switch (pattern) {
            case 'sentinel.module.start':
            case 'sentinel.module.running':
                switch ( data.name ){
                    case 'auth':
                        global.auth = data;
                    break;
                    case 'server':
                        global.server = data;
                        break;
                }
                break;
            case 'sentinel.device.insert':
                break;

            case 'sentinel.device.update':

                // Ignore from server
                if ( data.module === 'server'){
                    if ( global.auth ) {
                        that.emit('device.update', data);
                    }
                }

                break;
        }
    });

    sub.psubscribe("sentinel.*");
}

MessageHandler.prototype = Object.create(EventEmitter.prototype);

module.exports = MessageHandler;