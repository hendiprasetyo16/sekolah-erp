export interface EnvironmentConfig {
    database: {
        url: string;
    };
    jwt: {
        secret: string;
        expiresIn: string;
        refreshSecret: string;
        refreshExpiresIn: string;
    };
    app: {
        port: number;
        corsOrigin: string;
        nodeEnv: string;
    };
    throttle: {
        ttl: number;
        limit: number;
    };
}
export declare function getConfig(): EnvironmentConfig;
