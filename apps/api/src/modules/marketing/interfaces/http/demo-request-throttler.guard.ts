import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { Request } from "express";

/** V2 Sprint 23 (landing) — même motif que `AuthThrottlerGuard` (identity, Sprint 21) : suivi par
 *  IP, jamais un rate limit applicatif générique. Route publique sans compte, seule protection
 *  anti-spam raisonnable au-delà du honeypot. */
@Injectable()
export class DemoRequestThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Request): Promise<string> {
    return req.ip ?? "unknown";
  }
}
