// ============================================================================
// Copyright 2017-2022, Schlumberger
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
// ============================================================================

import cors from 'cors';
import express from 'express';
import fs from 'fs';
import https from 'https';
import jwtProxy, { JwtProxyOptions } from 'jwtproxy';
import swaggerUi from 'swagger-ui-express';
import { v4 as uuidv4 } from 'uuid';
import { AuthProviderFactory } from '../auth';
import { Config, LoggerFactory } from '../cloud';
import { ServiceRouter } from '../services';
import { Error, Feature, FeatureFlags, getInMemoryCacheInstance, Response, Utils } from '../shared';
import { SwaggerManager } from './swagger-manager';
// -------------------------------------------------------------------
// Seismic Store Service
// -------------------------------------------------------------------
export class Server {

    private app: express.Express;
    private port: number;

    private httpServer: import('http').Server;
    private httpsServer: import('https').Server;

    private corsOptions = {
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
        preflightContinue: false,
        optionsSuccessStatus: 204,
        credentials: true,
        maxAge: 3600,
        exposedHeaders: [
            'Origin',
            'Content-Type',
            'X-Requested-With',
            'Authorization',
            'Accept',
            'Referer',
            'X-Requested-With',
            'Access-Control-Allow-Origin',
            'x-traffic-manager'
        ],
        allowedHeaders: [
            'Origin',
            'Content-Type',
            'X-Requested-With',
            'Authorization',
            'Accept',
            'Referer',
            'X-Requested-With',
            'Access-Control-Allow-Origin',
            'x-traffic-manager',
            'ltag',
            'impersonation-token',
            'impersonation-token-context',
            'user-token'
        ]
    };

    constructor() {

        this.app = express();
        this.app.use(express.urlencoded({ extended: false }));
        this.app.use(express.json({ limit: '50MB' }));
        this.app.disable('x-powered-by');
        this.app.use(cors(this.corsOptions));
        this.app.options('*', cors());
        this.app.use(Config.SDMS_PREFIX + '/swagger-ui.html', swaggerUi.serve, swaggerUi.setup(
            SwaggerManager.swaggerDocument, {
            customCss: '.swagger-ui .topbar { display: none }'
        }));
        this.app.get(Config.SDMS_PREFIX + '/api-doc', (req: express.Request, res: express.Response) => {
            res.setHeader('Content-Type','application/json');
            res.send(SwaggerManager.swaggerDocument);
        });
        this.app.use(async (req: express.Request, res: express.Response, next: express.NextFunction) => {

            try {

                // disable silent error logs
                res.locals['disabled_error_logs'] = req.query['silent'] ?
                    req.query['silent'] === 'silent_for_errors' : false;

                // activate optional consistency emulation
                Config.enableStrongConsistencyEmulation();
                Config.DATA_PARTITION_ID = undefined;

                // If required, exchange the caller credentials to include the DE target audience
                if (Config.ENABLE_DE_TOKEN_EXCHANGE) {
                    if (Config.DES_TARGET_AUDIENCE) {

                        if (req.headers.authorization) {

                            // use the token signature as unique key
                            const cacheKey = 'token-' + req.headers.authorization.split('.')[2];

                            // check if in cache before
                            const cachedExchangedToken = getInMemoryCacheInstance().get<string>(cacheKey);

                            if (cachedExchangedToken) {
                                req.headers.authorization = cachedExchangedToken;
                            } else {

                                // exchange the token
                                req.headers.authorization = await AuthProviderFactory.build(
                                    Config.SERVICE_AUTH_PROVIDER).exchangeCredentialAudience(
                                        req.headers.authorization, Config.DES_TARGET_AUDIENCE);

                                // cache the exchanged credential for 5 minute
                                getInMemoryCacheInstance().set<string>(cacheKey, req.headers.authorization, 300);
                            }

                        }
                    }
                }

                // ensure the authorization header is passed/
                // the imptoken refresh method is now obsolete because was not secured.
                // the imptoken endpoints are not enabled in any CSP but temporarily used in SLB only.
                // the imptoken endpoints have been marked as obsoleted and will be deprecated with the
                // next service upgrade (v3>v4)
                if (!req.headers.authorization) {

                    const imptokenCall = (req.method === 'PUT' && req.url.endsWith('imptoken'));
                    const statusCall = req.url.endsWith('svcstatus');
                    const readinessCall = req.url.endsWith('readiness');
                    if (!(imptokenCall || statusCall || readinessCall)) {
                        Response.writeError(res, Error.make(
                            Error.Status.UNAUTHENTICATED,
                            'Unauthenticated Access. Authorizations not found in the request.'));
                        return;
                    }
                }

                // set the header correlation id and keep a reference in the response locals
                if (Config.CORRELATION_ID) {
                    if (!req.headers[Config.CORRELATION_ID]) {
                        req.headers[Config.CORRELATION_ID] = uuidv4();
                    }
                    res.locals[Config.CORRELATION_ID] = req.headers[Config.CORRELATION_ID];
                }

                if (FeatureFlags.isEnabled(Feature.LOGGING)) {

                    const logger = LoggerFactory.build(Config.CLOUDPROVIDER);

                    // track caller to the main log
                    if (!req.url.endsWith('svcstatus')) {
                        const key = req.headers['x-api-key'] as string;
                        logger.info(
                            ((key && key.length > 5) ? ('[***' + key.substr(key.length - 5) + '] ') : '')
                            + '[' + req.method + '] ' + req.url);

                        logger.metric('SeismicDMS Request Size',
                            req.headers['content-length'] ? +req.headers['content-length'] : 0);
                    }
                }

                // forward the caller appkey if exist
                // if exists ensure it does not collide the google-esp api-key (required for backward compatibility)
                req[Config.DE_FORWARD_APPKEY] =
                    req.headers['appkey'] !== req.headers['x-api-key'] ? req.headers['appkey'] : undefined;


                next();

            } catch (error) {
                Response.writeError(res, error);
            }
        });

        const jwtValidateOptions: JwtProxyOptions = {
            disable: !Config.JWT_ENABLE_FEATURE,
            excluded: Config.JWT_EXCLUDE_PATHS ? Config.JWT_EXCLUDE_PATHS.split(';') : [],
            jwksUrl: Config.JWKS_URL,
            algorithms: ['RS256'],
            audience: Config.JWT_AUDIENCE
        };

        // adding middleware to intercept and validate jwt
        this.app.use(jwtProxy(jwtValidateOptions));

        this.app.use(ServiceRouter);
    }

    public async start(port = Config.SERVICE_PORT) {

        this.port = port;

        // The timeout of the backend service should be greater than the timeout of the load balancer. This will
        // prevent premature connection closures from the service
        // Additionally, the headers-timeout needs to be greater than keep-alive-timeout
        // https://github.com/nodejs/node/issues/27363

        // SSL
        if (Config.SSL_ENABLED) {
            const privateKey = fs.readFileSync(Config.SSL_KEY_PATH, 'utf8');
            const certificate = fs.readFileSync(Config.SSL_CERT_PATH, 'utf8');
            const credentials = { key: privateKey, cert: certificate };
            this.httpsServer = https.createServer(credentials, this.app).listen(this.port, () => {
                // tslint:disable-next-line
                console.log(`- Server is listening on port ${this.port}...`);
            });
            this.httpsServer.setTimeout(610000);
            this.httpsServer.keepAliveTimeout = 610 * 1000;
            this.httpsServer.headersTimeout = 611 * 1000;
        } else {
            this.httpServer = this.app.listen(this.port, () => {
                // tslint:disable-next-line
                console.log(`- Server is listening on port ${this.port}...`);
            });
            this.httpServer.setTimeout(610000);
            this.httpServer.keepAliveTimeout = 610 * 1000;
            this.httpServer.headersTimeout = 611 * 1000;
        }
    }

    public stop() {
        if (this.httpServer) {
            this.httpServer.close();
        }
        if (this.httpsServer) {
            this.httpsServer.close();
        }
    }
}
