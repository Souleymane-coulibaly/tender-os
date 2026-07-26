import { Controller, Get } from "@nestjs/common";

export type HealthResponse = {
  status: "ok";
  service: "tenderos-api";
};

@Controller("health")
export class HealthController {
  @Get()
  check(): HealthResponse {
    return { status: "ok", service: "tenderos-api" };
  }
}
