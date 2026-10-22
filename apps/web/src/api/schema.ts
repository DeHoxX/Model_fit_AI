/**
 * OpenAPI TypeScript Schema generated from apps/api/openapi.json
 */

export interface paths {
  "/api/v1/health/live": {
    get: {
      responses: {
        200: {
          content: {
            "application/json": {
              status: string;
              [key: string]: string;
            };
          };
        };
      };
    };
  };
  "/api/v1/health/ready": {
    get: {
      responses: {
        200: {
          content: {
            "application/json": {
              status: string;
              database: string;
              [key: string]: string;
            };
          };
        };
        503: {
          content: {
            "application/json": {
              error: {
                code: string;
                message: string;
                details: Record<string, unknown>;
                request_id: string;
              };
            };
          };
        };
      };
    };
  };
  "/api/v1/meta": {
    get: {
      responses: {
        200: {
          content: {
            "application/json": {
              version: string;
              git_sha: string;
              environment: string;
              [key: string]: string;
            };
          };
        };
      };
    };
  };
}

export type HealthLiveResponse = paths["/api/v1/health/live"]["get"]["responses"]["200"]["content"]["application/json"];
export type HealthReadyResponse = paths["/api/v1/health/ready"]["get"]["responses"]["200"]["content"]["application/json"];
export type MetaResponse = paths["/api/v1/meta"]["get"]["responses"]["200"]["content"]["application/json"];
