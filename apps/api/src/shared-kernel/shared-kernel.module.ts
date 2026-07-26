import { Global, Module } from "@nestjs/common";
import { CLOCK, SystemClock } from "./clock";
import { ID_GENERATOR, UuidGenerator } from "./id-generator";

/**
 * Primitives transversales (Clock, IdGenerator) — skills/platform-foundation/ARCHITECTURE_RULES.md §36.
 */
@Global()
@Module({
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidGenerator },
  ],
  exports: [CLOCK, ID_GENERATOR],
})
export class SharedKernelModule {}
