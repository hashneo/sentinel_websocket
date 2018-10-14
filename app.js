'use strict';

const SwaggerExpress = require('swagger-express-mw');
const SwaggerUi = require('swagger-tools/middleware/swagger-ui');
const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const redis = require('redis');

const uuid = require('uuid');

const consul = require('consul')( {
    host: process.env.CONSUL || '127.0.0.1',
    promisify: true
});

let moduleName = 'websocket';

app.use(bodyParser.json({limit: '50mb'}));
app.use(cookieParser());

const expressWs = require('express-ws')(app);

global.app = app;

global.consul = consul;

consul.kv.get(`config/sentinel/${moduleName}`, function(err, result) {
    if (err) throw err;

    if (!result)
        result = { Value : null };

    let config = JSON.parse(result.Value);

    if (!config)
        config = {};

    config.save = () => {
        return new Promise( (fulfill, reject) => {
            consul.kv.set( `config/sentinel/${moduleName}`, JSON.stringify(config, null, '\t'), function(err, result) {
                if (err)
                    return reject(err);
                fulfill(result);
            })
        });
    };

    config.path = () => {
        return `config/sentinel/${moduleName}`;
    };

    global.config = config;
    global.config.save();

    if (global.config.newrelic) {
        require('newrelic');
    }

    let pub = redis.createClient(
        {
            host: process.env.REDIS || global.config.redis || '127.0.0.1',
            socket_keepalive: true,
            retry_unfulfilled_commands: true
        }
    );

    const securityHandlers = require('sentinel-common').securityHandlers;

    let appConfig = {
        appRoot: __dirname, // required config
        swaggerSecurityHandlers: {
            Oauth: securityHandlers.Oauth
        }
    };

    app.use(function(req, res, next) {

        if ( req.headers.connection !== 'Upgrade' ) {
            next();
        }
        else {
            // Only check WebSocket upgrade requests
            securityHandlers.Oauth(req, null, ['user', 'admin'], (err) => {
                if (!err) {
                    next();
                }else {
                    res.status(403).json({code: 403, message: err.message});
                }
            });
        }
    });

    SwaggerExpress.create(appConfig, function (err, swaggerExpress) {
        if (err) {
            throw err;
        }

        app.use(SwaggerUi(swaggerExpress.runner.swagger));
        // install middleware
        swaggerExpress.register(app);

        let serviceId = process.env.SERVICE_ID || uuid.v4();

        let port = process.env.PORT || undefined;
        let server = app.listen(port, () => {

            let host = process.env.HOST || process.env.SERVICE_NAME || require('ip').address();
            let port = server.address().port;

            let module = {
                id: serviceId,
                name: moduleName,
                address: host,
                port: port,
                active: true,
                endpoint : `http://${host}:${port}`,
                check: {
                    http: `http://${host}:${port}/health?id=${serviceId}`,
                    interval: '15s'
                }
            };

            process.env.SERVICE_ID = serviceId;

            pub.on('ready', function(e){

                pub.publish( 'sentinel.module.start', JSON.stringify( module, '\t' ) );

                setInterval( () => {
                    pub.publish('sentinel.module.running', JSON.stringify(module, '\t'));
                }, 5000 );

                if (swaggerExpress.runner.swagger.paths['/health']) {
                    console.log(`you can get /health?id=${serviceId} on port ${port}`);
                }
                global.module = require(`./${moduleName}.js`)(config);
            });

        });

    });

});

process.on('unhandledRejection', (reason, p) => {
    console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
    process.exit(1);
});

module.exports = app;