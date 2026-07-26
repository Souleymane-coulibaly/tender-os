import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { AccessTokenClaims, AccessTokenService } from "../application/ports/access-token.service";

type JwtPayload = {
  sub: string;
  sid: string;
};

@Injectable()
export class JwtAccessTokenService implements AccessTokenService {
  constructor(private readonly jwtService: JwtService) {}

  issue(claims: AccessTokenClaims, ttlSeconds: number): string {
    const payload: JwtPayload = { sub: claims.userId, sid: claims.sessionId };

    return this.jwtService.sign(payload, { expiresIn: ttlSeconds });
  }

  verify(token: string): AccessTokenClaims | null {
    try {
      const payload = this.jwtService.verify<JwtPayload>(token);

      return { userId: payload.sub, sessionId: payload.sid };
    } catch {
      return null;
    }
  }
}
