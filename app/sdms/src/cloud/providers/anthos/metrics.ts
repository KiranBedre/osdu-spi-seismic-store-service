import express from 'express'
import promMid from 'express-prometheus-middleware'
import { Config } from '../../config'


export function setMetrics(app: express.Express): void {
    /**
     * A metrics endpoint is set to be consumed from Prometheus
     */
    const metricsMiddleware = promMid({
        metricsPath: `${Config.API_BASE_PATH}/metrics`,
        collectDefaultMetrics: true,
        requestDurationBuckets: [0.1, 0.5, 1, 1.5],
        requestLengthBuckets: [512, 1024, 5120, 10240, 51200, 102400],
        responseLengthBuckets: [512, 1024, 5120, 10240, 51200, 102400],
    });
    app.use(metricsMiddleware)
};
