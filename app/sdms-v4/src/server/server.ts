// ============================================================================
// Copyright 2017-2024, Schlumberger
//
// Licensed under the Apache License, Version 2.0 (the "License");
// You may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// Distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// Limitations under the License.
// ============================================================================

import { Context, Error, Response } from '../shared';
import { Config } from '../cloud/config';
import { LoggerFactory } from '../cloud/logger';
import { ServiceRouter } from '../apis';
import cors from 'cors';
import { corsOptions } from './cors';
import express from 'express';
import fs from 'fs';
import https from 'https';
import swaggerUi from 'swagger-ui-express';
import { v4 as uuidv4 } from 'uuid';

export class Server {
    private app: express.Express;
    private swaggerDocument?: swaggerUi.JsonObject;

    constructor() {
        this.app = express();
        this.app.use(express.urlencoded({ extended: false }));
        this.app.use(express.json(), (error, req, res, next) => {
            if (error) {
                if ((error.message as string).match('^Unexpected token . in JSON')) {
                    Response.writeError(res, Error.make(Error.Status.BAD_REQUEST, error.message));
                } else {
                    Response.writeError(res, Error.make(Error.Status.UNKNOWN, error.message));
                }
            } else {
                next();
            }
        });
        this.app.disable('x-powered-by');
        this.app.use(cors(corsOptions));
        this.app.use(Config.APIS_BASE_PATH + '/swagger-ui.html', swaggerUi.serve, (req, res, next) => {
            if (!this.swaggerDocument) {
                res.status(503).send('Swagger UI is still initializing');
                return;
            }
            swaggerUi.setup(this.swaggerDocument, {
                customCss: '.swagger-ui .topbar { display: none }',
            })(req, res, next);
        });
        this.app.use(this.sdmsMiddleware);
        this.app.use(ServiceRouter);
    }

    // Inject the resolved swagger document once background resolution completes (server-start.ts).
    public setSwaggerDocument(swaggerDocument: swaggerUi.JsonObject) {
        this.swaggerDocument = swaggerDocument;
    }

    // Set of operations to perform before serving the request
    public sdmsMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
        // Reset request endpointId
        Context.endpointId = undefined;

        // Create and set a correlation-id string if not exist
        if (!req.headers[Config.CORRELATION_ID]) {
            req.headers[Config.CORRELATION_ID] = uuidv4();
        }
        res.locals[Config.CORRELATION_ID] = req.headers[Config.CORRELATION_ID];

        // Required data-partition-id header
        const statusCall = req.originalUrl.endsWith('status');
        const readinessCall = req.originalUrl.endsWith('readiness');
        const infoCall = req.originalUrl.endsWith('info');
        if (!req.headers['data-partition-id']) {
            if (!(statusCall || readinessCall || infoCall)) {
                Response.writeError(
                    res,
                    Error.make(Error.Status.BAD_REQUEST, 'Missing required request header "data-partition-id".')
                );
                return;
            }
        }

        // Required authorization header
        if (!req.headers.authorization) {
            if (!(statusCall || readinessCall || infoCall)) {
                Response.writeError(
                    res,
                    Error.make(
                        Error.Status.UNAUTHENTICATED,
                        'Missing required request header "authorization", unauthenticated access.'
                    )
                );
                return;
            }
        }

        // track request
        if (!(statusCall || readinessCall || infoCall) && Config.LOGGER_ENABLED) {
            LoggerFactory.build(Config.CLOUD_PROVIDER).trackRequest(req);
        }

        // Identify the endpoint schema
        Context.setSchemaReferenceFromEndpointName(req);

        // Continue service the request
        next();
    }

    public start(port = Config.SERVICE_PORT) {
        // The timeout of the backend service should be greater than the timeout of the load balancer. This will
        // Prevent premature connection closures from the service
        // Additionally, the headers-timeout needs to be greater than keep-alive-timeout
        // https://github.com/nodejs/node/issues/27363

        const listeningMex = '- Server is listening on port ' + port + ' ...';
        const server = Config.SSL_ENABLED
            ? https
                  .createServer(
                      {
                          key: fs.readFileSync(Config.SSL_KEY_PATH!, 'utf8'),
                          cert: fs.readFileSync(Config.SSL_CERT_PATH!, 'utf8'),
                      },
                      this.app
                  )
                  .listen(port, () => {
                      console.log(listeningMex);
                  })
            : this.app.listen(port, () => {
                  console.log(listeningMex);
              });

        server.setTimeout(610000);
        server.keepAliveTimeout = 610 * 1000;
        server.headersTimeout = 611 * 1000;
    }
}
